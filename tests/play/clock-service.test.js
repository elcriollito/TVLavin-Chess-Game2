import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../js/play/clock-service.js', import.meta.url), 'utf8');

function harness() {
    let now = 0;
    let nextHandle = 0;
    const frames = new Map();
    const canceled = [];
    const storageWrites = [];
    const window = {
        performance: { now: () => now },
        requestAnimationFrame(callback) {
            const handle = ++nextHandle;
            frames.set(handle, callback);
            return handle;
        },
        cancelAnimationFrame(handle) {
            canceled.push(handle);
            frames.delete(handle);
        }
    };
    vm.runInNewContext(source, { window, Object, JSON, Date, Number, Math });
    let session = 0;
    const clock = window.CaissaClockService.createClock({
        monotonicNow: () => now,
        requestFrame: window.requestAnimationFrame,
        cancelFrame: window.cancelAnimationFrame,
        wallNow: () => 0,
        sessionIdFactory: () => `clock:${++session}`
    });
    return {
        api: window.CaissaClockService, clock, frames, canceled, storageWrites,
        setNow(value) { now = value; },
        frame(value) {
            now = value;
            const [handle, callback] = frames.entries().next().value || [];
            assert.ok(handle);
            frames.delete(handle);
            callback(value);
        }
    };
}

test('contract metadata and snapshots are versioned, frozen, detached, and serializable', () => {
    const h = harness();
    assert.equal(h.api.schemaVersion, '1.0.0');
    assert.equal(Object.isFrozen(h.api.statuses), true);
    const configured = h.clock.configure({ initialTimeMs: 300000, incrementMs: 0, activeColor: 'white' });
    assert.equal(configured.status, 'configured');
    assert.equal(Object.isFrozen(configured.snapshot), true);
    assert.doesNotThrow(() => JSON.stringify(configured.snapshot));
    assert.equal(configured.snapshot.delayMs, 0);
    assert.equal('rafHandle' in configured.snapshot, false);
    assert.equal('callback' in configured.snapshot, false);
});

test('configuration validates limits, colors, hostile shapes, and rotates deterministic sessions', () => {
    const h = harness();
    for (const config of [null, [], { initialTimeMs: -1 }, { initialTimeMs: Infinity },
        { initialTimeMs: 1, incrementMs: -1 }, { initialTimeMs: 1, activeColor: 'red' },
        Object.create({ initialTimeMs: 1 })])
        assert.equal(h.clock.configure(config).status, 'invalid');
    assert.equal(h.clock.configure({ initialTimeMs: 3000, incrementMs: 100 }).snapshot.clockSessionId, 'clock:1');
    assert.equal(h.clock.reset().snapshot.clockSessionId, 'clock:2');
});

test('elapsed monotonic time, not frame count, charges only the active clock', () => {
    const h = harness();
    h.clock.configure({ initialTimeMs: 10000, activeColor: 'white' });
    h.clock.start();
    assert.equal(h.frames.size, 1);
    h.frame(137);
    h.frame(2537);
    const state = h.clock.getSnapshot();
    assert.equal(state.whiteRemainingMs, 7463);
    assert.equal(state.blackRemainingMs, 10000);
    assert.equal(h.frames.size, 1);
    assert.equal(h.clock.tick(2000).reasonCode, 'STALE_TICK');
});

test('start is idempotent and pause/resume freeze and rebase monotonic time', () => {
    const h = harness();
    h.clock.configure({ initialTimeMs: 5000, activeColor: 'white' });
    assert.equal(h.clock.start().status, 'started');
    assert.equal(h.clock.start().status, 'unchanged');
    assert.equal(h.frames.size, 1);
    h.setNow(1000);
    assert.equal(h.clock.pause().status, 'paused');
    assert.equal(h.clock.getSnapshot().whiteRemainingMs, 4000);
    assert.equal(h.frames.size, 0);
    h.setNow(9000);
    assert.equal(h.clock.resume().status, 'resumed');
    h.frame(9500);
    assert.equal(h.clock.getSnapshot().whiteRemainingMs, 3500);
});

test('switch charges once, applies increment once, changes side, and rejects duplicates', () => {
    const h = harness();
    h.clock.configure({ initialTimeMs: 10000, incrementMs: 500, activeColor: 'white' });
    h.clock.start();
    h.setNow(1000);
    const switched = h.clock.switchTurn({ movingColor: 'white', moveToken: '1:e2e4' });
    assert.equal(switched.status, 'switched');
    assert.equal(switched.snapshot.whiteRemainingMs, 9500);
    assert.equal(switched.snapshot.activeColor, 'black');
    assert.equal(h.clock.switchTurn({ movingColor: 'black', moveToken: '1:e2e4' }).reasonCode, 'DUPLICATE_SWITCH');
    assert.equal(h.clock.switchTurn({ movingColor: 'white', moveToken: '2:e7e5' }).reasonCode, 'INVALID_COLOR');
});

test('large elapsed delta clamps at zero, emits timeout once, and cancels the loop', () => {
    const h = harness();
    const events = [];
    h.clock.setBridge(event => events.push(event.event));
    h.clock.configure({ initialTimeMs: 1000, activeColor: 'white' });
    h.clock.start();
    h.frame(5000);
    assert.equal(h.clock.getSnapshot().whiteRemainingMs, 0);
    assert.equal(h.clock.getSnapshot().timedOutColor, 'white');
    assert.equal(h.clock.getSnapshot().running, false);
    assert.equal(h.frames.size, 0);
    assert.equal(events.filter(event => event === 'CLOCK_TIMED_OUT').length, 1);
    assert.equal(h.clock.tick(6000).status, 'unchanged');
});

test('stop, reset, and dispose cancel old RAF and disposal is terminal', () => {
    const h = harness();
    h.clock.configure({ initialTimeMs: 5000, activeColor: 'white' });
    h.clock.start();
    assert.equal(h.clock.stop('game-over').status, 'stopped');
    assert.equal(h.frames.size, 0);
    h.clock.start();
    assert.equal(h.clock.reset().status, 'reset');
    assert.equal(h.clock.getSnapshot().whiteRemainingMs, 5000);
    assert.equal(h.frames.size, 0);
    h.clock.start({ activeColor: 'white' });
    assert.equal(h.clock.dispose().status, 'disposed');
    assert.equal(h.frames.size, 0);
    assert.equal(h.clock.start().status, 'disposed');
});

test('formatter preserves legacy whole-second display boundaries', () => {
    const h = harness();
    assert.equal(h.api.formatClock(300000), '5:00');
    assert.equal(h.api.formatClock(59999), '1:00');
    assert.equal(h.api.formatClock(59000), '0:59');
    assert.equal(h.api.formatClock(1), '0:01');
    assert.equal(h.api.formatClock(0), '0:00');
});

test('static resource and ownership guardrails keep the service narrowly scoped', () => {
    assert.doesNotMatch(source, /\bsetInterval\s*\(/);
    assert.doesNotMatch(source, /\bnew\s+Worker\b/);
    assert.doesNotMatch(source, /\b(?:localStorage|sessionStorage)\b/);
    assert.doesNotMatch(source, /\bdocument\b/);
    assert.doesNotMatch(source, /\bApp\b/);
    assert.doesNotMatch(source, /\.game(?:\W|$)|\.board(?:\W|$)|gameResult/);
    const app = fs.readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
    assert.doesNotMatch(app, /function\s+clockTick\b/);
    assert.doesNotMatch(app, /requestAnimationFrame\s*\(\s*clockTick/);
    assert.doesNotMatch(app, /App\.(?:whiteTimeMs|blackTimeMs)\s*=\s*Math\.max/);
    const fics = fs.readFileSync(new URL('../../js/fics-client.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /FICS|Style12|Arena|Spectator/i);
    assert.ok(fics.length > 0);
    for (const pageName of ['index.html', 'yahoo-classic.html']) {
        const page = fs.readFileSync(new URL(`../../${pageName}`, import.meta.url), 'utf8');
        assert.equal((page.match(/js\/play\/clock-service\.js/g) || []).length, 1);
        assert.ok(page.indexOf('src="js/play/clock-service.js') < page.indexOf('src="app.js'));
    }
});
