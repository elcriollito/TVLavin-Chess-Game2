(function (root) {
    'use strict';
    const C = root.CaissaPlayAnalyticsContracts, D = root.CaissaPlayAnalytics;
    if (!C || !D) return;
    const LIMIT = 8, records = [];
    const diagnostics = { completed: 0, aborted: 0, failed: 0, duplicateCompletionsSuppressed: 0,
        staleCompletionsIgnored: 0, invalidCompletionPayloads: 0, recordsEvicted: 0, disposals: 0, lastReasonCode: 'unknown' };
    let sequence = 0, disposed = false;
    const allowed = (list, value, fallback = 'unknown') => list.includes(value) ? value : fallback;
    function resultCategory(value) { return value === '1-0' ? 'white-win' : value === '0-1' ? 'black-win'
        : value === '1/2-1/2' ? 'draw' : value === '*' ? 'no-result' : 'unknown'; }
    function terminationCategory(value) { const map = { 'fifty-move-rule': 'fifty-move',
        'engine-failure': 'technical-failure', agreement: 'draw-agreement', external: 'provider-owned' };
        return allowed(C.TERMINATION_CATEGORIES, map[value] || value); }
    function durationBucket(milliseconds, options = {}) {
        if (options.providerOwned) return 'provider-owned'; if (options.untimed) return 'untimed';
        if (!Number.isFinite(milliseconds) || milliseconds < 0) return 'unavailable';
        if (milliseconds < 60000) return 'under-1-minute'; if (milliseconds < 180000) return '1-to-3-minutes';
        if (milliseconds < 600000) return '3-to-10-minutes'; if (milliseconds < 1800000) return '10-to-30-minutes';
        return 'over-30-minutes';
    }
    function categories(context = {}) {
        const record = context.record || {}, opponent = record.opponent || {};
        const mode = opponent.type === 'coach' ? 'coach' : root.CaissaBotRegistry?.get?.(opponent.id) ? 'bots'
            : context.providerOwned ? 'players' : 'games';
        const opponentType = context.providerOwned ? 'human-provider' : mode === 'coach' ? 'coach-engine'
            : mode === 'bots' ? 'bot-catalog' : 'engine';
        return { mode, resultCategory: resultCategory(record.result?.value),
            terminationCategory: terminationCategory(context.providerOwned ? 'provider-owned' : record.result?.termination),
            durationBucket: durationBucket(record.timing?.durationMs, { providerOwned: context.providerOwned,
                untimed: record.timing?.timeControlSeconds === 0 }), opponentType,
            assistanceCategory: context.providerOwned ? 'provider-owned' : mode === 'coach' ? 'coach-assisted' : 'engine-opponent' };
    }
    function emit(eventId, state, context = {}) {
        if (disposed) return C.freeze({ ok: false, status: 'disposed' });
        if (context.stale) { diagnostics.staleCompletionsIgnored += 1; return C.freeze({ ok: true, status: 'stale' }); }
        const completionSequence = ++sequence, mapped = categories(context);
        const payload = { ...mapped, completionState: state, qaEligible: context.qaEligible !== false,
            productionEligible: context.productionEligible === true, completionSequence,
            startAttemptSequence: Number.isSafeInteger(context.startAttemptSequence) ? context.startAttemptSequence : 0,
            shellVersion: 'SimplifiedPlayShell@1.7.0' };
        const event = D.createEvent(eventId, payload);
        if (!event) { diagnostics.invalidCompletionPayloads += 1; return C.freeze({ ok: false, status: 'invalid' }); }
        try { D.emit(event); } catch (_) { diagnostics.invalidCompletionPayloads += 1; }
        records.push(C.freeze({ completionSequence, ...mapped })); if (records.length > LIMIT) { records.shift(); diagnostics.recordsEvicted += 1; }
        diagnostics[state === 'completed' ? 'completed' : state === 'aborted' ? 'aborted' : 'failed'] += 1;
        diagnostics.lastReasonCode = state;
        return C.freeze({ ok: true, status: state, completionSequence, categories: mapped });
    }
    const observeCompleted = context => emit('play_game_completed', 'completed', context);
    const observeAborted = context => emit('play_game_aborted', 'aborted', context);
    const observeFailed = context => emit('play_game_completion_failed', 'failed', context);
    function getSnapshot() { const current = records.at(-1); return C.freeze({ schemaVersion: 'PlayCompletionAnalytics@1.0.0',
        disposed, recordCount: records.length, recordLimit: LIMIT, current: current ? { ...current } : null, diagnostics: { ...diagnostics } }); }
    function dispose() { if (!disposed) { disposed = true; records.length = 0; diagnostics.disposals += 1; } return getSnapshot(); }
    root.CaissaPlayCompletionAnalytics = Object.freeze({ VERSION: 'PlayCompletionAnalytics@1.0.0',
        PAYLOAD_VERSION: 'PlayGameCompletionPayload@1.0.0', resultCategory, terminationCategory, durationBucket,
        observeCompleted, observeAborted, observeFailed, getSnapshot, inspect: getSnapshot, dispose });
})(typeof window !== 'undefined' ? window : globalThis);
