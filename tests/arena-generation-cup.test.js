import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const schedulerSource = fs.readFileSync(
    new URL('../js/arena-tournament-scheduler.js', import.meta.url), 'utf8');
const arenaSource = fs.readFileSync(new URL('../js/caissa-arena.js', import.meta.url), 'utf8');

function scheduler() {
    const window = {};
    vm.runInNewContext(schedulerSource, { window, Object, Array, Set, Number, Error }, {
        filename: 'js/arena-tournament-scheduler.js'
    });
    return window.ArenaTournamentScheduler;
}

const participants = ['stockfish', 'stockfish-lite', 'stockfish-18-lite', 'stockfish-19-lite']
    .map(id => Object.freeze({ id }));

test('four-provider single round robin covers every pairing with both colors represented', () => {
    const api = scheduler();
    const rounds = Array.from({ length: 3 }, (_, round) =>
        Array.from(api.getRoundPairings(participants, round)));
    assert.deepEqual(rounds.map(pairings => pairings.length), [2, 2, 2]);

    const games = rounds.flat();
    const unordered = games.map(game => [game.white.id, game.black.id].sort().join(':'));
    assert.equal(new Set(unordered).size, 6);
    for (const participant of participants) {
        assert.ok(games.some(game => game.white.id === participant.id), `${participant.id} White`);
        assert.ok(games.some(game => game.black.id === participant.id), `${participant.id} Black`);
    }
});

test('second round-robin cycle reverses every first-cycle color assignment', () => {
    const api = scheduler();
    const firstCycle = Array.from({ length: 3 }, (_, round) =>
        Array.from(api.getRoundPairings(participants, round))).flat();
    const secondCycle = Array.from({ length: 3 }, (_, round) =>
        Array.from(api.getRoundPairings(participants, round + 3))).flat();

    for (const first of firstCycle) {
        const reverse = secondCycle.find(game => game.white.id === first.black.id
            && game.black.id === first.white.id);
        assert.ok(reverse, `${first.white.id} vs ${first.black.id} color reversal`);
    }
});

test('odd fields rotate one bye and still cover every opponent exactly once', () => {
    const api = scheduler();
    const odd = participants.slice(0, 3);
    const rounds = Array.from({ length: 3 }, (_, round) =>
        Array.from(api.getRoundPairings(odd, round)));
    assert.deepEqual(rounds.map(pairings => pairings.length), [1, 1, 1]);
    const games = rounds.flat();
    assert.equal(new Set(games.map(game => [game.white.id, game.black.id].sort().join(':'))).size, 3);
    assert.deepEqual(odd.map(participant => games.filter(game =>
        game.white.id === participant.id || game.black.id === participant.id).length), [2, 2, 2]);
});

test('scheduler rejects malformed fields and Arena uses it as the production authority', () => {
    const api = scheduler();
    assert.throws(() => api.getRoundPairings([], 0), /at least two/);
    assert.throws(() => api.getRoundPairings([{ id: 'same' }, { id: 'same' }], 0), /unique/);
    assert.throws(() => api.getRoundPairings(participants, -1), /non-negative/);
    assert.match(arenaSource, /format: 'round-robin'/);
    assert.match(arenaSource, /ArenaTournamentScheduler\.getRoundPairings\(engines, currentRound\)/);
    assert.doesNotMatch(arenaSource, /generateSwissPairings/);
});

test('Tournament failures terminate surviving roles instead of leaving idle allocations', () => {
    assert.match(arenaSource, /this\.runtimeManager\?\.terminateAll\('arena-error'\)/);
    assert.match(arenaSource, /if \(!success\) \{\s*this\.destroyEngines\(\)/);
});

test('explicit Tournament stop cancels a pending automatic game advance', () => {
    assert.match(arenaSource, /stopMatch\(\) \{[\s\S]*?clearTimeout\(this\._tournamentAdvanceTimer\);[\s\S]*?this\._tournamentAdvanceTimer = null;/);
});
