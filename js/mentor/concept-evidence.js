(function installConceptEvidence(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const MAX_TAGS = 8;
    const SAFE_ID = /^[a-z0-9:._-]{1,180}$/i;
    const SOURCES = Object.freeze(['critical-moment', 'guided-replay-attempt']);
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const operation = (ok, reasonCode, value = null) => freeze({ ok, reasonCode, value });
    const finite = value => Number.isFinite(value) ? value : null;
    const safeId = value => value == null || SAFE_ID.test(value);
    function validate(value) {
        if (!value || value.schemaVersion !== SCHEMA_VERSION || !SOURCES.includes(value.sourceType)
            || !SAFE_ID.test(value.evidenceId || '') || !SAFE_ID.test(value.sourceId || '')
            || !safeId(value.requestId) || !safeId(value.momentId) || !safeId(value.replayStepId)
            || !safeId(value.attemptId) || !Array.isArray(value.technicalTags)
            || value.technicalTags.length > MAX_TAGS || !value.technicalTags.every(tag =>
                typeof tag === 'string' && /^[a-z][a-z-]{1,39}$/.test(tag)))
            return operation(false, 'INVALID_CONCEPT_EVIDENCE');
        return operation(true, 'CONCEPT_EVIDENCE_VALID', value);
    }
    function fromCriticalMoment(moment, input = {}) {
        if (!moment?.candidateId || !moment?.signals) return operation(false, 'INVALID_CRITICAL_MOMENT');
        const signals = moment.signals;
        const tags = [
            moment.category, signals.mateIntroduced && 'mate-transition',
            Math.abs(signals.materialDelta || 0) >= 3 && 'material-change',
            signals.phaseTransition && 'phase-transition',
            signals.bestMoveMismatch && 'best-move-divergence',
            signals.terminal && 'terminal'
        ].filter(Boolean).slice(0, MAX_TAGS);
        const evidence = freeze({
            schemaVersion: SCHEMA_VERSION,
            evidenceId: `evidence:${moment.candidateId}`,
            sourceType: 'critical-moment', sourceId: moment.candidateId,
            requestId: input.requestId || moment.requestId || null,
            momentId: moment.candidateId, replayStepId: null, attemptId: null,
            category: moment.category || 'decision', technicalTags: freeze(tags),
            signals: freeze({
                evaluationSwing: finite(signals.absoluteSwingCp),
                mateTransition: !!(signals.mateIntroduced || signals.mateEscaped || signals.mateChangedSide),
                materialDelta: finite(signals.materialDelta),
                phaseTransition: signals.phaseTransition === true,
                terminal: signals.terminal === true,
                bestMoveDivergence: signals.bestMoveMismatch === true,
                attemptMatchedReference: null, outcomeBand: null
            }),
            phase: signals.phaseAfter || input.phase || null,
            playerColor: moment.side || input.playerColor || null,
            moveContext: freeze({ ply: Number.isInteger(moment.ply) ? moment.ply : null,
                uci: moment.move?.uci || null, san: moment.move?.san || null }),
            confidence: Number.isFinite(moment.confidence) ? Math.max(0, Math.min(1, moment.confidence)) : 0,
            createdAt: Number.isFinite(input.createdAt) ? input.createdAt : Date.now()
        });
        return validate(evidence).ok ? operation(true, 'CONCEPT_EVIDENCE_CREATED', evidence)
            : operation(false, 'INVALID_CONCEPT_EVIDENCE');
    }
    function fromReplayAttempt(step, attempt, input = {}) {
        if (!step?.stepId || !attempt?.attemptId || attempt.stepId !== step.stepId || attempt.legal !== true)
            return operation(false, 'INVALID_REPLAY_ATTEMPT');
        const evidence = freeze({
            schemaVersion: SCHEMA_VERSION, evidenceId: `evidence:${attempt.attemptId}`,
            sourceType: 'guided-replay-attempt', sourceId: attempt.attemptId,
            requestId: input.requestId || null, momentId: step.momentId || null,
            replayStepId: step.stepId, attemptId: attempt.attemptId,
            category: step.category || 'decision',
            technicalTags: freeze([...(step.technicalTags || []),
                attempt.comparison === 'reference-match' ? 'reference-match' : 'legal-alternative']
                .filter((tag, index, values) => /^[a-z][a-z-]{1,39}$/.test(tag)
                    && values.indexOf(tag) === index).slice(0, MAX_TAGS)),
            signals: freeze({
                evaluationSwing: null, mateTransition: false, materialDelta: null,
                phaseTransition: step.technicalTags?.includes('phase-transition') === true,
                terminal: step.technicalTags?.includes('terminal') === true,
                bestMoveDivergence: attempt.comparison !== 'reference-match',
                attemptMatchedReference: attempt.comparison === 'reference-match',
                outcomeBand: input.outcomeBand || null
            }),
            phase: input.phase || null, playerColor: step.sideToMove || null,
            moveContext: freeze({ ply: Number.isInteger(step.ply) ? step.ply : null,
                uci: attempt.move || null, san: null }),
            confidence: attempt.comparison === 'reference-match' ? 0.9 : 0.65,
            createdAt: Number.isFinite(attempt.createdAt) ? attempt.createdAt : Date.now()
        });
        return validate(evidence).ok ? operation(true, 'CONCEPT_EVIDENCE_CREATED', evidence)
            : operation(false, 'INVALID_CONCEPT_EVIDENCE');
    }
    global.CaissaConceptEvidence = freeze({
        schemaVersion: SCHEMA_VERSION, sourceTypes: SOURCES, maxTechnicalTags: MAX_TAGS,
        validate, fromCriticalMoment, fromReplayAttempt
    });
})(typeof window !== 'undefined' ? window : globalThis);
