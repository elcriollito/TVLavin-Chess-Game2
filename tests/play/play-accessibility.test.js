import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const rootUrl = new URL('../../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, rootUrl), 'utf8');
const focusSource = read('js/play/ui/play-focus-manager.js');
const announcementSource = read('js/play/ui/play-announcement-manager.js');
const accessibilitySource = read('js/play/ui/play-accessibility.js');
const combined = `${focusSource}\n${announcementSource}\n${accessibilitySource}`;

function node(tag = 'div') {
    return {
        tag, dataset: {}, children: [], attributes: new Map(), isConnected: true, hidden: false,
        append(...items) { items.forEach(item => this.appendChild(item)); },
        appendChild(item) { item.parentElement = this; this.children.push(item); return item; },
        contains(item) { return item === this || this.children.some(child => child.contains?.(item)); },
        setAttribute(name, value) { this.attributes.set(name, String(value)); },
        focus() { this.focused = true; },
        remove() {
            this.isConnected = false;
            if (this.parentElement) this.parentElement.children =
                this.parentElement.children.filter(child => child !== this);
        }
    };
}

function load() {
    const document = { createElement: tag => node(tag) };
    const window = {
        document,
        matchMedia: query => ({ matches: query.includes('reduced-motion') })
    };
    vm.runInNewContext(combined, {
        window, globalThis: window, Object, Set, Map, WeakSet
    });
    return window;
}

test('policy schemas, vocabularies, diagnostics, and public APIs are fixed and immutable', () => {
    const window = load(), api = window.CaissaPlayAccessibility;
    assert.equal(api.schemaVersion, '1.0.0');
    assert.equal(api.policyVersion, '1.0.0');
    assert.deepEqual([...api.surfaceTypes],
        ['navigation', 'board', 'panel', 'dialog', 'disclosure', 'status', 'action', 'list']);
    assert.ok(Object.isFrozen(api) && Object.isFrozen(api.surfaceTypes) && Object.isFrozen(api.states));
    assert.equal(api.getReducedMotion(), true);
    assert.equal(api.getForcedColors(), false);
});

test('surface validation accepts bounded records and rejects hostile, invalid, and unknown versions', () => {
    const api = load().CaissaPlayAccessibility;
    assert.equal(api.validateSurface({
        schemaVersion: '1.0.0', type: 'panel', state: 'ready', label: 'Games controls'
    }).ok, true);
    assert.equal(api.validateSurface({
        schemaVersion: '2.0.0', type: 'panel', state: 'ready', label: 'Games'
    }).reasonCode, 'UNSUPPORTED_SCHEMA_VERSION');
    assert.equal(api.validateSurface({
        schemaVersion: '1.0.0', type: 'unknown', state: 'ready', label: '<bad>'
    }).reasonCode, 'INVALID_SURFACE');
    const hostile = JSON.parse('{"schemaVersion":"1.0.0","type":"panel","state":"ready","label":"x","__proto__":{"polluted":true}}');
    assert.equal(api.validateSurface(hostile).reasonCode, 'INVALID_SURFACE');
});

test('focus manager moves, restores, bounds records, handles stale triggers, and never accepts selectors', () => {
    const manager = load().CaissaPlayFocusManager;
    const root = node(), trigger = node('button'), target = node('button'), fallback = node('main');
    root.append(trigger, target, fallback);
    const captured = manager.capture(trigger);
    assert.equal(manager.moveFocus(target, { root }).reasonCode, 'FOCUS_MOVED');
    assert.equal(manager.restoreFocus(captured.value, fallback).reasonCode, 'FOCUS_RESTORED');
    const stale = manager.capture(trigger); trigger.isConnected = false;
    assert.equal(manager.restoreFocus(stale.value, fallback).reasonCode, 'FOCUS_FALLBACK_USED');
    assert.equal(manager.moveFocus('#arbitrary', { root }).reasonCode, 'INVALID_FOCUS_TARGET');
    for (let index = 0; index < 20; index += 1) manager.capture(node('button'));
    assert.equal(manager.inspect().recordCount, 16);
    assert.equal(manager.dispose().reasonCode, 'DISPOSED');
});

test('announcement manager owns exactly two regions with fixed IDs, deduplication, and bounded queue', () => {
    const manager = load().CaissaPlayAnnouncementManager, host = node();
    assert.equal(manager.mount(host).reasonCode, 'MOUNTED');
    assert.equal(manager.inspect().liveRegionCount, 2);
    assert.equal(manager.announce('PLAY_READY').reasonCode, 'ANNOUNCED');
    assert.equal(manager.announce('PLAY_READY').reasonCode, 'DEDUPLICATED');
    assert.equal(manager.announce('<script>').reasonCode, 'UNKNOWN_ANNOUNCEMENT');
    for (const id of manager.messageIds) manager.announce(id, { force: true });
    assert.equal(manager.inspect().queueDepth, 8);
    assert.equal(manager.dispose().reasonCode, 'DISPOSED');
    assert.equal(manager.inspect().liveRegionCount, 0);
});

test('accessibility instance composes managers without leaking DOM in diagnostics', () => {
    const window = load(), host = node();
    const instance = window.CaissaPlayAccessibility.create(host);
    assert.equal(instance.schemaVersion, '1.0.0');
    assert.equal(instance.announce('MODE_GAMES').ok, true);
    const snapshot = instance.inspect();
    assert.equal(snapshot.announcements.liveRegionCount, 2);
    assert.doesNotMatch(JSON.stringify(snapshot), /children|parentElement|attributes/);
    assert.ok(Object.isFrozen(snapshot));
});

test('static boundaries exclude business ownership, persistence, resources, timers, HTML injection, and arbitrary selectors', () => {
    for (const forbidden of [
        /global\.App|CaissaGameLifecycle|CaissaFairPlay|CaissaChessboard|CaissaEngine|CaissaProvider|CaissaGameRecord|CaissaMentor/,
        /\bnew\s+(?:Worker|WebSocket)\b|fetch\s*\(|XMLHttpRequest|postMessage\s*\(/,
        /localStorage|sessionStorage|indexedDB|setTimeout|setInterval|requestAnimationFrame/,
        /innerHTML|insertAdjacentHTML|eval\s*\(|new Function/,
        /querySelector|querySelectorAll|location\.|history\./
    ]) assert.doesNotMatch(combined, forbidden);
});

test('integration guardrails centralize announcements and preserve truthful board and production boundaries', () => {
    const playFiles = [
        'js/play/simplified-play-shell.js', 'js/play/games-panel.js', 'js/play/bots-panel.js',
        'js/play/coach-panel.js', 'js/play/players-panel.js', 'js/play/evaluation-rail.js',
        'js/play/post-game-experience.js', 'js/mentor/guided-replay-view.js'
    ].map(read).join('\n');
    assert.equal((playFiles.match(/['"]aria-live['"]\s*:/g) || []).length, 0);
    assert.match(read('js/play/chessboard-adapter.js'), /Use tap or drag to request a move/);
    assert.doesNotMatch(combined, /startNewGame|makeMove|navigate|evaluationMode|playerId/);
    assert.match(read('docs/design/PLAY_ACCESSIBILITY_AUDIT.md'),
        /does not provide square-by-square keyboard chess/);
    assert.doesNotMatch(read('index.html'), /data-play-accessibility-production/);
});

test('registration, CSS safeguards, dialog semantics, package script, and architecture protection are explicit', () => {
    for (const page of ['index.html', 'yahoo-classic.html']) {
        const html = read(page);
        for (const asset of ['play-focus-manager.js', 'play-announcement-manager.js', 'play-accessibility.js'])
            assert.equal((html.match(new RegExp(asset.replaceAll('.', '\\.'), 'g')) || []).length, 1);
        assert.ok(html.indexOf('play-accessibility.js') < html.indexOf('simplified-play-shell.js'));
        assert.match(html, /id="promotionModal"[^>]+role="dialog"[^>]+aria-modal="true"/);
    }
    const css = `${read('css/play-visual-components.css')}\n${read('css/play-simplified-shell.css')}`;
    assert.match(css, /@media \(forced-colors: active\)/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(css, /min-height: 44px/);
    assert.match(css, /outline: 3px solid var\(--play-theme-focus\)/);
    assert.ok(JSON.parse(read('package.json')).scripts['test:play:accessibility']);
});
