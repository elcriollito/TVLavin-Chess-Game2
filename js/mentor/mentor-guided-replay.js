(function installMentorGuidedReplay(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const MAX_SESSIONS = 8; const MAX_ATTEMPTS = 5;
    const TERMINAL = new Set(['completed', 'canceled', 'failed', 'disposed']);
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
        const ChessFactory = options.ChessFactory || global.Chess;
        const sessionTtlMs = Number.isFinite(options.sessionTtlMs)
            ? Math.max(1000, Math.min(3600000, options.sessionTtlMs)) : 1800000;
        const sessions = new Map(); let sequence = 0; let disposed = false;
        const diagnostics = { prepared: 0, started: 0, attempts: 0, legalAttempts: 0,
            illegalAttempts: 0, reveals: 0, completions: 0, cancellations: 0,
            disposals: 0, engineRequests: 0, workers: 0, storageWrites: 0,
            memoryWrites: 0, masteryWrites: 0, analyzeMutations: 0 };
        const id = () => `guided-replay:${now().toString(36)}:${(++sequence).toString(36)}`;
        function publicStep(session, index = session.currentStepIndex) {
            const step = session.steps[index]; if (!step) return null;
            const revealed = step.revealed === true;
            const feedback = step.feedback ? freeze({
                comparison: revealed || !step.answer.referenceMove
                    ? step.feedback.comparison : 'submitted',
                technicalOutcome: step.feedback.technicalOutcome,
                message: revealed || !step.answer.referenceMove
                    ? step.feedback.message
                    : 'Legal move recorded. You may reveal the stored reference.'
            }) : null;
            return freeze({
                schemaVersion: SCHEMA_VERSION, stepId: step.stepId, sessionId: session.sessionId,
                momentId: step.momentId, index: step.index, category: step.category,
                ply: step.ply, sideToMove: step.sideToMove,
                position: freeze({ fenBefore: step.fenBefore, orientation: step.orientation,
                    lastMove: step.lastMove }),
                prompt: step.prompt, attemptPolicy: step.attemptPolicy,
                technicalTags: step.technicalTags, status: step.status,
                answer: freeze({ hidden: !revealed, referenceMove: revealed ? step.answer.referenceMove : null,
                    evaluationBefore: revealed ? step.answer.evaluationBefore : null,
                    evaluationAfter: revealed ? step.answer.evaluationAfter : null,
                    mateBefore: revealed ? step.answer.mateBefore : null,
                    mateAfter: revealed ? step.answer.mateAfter : null,
                    principalVariation: revealed ? step.answer.principalVariation : freeze([]) }),
                feedback
            });
        }
        function snapshot(session) {
            if (!session) return null;
            const completedSteps = session.steps.filter(step => ['attempted', 'revealed', 'completed']
                .includes(step.status)).length;
            return freeze({
                schemaVersion: SCHEMA_VERSION, sessionId: session.sessionId,
                requestId: session.requestId, analysisResultId: session.analysisResultId,
                selectionId: session.selectionId, mentorId: session.mentorId,
                status: session.status, currentStepIndex: session.currentStepIndex,
                totalSteps: session.steps.length,
                progress: freeze({ completedSteps, totalSteps: session.steps.length,
                    percentage: session.steps.length ? Math.round(completedSteps / session.steps.length * 100) : 100 }),
                answerPolicy: session.answerPolicy, currentStep: publicStep(session),
                attempts: freeze(session.attempts.map(attempt => {
                    const step = session.steps.find(value => value.stepId === attempt.stepId);
                    const visible = step?.revealed === true || !step?.answer.referenceMove;
                    return freeze({ ...copy(attempt),
                        comparison: visible ? attempt.comparison : 'submitted' });
                })),
                completedSteps, startedAt: session.startedAt, completedAt: session.completedAt,
                canceledAt: session.canceledAt,
                diagnostics: freeze({ skippedMoments: session.skippedMoments,
                    engineRequests: 0, storageWrites: 0 })
            });
        }
        function trim() {
            while (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
        }
        function prepare(input) {
            if (disposed) return operation(false, 'disposed', 'DISPOSED');
            const valid = global.CaissaGuidedReplayContracts?.validateInput?.(input);
            if (!valid?.ok) return operation(false, 'failed', valid?.reasonCode || 'INVALID_REPLAY_INPUT');
            const mapped = global.CaissaGuidedReplayContracts.buildPositionMap(input.source, ChessFactory);
            if (!mapped.ok) return operation(false, 'failed', mapped.reasonCode);
            const sessionId = id(); const steps = []; let skippedMoments = 0;
            for (const moment of input.selection.selectedMoments) {
                const fenBefore = mapped.value[moment.ply - 1];
                if (!fenBefore) { skippedMoments += 1; continue; }
                const technicalBefore = input.analysisResult.positions.find(position =>
                    position.ply === moment.ply - 1);
                const consecutive = moment.signals?.consecutiveMove === true && !!technicalBefore;
                const referenceMove = consecutive ? technicalBefore.bestMove?.uci || null : null;
                const reflect = !referenceMove;
                const prompt = global.CaissaGuidedReplayPrompts.resolve(moment.category, {
                    reflect, style: input.request.review?.explanationStyle
                });
                const fenParts = fenBefore.split(' ');
                steps.push({
                    stepId: `guided-step:${sessionId}:${steps.length}`, momentId: moment.candidateId,
                    index: steps.length, category: moment.category, ply: moment.ply,
                    sideToMove: fenParts[1] === 'b' ? 'black' : 'white', fenBefore,
                    orientation: fenParts[1] === 'b' ? 'black' : 'white', lastMove: null,
                    prompt, attemptPolicy: freeze({ type: reflect ? 'acknowledgement' : 'legal-move',
                        maximumAttempts: MAX_ATTEMPTS, promotionRequired: true }),
                    technicalTags: freeze([moment.category, ...moment.reasonCodes].slice(0, 8)),
                    status: 'prepared', feedback: null, revealed: false,
                    answer: { referenceMove, evaluationBefore: moment.signals?.evaluationBefore ?? null,
                        evaluationAfter: moment.signals?.evaluationAfter ?? null,
                        mateBefore: moment.signals?.mateBefore ?? null,
                        mateAfter: moment.signals?.mateAfter ?? null,
                        principalVariation: freeze((technicalBefore?.principalVariation || []).slice(0, 8)) }
                });
            }
            if (!steps.length && input.selection.selectedCount > 0)
                return operation(false, 'failed', 'POSITION_RESOLUTION_FAILED');
            trim();
            const session = { sessionId, requestId: input.request.requestId,
                analysisResultId: input.analysisResult.resultId || `analysis-result:${input.analysisResult.runId}`,
                selectionId: input.selection.selectionId, mentorId: input.request.mentor?.id
                    || input.request.mentorId || null, answerPolicy: 'hidden-until-attempt',
                status: 'prepared', currentStepIndex: 0, steps, attempts: [], skippedMoments,
                startedAt: null, completedAt: null, canceledAt: null,
                expiresAt: now() + sessionTtlMs };
            sessions.set(sessionId, session); diagnostics.prepared += 1;
            return operation(true, 'prepared', 'REPLAY_PREPARED', snapshot(session));
        }
        function start(sessionId) {
            const session = sessions.get(sessionId);
            if (session && now() > session.expiresAt) {
                session.status = 'failed';
                return operation(false, 'failed', 'SESSION_EXPIRED', snapshot(session));
            }
            if (!session || session.status !== 'prepared')
                return operation(false, session?.status || 'not-found', 'INVALID_TRANSITION');
            session.startedAt = now();
            if (!session.steps.length) {
                session.status = 'completed'; session.completedAt = now(); diagnostics.completions += 1;
                return operation(true, 'completed', 'REPLAY_COMPLETED', snapshot(session));
            }
            session.status = 'awaiting-attempt'; session.steps[0].status = 'awaiting-attempt';
            diagnostics.started += 1;
            return operation(true, session.status, 'REPLAY_STARTED', snapshot(session));
        }
        function submitMove(sessionId, move) {
            const session = sessions.get(sessionId); const step = session?.steps[session.currentStepIndex];
            if (!session || session.status !== 'awaiting-attempt' || step?.prompt.promptType !== 'play-move')
                return operation(false, session?.status || 'not-found', 'INVALID_TRANSITION');
            const uci = typeof move === 'string' ? move.toLowerCase()
                : `${move?.from || ''}${move?.to || ''}${move?.promotion || ''}`.toLowerCase();
            if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci))
                return operation(false, session.status, 'MALFORMED_MOVE');
            let game; let played;
            try {
                game = new ChessFactory(step.fenBefore);
                played = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4),
                    promotion: uci[4] || undefined });
            } catch (_) { played = null; }
            if (!played) {
                diagnostics.illegalAttempts += 1;
                return operation(false, session.status, 'ILLEGAL_MOVE', snapshot(session));
            }
            const referenceMatch = uci === step.answer.referenceMove;
            const attempt = freeze({ schemaVersion: SCHEMA_VERSION,
                attemptId: `attempt:${sessionId}:${session.attempts.length + 1}`,
                stepId: step.stepId, move: uci, inputType: 'move',
                comparison: referenceMatch ? 'reference-match' : 'legal-alternative',
                legal: true, createdAt: now() });
            session.attempts.push(attempt); step.status = 'attempted'; session.status = 'attempted';
            step.feedback = {
                comparison: attempt.comparison,
                technicalOutcome: technicalOutcome(step.answer),
                message: referenceMatch
                    ? 'Your move matches the stored engine reference.'
                    : 'Your move is legal and differs from the stored engine reference.'
            };
            diagnostics.attempts += 1; diagnostics.legalAttempts += 1;
            return operation(true, 'attempted', 'ATTEMPT_ACCEPTED', snapshot(session));
        }
        function technicalOutcome(answer) {
            if (answer.mateBefore !== null || answer.mateAfter !== null) return 'mate-transition';
            if (answer.evaluationBefore === null || answer.evaluationAfter === null) return 'not-comparable';
            const delta = Math.abs(answer.evaluationAfter - answer.evaluationBefore);
            return delta < 50 ? 'stable' : delta < 150 ? 'changed' : 'decisive-change';
        }
        function submitChoice(sessionId, choiceId) {
            const session = sessions.get(sessionId); const step = session?.steps[session.currentStepIndex];
            if (!session || session.status !== 'awaiting-attempt' || step?.prompt.promptType !== 'reflect'
                || choiceId !== 'acknowledge')
                return operation(false, session?.status || 'not-found', 'INVALID_CHOICE');
            const attempt = freeze({ schemaVersion: SCHEMA_VERSION,
                attemptId: `attempt:${sessionId}:${session.attempts.length + 1}`,
                stepId: step.stepId, move: null, inputType: 'acknowledgement',
                comparison: 'not-scored', legal: true, createdAt: now() });
            session.attempts.push(attempt); step.status = 'attempted'; session.status = 'attempted';
            step.feedback = { comparison: 'not-scored', technicalOutcome: 'not-comparable',
                message: 'Technical position acknowledged.' };
            diagnostics.attempts += 1; diagnostics.legalAttempts += 1;
            return operation(true, 'attempted', 'ATTEMPT_ACCEPTED', snapshot(session));
        }
        function reveal(sessionId) {
            const session = sessions.get(sessionId); const step = session?.steps[session.currentStepIndex];
            if (!session || !['attempted', 'revealed'].includes(session.status))
                return operation(false, session?.status || 'not-found', 'REVEAL_NOT_AVAILABLE');
            if (!step.answer.referenceMove)
                return operation(true, session.status, 'NO_REFERENCE_ANSWER', snapshot(session));
            if (session.status === 'revealed')
                return operation(true, 'revealed', 'ALREADY_REVEALED', snapshot(session));
            step.revealed = true; step.status = 'revealed'; session.status = 'revealed'; diagnostics.reveals += 1;
            return operation(true, 'revealed', 'ANSWER_REVEALED', snapshot(session));
        }
        function next(sessionId) {
            const session = sessions.get(sessionId);
            if (!session || !['attempted', 'revealed'].includes(session.status))
                return operation(false, session?.status || 'not-found', 'INVALID_TRANSITION');
            session.steps[session.currentStepIndex].status = 'completed';
            if (session.currentStepIndex >= session.steps.length - 1) {
                session.status = 'completed'; session.completedAt = now(); diagnostics.completions += 1;
                return operation(true, 'completed', 'REPLAY_COMPLETED', snapshot(session));
            }
            session.currentStepIndex += 1; session.steps[session.currentStepIndex].status = 'awaiting-attempt';
            session.status = 'awaiting-attempt';
            return operation(true, session.status, 'STEP_ADVANCED', snapshot(session));
        }
        function previous(sessionId) {
            const session = sessions.get(sessionId);
            if (!session || TERMINAL.has(session.status) || session.currentStepIndex <= 0)
                return operation(false, session?.status || 'not-found', 'NAVIGATION_BOUNDARY');
            session.currentStepIndex -= 1;
            const step = session.steps[session.currentStepIndex];
            session.status = step.status === 'completed' ? 'attempted' : step.status;
            return operation(true, session.status, 'STEP_RESTORED', snapshot(session));
        }
        function restart(sessionId) {
            const session = sessions.get(sessionId);
            if (!session || session.status === 'disposed') return operation(false, 'not-found', 'SESSION_NOT_FOUND');
            session.attempts = []; session.currentStepIndex = 0; session.completedAt = null;
            session.steps.forEach((step, index) => {
                step.status = index === 0 ? 'awaiting-attempt' : 'prepared';
                step.feedback = null; step.revealed = false;
            });
            session.status = session.steps.length ? 'awaiting-attempt' : 'completed';
            return operation(true, session.status, 'REPLAY_RESTARTED', snapshot(session));
        }
        function cancel(sessionId) {
            const session = sessions.get(sessionId);
            if (!session || TERMINAL.has(session.status))
                return operation(false, session?.status || 'not-found', 'INVALID_TRANSITION');
            session.status = 'canceled'; session.canceledAt = now(); diagnostics.cancellations += 1;
            return operation(true, 'canceled', 'REPLAY_CANCELED', snapshot(session));
        }
        function disposeSession(sessionId) {
            const session = sessions.get(sessionId);
            if (!session) return operation(false, 'not-found', 'SESSION_NOT_FOUND');
            session.status = 'disposed'; sessions.delete(sessionId); diagnostics.disposals += 1;
            return operation(true, 'disposed', 'SESSION_DISPOSED');
        }
        function dispose() {
            [...sessions.keys()].forEach(disposeSession); disposed = true;
            return operation(true, 'disposed', 'DISPOSED');
        }
        return freeze({ schemaVersion: SCHEMA_VERSION, prepare, start, submitMove, submitChoice,
            reveal, next, previous, restart, cancel, getSession: id => snapshot(sessions.get(id)),
            getStep: (id, index) => {
                const session = sessions.get(id); return session ? publicStep(session, index) : null;
            },
            getSnapshot: id => snapshot(sessions.get(id)),
            inspect: () => freeze({ schemaVersion: SCHEMA_VERSION, sessionCount: sessions.size,
                maxSessions: MAX_SESSIONS, maxSteps: 5, maxReplayBoards: 1, ...diagnostics }),
            disposeSession, dispose });
    }
    const replay = create();
    global.CaissaMentorGuidedReplay = freeze({
        schemaVersion: SCHEMA_VERSION, statuses: global.CaissaGuidedReplayContracts?.statuses,
        answerPolicies: global.CaissaGuidedReplayContracts?.answerPolicies, create,
        prepare: (...args) => replay.prepare(...args), start: (...args) => replay.start(...args),
        submitMove: (...args) => replay.submitMove(...args),
        submitChoice: (...args) => replay.submitChoice(...args),
        reveal: (...args) => replay.reveal(...args), next: (...args) => replay.next(...args),
        previous: (...args) => replay.previous(...args), restart: (...args) => replay.restart(...args),
        cancel: (...args) => replay.cancel(...args), getSession: id => replay.getSession(id),
        getStep: (...args) => replay.getStep(...args), getSnapshot: id => replay.getSnapshot(id),
        inspect: () => replay.inspect(), disposeSession: id => replay.disposeSession(id),
        dispose: () => replay.dispose()
    });
})(typeof window !== 'undefined' ? window : globalThis);
