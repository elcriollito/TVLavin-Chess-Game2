import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../js/play/play-v2-playable-readiness.js', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function load() {
    const window = { setTimeout() {}, clearTimeout() {} };
    vm.runInNewContext(source, { window, globalThis: window, URL, Date, Object, Set, WeakSet, Number });
    return window.CaissaPlayV2PlayableReadiness;
}

function controller(probe, deadlineMs = 100) {
    let now = 0; let sequence = 0; const tasks = new Map();
    const api = load().create({ probe, deadlineMs, now: () => now,
        schedule: callback => { const id = ++sequence; tasks.set(id, callback); return id; },
        cancelSchedule: id => tasks.delete(id) });
    return { api, advance(ms) { now += ms; const pending = [...tasks.values()]; tasks.clear(); pending.forEach(callback => callback()); }, tasks };
}

const selection = { mode: 'games', seconds: 180, incrementSeconds: 2, color: 'white' };
const ready = () => ({ ready: true, probes: Object.fromEntries(load().requirements.map(name => [name, true])), failed: [] });

test('PlayV2PlayableReadiness@1.0.0 publishes frozen modes, states, transitions, requirements and deadlines', () => {
    const api = load();
    assert.equal(api.contractId, 'PlayV2PlayableReadiness@1.0.0');
    assert.deepEqual(plain(api.states), ['booting', 'ready', 'starting', 'playing', 'postgame', 'recoverable-error', 'unavailable']);
    assert.deepEqual(plain(api.classifications), { games: 'required', bots: 'uncertified', coach: 'isolated-assistance-pending', mentor: 'blocked', players: 'blocked' });
    assert.deepEqual(plain(api.coachReadiness), { internallySelectable: true, cleanResourcesRequired: true,
        certifiedGamesOwnersRequired: true, validConfigurationRequired: true, boundedAssistanceRequired: true,
        prohibitedResourcesAllowed: false, learningWriteOwnerAllowed: false, inheritsGamesReadiness: false,
        assistanceCertification: 'pending-11.5.2', publicReady: false });
    assert.deepEqual(plain(api.botsReadiness), { internallySelectable: true, configurationValid: true,
        runtimeAvailable: true, workerRequiredAtStart: true, workerProductionCertification: 'local-production-build-ready',
        publicReady: false, inheritsGamesReadiness: false, fallback: 'none' });
    assert.equal(api.requirements.length, 22); assert.equal(api.deadlines.bootMs, 2000); assert.equal(api.deadlines.pollMs, 50);
    for (const value of [api, api.states, api.transitions, api.requirements, api.classifications, api.deadlines]) assert(Object.isFrozen(value));
});

test('all Games probes pass before ready and one start reaches playing then postgame', () => {
    const f = controller(ready); assert.equal(f.api.boot(selection).ok, true);
    assert.equal(f.api.getSnapshot().state, 'ready');
    assert.equal(f.api.beginStart().ok, true); assert.equal(f.api.getSnapshot().state, 'starting');
    assert.equal(f.api.completeStart(true).ok, true); assert.equal(f.api.getSnapshot().state, 'playing');
    assert.equal(f.api.markPostGame(), true); assert.equal(f.api.getSnapshot().state, 'postgame');
});

test('every required probe fails closed without starting and reaches one bounded recoverable error', () => {
    for (const requirement of load().requirements) {
        const f = controller(() => ({ ready: false, probes: { [requirement]: false }, failed: [requirement] }));
        f.api.boot(selection); assert.equal(f.api.beginStart().reasonCode, 'NOT_READY', requirement);
        f.advance(100); assert.equal(f.api.getSnapshot().state, 'recoverable-error', requirement);
        assert.equal(f.api.getSnapshot().diagnostics.starts, 0, requirement);
    }
});

test('starting is duplicate-safe, bounded, stale-safe, cancellable and has one retry', () => {
    const f = controller(ready); f.api.boot(selection); f.api.beginStart();
    assert.equal(f.api.beginStart().reasonCode, 'DUPLICATE_START');
    f.advance(100); assert.equal(f.api.getSnapshot().state, 'recoverable-error');
    assert.equal(f.api.retry().ok, true); assert.equal(f.api.getSnapshot().state, 'ready');
    assert.equal(f.api.retry().reasonCode, 'RETRY_UNAVAILABLE');
    f.api.beginStart(); assert.equal(f.api.cancel('ROUTE_EXIT').ok, true);
    assert.equal(f.api.getSnapshot().state, 'unavailable'); assert.equal(f.tasks.size, 0);
    assert.equal(f.api.completeStart(true).reasonCode, 'STALE_START');
});

test('malformed state and probe exceptions are bounded and expose no raw error', () => {
    const f = controller(() => { throw new Error('sensitive/path/token'); });
    assert.equal(f.api.boot(null).reasonCode, 'INVALID_SELECTION');
    f.api.boot(selection); f.advance(100);
    const snapshot = f.api.getSnapshot(); assert.equal(snapshot.state, 'recoverable-error');
    assert.doesNotMatch(JSON.stringify(snapshot), /sensitive|path|token/);
});

test('static guards keep probes passive, local, provider-safe and production registration ordered', () => {
    assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|document\.cookie|localStorage|sessionStorage|indexedDB|new\s+Worker|postMessage\s*\(/);
    assert.doesNotMatch(source, /\.move\s*\(|\.configure\s*\(|\.start\s*\(|buildFromPlay\s*\(|createFromPlay\s*\(/);
    assert.match(source, /bots:\s*'uncertified'/); assert.match(source, /analyticsTransport/);
    for (const page of ['index.html', 'yahoo-classic.html']) {
        const html = fs.readFileSync(new URL(`../../${page}`, import.meta.url), 'utf8');
        assert.equal((html.match(/play-v2-playable-readiness\.js/g) || []).length, 1);
        assert(html.indexOf('play-v2-playable-readiness.js') < html.indexOf('games-panel.js'));
    }
});
