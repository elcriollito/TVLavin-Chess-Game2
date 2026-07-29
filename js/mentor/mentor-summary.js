(function installMentorSummary(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const diagnostics = { validations: 0, generationAttempts: 0, summariesCreated: 0,
        duplicateReuses: 0, insufficientEvidence: 0, strengthOmissions: 0,
        improvementOmissions: 0, prioritizedActions: 0, rematchGoals: 0,
        disposals: 0, engineRequests: 0, workers: 0, storageWrites: 0,
        memoryWrites: 0, masteryWrites: 0, recommendationsAssigned: 0,
        academyMutations: 0, listeners: 0, timers: 0, lastReasonCode: null };
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const operation = (ok, reasonCode, value = null) => freeze({ ok, reasonCode, value });
    const concept = moment => moment?.conceptId || 'unknown';
    const stableHash = value => {
        let hash = 2166136261;
        for (let index = 0; index < value.length; index += 1) {
            hash ^= value.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    };
    function selectStrength(evidence) {
        const matches = evidence.moments.filter(moment => moment.replayAttemptStatus === 'reference-match');
        if (!matches.length) return null;
        const selected = matches[0]; const confidence = matches.length > 1 ? 'high' : 'medium';
        return freeze({ conceptId: concept(selected),
            label: global.CaissaMentorSummaryTemplates.conceptLabel(concept(selected)),
            confidence, evidenceCount: matches.length,
            supportingMomentIds: freeze(matches.map(item => item.momentId).slice(0, 3)),
            templateId: 'strength-reviewed-moment-v1' });
    }
    function selectImprovement(evidence) {
        const candidates = evidence.moments.filter(moment =>
            moment.decisive && ['high', 'medium'].includes(moment.confidence))
            .sort((a, b) => (b.technicalImportance === 'high') - (a.technicalImportance === 'high')
                || a.ply - b.ply);
        if (!candidates.length) return null;
        const selected = candidates[0];
        return freeze({ conceptId: concept(selected),
            label: global.CaissaMentorSummaryTemplates.conceptLabel(concept(selected)),
            confidence: selected.confidence, evidenceCount: candidates
                .filter(item => concept(item) === concept(selected)).length,
            supportingMomentIds: freeze(candidates.filter(item => concept(item) === concept(selected))
                .map(item => item.momentId).slice(0, 3)),
            templateId: 'improvement-game-suggests-v1' });
    }
    function generate(input, options = {}) {
        diagnostics.generationAttempts += 1; diagnostics.validations += 1;
        const validation = global.CaissaMentorSummaryContracts?.validateInputs?.(input);
        if (!validation?.ok) {
            diagnostics.lastReasonCode = validation?.reasonCode || 'INVALID_SUMMARY_INPUT';
            return validation || operation(false, 'INVALID_SUMMARY_INPUT');
        }
        const source = validation.value;
        const evidenceResult = global.CaissaMentorSummaryEvidence.aggregate(source);
        if (!evidenceResult?.ok) return evidenceResult;
        const evidence = evidenceResult.value;
        let strength = selectStrength(evidence);
        let improvement = selectImprovement(evidence);
        if (strength && improvement && strength.conceptId === improvement.conceptId) {
            if (improvement.confidence === 'high') strength = null;
            else improvement = null;
        }
        if (!strength) diagnostics.strengthOmissions += 1;
        if (!improvement) diagnostics.improvementOmissions += 1;
        if (evidence.evidenceStatus === 'insufficient') diagnostics.insufficientEvidence += 1;
        const focus = improvement?.conceptId || strength?.conceptId
            || evidence.moments[0]?.conceptId || 'unknown';
        const linked = source.mappingResult?.mappings?.find(mapping =>
            mapping.conceptId === focus && mapping.knowledgeUnit) || null;
        const actionType = evidence.evidenceStatus === 'insufficient' ? 'analyze-this-game'
            : linked ? 'review-concept'
            : source.replaySession && source.replaySession.status !== 'completed' ? 'replay-again'
            : 'rematch-with-goal';
        const actionTemplate = actionType === 'review-concept' ? 'review-concept'
            : actionType === 'replay-again' ? 'replay'
            : actionType === 'analyze-this-game' ? 'analyze' : 'rematch';
        const style = global.CaissaMentorSummaryTemplates.styles.includes(options.style)
            ? options.style : source.request.review?.explanationStyle || 'balanced';
        const fingerprint = [
            source.request.requestId, source.analysisResult.resultId || source.analysisResult.runId,
            source.selection.selectionId, source.replaySession?.sessionId || 'none',
            source.mappingResult?.mappingResultId || 'none'
        ].join('|');
        const summary = freeze({
            schemaVersion: SCHEMA_VERSION,
            summaryId: `mentor-summary:${source.request.requestId}:${stableHash(fingerprint)}`,
            requestId: source.request.requestId,
            analysisResultId: source.analysisResult.resultId || `analysis-result:${source.analysisResult.runId}`,
            selectionId: source.selection.selectionId,
            replaySessionId: source.replaySession?.sessionId || null,
            mappingResultId: source.mappingResult?.mappingResultId || null,
            mentor: freeze({ id: source.request.mentor?.id || null,
                version: source.request.mentor?.version || null,
                name: options.mentorName || null }),
            source: freeze({ type: source.request.source?.type || null,
                gameRecordId: source.request.source?.recordId || source.request.game?.gameRecordRef || null }),
            evidenceStatus: evidence.evidenceStatus,
            strength, improvementArea: improvement,
            moments: freeze(evidence.moments),
            prioritizedAction: freeze({ type: actionType, conceptId: focus,
                template: global.CaissaMentorSummaryTemplates.render(actionTemplate, focus, style),
                knowledgeUnit: linked?.knowledgeUnit || null }),
            rematchGoal: freeze({ conceptId: focus,
                template: global.CaissaMentorSummaryTemplates.render('goal', focus, style),
                sessionLocal: true }),
            concepts: freeze((source.mappingResult?.mappings || []).slice(0, 3).map(mapping =>
                freeze({ conceptId: mapping.conceptId, confidence: mapping.confidenceBand,
                    knowledgeUnit: mapping.knowledgeUnit || null }))),
            presentation: freeze({
                style,
                statusTemplate: global.CaissaMentorSummaryTemplates.render(
                    evidence.evidenceStatus === 'partial' ? 'partial' : 'insufficient', focus, style),
                strengthTemplate: strength
                    ? global.CaissaMentorSummaryTemplates.render('strength', strength.conceptId, style) : null,
                improvementTemplate: improvement
                    ? global.CaissaMentorSummaryTemplates.render('improvement', improvement.conceptId, style) : null
            }),
            capabilities: freeze({ trainingMemoryWrite: false, masteryWrite: false,
                courseAssignment: false, providerGeneration: false }),
            createdAt: Number.isFinite(options.createdAt) ? options.createdAt : Date.now(),
            diagnostics: freeze({ warnings: evidence.warnings, bounded: true })
        });
        const checked = global.CaissaMentorSummaryContracts.validateSummary(summary);
        if (!checked.ok) return checked;
        const registered = global.CaissaMentorSummaryRegistry.register(summary, fingerprint);
        if (!registered.ok) return registered;
        if (registered.reasonCode === 'SUMMARY_REUSED') diagnostics.duplicateReuses += 1;
        else diagnostics.summariesCreated += 1;
        diagnostics.prioritizedActions += 1; diagnostics.rematchGoals += 1;
        diagnostics.lastReasonCode = registered.reasonCode;
        return operation(true, registered.reasonCode, registered.value);
    }
    function restart(id) {
        const existing = global.CaissaMentorSummaryRegistry.get(id);
        return existing ? operation(true, 'SUMMARY_RESTARTED', existing)
            : operation(false, 'SUMMARY_NOT_FOUND');
    }
    function dispose(id) {
        const result = global.CaissaMentorSummaryRegistry.dispose(id);
        if (result.ok) diagnostics.disposals += 1;
        diagnostics.lastReasonCode = result.reasonCode; return result;
    }
    global.CaissaMentorSummary = freeze({
        schemaVersion: SCHEMA_VERSION, create: () => global.CaissaMentorSummary,
        validateInputs: value => global.CaissaMentorSummaryContracts.validateInputs(value),
        generate, get: id => global.CaissaMentorSummaryRegistry.get(id),
        getSnapshot: id => global.CaissaMentorSummaryRegistry.getSnapshot(id),
        restart, dispose, inspect: () => freeze({ schemaVersion: SCHEMA_VERSION,
            registryEntries: global.CaissaMentorSummaryRegistry.inspect().entries, ...diagnostics })
    });
})(typeof window !== 'undefined' ? window : globalThis);
