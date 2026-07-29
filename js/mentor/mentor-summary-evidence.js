(function installMentorSummaryEvidence(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const categoryConcept = Object.freeze({
        tactical: 'tactical-awareness', terminal: 'defensive-awareness',
        opening: 'development', transition: 'transition-awareness',
        endgame: 'endgame-awareness', decision: 'candidate-moves',
        strategic: 'candidate-moves'
    });
    const confidence = score => score >= 0.8 ? 'high' : score >= 0.6 ? 'medium' : 'low';
    function aggregate(input) {
        const valid = global.CaissaMentorSummaryContracts?.validateInputs?.(input);
        if (!valid?.ok) return valid;
        const source = valid.value;
        const mappingByMoment = new Map((source.mappingResult?.mappings || [])
            .map(mapping => [mapping.sourceMomentId, mapping]));
        const moments = source.selection.selectedMoments.slice(0, 3)
            .sort((a, b) => a.ply - b.ply).map((moment, index) => {
                const mapping = mappingByMoment.get(moment.candidateId) || null;
                const attempt = (source.replaySession?.attempts || []).find(value =>
                    value.stepId?.endsWith(`:${index}`)) || null;
                const score = Number.isFinite(moment.confidence) ? moment.confidence : 0;
                return freeze({
                    momentId: moment.candidateId, ply: moment.ply, category: moment.category,
                    technicalImportance: score >= 0.8 ? 'high' : score >= 0.6 ? 'medium' : 'low',
                    confidence: confidence(score),
                    decisive: moment.reasonCodes?.some(code => [
                        'MATE_INTRODUCED', 'MATE_SIDE_CHANGED', 'MOVER_EVALUATION_LOSS',
                        'MATERIAL_CHANGE', 'TERMINAL_EVENT'
                    ].includes(code)) === true,
                    replayAttemptStatus: attempt?.comparison || (attempt ? 'submitted' : 'not-attempted'),
                    conceptId: mapping?.conceptId || categoryConcept[moment.category] || null,
                    knowledgeUnit: mapping?.knowledgeUnit || null,
                    shortTemplateId: `moment-${moment.category}-v1`
                });
            });
        const replayComplete = source.replaySession?.status === 'completed';
        const warnings = [
            source.analysisResult.status === 'partial' && 'PARTIAL_ANALYSIS',
            source.selection.incomplete === true && 'INCOMPLETE_SELECTION',
            source.request.game?.hasResultMismatch === true && 'RESULT_MISMATCH',
            source.replaySession && !replayComplete && 'REPLAY_NOT_COMPLETED'
        ].filter(Boolean);
        const status = source.analysisResult.status === 'partial' ? 'partial'
            : !moments.length ? 'insufficient'
            : warnings.length || !source.mappingResult ? 'limited' : 'complete';
        return freeze({ ok: true, reasonCode: 'SUMMARY_EVIDENCE_AGGREGATED', value: freeze({
            schemaVersion: SCHEMA_VERSION, evidenceStatus: status, moments,
            warnings: freeze(warnings), replayComplete,
            replayAttempts: source.replaySession?.attempts?.length || 0,
            mappings: source.mappingResult?.mappings?.length || 0
        }) });
    }
    global.CaissaMentorSummaryEvidence = freeze({
        schemaVersion: SCHEMA_VERSION, categoryConcept, aggregate
    });
})(typeof window !== 'undefined' ? window : globalThis);
