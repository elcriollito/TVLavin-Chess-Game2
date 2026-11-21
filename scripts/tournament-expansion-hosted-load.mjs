import assert from 'node:assert/strict';

const ORIGIN = String(process.env.SUPABASE_URL || '').replace(/\/$/u, '');
const SECRET = String(process.env.SUPABASE_SECRET_KEY || '');
const OWNER = 'user_3LI0jbMHgYevJkNfY8dK6tUnoYu';
const runId = String(process.env.CAISSA_LOAD_RUN_ID || Date.now().toString(36)).toLowerCase();
const headers = Object.freeze({
    apikey: SECRET,
    Authorization: `Bearer ${SECRET}`,
    'Content-Type': 'application/json'
});

assert.match(ORIGIN, /^https:\/\/imtwlzicxaaqjyvrkdsv\.supabase\.co$/u);
assert.ok(SECRET.length >= 32, 'A Supabase secret key is required');
await recoverPriorLoads();

const identities = Array.from({ length: 101 }, (_, index) => ({
    clerk_id: `load_s001_${runId}_${String(index + 1).padStart(3, '0')}`,
    role: 'member',
    credits: 0
}));

const users = await rest('users?on_conflict=clerk_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: identities
});
assert.equal(users.length, 101);
await rest('caissa_online_profiles?on_conflict=clerk_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: users.map((user, index) => ({
        user_id: user.id,
        clerk_id: user.clerk_id,
        display_name: `Arena Load ${String(index + 1).padStart(3, '0')}`
    }))
});
for (let offset = 0; offset < users.length; offset += 10) {
    await Promise.all(users.slice(offset, offset + 10).map(user =>
        rpc('caissa_public_identity_get_or_create', { p_clerk_id: user.clerk_id })));
}
await refreshPresence(users);

const startsAt = new Date(Date.now() + 70_000).toISOString();
const created = await rpc('caissa_online_arena_create', {
    p_clerk_id: OWNER,
    p_event_id: `load-create:${runId}`,
    p_name: `CAISSA Arena 100 Hosted Load ${runId}`,
    p_starts_at: startsAt,
    p_duration_minutes: 5,
    p_pool: 'blitz',
    p_base_ms: 180_000,
    p_increment_ms: 2_000,
    p_capacity: 100,
    p_late_join: true,
    p_rated: false
});
const tournamentId = created.current.id;

for (let offset = 0; offset < 99; offset += 10) {
    await Promise.all(identities.slice(offset, Math.min(offset + 10, 99)).map((identity, index) =>
        rpc('caissa_online_arena_join', {
            p_clerk_id: identity.clerk_id,
            p_tournament_id: tournamentId,
            p_event_id: `load-join:${runId}:${offset + index + 1}`
        })));
}

const finalRace = await Promise.allSettled(identities.slice(99).map((identity, index) =>
    rpc('caissa_online_arena_join', {
        p_clerk_id: identity.clerk_id,
        p_tournament_id: tournamentId,
        p_event_id: `load-final:${runId}:${index + 100}`
    })));
assert.equal(finalRace.filter(item => item.status === 'fulfilled').length, 1);
assert.equal(finalRace.filter(item => item.status === 'rejected'
    && String(item.reason).includes('CAISSA_ONLINE_ARENA_FULL')).length, 1);
const acceptedFinalIndex = finalRace.findIndex(item => item.status === 'fulfilled');
const participatingUsers = [...users.slice(0, 99), users[99 + acceptedFinalIndex]];

await waitUntil(Date.parse(startsAt) + 1_000);
await refreshPresence(participatingUsers);
await rpc('caissa_online_arena_sync', {
    p_clerk_id: identities[0].clerk_id,
    p_tournament_id: tournamentId
});

const games = await pollGames(tournamentId, 50);
assert.equal(new Set(games.flatMap(game => [game.white_clerk_id, game.black_clerk_id])).size, 100);
await rpc('caissa_online_arena_manage', {
    p_clerk_id: OWNER,
    p_tournament_id: tournamentId,
    p_event_id: `load-close:${runId}`,
    p_action: 'close'
});

for (let offset = 0; offset < games.length; offset += 10) {
    await Promise.all(games.slice(offset, offset + 10).map(game =>
        rpc('caissa_online_finish_game', {
            p_clerk_id: game.black_clerk_id,
            p_game_id: game.id,
            p_event_id: `load-resign:${runId}:${game.id}`,
            p_reason: 'resignation'
        })));
}
const final = await rpc('caissa_online_arena_sync', {
    p_clerk_id: identities[0].clerk_id,
    p_tournament_id: tournamentId
});
assert.equal(final.current.status, 'completed');
await refreshPresence(participatingUsers, true);

const [participants, finishedGames, pairings] = await Promise.all([
    rest(`caissa_online_tournament_participants?tournament_id=eq.${tournamentId}&state=neq.withdrawn&select=user_id`),
    rest(`caissa_online_games?tournament_id=eq.${tournamentId}&select=id,status`),
    rest(`caissa_online_arena_pairings?tournament_id=eq.${tournamentId}&select=id,game_id`)
]);
assert.equal(participants.length, 100);
assert.equal(finishedGames.length, 50);
assert.ok(finishedGames.every(game => game.status === 'completed'));
assert.equal(pairings.length, 50);

console.log(`HOSTED_ARENA_100_PASS ${JSON.stringify({
    project: 'imtwlzicxaaqjyvrkdsv', tournamentId, participants: 100,
    finalSlotRace: { accepted: 1, rejectedFull: 1 }, games: 50, status: final.current.status
})}`);

async function pollGames(tournamentId, expected) {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
        const games = await rest(`caissa_online_games?tournament_id=eq.${tournamentId}&status=eq.active&select=id,white_clerk_id,black_clerk_id`);
        if (games.length === expected) return games;
        await delay(500);
    }
    throw new Error(`PAIRING_TIMEOUT:${expected}`);
}

async function rpc(name, body) {
    return request(`${ORIGIN}/rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(body) });
}

async function rest(path, options = {}) {
    return request(`${ORIGIN}/rest/v1/${path}`, {
        ...options,
        body: options.body ? JSON.stringify(options.body) : undefined
    });
}

async function request(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: { ...headers, ...(options.headers || {}) },
        redirect: 'error'
    });
    const text = await response.text();
    let body = null;
    if (text) {
        try { body = JSON.parse(text); }
        catch { body = text.slice(0, 240); }
    }
    if (!response.ok) {
        throw new Error(`${response.status}:${body?.message || body?.code || body || 'UNKNOWN'}`);
    }
    return body;
}

async function waitUntil(epochMs) {
    while (Date.now() < epochMs) await delay(Math.min(5_000, epochMs - Date.now()));
}

function delay(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function refreshPresence(currentUsers, expired = false) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (expired ? -1_000 : 15 * 60_000)).toISOString();
    await rest('caissa_online_presence?on_conflict=user_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: currentUsers.map((user, index) => ({
            user_id: user.id,
            clerk_id: user.clerk_id,
            display_name: `Arena Load ${String(index + 1).padStart(3, '0')}`,
            status: expired ? 'offline' : 'online',
            active_game_id: null,
            last_seen_at: now.toISOString(),
            expires_at: expiresAt
        }))
    });
}

async function recoverPriorLoads() {
    const nameFilter = encodeURIComponent('CAISSA Arena 100 Hosted Load *');
    const priorRuns = await rest(`caissa_online_tournaments?select=id,status&name=like.${nameFilter}`);
    for (const prior of priorRuns.filter(item => !['cancelled', 'completed'].includes(item.status))) {
        if (['scheduled', 'registration_open'].includes(prior.status)) {
            try {
                await rpc('caissa_online_arena_manage', {
                    p_clerk_id: OWNER,
                    p_tournament_id: prior.id,
                    p_event_id: `load-recover:${prior.id}:cancel`,
                    p_action: 'cancel'
                });
                continue;
            } catch (error) {
                if (!String(error).includes('CAISSA_ONLINE_ARENA_MANAGE_INVALID_STATE')) throw error;
            }
        }
        await rpc('caissa_online_arena_manage', {
            p_clerk_id: OWNER,
            p_tournament_id: prior.id,
            p_event_id: `load-recover:${prior.id}:close`,
            p_action: 'close'
        });
        const activeGames = await rest(
            `caissa_online_games?tournament_id=eq.${prior.id}&status=eq.active&select=id,black_clerk_id`
        );
        for (let offset = 0; offset < activeGames.length; offset += 10) {
            await Promise.all(activeGames.slice(offset, offset + 10).map(game =>
                rpc('caissa_online_finish_game', {
                    p_clerk_id: game.black_clerk_id,
                    p_game_id: game.id,
                    p_event_id: `load-recover:${game.id}`,
                    p_reason: 'resignation'
                })));
        }
        await rpc('caissa_online_arena_sync', { p_clerk_id: OWNER, p_tournament_id: prior.id });
    }
}
