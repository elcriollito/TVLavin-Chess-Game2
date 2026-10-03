import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../js/insights/core.js';
import '../js/insights/engine-analysis.js';

test('batch consumes principal scores through the actual attributed EngineAdapter UCI contract', async () => {
    class TranscriptWorker {
        postMessage(command) {
            const lines = command === 'uci'
                ? ['id name Stockfish 18 Lite WASM', 'id author the Stockfish developers (see AUTHORS file)', 'uciok']
                : command === 'isready' ? ['readyok']
                : command.startsWith('go') ? ['info depth 12 multipv 1 score cp 25 nodes 100 pv e2e4',
                    'info depth 12 multipv 3 score cp 900 nodes 100 pv d2d4', 'bestmove e2e4'] : [];
            for (const line of lines) queueMicrotask(() => this.onmessage?.({ data: line }));
        }
        terminate() { this.onmessage = null; }
    }
    const context = vm.createContext({ Worker: TranscriptWorker, queueMicrotask, setTimeout, clearTimeout, Date,
        console: { warn() {}, log() {} }, window: { location: { pathname: '/insights' }, dispatchEvent() {} },
        CustomEvent: class CustomEvent {} });
    vm.runInContext(fs.readFileSync(new URL('../js/engine-adapter.js', import.meta.url), 'utf8'), context);
    vm.runInContext(fs.readFileSync(new URL('../js/engine-registry.js', import.meta.url), 'utf8'), context);
    const engine = context.window.EngineRegistry.createAnalyzeEngine('stockfish-18-lite', { autoStart: false });
    const session = globalThis.CaissaInsightsAnalysis.createSession({ engineFactory: () => engine });
    try {
        const first = await session.evaluate(globalThis.CaissaInsightsCore.START_FEN);
        assert.equal(first.status, 'complete'); assert.equal(first.cp, 25); assert.equal(first.depth, 12);
        const second = await session.evaluate(globalThis.CaissaInsightsCore.START_FEN);
        assert.equal(second.status, 'complete'); assert.equal(second.cp, 25); assert.notEqual(first.generationId, second.generationId);
        assert.equal(engine.onInfo, null); assert.equal(engine.onBestMove, null);
    } finally { session.dispose(); }
});
