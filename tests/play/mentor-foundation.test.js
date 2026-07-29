import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const files = [
    'js/mentor/mentor-capabilities.js', 'js/mentor/mentor-registry.js',
    'js/mentor/mentor-selection-resolver.js', 'js/mentor/mentor-context.js',
    'js/mentor/mentor-review-readiness.js', 'js/mentor/mentor-review-request.js',
    'js/mentor/mentor-review-request-registry.js', 'js/mentor/mentor-foundation.js'
];
const sources = files.map(file => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));
const plain = value => JSON.parse(JSON.stringify(value));
const record = Object.freeze({
    recordId: 'local-play:mentor-test', status: 'completed',
    result: Object.freeze({ complete: true })
});
function load() {
    const window = {
        CaissaGameRecord: { validate: value => ({ valid: value === record }) }
    };
    const context = { window, globalThis: window, Object, WeakSet, Set, Map };
    sources.forEach(source => vm.runInNewContext(source, context));
    return window;
}

test('capability model truthfully exposes bounded Mentor Summary while long-term intelligence stays gated', () => {
    const w = load(); const api = w.CaissaMentorCapabilities;
    assert.equal(api.schemaVersion, '1.1.0');
    assert.deepEqual(plain(api.statuses), ['available', 'foundation', 'disabled', 'unavailable', 'deferred']);
    assert.equal(api.get('post-game-review-request').status, 'foundation');
    assert.equal(api.get('critical-moment-review').status, 'disabled');
    assert.equal(api.get('training-recommendation').status, 'deferred');
    assert.equal(api.get('mentor-summary').status, 'available');
    assert.equal(api.get('mentor-summary').reasonCode, 'CAPABILITY_AVAILABLE');
    assert.equal(api.get('unknown').status, 'unavailable');
    assert.equal(api.list().filter(item => item.status === 'available').length, 1);
    assert.ok(Object.isFrozen(api.snapshot));
});

test('registry adapts the eight existing Academy identities and rejects hostile or duplicate-shaped profiles', () => {
    const w = load(); const registry = w.CaissaMentorRegistry;
    assert.equal(registry.list().length, 8);
    assert.equal(registry.resolveDefault().id, 'academyMentorCaissa');
    assert.equal(registry.get('academyMentorCapablanca').title, 'Endgame Professor');
    assert.equal(registry.get('../remote'), null);
    assert.equal(registry.create({ id: 'bad', version: 1 }).valid, false);
    assert.equal(registry.create(JSON.parse('{"__proto__":{"polluted":true}}')).valid, false);
    assert.equal({}.polluted, undefined);
    assert.ok(Object.isFrozen(registry.list()[0]));
});

test('selection precedence is session, Academy, product default, then unavailable without writes', () => {
    const w = load(); const resolve = w.CaissaMentorSelectionResolver.resolve;
    assert.equal(resolve({ sessionMentorId: 'academyMentorTal',
        academyMentorId: 'academyMentorDaisy' }).source, 'session');
    assert.equal(resolve({ academyMentorId: 'academyMentorDaisy' }).source, 'academy');
    assert.equal(resolve({}).mentor.id, 'academyMentorCaissa');
    assert.equal(resolve({ sessionMentorId: '../bad' }).source, 'product-default');
});

test('all six transversal contexts normalize identifiers without PGN or FEN payloads', () => {
    const w = load();
    const sourcesByType = {
        'pre-game': 'games', 'post-game': 'bot', 'imported-game': 'analyze-import',
        analysis: 'analyze-import', training: 'training', academy: 'academy'
    };
    for (const [contextType, source] of Object.entries(sourcesByType)) {
        const result = w.CaissaMentorContext.create({
            contextType, source, mentorId: 'academyMentorCaissa',
            gameRecordId: contextType === 'post-game' ? record.recordId : null,
            analyzeSessionId: source === 'analyze-import' ? 'analyze-session-1' : null,
            knowledgeReleaseId: w.CaissaMentorCapabilities.releaseId
        });
        assert.equal(result.valid, true, contextType);
        assert.doesNotMatch(JSON.stringify(result.value), /\b(?:pgn|fen)\b/i);
    }
    assert.equal(w.CaissaMentorContext.create({ contextType: 'live-human', source: 'fics' }).valid, false);
});

test('readiness accepts completed sources, rejects active or malformed inputs, and stays foundation-only', () => {
    const w = load(); const base = {
        mentorId: 'academyMentorCaissa', source: 'games', record,
        knowledgeReleaseId: w.CaissaMentorCapabilities.releaseId
    };
    const ready = w.CaissaMentorReviewReadiness.evaluate(base);
    assert.equal(ready.ready, true); assert.equal(ready.reviewImplemented, false);
    assert.equal(w.CaissaMentorReviewReadiness.evaluate({ ...base, record: {
        ...record, status: 'in-progress', result: { complete: false }
    } }).ready, false);
    assert.ok(w.CaissaMentorReviewReadiness.evaluate({ ...base, mentorId: 'missing' })
        .reasonCodes.includes('MENTOR_NOT_SELECTED'));
    assert.ok(w.CaissaMentorReviewReadiness.evaluate({ ...base, knowledgeReleaseId: 'latest' })
        .reasonCodes.includes('KNOWLEDGE_RELEASE_REQUIRED'));
    assert.equal(w.CaissaMentorReviewReadiness.evaluate({ ...base, source: 'analyze-import',
        record: null, analyzeSessionId: 'analyze-session-1' }).ready, true);
});

test('foundation creates one bounded request per source and contains no analysis conclusions', () => {
    const w = load(); const input = {
        mentorId: 'academyMentorCaissa', source: 'games', record,
        playerLevel: 'novice', focus: 'general',
        knowledgeReleaseId: w.CaissaMentorCapabilities.releaseId
    };
    const created = w.CaissaMentorFoundation.createRequest(input);
    assert.equal(created.ok, true); assert.equal(created.value.metadata.reviewImplemented, false);
    assert.equal(w.CaissaMentorFoundation.createRequest(input).status, 'unchanged');
    assert.equal(w.CaissaMentorFoundation.getSnapshot().diagnostics.requests, 1);
    assert.equal(created.value.capabilities.criticalMoments, 'disabled');
    assert.doesNotMatch(JSON.stringify(created), /weakness|strength|evaluation|engine|\"pgn\"|\"initialFen\"|\"finalFen\"/i);
    assert.ok(Object.isFrozen(created.value));
    assert.equal(w.CaissaMentorFoundation.reset().status, 'idle');
});

test('static boundary owns no engine, worker, clock, DOM, storage, network, Memory, or Mastery', () => {
    const text = sources.join('\n');
    assert.doesNotMatch(text, /new\s+Worker|postMessage|EngineAdapter|Stockfish|requestAnimationFrame|ClockService/);
    assert.doesNotMatch(text, /document\.|innerHTML|localStorage|sessionStorage|fetch\s*\(|XMLHttpRequest|WebSocket/);
    assert.doesNotMatch(text, /TrainingMemory|Mastery|startAnalysis|getBestMove|CaissaNavigation|\bApp\b/);
});

test('both SPA pages load the foundation once after GameRecord and before PostGame', () => {
    for (const page of ['index.html', 'yahoo-classic.html']) {
        const html = fs.readFileSync(new URL(`../../${page}`, import.meta.url), 'utf8');
        for (const file of files) assert.equal((html.match(new RegExp(file.split('/').pop().replace('.', '\\.'), 'g')) || []).length, 1);
        assert.ok(html.indexOf('game-record.js') < html.indexOf('mentor-capabilities.js'));
        assert.ok(html.indexOf('mentor-foundation.js') < html.indexOf('post-game-experience.js'));
    }
});
