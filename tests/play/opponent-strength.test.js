import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../js/play/opponent-strength.js', import.meta.url), 'utf8');

function load(stored = null) {
    const values = new Map(stored === null ? [] : [['caissa.play.opponent-strength.v1', stored]]);
    const localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    const window = { localStorage };
    vm.runInNewContext(source, { window, globalThis: window, Object, Number });
    return { contract: window.CaissaOpponentStrength, session: window.CaissaOpponentStrengthSession, values };
}

test('publishes immutable 250–3200 target strength bounds and honest bands', () => {
    const { contract } = load();
    assert.equal(contract.schemaVersion, '1.0.0');
    assert.deepEqual({ min: contract.min, max: contract.max, step: contract.step, defaultValue: contract.defaultValue },
        { min: 250, max: 3200, step: 50, defaultValue: 1500 });
    assert.equal(contract.describe(250).value.bandLabel, 'Beginner');
    assert.equal(contract.describe(1450).value.bandLabel, 'Intermediate');
    assert.equal(contract.describe(1500).value.bandLabel, 'Advanced');
    assert.equal(contract.describe(2200).value.bandLabel, 'Master');
    assert.equal(contract.describe(3200).value.bandLabel, 'Elite');
    assert.equal(contract.describe(3200).value.fullPower, true);
    assert.equal(Object.isFrozen(contract), true);
});

test('rejects out-of-range, off-step, and non-integer targets', () => {
    const { contract } = load();
    for (const value of [249, 1475, 3201, 1450.5, '1450', null, undefined]) {
        assert.equal(contract.isValid(value), false);
        assert.equal(contract.describe(value).reasonCode, 'INVALID_TARGET_ELO');
    }
});

test('preference is bounded and falls back safely', () => {
    assert.equal(load('1450').contract.readPreference(), 1450);
    assert.equal(load('1475').contract.readPreference(), 1500);
    const fixture = load();
    assert.equal(fixture.contract.writePreference(1700), true);
    assert.equal(fixture.values.get(fixture.contract.storageKey), '1700');
    assert.equal(fixture.contract.writePreference(1701), false);
});

test('session changes real search depth and restores full power at 3200', () => {
    const { session } = load();
    assert.equal(session.beginGame(250).ok, true);
    assert.deepEqual(JSON.parse(JSON.stringify(session.getSearchOptions())), {
        depth: 1, targetElo: 250, calibrationStatus: 'target-strength-pending-calibration'
    });
    assert.equal(session.beginGame(1450).value.searchDepth, 6);
    assert.equal(session.beginGame(3200).value.fullPower, true);
    assert.equal(session.getSearchOptions(), null);
    assert.equal(session.reset().ok, true);
    assert.equal(session.inspect().active, null);
});

test('strength owner has no network, board, clock, or worker authority', () => {
    for (const forbidden of [/fetch\s*\(/, /XMLHttpRequest|WebSocket|sendBeacon/, /new\s+Worker/,
        /Chessboard|ClockService|startNewGame|\.move\s*\(/]) assert.doesNotMatch(source, forbidden);
});

test('Play Game starts one target-strength session and routes its depth to opponent search', () => {
    const app = fs.readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
    assert.match(app, /CaissaOpponentStrengthSession\?\.beginGame\?\.\(options\.targetElo\)/);
    assert.match(app, /CaissaOpponentStrengthSession\?\.getSearchOptions\?\.\(\)/);
    assert.match(app, /!activeBot && !targetStrength && App\.useOpeningBook/);
    assert.match(app, /CaissaBotSession\?\.getSearchOptions\?\.\(\) \|\| targetStrength/);
});
