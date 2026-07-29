(function installCriticalMoments(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const MAX_SELECTIONS = 8;
    const DEDUP_PLY_WINDOW = 2;
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const copy = value => JSON.parse(JSON.stringify(value));
    const operation = (ok, reasonCode, value = null) => freeze({ ok, reasonCode, value });
    const reasonCodes = signals => freeze([
        signals.mateIntroduced && 'MATE_INTRODUCED',
        signals.mateEscaped && 'MATE_ESCAPED',
        signals.mateChangedSide && 'MATE_SIDE_CHANGED',
        signals.playerLossCp >= 100 && 'MOVER_EVALUATION_LOSS',
        signals.absoluteSwingCp >= 75 && 'EVALUATION_SWING',
        Math.abs(signals.materialDelta || 0) >= 3 && 'MATERIAL_CHANGE',
        signals.bestMoveMismatch && 'BEST_MOVE_DIVERGENCE',
        signals.phaseTransition && 'PHASE_TRANSITION',
        signals.terminal && 'TERMINAL_EVENT'
    ].filter(Boolean));
    function categoryFor(signals, after) {
        if (signals.terminal) return 'terminal';
        if (signals.mateIntroduced || signals.mateEscaped || signals.mateChangedSide
            || signals.playerLossCp >= 100 || Math.abs(signals.materialDelta || 0) >= 3)
            return 'tactical';
        if (signals.phaseTransition) return 'transition';
        if (after.phase === 'endgame') return 'endgame';
        if (after.phase === 'opening' && (signals.absoluteSwingCp || 0) >= 75) return 'opening';
        if (signals.bestMoveMismatch && (signals.absoluteSwingCp || 0) >= 50) return 'decision';
        if ((signals.absoluteSwingCp || 0) >= 75) return 'strategic';
        return 'decision';
    }
    function eligible(signals) {
        return signals.terminal || signals.phaseTransition || signals.mateIntroduced
            || signals.mateEscaped || signals.mateChangedSide
            || signals.playerLossCp >= 100 || signals.absoluteSwingCp >= 75
            || signals.bestMoveMismatch && signals.absoluteSwingCp >= 50
            || Math.abs(signals.materialDelta || 0) >= 3;
    }
    function createSelector(options = {}) {
        const now = typeof options.now === 'function' ? options.now : Date.now;
        const selections = new Map();
        const diagnostics = { selections: 0, envelopesConsumed: 0, candidatesGenerated: 0,
            candidatesSelected: 0, candidatesSuppressed: 0, engineRequests: 0,
            storageWrites: 0, listeners: 0, timers: 0, analyzeMutations: 0 };
        function generateCandidates(result) {
            const validation = global.CaissaCriticalMomentContracts?.validateAnalysisResult?.(result);
            if (!validation?.ok) return validation || operation(false, 'INVALID_ANALYSIS_RESULT');
            const positions = validation.value.positions;
            const candidates = [];
            for (let index = 1; index < positions.length; index += 1) {
                const before = positions[index - 1]; const after = positions[index];
                const signals = global.CaissaCriticalMomentSignals.extract(before, after);
                const importance = global.CaissaCriticalMomentScoring.score(signals);
                const isEligible = eligible(signals);
                candidates.push(freeze({
                    schemaVersion: SCHEMA_VERSION,
                    candidateId: `candidate:${result.runId}:${after.ply}`,
                    runId: result.runId, requestId: result.requestId, ply: after.ply,
                    moveNumber: Math.floor((after.ply + 1) / 2),
                    side: after.mover || (after.sideToMove === 'white' ? 'black' : 'white'),
                    move: freeze({ uci: after.playedMove?.uci || null, san: after.playedMove?.san || null }),
                    category: categoryFor(signals, after), signals,
                    importance: freeze({ rawScore: importance.rawScore,
                        normalizedScore: importance.normalizedScore, components: importance.components }),
                    confidence: importance.confidence, reasonCodes: reasonCodes(signals),
                    eligible: isEligible,
                    suppressionReasons: freeze(isEligible ? [] : ['INSUFFICIENT_TECHNICAL_EVIDENCE'])
                }));
            }
            diagnostics.envelopesConsumed += 1; diagnostics.candidatesGenerated += candidates.length;
            return operation(true, 'CANDIDATES_GENERATED', freeze(candidates));
        }
        function rankCandidates(candidates) {
            if (!Array.isArray(candidates) || candidates.length > 32)
                return operation(false, 'INVALID_CANDIDATES');
            const ranked = [...candidates].filter(candidate => candidate?.eligible)
                .sort((a, b) => b.importance.normalizedScore - a.importance.normalizedScore
                    || b.confidence - a.confidence || a.ply - b.ply || a.candidateId.localeCompare(b.candidateId));
            return operation(true, 'CANDIDATES_RANKED', freeze(ranked));
        }
        function deduplicate(candidates) {
            const ranked = rankCandidates(candidates);
            if (!ranked.ok) return ranked;
            const kept = []; const suppressed = [];
            for (const candidate of ranked.value) {
                const duplicate = kept.find(existing => Math.abs(existing.ply - candidate.ply) <= DEDUP_PLY_WINDOW
                    && (existing.category === candidate.category
                        || ['tactical', 'terminal'].includes(existing.category)
                        && ['tactical', 'terminal'].includes(candidate.category)));
                if (duplicate) suppressed.push(freeze({ candidateId: candidate.candidateId,
                    reasonCode: 'NEARBY_REDUNDANT_SEQUENCE', retainedCandidateId: duplicate.candidateId }));
                else kept.push(candidate);
            }
            return operation(true, 'CANDIDATES_DEDUPLICATED',
                freeze({ candidates: freeze(kept), suppressed: freeze(suppressed) }));
        }
        function select(result, request) {
            const requestValidation = global.CaissaCriticalMomentContracts?.validateRequest?.(request);
            if (!requestValidation?.ok) return requestValidation || operation(false, 'INVALID_REQUEST');
            if (request.requestId && request.requestId !== result?.requestId)
                return operation(false, 'REQUEST_RESULT_MISMATCH');
            const generated = generateCandidates(result);
            if (!generated.ok) return generated;
            const deduped = deduplicate(generated.value);
            if (!deduped.ok) return deduped;
            const limit = request.review.criticalMomentLimit;
            const selectedByRank = deduped.value.candidates.slice(0, limit);
            const limitSuppressed = deduped.value.candidates.slice(limit).map(candidate => freeze({
                candidateId: candidate.candidateId, reasonCode: 'REQUEST_LIMIT',
                retainedCandidateId: null
            }));
            const selectedMoments = freeze([...selectedByRank].sort((a, b) => a.ply - b.ply));
            const suppressed = freeze([...deduped.value.suppressed, ...limitSuppressed]);
            const fingerprint = selectedMoments.map(moment => moment.ply).join('-') || 'none';
            const selectionId = `critical-selection:${result.runId}:${limit}:${fingerprint}`;
            const selection = freeze({
                schemaVersion: SCHEMA_VERSION, selectionId, runId: result.runId,
                requestId: result.requestId, requestedLimit: limit, appliedLimit: limit,
                totalCandidates: generated.value.length, eligibleCandidates: generated.value
                    .filter(candidate => candidate.eligible).length,
                selectedCount: selectedMoments.length, selectedMoments,
                suppressedCount: generated.value.length - selectedMoments.length,
                incomplete: result.status === 'partial' || result.summary?.partial === true,
                createdAt: now(), capabilities: freeze({ mentorExplanation: false,
                    guidedReplay: false, knowledgeMapping: false, recommendations: false }),
                diagnostics: freeze({ deduplicationWindowPly: DEDUP_PLY_WINDOW,
                    explicitSelection: true, engineRequests: 0, storageWrites: 0 })
            });
            if (!selections.has(selectionId) && selections.size >= MAX_SELECTIONS)
                selections.delete(selections.keys().next().value);
            selections.set(selectionId, selection);
            diagnostics.selections += 1; diagnostics.candidatesSelected += selectedMoments.length;
            diagnostics.candidatesSuppressed += suppressed.length
                + generated.value.filter(candidate => !candidate.eligible).length;
            return operation(true, 'CRITICAL_MOMENTS_SELECTED', selection);
        }
        return freeze({
            schemaVersion: SCHEMA_VERSION, generateCandidates, rankCandidates, deduplicate, select,
            getSnapshot: id => selections.has(id) ? freeze(copy(selections.get(id))) : null,
            inspect: () => freeze({ schemaVersion: SCHEMA_VERSION, registrySize: selections.size,
                maxSelections: MAX_SELECTIONS, deduplicationWindowPly: DEDUP_PLY_WINDOW, ...diagnostics }),
            dispose: () => { selections.clear(); return operation(true, 'DISPOSED'); }
        });
    }
    const selector = createSelector();
    global.CaissaCriticalMoments = freeze({
        schemaVersion: SCHEMA_VERSION, categories: global.CaissaCriticalMomentContracts?.categories,
        createSelector, validateAnalysisResult: value =>
            global.CaissaCriticalMomentContracts.validateAnalysisResult(value),
        generateCandidates: (...args) => selector.generateCandidates(...args),
        rankCandidates: (...args) => selector.rankCandidates(...args),
        deduplicate: (...args) => selector.deduplicate(...args),
        select: (...args) => selector.select(...args),
        getSnapshot: id => selector.getSnapshot(id), inspect: () => selector.inspect(),
        dispose: () => selector.dispose()
    });
})(typeof window !== 'undefined' ? window : globalThis);
