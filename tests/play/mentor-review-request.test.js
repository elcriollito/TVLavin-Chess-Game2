import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const files = [
    'js/play/game-record.js', 'js/mentor/mentor-capabilities.js', 'js/mentor/mentor-registry.js',
    'js/mentor/mentor-selection-resolver.js', 'js/mentor/mentor-review-request.js',
    'js/mentor/mentor-review-request-registry.js'
];
const sources = files.map(file => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));
const plain = value => JSON.parse(JSON.stringify(value));
function load() {
    const window = {
        crypto: { randomUUID: () => '12345678-1234-4567-89ab-123456789abc' },
        CaissaBotRegistry: { get: id => id === 'bot:one' ? { id } : null }
    };
    const context = { window, globalThis: window, Object, WeakSet, Set, Map, Date, Math, JSON };
    sources.forEach(source => vm.runInNewContext(source, context));
    return window;
}
function record(w, { active = false, opponentId = 'bot:one', mismatch = false } = {}) {
    const result = active ? null : '1-0';
    const pgnResult = mismatch ? '0-1' : result;
    return w.CaissaGameRecord.buildFromSnapshot({
        schemaVersion: 'test', capturedAt: '2026-07-28T12:00:00.000Z',
        mode: 'engine', selectedOpponent: opponentId, playerColor: 'white',
        game: { active, result, status: { state: active ? 'active' : 'checkmate' }, pendingPromotion: null },
        position: {
            fen: '4k3/8/8/8/8/8/8/4K3 b - - 0 1',
            pgn: active ? '*' : `[Result "${pgnResult}"]\n\n1. e4 ${pgnResult}`,
            moveHistory: active ? [] : [{ color: 'w', from: 'e2', to: 'e4', san: 'e4', flags: 'b' }],
            moveCount: active ? 0 : 1
        },
        clocks: { whiteMilliseconds: 1000, blackMilliseconds: 1000, running: false, timeControlSeconds: 300 },
        evaluation: { available: false }, board: { orientation: 'white' }, section: 'play'
    }, { recordId: `local-play:${active ? 'active' : mismatch ? 'mismatch' : opponentId.replace(':', '-')}` });
}
const options = {
    mentorId: 'academyMentorTal', playerLevel: 'intermediate', focus: 'tactics',
    analysisDepth: 'deep', criticalMomentLimit: 5, explanationStyle: 'socratic',
    knowledgeReleaseId: 'rel-58b238dfdda8f295fdab023cead6bf069aceefbee74a64a5cd71af2202480a84',
    createdAt: 1000, ttlMs: 10000, requestId: 'mrr_123456781234456789ab123456789abc'
};

test('contract is separately versioned, immutable, detached, JSON-safe, and contains intent only', () => {
    const w = load(); const source = record(w);
    const made = w.CaissaMentorReviewRequest.fromGameRecord(source, options);
    assert.equal(made.ok, true);
    assert.equal(made.value.schemaVersion, '1.0.0');
    assert.equal(made.value.requestVersion, 1);
    assert.equal(made.value.source.type, 'bot-game');
    assert.equal(made.value.mentor.id, 'academyMentorTal');
    assert.deepEqual(plain(made.value.review), {
        focus: 'tactics', analysisDepth: 'deep', criticalMomentLimit: 5, explanationStyle: 'socratic'
    });
    assert.equal(made.value.capabilities.educationalAnalysis, 'foundation');
    assert.equal(made.value.capabilities.criticalMoments, 'disabled');
    assert.equal(made.value.metadata.analysisStarted, false);
    assert.ok(Object.isFrozen(made.value.review));
    assert.ok(Object.isFrozen(made.sourcePayload));
    assert.notEqual(made.sourcePayload, source);
    assert.doesNotMatch(JSON.stringify(made.value), /"pgn"|"initialFen"|"finalFen"|evaluation/i);
    assert.doesNotThrow(() => JSON.stringify(made.value));
});

test('all completed Play sources normalize and active, incomplete, unsupported, hostile inputs fail closed', () => {
    const w = load();
    for (const sourceType of ['play-game', 'bot-game', 'coach-game']) {
        const made = w.CaissaMentorReviewRequest.fromGameRecord(record(w), { ...options, sourceType });
        assert.equal(made.value.source.type, sourceType);
    }
    assert.equal(w.CaissaMentorReviewRequest.fromGameRecord(record(w, { active: true }), options).reasonCode,
        'INCOMPLETE_GAME');
    assert.equal(w.CaissaMentorReviewRequest.fromGameRecord(record(w), { ...options, sourceType: 'academy-game' })
        .reasonCode, 'INVALID_SOURCE');
    assert.equal(w.CaissaMentorReviewRequest.fromGameRecord(record(w),
        JSON.parse('{"__proto__":{"polluted":true}}')).reasonCode, 'DANGEROUS_KEY');
    assert.equal({}.polluted, undefined);
});

test('imported Analyze boundary accepts only a bounded opaque imported session reference', () => {
    const w = load();
    const made = w.CaissaMentorReviewRequest.fromAnalyzeSession({
        analyzeSessionId: 'analyze-session:import-1', imported: true
    }, options);
    assert.equal(made.ok, true);
    assert.equal(made.value.source.type, 'imported-game');
    assert.equal(made.value.source.analyzeSessionId, 'analyze-session:import-1');
    assert.equal(made.value.game.completed, null);
    assert.equal(w.CaissaMentorReviewRequest.fromAnalyzeSession({
        analyzeSessionId: '../raw?pgn=1', imported: true
    }, options).reasonCode, 'INVALID_ANALYZE_SESSION');
    assert.equal(w.CaissaMentorReviewRequest.fromAnalyzeSession({
        analyzeSessionId: 'analyze-session:live', imported: true, activeHumanPlay: true
    }, options).reasonCode, 'INVALID_ANALYZE_SESSION');
});

test('Mentor resolution, vocabularies, release and versions are strict with safe defaults', () => {
    const w = load(); const source = record(w);
    const defaults = w.CaissaMentorReviewRequest.fromGameRecord(source, {
        academyMentorId: 'academyMentorDaisy', createdAt: 1000,
        requestId: 'mrr_abcdefghijklmno123456789'
    });
    assert.equal(defaults.value.mentor.resolutionSource, 'academy');
    assert.equal(defaults.value.learner.level, 'beginner');
    assert.equal(defaults.value.review.focus, 'general');
    assert.equal(defaults.value.review.analysisDepth, 'standard');
    assert.equal(defaults.value.review.criticalMomentLimit, 3);
    assert.equal(defaults.value.review.explanationStyle, 'balanced');
    for (const [key, value, reason] of [
        ['playerLevel', 'grandmaster', 'INVALID_LEARNER_LEVEL'],
        ['focus', 'prompt-injection', 'INVALID_REVIEW_FOCUS'],
        ['analysisDepth', 22, 'INVALID_ANALYSIS_DEPTH'],
        ['criticalMomentLimit', 500, 'INVALID_CRITICAL_MOMENT_LIMIT'],
        ['explanationStyle', 'free text', 'INVALID_EXPLANATION_STYLE'],
        ['knowledgeReleaseId', 'latest', 'KNOWLEDGE_RELEASE_REQUIRED']
    ]) assert.equal(w.CaissaMentorReviewRequest.fromGameRecord(source, { ...options, [key]: value }).reasonCode, reason);
    const changed = plain(defaults.value); changed.schemaVersion = '99.0.0';
    assert.equal(w.CaissaMentorReviewRequest.validate(changed, 1001).reasonCode, 'UNSUPPORTED_VERSION');
    const injected = plain(defaults.value); injected.engineEvaluations = [{ score: 99 }];
    assert.equal(w.CaissaMentorReviewRequest.validate(injected, 1001).reasonCode, 'INVALID_REQUEST');
});

test('custom-FEN result mismatch is preserved as normalized metadata and never repaired', () => {
    const w = load(); const source = record(w, { mismatch: true });
    const made = w.CaissaMentorReviewRequest.fromGameRecord(source, options);
    assert.equal(source.notation.hasResultMismatch, true);
    assert.equal(made.value.game.hasResultMismatch, true);
    assert.equal(made.sourcePayload.notation.pgnResultToken, '0-1');
});

test('registry registers, retrieves detached snapshots, deduplicates, evicts, expires, cancels and disposes', () => {
    const w = load(); let clock = 1000;
    const registry = w.CaissaMentorReviewRequestRegistry.createRegistry({ maxEntries: 2, now: () => clock });
    const first = w.CaissaMentorReviewRequest.fromGameRecord(record(w), options);
    assert.equal(registry.register(first).status, 'registered');
    assert.equal(registry.register(first).reasonCode, 'DUPLICATE_REQUEST');
    const got = registry.get(first.value.requestId);
    assert.equal(got.value.status, 'registered');
    assert.ok(Object.isFrozen(got.value));
    const second = w.CaissaMentorReviewRequest.fromAnalyzeSession({
        analyzeSessionId: 'analyze-session:2', imported: true
    }, { ...options, requestId: 'mrr_222222222222222222222222', createdAt: 1001 });
    registry.register(second);
    const third = w.CaissaMentorReviewRequest.fromAnalyzeSession({
        analyzeSessionId: 'analyze-session:3', imported: true
    }, { ...options, requestId: 'mrr_333333333333333333333333', createdAt: 1002 });
    registry.register(third);
    assert.equal(registry.inspect().size, 2);
    assert.equal(registry.inspect().evictions, 1);
    assert.equal(registry.cancel(second.value.requestId).status, 'canceled');
    clock = 12000; registry.cleanup();
    assert.equal(registry.inspect().size, 0);
    assert.equal(registry.dispose().status, 'disposed');
    assert.equal(registry.inspect().storageWrites, 0);
});

test('static boundary starts no analysis and owns no worker, clock, storage, navigation, Memory or Mastery', () => {
    const text = sources.slice(4).join('\n');
    assert.doesNotMatch(text, /new\s+Worker|postMessage|EngineAdapter|Stockfish|requestAnimationFrame|ClockService/);
    assert.doesNotMatch(text, /document\.|innerHTML|localStorage|sessionStorage|fetch\s*\(|WebSocket/);
    assert.doesNotMatch(text, /TrainingMemory|Mastery|startAnalysis|getBestMove|CaissaNavigation|\bApp\b/);
});
