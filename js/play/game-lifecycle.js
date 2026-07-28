/**
 * Passive CAISSA Play lifecycle observer 1.0.0.
 * Legacy Play remains authoritative except for local clocks, owned by ClockService.
 */
(function installGameLifecycle(global) {
    'use strict';
    const VERSION = '1.0.0';
    if (global.CaissaGameLifecycle?.schemaVersion === VERSION) return;
    const STATES = Object.freeze([
        'idle', 'configuring', 'starting', 'active', 'paused', 'awaiting-promotion',
        'ending', 'completed', 'analyzing', 'reviewing', 'rematch-pending',
        'error', 'disposed', 'unknown'
    ]);
    const EVENTS = Object.freeze([
        'GAME_CONFIGURATION_CHANGED', 'GAME_REQUESTED', 'GAME_STARTING', 'GAME_STARTED',
        'MOVE_REQUESTED', 'MOVE_COMMITTED', 'MOVE_REJECTED', 'PROMOTION_REQUIRED',
        'PROMOTION_COMPLETED', 'CLOCK_UPDATED', 'GAME_END_REQUESTED', 'GAME_COMPLETED',
        'GAME_RESET', 'ANALYSIS_REQUESTED', 'MENTOR_REVIEW_REQUESTED', 'REMATCH_REQUESTED',
        'ENGINE_REQUESTED', 'ENGINE_RESPONSE_ACCEPTED', 'ENGINE_RESPONSE_REJECTED',
        'ENGINE_FAILED', 'CONNECTION_LOST', 'SESSION_DISPOSED', 'LEGACY_STATE_SYNCED',
        'UNKNOWN_EVENT'
    ]);
    const REASONS = Object.freeze({
        LEGACY_SNAPSHOT_DERIVED: 'LEGACY_SNAPSHOT_DERIVED',
        GAME_START_REQUESTED: 'GAME_START_REQUESTED',
        MOVE_COMMITTED: 'MOVE_COMMITTED',
        PROMOTION_PENDING: 'PROMOTION_PENDING',
        RESULT_OBSERVED: 'RESULT_OBSERVED',
        RESET_OBSERVED: 'RESET_OBSERVED',
        INVALID_TRANSITION: 'INVALID_TRANSITION',
        IDENTICAL_SNAPSHOT: 'IDENTICAL_SNAPSHOT',
        SESSION_DISPOSED: 'SESSION_DISPOSED',
        INVALID_INPUT: 'INVALID_INPUT'
    });
    const TABLE = Object.freeze({
        idle: Object.freeze(['configuring', 'starting', 'active', 'disposed', 'error']),
        configuring: Object.freeze(['starting', 'idle', 'disposed', 'error']),
        starting: Object.freeze(['active', 'idle', 'error', 'disposed']),
        active: Object.freeze(['awaiting-promotion', 'ending', 'completed', 'idle', 'error', 'disposed']),
        paused: Object.freeze(['active', 'idle', 'disposed', 'error']),
        'awaiting-promotion': Object.freeze(['active', 'ending', 'completed', 'idle', 'error', 'disposed']),
        ending: Object.freeze(['completed', 'error', 'disposed']),
        completed: Object.freeze(['analyzing', 'reviewing', 'rematch-pending', 'starting', 'active', 'idle', 'disposed']),
        analyzing: Object.freeze(['completed', 'idle', 'disposed', 'error']),
        reviewing: Object.freeze(['completed', 'idle', 'disposed']),
        'rematch-pending': Object.freeze(['starting', 'idle', 'disposed']),
        error: Object.freeze(['idle', 'starting', 'disposed']),
        disposed: Object.freeze([]),
        unknown: Object.freeze(['idle', 'configuring', 'starting', 'active', 'completed', 'error', 'disposed'])
    });
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze);
            Object.freeze(value);
        }
        return value;
    };
    const clone = value => JSON.parse(JSON.stringify(value));
    const compactKey = snapshot => JSON.stringify({
        state: snapshot.state, mounted: snapshot.mounted, active: snapshot.active,
        section: snapshot.section, mode: snapshot.mode, turn: snapshot.turn,
        moveCount: snapshot.moveCount, pendingPromotion: snapshot.pendingPromotion,
        gameStatus: snapshot.gameStatus, result: snapshot.result,
        engineBusy: snapshot.engineBusy, evaluationAvailable: snapshot.evaluationAvailable,
        clocksRunning: snapshot.clocksRunning, clockActiveColor: snapshot.clockActiveColor,
        timedOutColor: snapshot.timedOutColor
    });
    function deriveState(snapshot, disposed = false) {
        if (disposed) return 'disposed';
        if (!snapshot || typeof snapshot !== 'object') return 'unknown';
        if (snapshot.game?.pendingPromotion) return 'awaiting-promotion';
        if (snapshot.game?.result && snapshot.game?.active === false) return 'completed';
        if (snapshot.section === 'analyze' && snapshot.game?.active === false) return 'analyzing';
        if (snapshot.game?.active === true) return 'active';
        if (snapshot.mounted === true) return 'idle';
        return 'idle';
    }
    function createLifecycle({ now = Date.now, sessionIdFactory, transitionIdFactory, historyLimit = 100 } = {}) {
        const limit = Math.max(1, Math.min(200, Number.isSafeInteger(historyLimit) ? historyLimit : 100));
        let sessionSequence = 0;
        let transitionSequence = 0;
        let disposed = false;
        let lifecycleSessionId = null;
        let current = null;
        const history = [];
        const counters = { syncs: 0, transitions: 0, rejected: 0, unchanged: 0, sessions: 0 };
        const makeSessionId = () => sessionIdFactory?.() || `lifecycle-session:${++sessionSequence}`;
        const makeTransitionId = () => transitionIdFactory?.() || `lifecycle-transition:${++transitionSequence}`;
        const snapshotFrom = legacy => freeze({
            schemaVersion: VERSION,
            lifecycleSessionId,
            state: deriveState(legacy, disposed),
            mounted: legacy?.mounted === true,
            active: legacy?.game?.active === true,
            section: typeof legacy?.section === 'string' ? legacy.section.slice(0, 40) : null,
            mode: typeof legacy?.mode === 'string' ? legacy.mode.slice(0, 40) : null,
            turn: legacy?.position?.turn ?? null,
            moveCount: Number.isSafeInteger(legacy?.position?.moveCount) ? legacy.position.moveCount : null,
            pendingPromotion: Boolean(legacy?.game?.pendingPromotion),
            gameStatus: legacy?.game?.status?.state ?? null,
            result: legacy?.game?.result ?? null,
            engineBusy: legacy?.engine?.busy === true,
            evaluationAvailable: legacy?.evaluation?.available === true,
            clocksRunning: legacy?.clocks?.running === true,
            clockActiveColor: legacy?.clocks?.activeColor ?? null,
            timedOutColor: legacy?.clocks?.timedOutColor ?? null,
            capturedAt: new Date(now()).toISOString(),
            legacySnapshotVersion: legacy?.schemaVersion ?? null
        });
        function record(event, before, after, accepted, reasonCode, metadata = {}) {
            const transition = freeze({
                schemaVersion: VERSION,
                transitionId: makeTransitionId(),
                lifecycleSessionId,
                event: EVENTS.includes(event) ? event : 'UNKNOWN_EVENT',
                fromState: before?.state ?? 'unknown',
                toState: after?.state ?? before?.state ?? 'unknown',
                accepted,
                status: accepted ? 'accepted' : 'rejected',
                reasonCode,
                occurredAt: new Date(now()).toISOString(),
                commandId: typeof metadata.commandId === 'string' ? metadata.commandId.slice(0, 160) : null,
                engineRequestId: typeof metadata.engineRequestId === 'string' ? metadata.engineRequestId.slice(0, 160) : null,
                positionToken: typeof metadata.positionToken === 'string' ? metadata.positionToken.slice(0, 160) : null,
                snapshotBefore: before,
                snapshotAfter: after,
                diagnostics: freeze([])
            });
            history.push(transition);
            if (history.length > limit) history.splice(0, history.length - limit);
            counters[accepted ? 'transitions' : 'rejected'] += 1;
            return transition;
        }
        function sync(legacy, event = 'LEGACY_STATE_SYNCED', metadata = {}) {
            if (disposed) return freeze({ ok: false, status: 'disposed', transition: null });
            if (!legacy || typeof legacy !== 'object')
                return freeze({ ok: false, status: 'invalid', transition: null });
            counters.syncs += 1;
            if (!lifecycleSessionId) {
                lifecycleSessionId = makeSessionId();
                counters.sessions += 1;
            }
            const next = snapshotFrom(clone(legacy));
            if (current && compactKey(current) === compactKey(next)) {
                counters.unchanged += 1;
                return freeze({ ok: true, status: 'unchanged', snapshot: current, transition: null });
            }
            const previous = current;
            const allowed = !previous || previous.state === next.state
                || TABLE[previous.state]?.includes(next.state);
            if (!allowed)
                return freeze({ ok: false, status: 'rejected',
                    transition: record(event, previous, next, false, REASONS.INVALID_TRANSITION) });
            current = next;
            return freeze({ ok: true, status: 'accepted',
                snapshot: current,
                transition: record(event, previous, next, true, REASONS.LEGACY_SNAPSHOT_DERIVED, metadata) });
        }
        function rotateSession() {
            if (disposed) return null;
            lifecycleSessionId = makeSessionId();
            current = null;
            counters.sessions += 1;
            return lifecycleSessionId;
        }
        function validateTransition(from, to) {
            return STATES.includes(from) && STATES.includes(to)
                && (from === to || TABLE[from]?.includes(to));
        }
        function dispose() {
            if (disposed) return freeze({ ok: true, status: 'disposed' });
            const before = current;
            disposed = true;
            current = snapshotFrom({});
            record('SESSION_DISPOSED', before, current, true, REASONS.SESSION_DISPOSED);
            return freeze({ ok: true, status: 'disposed' });
        }
        return freeze({
            sync, rotateSession, validateTransition,
            getSnapshot: () => current ? freeze(clone(current)) : null,
            getHistory: () => freeze(clone(history)),
            clearHistory: () => { history.length = 0; return true; },
            inspect: () => freeze({ lifecycleSessionId, disposed, historySize: history.length,
                historyLimit: limit, counters: { ...counters } }),
            dispose
        });
    }
    const lifecycle = createLifecycle();
    global.CaissaGameLifecycle = freeze({
        schemaVersion: VERSION,
        snapshotSchemaVersion: VERSION,
        transitionSchemaVersion: VERSION,
        states: STATES, events: EVENTS, reasonCodes: REASONS, transitions: TABLE,
        deriveState, createLifecycle,
        sync: (...args) => lifecycle.sync(...args),
        rotateSession: (...args) => lifecycle.rotateSession(...args),
        validateTransition: (...args) => lifecycle.validateTransition(...args),
        getSnapshot: (...args) => lifecycle.getSnapshot(...args),
        getHistory: (...args) => lifecycle.getHistory(...args),
        clearHistory: (...args) => lifecycle.clearHistory(...args),
        inspect: (...args) => lifecycle.inspect(...args),
        dispose: (...args) => lifecycle.dispose(...args)
    });
})(window);
