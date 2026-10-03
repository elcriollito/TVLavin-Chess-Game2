(function installInsightsAnalysis(global) {
    'use strict';
    const VERSION = '1.0.0';
    const POLICY = Object.freeze({ depth: 12, perPositionMs: 2500, runMs: 180000, criticalLossCp: 120, phaseVersion: 'fullmove-material-v1' });
    const unavailable = reason => ({ status: 'unavailable', reason, cp: null, mate: null, depth: null, nodes: null, pv: [], bestMove: null });
    function abortError() { return Object.assign(new Error('Analysis cancelled'), { name: 'AbortError' }); }
    function createSession(options = {}) {
        const factory = options.engineFactory || (() => global.EngineRegistry?.createAnalyzeEngine('stockfish-18-lite', { autoStart: false }));
        const signal = options.signal;
        const policy = { ...POLICY, ...options.policy };
        const runId = options.runId || global.crypto.randomUUID();
        let engine = null, disposed = false, failed = false, pending = null, sequence = 0;
        async function ready() {
            if (signal?.aborted || disposed) throw abortError();
            if (failed) return false;
            if (engine?.isReady?.()) return true;
            try {
                engine = factory();
                if (!engine?.start || !engine?.getBestMoveAttributed) throw new Error('Attributed engine unavailable');
                let timer, onAbort;
                try {
                    await Promise.race([engine.start(), new Promise((_, reject) => {
                        timer = setTimeout(() => reject(new Error('Engine startup timeout')), options.startupMs || 8000);
                        onAbort = () => reject(abortError());
                        signal?.addEventListener('abort', onAbort, { once: true });
                    })]);
                } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
                if (signal?.aborted || disposed) throw abortError();
                engine.setMultiPV(1);
                return !!engine.isReady();
            } catch (error) {
                engine?.terminate?.(); failed = true;
                if (signal?.aborted || disposed) throw abortError();
                return false;
            }
        }
        async function evaluate(fen) {
            if (signal?.aborted || disposed) throw abortError();
            if (!await ready()) return unavailable('ENGINE_UNAVAILABLE');
            if (pending) throw new Error('Analysis session is busy');
            const requestId = `${runId}:${++sequence}`;
            return new Promise((resolve, reject) => {
                let latest = null, generationId = null, settled = false;
                const started = Date.now();
                const previousError = engine.onError;
                const onInfo = (info, responseId) => {
                    if (settled || signal?.aborted || responseId !== generationId || info.multipv !== 1
                        || /\b(?:lowerbound|upperbound)\b/.test(info.rawLine || '')) return;
                    if (!latest || info.depth >= latest.depth) latest = info;
                };
                const onError = () => finish(unavailable('ENGINE_UNAVAILABLE'));
                const finish = (value, error) => {
                    if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', onAbort);
                    if (engine.onError === onError) engine.onError = previousError;
                    pending = null; if (error) reject(error); else resolve(value);
                };
                const onAbort = () => { engine.cancelAttributedSearch(); finish(null, abortError()); };
                const timer = setTimeout(() => {
                    engine.cancelAttributedSearch();
                    finish(unavailable('ENGINE_TIMEOUT'));
                }, policy.perPositionMs);
                pending = { cancel: onAbort };
                signal?.addEventListener('abort', onAbort, { once: true });
                if (signal?.aborted) { onAbort(); return; }
                engine.onError = onError;
                generationId = engine.getBestMoveAttributed(fen, (bestMove, _ponder, responseId) => {
                    if (settled || signal?.aborted || responseId !== generationId) return;
                    if (!latest || latest.depth < policy.depth || (!Number.isFinite(latest.score) && !Number.isFinite(latest.mate))) {
                        finish(unavailable('INCOMPLETE_ENGINE_RESULT')); return;
                    }
                    finish({ status: 'complete', cp: Number.isFinite(latest.score) ? Math.round(latest.score * 100) : null,
                        mate: Number.isFinite(latest.mate) ? latest.mate : null, winner: null,
                        perspective: 'white', unit: Number.isFinite(latest.mate) ? 'mate' : 'centipawn',
                        depth: latest.depth, nodes: latest.nodes || 0, pv: (latest.pv || []).slice(0, 12), bestMove,
                        runId, requestId, generationId, elapsedMs: Date.now() - started });
                }, { depth: policy.depth, multiPv: 1, onInfo });
                if (!generationId) finish(unavailable('ENGINE_REQUEST_REJECTED'));
            });
        }
        function dispose() {
            if (disposed) return;
            disposed = true; pending?.cancel(); engine?.cancelAttributedSearch?.(); engine?.terminate?.();
            engine = null;
        }
        return { evaluate, dispose, identity: () => engine?.getRuntimeIdentity?.() || null, runId, policy };
    }
    async function generate(dataset, count, color, options = {}) {
        const core = global.CaissaInsightsCore;
        const games = core.selectGames(dataset, count, color);
        if (!games.length) throw new Error('No games match the selected player and color. Choose the exact player name in your PGN.');
        const session = createSession(options), cache = new Map(), analyses = [], started = Date.now();
        const Chess = options.Chess || global.Chess;
        const signal = options.signal;
        let runtime = null, searchedPositions = 0;
        try {
            for (let gameIndex = 0; gameIndex < games.length; gameIndex++) {
                if (signal?.aborted) throw abortError();
                const game = games[gameIndex], replay = core.replay(game, Chess);
                const evaluations = Array(replay.positions.length).fill(null);
                for (let index = 0; index < replay.positions.length; index++) {
                    if (signal?.aborted) throw abortError();
                    if (Date.now() - started >= session.policy.runMs) break;
                    const fen = replay.positions[index];
                    const terminal = core.terminal(fen, Chess);
                    if (terminal) evaluations[index] = terminal;
                    else if (cache.has(fen)) evaluations[index] = cache.get(fen);
                    else {
                        evaluations[index] = await session.evaluate(fen); searchedPositions++;
                        if (evaluations[index].status === 'complete') cache.set(fen, evaluations[index]);
                        runtime = session.identity() || runtime;
                    }
                    options.onProgress?.(Math.round((gameIndex + (index + 1) / replay.positions.length) / games.length * 90),
                        `Game ${gameIndex + 1}/${games.length}: position ${index + 1}/${replay.positions.length}`);
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
                const analysis = { gameId: game.id, eligible: 0, evaluated: 0, phases: {}, evaluations, moments: [] };
                for (const p of ['opening', 'middlegame', 'endgame']) analysis.phases[p] = { eligible: 0, evaluated: 0, critical: 0 };
                for (const move of replay.moves) {
                    if (move.color !== game.userColor) continue;
                    const phase = core.phase(move.before);
                    analysis.eligible++; analysis.phases[phase].eligible++;
                    const before = evaluations[move.ply], after = evaluations[move.ply + 1];
                    const loss = core.loss(before, after, move.color);
                    if (!loss) continue;
                    analysis.evaluated++; analysis.phases[phase].evaluated++;
                    if (loss.cp >= session.policy.criticalLossCp || loss.mateTransition) {
                        analysis.phases[phase].critical++;
                        analysis.moments.push({ gameId: game.id, ply: move.ply, moveSAN: move.san,
                            playedMove: `${move.from}${move.to}${move.promotion || ''}`, fen: move.before, fenAfter: move.after,
                            playerColor: move.color, phase, lossCp: loss.cp, mateTransition: loss.mateTransition,
                            bestMove: before?.bestMove || null, tags: [], evidenceStatus: 'client_reported' });
                    }
                }
                analysis.status = analysis.eligible > 0 && analysis.evaluated === analysis.eligible ? 'complete' : analysis.evaluated ? 'partial' : 'unavailable';
                analyses.push(analysis);
            }
            const aggregate = core.aggregate(games, analyses);
            return { schemaVersion: VERSION, method: 'engine_browser', verificationStatus: 'client_reported',
                analysisStatus: aggregate.coverage.eligible > 0 && aggregate.coverage.evaluated === aggregate.coverage.eligible ? 'complete' : aggregate.coverage.evaluated ? 'partial' : 'unavailable',
                versions: { analysis: VERSION, phase: session.policy.phaseVersion, rules: 'chess.js-replay-v1' },
                subject: dataset.subject, config: { gameCount: count, colorFilter: color },
                selectedGames: games.map(g => ({ id: g.id, userColor: g.userColor, resultForTarget: core.resultFor(g) })),
                gamesAnalyzed: games.length, moments: analyses.flatMap(a => a.moments),
                analyses: analyses.map(({ moments, ...analysis }) => analysis), aggregate,
                plan: [], timestamp: new Date().toISOString(), engine: runtime, policy: session.policy,
                runId: session.runId, searchedPositions, elapsedMs: Date.now() - started };
        } finally { session.dispose(); }
    }
    global.CaissaInsightsAnalysis = Object.freeze({ VERSION, POLICY, createSession, generate });
})(typeof window !== 'undefined' ? window : globalThis);
