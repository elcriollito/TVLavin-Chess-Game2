(function (root) {
    'use strict';
    const C = root.CaissaPlayAnalyticsContracts, D = root.CaissaPlayAnalytics;
    if (!C || !D) return;
    const LIMIT = 8, actions = new Map(), shown = new Set();
    const diagnostics = { shown: 0, actionsSelected: 0, actionsSucceeded: 0, actionsFailed: 0,
        actionsBlocked: 0, actionDuplicatesSuppressed: 0, staleOutcomesIgnored: 0, sinkFailures: 0,
        recordsEvicted: 0, disposals: 0, lastReasonCode: 'unknown' };
    let actionSequence = 0, disposed = false;
    const actionMap = Object.freeze({ 'copy-pgn': 'pgn-copy', 'download-pgn': 'pgn-download' });
    const mapAction = value => C.POSTGAME_ACTIONS.includes(actionMap[value] || value) ? actionMap[value] || value : 'unknown';
    function base(context, action, state, reason, sequence) { return { mode: C.MODES.includes(context.mode) ? context.mode : 'games',
        action, actionState: state, failureReason: C.ACTION_FAILURE_REASONS.includes(reason) ? reason : 'unknown',
        resultCategory: C.RESULT_CATEGORIES.includes(context.resultCategory) ? context.resultCategory : 'unknown',
        terminationCategory: C.TERMINATION_CATEGORIES.includes(context.terminationCategory) ? context.terminationCategory : 'unknown',
        source: 'postgame', qaEligible: context.qaEligible !== false, productionEligible: context.productionEligible === true,
        completionSequence: context.completionSequence, actionSequence: sequence, shellVersion: 'SimplifiedPlayShell@1.7.0' }; }
    function dispatch(id, payload) { try { const event = D.createEvent(id, payload); if (!event) return false;
        const result = D.emit(event); if (!result?.ok) diagnostics.sinkFailures += 1; return !!result?.ok;
    } catch (_) { diagnostics.sinkFailures += 1; return false; } }
    function observeShown(context = {}) { if (disposed || !Number.isSafeInteger(context.completionSequence)) return false;
        if (shown.has(context.completionSequence)) { diagnostics.actionDuplicatesSuppressed += 1; return false; }
        shown.add(context.completionSequence); const seq = ++actionSequence;
        dispatch('play_postgame_shown', base(context, 'unknown', 'succeeded', 'unknown', seq)); diagnostics.shown += 1; return true; }
    function observeActionSelected(context = {}) { if (disposed || !Number.isSafeInteger(context.completionSequence)) return null;
        const seq = ++actionSequence, action = mapAction(context.action); actions.set(seq, C.freeze({ ...context, action }));
        while (actions.size > LIMIT) { actions.delete(actions.keys().next().value); diagnostics.recordsEvicted += 1; }
        dispatch('play_postgame_action_selected', base(context, action, 'selected', 'unknown', seq)); diagnostics.actionsSelected += 1;
        return C.freeze({ actionSequence: seq }); }
    function outcome(context, state) { const record = actions.get(context?.actionSequence);
        if (!record) { diagnostics.staleOutcomesIgnored += 1; return false; } actions.delete(context.actionSequence);
        const reason = context.failureReason || 'unknown', id = state === 'succeeded' ? 'play_postgame_action_succeeded'
            : state === 'blocked' ? 'play_postgame_action_blocked' : 'play_postgame_action_failed';
        dispatch(id, base(record, record.action, state, reason, context.actionSequence));
        diagnostics[state === 'succeeded' ? 'actionsSucceeded' : state === 'blocked' ? 'actionsBlocked' : 'actionsFailed'] += 1;
        diagnostics.lastReasonCode = reason; return true; }
    const observeActionSucceeded = context => outcome(context, 'succeeded');
    const observeActionFailed = context => outcome(context, 'failed');
    const observeActionBlocked = context => outcome(context, 'blocked');
    function getSnapshot() { return C.freeze({ schemaVersion: 'PlayPostGameAnalytics@1.0.0', disposed,
        shownCount: shown.size, actionRecordCount: actions.size, actionRecordLimit: LIMIT, diagnostics: { ...diagnostics } }); }
    function dispose() { if (!disposed) { disposed = true; actions.clear(); shown.clear(); diagnostics.disposals += 1; } return getSnapshot(); }
    root.CaissaPlayPostGameAnalytics = Object.freeze({ VERSION: 'PlayPostGameAnalytics@1.0.0',
        PAYLOAD_VERSION: 'PlayPostGameActionPayload@1.0.0', mapAction, observeShown, observeActionSelected,
        observeActionSucceeded, observeActionFailed, observeActionBlocked, getSnapshot, inspect: getSnapshot, dispose });
})(typeof window !== 'undefined' ? window : globalThis);
