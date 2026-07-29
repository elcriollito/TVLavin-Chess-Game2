(function installPresenceRegistry(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const MAX_PROVIDERS = 4;
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    class Registry {
        #snapshots = new Map(); #disposed = false;
        #diagnostics = { snapshotsReceived: 0, snapshotsAccepted: 0, snapshotsRejected: 0,
            recordsNormalized: 0, recordsRejected: 0, staleTransitions: 0, expirations: 0,
            providerClears: 0, registryLookups: 0, disposals: 0, lastReasonCode: null };
        ingest(input, options = {}) {
            this.#diagnostics.snapshotsReceived += 1;
            if (this.#disposed) return this.#result(false, 'DISPOSED');
            const snapshot = global.CaissaPresenceSnapshot?.create?.(input, options);
            if (!snapshot || !this.#snapshots.has(snapshot.provider) && this.#snapshots.size >= MAX_PROVIDERS) {
                this.#diagnostics.snapshotsRejected += 1;
                return this.#result(false, 'INVALID_SNAPSHOT');
            }
            this.#snapshots.set(snapshot.provider, snapshot);
            this.#diagnostics.snapshotsAccepted += 1;
            this.#diagnostics.recordsNormalized += snapshot.records.length;
            return this.#result(true, 'SNAPSHOT_ACCEPTED', snapshot);
        }
        getProvider(provider) {
            this.#diagnostics.registryLookups += 1;
            return freeze(clone(this.#snapshots.get(String(provider || '').toLowerCase()) || null));
        }
        get(presenceId) {
            this.#diagnostics.registryLookups += 1;
            for (const snapshot of this.#snapshots.values()) {
                const found = snapshot.records.find(record => record.presenceId === presenceId);
                if (found) return freeze(clone(found));
            }
            return null;
        }
        list(options = {}) {
            this.#diagnostics.registryLookups += 1;
            const includeStale = options.includeStale === true;
            return freeze([...this.#snapshots.values()].flatMap(snapshot => snapshot.records)
                .filter(record => includeStale || !['stale', 'offline', 'disconnected'].includes(record.status))
                .sort((a, b) => a.presenceId.localeCompare(b.presenceId)).map(clone));
        }
        expire(observedAt) {
            if (!Number.isFinite(observedAt) || observedAt <= 0) return this.#result(false, 'INVALID_TIME');
            let expired = 0, stale = 0;
            for (const [provider, snapshot] of this.#snapshots) {
                const records = [];
                for (const record of snapshot.records) {
                    const freshness = global.CaissaPresenceFreshnessPolicy.evaluate(
                        record.providerTimestamp, observedAt, snapshot.freshnessPolicy);
                    if (!freshness || freshness.status === 'expired') { expired += 1; continue; }
                    const next = global.CaissaPlayerPresence.normalize({
                        ...clone(record), observedAt, freshness: undefined
                    }, { freshnessPolicy: snapshot.freshnessPolicy });
                    if (next?.status === 'stale' && record.status !== 'stale') stale += 1;
                    if (next) records.push(next);
                }
                const allStale = records.length > 0 && records.every(record => record.status === 'stale');
                this.#snapshots.set(provider, global.CaissaPresenceSnapshot.create({
                    ...clone(snapshot), observedAt, records,
                    status: allStale ? 'stale'
                        : snapshot.connected ? (records.length ? 'connected' : 'empty') : snapshot.status
                }, { freshnessPolicy: snapshot.freshnessPolicy }));
            }
            this.#diagnostics.expirations += expired; this.#diagnostics.staleTransitions += stale;
            return this.#result(true, 'EXPIRATION_COMPLETE', { expired, stale });
        }
        clearProvider(provider) {
            const removed = this.#snapshots.delete(String(provider || '').toLowerCase());
            if (removed) this.#diagnostics.providerClears += 1;
            return this.#result(true, removed ? 'PROVIDER_CLEARED' : 'PROVIDER_UNCHANGED');
        }
        inspect() { return freeze(clone({ schemaVersion: SCHEMA_VERSION, providerCount: this.#snapshots.size,
            recordCount: [...this.#snapshots.values()].reduce((sum, item) => sum + item.records.length, 0),
            ...this.#diagnostics })); }
        dispose() {
            if (!this.#disposed) { this.#snapshots.clear(); this.#disposed = true; this.#diagnostics.disposals += 1; }
            return this.#result(true, 'DISPOSED');
        }
        #result(ok, reasonCode, value = null) {
            this.#diagnostics.lastReasonCode = reasonCode;
            return freeze({ ok, reasonCode, value: freeze(clone(value)) });
        }
    }
    global.CaissaPresenceRegistry = Object.freeze({
        schemaVersion: SCHEMA_VERSION, maxProviders: MAX_PROVIDERS, create: () => new Registry()
    });
    global.CaissaPresenceRegistryInstance = global.CaissaPresenceRegistryInstance || new Registry();
})(typeof window !== 'undefined' ? window : globalThis);
