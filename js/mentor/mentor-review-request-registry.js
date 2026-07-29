(function installMentorReviewRequestRegistry(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const DEFAULT_MAX = 8;
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const copy = value => JSON.parse(JSON.stringify(value));
    const result = (ok, status, reasonCode, value = null) => freeze({ ok, status, reasonCode, value });
    function stable(value) {
        if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
        if (value && typeof value === 'object')
            return `{${Object.keys(value).sort().map(key => `${key}:${stable(value[key])}`).join('|')}}`;
        return JSON.stringify(value);
    }
    function createRegistry(options = {}) {
        const maxEntries = Number.isInteger(options.maxEntries) && options.maxEntries > 0
            ? Math.min(options.maxEntries, 32) : DEFAULT_MAX;
        const now = typeof options.now === 'function' ? options.now : Date.now;
        const entries = new Map();
        const fingerprints = new Map();
        const diagnostics = { registrations: 0, deduplications: 0, retrievals: 0,
            consumptions: 0, expirations: 0, cancellations: 0, evictions: 0, disposals: 0,
            lastReasonCode: null };
        const fingerprint = request => stable({
            source: request.source, mentor: request.mentor, learner: request.learner,
            review: request.review, knowledge: request.knowledge
        });
        function remove(id, reason) {
            const entry = entries.get(id);
            if (!entry) return false;
            entries.delete(id); fingerprints.delete(entry.fingerprint);
            diagnostics[reason] += 1; return true;
        }
        function cleanup() {
            [...entries].forEach(([id, entry]) => {
                if (now() > entry.request.expiresAt) remove(id, 'expirations');
            });
        }
        function register(created) {
            cleanup();
            if (!created?.ok || !global.CaissaMentorReviewRequest?.validate?.(created.value, now())?.valid)
                return result(false, 'invalid', 'INVALID_REQUEST');
            const key = fingerprint(created.value);
            const duplicateId = fingerprints.get(key);
            if (duplicateId && entries.has(duplicateId)) {
                diagnostics.deduplications += 1; diagnostics.lastReasonCode = 'DUPLICATE_REQUEST';
                return result(true, 'unchanged', 'DUPLICATE_REQUEST', freeze(copy(entries.get(duplicateId).request)));
            }
            while (entries.size >= maxEntries) {
                const oldest = [...entries.values()].sort((a, b) =>
                    a.request.createdAt - b.request.createdAt
                    || a.request.requestId.localeCompare(b.request.requestId))[0];
                remove(oldest.request.requestId, 'evictions');
            }
            const transitioned = global.CaissaMentorReviewRequest.withStatus(created.value, 'registered', now());
            if (!transitioned.ok) return transitioned;
            entries.set(transitioned.value.requestId, freeze({
                request: transitioned.value, sourcePayload: freeze(copy(created.sourcePayload)), fingerprint: key
            }));
            fingerprints.set(key, transitioned.value.requestId);
            diagnostics.registrations += 1; diagnostics.lastReasonCode = 'REQUEST_REGISTERED';
            return result(true, 'registered', 'REQUEST_REGISTERED', freeze(copy(transitioned.value)));
        }
        function get(requestId) {
            cleanup();
            const entry = entries.get(requestId);
            if (!entry) return result(false, 'not-found', 'REQUEST_NOT_FOUND');
            diagnostics.retrievals += 1;
            return result(true, 'registered', 'REQUEST_FOUND', freeze(copy(entry.request)));
        }
        function getSourcePayload(requestId) {
            cleanup();
            const entry = entries.get(requestId);
            return entry ? result(true, 'available', 'SOURCE_FOUND', freeze(copy(entry.sourcePayload)))
                : result(false, 'not-found', 'REQUEST_NOT_FOUND');
        }
        function transition(requestId, status, counter) {
            cleanup();
            const entry = entries.get(requestId);
            if (!entry) return result(false, 'not-found', 'REQUEST_NOT_FOUND');
            const changed = global.CaissaMentorReviewRequest.withStatus(entry.request, status, now());
            if (!changed.ok) return changed;
            if (status === 'canceled' || status === 'disposed' || status === 'consumed')
                remove(requestId, counter);
            diagnostics.lastReasonCode = `REQUEST_${status.toUpperCase().replace('-', '_')}`;
            return result(true, status, diagnostics.lastReasonCode, changed.value);
        }
        function dispose() {
            const count = entries.size;
            entries.clear(); fingerprints.clear(); diagnostics.disposals += count;
            diagnostics.lastReasonCode = 'REGISTRY_DISPOSED';
            return result(true, 'disposed', 'REGISTRY_DISPOSED', count);
        }
        const inspect = () => {
            cleanup();
            return freeze({ schemaVersion: SCHEMA_VERSION, size: entries.size, maxEntries,
                storageWrites: 0, tokens: 0, ...diagnostics });
        };
        return freeze({
            register, get, getSourcePayload, cleanup,
            consume: id => transition(id, 'consumed', 'consumptions'),
            cancel: id => transition(id, 'canceled', 'cancellations'),
            dispose, inspect
        });
    }
    const registry = createRegistry();
    global.CaissaMentorReviewRequestRegistry = freeze({
        schemaVersion: SCHEMA_VERSION, defaultMaxEntries: DEFAULT_MAX, createRegistry,
        register: value => registry.register(value), get: id => registry.get(id),
        getSourcePayload: id => registry.getSourcePayload(id), consume: id => registry.consume(id),
        cancel: id => registry.cancel(id), cleanup: () => registry.cleanup(),
        dispose: () => registry.dispose(), inspect: () => registry.inspect()
    });
})(typeof window !== 'undefined' ? window : globalThis);
