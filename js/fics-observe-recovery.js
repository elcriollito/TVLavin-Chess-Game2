(function installFicsObserveRecovery(root) {
    'use strict';

    const STORAGE_KEY = 'caissa_fics_observe_recovery_v1';
    const SCHEMA_VERSION = 1;
    const DEFAULT_TTL_MS = 5 * 60 * 1000;

    function normalizedHandle(value) {
        return String(value || '').trim().toLowerCase();
    }

    function participantFingerprint(white, black) {
        const input = `${normalizedHandle(white)}\u0000${normalizedHandle(black)}`;
        if (input === '\u0000') return null;
        let hash = 0x811c9dc5;
        for (let index = 0; index < input.length; index += 1) {
            hash ^= input.charCodeAt(index);
            hash = Math.imul(hash, 0x01000193) >>> 0;
        }
        return hash.toString(16).padStart(8, '0');
    }

    function createController(options = {}) {
        const storage = options.storage || root.sessionStorage;
        const clock = options.now || (() => Date.now());
        const ttlMs = Number.isFinite(options.ttlMs) && options.ttlMs > 0
            ? Math.floor(options.ttlMs)
            : DEFAULT_TTL_MS;

        function clear() {
            try {
                storage?.removeItem(STORAGE_KEY);
                return true;
            } catch {
                return false;
            }
        }

        function validate(record) {
            if (!record || record.schemaVersion !== SCHEMA_VERSION) return null;
            const gameNumber = String(record.gameNumber || '');
            const observedAt = Number(record.observedAt);
            const expiresAt = Number(record.expiresAt);
            const fingerprint = String(record.participantFingerprint || '');
            if (!/^\d{1,9}$/.test(gameNumber)
                || !Number.isFinite(observedAt)
                || !Number.isFinite(expiresAt)
                || expiresAt <= observedAt
                || expiresAt > observedAt + ttlMs
                || expiresAt <= clock()
                || !/^[0-9a-f]{8}$/.test(fingerprint)) {
                return null;
            }
            return Object.freeze({
                schemaVersion: SCHEMA_VERSION,
                gameNumber,
                participantFingerprint: fingerprint,
                observedAt,
                expiresAt,
                orientation: record.orientation === 'black' ? 'black' : 'white'
            });
        }

        function read() {
            try {
                const raw = storage?.getItem(STORAGE_KEY);
                if (!raw) return null;
                const record = validate(JSON.parse(raw));
                if (!record) clear();
                return record;
            } catch {
                clear();
                return null;
            }
        }

        function write(state = {}, orientation = 'white') {
            const relation = Number(state.relation);
            const observed = state.observedGame === true
                && relation !== 1
                && relation !== -1
                && state.status !== 'ended'
                && state.resultModel?.terminal !== true
                && !state.result;
            const gameNumber = String(state.gameNumber ?? '').trim();
            const fingerprint = participantFingerprint(state.whiteName, state.blackName);
            if (!observed || !/^\d{1,9}$/.test(gameNumber) || !fingerprint) return null;
            const observedAt = clock();
            const record = Object.freeze({
                schemaVersion: SCHEMA_VERSION,
                gameNumber,
                participantFingerprint: fingerprint,
                observedAt,
                expiresAt: observedAt + ttlMs,
                orientation: orientation === 'black' ? 'black' : 'white'
            });
            try {
                storage?.setItem(STORAGE_KEY, JSON.stringify(record));
                return record;
            } catch {
                return null;
            }
        }

        function assess(tables, options = {}) {
            const record = read();
            if (!record) return Object.freeze({ ok: false, code: 'NO_RECOVERY' });
            const table = Array.isArray(tables)
                ? tables.find(item => String(item?.number ?? '') === record.gameNumber)
                : null;
            if (!table) {
                return Object.freeze({
                    ok: false,
                    code: options.lobbySettled === true ? 'GAME_UNAVAILABLE' : 'WAITING_FOR_LOBBY',
                    record
                });
            }
            const fingerprint = participantFingerprint(table.white, table.black);
            if (!fingerprint || fingerprint !== record.participantFingerprint) {
                return Object.freeze({ ok: false, code: 'AMBIGUOUS_GAME', record });
            }
            return Object.freeze({ ok: true, code: 'RECOVERY_READY', record, table });
        }

        return Object.freeze({ clear, read, write, assess, participantFingerprint });
    }

    const controller = createController();
    root.CaissaFICSObserveRecovery = Object.freeze({
        STORAGE_KEY,
        SCHEMA_VERSION,
        DEFAULT_TTL_MS,
        createController,
        ...controller
    });
})(typeof window !== 'undefined' ? window : globalThis);
