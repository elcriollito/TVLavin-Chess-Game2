import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const strengthSource = fs.readFileSync(new URL('../../js/play/opponent-strength.js', import.meta.url), 'utf8');
const source = fs.readFileSync(new URL('../../js/play/games-panel.js', import.meta.url), 'utf8');

function load(snapshot = {}, commandResult = { ok: true, status: 'accepted' }, options = {}) {
    const calls = [];
    const microtasks = [];
    const compatibility = {
        getSnapshot: () => ({
            playerColor: 'white',
            clocks: { timeControlSeconds: 60, incrementSeconds: 0 },
            game: { active: false },
            ...snapshot
        }),
        execute: (command, input) => {
            calls.push([command, input]);
            return commandResult;
        }
    };
    const window = {
        document: { createElement() { throw new Error('mount-only DOM access'); } },
        localStorage: { getItem: () => null, setItem: () => {} },
        queueMicrotask(callback) { microtasks.push(callback); }
    };
    const readiness = options.readiness || {
        state: 'ready', subscribe() { return () => {}; }, boot() { this.state = 'ready'; return { ok: true }; },
        retry() { this.state = 'ready'; return { ok: true, status: 'accepted', reasonCode: 'BOOT_STARTED' }; },
        beginStart() { if (this.state !== 'ready') return { ok: false }; this.state = 'starting'; return { ok: true }; },
        completeStart(ok) { this.state = ok ? 'playing' : 'recoverable-error'; return { ok }; },
        reset() { this.state = 'ready'; }, dispose() {},
        getSnapshot() { return { state: this.state, ready: this.state === 'ready' }; }
    };
    vm.runInNewContext(strengthSource, { window, globalThis: window });
    vm.runInNewContext(source, { window, globalThis: window });
    return {
        api: window.CaissaGamesPanel,
        panel: window.CaissaGamesPanel.create({ ...options, compatibility, readiness }),
        calls, flushMicrotasks: () => microtasks.splice(0).forEach(callback => callback())
    };
}

test('publishes a frozen versioned contract with truthful fixed vocabularies', () => {
    const { api, panel } = load();
    assert.equal(api.schemaVersion, '1.7.0');
    assert.equal(api.snapshotSchemaVersion, '1.7.0');
    assert.ok(Object.isFrozen(api));
    assert.ok(Object.isFrozen(api.timeControls));
    assert.ok(Object.isFrozen(api.colors));
    assert.ok(Object.isFrozen(api.opponentStrengths));
    assert.deepEqual(JSON.parse(JSON.stringify(api.colors.map(item => item.value))), ['white', 'random', 'black']);
    assert.deepEqual(JSON.parse(JSON.stringify(api.opponentStrengths)), { min: 250, max: 3200, step: 50 });
    assert.deepEqual(JSON.parse(JSON.stringify(api.timeControls.map(item => item.label))),
        ['1+0', '2+1', '3+0', '3+2', '5+0', '10+0', '15+10']);
    assert.equal(api.timeControls.some(item => item.seconds === 0), false);
    assert.ok(api.timeControls.every(item => !Object.hasOwn(item, 'elo')));
    assert.equal(panel.getSnapshot().phase, 'setup');
    assert.equal(panel.getSnapshot().architecture, 'head-body-foot');
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
    assert.equal(snapshot.opponent.targetElo, 1500);
    assert.equal(snapshot.opponent.bandLabel, 'Advanced');
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
    assert.equal(panel.getSnapshot().timeControl.presetId, 'bullet-1');
    assert.equal(panel.getSnapshot().color, 'random');
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

test('white, random, black, and bounded target strengths are supported', () => {
    const { panel } = load();
    panel.hydrateFromLegacy();
    assert.equal(panel.setColor('white').ok, true);
    assert.equal(panel.setColor('black').ok, true);
    assert.equal(panel.setColor('random').ok, true);
    assert.equal(panel.setColor('blue').reasonCode, 'INVALID_COLOR');
    assert.equal(panel.setOpponentStrength(250).ok, true);
    assert.equal(panel.setOpponentStrength(1450).ok, true);
    assert.equal(panel.getSnapshot().opponent.bandLabel, 'Intermediate');
    assert.equal(panel.setOpponentStrength(249).reasonCode, 'INVALID_STRENGTH');
    assert.equal(panel.setOpponentStrength(1475).reasonCode, 'INVALID_STRENGTH');
    assert.equal(panel.setOpponentStrength(3250).reasonCode, 'INVALID_STRENGTH');
});

test('valid submission calls the authoritative start command exactly once with mapped settings', () => {
    const { panel, calls } = load();
    panel.hydrateFromLegacy();
    panel.setTimeControl('rapid-15-10');
    panel.setColor('black');
    const submitted = panel.submit();
    assert.equal(submitted.ok, true);
    assert.deepEqual(JSON.parse(JSON.stringify(calls)), [[
        'startNewGame', { mode: 'engine', color: 'black', timeControl: 900, increment: 10, targetElo: 1500 }
    ]]);
    assert.equal(panel.getSnapshot().status, 'active');
    assert.equal(panel.getSnapshot().diagnostics.successfulStarts, 1);
});

test('random resolves exactly once at submission and immediate duplicate activation is rejected', () => {
    let resolutions = 0;
    const fixture = load({}, { ok: true, status: 'accepted' }, {
        resolveRandomColor: () => { resolutions += 1; return 'black'; }
    });
    fixture.panel.hydrateFromLegacy();
    fixture.panel.setColor('random');
    assert.equal(fixture.panel.submit().ok, true);
    assert.equal(fixture.panel.submit().reasonCode, 'BUSY');
    assert.equal(resolutions, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(fixture.calls)), [[
        'startNewGame', { mode: 'engine', color: 'black', timeControl: 60, increment: 0, targetElo: 1500 }
    ]]);
    assert.equal(fixture.panel.getSnapshot().color, 'random');
    fixture.flushMicrotasks();
    assert.equal(fixture.panel.getSnapshot().primaryAction.busy, false);
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
    assert.match(source, /data-caissa-games-head/);
    assert.match(source, /data-caissa-games-body/);
    assert.match(source, /data-caissa-games-foot/);
    assert.match(source, /caissa-coach-goddess\.png/);
    assert.equal((source.match(/this\.submit\(\)/g) || []).length, 1);
});

test('both SPA pages load GamesPanel once before the simplified shell', () => {
    for (const page of ['index.html', 'yahoo-classic.html']) {
        const html = fs.readFileSync(new URL(`../../${page}`, import.meta.url), 'utf8');
        assert.equal((html.match(/games-panel\.js/g) || []).length, 1);
        assert.ok(html.indexOf('games-panel.js') < html.indexOf('simplified-play-shell.js'));
    }
});
