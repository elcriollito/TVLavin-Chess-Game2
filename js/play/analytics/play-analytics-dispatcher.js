(function (root) {
    'use strict';
    const C = root.CaissaPlayAnalyticsContracts;
    if (!C) return;
    const LIMIT = 50;
    const TRUSTED_SINKS = Object.freeze(['local-diagnostics', 'qa-test']);
    const buffer = [], signatures = new Set(), signatureOrder = [], sinks = new Map();
    const diagnostics = { created: 0, emitted: 0, rejected: 0, duplicatesSuppressed: 0, sinksRegistered: 1,
        sinkFailures: 0, bufferEvictions: 0, modeSelections: 0, blockedSelections: 0, loadStarts: 0,
        loadSuccesses: 0, loadFailures: 0, routeNormalizations: 0, startRequests: 0, startSuccesses: 0,
        startFailures: 0, startBlocked: 0, startDeduplicated: 0, gameCompletions: 0, gameAborts: 0,
        completionFailures: 0, postGameShown: 0, postGameActionsSelected: 0, postGameActionsSucceeded: 0,
        postGameActionsFailed: 0, postGameActionsBlocked: 0, disposals: 0, lastReasonCode: 'none' };
    let sequence = 0, disposed = false;
    sinks.set('local-diagnostics', Object.freeze({ sinkId: 'local-diagnostics', version: 'PlayAnalyticsSink@1.0.0', emit() {} }));
    const signature = event => event.category === 'play-game-start'
        ? [event.eventId, event.payload.attemptSequence, event.payload.mode, event.payload.startState].join('|')
        : event.category === 'play-game-completion' ? [event.eventId, event.payload.completionSequence].join('|')
            : event.category === 'play-postgame' ? [event.eventId, event.payload.completionSequence, event.payload.actionSequence].join('|')
                : [event.eventId, event.payload.selectionSequence, event.payload.mode, event.payload.loadState, event.payload.accessState].join('|');
    function reject(reason) { diagnostics.rejected += 1; diagnostics.lastReasonCode = reason; return Object.freeze({ ok: false, status: 'rejected', reason }); }
    function createEvent(eventId, payload) {
        if (disposed) return null;
        const event = C.createEvent(eventId, payload, ++sequence);
        if (!event) { diagnostics.rejected += 1; diagnostics.lastReasonCode = 'invalid-event'; return null; }
        diagnostics.created += 1; return event;
    }
    function emit(event) {
        if (disposed) return reject('disposed');
        if (!C.validateEvent(event)) return reject('invalid-event');
        const key = signature(event);
        if (signatures.has(key)) { diagnostics.duplicatesSuppressed += 1; return Object.freeze({ ok: true, status: 'duplicate' }); }
        signatures.add(key); signatureOrder.push(key);
        if (signatureOrder.length > LIMIT) signatures.delete(signatureOrder.shift());
        buffer.push(event); if (buffer.length > LIMIT) { buffer.shift(); diagnostics.bufferEvictions += 1; }
        diagnostics.emitted += 1;
        const map = { play_mode_selected: 'modeSelections', play_mode_selection_blocked: 'blockedSelections',
            play_mode_load_started: 'loadStarts', play_mode_load_succeeded: 'loadSuccesses',
            play_mode_load_failed: 'loadFailures', play_mode_route_normalized: 'routeNormalizations',
            play_game_start_requested: 'startRequests', play_game_start_succeeded: 'startSuccesses',
            play_game_start_failed: 'startFailures', play_game_start_blocked: 'startBlocked',
            play_game_start_deduplicated: 'startDeduplicated', play_game_completed: 'gameCompletions',
            play_game_aborted: 'gameAborts', play_game_completion_failed: 'completionFailures',
            play_postgame_shown: 'postGameShown', play_postgame_action_selected: 'postGameActionsSelected',
            play_postgame_action_succeeded: 'postGameActionsSucceeded', play_postgame_action_failed: 'postGameActionsFailed',
            play_postgame_action_blocked: 'postGameActionsBlocked' };
        if (map[event.eventId]) diagnostics[map[event.eventId]] += 1;
        for (const sink of sinks.values()) try { sink.emit(event); } catch (_) { diagnostics.sinkFailures += 1; }
        diagnostics.lastReasonCode = 'emitted'; return Object.freeze({ ok: true, status: 'emitted' });
    }
    function registerSink(sink) {
        if (disposed || !sink || !TRUSTED_SINKS.includes(sink.sinkId) || sink.sinkId === 'local-diagnostics'
            || sink.version !== 'PlayAnalyticsSink@1.0.0' || typeof sink.emit !== 'function' || sinks.has(sink.sinkId))
            return reject('sink-rejected');
        sinks.set(sink.sinkId, sink); diagnostics.sinksRegistered = sinks.size;
        return Object.freeze({ ok: true, status: 'registered', sinkId: sink.sinkId });
    }
    function unregisterSink(sinkId) {
        if (sinkId === 'local-diagnostics' || !sinks.has(sinkId)) return reject('sink-not-found');
        const sink = sinks.get(sinkId); sinks.delete(sinkId); diagnostics.sinksRegistered = sinks.size;
        try { sink.dispose?.(); } catch (_) { diagnostics.sinkFailures += 1; }
        return Object.freeze({ ok: true, status: 'unregistered' });
    }
    function getSnapshot(options = {}) {
        const events = options.qa === true && options.includeEvents === true ? buffer.map(event => event) : undefined;
        return C.freeze({ schemaVersion: 'PlayAnalyticsDispatcher@1.2.0', disposed, sinkCount: sinks.size,
            bufferSize: buffer.length, bufferLimit: LIMIT, diagnostics: { ...diagnostics }, ...(events ? { events } : {}) });
    }
    function dispose() {
        if (disposed) return getSnapshot(); disposed = true; diagnostics.disposals += 1;
        for (const [id, sink] of sinks) if (id !== 'local-diagnostics') try { sink.dispose?.(); } catch (_) { diagnostics.sinkFailures += 1; }
        sinks.clear(); buffer.length = 0; signatures.clear(); signatureOrder.length = 0; return getSnapshot();
    }
    root.CaissaPlayAnalytics = Object.freeze({ VERSION: 'PlayAnalyticsDispatcher@1.2.0', createEvent, emit,
        registerSink, unregisterSink, getSnapshot, inspect: () => getSnapshot(), dispose });
})(typeof window !== 'undefined' ? window : globalThis);
