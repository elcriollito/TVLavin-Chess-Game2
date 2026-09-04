import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../js/play/chessboard-adapter.js', import.meta.url), 'utf8');

class Element {
    constructor(id = '') {
        this.id = id; this.attrs = {}; this.listeners = new Map(); this.nodes = new Map();
        this.classList = { add() {}, remove() {} };
    }
    addEventListener(type, handler) { this.listeners.set(type, handler); }
    removeEventListener(type) { this.listeners.delete(type); }
    setAttribute(key, value) { this.attrs[key] = String(value); }
    getAttribute(key) { return this.attrs[key] ?? null; }
    getBoundingClientRect() { return { width: 400, height: 400 }; }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    focus() { this.focused = true; }
}

function fixture(options = {}) {
    const root = new Element('chessboard');
    const document = new Element();
    document.getElementById = id => id === 'chessboard' ? root : null;
    const log = { factories: 0, positions: [], animations: [], orientations: [], resizes: 0, destroys: 0, config: null };
    const boardFactory = (_, config) => {
        log.factories += 1; log.config = config;
        let widgetPosition = { e2: 'wP' };
        return {
            position(value, animate) {
                if (arguments.length === 0) return widgetPosition;
                log.positions.push(value); log.animations.push(animate);
                widgetPosition = typeof value === 'object' ? { ...value } : value;
            },
            orientation(value) { log.orientations.push(value); },
            resize() { log.resizes += 1; },
            destroy() { log.destroys += 1; }
        };
    };
    const window = new Element();
    Object.assign(window, { document, setTimeout, clearTimeout,
        matchMedia: query => ({ matches: options.reducedMotion === true && query.includes('reduced-motion') }) });
    vm.runInNewContext(source, { window, globalThis: window });
    const adapter = window.CaissaChessboardAdapter.create({ boardFactory, ...options });
    return { api: window.CaissaChessboardAdapter, adapter, root, document, window, log };
}

test('publishes frozen versioned vocabularies and creates independent adapters', () => {
    const { api } = fixture();
    assert.equal(api.schemaVersion, '1.0.0');
    assert.equal(api.snapshotSchemaVersion, '1.0.0');
    assert.ok(Object.isFrozen(api));
    assert.ok(Object.isFrozen(api.events));
    assert.notEqual(api.create({}), api.create({}));
});

test('mount is idempotent, rejects another container, and creates exactly one widget', () => {
    const f = fixture();
    assert.equal(f.adapter.mount('chessboard').status, 'accepted');
    assert.equal(f.adapter.mount(f.root).status, 'unchanged');
    assert.equal(f.adapter.mount(new Element('other')).reasonCode, 'DIFFERENT_CONTAINER');
    assert.equal(f.log.factories, 1);
    assert.equal(f.adapter.inspect().listenerCount, 7);
});

test('snapshot is deeply frozen, detached, serializable, and has no widget or callbacks', () => {
    const f = fixture({ getActiveColor: () => 'white' });
    f.adapter.mount(f.root);
    const snapshot = f.adapter.getSnapshot();
    assert.equal(snapshot.mounted, true);
    assert.equal(snapshot.squareSize, 50);
    assert.equal(snapshot.accessibility.activeColor, 'white');
    assert.ok(Object.isFrozen(snapshot));
    assert.ok(Object.isFrozen(snapshot.accessibility));
    assert.doesNotMatch(JSON.stringify(snapshot), /widget|callback|boardFactory/);
});

test('position rendering is presentation-only, validated, and idempotent', () => {
    const f = fixture();
    f.adapter.mount(f.root);
    assert.equal(f.adapter.setPosition('start').status, 'unchanged');
    const fen = '8/8/8/8/8/8/8/K6k w - - 0 1';
    assert.equal(f.adapter.setPosition(fen).status, 'accepted');
    assert.equal(f.adapter.setPosition(fen).status, 'unchanged');
    assert.equal(f.adapter.setPosition('not-fen').status, 'rejected');
    assert.deepEqual(f.log.positions, [fen]);
    assert.equal(f.adapter.getSnapshot().renderSequence, 1);
});

test('programmatic placement is immediate by default and reduced motion rejects requested animation', () => {
    const normal = fixture(); normal.adapter.mount(normal.root);
    normal.adapter.setPosition('8/8/8/8/8/8/8/K6k w - - 0 1');
    assert.deepEqual(normal.log.animations, [false]);
    const reduced = fixture({ reducedMotion: true }); reduced.adapter.mount(reduced.root);
    reduced.adapter.setPosition('8/8/8/8/8/8/8/K6k w - - 0 1', { animate: true });
    assert.deepEqual(reduced.log.animations, [false]);
});

test('orientation, flip, interaction, resize and compatibility facade delegate once', () => {
    const f = fixture();
    f.adapter.mount(f.root);
    assert.equal(f.adapter.setOrientation('black').value, 'black');
    assert.equal(f.adapter.flip().value, 'white');
    f.adapter.setInteractionEnabled(false);
    assert.equal(f.root.getAttribute('aria-disabled'), 'true');
    f.adapter.resize();
    const facade = f.adapter.getLegacyFacade();
    facade.position('8/8/8/8/8/8/8/K6k w - - 0 1', false);
    facade.resize();
    assert.equal(f.log.resizes, 2);
    assert.deepEqual(f.log.orientations, ['black', 'white']);
});

test('legacy facade returns a detached widget-position map for the existing editor', () => {
    const f = fixture();
    f.adapter.mount(f.root);
    const position = f.adapter.getLegacyFacade().position();
    assert.equal(JSON.stringify(position), '{"e2":"wP"}');
    position.e2 = 'bQ';
    assert.equal(JSON.stringify(f.adapter.getLegacyFacade().position()), '{"e2":"wP"}');
});

test('highlight state validates squares and remains presentation-only', () => {
    const f = fixture();
    f.adapter.mount(f.root);
    assert.equal(f.adapter.setSelection('e2').ok, true);
    assert.equal(f.adapter.setLegalTargets(['e3', 'e4'], { captureTargets: ['e4'] }).ok, true);
    assert.equal(f.adapter.setLastMove({ from: 'a2', to: 'a4' }).ok, true);
    assert.equal(f.adapter.setCheckSquare('e8').ok, true);
    assert.equal(f.adapter.setSelection('__proto__').ok, false);
    assert.deepEqual([...f.adapter.getSnapshot().legalTargets], ['e3', 'e4']);
    assert.deepEqual([...f.adapter.getSnapshot().legalCaptureTargets], ['e4']);
    f.adapter.clearHighlights();
    assert.equal(f.adapter.getSnapshot().selectedSquare, null);
});

test('drag and drop callbacks are forwarded once and disabled input snaps back', () => {
    let starts = 0; let drops = 0;
    const f = fixture({ onDragStart: () => { starts += 1; return true; }, onDrop: () => { drops += 1; } });
    f.adapter.mount(f.root);
    assert.equal(f.log.config.onDragStart('e2', 'wP'), true);
    f.log.config.onDrop('e2', 'e4');
    assert.equal(starts, 1); assert.equal(drops, 1);
    f.adapter.setInteractionEnabled(false);
    assert.equal(f.log.config.onDragStart('e2', 'wP'), false);
    assert.equal(f.log.config.onDrop('e2', 'e4'), 'snapback');
    assert.equal(drops, 1);
});

test('snap completion reconciles a fast opponent render and reapplies highlights', () => {
    const f = fixture({ onSnapEnd: () => {} });
    f.adapter.mount(f.root);
    const fen = '8/8/8/4p3/8/8/8/K6k w - - 0 1';
    f.adapter.setPosition(fen);
    f.adapter.setLastMove({ from: 'e7', to: 'e5' });
    assert.deepEqual(f.log.positions, [fen]);
    f.log.config.onSnapEnd();
    assert.deepEqual(f.log.positions, [fen, fen]);
    assert.equal(f.adapter.getSnapshot().lastMove.from, 'e7');
    assert.equal(f.adapter.getSnapshot().lastMove.to, 'e5');
});

test('unmount cleans listeners, remount works, and dispose is terminal and idempotent', () => {
    const f = fixture();
    f.adapter.mount(f.root);
    assert.equal(f.adapter.unmount().status, 'accepted');
    assert.equal(f.adapter.inspect().listenerCount, 0);
    assert.equal(f.adapter.mount(f.root).ok, true);
    assert.equal(f.log.factories, 2);
    assert.equal(f.adapter.dispose().status, 'accepted');
    assert.equal(f.adapter.dispose().status, 'unchanged');
    assert.equal(f.adapter.setPosition('start').status, 'disposed');
    assert.equal(f.log.destroys, 2);
});

test('static ownership guard excludes chess state, engines, clocks, storage, routing, and other boards', () => {
    for (const forbidden of [
        /\bnew\s+Chess\b/, /\bApp\./, /ClockService|EngineAdapter|FairPlayPolicy/,
        /localStorage|sessionStorage|pushState|replaceState/, /analyzeChessboard|arenaBoard|fics|spectator/i,
        /\.move\s*\(|game_over|in_check/
    ]) assert.doesNotMatch(source, forbidden);
});

test('Play production integration has one adapter constructor path and no dependency or shell changes', () => {
    const app = fs.readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
    const index = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const classic = fs.readFileSync(new URL('../../yahoo-classic.html', import.meta.url), 'utf8');
    assert.doesNotMatch(app, /\bChessboard\s*\(\s*['"]chessboard['"]/);
    assert.equal((app.match(/CaissaChessboardAdapter\.create\s*\(/g) || []).length, 1);
    assert.equal((index.match(/js\/play\/chessboard-adapter\.js/g) || []).length, 1);
    assert.equal((classic.match(/js\/play\/chessboard-adapter\.js/g) || []).length, 1);
    assert.doesNotMatch(source, /GamesPanel|BotsPanel|CoachPanel|PlayersPanel/);
});
