/**
 * CAISSA local GameRecord persistence foundation 1.0.0.
 *
 * Infrastructure only: every write is an explicit API call. This module does
 * not observe Play lifecycle events, own game state, or provide cloud storage.
 */
(function installGameRecordPersistence(global) {
    'use strict';

    const SCHEMA_VERSION = '1.0.0';
    const CONSENT_VERSION = '1.0.0';
    const SCOPE = 'guest-local';
    if (global.CaissaGameRecordPersistence?.schemaVersion === SCHEMA_VERSION) return;

    const LIMITS = Object.freeze({
        completedRecords: 30,
        individualRecordBytes: 262_144,
        historyPayloadBytes: 2_097_152,
        recoveryRecords: 1,
        recoveryTtlMs: 86_400_000
    });
    const STATUSES = Object.freeze([
        'stored', 'loaded', 'removed', 'cleared', 'consent-required',
        'consent-denied', 'invalid-consent', 'invalid-record', 'invalid-envelope',
        'unsupported-schema', 'expired', 'quota-exceeded', 'unavailable',
        'not-found', 'corrupted', 'failed'
    ]);
    const KEY_BASES = Object.freeze({
        history: 'caissa:play:game-records:v1',
        recovery: 'caissa:play:game-recovery:v1',
        consent: 'caissa:play:game-record-consent:v1'
    });
    const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
    const RECORD_ID = /^[a-z0-9:._-]{1,160}$/i;
    const CONSENT_STATES = Object.freeze(['unknown', 'granted', 'denied']);
    const utf8Bytes = value => new TextEncoder().encode(value).length;
    const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
    const iso = value => {
        const parsed = value instanceof Date ? value : new Date(value);
        return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
    };
    const exact = (value, keys) => isObject(value)
        && Object.keys(value).every(key => keys.includes(key))
        && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));

    function hasDangerousKeys(value, seen = new WeakSet()) {
        if (!value || typeof value !== 'object' || seen.has(value)) return false;
        seen.add(value);
        if (Object.keys(value).some(key => FORBIDDEN_KEYS.has(key))) return true;
        return Object.values(value).some(item => hasDangerousKeys(item, seen));
    }

    function deepFreeze(value, seen = new WeakSet()) {
        if (!value || typeof value !== 'object' || seen.has(value)) return value;
        seen.add(value);
        Object.values(value).forEach(item => deepFreeze(item, seen));
        return Object.freeze(value);
    }

    function isDeepFrozen(value, seen = new WeakSet()) {
        if (!value || typeof value !== 'object' || seen.has(value)) return true;
        seen.add(value);
        return Object.isFrozen(value) && Object.values(value).every(item => isDeepFrozen(item, seen));
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function result(ok, status, operation, value = null, warnings = [], error = null) {
        return deepFreeze({ ok, status, operation, value, warnings: [...warnings], error });
    }

    function errorDetail(code, message) {
        return { code, message };
    }

    function storageKeys(scope = SCOPE) {
        if (scope !== SCOPE) return null;
        const suffix = `:${scope}`;
        const history = `${KEY_BASES.history}${suffix}`;
        const recovery = `${KEY_BASES.recovery}${suffix}`;
        const consent = `${KEY_BASES.consent}${suffix}`;
        return deepFreeze({
            history,
            recovery,
            consent,
            historyTemporary: `${history}:tmp`,
            recoveryTemporary: `${recovery}:tmp`,
            consentTemporary: `${consent}:tmp`
        });
    }

    function classifyStorageError(error) {
        return error?.name === 'QuotaExceededError' ? 'quota-exceeded' : 'failed';
    }

    function consentEnvelope(state, timestamp) {
        return {
            schemaVersion: CONSENT_VERSION,
            storeType: 'consent',
            scope: SCOPE,
            state,
            updatedAt: timestamp,
            metadata: {
                storageMode: 'local-device',
                dataCategory: 'completed-game-history'
            }
        };
    }

    function emptyHistory(timestamp) {
        return {
            schemaVersion: SCHEMA_VERSION,
            storeType: 'completed-history',
            scope: SCOPE,
            updatedAt: timestamp,
            consentVersion: CONSENT_VERSION,
            records: [],
            metadata: {
                retentionPolicy: 'oldest-first-v1',
                maximumRecords: LIMITS.completedRecords,
                maximumPayloadBytes: LIMITS.historyPayloadBytes
            }
        };
    }

    function validateConsentEnvelope(value) {
        return !hasDangerousKeys(value)
            && exact(value, ['schemaVersion', 'storeType', 'scope', 'state', 'updatedAt', 'metadata'])
            && value.schemaVersion === CONSENT_VERSION
            && value.storeType === 'consent'
            && value.scope === SCOPE
            && CONSENT_STATES.includes(value.state)
            && iso(value.updatedAt) === value.updatedAt
            && exact(value.metadata, ['storageMode', 'dataCategory'])
            && value.metadata.storageMode === 'local-device'
            && value.metadata.dataCategory === 'completed-game-history';
    }

    function gameRecordApi() {
        return global.CaissaGameRecord;
    }

    function validateRecord(record, allowedStatuses) {
        const api = gameRecordApi();
        if (!api || typeof api.validate !== 'function')
            return { ok: false, status: 'unavailable', error: errorDetail('game-record-unavailable', 'GameRecord validation is unavailable.') };
        if (!record || !isDeepFrozen(record))
            return { ok: false, status: 'invalid-record', error: errorDetail('mutable-record', 'Only frozen normalized records may be stored.') };
        if (hasDangerousKeys(record))
            return { ok: false, status: 'invalid-record', error: errorDetail('dangerous-record-key', 'Record contains a forbidden key.') };
        const validation = api.validate(record);
        if (!validation.valid)
            return { ok: false, status: validation.errors.some(item => item.code === 'UNSUPPORTED_SCHEMA_VERSION')
                ? 'unsupported-schema' : 'invalid-record',
            error: errorDetail('record-validation-failed', 'Record validation failed.') };
        if (!RECORD_ID.test(record.recordId) || !allowedStatuses.includes(record.status))
            return { ok: false, status: 'invalid-record', error: errorDetail('record-status-not-eligible', 'Record is not eligible for this store.') };
        let serialized;
        try { serialized = JSON.stringify(record); }
        catch (_) {
            return { ok: false, status: 'invalid-record', error: errorDetail('record-not-serializable', 'Record is not JSON serializable.') };
        }
        if (utf8Bytes(serialized) > LIMITS.individualRecordBytes)
            return { ok: false, status: 'invalid-record', error: errorDetail('record-size-exceeded', 'Record exceeds the individual size limit.') };
        return { ok: true, record: clone(record), serialized };
    }

    function validateStoredRecord(record, allowedStatuses) {
        if (hasDangerousKeys(record)) return false;
        const api = gameRecordApi();
        const validation = api?.validate?.(record);
        return validation?.valid === true && RECORD_ID.test(record.recordId)
            && allowedStatuses.includes(record.status)
            && utf8Bytes(JSON.stringify(record)) <= LIMITS.individualRecordBytes;
    }

    function validateHistoryEnvelope(value) {
        if (hasDangerousKeys(value)
            || !exact(value, ['schemaVersion', 'storeType', 'scope', 'updatedAt', 'consentVersion', 'records', 'metadata']))
            return false;
        if (value.schemaVersion !== SCHEMA_VERSION || value.storeType !== 'completed-history'
            || value.scope !== SCOPE || value.consentVersion !== CONSENT_VERSION
            || iso(value.updatedAt) !== value.updatedAt || !Array.isArray(value.records)
            || value.records.length > LIMITS.completedRecords
            || !exact(value.metadata, ['retentionPolicy', 'maximumRecords', 'maximumPayloadBytes'])
            || value.metadata.retentionPolicy !== 'oldest-first-v1'
            || value.metadata.maximumRecords !== LIMITS.completedRecords
            || value.metadata.maximumPayloadBytes !== LIMITS.historyPayloadBytes)
            return false;
        const ids = new Set();
        for (const item of value.records) {
            if (!exact(item, ['persistedAt', 'record']) || iso(item.persistedAt) !== item.persistedAt
                || !validateStoredRecord(item.record, ['completed', 'aborted']) || ids.has(item.record.recordId))
                return false;
            ids.add(item.record.recordId);
        }
        return utf8Bytes(JSON.stringify(value)) <= LIMITS.historyPayloadBytes;
    }

    function validateRecoveryEnvelope(value) {
        return !hasDangerousKeys(value)
            && exact(value, ['schemaVersion', 'storeType', 'scope', 'updatedAt', 'expiresAt', 'record', 'metadata'])
            && value.schemaVersion === SCHEMA_VERSION
            && value.storeType === 'recovery'
            && value.scope === SCOPE
            && iso(value.updatedAt) === value.updatedAt
            && iso(value.expiresAt) === value.expiresAt
            && value.expiresAt > value.updatedAt
            && validateStoredRecord(value.record, ['in-progress'])
            && exact(value.metadata, ['policy', 'maximumRecords', 'ttlMs'])
            && value.metadata.policy === 'explicit-short-lived-v1'
            && value.metadata.maximumRecords === LIMITS.recoveryRecords
            && value.metadata.ttlMs === LIMITS.recoveryTtlMs;
    }

    function migrateEnvelope(value, expectedType) {
        if (!isObject(value) || hasDangerousKeys(value))
            return result(false, 'invalid-envelope', 'migrate', null, [], errorDetail('invalid-envelope', 'Envelope shape is invalid.'));
        if (value.schemaVersion !== SCHEMA_VERSION && value.schemaVersion !== CONSENT_VERSION)
            return result(false, 'unsupported-schema', 'migrate', null, [], errorDetail('unsupported-schema', 'Envelope schema is unsupported.'));
        const valid = expectedType === 'completed-history' ? validateHistoryEnvelope(value)
            : expectedType === 'recovery' ? validateRecoveryEnvelope(value)
                : expectedType === 'consent' ? validateConsentEnvelope(value) : false;
        return valid
            ? result(true, 'loaded', 'migrate', deepFreeze(clone(value)))
            : result(false, 'invalid-envelope', 'migrate', null, [], errorDetail('invalid-envelope', 'Envelope validation failed.'));
    }

    function createStore({ storage, now = Date.now, scope = SCOPE } = {}) {
        const keys = storageKeys(scope);
        if (!keys) {
            const unsupported = operation => result(false, 'unavailable', operation, null, [],
                errorDetail('unsupported-scope', 'Only guest-local scope is supported.'));
            return deepFreeze({
                getConsent: () => unsupported('get-consent'),
                setConsent: () => unsupported('set-consent'),
                revokeConsent: () => unsupported('revoke-consent'),
                saveCompleted: () => unsupported('save-completed'),
                listCompleted: () => unsupported('list-completed'),
                getCompleted: () => unsupported('get-completed'),
                removeCompleted: () => unsupported('remove-completed'),
                clearCompleted: () => unsupported('clear-completed'),
                saveRecovery: () => unsupported('save-recovery'),
                loadRecovery: () => unsupported('load-recovery'),
                clearRecovery: () => unsupported('clear-recovery'),
                clearAll: () => unsupported('clear-all'),
                inspect: () => unsupported('inspect'),
                validateStorage: () => unsupported('validate-storage')
            });
        }
        const timestamp = () => iso(now());

        function readJson(key, expectedType, operation, maximumBytes = LIMITS.historyPayloadBytes) {
            if (!storage || typeof storage.getItem !== 'function')
                return result(false, 'unavailable', operation, null, [], errorDetail('storage-unavailable', 'Storage is unavailable.'));
            let raw;
            try { raw = storage.getItem(key); }
            catch (_) { return result(false, 'unavailable', operation, null, [], errorDetail('storage-read-failed', 'Storage read failed.')); }
            if (raw === null) return result(false, 'not-found', operation);
            if (typeof raw !== 'string' || utf8Bytes(raw) > maximumBytes)
                return result(false, 'corrupted', operation, null, [], errorDetail('payload-size-exceeded', 'Stored payload exceeds its bound.'));
            let parsed;
            try { parsed = JSON.parse(raw); }
            catch (_) { return result(false, 'corrupted', operation, null, [], errorDetail('invalid-json', 'Stored payload is not valid JSON.')); }
            const migrated = migrateEnvelope(parsed, expectedType);
            if (!migrated.ok)
                return result(false, migrated.status === 'unsupported-schema' ? 'unsupported-schema' : 'corrupted',
                    operation, null, [], migrated.error);
            return result(true, 'loaded', operation, migrated.value);
        }

        function removeKeys(operation, selected) {
            if (!storage || typeof storage.removeItem !== 'function')
                return result(false, 'unavailable', operation, null, [], errorDetail('storage-unavailable', 'Storage is unavailable.'));
            try {
                selected.forEach(key => storage.removeItem(key));
                return result(true, 'cleared', operation);
            } catch (_) {
                return result(false, 'failed', operation, null, [], errorDetail('storage-remove-failed', 'Storage removal failed.'));
            }
        }

        function atomicWrite(operation, canonicalKey, temporaryKey, envelope, expectedType) {
            if (!storage || typeof storage.setItem !== 'function' || typeof storage.getItem !== 'function')
                return result(false, 'unavailable', operation, null, [], errorDetail('storage-unavailable', 'Storage is unavailable.'));
            let serialized;
            try { serialized = JSON.stringify(envelope); }
            catch (_) { return result(false, 'invalid-envelope', operation, null, [], errorDetail('serialization-failed', 'Envelope serialization failed.')); }
            let previousRaw = null;
            let promotionAttempted = false;
            try {
                previousRaw = storage.getItem(canonicalKey);
                storage.setItem(temporaryKey, serialized);
                const verifiedRaw = storage.getItem(temporaryKey);
                if (verifiedRaw !== serialized) throw new Error('temporary-verification-failed');
                const verified = migrateEnvelope(JSON.parse(verifiedRaw), expectedType);
                if (!verified.ok) throw new Error('temporary-validation-failed');
                promotionAttempted = true;
                storage.setItem(canonicalKey, serialized);
            } catch (error) {
                if (promotionAttempted) {
                    try {
                        if (previousRaw === null) storage.removeItem?.(canonicalKey);
                        else storage.setItem(canonicalKey, previousRaw);
                    } catch (_) {}
                }
                try { storage.removeItem?.(temporaryKey); } catch (_) {}
                const status = classifyStorageError(error);
                return result(false, status, operation, null, [], errorDetail(
                    status === 'quota-exceeded' ? 'quota-exceeded' : 'atomic-write-failed',
                    status === 'quota-exceeded' ? 'Storage quota was exceeded.' : 'Atomic-style write failed.'));
            }
            const warnings = [];
            try { storage.removeItem?.(temporaryKey); }
            catch (_) { warnings.push({ code: 'temporary-cleanup-failed', message: 'The promoted temporary key could not be removed.' }); }
            return result(true, 'stored', operation, deepFreeze(clone(envelope)), warnings);
        }

        function getConsent() {
            const loaded = readJson(keys.consent, 'consent', 'get-consent', 16_384);
            if (loaded.status === 'not-found')
                return result(true, 'loaded', 'get-consent', deepFreeze({
                    schemaVersion: CONSENT_VERSION, scope: SCOPE, state: 'unknown', updatedAt: null
                }));
            if (!loaded.ok) return loaded;
            return result(true, 'loaded', 'get-consent', deepFreeze({
                schemaVersion: CONSENT_VERSION,
                scope: SCOPE,
                state: loaded.value.state,
                updatedAt: loaded.value.updatedAt
            }));
        }

        function setConsent(state) {
            if (!CONSENT_STATES.includes(state) || state === 'unknown')
                return result(false, 'invalid-consent', 'set-consent', null, [],
                    errorDetail('invalid-consent-state', 'Consent must be explicitly granted or denied.'));
            const at = timestamp();
            if (!at) return result(false, 'failed', 'set-consent', null, [], errorDetail('invalid-clock', 'Clock returned an invalid time.'));
            const written = atomicWrite('set-consent', keys.consent, keys.consentTemporary,
                consentEnvelope(state, at), 'consent');
            if (!written.ok) return written;
            return result(true, 'stored', 'set-consent', deepFreeze({ state, scope: SCOPE, updatedAt: at }), written.warnings);
        }

        function clearCompleted() {
            return removeKeys('clear-completed', [keys.history, keys.historyTemporary]);
        }

        function revokeConsent() {
            const denied = setConsent('denied');
            if (!denied.ok) return denied;
            const cleared = clearCompleted();
            if (!cleared.ok) return result(false, cleared.status, 'revoke-consent', denied.value,
                denied.warnings, cleared.error);
            return result(true, 'cleared', 'revoke-consent', denied.value, denied.warnings);
        }

        function loadHistory(operation) {
            const loaded = readJson(keys.history, 'completed-history', operation);
            if (loaded.status === 'not-found') return result(true, 'loaded', operation, null);
            return loaded;
        }

        function saveCompleted(record) {
            const consent = getConsent();
            if (!consent.ok) return result(false, consent.status, 'save-completed', null, consent.warnings, consent.error);
            if (consent.value.state !== 'granted')
                return result(false, consent.value.state === 'denied' ? 'consent-denied' : 'consent-required',
                    'save-completed');
            const checked = validateRecord(record, ['completed', 'aborted']);
            if (!checked.ok) return result(false, checked.status, 'save-completed', null, [], checked.error);
            const loaded = loadHistory('save-completed');
            if (!loaded.ok) return loaded;
            const at = timestamp();
            if (!at) return result(false, 'failed', 'save-completed', null, [], errorDetail('invalid-clock', 'Clock returned an invalid time.'));
            const base = loaded.value ?? emptyHistory(at);
            const records = base.records.filter(item => item.record.recordId !== checked.record.recordId);
            records.push({ persistedAt: at, record: checked.record });
            records.sort((a, b) => a.persistedAt.localeCompare(b.persistedAt)
                || a.record.recordId.localeCompare(b.record.recordId));
            const warnings = [];
            while (records.length > LIMITS.completedRecords) {
                records.shift();
                warnings.push({ code: 'count-eviction', message: 'The oldest completed record was evicted.' });
            }
            let candidate = { ...base, updatedAt: at, records };
            while (records.length && utf8Bytes(JSON.stringify(candidate)) > LIMITS.historyPayloadBytes) {
                records.shift();
                warnings.push({ code: 'size-eviction', message: 'The oldest completed record was evicted to enforce the payload limit.' });
                candidate = { ...candidate, records };
            }
            if (!records.some(item => item.record.recordId === checked.record.recordId))
                return result(false, 'invalid-record', 'save-completed', null, warnings,
                    errorDetail('history-size-exceeded', 'The record cannot fit within the history payload limit.'));
            const written = atomicWrite('save-completed', keys.history, keys.historyTemporary,
                candidate, 'completed-history');
            return written.ok
                ? result(true, 'stored', 'save-completed', deepFreeze(clone(checked.record)),
                    [...warnings, ...written.warnings])
                : written;
        }

        function listCompleted() {
            const loaded = loadHistory('list-completed');
            if (!loaded.ok) return loaded;
            const records = loaded.value?.records ?? [];
            const newestFirst = [...records].sort((a, b) => b.persistedAt.localeCompare(a.persistedAt)
                || a.record.recordId.localeCompare(b.record.recordId)).map(item => item.record);
            return result(true, 'loaded', 'list-completed', deepFreeze(clone(newestFirst)));
        }

        function getCompleted(recordId) {
            if (!RECORD_ID.test(recordId ?? '')) return result(false, 'not-found', 'get-completed');
            const listed = listCompleted();
            if (!listed.ok) return result(false, listed.status, 'get-completed', null, listed.warnings, listed.error);
            const found = listed.value.find(record => record.recordId === recordId);
            return found
                ? result(true, 'loaded', 'get-completed', found)
                : result(false, 'not-found', 'get-completed');
        }

        function removeCompleted(recordId) {
            if (!RECORD_ID.test(recordId ?? '')) return result(false, 'not-found', 'remove-completed');
            const loaded = loadHistory('remove-completed');
            if (!loaded.ok) return loaded;
            if (!loaded.value) return result(false, 'not-found', 'remove-completed');
            const records = loaded.value.records.filter(item => item.record.recordId !== recordId);
            if (records.length === loaded.value.records.length) return result(false, 'not-found', 'remove-completed');
            const candidate = { ...loaded.value, updatedAt: timestamp(), records };
            const written = atomicWrite('remove-completed', keys.history, keys.historyTemporary,
                candidate, 'completed-history');
            return written.ok ? result(true, 'removed', 'remove-completed', deepFreeze({ recordId }), written.warnings) : written;
        }

        function saveRecovery(record, options = {}) {
            const checked = validateRecord(record, ['in-progress']);
            if (!checked.ok) return result(false, checked.status, 'save-recovery', null, [], checked.error);
            const at = timestamp();
            const ttlMs = options.ttlMs === undefined ? LIMITS.recoveryTtlMs : options.ttlMs;
            if (!at || !Number.isSafeInteger(ttlMs) || ttlMs < 60_000 || ttlMs > LIMITS.recoveryTtlMs)
                return result(false, 'invalid-record', 'save-recovery', null, [],
                    errorDetail('invalid-recovery-ttl', 'Recovery TTL is outside the supported bound.'));
            const expiresAt = iso(new Date(new Date(at).getTime() + ttlMs));
            const envelope = {
                schemaVersion: SCHEMA_VERSION,
                storeType: 'recovery',
                scope: SCOPE,
                updatedAt: at,
                expiresAt,
                record: checked.record,
                metadata: {
                    policy: 'explicit-short-lived-v1',
                    maximumRecords: LIMITS.recoveryRecords,
                    ttlMs: LIMITS.recoveryTtlMs
                }
            };
            const written = atomicWrite('save-recovery', keys.recovery, keys.recoveryTemporary,
                envelope, 'recovery');
            return written.ok
                ? result(true, 'stored', 'save-recovery', deepFreeze({ record: clone(checked.record), expiresAt }), written.warnings)
                : written;
        }

        function loadRecovery() {
            const loaded = readJson(keys.recovery, 'recovery', 'load-recovery',
                LIMITS.individualRecordBytes + 16_384);
            if (!loaded.ok) return loaded;
            const current = timestamp();
            if (!current || loaded.value.expiresAt <= current)
                return result(false, 'expired', 'load-recovery', null, [{
                    code: 'recovery-expired',
                    message: 'Expired recovery remains clearable but is not returned as active.'
                }]);
            return result(true, 'loaded', 'load-recovery', deepFreeze({
                record: clone(loaded.value.record),
                updatedAt: loaded.value.updatedAt,
                expiresAt: loaded.value.expiresAt
            }));
        }

        function clearRecovery() {
            return removeKeys('clear-recovery', [keys.recovery, keys.recoveryTemporary]);
        }

        function clearAll() {
            return removeKeys('clear-all', Object.values(keys));
        }

        function inspect() {
            const consent = getConsent();
            const history = loadHistory('inspect');
            const recovery = readJson(keys.recovery, 'recovery', 'inspect',
                LIMITS.individualRecordBytes + 16_384);
            let temporaryKeys = [];
            if (storage && typeof storage.getItem === 'function') {
                try {
                    temporaryKeys = [keys.historyTemporary, keys.recoveryTemporary, keys.consentTemporary]
                        .filter(key => storage.getItem(key) !== null);
                } catch (_) {
                    return result(false, 'unavailable', 'inspect', null, [],
                        errorDetail('storage-read-failed', 'Storage inspection failed.'));
                }
            }
            const corrupted = [consent, history, recovery].filter(item =>
                ['corrupted', 'invalid-envelope', 'unsupported-schema'].includes(item.status)).length;
            return result(true, 'loaded', 'inspect', deepFreeze({
                scope: SCOPE,
                consent: consent.ok ? consent.value.state : 'unavailable',
                completedRecordCount: history.ok ? history.value?.records.length ?? 0 : null,
                recoveryPresent: recovery.ok,
                recoveryExpired: recovery.ok && recovery.value.expiresAt <= timestamp(),
                corruptionCount: corrupted,
                staleTemporaryKeys: [...temporaryKeys]
            }));
        }

        return deepFreeze({
            getConsent,
            setConsent,
            revokeConsent,
            saveCompleted,
            listCompleted,
            getCompleted,
            removeCompleted,
            clearCompleted,
            saveRecovery,
            loadRecovery,
            clearRecovery,
            clearAll,
            inspect,
            validateStorage: inspect
        });
    }

    let defaultStore;
    function useDefault(method, args) {
        defaultStore ??= createStore({ storage: global.localStorage, now: Date.now });
        return defaultStore[method](...args);
    }

    const api = Object.freeze({
        schemaVersion: SCHEMA_VERSION,
        consentVersion: CONSENT_VERSION,
        scope: SCOPE,
        limits: LIMITS,
        statuses: STATUSES,
        keys: storageKeys(),
        createStore,
        migrateEnvelope,
        getConsent: (...args) => useDefault('getConsent', args),
        setConsent: (...args) => useDefault('setConsent', args),
        revokeConsent: (...args) => useDefault('revokeConsent', args),
        saveCompleted: (...args) => useDefault('saveCompleted', args),
        listCompleted: (...args) => useDefault('listCompleted', args),
        getCompleted: (...args) => useDefault('getCompleted', args),
        removeCompleted: (...args) => useDefault('removeCompleted', args),
        clearCompleted: (...args) => useDefault('clearCompleted', args),
        saveRecovery: (...args) => useDefault('saveRecovery', args),
        loadRecovery: (...args) => useDefault('loadRecovery', args),
        clearRecovery: (...args) => useDefault('clearRecovery', args),
        clearAll: (...args) => useDefault('clearAll', args),
        inspect: (...args) => useDefault('inspect', args),
        validateStorage: (...args) => useDefault('validateStorage', args)
    });
    global.CaissaGameRecordPersistence = api;
})(window);
