import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../js/play/evaluation-rail.js', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

class Element {
    constructor(id = '') {
        this.id = id; this.style = {}; this.dataset = {}; this.hidden = false;
        this.attributes = new Map(); this.children = new Map();
        this.className = ''; this.textContent = '';
        this.classList = {
            values: new Set(),
            toggle: (name, enabled) => enabled
                ? this.classList.values.add(name) : this.classList.values.delete(name),
            add: name => this.classList.values.add(name)
        };
    }
    querySelector(selector) { return this.children.get(selector) || null; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    removeAttribute(name) { this.attributes.delete(name); }
    getBoundingClientRect() { return { width: 400, height: 400 }; }
}

function load() {
    const root = new Element('evalBar');
    const fill = new Element('evalFill');
    const label = new Element('evalScore');
    const board = new Element('chessboard');
    root.children.set('#evalFill', fill); root.children.set('#evalScore', label);
    const elements = { evalBar: root, chessboard: board };
    const document = {
        getElementById: id => elements[id] || null,
        addEventListener() {}
    };
    const window = { document };
    vm.runInNewContext(source, { window, globalThis: window, WeakSet, Set, Object, Math, Date });
    const issued = new WeakSet();
    const authorize = (allowed = true, mode = allowed ? 'live' : 'unavailable', overrides = {}) => {
        const decision = Object.freeze({
            policyVersion: '1.0.0', decisionId: 'decision:test',
            purpose: 'live-evaluation', allowed,
            reasonCode: allowed ? 'MACHINE_OPPONENT_ALLOWED' : 'HUMAN_LIVE_ASSISTANCE_DENIED',
            capabilities: Object.freeze({ evaluationMode: mode, mayShowEvaluation: allowed }),
            ...overrides
        });
        issued.add(decision);
        return decision;
    };
    const panel = window.CaissaEvaluationRail.create({
        policyValidator: decision => issued.delete(decision)
    });
    return { api: window.CaissaEvaluationRail, panel, root, fill, label, board, authorize };
}

test('publishes frozen versioned vocabularies and pure normalization helpers', () => {
    const { api } = load();
    assert.equal(api.schemaVersion, '1.0.0');
    assert.equal(api.snapshotSchemaVersion, '1.0.0');
    for (const value of [api, api.statuses, api.displayModes, api.scoreTypes, api.orientations, api.reasonCodes])
        assert.ok(Object.isFrozen(value));
    assert.equal(api.normalizeCentipawns(125.4), 125);
    assert.equal(api.normalizeCentipawns(Infinity), null);
    assert.equal(api.normalizeMate(3.9), 3);
    assert.equal(api.normalizeMate(0), null);
});

test('visual mapping is monotonic, centered, bounded, and stable', () => {
    const { api } = load();
    const values = [-100000, -500, 0, 500, 100000].map(api.mapCentipawnsToWhiteShare);
    assert.ok(values.every((value, index) => index === 0 || value > values[index - 1]));
    assert.equal(values[2], 0.5);
    assert.ok(values[0] > 0 && values.at(-1) < 1);
    assert.equal(api.mapCentipawnsToWhiteShare(1500), api.mapCentipawnsToWhiteShare(99999));
});

test('mount owns existing rail layers without listeners and repeated mount is stable', () => {
    const { panel, root } = load();
    assert.equal(panel.mount().ok, true);
    assert.equal(panel.mount().status, 'unchanged');
    assert.match(root.dataset.evaluationRailOwner, /^evaluation-rail-/);
    assert.equal(root.attributes.get('role'), 'meter');
    assert.equal(panel.getSnapshot().listenerCount, 0);
});

test('allowed policy displays centipawns with immutable detached snapshot', () => {
    const { panel, authorize, label, fill } = load();
    panel.mount(); panel.applyPolicy(authorize());
    assert.equal(panel.setEvaluation(125, { source: 'engine' }).ok, true);
    const snapshot = panel.getSnapshot();
    assert.equal(snapshot.scoreType, 'centipawn');
    assert.equal(snapshot.scoreCp, 125);
    assert.equal(snapshot.scorePawns, 1.25);
    assert.equal(snapshot.label, '+1.3');
    assert.equal(label.textContent, '+1.3');
    assert.match(fill.style.height, /%$/);
    assert.ok(Object.isFrozen(snapshot));
    assert.ok(Object.isFrozen(snapshot.policy));
    assert.doesNotThrow(() => JSON.stringify(snapshot));
});

test('mate has priority and represents either winning side truthfully', () => {
    const positive = load();
    positive.panel.mount(); positive.panel.applyPolicy(positive.authorize());
    positive.panel.setEvaluation(900); positive.panel.setMate(3);
    assert.equal(positive.panel.getSnapshot().label, 'M3');
    assert.match(positive.panel.getSnapshot().accessibleLabel, /White has mate in 3/);
    positive.panel.setMate(-4);
    assert.match(positive.panel.getSnapshot().accessibleLabel, /Black has mate in 4/);
    assert.equal(positive.panel.setMate(0).reasonCode, 'INVALID_INPUT');
});

test('denied authentic policy clears stale value and blocks fresh display', () => {
    const f = load();
    f.panel.mount(); f.panel.applyPolicy(f.authorize());
    f.panel.setEvaluation(500);
    assert.equal(f.panel.applyPolicy(f.authorize(false)).ok, true);
    const denied = f.panel.getSnapshot();
    assert.equal(denied.displayMode, 'unavailable');
    assert.equal(denied.scoreType, 'neutral');
    assert.equal(denied.policy.allowed, false);
    assert.equal(f.panel.setEvaluation(800).reasonCode, 'POLICY_DENIED');
});

test('forged, stale, purpose-mismatched, and hostile policy objects are rejected', () => {
    const f = load();
    f.panel.mount();
    const decision = f.authorize();
    assert.equal(f.panel.applyPolicy(decision).ok, true);
    assert.equal(f.panel.applyPolicy(decision).reasonCode, 'INVALID_POLICY');
    assert.equal(f.panel.applyPolicy({ ...f.authorize() }).reasonCode, 'INVALID_POLICY');
    assert.equal(f.panel.applyPolicy(f.authorize(true, 'live', { purpose: 'hint' })).reasonCode, 'INVALID_POLICY');
    assert.equal(f.panel.applyPolicy(JSON.parse('{"__proto__":{"polluted":true}}')).reasonCode, 'INVALID_POLICY');
    assert.equal({}.polluted, undefined);
});

test('all display modes are represented and unsupported mode is rejected', () => {
    const f = load();
    f.panel.mount(); f.panel.applyPolicy(f.authorize());
    for (const mode of ['delayed', 'frozen', 'hidden', 'post-game', 'loading', 'error', 'unavailable']) {
        assert.equal(f.panel.setMode(mode).ok, true);
        assert.equal(f.panel.getSnapshot().displayMode, mode);
    }
    assert.equal(f.panel.setMode('invented').reasonCode, 'INVALID_MODE');
});

test('orientation changes anchor only and preserve semantic score', () => {
    const f = load();
    f.panel.mount(); f.panel.applyPolicy(f.authorize()); f.panel.setEvaluation(-210);
    const before = plain(f.panel.getSnapshot());
    assert.equal(f.panel.setOrientation('black').ok, true);
    const after = f.panel.getSnapshot();
    assert.equal(after.scoreCp, before.scoreCp);
    assert.equal(after.label, before.label);
    assert.equal(after.orientation, 'black');
    assert.equal(f.panel.setOrientation('black').status, 'unchanged');
    assert.equal(f.panel.setOrientation('sideways').reasonCode, 'INVALID_ORIENTATION');
});

test('reset, errors, resize, unmount, remount, and disposal are bounded', () => {
    const f = load();
    f.panel.mount(); f.panel.applyPolicy(f.authorize()); f.panel.setEvaluation(100);
    assert.equal(f.panel.resize().value, 400);
    assert.equal(f.panel.reset().ok, true);
    assert.equal(f.panel.getSnapshot().scoreType, 'neutral');
    assert.equal(f.panel.setError().ok, true);
    assert.equal(f.panel.unmount().ok, true);
    assert.equal(f.panel.mount({ root: f.root, board: f.board }).ok, true);
    assert.equal(f.panel.dispose().ok, true);
    assert.equal(f.panel.dispose().status, 'unchanged');
    assert.equal(f.panel.setEvaluation(1).ok, false);
});

test('static guard excludes resources, state ownership, routing, and other products', () => {
    for (const forbidden of [
        /\bnew Worker\b|postMessage\s*\(/, /requestAnimationFrame|setInterval|setTimeout/,
        /localStorage|sessionStorage/, /\bApp\b|Chess\s*\(/,
        /pushState|replaceState|CaissaNavigation/, /startAnalysis|getBestMove/,
        /matchmaking|FICS|Arena|Spectator|AnalyzeSection|Endgame|Trainer/
    ]) assert.doesNotMatch(source, forbidden);
    assert.doesNotMatch(source, /addEventListener\((?!['"]DOMContentLoaded)/);
});

test('Play contains one presentation writer and both SPA pages load it once before app', () => {
    const app = fs.readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
    assert.doesNotMatch(app, /evalFill["']\)|evalScore["']\)/);
    assert.match(app, /CaissaEvaluationRailInstance/);
    for (const page of ['index.html', 'yahoo-classic.html']) {
        const html = fs.readFileSync(new URL(`../../${page}`, import.meta.url), 'utf8');
        assert.equal((html.match(/evaluation-rail\.js/g) || []).length, 1);
        assert.ok(html.indexOf('evaluation-rail.js') < html.indexOf('src="app.js'));
    }
});
