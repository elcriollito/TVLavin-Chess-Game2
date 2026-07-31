(function (root) {
    'use strict';
    const C = root.CaissaPlayAnalyticsContracts;
    const dispatcher = root.CaissaPlayAnalytics;
    if (!C || !dispatcher) return;
    const LIMIT = 4;
    const pending = new Map();
    const diagnostics = { requests: 0, successes: 0, failures: 0, blocked: 0,
        duplicateRequestsSuppressed: 0, staleOutcomesIgnored: 0, attemptsEvicted: 0,
        invalidPayloads: 0, sinkFailures: 0, disposals: 0, lastReasonCode: 'unknown' };
    let attemptSequence = 0, disposed = false;
    const freeze = C.freeze;
    const allowed = (list, value, fallback = 'unknown') => list.includes(value) ? value : fallback;
    function timeCategory(value, explicit) {
        if (C.TIME_CONTROL_CATEGORIES.includes(explicit)) return explicit;
        if (!Number.isFinite(value)) return 'unknown';
        if (value === 0) return 'untimed';
        if (value <= 120) return 'bullet';
        if (value <= 599) return 'blitz';
        if (value <= 1799) return 'rapid';
        if (value >= 1800) return 'classical';
        return 'custom';
    }
    function categories(context = {}) {
        const mode = allowed(C.MODES, context.mode);
        return {
            mode,
            startSource: allowed(C.START_SOURCES, context.startSource),
            timeControlCategory: timeCategory(context.timeControlSeconds, context.timeControlCategory),
            colorCategory: allowed(C.COLOR_CATEGORIES, context.colorCategory || context.color),
            opponentType: allowed(C.OPPONENT_TYPES, context.opponentType),
            assistanceCategory: allowed(C.ASSISTANCE_CATEGORIES, context.assistanceCategory),
            qaEligible: context.qaEligible === true,
            productionEligible: context.productionEligible !== false,
            shellVersion: /^SimplifiedPlayShell@\d+\.\d+\.\d+$/.test(context.shellVersion)
                ? context.shellVersion : 'SimplifiedPlayShell@1.7.0'
        };
    }
    function payload(base, state, reason) {
        return { ...base.categories, startState: state, failureReason: reason,
            attemptSequence: base.attemptSequence };
    }
    function dispatch(id, body) {
        try {
            const event = dispatcher.createEvent(id, body);
            if (!event) { diagnostics.invalidPayloads += 1; return false; }
            const result = dispatcher.emit(event);
            if (!result?.ok) diagnostics.sinkFailures += 1;
            return !!result?.ok;
        } catch (_) { diagnostics.sinkFailures += 1; return false; }
    }
    function evict() {
        while (pending.size >= LIMIT) {
            const oldest = pending.keys().next().value;
            pending.delete(oldest); diagnostics.attemptsEvicted += 1;
        }
    }
    function observeRequest(context = {}) {
        if (disposed) return freeze({ ok: false, status: 'disposed', reason: 'disposed' });
        const key = typeof context.actionKey === 'string' ? context.actionKey : null;
        const duplicate = key && [...pending.values()].find(item => item.actionKey === key);
        if (duplicate) {
            diagnostics.duplicateRequestsSuppressed += 1; diagnostics.lastReasonCode = 'duplicate-action';
            dispatch('play_game_start_deduplicated', payload(duplicate, 'deduplicated', 'duplicate-action'));
            return freeze({ ok: true, status: 'deduplicated', attemptSequence: duplicate.attemptSequence });
        }
        evict();
        const attempt = freeze({ attemptSequence: ++attemptSequence, actionKey: key, categories: categories(context) });
        pending.set(attempt.attemptSequence, attempt);
        const blocked = context.blocked === true;
        dispatch(blocked ? 'play_game_start_blocked' : 'play_game_start_requested',
            payload(attempt, blocked ? 'blocked' : 'requested', blocked
                ? allowed(C.START_FAILURE_REASONS, context.failureReason) : 'unknown'));
        if (blocked) { pending.delete(attempt.attemptSequence); diagnostics.blocked += 1; }
        else diagnostics.requests += 1;
        diagnostics.lastReasonCode = blocked ? allowed(C.START_FAILURE_REASONS, context.failureReason) : 'unknown';
        return freeze({ ok: true, status: blocked ? 'blocked' : 'requested', attemptSequence: attempt.attemptSequence });
    }
    function terminal(context, kind) {
        if (disposed) return freeze({ ok: false, status: 'disposed', reason: 'disposed' });
        const sequence = context?.attemptSequence;
        const attempt = pending.get(sequence);
        if (!attempt) { diagnostics.staleOutcomesIgnored += 1; diagnostics.lastReasonCode = 'stale-action';
            return freeze({ ok: true, status: 'stale', reason: 'stale-action' }); }
        pending.delete(sequence);
        if (kind === 'success' && context?.ready !== true) kind = 'failure';
        const succeeded = kind === 'success';
        const reason = succeeded ? 'unknown' : allowed(C.START_FAILURE_REASONS, context?.failureReason);
        dispatch(succeeded ? 'play_game_start_succeeded' : 'play_game_start_failed',
            payload(attempt, succeeded ? 'succeeded' : 'failed', reason));
        diagnostics[succeeded ? 'successes' : 'failures'] += 1; diagnostics.lastReasonCode = reason;
        return freeze({ ok: true, status: succeeded ? 'succeeded' : 'failed', attemptSequence: sequence });
    }
    const observeSuccess = context => terminal(context, 'success');
    const observeFailure = context => terminal(context, 'failure');
    function observeBlocked(context = {}) { return observeRequest({ ...context, blocked: true }); }
    function observePanelStart(context, action) {
        const request = observeRequest(context);
        if (request.status !== 'requested') return action();
        let outcome;
        try { outcome = action(); } catch (error) {
            observeFailure({ attemptSequence: request.attemptSequence, failureReason: 'lifecycle-rejected' }); throw error;
        }
        const lifecycle = root.CaissaGameLifecycle?.getSnapshot?.();
        const boardReady = !!(root.App?.board || root.CaissaChessboardAdapter?.getSnapshot?.().mounted);
        const ready = !!outcome?.ok && (lifecycle?.state === 'active' || lifecycle?.status === 'active') && boardReady;
        if (outcome?.ok) observeSuccess({ attemptSequence: request.attemptSequence, ready });
        else observeFailure({ attemptSequence: request.attemptSequence,
            failureReason: outcome?.reasonCode === 'DISPOSED' ? 'disposed' : 'dependency-unavailable' });
        return outcome;
    }
    function getSnapshot() { return freeze({ schemaVersion: 'PlayGameStartAnalytics@1.0.0', disposed,
        pendingAttempts: pending.size, pendingLimit: LIMIT, diagnostics: { ...diagnostics } }); }
    function dispose() { if (!disposed) { disposed = true; pending.clear(); diagnostics.disposals += 1; }
        return getSnapshot(); }
    root.CaissaPlayGameStartAnalytics = Object.freeze({ VERSION: 'PlayGameStartAnalytics@1.0.0',
        PAYLOAD_VERSION: 'PlayGameStartPayload@1.0.0', timeCategory, observeRequest, observeSuccess,
        observeFailure, observeBlocked, observePanelStart, getSnapshot, inspect: getSnapshot, dispose });
})(typeof window !== 'undefined' ? window : globalThis);
