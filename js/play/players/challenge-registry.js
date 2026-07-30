(function installChallengeRegistry(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const LIMITS = Object.freeze({ providers: 4, active: 32, terminal: 32, total: 64 });
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const result = (ok, reasonCode, value = null) => freeze({ ok, reasonCode, value: freeze(clone(value)) });
    class Registry {
        #records = new Map(); #disposed = false;
        #diagnostics = {
            challengesCreated: 0, providerUpdatesIngested: 0, transitionsAccepted: 0,
            transitionsRejected: 0, duplicatesSuppressed: 0, actionsInvoked: 0,
            actionFailures: 0, expirations: 0, disconnects: 0, reconnectAttempts: 0,
            terminalRecords: 0, registryEvictions: 0, disposals: 0, lastReasonCode: null
        };
        create(request) {
            if (this.#disposed) return this.#out(false, 'DISPOSED');
            const made = global.CaissaChallengeLifecycle.createChallenge(request);
            if (!made.ok) return this.#out(false, made.reasonCode);
            if (this.#records.has(made.value.challengeId) || !this.#canAdd(made.value))
                return this.#out(false, 'DUPLICATE_OR_LIMIT');
            this.#records.set(made.value.challengeId, made.value);
            this.#diagnostics.challengesCreated += 1;
            return this.#out(true, 'CHALLENGE_CREATED', made.value);
        }
        ingest(recordInput) {
            if (this.#disposed) return this.#out(false, 'DISPOSED');
            const record = global.CaissaChallengeRecord?.normalize?.(recordInput);
            if (!record) return this.#out(false, 'INVALID_RECORD');
            for (const existing of this.#records.values()) {
                if (existing.provider === record.provider && record.providerChallengeId &&
                    existing.providerChallengeId === record.providerChallengeId &&
                    existing.challengeId !== record.challengeId) return this.#out(false, 'DUPLICATE_PROVIDER_ID');
            }
            const current = this.#records.get(record.challengeId);
            if (current && record.updatedAt < current.updatedAt) return this.#out(false, 'STALE_RECORD');
            if (current && JSON.stringify(current) === JSON.stringify(record)) {
                this.#diagnostics.duplicatesSuppressed += 1;
                return this.#out(true, 'DUPLICATE_SUPPRESSED', current);
            }
            if (!current) this.#makeTerminalRoom(record);
            if (!current && !this.#canAdd(record)) return this.#out(false, 'REGISTRY_LIMIT');
            this.#records.set(record.challengeId, record);
            this.#diagnostics.providerUpdatesIngested += 1;
            this.#trimTerminal();
            return this.#out(true, 'RECORD_INGESTED', record);
        }
        transition(challengeId, event) {
            if (this.#disposed) return this.#out(false, 'DISPOSED');
            const current = this.#records.get(challengeId);
            if (!current) return this.#out(false, 'NOT_FOUND');
            const moved = global.CaissaChallengeLifecycle.transition(current, event);
            if (!moved.ok) {
                this.#diagnostics.transitionsRejected += 1;
                return this.#out(false, moved.reasonCode, current);
            }
            if (moved.reasonCode === 'DUPLICATE_SUPPRESSED') this.#diagnostics.duplicatesSuppressed += 1;
            else {
                this.#diagnostics.transitionsAccepted += 1;
                if (moved.value.state === 'disconnected') this.#diagnostics.disconnects += 1;
                if (event.eventType === 'PROVIDER_RECONNECTED') this.#diagnostics.reconnectAttempts += 1;
                this.#records.set(challengeId, moved.value);
            }
            this.#trimTerminal();
            return this.#out(true, moved.reasonCode, moved.value);
        }
        get(challengeId) { return freeze(clone(this.#records.get(challengeId) || null)); }
        list(filters = {}) {
            let values = [...this.#records.values()];
            if (filters.provider) values = values.filter(item => item.provider === filters.provider);
            if (filters.state) values = values.filter(item => item.state === filters.state);
            if (filters.direction) values = values.filter(item => item.direction === filters.direction);
            return freeze(values.sort((a, b) => b.updatedAt - a.updatedAt || a.challengeId.localeCompare(b.challengeId)).map(clone));
        }
        expire(now) {
            if (this.#disposed) return this.#out(false, 'DISPOSED');
            let count = 0;
            for (const [id, record] of this.#records) {
                const expired = global.CaissaChallengeLifecycle.expireRecord(record, now);
                if (expired.ok && expired.value?.state === 'expired' && record.state !== 'expired') {
                    this.#records.set(id, expired.value); count += 1;
                }
            }
            this.#diagnostics.expirations += count; this.#trimTerminal();
            return this.#out(true, 'EXPIRATION_COMPLETE', { expired: count });
        }
        clearProvider(provider) {
            let removed = 0;
            for (const [id, record] of this.#records) if (record.provider === provider) {
                this.#records.delete(id); removed += 1;
            }
            return this.#out(true, 'PROVIDER_CLEARED', { removed });
        }
        noteAction(ok) {
            this.#diagnostics.actionsInvoked += 1;
            if (!ok) this.#diagnostics.actionFailures += 1;
        }
        getSnapshot() {
            const records = this.list();
            return freeze({
                schemaVersion: SCHEMA_VERSION, records,
                activeCount: records.filter(item => !global.CaissaChallengeRecord.terminalStates.includes(item.state)).length,
                terminalCount: records.filter(item => global.CaissaChallengeRecord.terminalStates.includes(item.state)).length
            });
        }
        inspect() {
            const snapshot = this.getSnapshot();
            return freeze(clone({
                schemaVersion: SCHEMA_VERSION, providerCount: new Set(snapshot.records.map(item => item.provider)).size,
                recordCount: snapshot.records.length, activeCount: snapshot.activeCount,
                terminalCount: snapshot.terminalCount, ...this.#diagnostics
            }));
        }
        dispose() {
            if (!this.#disposed) { this.#records.clear(); this.#disposed = true; this.#diagnostics.disposals += 1; }
            return this.#out(true, 'DISPOSED');
        }
        #canAdd(record) {
            const values = [...this.#records.values()];
            const providers = new Set(values.map(item => item.provider)); providers.add(record.provider);
            const terminal = global.CaissaChallengeRecord.terminalStates.includes(record.state);
            const count = values.filter(item => global.CaissaChallengeRecord.terminalStates.includes(item.state) === terminal).length;
            return providers.size <= LIMITS.providers && values.length < LIMITS.total &&
                count < (terminal ? LIMITS.terminal : LIMITS.active);
        }
        #trimTerminal() {
            const terminal = [...this.#records.values()]
                .filter(item => global.CaissaChallengeRecord.terminalStates.includes(item.state))
                .sort((a, b) => b.updatedAt - a.updatedAt || a.challengeId.localeCompare(b.challengeId));
            for (const record of terminal.slice(LIMITS.terminal)) {
                this.#records.delete(record.challengeId); this.#diagnostics.registryEvictions += 1;
            }
            this.#diagnostics.terminalRecords = Math.min(terminal.length, LIMITS.terminal);
        }
        #makeTerminalRoom(record) {
            if (!global.CaissaChallengeRecord.terminalStates.includes(record.state)) return;
            const terminal = [...this.#records.values()]
                .filter(item => global.CaissaChallengeRecord.terminalStates.includes(item.state))
                .sort((a, b) => a.updatedAt - b.updatedAt || a.challengeId.localeCompare(b.challengeId));
            if (terminal.length >= LIMITS.terminal) {
                this.#records.delete(terminal[0].challengeId);
                this.#diagnostics.registryEvictions += 1;
            }
        }
        #out(ok, reasonCode, value = null) {
            this.#diagnostics.lastReasonCode = reasonCode;
            return result(ok, reasonCode, value);
        }
    }
    global.CaissaChallengeRegistry = Object.freeze({
        schemaVersion: SCHEMA_VERSION, limits: LIMITS, create: () => new Registry()
    });
    global.CaissaChallengeRegistryInstance = global.CaissaChallengeRegistryInstance || new Registry();
})(typeof window !== 'undefined' ? window : globalThis);
