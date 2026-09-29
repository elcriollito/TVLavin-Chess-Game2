import test from 'node:test';
import assert from 'node:assert/strict';
import { CaissaDragScheduler, CaissaDropResolver } from '../../js/board/caissa-quiet-drag.js';

function fakeView() {
    let sequence = 0;
    const frames = new Map();
    return {
        frames,
        requestAnimationFrame(callback) { frames.set(++sequence, callback); return sequence; },
        cancelAnimationFrame(id) { frames.delete(id); },
        runFrame(id = frames.keys().next().value) {
            const callback = frames.get(id);
            frames.delete(id);
            callback?.(16.67);
        }
    };
}

test('drop resolver preserves exact grab offset and orientation using cached geometry', () => {
    const rect = { left: 100, top: 50, width: 800, height: 800 };
    const white = new CaissaDropResolver(rect, 'white');
    const black = new CaissaDropResolver(rect, 'black');
    assert.equal(white.squareAt(150, 800), 'a1');
    assert.equal(black.squareAt(150, 800), 'h8');
    assert.equal(white.squareAt(99, 800), null);
    assert.deepEqual(white.dragPosition(460, 270, { x: 17, y: 63 }), { x: 343, y: 157 });
    assert.deepEqual(white.geometry, rect);
});

test('drag scheduler coalesces to one latest-coordinate write per animation frame', () => {
    const view = fakeView();
    const writes = [];
    const scheduler = new CaissaDragScheduler(view, point => writes.push(point));
    for (let index = 0; index < 20; index += 1) scheduler.update({ x: index, y: -index });
    assert.equal(view.frames.size, 1);
    assert.equal(scheduler.getMetrics().framesRequested, 1);
    assert.equal(scheduler.getMetrics().visualWrites, 0);
    view.runFrame();
    assert.deepEqual(writes, [{ x: 19, y: -19 }]);
    assert.equal(scheduler.getMetrics().visualWrites, 1);
    assert.equal(scheduler.getMetrics().inputEvents, 20);
});

test('cancel and destroy prevent stale animation-frame writes', () => {
    const view = fakeView();
    const writes = [];
    const scheduler = new CaissaDragScheduler(view, point => writes.push(point));
    scheduler.update({ x: 1, y: 2 });
    scheduler.cancel();
    assert.equal(view.frames.size, 0);
    assert.equal(scheduler.getMetrics().pendingFrame, false);
    scheduler.update({ x: 3, y: 4 });
    scheduler.destroy();
    assert.equal(view.frames.size, 0);
    assert.equal(scheduler.update({ x: 5, y: 6 }), false);
    assert.deepEqual(writes, []);
    assert.equal(scheduler.getMetrics().destroyed, true);
});
