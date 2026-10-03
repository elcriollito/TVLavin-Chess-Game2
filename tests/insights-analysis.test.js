import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../assets/vendor/chess.js/chess-1.4.0.esm.js';
import '../js/insights/core.js';
import '../js/insights/engine-analysis.js';
const core = globalThis.CaissaInsightsCore, analysis = globalThis.CaissaInsightsAnalysis;
const fixture = '[Event "Synthetic"]\n[White "Alex"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0';
function engineHarness(script) {
    let calls = [], terminated = 0, cancelled = 0;
    const sentinels = { onInfo() {}, onBestMove() {} };
    const engine = { ...sentinels, start: async () => {}, isReady: () => true, setMultiPV(n) { assert.equal(n, 1); },
        getBestMoveAttributed(fen, callback, options) {
            assert.equal(engine.onInfo, sentinels.onInfo);
            const id = `request:${calls.length + 1}`; calls.push({ fen, callback, options: { ...options, infoCallback: options.onInfo }, id });
            queueMicrotask(() => script?.(calls.at(-1), calls.length - 1)); return id;
        }, cancelAttributedSearch() { cancelled++; }, terminate() { terminated++; },
        getRuntimeIdentity: () => ({ providerId: 'stockfish-18-lite', reportedUciName: 'Test engine' }) };
    return { engine, calls, sentinels, terminated: () => terminated, cancelled: () => cancelled };
}
function respond(request, score = 0) {
    const move = new Chess(request.fen).moves({ verbose: true })[0];
    const uci = `${move.from}${move.to}${move.promotion || ''}`;
    request.options.infoCallback({ multipv: 1, score, mate: null, depth: 12, nodes: 123, pv: [uci] }, request.id);
    request.callback(uci, null, request.id);
}
test('MultiPV alternatives, bound scores and wrong request IDs cannot overwrite the principal score', async () => {
    const h = engineHarness(r => {
        r.options.infoCallback({ multipv: 1, score: .2, depth: 12, nodes: 123, pv: ['e2e4'] }, r.id);
        r.options.infoCallback({ multipv: 3, score: 9, depth: 12, pv: ['d2d4'] }, r.id);
        r.options.infoCallback({ multipv: 1, score: 8, depth: 13, rawLine: 'score cp 800 lowerbound', pv: ['c2c4'] }, r.id);
        r.options.infoCallback({ multipv: 1, score: 7, depth: 13, pv: ['g1f3'] }, 'stale');
        r.callback('e2e4', null, r.id);
    });
    const session = analysis.createSession({ engineFactory: () => h.engine });
    const result = await session.evaluate(core.START_FEN); assert.equal(result.cp, 20); assert.equal(result.bestMove, 'e2e4');
    assert.equal(h.engine.onInfo, h.sentinels.onInfo); assert.equal(h.engine.onBestMove, h.sentinels.onBestMove); session.dispose(); assert.equal(h.terminated(), 1);
});
test('timeout is unavailable and a late result cannot become the next position result', async () => {
    const h = engineHarness((r, i) => { if (i === 1) respond(r, .5); });
    const session = analysis.createSession({ engineFactory: () => h.engine, policy: { perPositionMs: 10 } });
    const first = await session.evaluate(core.START_FEN); assert.equal(first.cp, null); assert.equal(first.reason, 'ENGINE_TIMEOUT');
    const next = session.evaluate(core.START_FEN); respond(h.calls[0], 99);
    assert.equal((await next).cp, 50); session.dispose();
});
test('cancellation settles pending evaluation and terminates only the owned engine', async () => {
    const h = engineHarness(), controller = new AbortController();
    const session = analysis.createSession({ engineFactory: () => h.engine, signal: controller.signal });
    const pending = session.evaluate(core.START_FEN); await new Promise(resolve => setTimeout(resolve, 0)); controller.abort();
    await assert.rejects(pending, { name: 'AbortError' }); session.dispose(); assert.equal(h.terminated(), 1); assert.ok(h.cancelled());
});
test('cancelling during engine startup does not wait for a handshake timeout', async () => {
    const h = engineHarness(), controller = new AbortController(); h.engine.isReady = () => false; h.engine.start = () => new Promise(() => {});
    const session = analysis.createSession({ engineFactory: () => h.engine, signal: controller.signal });
    const pending = session.evaluate(core.START_FEN); controller.abort(); await assert.rejects(pending, { name: 'AbortError' }); session.dispose();
});
test('one legal game uses N+1 positions and only target-player losses become moments', async () => {
    const h = engineHarness((r, i) => respond(r, [0, -2, -2, 1, 1][i]));
    const dataset = core.parse(fixture, { username: 'Alex' }, Chess);
    const report = await analysis.generate(dataset, 1, 'both', { Chess, engineFactory: () => h.engine });
    assert.equal(h.calls.length, 5); assert.equal(report.moments.length, 1); assert.equal(report.moments[0].ply, 0);
    assert.equal(report.moments[0].playerColor, 'w'); assert.equal(report.aggregate.coverage.evaluated, 2); assert.equal(report.analysisStatus, 'complete');
    assert.equal(h.terminated(), 1);
});
test('no engine produces honest unavailable coverage with real W/D/L', async () => {
    const dataset = core.parse(fixture, { username: 'Alex' }, Chess);
    const report = await analysis.generate(dataset, 1, 'both', { Chess, engineFactory: () => null });
    assert.equal(report.analysisStatus, 'unavailable'); assert.equal(report.aggregate.coverage.evaluated, 0);
    assert.equal(report.aggregate.wld.wins, 1); assert.equal(report.aggregate.avgMomentsPerGame, null); assert.equal(report.moments.length, 0);
});
test('a session time budget preserves unavailable moves in the denominator', async () => {
    const dataset = core.parse(fixture, { username: 'Alex' }, Chess), h = engineHarness(respond);
    const report = await analysis.generate(dataset, 1, 'both', { Chess, engineFactory: () => h.engine, policy: { runMs: 0 } });
    assert.equal(report.aggregate.coverage.eligible, 2); assert.equal(report.aggregate.coverage.evaluated, 0); assert.equal(report.analysisStatus, 'unavailable');
});
test('batch analysis begins at a PGN custom FEN, with the correct target color', async () => {
    const fen = 'r3k2r/pppp1ppp/2n5/4p3/4P3/2N5/PPPP1PPP/R3K2R b KQkq - 0 20';
    const data = core.parse(`[Event "FEN"]\n[White "B"]\n[Black "Alex"]\n[SetUp "1"]\n[FEN "${fen}"]\n[Result "*"]\n20... Nd4 21. Nb5 *`, { username: 'Alex' }, Chess);
    const h = engineHarness(respond); await analysis.generate(data, 1, 'black', { Chess, engineFactory: () => h.engine }); assert.equal(h.calls[0].fen, fen);
});
test('continuing a partial report reuses only completed positions from the same source', async () => {
    const dataset = core.parse(fixture, { username: 'Alex' }, Chess), initial = engineHarness(r => respond(r));
    const previous = await analysis.generate(dataset, 1, 'both', { Chess, engineFactory: () => initial.engine });
    previous.analyses[0].evaluations[2] = { status: 'unavailable', reason: 'ENGINE_TIMEOUT' };
    const resumed = engineHarness(r => respond(r));
    const report = await analysis.generate(dataset, 1, 'both', { Chess, engineFactory: () => resumed.engine, previousReport: previous, previousDataset: dataset });
    assert.equal(resumed.calls.length, 1); assert.equal(report.reusedPositions, 4); assert.equal(report.aggregate.coverage.evaluated, 2); assert.equal(report.analysisStatus, 'complete');
    const changed = core.parse(fixture.replace('e4 e5', 'd4 d5'), { username: 'Alex' }, Chess), fresh = engineHarness(r => respond(r));
    await analysis.generate(changed, 1, 'both', { Chess, engineFactory: () => fresh.engine, previousReport: previous, previousDataset: dataset });
    assert.equal(fresh.calls.length, 5);
});
test('progress counts real positions and retains the selected-game denominator', async () => {
    const dataset = core.parse(fixture, { username: 'Alex' }, Chess), h = engineHarness(r => respond(r)), progress = [];
    await analysis.generate(dataset, 1, 'both', { Chess, engineFactory: () => h.engine, onProgress: (percent, text, detail) => progress.push({ percent, text, detail }) });
    assert.equal(progress.length, 5); assert.equal(progress.at(-1).percent, 100); assert.equal(progress.at(-1).detail.totalPositions, 5);
    assert.match(progress.at(-1).text, /Game 1\/1.*5\/5 positions processed/);
});
