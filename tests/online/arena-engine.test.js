import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ARENA_TIME_CONTROLS,
    assignArenaColors,
    isArenaEnabled,
    planArenaPairings,
    validateArenaCreation,
    validateArenaTournamentId
} from '../../api/_lib/online-arena.js';
import {
    arenaTournamentPoints,
    calculateArenaStandings,
    tournamentPoints
} from '../../js/online/online-tournaments.js';

test('S001 exposes exactly the approved Arena time controls', () => {
    assert.deepEqual(ARENA_TIME_CONTROLS.map(control => control.label), [
        '1+0', '1+1', '2+1', '3+0', '3+2', '5+0', '5+5', '10+0', '10+5'
    ]);
    const valid = validateArenaCreation({
        name: 'CAISSA Arena S001 — Founders Beta',
        timeControlId: 'blitz-3-2', durationMinutes: 15,
        startsAt: new Date(Date.now() + 60_000).toISOString()
    });
    assert.equal(valid.ok, true);
    assert.equal(valid.value.control.baseMs, 180_000);
    const bullet = validateArenaCreation({
        name: 'Bullet Arena', timeControlId: 'bullet-2-1', durationMinutes: 15,
        startsAt: new Date(Date.now() + 60_000).toISOString()
    });
    assert.deepEqual(bullet.value.control, {
        id: 'bullet-2-1', label: '2+1', pool: 'bullet', baseMs: 120_000, incrementMs: 1_000
    });
    assert.equal(validateArenaCreation({
        name: 'Leaky Arena', timeControlId: 'bullet-2-1', daysPerMove: 7
    }).code, 'INVALID_ARENA_FIELDS');
    assert.equal(validateArenaCreation({ timeControlId: 'rapid-15-10' }).ok, false);
    assert.equal(validateArenaTournamentId({ tournamentId: 'not-a-uuid' }).ok, false);
});

test('Arena requires both explicit gates in Preview and Production', () => {
    const enabled = { CAISSA_ONLINE_TOURNAMENTS: '1', CAISSA_ONLINE_ARENA: '1' };
    assert.equal(isArenaEnabled('preview', enabled), true);
    assert.equal(isArenaEnabled('production', enabled), true);
    assert.equal(isArenaEnabled('preview', { CAISSA_ONLINE_TOURNAMENTS: '1' }), false);
    assert.equal(isArenaEnabled('production', { CAISSA_ONLINE_ARENA: '1' }), false);
});

test('four waiting players produce two games without double pairing', () => {
    const players = [
        { id: 'a', state: 'waiting', rating: 1600, colorBalance: 1, waitingSince: '2026-01-01T00:00:00Z', lastOpponentId: 'b' },
        { id: 'b', state: 'waiting', rating: 1580, colorBalance: -1, waitingSince: '2026-01-01T00:00:01Z', lastOpponentId: 'a' },
        { id: 'c', state: 'waiting', rating: 1700, colorBalance: 0, waitingSince: '2026-01-01T00:00:02Z' },
        { id: 'd', state: 'waiting', rating: 1500, colorBalance: 0, waitingSince: '2026-01-01T00:00:03Z' }
    ];
    const pairings = planArenaPairings(players);
    assert.equal(pairings.length, 2);
    const assigned = pairings.flatMap(pairing => [pairing.whiteUserId, pairing.blackUserId]);
    assert.equal(new Set(assigned).size, 4);
    assert.deepEqual(new Set(assigned), new Set(['a', 'b', 'c', 'd']));
    assert.equal(pairings.some(pairing => new Set([pairing.whiteUserId, pairing.blackUserId]).has('a')
        && new Set([pairing.whiteUserId, pairing.blackUserId]).has('b')), false);
});

test('color assignment minimizes aggregate imbalance with a stable tie break', () => {
    assert.deepEqual(assignArenaColors(
        { id: 'a', colorBalance: 2 }, { id: 'b', colorBalance: -2 }
    ), { whiteUserId: 'b', blackUserId: 'a' });
    assert.deepEqual(assignArenaColors(
        { id: 'a', colorBalance: 0 }, { id: 'b', colorBalance: 0 }
    ), { whiteUserId: 'a', blackUserId: 'b' });
});

test('Arena scoring is explicit and does not change the legacy helper', () => {
    assert.equal(tournamentPoints('1-0', 'white'), 1);
    assert.equal(tournamentPoints('1/2-1/2', 'white'), 0.5);
    assert.equal(arenaTournamentPoints('1-0', 'white'), 2);
    assert.equal(arenaTournamentPoints('1/2-1/2', 'black'), 1);
    const standings = calculateArenaStandings([
        { id: 'a', displayName: 'Alpha', joinedAt: '2026-01-01T00:00:00Z' },
        { id: 'b', displayName: 'Beta', joinedAt: '2026-01-01T00:00:01Z' },
        { id: 'c', displayName: 'Gamma', joinedAt: '2026-01-01T00:00:02Z' }
    ], [
        { id: 'g1', whiteUserId: 'a', blackUserId: 'b', result: '1-0' },
        { id: 'g2', whiteUserId: 'b', blackUserId: 'c', result: '1/2-1/2' }
    ]);
    assert.deepEqual(standings.map(row => [row.id, row.points, row.wins, row.draws, row.losses]), [
        ['a', 2, 1, 0, 0], ['b', 1, 0, 1, 1], ['c', 1, 0, 1, 0]
    ]);
});
