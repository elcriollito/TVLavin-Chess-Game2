import { ChessRulesFacade } from './chess-rules-facade.js';
import { SafeEngineAdapter } from './safe-engine-adapter.js';
import { createStockfishWorker, resolveStockfishWorkerUrl } from './stockfish-worker-factory.js';

const BESTMOVE_FEN = '8/8/8/8/8/4k3/8/R3K3 w - - 0 1';
const RACE_FEN_A = '8/8/8/8/8/3k4/8/R3K3 w - - 0 1';
const RACE_FEN_B = '8/8/8/8/4k3/8/8/R3K3 b - - 0 1';

function elapsed(startedAt) {
    return performance.now() - startedAt;
}

function errorRecord(stage, error) {
    return { stage, code: error?.code ?? 'browser-error' };
}

function isLegalBestMove(fen, bestMove) {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(bestMove)) return false;
    try {
        return ChessRulesFacade.fromFen(fen).move(bestMove)?.lan === bestMove;
    } catch {
        return false;
    }
}

function pushTrace(trace, entry) {
    if (trace.entries.length < 1000) trace.entries.push(entry);
}

function createTraceTransport(worker, trace, startedAt, transportId, workerUrl, counters) {
    const messageListeners = new Map();
    const errorListeners = new Map();
    let terminated = false;
    pushTrace(trace, { event: 'transport-created', transportId, workerUrl, atMs: elapsed(startedAt) });
    return {
        transportId,
        postMessage(command) {
            const entry = { event: 'command-sent', transportId, command, atMs: elapsed(startedAt) };
            trace.commands.push(entry);
            pushTrace(trace, entry);
            worker.postMessage(command);
        },
        addEventListener(type, handler) {
            const map = type === 'message' ? messageListeners : errorListeners;
            const wrapped = type === 'message'
                ? (event) => {
                    const message = typeof event.data === 'string' ? event.data : '';
                    const entry = { event: 'message-received', transportId, message, atMs: elapsed(startedAt) };
                    if (trace.messages.length < 1000) trace.messages.push(entry);
                    pushTrace(trace, entry);
                    handler(event);
                }
                : (event) => {
                    pushTrace(trace, { event: 'error', transportId, atMs: elapsed(startedAt) });
                    handler(event);
                };
            map.set(handler, wrapped);
            worker.addEventListener(type, wrapped);
        },
        removeEventListener(type, handler) {
            const map = type === 'message' ? messageListeners : errorListeners;
            const wrapped = map.get(handler);
            if (wrapped) worker.removeEventListener(type, wrapped);
            map.delete(handler);
        },
        terminate() {
            if (terminated) return;
            terminated = true;
            const atMs = elapsed(startedAt);
            trace.terminatedAtMs = atMs;
            trace.terminatedById.set(transportId, atMs);
            counters.transportsTerminated += 1;
            counters.activeTransports -= 1;
            pushTrace(trace, { event: 'transport-terminated', transportId, atMs });
            worker.terminate();
        }
    };
}

function createTracedEngineFactory({ workerUrl, baseUrl, trace, startedAt, counters }) {
    return () => {
        const constructionStartedAt = performance.now();
        const worker = createStockfishWorker({ workerUrl, baseUrl });
        const transportId = ++counters.lastTransportId;
        counters.transportsCreated += 1;
        counters.activeTransports += 1;
        counters.constructionMsById.set(transportId, elapsed(constructionStartedAt));
        return createTraceTransport(worker, trace, startedAt, transportId, workerUrl, counters);
    };
}

function percentile(values, fraction) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.ceil(fraction * sorted.length) - 1];
}

function timingSummary(values) {
    return {
        median: percentile(values, 0.5),
        p95: percentile(values, 0.95),
        maximum: values.length ? Math.max(...values) : null
    };
}

async function runRaceIteration({ iteration, createEngine, trace, counters, searchTimeoutMs }) {
    const errors = [];
    const startedAt = performance.now();
    const commandStart = trace.commands.length;
    const messageStart = trace.messages.length;
    const createdStart = counters.transportsCreated;
    const terminatedStart = counters.transportsTerminated;
    let adapter;
    let requestAResult;
    let requestBResult = null;
    let stateBeforeDispose = null;
    try {
        adapter = new SafeEngineAdapter({ createEngine, defaultTimeoutMs: searchTimeoutMs });
        await adapter.initialize();
        const transportAId = counters.lastTransportId;
        const requestA = adapter.analyzePosition({ fen: RACE_FEN_A, depth: 80, timeoutMs: searchTimeoutMs });
        const outcomeA = requestA.then(
            (value) => ({ completed: true, value }),
            (error) => ({ completed: false, code: error?.code })
        );
        const replacementStartedAt = performance.now();
        requestBResult = await adapter.analyzePosition({ fen: RACE_FEN_B, depth: 5, timeoutMs: searchTimeoutMs });
        requestAResult = await outcomeA;
        const transportBId = counters.lastTransportId;
        stateBeforeDispose = adapter.getState();
        const commands = trace.commands.slice(commandStart);
        const messages = trace.messages.slice(messageStart);
        const positionB = commands.find((entry) => entry.transportId === transportBId && entry.command === `position fen ${RACE_FEN_B}`);
        const goB = commands.find((entry) => entry.transportId === transportBId && entry.command.startsWith('go '));
        const uciB = commands.find((entry) => entry.transportId === transportBId && entry.command === 'uci');
        const uciokB = messages.find((entry) => entry.transportId === transportBId && entry.message === 'uciok');
        const readyokB = messages.find((entry) => entry.transportId === transportBId && entry.message === 'readyok');
        const bestmoveB = messages.find((entry) => entry.transportId === transportBId && entry.message.startsWith('bestmove '));
        const terminatedAAt = trace.terminatedById.get(transportAId);
        const staleBestMovesObserved = messages.filter((entry) => entry.transportId === transportAId && entry.message.startsWith('bestmove ') && entry.atMs >= terminatedAAt).length;
        const bestMoveLegalForB = isLegalBestMove(RACE_FEN_B, requestBResult.bestMove);
        const requestBFenMatches = requestBResult.fen === RACE_FEN_B;
        const transportRestarted = transportBId !== transportAId && Boolean(uciB && uciokB && readyokB && positionB && goB);
        const illegalBestMovesObserved = stateBeforeDispose.staleBestMoveCount;
        const timings = {
            restartConstructionMs: counters.constructionMsById.get(transportBId) ?? null,
            uciHandshakeMs: uciB && readyokB ? readyokB.atMs - uciB.atMs : null,
            searchBMs: positionB && bestmoveB ? bestmoveB.atMs - positionB.atMs : null,
            totalReplacementMs: elapsed(replacementStartedAt)
        };
        const passed = requestAResult.code === 'engine-search-cancelled'
            && transportRestarted
            && bestMoveLegalForB
            && requestBFenMatches
            && counters.transportsCreated - createdStart === 2
            && counters.transportsTerminated - terminatedStart === 1;
        return {
            iteration,
            status: passed ? 'passed' : 'failed',
            requestAResult,
            requestBResult,
            transportAId,
            transportBId,
            transportRestarted,
            staleBestMovesObserved,
            staleBestMovesAccepted: 0,
            illegalBestMovesObserved,
            illegalBestMovesAccepted: bestMoveLegalForB ? 0 : 1,
            bestMoveLegalForB,
            requestBFenMatches,
            timings,
            errors
        };
    } catch (error) {
        errors.push(errorRecord('race', error));
        return { iteration, status: 'failed', requestAResult, requestBResult, errors, timings: { totalReplacementMs: elapsed(startedAt) } };
    } finally {
        adapter?.dispose();
    }
}

async function inspectAsset(workerUrl) {
    const startedAt = performance.now();
    const response = await fetch(workerUrl, { cache: 'no-store' });
    const body = await response.arrayBuffer();
    return {
        url: response.url,
        httpStatus: response.status,
        ok: response.ok,
        contentType: response.headers.get('content-type'),
        contentLength: body.byteLength,
        redirected: response.redirected,
        elapsedMs: elapsed(startedAt)
    };
}

export async function runStockfishBrowserProbe(options = {}) {
    const startedAt = performance.now();
    const initializationTimeoutMs = options.initializationTimeoutMs ?? 15000;
    const searchTimeoutMs = options.searchTimeoutMs ?? 10000;
    const raceTest = options.raceTest !== false;
    const logger = typeof options.logger === 'function' ? options.logger : null;
    const trace = { commands: [], messages: [], entries: [], terminatedAtMs: null, terminatedById: new Map() };
    const counters = {
        transportsCreated: 0,
        transportsTerminated: 0,
        activeTransports: 0,
        lastTransportId: 0,
        constructionMsById: new Map()
    };
    const errors = [];
    const tests = {};
    let adapter = null;
    let resolvedUrl;
    let createEngine;

    const report = (event, details = {}) => {
        try { logger?.({ timestamp: new Date().toISOString(), event, ...details }); } catch { /* Diagnostic logging is observational. */ }
    };

    try {
        resolvedUrl = resolveStockfishWorkerUrl({ workerUrl: options.workerUrl, baseUrl: options.baseUrl });
        tests.factoryUrl = { status: 'passed', url: resolvedUrl.href };
        const network = await inspectAsset(resolvedUrl.href);
        tests.assetRequest = { status: network.ok ? 'passed' : 'failed', ...network };
        if (!network.ok) throw Object.assign(new Error(), { code: 'worker-construction-failed' });

        createEngine = createTracedEngineFactory({ workerUrl: resolvedUrl.href, baseUrl: options.baseUrl, trace, startedAt, counters });
        adapter = new SafeEngineAdapter({ createEngine, defaultTimeoutMs: initializationTimeoutMs, logger: (entry) => report('adapter', entry) });

        const initializationStartedAt = performance.now();
        await adapter.initialize();
        tests.workerConstruction = { status: 'passed', elapsedMs: counters.constructionMsById.get(1), transportId: 1 };
        const initializationMs = elapsed(initializationStartedAt);
        const uciok = trace.messages.find((entry) => entry.message === 'uciok');
        const readyok = trace.messages.find((entry) => entry.message === 'readyok');
        const optionLines = trace.messages.filter((entry) => entry.message.startsWith('option name ')).map((entry) => entry.message);
        tests.initialization = { status: uciok && readyok ? 'passed' : 'failed', uciok: Boolean(uciok), readyok: Boolean(readyok), elapsedMs: initializationMs };

        const validation = ChessRulesFacade.validateFen(BESTMOVE_FEN);
        tests.fenValidation = { status: validation.valid ? 'passed' : 'failed', fen: validation.fen };
        if (!validation.valid) throw Object.assign(new Error(), { code: 'invalid-fen' });

        const bestStartedAt = performance.now();
        const best = await adapter.requestBestMove({ fen: validation.fen, depth: 4, timeoutMs: searchTimeoutMs });
        tests.bestMove = { status: best.completed ? 'passed' : 'failed', result: best, elapsedMs: elapsed(bestStartedAt) };

        let firstInfoAtMs = null;
        const infoSnapshots = [];
        const analysisStartedAt = performance.now();
        const analysis = await adapter.analyzePosition({
            fen: validation.fen,
            depth: 5,
            multiPv: 1,
            timeoutMs: searchTimeoutMs,
            onInfo(info) {
                if (firstInfoAtMs === null) firstInfoAtMs = elapsed(analysisStartedAt);
                if (infoSnapshots.length < 20) infoSnapshots.push(info);
            }
        });
        tests.analysis = { status: infoSnapshots.length && analysis.completed ? 'passed' : 'failed', infoCount: infoSnapshots.length, firstInfoAtMs, result: analysis };

        const supportsMultiPv = optionLines.some((line) => /^option name MultiPV type /i.test(line));
        if (supportsMultiPv) {
            const multiPv = await adapter.analyzePosition({ fen: validation.fen, depth: 5, multiPv: 2, timeoutMs: searchTimeoutMs });
            tests.multiPv = { status: multiPv.lines.length >= 2 ? 'passed' : 'failed', lineCount: multiPv.lines.length, result: multiPv };
        } else {
            tests.multiPv = { status: 'unsupported', lineCount: 0 };
        }

        const stoppedSearch = adapter.analyzePosition({ fen: RACE_FEN_A, depth: 80, timeoutMs: searchTimeoutMs });
        const stoppedRejection = stoppedSearch.then(() => null, (error) => error?.code);
        const stopStartedAt = performance.now();
        await adapter.stop();
        const stopCode = await stoppedRejection;
        tests.stop = { status: stopCode === 'engine-search-cancelled' ? 'passed' : 'failed', errorCode: stopCode, elapsedMs: elapsed(stopStartedAt) };

        const afterStop = await adapter.requestBestMove({ fen: validation.fen, depth: 3, timeoutMs: searchTimeoutMs });
        tests.searchAfterStop = { status: afterStop.completed ? 'passed' : 'failed', result: afterStop };

        if (raceTest) {
            const raceStartedAt = performance.now();
            const commandStart = trace.commands.length;
            const infoB = [];
            const requestA = adapter.analyzePosition({ fen: RACE_FEN_A, depth: 80, timeoutMs: searchTimeoutMs });
            const requestAOutcome = requestA.then((value) => ({ completed: true, value }), (error) => ({ completed: false, code: error?.code }));
            const requestB = adapter.analyzePosition({ fen: RACE_FEN_B, depth: 5, timeoutMs: searchTimeoutMs, onInfo: (info) => infoB.push(info) });
            const [outcomeA, resultB] = await Promise.all([requestAOutcome, requestB]);
            const raceCommands = trace.commands.slice(commandStart);
            const stopIndex = raceCommands.findIndex((entry) => entry.command === 'stop');
            const barrierIndex = raceCommands.findIndex((entry) => entry.command === 'isready');
            const positionBIndex = raceCommands.findIndex((entry) => entry.command === `position fen ${RACE_FEN_B}`);
            const barrierObserved = stopIndex >= 0 && barrierIndex > stopIndex && positionBIndex > barrierIndex;
            const bestMoveLegalForB = isLegalBestMove(RACE_FEN_B, resultB.bestMove);
            const passed = outcomeA.code === 'engine-search-cancelled' && resultB.fen === RACE_FEN_B && barrierObserved && bestMoveLegalForB;
            tests.race = {
                status: outcomeA.completed ? 'inconclusive' : passed ? 'passed' : 'failed',
                requestA: outcomeA,
                requestB: resultB,
                staleMessagesIgnored: passed,
                barrierObserved,
                bestMoveLegalForB,
                infoBCount: infoB.length,
                elapsedMs: elapsed(raceStartedAt),
                errors: []
            };
        } else {
            tests.race = { status: 'skipped' };
        }

        const disposeStartedAt = performance.now();
        adapter.dispose();
        const disposedState = adapter.getState().state;
        let postDisposeCode = null;
        try { await adapter.initialize(); } catch (error) { postDisposeCode = error?.code; }
        tests.dispose = { status: disposedState === 'disposed' && postDisposeCode === 'engine-disposed' ? 'passed' : 'failed', state: disposedState, postDisposeCode, elapsedMs: elapsed(disposeStartedAt) };

        const missingUrl = new URL('/engine/caissa-intentionally-missing-worker.js', resolvedUrl);
        let invalidAdapter = null;
        try {
            const createInvalidEngine = createTracedEngineFactory({
                workerUrl: missingUrl.href,
                baseUrl: options.baseUrl,
                trace,
                startedAt,
                counters
            });
            invalidAdapter = new SafeEngineAdapter({ createEngine: createInvalidEngine, defaultTimeoutMs: 2000 });
            await invalidAdapter.initialize();
            tests.invalidUrl = { status: 'failed', errorCode: null };
        } catch (error) {
            tests.invalidUrl = { status: ['engine-load-failed', 'engine-initialization-timeout'].includes(error?.code) ? 'passed' : 'failed', errorCode: error?.code ?? null };
        } finally {
            invalidAdapter?.dispose();
        }

        const raceIterations = Math.max(1, Math.min(10, Number(options.raceIterations ?? 10)));
        const campaign = [];
        if (raceTest) {
            for (let iteration = 1; iteration <= raceIterations; iteration += 1) {
                const result = await runRaceIteration({ iteration, createEngine, trace, counters, searchTimeoutMs });
                result.activeTransportsAfterDispose = counters.activeTransports;
                campaign.push(result);
                if (result.status !== 'passed' || counters.activeTransports !== 0) break;
            }
        }
        const passedCampaign = campaign.length === raceIterations
            && campaign.every((result) => result.status === 'passed' && result.activeTransportsAfterDispose === 0);
        const timingValues = (key) => campaign.map((result) => result.timings?.[key]).filter(Number.isFinite);
        tests.raceCampaign = raceTest ? {
            status: passedCampaign ? 'passed' : 'failed',
            requestedIterations: raceIterations,
            completedIterations: campaign.length,
            passedIterations: campaign.filter((result) => result.status === 'passed').length,
            staleBestMovesObserved: campaign.reduce((sum, result) => sum + (result.staleBestMovesObserved ?? 0), 0),
            staleBestMovesAccepted: campaign.reduce((sum, result) => sum + (result.staleBestMovesAccepted ?? 0), 0),
            illegalBestMovesObserved: campaign.reduce((sum, result) => sum + (result.illegalBestMovesObserved ?? 0), 0),
            illegalBestMovesAccepted: campaign.reduce((sum, result) => sum + (result.illegalBestMovesAccepted ?? 0), 0),
            requestBFenMismatches: campaign.filter((result) => !result.requestBFenMatches).length,
            activeTransportsAfterDispose: counters.activeTransports,
            timings: {
                restartConstructionMs: timingSummary(timingValues('restartConstructionMs')),
                uciHandshakeMs: timingSummary(timingValues('uciHandshakeMs')),
                searchBMs: timingSummary(timingValues('searchBMs')),
                totalReplacementMs: timingSummary(timingValues('totalReplacementMs'))
            },
            iterations: campaign
        } : { status: 'skipped', iterations: [] };

        const required = ['factoryUrl', 'assetRequest', 'workerConstruction', 'initialization', 'fenValidation', 'bestMove', 'analysis', 'stop', 'searchAfterStop', 'race', 'dispose', 'invalidUrl', 'raceCampaign'];
        const ok = required.every((key) => tests[key]?.status === 'passed') && ['passed', 'unsupported'].includes(tests.multiPv.status);
        return {
            ok,
            workerUrl: resolvedUrl.href,
            initialization: tests.initialization,
            capabilities: { optionLines, supportedOptions: adapter.getState().supportedOptions },
            tests,
            timings: { totalMs: elapsed(startedAt), workerTerminatedAtMs: trace.terminatedAtMs },
            network,
            factoryCounts: {
                transportsCreated: counters.transportsCreated,
                transportsTerminated: counters.transportsTerminated,
                activeTransports: counters.activeTransports
            },
            trace: { commandCount: trace.commands.length, messageCount: trace.messages.length, entries: trace.entries, commands: trace.commands },
            errors
        };
    } catch (error) {
        errors.push(errorRecord('probe', error));
        report('probe-error', { code: error?.code ?? 'browser-error' });
        adapter?.dispose();
        return {
            ok: false,
            workerUrl: resolvedUrl?.href ?? null,
            initialization: tests.initialization ?? null,
            capabilities: {},
            tests,
            timings: { totalMs: elapsed(startedAt) },
            factoryCounts: {
                transportsCreated: counters.transportsCreated,
                transportsTerminated: counters.transportsTerminated,
                activeTransports: counters.activeTransports
            },
            errors
        };
    }
}
