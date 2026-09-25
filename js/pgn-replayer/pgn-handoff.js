(function installPgnHandoff(globalScope) {
    'use strict';

    const PREFIX = 'caissa:pgn-handoff:';
    const MAX_BYTES = 10 * 1024 * 1024;
    const MAX_AGE_MS = 10 * 60 * 1000;

    function bytes(value) {
        return typeof TextEncoder === 'function'
            ? new TextEncoder().encode(String(value || '')).byteLength
            : Buffer.byteLength(String(value || ''), 'utf8');
    }

    function token() {
        return globalScope.crypto?.randomUUID?.()
            || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
    }

    function validToken(value) {
        return /^[a-zA-Z0-9-]{12,128}$/.test(String(value || ''));
    }

    function create(text, { sourceLabel = 'CAISSA Engine Arena' } = {}) {
        const pgn = String(text || '');
        if (!pgn.trim()) throw new Error('PGN handoff is empty.');
        if (bytes(pgn) > MAX_BYTES) throw new Error('PGN handoff exceeds the 10 MiB safety limit.');
        const id = token();
        globalScope.sessionStorage.setItem(`${PREFIX}${id}`, JSON.stringify({
            schemaVersion: 'CaissaPgnHandoff@1.0.0', createdAt: Date.now(), sourceLabel: String(sourceLabel), pgn
        }));
        return id;
    }

    function consume(id) {
        if (!validToken(id)) return null;
        const key = `${PREFIX}${id}`;
        let raw = null;
        try {
            raw = globalScope.sessionStorage.getItem(key);
            globalScope.sessionStorage.removeItem(key);
            const record = JSON.parse(raw || 'null');
            if (!record || record.schemaVersion !== 'CaissaPgnHandoff@1.0.0') return null;
            if (!Number.isFinite(record.createdAt) || Date.now() - record.createdAt > MAX_AGE_MS) return null;
            if (typeof record.pgn !== 'string' || !record.pgn.trim() || bytes(record.pgn) > MAX_BYTES) return null;
            return Object.freeze({ pgn: record.pgn, sourceLabel: String(record.sourceLabel || 'CAISSA Engine Arena') });
        } catch (_) {
            try { globalScope.sessionStorage.removeItem(key); } catch (_) { /* unavailable storage */ }
            return null;
        }
    }

    const api = Object.freeze({ MAX_AGE_MS, MAX_BYTES, PREFIX, consume, create, validToken });
    globalScope.CaissaPgnHandoff = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
