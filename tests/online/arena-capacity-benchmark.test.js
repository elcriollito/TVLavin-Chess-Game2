import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { planArenaPairings, validateArenaCreation } from '../../api/_lib/online-arena.js';
import { projectOnlineArenaState } from '../../api/_lib/online-public-projection.js';
import { sendOnlineGameBroadcast } from '../../api/_lib/online-realtime-broadcast.js';

test('Arena accepts the reviewed 100-player ceiling and rejects 101', () => {
    const payload = {
        name: 'Capacity benchmark', timeControlId: 'blitz-5-0', durationMinutes: 60,
        startsAt: new Date(Date.now() + 60_000).toISOString(), capacity: 100
    };
    assert.equal(validateArenaCreation(payload).ok, true);
    assert.equal(validateArenaCreation({ ...payload, capacity: 101 }).code, 'INVALID_TOURNAMENT_CAPACITY');
});

test('100-player pairing produces 50 unique simultaneous games within the local budget', () => {
    const players = Array.from({ length: 100 }, (_, index) => ({
        id: `player-${String(index + 1).padStart(3, '0')}`,
        state: 'waiting', rating: 2400 - (index * 7), colorBalance: (index % 3) - 1,
        waitingSince: new Date(Date.UTC(2026, 10, 20, 12, 0, index)).toISOString(),
        lastOpponentId: index % 2 === 0 ? `player-${String(index + 2).padStart(3, '0')}` : null
    }));
    const started = performance.now();
    let pairings;
    for (let iteration = 0; iteration < 100; iteration += 1) pairings = planArenaPairings(players);
    const elapsedMs = performance.now() - started;
    const assigned = pairings.flatMap(pairing => [pairing.whiteUserId, pairing.blackUserId]);
    assert.equal(pairings.length, 50);
    assert.equal(new Set(assigned).size, 100);
    assert.ok(elapsedMs < 2_000, `100 pairing passes took ${elapsedMs.toFixed(1)}ms`);
});

test('100-player standings projection, polling payload and 50 private broadcasts stay bounded', async () => {
    const standings = Array.from({ length: 100 }, (_, index) => ({
        userId: `user-${index}`, clerkId: `member_${index}`, displayName: `Member ${index}`,
        rank: index + 1, points: 100 - index
    }));
    const games = Array.from({ length: 50 }, (_, index) => ({
        id: `${String(index + 1).padStart(8, '0')}-1111-4111-8111-111111111111`,
        whiteUserId: `user-${index * 2}`, blackUserId: `user-${(index * 2) + 1}`,
        whiteClerkId: `member_${index * 2}`, blackClerkId: `member_${(index * 2) + 1}`,
        whiteDisplayName: `Member ${index * 2}`, blackDisplayName: `Member ${(index * 2) + 1}`
    }));
    const identities = Object.fromEntries(standings.map(row => [row.clerkId, {
        userId: row.userId, role: 'member', displayName: row.displayName
    }]));
    const started = performance.now();
    const projected = await projectOnlineArenaState({ current: { standings, games } }, async ids =>
        Object.fromEntries(ids.map(id => [id, identities[id]])));
    let requests = 0;
    await Promise.all(games.map((game, index) => sendOnlineGameBroadcast({
        env: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_benchmark' },
        gameId: game.id, version: index + 1, correlationId: `benchmark:${index}`,
        fetchImpl: async (_url, init) => {
            const body = JSON.parse(init.body);
            assert.equal(body.messages[0].private, true);
            requests += 1;
            return { status: 202 };
        }
    })));
    const elapsedMs = performance.now() - started;
    assert.equal(projected.current.standings.length, 100);
    assert.equal(projected.current.games.length, 50);
    assert.ok(JSON.stringify(projected).length < 250_000);
    assert.equal(requests, 50);
    assert.ok(elapsedMs < 2_000, `projection and broadcasts took ${elapsedMs.toFixed(1)}ms`);
});
