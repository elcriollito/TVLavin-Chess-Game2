import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/fics-board-view.js', import.meta.url), 'utf8');
const clientSource = fs.readFileSync(new URL('../js/fics-client.js', import.meta.url), 'utf8');
const indexSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const playIsolationSource = fs.readFileSync(new URL('../js/play/play-v2-fics-isolation.js', import.meta.url), 'utf8');

function loadSeam() {
    const frames = new Map();
    let frameSequence = 0;
    const root = {
        performance: { now: (() => { let value = 0; return () => ++value; })() },
        requestAnimationFrame(callback) {
            const id = ++frameSequence;
            frames.set(id, callback);
            queueMicrotask(() => {
                const pending = frames.get(id);
                frames.delete(id);
                pending?.();
            });
            return id;
        },
        cancelAnimationFrame(id) { frames.delete(id); },
        setTimeout, clearTimeout
    };
    vm.runInNewContext(source, { window: root, globalThis: root, console }, { filename: 'fics-board-view.js' });
    return root;
}

function container() {
    return {
        ownerDocument: null,
        attributes: new Map(),
        replaceChildren() {},
        setAttribute(name, value) { this.attributes.set(name, String(value)); },
        removeAttribute(name) { this.attributes.delete(name); },
        getAttribute(name) { return this.attributes.get(name) || null; }
    };
}

function legacyFactory(log) {
    return (position, orientation) => {
        let current = position === 'start' ? 'start' : position.split(/\s+/)[0];
        let facing = orientation;
        const board = {
            position(value) {
                if (arguments.length === 0 || value === 'fen') return current;
                current = value === 'start' ? 'start' : String(value).split(/\s+/)[0];
                log.push(['legacy-position', current]);
                return current;
            },
            orientation(value) {
                if (arguments.length === 0) return facing;
                facing = value;
                log.push(['legacy-orientation', value]);
                return facing;
            },
            resize() { log.push(['legacy-resize']); },
            destroy() { log.push(['legacy-destroy']); }
        };
        log.push(['legacy-create', current, facing]);
        return board;
    };
}

function persistentFactory(log) {
    return (host, options) => {
        let current = String(options.position).split(/\s+/)[0];
        let facing = options.orientation;
        const metrics = { squareCount: 64, nodesAdded: 0, nodesRemoved: 0 };
        const adapter = {
            setPosition(fen) {
                current = String(fen).split(/\s+/)[0];
                log.push(['persistent-position', current]);
                return { ok: true };
            },
            applyMove(move, optionsValue) {
                current = String(optionsValue.fen).split(/\s+/)[0];
                log.push(['persistent-move', move.from, move.to]);
                return { ok: true };
            },
            setOrientation(value) { facing = value; return { ok: true }; },
            setInteractive(value) { log.push(['interactive', value]); return { ok: true }; },
            setReadOnly(value) { log.push(['read-only', value]); return { ok: true }; },
            getPosition() { return { placement: current, renderedPlacement: current }; },
            getOrientation() { return facing; },
            getMetrics() { return metrics; },
            flushPending() { return { ok: true }; },
            resize() { return { ok: true }; },
            destroy() { log.push(['persistent-destroy']); }
        };
        log.push(['persistent-create', current, facing, options.interactive, options.readOnly]);
        return adapter;
    };
}

const observed = Object.freeze({
    observedGame: true, status: 'observing', gameActive: false, relation: 0
});
const playing = Object.freeze({
    observedGame: false, status: 'playing', gameActive: true, relation: 1
});

test('pilot flag defaults OFF and Observe eligibility fails closed for playable relationships', () => {
    const root = loadSeam();
    assert.equal(root.CaissaFICSBoardView.FLAG, 'CAISSA_FICS_PERSISTENT_BOARD_PILOT');
    assert.equal(root.CaissaFICSBoardView.featureEnabled(), false);
    assert.equal(root.CaissaFICSBoardView.observeEligible(observed), true);
    assert.equal(root.CaissaFICSBoardView.observeEligible({ ...observed, relation: 1 }), false);
    assert.equal(root.CaissaFICSBoardView.observeEligible({ ...observed, status: 'playing' }), false);
    assert.doesNotMatch(indexSource, /CAISSA_FICS_PERSISTENT_BOARD_PILOT\s*=/);
});

test('one renderer switches atomically to persistent Observe and synchronously back to legacy Play', async () => {
    const root = loadSeam();
    root.CAISSA_FICS_PERSISTENT_BOARD_PILOT = true;
    const log = [];
    const node = container();
    const view = root.CaissaFICSBoardView.createFicsBoardView({
        host: root, container: node, position: 'start', orientation: 'white',
        createLegacy: legacyFactory(log),
        loadAdapter: async () => ({ create: persistentFactory(log) }),
        loadStyles: async () => {}
    });
    assert.equal(view.getSnapshot().renderer, 'legacy');
    view.presentCanonicalState({ state: observed, position: '8/8/8/8/8/8/8/K6k w - - 0 1', orientation: 'white' });
    await view.whenIdle();
    assert.equal(view.getSnapshot().renderer, 'persistent');
    assert.equal(view.getSnapshot().readOnly, true);
    assert.equal(node.getAttribute('data-fics-board-renderer'), 'persistent');
    assert.deepEqual(log.filter(entry => /-create$/.test(entry[0])).map(entry => entry[0]),
        ['legacy-create', 'persistent-create']);
    assert.ok(log.findIndex(entry => entry[0] === 'legacy-destroy')
        < log.findIndex(entry => entry[0] === 'persistent-create'));

    view.presentCanonicalState({ state: playing, position: 'start', orientation: 'white' });
    assert.equal(view.getSnapshot().renderer, 'legacy');
    assert.equal(node.getAttribute('data-fics-board-renderer'), null);
    assert.equal(log.filter(entry => entry[0] === 'persistent-destroy').length, 1);
    assert.equal(log.filter(entry => entry[0] === 'legacy-create').length, 2);
});

test('trusted quiet move uses applyMove while visual bursts coalesce to the latest snapshot', async () => {
    const root = loadSeam();
    root.CAISSA_FICS_PERSISTENT_BOARD_PILOT = true;
    const log = [];
    const view = root.CaissaFICSBoardView.createFicsBoardView({
        host: root, container: container(), position: 'start', orientation: 'white',
        createLegacy: legacyFactory(log),
        loadAdapter: async () => ({ create: persistentFactory(log) }), loadStyles: async () => {}
    });
    const initial = '8/8/8/8/8/8/4P3/K6k w - - 0 1';
    const moved = '8/8/8/8/4P3/8/8/K6k b - - 0 1';
    view.presentCanonicalState({ state: observed, position: initial, orientation: 'white' });
    await view.whenIdle();
    view.presentCanonicalState({ state: observed, position: moved, previousFen: initial,
        semanticMove: { from: 'e2', to: 'e4' }, orientation: 'white', animate: true });
    await view.whenIdle();
    assert.deepEqual(log.filter(entry => entry[0] === 'persistent-move'), [['persistent-move', 'e2', 'e4']]);

    for (let index = 0; index < 50; index += 1) {
        const square = index === 49 ? 'c3' : index % 2 ? 'b1' : 'c3';
        view.presentCanonicalState({ state: observed, position: `8/8/8/8/8/${square === 'c3' ? '2N5' : '8'}/8/${square === 'b1' ? '1N6' : '8'} w - - 0 1`, orientation: 'white' });
    }
    const snapshot = await view.whenIdle();
    assert.equal(snapshot.metrics.coalescedVisualUpdates, 49);
    assert.equal(snapshot.metrics.snapshotFallbacks, 1);
    assert.equal(snapshot.position, '8/8/8/8/8/2N5/8/8');
});

test('review jumps and Live restore are visual-only setPosition operations', async () => {
    const root = loadSeam();
    root.CAISSA_FICS_PERSISTENT_BOARD_PILOT = true;
    const log = [];
    const view = root.CaissaFICSBoardView.createFicsBoardView({
        host: root, container: container(), position: 'start', orientation: 'white',
        createLegacy: legacyFactory(log),
        loadAdapter: async () => ({ create: persistentFactory(log) }), loadStyles: async () => {}
    });
    const live = '8/8/8/8/4P3/8/8/K6k b - - 0 1';
    const historical = '8/8/8/8/8/8/4P3/K6k w - - 0 1';
    view.presentCanonicalState({ state: observed, position: live, orientation: 'white' });
    await view.whenIdle();
    view.board.position(historical, false);
    assert.equal(view.getSnapshot().position, historical.split(' ')[0]);
    view.presentCanonicalState({ state: observed, position: live, orientation: 'white', reviewing: true });
    await view.whenIdle();
    assert.equal(view.getSnapshot().position, historical.split(' ')[0]);
    view.board.position(live, false);
    assert.equal(view.getSnapshot().position, live.split(' ')[0]);
});

test('client integration is presentation-only and Play imports none of the pilot', () => {
    assert.match(indexSource, /fics-board-view\.js\?v=1\.0\.0/);
    assert.match(clientSource, /deriveStyle12BoardMove/);
    assert.match(clientSource, /presentCanonicalBoardState/);
    assert.match(clientSource, /this\.boardView\.presentCanonicalState/);
    assert.doesNotMatch(source, /WebSocket|FICSStyle12|sendMove|moveHistory|pgnStartFen|whiteClock|blackClock/i);
    assert.doesNotMatch(playIsolationSource, /fics-board-view|caissa-board-adapter|caissa-persistent-renderer/i);
});
