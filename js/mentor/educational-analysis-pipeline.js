(function installEducationalAnalysisPipeline(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const RESULT_SCHEMA_VERSION = '1.0.0';
    const STAGES = Object.freeze(['request-validation', 'source-resolution', 'game-normalization',
        'policy-resolution', 'position-generation', 'engine-analysis', 'result-normalization',
        'result-envelope', 'completed']);
    const STATUSES = Object.freeze(['created', 'validating', 'prepared', 'queued', 'running',
        'canceling', 'canceled', 'completed', 'failed', 'timed-out', 'stale', 'disposed']);
    const TERMINAL = new Set(['canceled', 'completed', 'failed', 'timed-out', 'stale', 'disposed']);
    const MAX_RUNS = 8;
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const copy = value => JSON.parse(JSON.stringify(value));
    const operation = (ok, status, reasonCode, value = null) => freeze({ ok, status, reasonCode, value });
    function create(options = {}) {
        const now = typeof options.now === 'function' ? options.now : Date.now;
        const setTimer = options.setTimeout || global.setTimeout?.bind(global);
        const clearTimer = options.clearTimeout || global.clearTimeout?.bind(global);
        const requestRegistry = options.requestRegistry || global.CaissaMentorReviewRequestRegistry;
        const importedSourceResolver = options.importedSourceResolver || null;
        const engine = options.engine || global.CaissaEducationalEngineAnalysis?.create?.(options.engineOptions);
        const runs = new Map(); let activeRunId = null; let sequence = 0; let disposed = false;
        const diagnostics = { prepareAttempts: 0, starts: 0, completedRuns: 0, canceledRuns: 0,
            timedOutRuns: 0, failedRuns: 0, positionsGenerated: 0, positionsAnalyzed: 0,
            staleResponses: 0, policyResolutions: 0, resultEnvelopes: 0, disposals: 0,
            lastReasonCode: null };
        const runId = () => {
            const uuid = global.crypto?.randomUUID?.()?.replace(/-/g, '');
            const suffix = (++sequence).toString(36).padStart(4, '0');
            return `ear_${uuid ? `${uuid}_${suffix}` : `${now().toString(36)}${suffix}`}`;
        };
        function snapshot(run) {
            if (!run) return null;
            return freeze({
                schemaVersion: SCHEMA_VERSION, runId: run.runId, requestId: run.request.requestId,
                status: run.status, currentStage: run.currentStage,
                progress: freeze({ ...run.progress }),
                policy: run.policy ? freeze({ requestedDepth: run.policy.requestedDepth,
                    resolvedProfile: run.policy.resolvedProfile,
                    limits: freeze({ perPosition: run.policy.perPositionLimit,
                        maximumPositions: run.policy.maximumPositions,
                        totalTimeBudgetMs: run.policy.totalTimeBudgetMs, concurrency: 1 }) }) : null,
                source: freeze({ type: run.request.source.type,
                    recordId: run.request.source.recordId, analyzeSessionId: run.request.source.analyzeSessionId }),
                timing: freeze({ createdAt: run.createdAt, startedAt: run.startedAt, endedAt: run.endedAt,
                    elapsedMs: (run.endedAt ?? now()) - run.createdAt }),
                cancellation: freeze({ requested: run.cancelRequested, reason: run.cancelReason }),
                failure: freeze({ code: run.failureCode, stage: run.failureStage }),
                resultAvailable: !!run.result,
                diagnostics: freeze({ positionCount: run.positions?.length || 0,
                    evaluationCount: run.results.length, staleResponses: run.staleResponses })
            });
        }
        function trim() {
            while (runs.size >= MAX_RUNS) {
                const removable = [...runs.values()].filter(run => run.runId !== activeRunId)
                    .sort((a, b) => a.createdAt - b.createdAt)[0];
                if (!removable) break;
                runs.delete(removable.runId);
            }
        }
        function validateRequest(request) {
            const checked = global.CaissaMentorReviewRequest?.validate?.(request, now());
            if (!checked?.valid) return operation(false, 'invalid', checked?.reasonCode || 'INVALID_REQUEST');
            if (request.status !== 'registered' && request.status !== 'validated')
                return operation(false, 'invalid', 'INVALID_REQUEST');
            return operation(true, 'validated', 'REQUEST_VALID', freeze(copy(request)));
        }
        function fairPlay(request, payload) {
            const imported = request.source.type === 'imported-game';
            const opponent = imported ? 'engine' : payload?.opponent?.type === 'coach' ? 'coach'
                : global.CaissaBotRegistry?.get?.(payload?.opponent?.id) ? 'bot'
                : payload?.opponent?.type || 'engine';
            return global.CaissaFairPlayPolicy?.evaluatePurpose?.('mentor-analysis', {
                source: imported ? 'imported' : 'local-play',
                authority: imported ? 'analysis-workspace' : 'local-client',
                gameStatus: imported ? 'completed' : payload?.result?.complete ? 'completed' : 'active',
                opponentType: opponent, assisted: false, spectator: false, imported
            });
        }
        function prepare(requestOrId, prepareOptions = {}) {
            diagnostics.prepareAttempts += 1;
            if (disposed) return operation(false, 'disposed', 'DISPOSED');
            const resolved = typeof requestOrId === 'string' ? requestRegistry?.get?.(requestOrId) : {
                ok: !!requestOrId, value: requestOrId
            };
            if (!resolved?.ok) return operation(false, 'failed', 'INVALID_REQUEST');
            const checked = validateRequest(resolved.value);
            if (!checked.ok) return checked;
            const request = checked.value;
            let source = requestRegistry?.getSourcePayload?.(request.requestId);
            if (request.source.type === 'imported-game' && importedSourceResolver)
                source = importedSourceResolver(request.source.analyzeSessionId, request);
            if (!source?.ok || !source.value) return operation(false, 'failed', 'SOURCE_UNAVAILABLE');
            const decision = fairPlay(request, source.value);
            if (!decision?.allowed) return operation(false, 'failed', 'FAIR_PLAY_DENIED');
            const normalized = global.CaissaEducationalAnalysisContracts?.normalizeSource?.(request, source.value);
            if (!normalized?.ok) return operation(false, 'failed', normalized?.reasonCode || 'GAME_NORMALIZATION_FAILED');
            const policy = global.CaissaEducationalAnalysisPolicy?.resolve?.(
                request.review.analysisDepth, { mobile: prepareOptions.mobile === true });
            if (!policy?.ok) return operation(false, 'failed', 'POLICY_INVALID');
            diagnostics.policyResolutions += 1;
            const positions = global.CaissaEducationalAnalysisContracts?.generatePositions?.(
                normalized.value, policy.value, prepareOptions.ChessFactory || global.Chess);
            if (!positions?.ok) return operation(false, 'failed', positions?.reasonCode || 'POSITION_REPLAY_FAILED');
            diagnostics.positionsGenerated += positions.value.length;
            trim();
            const id = runId(); const createdAt = now();
            const run = { runId: id, request, source: normalized.value, policy: policy.value,
                positions: positions.value, results: [], result: null, status: 'prepared',
                currentStage: 'position-generation', progress: { completedPositions: 0,
                    totalPositions: positions.value.length, percentage: 0 },
                createdAt, startedAt: null, endedAt: null, cancelRequested: false, cancelReason: null,
                failureCode: null, failureStage: null, staleResponses: 0, generation: 0, timer: null };
            runs.set(id, run); diagnostics.lastReasonCode = 'RUN_PREPARED';
            return operation(true, 'prepared', 'RUN_PREPARED', snapshot(run));
        }
        function finishFailure(run, status, code, stage) {
            run.status = status; run.failureCode = code; run.failureStage = stage; run.endedAt = now();
            clearTimer?.(run.timer); run.timer = null;
            if (activeRunId === run.runId) activeRunId = null;
            if (status === 'timed-out') diagnostics.timedOutRuns += 1;
            else if (status === 'canceled') diagnostics.canceledRuns += 1;
            else diagnostics.failedRuns += 1;
            diagnostics.lastReasonCode = code;
            return operation(false, status, code, snapshot(run));
        }
        function createEnvelope(run, status = 'complete') {
            const envelope = freeze({ schemaVersion: RESULT_SCHEMA_VERSION,
                resultId: `analysis-result:${run.runId}`, runId: run.runId,
                requestId: run.request.requestId, status,
                source: freeze({ type: run.request.source.type, id: run.request.source.id,
                    hasResultMismatch: run.source.hasResultMismatch }),
                policy: freeze({ id: run.policy.id, requestedDepth: run.policy.requestedDepth }),
                summary: freeze({ positionsRequested: run.positions.length,
                    positionsCompleted: run.results.length,
                    partial: run.results.length !== run.positions.length,
                    hasErrors: status !== 'complete' }),
                positions: freeze(copy(run.results)),
                capabilities: freeze({ criticalMoments: false, errorClassification: false,
                    knowledgeMapping: false, mentorExplanation: false, recommendations: false }),
                createdAt: now(), diagnostics: freeze({ omittedPositions: run.positions.length - run.results.length })
            });
            run.result = envelope; diagnostics.resultEnvelopes += 1; return envelope;
        }
        async function start(requestOrRunId, startOptions = {}) {
            if (disposed) return operation(false, 'disposed', 'DISPOSED');
            let run = typeof requestOrRunId === 'string' ? runs.get(requestOrRunId) : null;
            if (!run) {
                const prepared = prepare(requestOrRunId, startOptions);
                if (!prepared.ok) return prepared;
                run = runs.get(prepared.value.runId);
            }
            if (run.status !== 'prepared') return operation(false, run.status, 'INVALID_TRANSITION', snapshot(run));
            if (activeRunId) {
                if (startOptions.supersede !== true) return operation(false, 'queued', 'ACTIVE_RUN_EXISTS', snapshot(run));
                cancel(activeRunId, 'superseded');
            }
            activeRunId = run.runId; run.status = 'running'; run.currentStage = 'engine-analysis';
            run.startedAt = now(); run.generation += 1; const generation = run.generation;
            diagnostics.starts += 1; diagnostics.lastReasonCode = 'RUN_STARTED';
            run.timer = setTimer?.(() => {
                if (run.status === 'running' && run.generation === generation) {
                    engine?.cancel?.(); finishFailure(run, 'timed-out', 'RUN_TIMEOUT', 'engine-analysis');
                }
            }, run.policy.totalTimeBudgetMs);
            for (const position of run.positions) {
                if (run.status !== 'running' || run.generation !== generation)
                    return operation(false, run.status, run.failureCode || 'RUN_CANCELED', snapshot(run));
                const analyzed = await engine?.analyze?.(position, run.policy, {
                    runId: run.runId, positionId: position.positionId, ply: position.ply, generation
                });
                if (run.status !== 'running' || run.generation !== generation) {
                    diagnostics.staleResponses += 1; run.staleResponses += 1;
                    return operation(false, run.status, run.failureCode || 'STALE_ENGINE_RESPONSE', snapshot(run));
                }
                if (!analyzed?.ok) return finishFailure(run,
                    analyzed?.reasonCode === 'ENGINE_TIMEOUT' ? 'timed-out' : 'failed',
                    analyzed?.reasonCode || 'ENGINE_UNAVAILABLE', 'engine-analysis');
                const normalized = global.CaissaEducationalAnalysisContracts.normalizePositionResult(
                    analyzed.value, { runId: run.runId, positionId: position.positionId, ply: position.ply });
                if (!normalized.ok) return finishFailure(run, normalized.reasonCode === 'STALE_ENGINE_RESPONSE'
                    ? 'stale' : 'failed', normalized.reasonCode, 'result-normalization');
                run.results.push(normalized.value); diagnostics.positionsAnalyzed += 1;
                run.progress.completedPositions = run.results.length;
                run.progress.percentage = Math.min(99, Math.floor(run.results.length / run.positions.length * 100));
            }
            clearTimer?.(run.timer); run.timer = null; run.currentStage = 'result-envelope';
            createEnvelope(run); run.progress.percentage = 100; run.status = 'completed';
            run.currentStage = 'completed'; run.endedAt = now(); activeRunId = null;
            diagnostics.completedRuns += 1; diagnostics.lastReasonCode = 'RUN_COMPLETED';
            return operation(true, 'completed', 'RUN_COMPLETED', snapshot(run));
        }
        function cancel(id, reason = 'user') {
            const run = runs.get(id);
            if (!run) return operation(false, 'not-found', 'RUN_NOT_FOUND');
            if (TERMINAL.has(run.status)) return operation(true, 'unchanged', run.failureCode || 'RUN_TERMINAL', snapshot(run));
            run.cancelRequested = true; run.cancelReason = ['user', 'route-leave', 'request-expired',
                'timeout', 'superseded', 'dispose'].includes(reason) ? reason : 'user';
            run.status = 'canceling'; run.generation += 1; engine?.cancel?.();
            return finishFailure(run, 'canceled', 'RUN_CANCELED', run.currentStage);
        }
        function disposeRun(id) {
            const run = runs.get(id);
            if (!run) return operation(false, 'not-found', 'RUN_NOT_FOUND');
            if (!TERMINAL.has(run.status)) cancel(id, 'dispose');
            run.status = 'disposed'; runs.delete(id); diagnostics.disposals += 1;
            return operation(true, 'disposed', 'DISPOSED');
        }
        function dispose() {
            if (disposed) return operation(true, 'unchanged', 'DISPOSED');
            [...runs.keys()].forEach(disposeRun); engine?.dispose?.(); disposed = true;
            return operation(true, 'disposed', 'DISPOSED');
        }
        return freeze({ schemaVersion: SCHEMA_VERSION, resultSchemaVersion: RESULT_SCHEMA_VERSION,
            stages: STAGES, statuses: STATUSES, validateRequest, prepare, start, cancel,
            getRun: id => snapshot(runs.get(id)), getSnapshot: id => snapshot(runs.get(id)),
            getResult: id => runs.get(id)?.result ? freeze(copy(runs.get(id).result)) : null,
            listRuns: () => freeze([...runs.values()].map(snapshot)), disposeRun, dispose,
            inspect: () => freeze({ schemaVersion: SCHEMA_VERSION, activeRunId, runCount: runs.size,
                maxRuns: MAX_RUNS, storageWrites: 0, listeners: 0, ...diagnostics,
                engine: engine?.inspect?.() || null }) });
    }
    const pipeline = create();
    global.CaissaEducationalAnalysisPipeline = freeze({
        schemaVersion: SCHEMA_VERSION, resultSchemaVersion: RESULT_SCHEMA_VERSION,
        stages: STAGES, statuses: STATUSES, create,
        validateRequest: value => pipeline.validateRequest(value), prepare: (...args) => pipeline.prepare(...args),
        start: (...args) => pipeline.start(...args), cancel: (...args) => pipeline.cancel(...args),
        getRun: id => pipeline.getRun(id), getSnapshot: id => pipeline.getSnapshot(id),
        getResult: id => pipeline.getResult(id), listRuns: () => pipeline.listRuns(),
        disposeRun: id => pipeline.disposeRun(id), inspect: () => pipeline.inspect(),
        dispose: () => pipeline.dispose()
    });
})(typeof window !== 'undefined' ? window : globalThis);
