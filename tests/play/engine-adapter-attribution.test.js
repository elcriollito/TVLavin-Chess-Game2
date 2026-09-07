import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(
    new URL('../../js/engine-adapter.js', import.meta.url),
    'utf8'
);

function fixture(generationIds = []) {
    const workers = [];
    class FakeWorker {
        constructor(url) {
            this.url = url;
            this.messages = [];
            this.terminateCalls = 0;
            this.onmessage = null;
            workers.push(this);
        }
        postMessage(message) {
            this.messages.push(String(message));
        }
        emit(message) {
            this.onmessage?.({ data: message });
        }
        terminate() {
            this.terminateCalls += 1;
        }
    }
    const window = {
        location: { pathname: '/index.html' },
        Worker: FakeWorker,
        WebAssembly: {},
        CAISSA_DEBUG: false
    };
    vm.runInNewContext(source, {
        window,
        Worker: FakeWorker,
        WebAssembly: window.WebAssembly,
        setTimeout: () => 1,
        clearTimeout: () => {},
        console
    });
    let index = 0;
    const adapter = new window.EngineAdapter({
        generationIdFactory: () => generationIds[index++]
    });
    const worker = workers[0];
    const dispatcher = worker.onmessage;
    worker.emit('uciok');
    worker.emit('readyok');
    return { adapter, worker, dispatcher, workers };
}

test('stable dispatcher rejects old bestmove until the readiness barrier activates the new generation', () => {
    const { adapter, worker, dispatcher, workers } = fixture(['generation:a', 'generation:b']);
    const delivered = [];
    assert.equal(adapter.getBestMoveAttributed('fen-a w', move => delivered.push(['a', move])), 'generation:a:1');
    assert.equal(adapter.getBestMoveAttributed('fen-b w', move => delivered.push(['b', move])), 'generation:b:2');
    assert.equal(worker.onmessage, dispatcher);
    assert.equal(worker.messages.at(-1), 'stop');

    worker.emit('bestmove e7e5');
    assert.equal(worker.messages.at(-1), 'isready');
    assert.deepEqual(delivered, []);
    assert.equal(adapter.inspectAttribution().pendingGenerationId, 'generation:b:2');

    worker.emit('readyok');
    worker.emit('bestmove c7c5');
    worker.emit('bestmove d7d5');
    assert.deepEqual(delivered, [['b', 'c7c5']]);
    assert.equal(adapter.inspectAttribution().activeOperationCount, 0);
    assert.equal(adapter.inspectAttribution().diagnostics.rejectedRawMessages, 2);
    assert.equal(workers.length, 1);
});

test('old info, initialization, malformed, cancellation, and terminal generations cannot borrow current identity', () => {
    const { adapter, worker } = fixture(['analysis:a', 'analysis:b', 'analysis:c']);
    const delivered = [];
    adapter.startAnalysisAttributed('fen-a w', info => delivered.push(['a', info.score]));
    adapter.startAnalysisAttributed('fen-b w', info => delivered.push(['b', info.score]));

    worker.emit('info depth 12 score cp 900 pv e2e4');
    worker.emit('id name ignored');
    worker.emit('bestmove (none)');
    assert.deepEqual(delivered, []);

    worker.emit('readyok');
    worker.emit('info depth 12 score cp 125 pv e2e4');
    assert.deepEqual(delivered, [['b', 1.25]]);

    assert.equal(adapter.cancelAttributedSearch(), true);
    worker.emit('info depth 12 score cp 500 pv e2e4');
    assert.deepEqual(delivered, [['b', 1.25]]);
    worker.emit('readyok');

    adapter.startAnalysisAttributed('fen-c w', info => delivered.push(['c', info.score]));
    adapter.newGame();
    worker.emit('info depth 12 score cp 700 pv e2e4');
    worker.emit('readyok');
    assert.deepEqual(delivered, [['b', 1.25]]);
    assert.ok(adapter.inspectAttribution().activeOperationCount <= 2);
    assert.equal(adapter.inspectAttribution().diagnostics.canceled, 2);
    assert.equal(worker.terminateCalls, 0);
});

test('termination cleans bounded operation state and delegates to the existing worker once', () => {
    const { adapter, worker } = fixture(['generation:a', 'generation:b']);
    adapter.getBestMoveAttributed('fen-a w', () => {});
    adapter.getBestMoveAttributed('fen-b w', () => {});
    assert.equal(adapter.inspectAttribution().activeOperationCount, 1);
    adapter.terminate();
    assert.equal(adapter.inspectAttribution().activeOperationCount, 0);
    assert.equal(adapter.inspectAttribution().barrierPending, false);
    assert.equal(worker.terminateCalls, 1);
});

test('a completed generation cannot lend duplicate terminal output to the next generation', () => {
    const { adapter, worker } = fixture(['generation', 'generation']);
    const delivered = [];
    assert.equal(adapter.getBestMoveAttributed('fen-a w', move => delivered.push(['a', move])), 'generation:1');
    worker.emit('bestmove e7e5');
    assert.deepEqual(delivered, [['a', 'e7e5']]);

    assert.equal(adapter.getBestMoveAttributed('fen-b w', move => delivered.push(['b', move])), 'generation:2');
    worker.emit('bestmove d7d5');
    assert.deepEqual(delivered, [['a', 'e7e5']]);
    worker.emit('readyok');
    worker.emit('bestmove c7c5');
    assert.deepEqual(delivered, [['a', 'e7e5'], ['b', 'c7c5']]);
});

test('one attributed MultiPV operation returns a bounded scored candidate set and restores engine configuration', () => {
    const { adapter, worker } = fixture(['candidates']);
    const delivered = [];
    assert.equal(adapter.getCandidatesAttributed('fen-a w', (candidates, generation) =>
        delivered.push({ candidates: JSON.parse(JSON.stringify(candidates)), generation }),
    { depth: 8, candidateCount: 3 }), 'candidates:1');
    assert.deepEqual(worker.messages.slice(-3), [
        'setoption name MultiPV value 3', 'position fen fen-a w', 'go depth 8'
    ]);
    worker.emit('info depth 8 multipv 2 score cp 20 pv d2d4 d7d5');
    worker.emit('info depth 7 multipv 1 score cp 40 pv e2e4 e7e5');
    worker.emit('info depth 8 multipv 1 score cp 45 pv e2e4 e7e5');
    worker.emit('info depth 8 multipv 3 score mate 4 pv g1f3');
    worker.emit('bestmove e2e4');
    assert.deepEqual(delivered, [{ generation: 'candidates:1', candidates: [
        { move: 'e2e4', multipv: 1, depth: 8, score: 0.45, mate: null, pv: ['e2e4', 'e7e5'] },
        { move: 'd2d4', multipv: 2, depth: 8, score: 0.2, mate: null, pv: ['d2d4', 'd7d5'] },
        { move: 'g1f3', multipv: 3, depth: 8, score: null, mate: 4, pv: ['g1f3'] }
    ] }]);
    assert.equal(worker.messages.at(-1), 'setoption name MultiPV value 1');
    assert.equal(adapter.inspectAttribution().activeOperationCount, 0);
});

test('one attributed infinite MultiPV operation streams info until cancellation without a search deadline', () => {
    const { adapter, worker, workers } = fixture(['infinite:a', 'infinite:b']);
    const delivered = [];
    assert.equal(adapter.startInfiniteAnalysisAttributed('fen-a w', (info, generation) =>
        delivered.push({ depth: info.depth, multipv: info.multipv, generation }), { multiPv: 4 }), 'infinite:a:1');
    assert.deepEqual(worker.messages.slice(-3), [
        'setoption name MultiPV value 4', 'position fen fen-a w', 'go infinite'
    ]);
    assert.equal(adapter.searchTimer, null);
    worker.emit('info depth 4 multipv 1 score cp 20 pv e2e4 e7e5');
    worker.emit('info depth 7 multipv 2 score cp 10 pv d2d4 d7d5');
    assert.deepEqual(delivered, [
        { depth: 4, multipv: 1, generation: 'infinite:a:1' },
        { depth: 7, multipv: 2, generation: 'infinite:a:1' }
    ]);

    assert.equal(adapter.startInfiniteAnalysisAttributed('fen-b w', (info, generation) =>
        delivered.push({ depth: info.depth, multipv: info.multipv, generation }), { multiPv: 4 }), 'infinite:b:2');
    assert.equal(worker.messages.at(-1), 'stop');
    worker.emit('info depth 20 multipv 1 score cp 900 pv a2a4');
    assert.equal(delivered.length, 2);
    worker.emit('bestmove e2e4');
    assert.equal(worker.messages.at(-1), 'isready');
    worker.emit('readyok');
    assert.deepEqual(worker.messages.slice(-3), [
        'setoption name MultiPV value 4', 'position fen fen-b w', 'go infinite'
    ]);
    worker.emit('info depth 5 multipv 1 score cp 30 pv c2c4 e7e5');
    assert.deepEqual(delivered.at(-1), { depth: 5, multipv: 1, generation: 'infinite:b:2' });

    assert.equal(adapter.cancelAttributedSearch(), true);
    assert.equal(worker.messages.at(-1), 'stop');
    worker.emit('info depth 30 multipv 1 score cp 999 pv h2h4');
    assert.equal(delivered.length, 3);
    worker.emit('bestmove c2c4');
    assert.deepEqual(worker.messages.slice(-2), ['setoption name MultiPV value 1', 'isready']);
    assert.equal(adapter.inspectAttribution().activeOperationCount, 0);
    assert.equal(workers.length, 1);
});
