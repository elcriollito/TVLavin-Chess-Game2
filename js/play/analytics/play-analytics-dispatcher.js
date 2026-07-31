(function (root) {
    'use strict';
    const C = root.CaissaPlayAnalyticsContracts;
    if (!C) return;
    const LIMIT = 50;
    const TRUSTED_SINKS = Object.freeze(['local-diagnostics', 'qa-test']);
    const buffer = [], signatures = new Set(), signatureOrder = [], sinks = new Map();
    const diagnostics = { created: 0, emitted: 0, rejected: 0, duplicatesSuppressed: 0, sinksRegistered: 1,
        sinkFailures: 0, bufferEvictions: 0, modeSelections: 0, blockedSelections: 0, loadStarts: 0,
        loadSuccesses: 0, loadFailures: 0, routeNormalizations: 0, disposals: 0, lastReasonCode: 'none' };
    let sequence = 0, disposed = false;
    sinks.set('local-diagnostics', Object.freeze({ sinkId: 'local-diagnostics', version: 'PlayAnalyticsSink@1.0.0', emit() {} }));
    const signature = event => [event.eventId, event.payload.selectionSequence, event.payload.mode,
        event.payload.loadState, event.payload.accessState].join('|');
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
            play_mode_load_failed: 'loadFailures', play_mode_route_normalized: 'routeNormalizations' };
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
        return C.freeze({ schemaVersion: 'PlayAnalyticsDispatcher@1.0.0', disposed, sinkCount: sinks.size,
            bufferSize: buffer.length, bufferLimit: LIMIT, diagnostics: { ...diagnostics }, ...(events ? { events } : {}) });
    }
    function dispose() {
        if (disposed) return getSnapshot(); disposed = true; diagnostics.disposals += 1;
        for (const [id, sink] of sinks) if (id !== 'local-diagnostics') try { sink.dispose?.(); } catch (_) { diagnostics.sinkFailures += 1; }
        sinks.clear(); buffer.length = 0; signatures.clear(); signatureOrder.length = 0; return getSnapshot();
    }
    root.CaissaPlayAnalytics = Object.freeze({ VERSION: 'PlayAnalyticsDispatcher@1.0.0', createEvent, emit,
        registerSink, unregisterSink, getSnapshot, inspect: () => getSnapshot(), dispose });
})(typeof window !== 'undefined' ? window : globalThis);
