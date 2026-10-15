import { createHash } from 'node:crypto';
import { validatePublicNickname } from '../../js/identity/public-nickname-policy.js';

const FALLBACK_ALIAS = /^Player-[0-9A-F]{16}$/u;
const GUEST_ALIAS = /^Guest-[0-9A-F]{6}$/u;

export async function projectOnlineState(state, resolveMany) {
    if (!state || typeof state !== 'object') return state;
    const subjects = collectSubjects(state);
    const resolved = subjects.length && typeof resolveMany === 'function'
        ? await resolveMany(subjects)
        : {};
    const identities = normalizeResolution(resolved);

    const projected = { ...state };
    if (Object.hasOwn(state, 'profile')) projected.profile = projectProfile(state.profile, identities);
    if (Object.hasOwn(state, 'game')) projected.game = projectGame(state.game, identities);
    if (Array.isArray(state.recentGames)) {
        projected.recentGames = state.recentGames.map(game => projectGame(game, identities));
    }
    if (Array.isArray(state.players)) {
        projected.players = state.players.map(player => projectPlayer(player, identities));
    }
    if (Array.isArray(state.challenges)) {
        projected.challenges = state.challenges.map(challenge => projectChallenge(challenge, identities));
    }
    return projected;
}

export function redactHistoricalPgn(pgn, whiteName, blackName) {
    const text = String(pgn || '');
    if (!text) return text;
    const replacements = { White: escapePgnTag(whiteName), Black: escapePgnTag(blackName) };
    return text.replace(/^\[(White|Black)\s+"(?:[^"\\]|\\.)*"\]\s*$/gmu,
        (_line, tag) => `[${tag} "${replacements[tag]}"]`);
}

function collectSubjects(state) {
    const subjects = new Set();
    const add = value => {
        const subject = String(value || '').trim();
        if (subject && subject.length <= 255) subjects.add(subject);
    };
    add(state.profile?.clerk_id);
    for (const game of [state.game, ...(Array.isArray(state.recentGames) ? state.recentGames : [])]) {
        add(game?.white_clerk_id);
        add(game?.black_clerk_id);
    }
    for (const player of Array.isArray(state.players) ? state.players : []) add(player?.clerkId);
    for (const challenge of Array.isArray(state.challenges) ? state.challenges : []) add(challenge?.otherClerkId);
    return [...subjects].sort();
}

function normalizeResolution(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const safe = {};
    for (const [subject, identity] of Object.entries(value)) {
        if (!subject || !identity || typeof identity !== 'object') continue;
        safe[subject] = identity;
    }
    return safe;
}

function projectProfile(profile, identities) {
    if (!profile) return profile;
    return {
        ...profile,
        display_name: publicName({
            subject: profile.clerk_id,
            userId: profile.user_id,
            raw: profile.display_name,
            identity: identities[profile.clerk_id]
        })
    };
}

function projectPlayer(player, identities) {
    if (!player) return player;
    return {
        ...player,
        displayName: publicName({
            subject: player.clerkId,
            userId: player.userId,
            raw: player.displayName,
            identity: identities[player.clerkId]
        })
    };
}

function projectChallenge(challenge, identities) {
    if (!challenge) return challenge;
    return {
        ...challenge,
        otherDisplayName: publicName({
            subject: challenge.otherClerkId,
            userId: challenge.otherUserId,
            raw: challenge.otherDisplayName,
            identity: identities[challenge.otherClerkId]
        })
    };
}

function projectGame(game, identities) {
    if (!game) return game;
    const trustedSnapshot = Number(game.identity_policy_version) === 1;
    const whiteName = trustedSnapshot && isSafePublicName(game.white_display_name)
        ? game.white_display_name
        : publicName({
            subject: game.white_clerk_id,
            userId: game.white_user_id,
            raw: game.white_display_name,
            identity: identities[game.white_clerk_id]
        });
    const blackName = trustedSnapshot && isSafePublicName(game.black_display_name)
        ? game.black_display_name
        : publicName({
            subject: game.black_clerk_id,
            userId: game.black_user_id,
            raw: game.black_display_name,
            identity: identities[game.black_clerk_id]
        });
    return {
        ...game,
        white_display_name: whiteName,
        black_display_name: blackName,
        pgn: trustedSnapshot ? game.pgn : redactHistoricalPgn(game.pgn, whiteName, blackName)
    };
}

function publicName({ subject, userId, raw, identity }) {
    if (identity?.role === 'online_guest') {
        return GUEST_ALIAS.test(String(raw || '')) ? String(raw) : stableGuestAlias(subject || userId);
    }
    const canonical = String(identity?.displayName || '');
    if (isSafePublicName(canonical)) return canonical;
    if (GUEST_ALIAS.test(String(raw || ''))) return String(raw);
    return stablePlayerAlias(userId || identity?.userId || subject);
}

function isSafePublicName(value) {
    const text = String(value || '');
    if (FALLBACK_ALIAS.test(text) || GUEST_ALIAS.test(text)) return true;
    return validatePublicNickname(text).ok;
}

function stablePlayerAlias(seed) {
    return `Player-${stableHex(seed, 16)}`;
}

function stableGuestAlias(seed) {
    return `Guest-${stableHex(seed, 6)}`;
}

function stableHex(seed, length) {
    return createHash('sha256')
        .update(`caissa-public-presentation-v1:${String(seed || 'unresolved')}`, 'utf8')
        .digest('hex').slice(0, length).toUpperCase();
}

function escapePgnTag(value) {
    return String(value || 'CAISSA Player').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
