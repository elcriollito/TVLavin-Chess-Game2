import test from 'node:test';
import assert from 'node:assert/strict';
import { projectOnlineState, redactHistoricalPgn } from '../../api/_lib/online-public-projection.js';

const identities = Object.freeze({
    member_a: { userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'member', displayName: 'PublicKnight' },
    member_b: { userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: 'member', displayName: 'Player-0123456789ABCDEF' },
    guest_a: { userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', role: 'online_guest', displayName: null }
});

test('historical games redact unverified names and PGN headers before API delivery', async () => {
    const pgn = '[Event "CAISSA Online"]\n[White "Private Human Name"]\n[Black "private@example.test"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0';
    const game = {
        id: 'historical-game', identity_policy_version: 0,
        white_user_id: identities.member_a.userId, black_user_id: identities.member_b.userId,
        white_clerk_id: 'member_a', black_clerk_id: 'member_b',
        white_display_name: 'Private Human Name', black_display_name: 'private@example.test', pgn
    };
    const projected = await projectOnlineState({ game, recentGames: [game], players: [], challenges: [] }, async () => identities);
    assert.equal(projected.game.white_display_name, 'PublicKnight');
    assert.equal(projected.game.black_display_name, 'Player-0123456789ABCDEF');
    assert.match(projected.game.pgn, /\[White "PublicKnight"\]/);
    assert.match(projected.game.pgn, /\[Black "Player-0123456789ABCDEF"\]/);
    assert.match(projected.game.pgn, /1\. e4 e5 2\. Nf3 Nc6 1-0$/);
    assert.equal(JSON.stringify(projected).includes('Private Human Name'), false);
    assert.equal(JSON.stringify(projected).includes('private@example.test'), false);
});

test('unknown historical subjects receive stable non-identifying aliases without string matching', async () => {
    const source = {
        identity_policy_version: 0,
        white_user_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        black_user_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        white_clerk_id: 'unmapped_a', black_clerk_id: 'unmapped_b',
        white_display_name: 'Unknown Private Name', black_display_name: 'other@example.test',
        pgn: '[White "Unknown Private Name"]\n[Black "other@example.test"]\n\n*'
    };
    const first = await projectOnlineState({ game: source }, async () => ({}));
    const second = await projectOnlineState({ game: source }, async () => ({}));
    assert.match(first.game.white_display_name, /^Player-[0-9A-F]{16}$/);
    assert.match(first.game.black_display_name, /^Player-[0-9A-F]{16}$/);
    assert.equal(first.game.white_display_name, second.game.white_display_name);
    assert.equal(JSON.stringify(first).includes('Unknown Private Name'), false);
    assert.equal(JSON.stringify(first).includes('other@example.test'), false);
});

test('verified v1 snapshots stay frozen while live directory and challenges use canonical identity', async () => {
    const state = {
        profile: { user_id: identities.member_a.userId, clerk_id: 'member_a', display_name: 'Private Name' },
        game: {
            identity_policy_version: 1,
            white_clerk_id: 'member_a', black_clerk_id: 'guest_a',
            white_display_name: 'SnapshotKnight', black_display_name: 'Guest-ABCDEF',
            pgn: '[White "SnapshotKnight"]\n[Black "Guest-ABCDEF"]\n\n*'
        },
        recentGames: [],
        players: [{ clerkId: 'member_b', displayName: 'Old Name' }, { clerkId: 'guest_a', displayName: 'Guest-ABCDEF' }],
        challenges: [{ otherClerkId: 'member_b', otherDisplayName: 'Legacy Name' }]
    };
    const projected = await projectOnlineState(state, async () => identities);
    assert.equal(projected.game.white_display_name, 'SnapshotKnight');
    assert.equal(projected.game.black_display_name, 'Guest-ABCDEF');
    assert.equal(projected.profile.display_name, 'PublicKnight');
    assert.equal(projected.players[0].displayName, 'Player-0123456789ABCDEF');
    assert.equal(projected.players[1].displayName, 'Guest-ABCDEF');
    assert.equal(projected.challenges[0].otherDisplayName, 'Player-0123456789ABCDEF');
});

test('PGN redaction escapes tag values and never changes movetext', () => {
    const original = '[White "Private"]\n[Black "Private"]\n\n1. d4 d5 2. c4 e6 *';
    const sanitized = redactHistoricalPgn(original, 'Safe Knight', 'Player-ABCDEF0123456789');
    assert.match(sanitized, /\[White "Safe Knight"\]/);
    assert.equal(sanitized.endsWith('1. d4 d5 2. c4 e6 *'), true);
});
