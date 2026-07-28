import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../js/play/games-panel.js', import.meta.url), 'utf8');

function load(snapshot = {}, commandResult = { ok: true, status: 'accepted' }) {
    const calls = [];
    const compatibility = {
        getSnapshot: () => ({
            playerColor: 'white',
            clocks: { timeControlSeconds: 0 },
            game: { active: false },
            ...snapshot
        }),
        execute: (command, input) => {
            calls.push([command, input]);
            return commandResult;
        }
    };
    const window = { document: { createElement() { throw new Error('mount-only DOM access'); } } };
    vm.runInNewContext(source, { window, globalThis: window });
    return { api: window.CaissaGamesPanel, panel: window.CaissaGamesPanel.create({ compatibility }), calls };
}

test('publishes a frozen versioned contract with truthful fixed vocabularies', () => {
    const { api } = load();
    assert.equal(api.schemaVersion, '1.1.0');
    assert.equal(api.snapshotSchemaVersion, '1.1.0');
    assert.ok(Object.isFrozen(api));
    assert.ok(Object.isFrozen(api.timeControls));
    assert.ok(Object.isFrozen(api.colors));
    assert.ok(Object.isFrozen(api.opponentStrengths));
    assert.deepEqual(JSON.parse(JSON.stringify(api.colors.map(item => item.value))), ['white', 'black']);
    assert.deepEqual(JSON.parse(JSON.stringify(api.opponentStrengths.map(item => item.value))), ['full-power']);
    assert.ok(api.timeControls.every(item => item.incrementSeconds === 0));
    assert.ok(api.timeControls.every(item => !Object.hasOwn(item, 'elo')));
});

test('hydrates current base time, color, active state, and fixed strength', () => {
    const { panel } = load({
        playerColor: 'black',
        clocks: { timeControlSeconds: 300 },
        game: { active: true }
    });
    assert.equal(panel.hydrateFromLegacy().ok, true);
    const snapshot = panel.getSnapshot();
    assert.equal(snapshot.timeControl.presetId, 'blitz-5');
    assert.equal(snapshot.color, 'black');
    assert.equal(snapshot.opponent.strength, 'full-power');
    assert.equal(snapshot.status, 'active');
    assert.ok(Object.isFrozen(snapshot));
    assert.ok(Object.isFrozen(snapshot.validation.errors));
});

test('unknown legacy configuration falls back without inventing a custom clock', () => {
    const { panel } = load({
        playerColor: 'random',
        clocks: { timeControlSeconds: 123 }
    });
    panel.hydrateFromLegacy();
    assert.equal(panel.getSnapshot().timeControl.presetId, 'unlimited');
    assert.equal(panel.getSnapshot().color, 'white');
});

test('every supported preset selects without starting a game and invalid input is rejected', () => {
    const { api, panel, calls } = load();
    panel.hydrateFromLegacy();
    for (const preset of api.timeControls) {
        assert.equal(panel.setTimeControl(preset.presetId).ok, true);
        assert.equal(panel.getSnapshot().timeControl.presetId, preset.presetId);
    }
    assert.equal(panel.setTimeControl('3+2').reasonCode, 'INVALID_PRESET');
    assert.equal(calls.length, 0);
});

test('white and black are supported while random and fake strength are rejected', () => {
    const { panel } = load();
    panel.hydrateFromLegacy();
    assert.equal(panel.setColor('white').ok, true);
    assert.equal(panel.setColor('black').ok, true);
    assert.equal(panel.setColor('random').reasonCode, 'INVALID_COLOR');
    assert.equal(panel.setOpponentStrength('full-power').ok, true);
    assert.equal(panel.setOpponentStrength('beginner').reasonCode, 'INVALID_STRENGTH');
});

test('valid submission calls the authoritative start command exactly once with mapped settings', () => {
    const { panel, calls } = load();
    panel.hydrateFromLegacy();
    panel.setTimeControl('rapid-15');
    panel.setColor('black');
    const submitted = panel.submit();
    assert.equal(submitted.ok, true);
    assert.deepEqual(JSON.parse(JSON.stringify(calls)), [[
        'startNewGame', { mode: 'engine', color: 'black', timeControl: 900 }
    ]]);
    assert.equal(panel.getSnapshot().status, 'active');
    assert.equal(panel.getSnapshot().diagnostics.successfulStarts, 1);
});

test('unavailable or failed compatibility prevents a successful start', () => {
    const unavailable = load();
    unavailable.panel = unavailable.api.create({ compatibility: { getSnapshot: () => null } });
    assert.equal(unavailable.panel.hydrateFromLegacy().reasonCode, 'COMMAND_UNAVAILABLE');
    assert.equal(unavailable.panel.submit().ok, false);

    const failed = load({}, { ok: false, status: 'failed' });
    failed.panel.hydrateFromLegacy();
    assert.equal(failed.panel.submit().reasonCode, 'COMMAND_FAILED');
    assert.equal(failed.panel.getSnapshot().diagnostics.commandFailures, 1);
});

test('reset, disposal, and hostile option shapes are bounded', () => {
    const { api, panel } = load();
    panel.hydrateFromLegacy();
    panel.setColor('black');
    assert.equal(panel.reset().ok, true);
    assert.equal(panel.getSnapshot().color, 'white');
    assert.equal(panel.dispose().ok, true);
    assert.equal(panel.dispose().status, 'unchanged');
    const hostile = api.create(JSON.parse('{"__proto__":{"polluted":true}}'));
    assert.equal(hostile.hydrateFromLegacy().ok, false);
    assert.equal({}.polluted, undefined);
});

test('static ownership guard excludes state writers, resources, storage, routing, and unsupported products', () => {
    for (const forbidden of [
        /\bApp\.(?:game|board)\s*=/, /ClockService\.(?:start|configure)/,
        /\bWorker\b|postMessage\s*\(/, /localStorage|sessionStorage/,
        /pushState|replaceState|CaissaNavigation/, /FairPlayPolicy/,
        /matchmaking|tournament|player pool|rated game/i,
        /FICS|Arena|Spectator|AnalyzeSection|PostGame/
    ]) assert.doesNotMatch(source, forbidden);
    assert.match(source, /\.execute\('startNewGame'/);
});

test('both SPA pages load GamesPanel once before the simplified shell', () => {
    for (const page of ['index.html', 'yahoo-classic.html']) {
        const html = fs.readFileSync(new URL(`../../${page}`, import.meta.url), 'utf8');
        assert.equal((html.match(/games-panel\.js/g) || []).length, 1);
        assert.ok(html.indexOf('games-panel.js') < html.indexOf('simplified-play-shell.js'));
    }
});
