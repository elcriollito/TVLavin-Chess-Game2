import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const run = (path, window) => new vm.Script(read(path)).runInContext(vm.createContext({ window, globalThis: window,
    Object, URL, Promise, queueMicrotask }));

test('PlayV2MentorReviewBoundary@1.0.0 declares the review-only contract', () => {
    const window = {}; run('js/play/play-v2-mentor-review-boundary.js', window);
    const boundary = window.CaissaPlayV2MentorReviewBoundary;
    assert.equal(boundary.contractId, 'PlayV2MentorReviewBoundary@1.0.0');
    assert.equal(boundary.purpose, 'completed-game-review');
    assert.equal(boundary.launch, 'explicit-postgame-only');
    assert.equal(boundary.handoff, 'opaque');
    assert.equal(boundary.returnTarget, 'completed-PostGame');
    assert.equal(boundary.publicReady, false);
    for (const key of ['academyDependency', 'lessonDependency', 'curriculumDependency', 'guidedReplayDependency',
        'knowledgeUnitDependency', 'recommendationDependency', 'trainingMemoryWrites', 'masteryWrites',
        'externalUpload', 'activePlayClock', 'activeOpponentWork']) assert.equal(boundary[key], 'prohibited');
});

test('isolated resource group cannot load the contaminated Mentor graph', () => {
    const registry = read('js/play/performance/play-load-registry.js');
    const block = registry.match(/'native-mentor-review':[\s\S]*?\n\s*}\),\n/)[0];
    assert.doesNotMatch(block, /mentor-foundation|mentor-analysis|mentor-critical|mentor-guided|mentor-knowledge|mentor-summary|academy|endgame|memory|mastery|recommend/i);
    assert.match(block, /mentor-review-handoff/); assert.match(block, /mentor-review-analysis/); assert.match(block, /mentor-review-workspace/);
});

test('opaque handoff rejects active, missing, malformed, expired, duplicate, and storage failure', () => {
    const map = new Map(); const storage = { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) };
    const completed = { recordId: 'record-1', status: 'completed', result: { complete: true } };
    const records = { validate: record => ({ valid: record === completed }), serialize: () => ({ ok: true, value: JSON.stringify(completed) }),
        parse: value => ({ ok: true, record: JSON.parse(value) }) };
    const window = { sessionStorage: storage, crypto: { getRandomValues: bytes => bytes.fill(7) }, CaissaGameRecord: records };
    run('js/play/native-mentor-review/mentor-review-handoff.js', window);
    const handoff = window.CaissaNativeMentorReviewHandoff;
    assert.equal(handoff.create({ status: 'active' }).reasonCode, 'FINALIZED_RECORD_REQUIRED');
    assert.equal(handoff.resolve('x').reasonCode, 'INVALID_TOKEN');
    const created = handoff.create(completed); assert.equal(created.ok, true);
    assert.equal(handoff.create(completed).reasonCode, 'DUPLICATE_HANDOFF');
    const token = created.value.token; const key = `caissa.play-v2.mentor-review.1:${token}`; map.set(key, '{');
    assert.equal(handoff.resolve(token).reasonCode, 'EXPIRED_OR_MALFORMED');
    map.set(key, JSON.stringify({ schemaVersion: '1.0.0', token, expiresAt: 0, record: completed }));
    assert.equal(handoff.resolve(token).reasonCode, 'EXPIRED_OR_MALFORMED');
    handoff.consume(token); assert.equal(handoff.resolve(token).reasonCode, 'MISSING_HANDOFF');
    window.sessionStorage.setItem = () => { throw new Error('capacity'); };
    assert.equal(handoff.create(completed).reasonCode, 'STORAGE_UNAVAILABLE');
});

test('analysis is bounded, attributed, finite-template, cancellable, and stale-safe', async () => {
    const queued = []; const window = {}; run('js/play/native-mentor-review/mentor-review-analysis.js', window);
    const analysis = window.CaissaNativeMentorReviewAnalysis.create({ schedule: task => queued.push(task) });
    const stale = analysis.analyze({ recordId: 'r1', ply: 1, move: { san: 'e4', flags: 'b' } });
    const current = analysis.analyze({ recordId: 'r1', ply: 2, move: { san: 'Qxh7+', flags: 'c' } });
    queued.splice(0).forEach(task => task());
    assert.equal((await stale).reasonCode, 'STALE_ANALYSIS');
    const result = await current; assert.equal(result.value.recordId, 'r1'); assert.equal(result.value.critical, true);
    assert.equal(result.value.reviewer, 'CAISSA automated local analysis');
    assert.equal(window.CaissaNativeMentorReviewAnalysis.deadlineMs, 1000);
    assert.equal(Object.keys(window.CaissaNativeMentorReviewAnalysis.templates).length, 4);
    analysis.dispose(); assert.equal(analysis.inspect().activePlayWorkers, 0);
    let deadlineTask; const timeoutAnalysis = window.CaissaNativeMentorReviewAnalysis.create({ schedule: () => {},
        setTimer: task => { deadlineTask = task; return 1; }, clearTimer: () => {} });
    const timed = timeoutAnalysis.analyze({ recordId: 'r1', ply: 0 }); deadlineTask();
    assert.equal((await timed).reasonCode, 'ANALYSIS_TIMEOUT'); assert.equal(timeoutAnalysis.inspect().timeouts, 1);
});

test('review sources own no education, FICS, remote transport, persistence, or lifecycle', () => {
    const source = ['mentor-review-handoff.js', 'mentor-review-analysis.js', 'mentor-review-workspace.js']
        .map(file => read(`js/play/native-mentor-review/${file}`)).join('\n');
    assert.doesNotMatch(source, /CaissaAcademy|CaissaKnowledge|CaissaMentorGuided|CaissaTrainingMemory|CaissaMastery|FICS|WebSocket|XMLHttpRequest|sendBeacon|fetch\s*\(|localStorage|indexedDB|document\.cookie|new\s+Worker/i);
    assert.doesNotMatch(source, /CaissaGameLifecycle|CaissaClockService|CaissaBotSession/);
});
