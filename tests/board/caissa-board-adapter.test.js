import test from 'node:test';
import assert from 'node:assert/strict';
import { CAISSA_BOARD_EVENTS, CaissaBoardAdapter, create } from '../../js/board/caissa-board-adapter.js';

function fakeHarness() {
    const calls = [];
    let suppliedOptions;
    class FakeRenderer {
        constructor(container, options) { calls.push(['constructor', container]); suppliedOptions = options; }
        setPosition(...args) { calls.push(['setPosition', ...args]); return 'position'; }
        applyMove(...args) { calls.push(['applyMove', ...args]); return 'move'; }
        setOrientation(...args) { calls.push(['setOrientation', ...args]); return 'orientation'; }
        setInteractive(...args) { calls.push(['setInteractive', ...args]); return 'interactive'; }
        setReadOnly(...args) { calls.push(['setReadOnly', ...args]); return 'readonly'; }
        selectSquare(...args) { calls.push(['selectSquare', ...args]); return 'select'; }
        clearSelection(...args) { calls.push(['clearSelection', ...args]); return 'clear-selection'; }
        highlightSquares(...args) { calls.push(['highlightSquares', ...args]); return 'highlight'; }
        clearHighlights(...args) { calls.push(['clearHighlights', ...args]); return 'clear-highlights'; }
        drawArrow(...args) { calls.push(['drawArrow', ...args]); return 'arrow'; }
        clearArrows(...args) { calls.push(['clearArrows', ...args]); return 'clear-arrows'; }
        resize(...args) { calls.push(['resize', ...args]); return 'resize'; }
        flushPending(...args) { calls.push(['flushPending', ...args]); return 'flush'; }
        getPosition() { return { placement: '8/8/8/8/8/8/8/8' }; }
        getOrientation() { return 'white'; }
        getMetrics() { return { squareCount: 64 }; }
        destroy() { calls.push(['destroy']); return { ok: true }; }
    }
    return { calls, FakeRenderer, options: () => suppliedOptions };
}

test('adapter exposes the approved stable API and forwards presentation calls', () => {
    const fake = fakeHarness();
    const container = {};
    const adapter = create(container, { rendererFactory: fake.FakeRenderer });
    assert.ok(adapter instanceof CaissaBoardAdapter);
    assert.equal(adapter.setPosition('start', { animate: false }), 'position');
    assert.equal(adapter.applyMove({ from: 'e2', to: 'e4' }), 'move');
    assert.equal(adapter.setOrientation('black'), 'orientation');
    assert.equal(adapter.setInteractive(false), 'interactive');
    assert.equal(adapter.setReadOnly(true), 'readonly');
    assert.equal(adapter.selectSquare('e2'), 'select');
    assert.equal(adapter.clearSelection(), 'clear-selection');
    assert.equal(adapter.highlightSquares(['e4']), 'highlight');
    assert.equal(adapter.clearHighlights(), 'clear-highlights');
    assert.equal(adapter.drawArrow('e2', 'e4'), 'arrow');
    assert.equal(adapter.clearArrows(), 'clear-arrows');
    assert.equal(adapter.resize(), 'resize');
    assert.equal(adapter.flushPending(), 'flush');
    assert.equal(adapter.getOrientation(), 'white');
    assert.equal(adapter.getMetrics().renderer.squareCount, 64);
    assert.equal(fake.calls[0][1], container);
    assert.equal(adapter.destroy().ok, true);
    assert.equal(adapter.setPosition('start').reasonCode, 'ADAPTER_DESTROYED');
});

test('adapter normalizes callback and subscribed event delivery without becoming move authority', () => {
    const fake = fakeHarness();
    const received = [];
    const adapter = new CaissaBoardAdapter({}, {
        rendererFactory: fake.FakeRenderer,
        onSquareTap: square => received.push(['configured-square', square]),
        onMoveAttempt: move => received.push(['configured-move', move]),
        onPromotionRequest: () => 'Q'
    });
    const unsubscribe = adapter.on('moveAttempt', move => received.push(['listener-move', move]));
    fake.options().onSquareTap('e2');
    fake.options().onMoveAttempt({ from: 'e2', to: 'e4', promotion: null });
    assert.equal(fake.options().onPromotionRequest({ from: 'a7', to: 'a8' }), 'Q');
    assert.deepEqual(received, [
        ['configured-square', 'e2'],
        ['configured-move', { from: 'e2', to: 'e4', promotion: null }],
        ['listener-move', { from: 'e2', to: 'e4', promotion: null }]
    ]);
    assert.equal(unsubscribe(), true);
    assert.equal(fake.options().onDragStart('e2'), true);
    const reject = adapter.on('dragStart', () => false);
    assert.equal(fake.options().onDragStart('e2'), false);
    reject();
    assert.deepEqual(CAISSA_BOARD_EVENTS, [
        'squareTap', 'moveAttempt', 'dragStart', 'dragEnd', 'promotionRequest', 'orientationChange', 'resize', 'error'
    ]);
});

test('adapter rejects unsupported event names', () => {
    const fake = fakeHarness();
    const adapter = new CaissaBoardAdapter({}, { rendererFactory: fake.FakeRenderer });
    assert.throws(() => adapter.on('gameStateChanged', () => {}), /Unsupported CAISSA board event/);
});
