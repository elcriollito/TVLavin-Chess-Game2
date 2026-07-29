import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { knowledgeEvidenceFixtures, replayAttemptFixtures } from './fixtures/knowledge-integration-fixtures.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const files = [
    'js/mentor/concept-evidence.js', 'js/mentor/knowledge-mapping-policy.js',
    'js/mentor/knowledge-mapping-contracts.js', 'js/mentor/educational-concept-mapper.js',
    'js/mentor/knowledge-mapping-registry.js', 'js/mentor/mentor-future-adapters.js'
];
function runtime() {
    const context = { console, Date, JSON, Object, Array, Map, Set, WeakSet, Math };
    context.window = context; context.globalThis = context;
    vm.createContext(context);
    files.forEach(file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context,
        { filename: file }));
    return context;
}
const moment = (name, category, tags, index) => ({
    candidateId: `candidate:fixture:${index}`, requestId: 'mrr_fixture123456',
    category, side: 'white', ply: index + 1, move: { uci: 'e2e4', san: 'e4' },
    confidence: 0.81,
    signals: {
        absoluteSwingCp: tags.includes('mate-transition') ? 250 : 80,
        mateIntroduced: tags.includes('mate-transition'),
        mateEscaped: false, mateChangedSide: false,
        materialDelta: tags.includes('material-change') ? 3 : 0,
        phaseTransition: tags.includes('phase-transition'),
        bestMoveMismatch: tags.includes('best-move-divergence'),
        terminal: tags.includes('terminal'), phaseAfter: category === 'endgame'
            || name.includes('transition') ? 'endgame' : category === 'opening' ? 'opening' : 'middlegame'
    }
});

test('ConceptEvidence normalizes Critical Moments into detached, immutable, bounded values', () => {
    const w = runtime();
    const created = w.CaissaConceptEvidence.fromCriticalMoment(
        moment('tactical mate transition', 'tactical', ['mate-transition'], 1), { createdAt: 10 });
    assert.equal(created.ok, true);
    assert.equal(created.value.schemaVersion, '1.0.0');
    assert.equal(created.value.signals.mateTransition, true);
    assert.equal(Object.isFrozen(created.value), true);
    assert.equal(JSON.stringify(created.value).includes('pgn'), false);
    assert.equal(w.CaissaConceptEvidence.validate(created.value).ok, true);
});

test('deterministic fixtures infer bounded concepts and honest exact/generic mappings', () => {
    const w = runtime();
    knowledgeEvidenceFixtures.forEach(([name, category, tags, expected, confidence, unit], index) => {
        const created = w.CaissaConceptEvidence.fromCriticalMoment(moment(name, category, tags, index),
            { createdAt: index });
        assert.equal(created.ok, true, name);
        const inferred = w.CaissaEducationalConceptMapper.inferConcepts(created.value)[0] || null;
        assert.equal(inferred?.conceptId || null, expected, name);
        assert.equal(inferred?.confidenceBand || null, confidence, name);
        const resolved = inferred
            ? w.CaissaEducationalConceptMapper.resolveKnowledgeUnit(inferred,
                w.CaissaKnowledgeMappingPolicy.releaseId) : null;
        assert.equal(resolved?.id || null, unit, name);
    });
});

test('request/result enforce release pin, three-concept maximum, deduplication, and zero mapping', () => {
    const w = runtime();
    const evidence = knowledgeEvidenceFixtures.slice(0, 8).map((fixture, index) =>
        w.CaissaConceptEvidence.fromCriticalMoment(moment(...fixture.slice(0, 3), index),
            { createdAt: index }).value);
    const base = {
        mappingRequestId: 'knowledge:fixture:one', mentorRequestId: 'mrr_fixture123456',
        knowledgeReleaseId: w.CaissaKnowledgeMappingPolicy.releaseId, evidence,
        requestedConceptLimit: 99
    };
    const request = w.CaissaKnowledgeMappingContracts.createRequest(base);
    assert.equal(request.ok, true);
    assert.equal(request.value.requestedConceptLimit, 3);
    const mapped = w.CaissaEducationalConceptMapper.map(request);
    assert.equal(mapped.ok, true);
    assert.ok(mapped.value.mappings.length <= 3);
    assert.equal(new Set(mapped.value.mappings.map(value => value.conceptId)).size,
        mapped.value.mappings.length);
    assert.equal(w.CaissaKnowledgeMappingContracts.createRequest({
        ...base, mappingRequestId: 'knowledge:wrong:release', knowledgeReleaseId: 'latest'
    }).ok, false);
    const emptyEvidence = w.CaissaConceptEvidence.fromCriticalMoment(
        moment('zero mapping', 'opening', [], 12), { createdAt: 12 }).value;
    const empty = w.CaissaEducationalConceptMapper.map(
        w.CaissaKnowledgeMappingContracts.createRequest({
            ...base, mappingRequestId: 'knowledge:fixture:empty', evidence: [emptyEvidence]
        }));
    assert.equal(empty.reasonCode, 'NO_DEFENSIBLE_MAPPING');
    assert.equal(empty.value.mappings.length, 0);
});

test('public resolver returns only pinned manifest units and suppresses low-confidence links', () => {
    const w = runtime();
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'knowledge/releases',
        w.CaissaKnowledgeMappingPolicy.releaseId, 'manifest.json'), 'utf8'));
    const ids = new Set(manifest.units.map(unit => unit.id));
    Object.values(w.CaissaKnowledgeMappingPolicy.units).forEach(unit => {
        assert.equal(ids.has(unit.id), true);
        assert.match(unit.publicUrl, /^\/endgame-library\?unit=endgames%2F[a-z-]+$/);
    });
    assert.equal(w.CaissaEducationalConceptMapper.resolveKnowledgeUnit({
        exactUnitKey: 'favorable-king-ending', confidenceBand: 'low'
    }, w.CaissaKnowledgeMappingPolicy.releaseId), null);
    assert.equal(w.CaissaEducationalConceptMapper.resolveKnowledgeUnit({
        exactUnitKey: 'favorable-king-ending', confidenceBand: 'high'
    }, 'wrong-release'), null);
});

test('replay attempts contribute correlated evidence without exposing private answers', () => {
    const w = runtime();
    replayAttemptFixtures.forEach((fixture, index) => {
        const step = { stepId: `guided-step:fixture:${index}`, momentId: `candidate:fixture:${index}`,
            category: 'decision', sideToMove: 'white', ply: index + 1,
            technicalTags: ['decision', 'best-move-divergence'] };
        const attempt = { attemptId: `attempt:fixture:${index}`, stepId: step.stepId,
            comparison: fixture.comparison, legal: true, move: 'e2e4', createdAt: index };
        const created = w.CaissaConceptEvidence.fromReplayAttempt(step, attempt);
        assert.equal(created.ok, true, fixture.name);
        assert.equal(created.value.confidence, fixture.expectedConfidence);
        assert.equal(created.value.replayStepId, step.stepId);
        assert.equal(JSON.stringify(created.value).includes('referenceMove'), false);
    });
});

test('future adapters are readiness-only and prove zero writes', () => {
    const w = runtime();
    const invalid = { schemaVersion: '1.0.0', mappings: [] };
    for (const adapter of [w.CaissaMentorTrainingMemoryAdapter, w.CaissaMentorMasteryAdapter,
        w.CaissaMentorRecommendationAdapter]) {
        assert.deepEqual(JSON.parse(JSON.stringify(adapter.evaluate(invalid))),
            { ready: false, reasonCode: 'MAPPING_REQUIRED', writes: 0, mutationAllowed: false });
        assert.equal(adapter.inspect().writes, 0);
    }
});

test('static guardrails prohibit engines, workers, storage, private paths, and generated prose', () => {
    const text = files.map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
    assert.doesNotMatch(text, /new\s+Worker|fetch\s*\(|XMLHttpRequest|WebSocket/);
    assert.doesNotMatch(text, /localStorage|sessionStorage|indexedDB|startAnalysis|getBestMove/);
    assert.doesNotMatch(text, /knowledge\/domains|knowledge\/authoring|editorial|masteryCriteria/);
    assert.doesNotMatch(text, /recommendation:\s*\{|nextUnitIds|remediationUnitIds/);
});
