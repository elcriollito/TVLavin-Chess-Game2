(function installPlayableReadiness(root) {
    'use strict';

    const VERSION = '1.0.0';
    const CONTRACT_ID = `PlayV2PlayableReadiness@${VERSION}`;
    if (root.CaissaPlayV2PlayableReadiness?.contractId === CONTRACT_ID) return;

    const STATES = Object.freeze(['booting', 'ready', 'starting', 'playing', 'postgame', 'recoverable-error', 'unavailable']);
    const TRANSITIONS = Object.freeze({
        booting: Object.freeze(['ready', 'recoverable-error', 'unavailable']),
        ready: Object.freeze(['booting', 'starting', 'unavailable']),
        starting: Object.freeze(['playing', 'recoverable-error', 'unavailable']),
        playing: Object.freeze(['postgame', 'ready', 'unavailable']),
        postgame: Object.freeze(['ready', 'starting', 'unavailable']),
        'recoverable-error': Object.freeze(['booting', 'unavailable']),
        unavailable: Object.freeze([])
    });
    const CLASSIFICATIONS = Object.freeze({ games: 'required', bots: 'uncertified', coach: 'locally-assistance-certified', mentor: 'blocked', players: 'blocked' });
    const BOTS_READINESS = Object.freeze({ internallySelectable: true, configurationValid: true,
        runtimeAvailable: true, workerRequiredAtStart: true, workerProductionCertification: 'local-production-build-ready',
        publicReady: false, inheritsGamesReadiness: false, fallback: 'none' });
    const COACH_READINESS = Object.freeze({ internallySelectable: true, cleanResourcesRequired: true,
        certifiedGamesOwnersRequired: true, validConfigurationRequired: true, boundedAssistanceRequired: true,
        prohibitedResourcesAllowed: false, learningWriteOwnerAllowed: false, inheritsGamesReadiness: false,
        assistanceCertification: 'local-automated-certified', humanContentReview: 'pending', physicalDeviceVerification: 'pending', namedScreenReaderVerification: 'pending', publicReady: false });
    const REQUIREMENTS = Object.freeze([
        'entryGate', 'shell', 'primaryBoardCount', 'board', 'mode', 'timeControl', 'color',
        'opponentProvider', 'opponentSession', 'clock', 'rulesAuthority', 'lifecycle',
        'gameRecordOwner', 'postGameOwner', 'analyzeHandoff', 'primaryCTA', 'workerRequirement',
        'fallback', 'ficsFallback', 'educationalFallback', 'playersFallback', 'analyticsTransport'
    ]);
    const DEADLINE_MS = 2000;
    const POLL_MS = 50;
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const safeSelection = value => value && typeof value === 'object' && !Array.isArray(value)
        && !Object.keys(value).some(key => ['__proto__', 'prototype', 'constructor'].includes(key));
    const outcome = (ok, status, reasonCode, value = null) => freeze({ ok, status, reasonCode, value });

    function defaultProbe(selection = {}) {
        const route = root.CaissaPlayRouteController?.getCurrent?.();
        const lifecycle = root.CaissaGameLifecycle?.getSnapshot?.();
        const boardNodes = root.document?.querySelectorAll?.('#playSection #chessboard .board-b72b1') || [];
        const board = root.App?.board;
        const game = root.App?.game;
        const engine = root.App?.engine;
        const beta = root.CaissaPlayV2BetaEntry;
        const publicBeta = root.CaissaPlayV2PublicBetaPolicy;
        const internalEntry = beta?.contractId === 'PlayV2BetaEntry@1.0.0'
            && (route?.metadata?.betaEntry === true || route?.query?.simplified === '1');
        const publicEntry = publicBeta?.contractId === 'PlayV2PublicBetaPolicy@1.0.0'
            && ['public-beta','official'].includes(root.document?.body?.dataset?.caissaPlayV2Entry)
            && route?.metadata?.betaEntry === true;
        const timeValid = Number.isInteger(selection.seconds) && selection.seconds > 0
            && Number.isInteger(selection.incrementSeconds) && selection.incrementSeconds >= 0;
        const modeValid = selection.mode === 'games'
            && root.CaissaPlayV2ProductBoundary?.isModeAllowed?.('games') === true
            && root.CaissaPlayV2FicsIsolation?.isModeAllowed?.('games') === true;
        const probes = {
            entryGate: internalEntry || publicEntry,
            shell: !!root.document?.querySelector?.('[data-caissa-simplified-shell]'),
            primaryBoardCount: boardNodes.length === 1,
            board: !!board && ['position', 'orientation', 'resize'].every(name => typeof board[name] === 'function'),
            mode: modeValid,
            timeControl: timeValid,
            color: ['white', 'random', 'black'].includes(selection.color),
            opponentProvider: !!engine && typeof engine.getBestMove === 'function',
            opponentSession: !!root.CaissaEngineRequestIsolation?.createSession,
            clock: !!root.CaissaClockService && ['configure', 'start', 'stop', 'getSnapshot'].every(name => typeof root.CaissaClockService[name] === 'function'),
            rulesAuthority: !!game && ['fen', 'turn', 'move', 'moves'].every(name => typeof game[name] === 'function'),
            lifecycle: !!root.CaissaGameLifecycle && (!lifecycle || lifecycle.state === 'idle'),
            gameRecordOwner: typeof root.CaissaGameRecord?.buildFromPlay === 'function',
            postGameOwner: typeof root.CaissaPostGameExperience?.create === 'function',
            analyzeHandoff: typeof root.CaissaAnalyzeHandoff?.createFromCompletedPlayRecord === 'function',
            primaryCTA: true,
            workerRequirement: true,
            fallback: true, ficsFallback: true, educationalFallback: true, playersFallback: true,
            analyticsTransport: (publicEntry ? publicBeta : beta)?.analyticsTransport === 'disabled'
        };
        const failed = REQUIREMENTS.filter(name => probes[name] !== true);
        return freeze({ ready: failed.length === 0, probes, failed });
    }

    function create(options = {}) {
        const now = typeof options.now === 'function' ? options.now : Date.now;
        const schedule = typeof options.schedule === 'function' ? options.schedule : (callback, delay) => root.setTimeout(callback, delay);
        const cancelSchedule = typeof options.cancelSchedule === 'function' ? options.cancelSchedule : handle => root.clearTimeout(handle);
        const probe = typeof options.probe === 'function' ? options.probe : defaultProbe;
        const deadlineMs = Number.isInteger(options.deadlineMs) && options.deadlineMs > 0 ? Math.min(options.deadlineMs, DEADLINE_MS) : DEADLINE_MS;
        let state = 'booting'; let selection = null; let result = null; let timer = null; let token = 0;
        let retries = 0; let disposed = false; let startedAt = null; let listener = null;
        const diagnostics = { probes: 0, starts: 0, duplicateStarts: 0, failures: 0, cancellations: 0, staleResults: 0 };
        const snapshot = () => freeze({ contractId: CONTRACT_ID, state, selection: selection ? { ...selection } : null,
            ready: state === 'ready', result, deadlineMs, retries, disposed, diagnostics: { ...diagnostics } });
        const emit = () => { try { listener?.(snapshot()); } catch (_) {} };
        const clear = () => { if (timer !== null) { cancelSchedule(timer); timer = null; } };
        const setState = next => {
            if (next !== state && !TRANSITIONS[state]?.includes(next)) return false;
            state = next; emit(); return true;
        };
        const runProbe = currentToken => {
            if (disposed || currentToken !== token) { diagnostics.staleResults += 1; return; }
            diagnostics.probes += 1;
            try { result = probe(selection); } catch (_) { result = { ready: false, probes: {}, failed: ['malformedInternalState'] }; }
            if (result?.ready === true) { clear(); setState('ready'); return; }
            if (now() - startedAt >= deadlineMs) { clear(); diagnostics.failures += 1; setState('recoverable-error'); return; }
            timer = schedule(() => runProbe(currentToken), POLL_MS);
        };
        const boot = input => {
            if (disposed || !safeSelection(input)) return outcome(false, 'rejected', 'INVALID_SELECTION');
            clear(); token += 1; selection = { ...input }; result = null; startedAt = now();
            if (state !== 'booting' && !setState('booting')) return outcome(false, 'rejected', 'INVALID_TRANSITION');
            emit(); runProbe(token); return outcome(true, 'accepted', 'BOOT_STARTED', snapshot());
        };
        const retry = () => {
            if (state !== 'recoverable-error' || retries >= 1) return outcome(false, 'rejected', 'RETRY_UNAVAILABLE');
            retries += 1; return boot(selection);
        };
        const beginStart = () => {
            if (state === 'starting') { diagnostics.duplicateStarts += 1; return outcome(false, 'rejected', 'DUPLICATE_START'); }
            if (state !== 'ready') return outcome(false, 'rejected', 'NOT_READY');
            diagnostics.starts += 1; startedAt = now(); setState('starting');
            const startToken = ++token; timer = schedule(() => {
                if (!disposed && token === startToken && state === 'starting') {
                    diagnostics.failures += 1; setState('recoverable-error');
                }
            }, deadlineMs);
            return outcome(true, 'accepted', 'STARTING', snapshot());
        };
        const completeStart = success => {
            if (state !== 'starting') return outcome(false, 'rejected', 'STALE_START');
            clear(); token += 1;
            if (success === true) { setState('playing'); return outcome(true, 'accepted', 'PLAYING', snapshot()); }
            diagnostics.failures += 1; setState('recoverable-error'); return outcome(false, 'failed', 'START_FAILED', snapshot());
        };
        const cancel = reason => {
            if (disposed) return outcome(true, 'unchanged', 'DISPOSED');
            clear(); token += 1; diagnostics.cancellations += 1;
            if (state !== 'unavailable') setState('unavailable');
            return outcome(true, 'accepted', String(reason || 'CANCELLED').slice(0, 80), snapshot());
        };
        return freeze({ boot, retry, beginStart, completeStart, cancel,
            markPostGame: () => state === 'playing' && setState('postgame'),
            reset: () => ['playing', 'postgame'].includes(state) && setState('ready'),
            subscribe: callback => { listener = typeof callback === 'function' ? callback : null; return () => { listener = null; }; },
            getSnapshot: snapshot, dispose: () => { cancel('DISPOSED'); disposed = true; emit(); return true; } });
    }

    root.CaissaPlayV2PlayableReadiness = freeze({ schemaVersion: VERSION, contractId: CONTRACT_ID,
        states: STATES, transitions: TRANSITIONS, classifications: CLASSIFICATIONS, botsReadiness: BOTS_READINESS,
        coachReadiness: COACH_READINESS,
        requirements: REQUIREMENTS, deadlines: freeze({ bootMs: DEADLINE_MS, startMs: DEADLINE_MS, pollMs: POLL_MS }),
        defaultProbe, create });
})(typeof window !== 'undefined' ? window : globalThis);
