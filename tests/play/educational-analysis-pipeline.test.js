import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Chess } from 'chess.js';

const files = [
    'js/play/game-record.js', 'js/play/fair-play-policy.js',
    'js/mentor/mentor-capabilities.js', 'js/mentor/mentor-registry.js',
    'js/mentor/mentor-selection-resolver.js', 'js/mentor/mentor-review-request.js',
    'js/mentor/mentor-review-request-registry.js', 'js/mentor/educational-analysis-policy.js',
    'js/mentor/educational-analysis-contracts.js', 'js/mentor/educational-engine-analysis.js',
    'js/mentor/educational-analysis-pipeline.js'
];
const sources = files.map(file => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));
const plain = value => JSON.parse(JSON.stringify(value));
function load() {
    const window = {
        Chess, setTimeout, clearTimeout,
        crypto: { randomUUID: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' },
        CaissaBotRegistry: { get: id => id === 'bot:test' ? { id } : null }
    };
    const context = { window, globalThis: window, Object, WeakSet, Set, Map, Date, Math, JSON,
        Promise, setTimeout, clearTimeout };
    sources.forEach(source => vm.runInNewContext(source, context));
    return window;
}
function record(w, opponent = { type: 'engine', id: 'bot:test' }) {
    const snapshot = {
        schemaVersion: 'fixture', capturedAt: '2026-07-28T12:00:00.000Z',
        mode: 'engine', selectedOpponent: opponent.id, playerColor: 'white',
        game: { active: false, result: '1-0', status: { state: 'checkmate' }, pendingPromotion: null },
        position: {
            fen: 'r1bqkbnr/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4',
            pgn: '[Result "1-0"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0',
            moveHistory: ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'], moveCount: 7
        },
        clocks: { whiteMilliseconds: 1000, blackMilliseconds: 900,
            timeControlSeconds: 300, running: false },
        evaluation: { available: false }, section: 'play'
    };
    const built = w.CaissaGameRecord.buildFromSnapshot(snapshot, { recordId: `local-play:${opponent.type}` });
    if (opponent.type === 'coach') {
        const mutable = plain(built); mutable.opponent.type = 'coach'; mutable.opponent.id = 'coach:test';
        return deepFreeze(mutable);
    }
    return built;
}
function deepFreeze(value) {
    if (value && typeof value === 'object') {
        Object.values(value).forEach(deepFreeze); Object.freeze(value);
    }
    return value;
}
const requestOptions = {
    mentorId: 'academyMentorCaissa', playerLevel: 'novice', focus: 'general',
    analysisDepth: 'quick', criticalMomentLimit: 3, explanationStyle: 'balanced',
    knowledgeReleaseId: 'rel-58b238dfdda8f295fdab023cead6bf069aceefbee74a64a5cd71af2202480a84'
};
function register(w, sourceType = 'play-game', sourceRecord = record(w)) {
    const made = w.CaissaMentorReviewRequest.fromGameRecord(sourceRecord, { ...requestOptions, sourceType });
    return w.CaissaMentorReviewRequestRegistry.register(made).value;
}
function fakeEngine(overrides = {}) {
    return {
        async analyze(position) {
            return { ok: true, reasonCode: 'ENGINE_RESULT', value: {
                score: position.ply % 2 ? 0.25 : -0.1, mate: null,
                pv: ['e2e4', 'e7e5'], depth: 8, nodes: 1000, bestMove: 'e2e4', elapsedMs: 2
            } };
        },
        cancel() { return { ok: true }; }, dispose() { return { ok: true }; },
        inspect() { return { activeSearches: 0, engineInstances: 1, workerPoolSize: 0 }; },
        ...overrides
    };
}

test('pipeline publishes immutable versioned stages, statuses, APIs and bounded policies', () => {
    const w = load();
    assert.equal(w.CaissaEducationalAnalysisPipeline.schemaVersion, '1.0.0');
    assert.deepEqual(plain(w.CaissaEducationalAnalysisPolicy.depths), ['quick', 'standard', 'deep']);
    assert.ok(Object.isFrozen(w.CaissaEducationalAnalysisPipeline.stages));
    for (const depth of ['quick', 'standard', 'deep']) {
        const policy = w.CaissaEducationalAnalysisPolicy.resolve(depth).value;
        assert.equal(policy.concurrency, 1); assert.equal(policy.multiPv, 1);
        assert.ok(policy.maximumPositions <= 32);
    }
    const mobile = w.CaissaEducationalAnalysisPolicy.resolve('deep', { mobile: true }).value;
    assert.equal(mobile.mobileAdjustment, 'reduced');
    assert.ok(mobile.maximumPositions < w.CaissaEducationalAnalysisPolicy.profiles.deep.maximumPositions);
    assert.equal(w.CaissaEducationalAnalysisPolicy.resolve('raw-uci').reasonCode, 'POLICY_INVALID');
});

test('completed Games, Bot and Coach requests prepare and produce technical-only envelopes', async () => {
    for (const [sourceType, opponent] of [
        ['play-game', { type: 'engine', id: null }],
        ['bot-game', { type: 'engine', id: 'bot:test' }],
        ['coach-game', { type: 'coach', id: 'coach:test' }]
    ]) {
        const w = load(); const request = register(w, sourceType, record(w, opponent));
        const pipeline = w.CaissaEducationalAnalysisPipeline.create({ engine: fakeEngine() });
        const prepared = pipeline.prepare(request.requestId);
        assert.equal(prepared.ok, true, sourceType);
        assert.equal(prepared.value.progress.totalPositions, 8);
        const completed = await pipeline.start(prepared.value.runId);
        assert.equal(completed.status, 'completed');
        assert.equal(completed.value.progress.percentage, 100);
        const result = pipeline.getResult(prepared.value.runId);
        assert.equal(result.summary.positionsCompleted, 8);
        assert.equal(result.capabilities.criticalMoments, false);
        assert.equal(result.capabilities.errorClassification, false);
        assert.equal(result.capabilities.mentorExplanation, false);
        assert.equal(result.capabilities.recommendations, false);
        assert.doesNotMatch(JSON.stringify(result), /moveGrade|strengths|weaknesses|mentorText/i);
        assert.ok(Object.isFrozen(result.positions[0]));
    }
});

test('imported Analyze source resolves through an approved injected boundary without mutating Analyze', async () => {
    const w = load();
    const made = w.CaissaMentorReviewRequest.fromAnalyzeSession({
        analyzeSessionId: 'analyze-session:fixture', imported: true
    }, requestOptions);
    const request = w.CaissaMentorReviewRequestRegistry.register(made).value;
    const imported = deepFreeze({ analyzeSessionId: 'analyze-session:fixture', imported: true,
        initialFen: null, moves: ['e4', 'e5'], pgn: '1. e4 e5 *', result: '*',
        termination: null, playerColor: null, mode: 'analysis' });
    const pipeline = w.CaissaEducationalAnalysisPipeline.create({
        engine: fakeEngine(),
        importedSourceResolver: id => ({ ok: id === imported.analyzeSessionId, value: imported })
    });
    const prepared = pipeline.prepare(request.requestId);
    assert.equal(prepared.ok, true);
    assert.equal((await pipeline.start(prepared.value.runId)).status, 'completed');
    assert.equal(pipeline.getResult(prepared.value.runId).source.type, 'imported-game');
});

test('source normalization preserves custom FEN/mismatch and legal replay is deterministic and sampled', () => {
    const w = load(); const source = record(w); const request = register(w, 'play-game', source);
    const payload = w.CaissaMentorReviewRequestRegistry.getSourcePayload(request.requestId).value;
    const normalized = w.CaissaEducationalAnalysisContracts.normalizeSource(request, payload);
    assert.equal(normalized.value.hasResultMismatch, false);
    const positions = w.CaissaEducationalAnalysisContracts.generatePositions(normalized.value,
        { maximumPositions: 4 }, Chess);
    assert.equal(positions.ok, true); assert.equal(positions.value.length, 4);
    assert.equal(positions.value[0].ply, 0); assert.equal(positions.value.at(-1).ply, 7);
    const malformed = { ...plain(normalized.value), moves: ['not-a-move'] };
    assert.equal(w.CaissaEducationalAnalysisContracts.generatePositions(malformed,
        { maximumPositions: 4 }, Chess).reasonCode, 'POSITION_REPLAY_FAILED');
});

test('position result normalization is White-relative, mate-aware, bounded and stale-safe', () => {
    const w = load(); const c = { runId: 'ear_test', positionId: 'position:1', ply: 1 };
    const cp = w.CaissaEducationalAnalysisContracts.normalizePositionResult({
        score: 0.75, mate: null, pv: Array(30).fill('e2e4'), depth: 12, nodes: 20,
        bestMove: 'e2e4', elapsedMs: 4
    }, c).value;
    assert.equal(cp.evaluation.cp, 75); assert.equal(cp.evaluation.perspective, 'white');
    assert.equal(cp.principalVariation.length, 16);
    const mate = w.CaissaEducationalAnalysisContracts.normalizePositionResult({
        score: null, mate: -3, pv: ['e2e4'], bestMove: 'e2e4'
    }, c).value;
    assert.equal(mate.evaluation.type, 'mate'); assert.equal(mate.evaluation.mate, -3);
    assert.equal(w.CaissaEducationalAnalysisContracts.normalizePositionResult({ stale: true }, c)
        .reasonCode, 'STALE_ENGINE_RESPONSE');
    assert.equal(w.CaissaEducationalAnalysisContracts.normalizePositionResult(
        JSON.parse('{"__proto__":{"polluted":true}}'), c).reasonCode, 'RESULT_NORMALIZATION_FAILED');
    assert.equal({}.polluted, undefined);
});

test('one-run concurrency, cancellation, stale completion, timeout, disposal and diagnostics are bounded', async () => {
    const w = load(); const firstRequest = register(w);
    let release;
    const delayed = fakeEngine({
        analyze: () => new Promise(resolve => { release = resolve; }),
        cancel: () => { release?.({ ok: false, reasonCode: 'RUN_CANCELED', value: null }); return { ok: true }; }
    });
    const pipeline = w.CaissaEducationalAnalysisPipeline.create({ engine: delayed });
    const first = pipeline.prepare(firstRequest.requestId);
    const starting = pipeline.start(first.value.runId);
    const second = pipeline.prepare(firstRequest.requestId);
    assert.equal((await pipeline.start(second.value.runId)).reasonCode, 'ACTIVE_RUN_EXISTS');
    assert.equal(pipeline.cancel(first.value.runId, 'user').status, 'canceled');
    const canceledStart = await starting;
    assert.equal(canceledStart.status, 'canceled', JSON.stringify(canceledStart));
    assert.equal(pipeline.getResult(first.value.runId), null);
    assert.equal(pipeline.getSnapshot(first.value.runId).progress.percentage, 0);
    const timeoutPipeline = w.CaissaEducationalAnalysisPipeline.create({
        engine: fakeEngine({ analyze: async () => ({ ok: false, reasonCode: 'ENGINE_TIMEOUT' }) })
    });
    const timed = timeoutPipeline.prepare(firstRequest.requestId);
    assert.equal((await timeoutPipeline.start(timed.value.runId)).status, 'timed-out');
    assert.equal(timeoutPipeline.disposeRun(timed.value.runId).status, 'disposed');
    assert.equal(timeoutPipeline.inspect().storageWrites, 0);
    assert.equal(pipeline.inspect().engine.workerPoolSize, 0);
    assert.equal(pipeline.dispose().status, 'disposed');
});

test('active/incomplete requests fail closed before engine analysis', () => {
    const w = load();
    const active = plain(record(w)); active.status = 'in-progress'; active.result.complete = false;
    assert.equal(w.CaissaMentorReviewRequest.fromGameRecord(deepFreeze(active), requestOptions)
        .reasonCode, 'INCOMPLETE_GAME');
    const pipeline = w.CaissaEducationalAnalysisPipeline.create({ engine: fakeEngine() });
    assert.equal(pipeline.prepare('missing-request').reasonCode, 'INVALID_REQUEST');
});

test('static pipeline boundary has no DOM, storage, Memory, Mastery, grading, prose or worker pool', () => {
    const text = sources.slice(7).join('\n');
    assert.doesNotMatch(text, /document\.|innerHTML|localStorage|sessionStorage|indexedDB|fetch\s*\(/i);
    assert.doesNotMatch(text, /TrainingMemory|Mastery|CaissaAcademy|classifyMove|buildMentorText/i);
    assert.doesNotMatch(text, /new\s+Worker|critical-moment-selection|error-classification|knowledge-mapping/i);
});
