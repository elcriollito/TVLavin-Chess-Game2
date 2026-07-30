import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { mentorSummaryCases } from './fixtures/mentor-summary-fixtures.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sources = [
    'js/mentor/knowledge-mapping-policy.js', 'js/mentor/knowledge-mapping-contracts.js',
    'js/mentor/mentor-summary-contracts.js', 'js/mentor/mentor-summary-evidence.js',
    'js/mentor/mentor-summary-templates.js', 'js/mentor/mentor-summary-registry.js',
    'js/mentor/mentor-summary.js', 'js/mentor/mentor-future-adapters.js'
];
function runtime() {
    const context = { console, Date, JSON, Object, Array, Map, Set, WeakSet, Math };
    context.window = context; context.globalThis = context;
    vm.createContext(context);
    sources.forEach(file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'),
        context, { filename: file }));
    return context;
}
function input(options = {}) {
    const requestId = options.requestId || 'mrr_summaryfixture123456';
    const category = options.category || 'tactical';
    const concept = options.concept || {
        tactical: 'tactical-awareness', opening: 'development', transition: 'transition-awareness',
        endgame: 'endgame-awareness'
    }[category] || 'material-safety';
    const moments = Array.from({ length: options.moments ?? 1 }, (_, index) => ({
        candidateId: `candidate:summary:${index}`, requestId, ply: index + 1,
        category, confidence: options.confidence ?? 0.85,
        importance: { normalizedScore: 0.9 },
        reasonCodes: options.decisive === false ? ['BEST_MOVE_DIVERGENCE']
            : category === 'tactical' ? ['MATERIAL_CHANGE'] : ['MOVER_EVALUATION_LOSS']
    }));
    const analysisResult = {
        schemaVersion: '1.1.0', resultId: 'analysis-result:summary',
        runId: 'run:summary', requestId, status: options.analysis || 'complete',
        positions: [], summary: { partial: options.analysis === 'partial' }
    };
    const selection = {
        schemaVersion: '1.0.0', selectionId: 'critical-selection:summary',
        runId: analysisResult.runId, requestId, selectedCount: moments.length,
        selectedMoments: moments, incomplete: options.analysis === 'partial'
    };
    const replaySession = options.replay ? {
        schemaVersion: '1.1.0', sessionId: 'guided-replay:summary',
        requestId, analysisResultId: analysisResult.resultId,
        selectionId: selection.selectionId, status: options.replay,
        attempts: [{ attemptId: 'attempt:summary:1', stepId: 'guided-step:summary:0',
            comparison: 'reference-match', legal: true }]
    } : null;
    const mappingResult = options.mapping ? {
        schemaVersion: '1.0.0', mappingResultId: 'knowledge-result:summary',
        mappingRequestId: `knowledge:${requestId}:summary`,
        knowledgeReleaseId: 'rel-58b238dfdda8f295fdab023cead6bf069aceefbee74a64a5cd71af2202480a84',
        status: 'mapped', mappings: [{
            mappingId: 'mapping:summary:1', sourceMomentId: moments[0]?.candidateId,
            replayStepId: null, conceptId: concept, confidence: 0.9, confidenceBand: 'high',
            reasonCodes: ['FIXTURE'], knowledgeUnit: options.exact ? {
                id: 'ku:endgames:pawn-exchanges:favorable-king-ending',
                contentVersion: '1.1.0', title: 'Simplify into a favorable king ending',
                publicUrl: '/endgame-library?unit=endgames%2Ffavorable-king-ending'
            } : null,
            scaffolding: { promptTemplateId: null, explanationTemplateId: null }
        }], unmappedEvidenceCount: 0, partial: false, capabilities: {}, diagnostics: {}
    } : null;
    return {
        request: {
            schemaVersion: '1.0.0', requestId, source: { type: options.source || 'bot-game',
                recordId: 'game:summary' }, mentor: { id: 'academyMentorCaissa', version: 1 },
            review: { explanationStyle: 'balanced' },
            knowledge: { releaseId: 'rel-58b238dfdda8f295fdab023cead6bf069aceefbee74a64a5cd71af2202480a84' },
            game: { gameRecordRef: 'game:summary', hasResultMismatch: options.mismatch === true }
        },
        analysisResult, selection, replaySession, mappingResult
    };
}

test('contracts and APIs are versioned, frozen, bounded, and JSON-safe', () => {
    const w = runtime();
    assert.equal(w.CaissaMentorSummary.schemaVersion, '1.0.0');
    assert.equal(w.CaissaMentorSummaryContracts.schemaVersion, '1.0.0');
    assert.equal(w.CaissaMentorSummaryEvidence.schemaVersion, '1.0.0');
    assert.equal(w.CaissaMentorSummaryTemplates.schemaVersion, '1.0.0');
    assert.equal(w.CaissaMentorSummaryRegistry.schemaVersion, '1.0.0');
    const generated = w.CaissaMentorSummary.generate(input({ decisive: false, replay: 'completed' }),
        { createdAt: 10, mentorName: 'CAISSA' });
    assert.equal(generated.ok, true);
    assert.equal(Object.isFrozen(generated.value), true);
    assert.ok(JSON.stringify(generated.value).length < 10_000);
    assert.doesNotMatch(JSON.stringify(generated.value), /(?:pgn|fen|principalVariation|rawMessage)/i);
});

test('input correlation rejects request, analysis, selection, replay, mapping, and release mismatches', () => {
    const w = runtime();
    const base = input({ mapping: true });
    assert.equal(w.CaissaMentorSummary.validateInputs(base).ok, true);
    assert.equal(w.CaissaMentorSummary.validateInputs({
        ...base, analysisResult: { ...base.analysisResult, requestId: 'mrr_other123456789' }
    }).ok, false);
    assert.equal(w.CaissaMentorSummary.validateInputs({
        ...base, replaySession: { ...base.replaySession, requestId: 'mrr_other123456789' }
    }).ok, false);
    assert.equal(w.CaissaMentorSummary.validateInputs({
        ...base, mappingResult: { ...base.mappingResult, mappingRequestId: 'knowledge:other:summary' }
    }).ok, false);
});

test('strength requires visible reference-match evidence and never claims mastery', () => {
    const w = runtime();
    const strong = w.CaissaMentorSummary.generate(input({
        decisive: false, replay: 'completed', mapping: true
    }), { createdAt: 1 }).value;
    assert.equal(strong.strength.conceptId, 'tactical-awareness');
    assert.equal(strong.strength.confidence, 'medium');
    assert.equal(strong.improvementArea, null);
    const unsupported = w.CaissaMentorSummary.generate(input({
        decisive: false, mapping: true, requestId: 'mrr_summaryunsupported123'
    }), { createdAt: 2 }).value;
    assert.equal(unsupported.strength, null);
    assert.doesNotMatch(JSON.stringify(strong.presentation), /master(?:y|ed)|greatest strength/i);
});

test('improvement requires decisive medium/high evidence and conflict resolution avoids contradiction', () => {
    const w = runtime();
    const improvement = w.CaissaMentorSummary.generate(input({
        concept: 'material-safety', mapping: true
    }), { createdAt: 1 }).value;
    assert.equal(improvement.improvementArea.conceptId, 'material-safety');
    assert.equal(improvement.strength, null);
    const weak = w.CaissaMentorSummary.generate(input({
        confidence: 0.4, requestId: 'mrr_summaryweak123456'
    }), { createdAt: 2 }).value;
    assert.equal(weak.improvementArea, null);
    const conflict = w.CaissaMentorSummary.generate(input({
        replay: 'completed', mapping: true, requestId: 'mrr_summaryconflict123'
    }), { createdAt: 3 }).value;
    assert.equal(conflict.strength, null);
    assert.ok(conflict.improvementArea);
});

test('moments remain chronological, technical, grade-free, and capped at three', () => {
    const w = runtime();
    const value = w.CaissaMentorSummary.generate(input({ moments: 5 }), { createdAt: 1 }).value;
    assert.equal(value.moments.length, 3);
    assert.deepEqual([...value.moments.map(moment => moment.ply)], [1, 2, 3]);
    assert.doesNotMatch(JSON.stringify(value.moments), /blunder|mistake|inaccuracy|centipawn|principal/i);
});

test('next action and rematch goal are deterministic with exact and generic Knowledge behavior', () => {
    const w = runtime();
    const linked = w.CaissaMentorSummary.generate(input({
        category: 'transition', concept: 'simplification', mapping: true, exact: true
    }), { createdAt: 1 }).value;
    assert.equal(linked.prioritizedAction.type, 'review-concept');
    assert.match(linked.prioritizedAction.knowledgeUnit.publicUrl, /^\/endgame-library\?/);
    const generic = w.CaissaMentorSummary.generate(input({
        mapping: true, requestId: 'mrr_summarygeneric123'
    }), { createdAt: 2 }).value;
    assert.equal(generic.prioritizedAction.type, 'rematch-with-goal');
    assert.equal(generic.prioritizedAction.knowledgeUnit, null);
    assert.equal(generic.rematchGoal.sessionLocal, true);
});

test('zero, partial, unfinished replay, and mismatch evidence remain honest', () => {
    const w = runtime();
    const zero = w.CaissaMentorSummary.generate(input({ moments: 0 }), { createdAt: 1 }).value;
    assert.equal(zero.evidenceStatus, 'insufficient');
    assert.equal(zero.strength, null); assert.equal(zero.improvementArea, null);
    assert.equal(zero.prioritizedAction.type, 'analyze-this-game');
    const partial = w.CaissaMentorSummary.generate(input({
        analysis: 'partial', requestId: 'mrr_summarypartial123'
    }), { createdAt: 2 }).value;
    assert.equal(partial.evidenceStatus, 'partial');
    const unfinished = w.CaissaMentorSummary.generate(input({
        decisive: false, replay: 'attempted', requestId: 'mrr_summaryunfinished1'
    }), { createdAt: 3 }).value;
    assert.equal(unfinished.prioritizedAction.type, 'replay-again');
    const mismatch = w.CaissaMentorSummary.generate(input({
        mismatch: true, requestId: 'mrr_summarymismatch12'
    }), { createdAt: 4 }).value;
    assert.ok(mismatch.diagnostics.warnings.includes('RESULT_MISMATCH'));
});

test('all required deterministic fixture categories declare bounded expected outcomes', () => {
    assert.equal(mentorSummaryCases.length, 15);
    for (const fixture of mentorSummaryCases) {
        assert.ok(['complete', 'partial', 'limited', 'insufficient']
            .includes(fixture.expectedEvidenceStatus));
        assert.ok(fixture.expectedMomentCount <= 3);
        assert.ok(typeof fixture.expectedNextAction === 'string');
        assert.ok(typeof fixture.expectedRematchGoal === 'string');
        assert.ok(fixture.expectedLinkCount <= 1);
        assert.ok(Object.hasOwn(fixture, 'expectedStrength'));
        assert.ok(Object.hasOwn(fixture, 'expectedImprovement'));
    }
});

test('registry deduplicates, caps eight, retrieves immutable snapshots, and disposes', () => {
    const w = runtime();
    const base = input({ decisive: false, replay: 'completed' });
    const first = w.CaissaMentorSummary.generate(base, { createdAt: 1 });
    const duplicate = w.CaissaMentorSummary.generate(base, { createdAt: 2 });
    assert.equal(duplicate.reasonCode, 'SUMMARY_REUSED');
    assert.equal(duplicate.value, first.value);
    let latest = null;
    for (let index = 0; index < 9; index += 1)
        latest = w.CaissaMentorSummary.generate(input({
            requestId: `mrr_summarybounded${String(index).padStart(3, '0')}`
        }), { createdAt: index + 3 });
    assert.equal(w.CaissaMentorSummaryRegistry.inspect().entries, 8);
    latest = w.CaissaMentorSummary.get(latest.value.summaryId);
    assert.ok(latest);
    assert.equal(w.CaissaMentorSummaryRegistry.expire(10).ok, true);
    assert.equal(w.CaissaMentorSummary.dispose(latest.summaryId).ok, true);
});

test('templates support four bounded styles without provider calls or unrestricted text', () => {
    const w = runtime();
    for (const style of w.CaissaMentorSummaryTemplates.styles) {
        for (const kind of ['strength', 'improvement', 'review-concept', 'rematch', 'goal']) {
            const rendered = w.CaissaMentorSummaryTemplates.render(kind, 'material-safety', style);
            assert.ok(rendered.text.length <= 220);
            assert.equal(rendered.style, style);
        }
    }
});

test('future adapters evaluate summary readiness with zero writes and assignments', () => {
    const w = runtime();
    const summary = w.CaissaMentorSummary.generate(input({ mapping: true }), { createdAt: 1 }).value;
    for (const adapter of [w.CaissaMentorTrainingMemoryAdapter,
        w.CaissaMentorMasteryAdapter, w.CaissaMentorRecommendationAdapter]) {
        const readiness = adapter.evaluateSummary(summary);
        assert.equal(readiness.writes, 0);
        assert.equal(readiness.mutationAllowed, false);
        assert.equal(readiness.recommendationsAssigned, 0);
    }
});

test('static boundary owns no engine, Worker, DOM, storage, network, Academy, or generated provider', () => {
    const text = sources.slice(2, 7).map(file =>
        fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
    assert.doesNotMatch(text, /new\s+Worker|fetch\s*\(|XMLHttpRequest|WebSocket/);
    assert.doesNotMatch(text, /localStorage|sessionStorage|indexedDB|document\.|\bApp\b/);
    assert.doesNotMatch(text, /startAnalysis|getBestMove|MentorAI|llm|provider\s*\(|AcademySection/);
    assert.doesNotMatch(text, /greatest strength|main weakness|\balways\b|\busually\b|player rating/i);
});

test('both SPA pages load summary modules once before PostGame without changing dependencies', () => {
    const registry = fs.readFileSync(path.join(root, 'js/play/performance/play-load-registry.js'), 'utf8');
    for (const page of ['index.html', 'yahoo-classic.html']) {
        const html = fs.readFileSync(path.join(root, page), 'utf8');
        for (const file of sources.slice(2, 7)) {
            const src = file;
            const escaped = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            assert.doesNotMatch(html, new RegExp(`<script[^>]+${escaped}`));
            assert.match(registry, new RegExp(escaped));
        }
    }
});
