(function installBotWorkerReadiness(global) {
    'use strict';

    const VERSION = '1.0.0';
    const CONTRACT_ID = `PlayV2BotWorkerReadiness@${VERSION}`;
    const WORKER_URL = '/engine/stockfish-working.js';
    const STATES = Object.freeze(['idle', 'initializing', 'ready', 'playing', 'postgame',
        'recoverable-error', 'unavailable', 'disposed']);
    const EXIT_REASONS = Object.freeze(['initialization-failure', 'handshake-timeout', 'worker-error',
        'message-error', 'search-failure', 'game-end', 'postgame', 'rematch', 'new-game', 'analyze',
        'back', 'mode-switch', 'route-exit', 'pagehide', 'gate-disable', 'retry', 'dispose']);
    const contract = Object.freeze({
        schemaVersion: VERSION, contractId: CONTRACT_ID, workerOwner: 'EngineAdapter',
        lifecycleOwner: 'Native Bots session', maximumActiveWorkers: 1,
        bootstrapCreatesWorker: false, passiveEntryCreatesWorker: false,
        profileSelectionCreatesWorker: false, readinessProbeCreatesWorker: false,
        playCommitCreatesWorker: true, workerOrigin: 'same-origin',
        workerUrl: 'canonical-and-allowlisted', canonicalWorkerUrl: WORKER_URL,
        arbitraryWorkerUrl: 'prohibited', queryOverride: 'prohibited',
        handshake: 'bounded-and-generation-attributed', staleResponses: 'rejected',
        teardownOnOwnershipExit: 'required', orphanWorkers: 'prohibited',
        automaticRetry: 'prohibited', explicitRetry: 'one-at-a-time', silentFallback: 'prohibited',
        ficsFallback: 'prohibited', remoteFallback: 'prohibited', analyticsTransport: 'disabled',
        productionBuildReady: 'evidence-dependent', deployedProductionVerified: false,
        physicalDeviceVerified: false, publicReady: false,
        deadlines: Object.freeze({ uciokMs: 4000, readyokMs: 4000 }),
        states: STATES, exitReasons: EXIT_REASONS
    });

    let state = 'idle';
    let pending = null;
    let retries = 0;
    let preparedSessionId = null;
    let subscriber = null;
    let disposed = false;
    const diagnostics = { starts: 0, duplicateStarts: 0, retries: 0, teardowns: 0,
        failures: 0, maximumActiveWorkers: 0, staleCompletions: 0 };
    const freeze = value => Object.freeze(value);
    const activeCount = () => Number(Boolean(global.App?.engine?.engine));
    const snapshot = () => freeze({ contractId: CONTRACT_ID, state, retries, preparedSessionId,
        activeWorkerCount: activeCount(), diagnostics: freeze({ ...diagnostics }) });
    const emit = () => { diagnostics.maximumActiveWorkers = Math.max(diagnostics.maximumActiveWorkers, activeCount());
        try { subscriber?.(snapshot()); } catch (_) {} };
    const outcome = (ok, status, reasonCode, value = snapshot()) => freeze({ ok, status, reasonCode, value });

    function isAuthorizedBotsRoute() {
        const route = global.CaissaPlayRouteController?.getCurrent?.();
        return route?.section === 'play' && route?.mode === 'bots'
            && (route?.metadata?.betaEntry === true || route?.query?.simplified === '1');
    }

    function teardown(reason = 'dispose') {
        if (!EXIT_REASONS.includes(reason)) reason = 'dispose';
        const operation = pending;
        pending = null;
        if (global.App?.engine) global.App.engine.terminate(reason);
        preparedSessionId = null;
        diagnostics.teardowns += 1;
        if (!disposed) state = reason === 'game-end' || reason === 'postgame' ? 'postgame' : 'idle';
        emit();
        return outcome(true, 'accepted', reason.toUpperCase().replaceAll('-', '_'));
    }

    async function begin(options = {}) {
        if (disposed || !isAuthorizedBotsRoute()) return outcome(false, 'rejected', 'BOTS_ROUTE_NOT_AUTHORIZED');
        if (pending || state === 'initializing') { diagnostics.duplicateStarts += 1; return outcome(false, 'rejected', 'START_IN_PROGRESS'); }
        const profile = global.CaissaBotSession?.getSnapshot?.()?.selectedProfile;
        if (!profile || !['white', 'black'].includes(options.color)
            || !Number.isInteger(options.timeControl) || options.timeControl < 0) {
            return outcome(false, 'rejected', 'INVALID_SELECTION');
        }
        if (activeCount()) teardown(options.retry === true ? 'retry' : 'new-game');
        const session = global.CaissaBotSession.beginGame();
        if (!session?.ok) return outcome(false, 'rejected', session?.reasonCode || 'SESSION_REJECTED');
        preparedSessionId = session.value.sessionId;
        state = 'initializing'; diagnostics.starts += 1; emit();
        const marker = {};
        pending = marker;
        try {
            await global.App?.engine?.start?.();
            if (pending !== marker || !preparedSessionId) { diagnostics.staleCompletions += 1;
                return outcome(false, 'rejected', 'STALE_INITIALIZATION'); }
            pending = null; state = 'ready'; emit();
            return outcome(true, 'accepted', 'WORKER_READY');
        } catch (error) {
            if (pending === marker) pending = null;
            global.App?.engine?.terminate(error?.code || 'initialization-failure');
            preparedSessionId = null; diagnostics.failures += 1;
            state = retries < 1 ? 'recoverable-error' : 'unavailable'; emit();
            return outcome(false, state, error?.code || 'WORKER_INITIALIZATION_FAILED');
        }
    }

    async function retry(options = {}) {
        if (state !== 'recoverable-error' || retries >= 1 || pending) return outcome(false, 'rejected', 'RETRY_UNAVAILABLE');
        retries += 1; diagnostics.retries += 1; teardown('retry');
        return begin({ ...options, retry: true });
    }

    function markPlaying() { if (state !== 'ready') return false; state = 'playing'; emit(); return true; }
    function consumePreparedSession() {
        if (!preparedSessionId || global.CaissaBotSession?.getSnapshot?.()?.sessionId !== preparedSessionId) return false;
        preparedSessionId = null; return true;
    }
    function installLifecycleListeners() {
        global.addEventListener?.('caissa-game-end', () => {
            if (['playing', 'ready', 'initializing'].includes(state)) teardown('game-end');
        });
        global.addEventListener?.('pagehide', () => teardown('pagehide'));
        global.addEventListener?.('caissa-engine-failure', () => {
            if (!['playing', 'ready', 'initializing'].includes(state)) return;
            if (activeCount()) teardown('search-failure');
            state = 'unavailable'; diagnostics.failures += 1; emit();
        });
        global.CaissaPlayRouteController?.subscribe?.(route => {
            if (route?.mode !== 'bots' && activeCount()) teardown(route?.section === 'play' ? 'mode-switch' : 'route-exit');
        });
    }
    installLifecycleListeners();

    global.CaissaPlayV2BotWorkerReadiness = Object.freeze({ ...contract, begin, retry, teardown,
        markPlaying, consumePreparedSession, getSnapshot: snapshot, inspect: snapshot,
        subscribe(callback) { subscriber = typeof callback === 'function' ? callback : null; emit();
            return () => { subscriber = null; }; },
        dispose() { teardown('dispose'); disposed = true; state = 'disposed'; emit(); return true; }
    });
})(typeof window !== 'undefined' ? window : globalThis);
