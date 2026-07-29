import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../js/play/post-game-experience.js', import.meta.url), 'utf8');
const mentorSources = [
    'mentor-capabilities.js', 'mentor-registry.js', 'mentor-selection-resolver.js',
    'mentor-context.js', 'mentor-review-readiness.js', 'mentor-review-request.js',
    'mentor-review-request-registry.js', 'mentor-foundation.js'
].map(file => fs.readFileSync(new URL(`../../js/mentor/${file}`, import.meta.url), 'utf8'));
const plain = value => JSON.parse(JSON.stringify(value));

class Element {
    constructor(tag = 'div') {
        this.tag = tag; this.children = []; this.attributes = {}; this.dataset = {};
        this.className = ''; this.textContent = ''; this.hidden = false; this.disabled = false;
        this.listeners = []; this.checked = false;
    }
    setAttribute(name, value) {
        this.attributes[name] = String(value);
        if (name === 'data-post-game-result') this.dataset.postGameResult = '';
        if (name === 'data-post-game-summary') this.dataset.postGameSummary = '';
        if (name === 'data-post-game-feedback') this.dataset.postGameFeedback = '';
        if (name === 'data-post-game-consent') this.dataset.postGameConsent = '';
        if (name === 'data-post-game-action') this.dataset.postGameAction = value;
        if (name === 'disabled') this.disabled = true;
    }
    append(...nodes) { this.children.push(...nodes); }
    appendChild(node) { this.children.push(node); return node; }
    remove() {}
    click() { this.clicked = true; }
    focus() { this.focused = true; }
    addEventListener(type, handler) { this.listeners.push([type, handler]); }
    removeEventListener() {}
    replaceChildren(...nodes) { this.children = nodes; }
    querySelector(selector) {
        const key = selector.match(/\[data-([a-z-]+)/)?.[1]?.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        return this.walk().find(node => key && Object.hasOwn(node.dataset, key)) || null;
    }
    querySelectorAll(selector) {
        if (selector === '[data-post-game-action]')
            return this.walk().filter(node => Object.hasOwn(node.dataset, 'postGameAction'));
        return [];
    }
    walk() { return [this, ...this.children.flatMap(child => child.walk ? child.walk() : [])]; }
}

const record = Object.freeze({
    schemaVersion: '1.0.0', recordId: 'local-play:test', status: 'completed',
    result: { value: '1-0', winner: 'white', termination: 'checkmate', complete: true },
    player: { color: 'white' }, opponent: { type: 'engine', name: null },
    timing: { durationMs: null, finalClocks: {
        whiteMilliseconds: 120000, blackMilliseconds: 90000, activeColor: null, running: false
    } },
    moves: { count: 7 }, notation: { pgn: '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#', hasResultMismatch: true }
});

function fixture({ consent = 'unknown' } = {}) {
    const document = { createElement: tag => new Element(tag) };
    const calls = { commands: [], navigation: 0, handoffs: 0, writes: [], urls: [], revoked: [] };
    const compatibility = {
        getSnapshot: () => ({
            mode: 'engine', playerColor: 'white',
            clocks: { timeControlSeconds: 300 }, game: { active: false, result: '1-0' }
        }),
        execute: (command, options) => {
            calls.commands.push([command, options]); return { ok: true, status: 'accepted' };
        }
    };
    const handoff = { createFromPlay: () => { calls.handoffs += 1; return { ok: true, value: { token: 'opaque_token_123' } }; } };
    const navigation = { navigateToSection: () => {
        calls.navigation += 1; handoff.createFromPlay(); return true;
    } };
    const persistence = {
        getConsent: () => ({ ok: true, value: { state: consent } }),
        setConsent: state => ({ ok: true, value: { state } }),
        saveCompleted: value => { calls.writes.push(value.recordId); return { ok: true, status: 'stored' }; }
    };
    const records = { validate: value => ({ valid: value === record }) };
    const window = { document, CaissaGameRecord: records };
    const context = { window, globalThis: window, Object, Set, Map, WeakSet, Date };
    mentorSources.forEach(value => vm.runInNewContext(value, context));
    vm.runInNewContext(source, context);
    const experience = window.CaissaPostGameExperience.create({
        compatibility, records, persistence, handoff, navigation,
        rail: { setMode() {}, reset() {} },
        clipboard: { writeText: text => { calls.copied = text; return Promise.resolve(); } },
        url: {
            createObjectURL: () => { calls.urls.push('blob:test'); return 'blob:test'; },
            revokeObjectURL: value => calls.revoked.push(value)
        },
        Blob: class Blob {},
        onVisibilityChange: value => { calls.visible = value; }
    });
    const host = new Element();
    return { api: window.CaissaPostGameExperience, experience, host, calls };
}

test('publishes frozen versioned contract vocabularies', () => {
    const { api } = fixture();
    assert.equal(api.schemaVersion, '1.4.0');
    assert.equal(api.snapshotSchemaVersion, '1.4.0');
    for (const value of [api, api.statuses, api.actions, api.resultTypes, api.reasonCodes])
        assert.ok(Object.isFrozen(value));
});

test('valid completed record hydrates an immutable evidence-backed summary', () => {
    const f = fixture();
    f.experience.mount({ host: f.host });
    assert.equal(f.experience.hydrateFromGame({ record }).ok, true);
    const snapshot = f.experience.getSnapshot();
    assert.equal(snapshot.visible, true);
    assert.deepEqual(plain(snapshot.result), {
        type: 'white-win', value: '1-0', winner: 'white', termination: 'checkmate', complete: true
    });
    assert.equal(snapshot.timing.durationMs, null);
    assert.equal(snapshot.moves.count, 7);
    assert.equal(snapshot.notation.resultMismatch, true);
    assert.ok(Object.isFrozen(snapshot));
});

test('malformed, dangerous, active, and incomplete records never show', () => {
    const f = fixture();
    f.experience.mount({ host: f.host });
    assert.equal(f.experience.hydrateFromGame(null).ok, false);
    assert.equal(f.experience.hydrateFromGame(JSON.parse('{"__proto__":{"polluted":true}}')).ok, false);
    assert.equal(f.experience.hydrateFromGame({ record: { ...record, status: 'in-progress' } }).ok, false);
    assert.equal(f.experience.getSnapshot().visible, false);
    assert.equal({}.polluted, undefined);
});

test('one primary Rematch preserves configuration and issues one command', () => {
    const f = fixture();
    f.experience.mount({ host: f.host });
    f.experience.hydrateFromGame({ record, snapshot: f.experience ? {
        mode: 'engine', playerColor: 'black', clocks: { timeControlSeconds: 600 }
    } : null });
    assert.equal(f.experience.rematch().ok, true);
    assert.deepEqual(plain(f.calls.commands), [[
        'startNewGame', { mode: 'engine', color: 'black', timeControl: 600 }
    ]]);
    assert.equal(f.experience.getSnapshot().visible, false);
});

test('Analyze creates one opaque handoff through approved navigation', () => {
    const f = fixture();
    f.experience.mount({ host: f.host }); f.experience.hydrateFromGame({ record,
        snapshot: { mode: 'engine', playerColor: 'white', clocks: { timeControlSeconds: 0 } } });
    assert.equal(f.experience.analyze().ok, true);
    assert.equal(f.calls.navigation, 1);
    assert.equal(f.calls.handoffs, 1);
});

test('copy and download preserve PGN and revoke the object URL', async () => {
    const f = fixture();
    f.experience.mount({ host: f.host }); f.experience.hydrateFromGame({ record,
        snapshot: { mode: 'engine', playerColor: 'white', clocks: { timeControlSeconds: 0 } } });
    assert.equal((await f.experience.copyPgn()).ok, true);
    assert.equal(f.calls.copied, record.notation.pgn);
    assert.equal(f.experience.downloadPgn().ok, true);
    assert.deepEqual(f.calls.urls, ['blob:test']);
    assert.deepEqual(f.calls.revoked, ['blob:test']);
});

test('persistence is unavailable without consent and explicit once when granted', () => {
    const unknown = fixture();
    unknown.experience.mount({ host: unknown.host }); unknown.experience.hydrateFromGame({ record,
        snapshot: { mode: 'engine', playerColor: 'white', clocks: { timeControlSeconds: 0 } } });
    assert.equal(unknown.experience.saveGame().ok, false);
    assert.equal(unknown.calls.writes.length, 0);

    const granted = fixture({ consent: 'granted' });
    granted.experience.mount({ host: granted.host }); granted.experience.hydrateFromGame({ record,
        snapshot: { mode: 'engine', playerColor: 'white', clocks: { timeControlSeconds: 0 } } });
    assert.equal(granted.experience.saveGame().ok, true);
    assert.equal(granted.calls.writes.length, 1);
    assert.equal(granted.experience.saveGame().ok, false);
    assert.equal(granted.calls.writes.length, 1);
});

test('Mentor creates a truthful foundation request and duplicate completion is unchanged', () => {
    const f = fixture();
    f.experience.mount({ host: f.host });
    f.experience.hydrateFromGame({ record, snapshot: {
        mode: 'engine', playerColor: 'white', clocks: { timeControlSeconds: 0 }
    } });
    const requested = f.experience.requestMentorReview();
    assert.equal(requested.reasonCode, 'MENTOR_REQUEST_CREATED');
    assert.equal(requested.value.metadata.reviewImplemented, false);
    assert.equal(f.experience.getSnapshot().mentor.selectedMentorId, 'academyMentorCaissa');
    assert.equal(requested.value.capabilities.criticalMoments, 'disabled');
    assert.equal(requested.value.capabilities.recommendations, 'deferred');
    assert.doesNotMatch(JSON.stringify(requested), /"criticalMoments":\[|"recommendations":\[|weakness|strength/i);
    assert.equal(f.experience.hydrateFromGame({ record }).status, 'unchanged');
    assert.equal(f.experience.getSnapshot().diagnostics.displays, 1);
});

test('unmount, remount, and disposal are bounded', () => {
    const f = fixture();
    assert.equal(f.experience.mount({ host: f.host }).ok, true);
    assert.equal(f.experience.mount({ host: f.host }).status, 'unchanged');
    assert.equal(f.experience.unmount().ok, true);
    assert.equal(f.experience.mount({ host: f.host }).ok, true);
    assert.equal(f.experience.dispose().ok, true);
    assert.equal(f.experience.dispose().status, 'unchanged');
});

test('static guard excludes result logic, automatic persistence, engines, resources, and products', () => {
    for (const forbidden of [
        /in_checkmate|in_stalemate|insufficient_material|in_draw/,
        /\bnew Worker\b|postMessage|requestAnimationFrame|setTimeout|setInterval/,
        /\bApp\b|new Chess|startAnalysis|getBestMove/,
        /accuracy|critical moment|opening name|rating/,
        /FICS|Arena|Spectator|Bots/
    ]) assert.doesNotMatch(source, forbidden);
    assert.doesNotMatch(source, /saveCompleted\s*\([^)]*\)[\s\S]*hydrateFromGame/);
});

test('both SPA pages load PostGameExperience once before the shell', () => {
    for (const page of ['index.html', 'yahoo-classic.html']) {
        const html = fs.readFileSync(new URL(`../../${page}`, import.meta.url), 'utf8');
        assert.equal((html.match(/post-game-experience\.js/g) || []).length, 1);
        assert.ok(html.indexOf('post-game-experience.js') < html.indexOf('simplified-play-shell.js'));
    }
});
