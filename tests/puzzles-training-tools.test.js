import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { EngineMatch, PuzzleEngine, readablePrincipalVariation } from '../js/puzzles/engine.js';

test('Stockfish principal variations become readable SAN with move numbers', () => {
    const line = readablePrincipalVariation(
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        ['e2e4', 'e7e5', 'g1f3', 'b8c6'],
    );
    assert.deepEqual({ bestMove: line.bestMove, bestUci: line.bestUci }, { bestMove: 'e4', bestUci: 'e2e4' });
    assert.equal(line.variation, '1. e4 e5 2. Nf3 Nc6');
    assert.equal(readablePrincipalVariation('8/8/8/8/8/8/8/8 w - - 0 1', ['e2e4']), null);
});

test('PuzzleEngine emits a new PV for the active position and cancels bounded searches', () => {
    const originalWorker = globalThis.Worker;
    const workers = [];
    class FakeWorker {
        constructor() { this.commands = []; this.terminated = false; workers.push(this); }
        postMessage(command) { this.commands.push(command); }
        emit(line) { this.onmessage?.({ data: line }); }
        terminate() { this.terminated = true; }
    }
    globalThis.Worker = FakeWorker;
    try {
        const updates = [];
        const engine = new PuzzleEngine(info => updates.push(info), () => {}, () => {});
        engine.start();
        workers[0].emit('uciok');
        workers[0].emit('readyok');
        const firstFen = '8/8/8/8/8/8/4k3/6K1 w - - 0 1';
        const secondFen = '8/8/8/8/8/5k2/8/6K1 w - - 1 2';
        engine.analyze(firstFen);
        workers[0].emit('info depth 8 score cp 24 pv g1f1 e2f3');
        engine.analyze(secondFen);
        workers[0].emit('info depth 10 score cp -12 pv g1f1 f3g3');
        assert.deepEqual(updates.map(update => [update.depth, update.fen, update.pv[0]]), [
            [8, firstFen, 'g1f1'], [10, secondFen, 'g1f1'],
        ]);
        assert.ok(workers[0].commands.includes(`position fen ${secondFen}`));
        engine.cancel();
        assert.equal(engine.search, null);
        engine.stop();
        assert.equal(workers[0].terminated, true);
    } finally {
        globalThis.Worker = originalWorker;
    }
});

test('a terminated Stockfish worker cannot stop its replacement with a late error', () => {
    const originalWorker = globalThis.Worker;
    const workers = [];
    class FakeWorker {
        constructor() { this.commands = []; this.terminated = false; workers.push(this); }
        postMessage(command) { this.commands.push(command); }
        emitError() { this.onerror?.(new Error('late worker error')); }
        terminate() { this.terminated = true; }
    }
    globalThis.Worker = FakeWorker;
    try {
        const errors = [];
        const engine = new PuzzleEngine(() => {}, () => {}, error => errors.push(error));
        engine.start();
        const first = workers[0];
        const staleError = first.onerror;
        engine.stop();
        engine.start();
        const replacement = workers[1];
        staleError(new Error('late worker error'));
        assert.equal(engine.worker, replacement);
        assert.equal(replacement.terminated, false);
        assert.deepEqual(errors, []);
        engine.stop();
    } finally {
        globalThis.Worker = originalWorker;
    }
});

test('EngineMatch alternates both engines, pauses, resumes, and stops at its ply limit', () => {
    const instances = [];
    const scheduled = [];
    const states = [];
    const updates = [];
    const engineFactory = callbacks => {
        const fake = {
            callbacks, requests: [], started: false, stopped: false, cancelled: false,
            start() { this.started = true; },
            play(fen) { this.requests.push(fen); },
            cancel() { this.cancelled = true; },
            stop() { this.stopped = true; },
            move(uci) { this.callbacks.onMove(uci); },
        };
        instances.push(fake);
        return fake;
    };
    const match = new EngineMatch({
        engineFactory, maxPlies: 2,
        schedule: callback => { const timer = { callback, cancelled: false }; scheduled.push(timer); return timer; },
        cancelSchedule: timer => { timer.cancelled = true; },
        onState: state => states.push(state.status),
        onUpdate: snapshot => updates.push(snapshot),
    });
    match.start('8/8/8/8/8/8/4k3/R5K1 w - - 0 1');
    assert.equal(instances[0].requests.length, 1);
    instances[0].move('a1a2');
    assert.equal(updates.at(-1).moves[0], 'Ra2+');
    assert.equal(match.pause(), true);
    assert.ok(instances.every(instance => instance.cancelled));
    assert.equal(match.resume(), true);
    assert.equal(instances[1].requests.length, 1);
    instances[1].move('e2f3');
    assert.equal(updates.at(-1).plyCount, 2);
    assert.equal(states.at(-1), 'finished');
    assert.ok(instances.every(instance => instance.stopped));
});

test('training exploration has no path to the session rating reducer', () => {
    const page = fs.readFileSync(new URL('../js/puzzles/page.js', import.meta.url), 'utf8');
    const updateMatch = page.slice(page.indexOf('function updateEngineMatch('), page.indexOf('function updateEngineMatchState('));
    const startMatch = page.slice(page.indexOf('function startEngineMatch('), page.indexOf('function restorePuzzleDisplay('));
    assert.doesNotMatch(`${updateMatch}\n${startMatch}`, /recordSessionOutcome|recordOutcome|state\.progress\s*=/);
});
