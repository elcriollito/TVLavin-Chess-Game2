/**
 * Immutable Play-to-Analyze handoff transport 1.0.0.
 */
(function installAnalyzeHandoff(global) {
    'use strict';
    const VERSION = '1.0.0';
    if (global.CaissaAnalyzeHandoff?.schemaVersion === VERSION) return;
    const PREFIX = 'caissa:analyze:handoff:v1:';
    const ACTIVE_KEY = 'caissa:analyze:active:v1';
    const TTL_MS = 30 * 60 * 1000;
    const MAX_ACTIVE = 5;
    const MAX_PGN = 200000;
    const INTENTS = Object.freeze(['analyze-game', 'analyze-position', 'review-completed-game', 'inspect-current-position', 'imported-game', 'unknown']);
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze);
            Object.freeze(value);
        }
        return value;
    };
    const copy = value => JSON.parse(JSON.stringify(value));
    const result = (ok, status, reasonCode = null, value = null) =>
        freeze({ ok, status, reasonCode, value });
    const safeToken = value => typeof value === 'string' && /^[A-Za-z0-9_-]{12,120}$/.test(value);
    const plain = value => value && typeof value === 'object' && !Array.isArray(value);
    const dangerous = value => plain(value) && Object.keys(value).some(key =>
        key === '__proto__' || key === 'prototype' || key === 'constructor'
        || Object.values(value).some(child => plain(child) && dangerous(child)));
    function validate(handoff, now = Date.now()) {
        if (!plain(handoff) || dangerous(handoff)) return result(false, 'invalid', 'INVALID_SHAPE');
        if (handoff.schemaVersion !== VERSION) return result(false, 'unsupported', 'UNSUPPORTED_VERSION');
        if (!safeToken(handoff.token) || handoff.handoffId !== `analyze-handoff:${handoff.token}`)
            return result(false, 'invalid', 'INVALID_TOKEN');
        if (!INTENTS.includes(handoff.intent) || !plain(handoff.payload) || !plain(handoff.provenance))
            return result(false, 'invalid', 'INVALID_SHAPE');
        if (!Number.isFinite(handoff.createdAt) || !Number.isFinite(handoff.expiresAt)
            || handoff.expiresAt <= handoff.createdAt)
            return result(false, 'invalid', 'INVALID_TTL');
        if (now > handoff.expiresAt) return result(false, 'expired', 'EXPIRED');
        const pgn = handoff.payload.pgn;
        if (pgn !== null && (typeof pgn !== 'string' || pgn.length > MAX_PGN))
            return result(false, 'invalid', 'INVALID_PGN');
        for (const key of ['initialFen', 'finalFen']) {
            const fen = handoff.payload[key];
            if (fen !== null && (typeof fen !== 'string' || fen.length > 180))
                return result(false, 'invalid', 'INVALID_FEN');
        }
        return result(true, 'valid', null, freeze(copy(handoff)));
    }
    function createTransport(options = {}) {
        const storage = Object.prototype.hasOwnProperty.call(options, 'storage')
            ? options.storage : global.sessionStorage;
        const now = typeof options.now === 'function' ? options.now : Date.now;
        const tokenFactory = typeof options.tokenFactory === 'function'
            ? options.tokenFactory
            : () => global.crypto?.randomUUID?.().replace(/-/g, '')
                || `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
        const key = token => `${PREFIX}${token}`;
        function create(input = {}) {
            if (!plain(input) || dangerous(input)) return result(false, 'invalid', 'INVALID_INPUT');
            const token = input.token ?? tokenFactory();
            if (!safeToken(token)) return result(false, 'invalid', 'INVALID_TOKEN');
            const createdAt = now();
            const handoff = {
                schemaVersion: VERSION,
                handoffId: `analyze-handoff:${token}`,
                token,
                source: typeof input.source === 'string' ? input.source.slice(0, 40) : 'play',
                intent: INTENTS.includes(input.intent) ? input.intent : 'unknown',
                createdAt,
                expiresAt: createdAt + TTL_MS,
                gameRecordSchemaVersion: input.gameRecordSchemaVersion ?? null,
                payload: {
                    recordId: input.payload?.recordId ?? null,
                    initialFen: input.payload?.initialFen ?? null,
                    finalFen: input.payload?.finalFen ?? null,
                    pgn: input.payload?.pgn ?? null,
                    selectedPly: Number.isSafeInteger(input.payload?.selectedPly) ? input.payload.selectedPly : null,
                    playerColor: input.payload?.playerColor ?? null,
                    boardOrientation: input.payload?.boardOrientation ?? null,
                    result: input.payload?.result ?? null,
                    mode: input.payload?.mode ?? null
                },
                provenance: {
                    sourceSection: input.provenance?.sourceSection ?? null,
                    compatibilitySchemaVersion: input.provenance?.compatibilitySchemaVersion ?? null,
                    lifecycleSessionId: input.provenance?.lifecycleSessionId ?? null,
                    clockSessionId: input.provenance?.clockSessionId ?? null
                }
            };
            return validate(handoff, createdAt);
        }
        function cleanup() {
            if (!storage) return result(false, 'unavailable', 'STORAGE_UNAVAILABLE');
            try {
                const owned = [];
                for (let i = 0; i < storage.length; i += 1) {
                    const storageKey = storage.key(i);
                    if (storageKey?.startsWith(PREFIX)) owned.push(storageKey);
                }
                const entries = owned.map(storageKey => {
                    try { return { storageKey, value: JSON.parse(storage.getItem(storageKey)) }; }
                    catch (_) { return { storageKey, value: null }; }
                }).sort((a, b) => (b.value?.createdAt || 0) - (a.value?.createdAt || 0));
                let removed = 0;
                entries.forEach((entry, index) => {
                    if (!entry.value || entry.value.expiresAt < now() || index >= MAX_ACTIVE) {
                        storage.removeItem(entry.storageKey);
                        removed += 1;
                    }
                });
                return result(true, 'cleaned', null, removed);
            } catch (_) { return result(false, 'unavailable', 'STORAGE_UNAVAILABLE'); }
        }
        function store(handoff) {
            const checked = validate(handoff, now());
            if (!checked.ok) return checked;
            if (!storage) return result(false, 'unavailable', 'STORAGE_UNAVAILABLE');
            try {
                cleanup();
                storage.setItem(key(handoff.token), JSON.stringify(handoff));
                storage.setItem(ACTIVE_KEY, handoff.token);
                cleanup();
                return result(true, 'stored', null, handoff.token);
            } catch (_) { return result(false, 'unavailable', 'STORAGE_UNAVAILABLE'); }
        }
        function resolve(token = null) {
            if (!storage) return result(false, 'unavailable', 'STORAGE_UNAVAILABLE');
            try {
                const requested = token || storage.getItem(ACTIVE_KEY);
                if (!safeToken(requested)) return result(false, 'not-found', 'UNKNOWN_TOKEN');
                const raw = storage.getItem(key(requested));
                if (!raw) return result(false, 'not-found', 'UNKNOWN_TOKEN');
                let parsed;
                try { parsed = JSON.parse(raw); }
                catch (_) { return result(false, 'corrupt', 'CORRUPT_PAYLOAD'); }
                return validate(parsed, now());
            } catch (_) { return result(false, 'unavailable', 'STORAGE_UNAVAILABLE'); }
        }
        return freeze({ create, store, resolve, cleanup, validate: value => validate(value, now()) });
    }
    const transport = createTransport();
    function createFromPlay() {
        const compatibility = global.CaissaPlayCompatibility?.getSnapshot?.();
        const record = global.CaissaGameRecord?.buildFromPlay?.();
        if (!compatibility || !record) return result(false, 'unavailable', 'PLAY_BOUNDARY_UNAVAILABLE');
        const lifecycle = global.CaissaGameLifecycle?.getSnapshot?.();
        const clock = global.CaissaClockService?.getSnapshot?.();
        const created = transport.create({
            intent: 'analyze-game',
            source: 'play',
            gameRecordSchemaVersion: record.schemaVersion,
            payload: {
                recordId: record.recordId,
                initialFen: record.position?.initialFen,
                finalFen: compatibility.position?.fen,
                pgn: compatibility.position?.pgn || null,
                selectedPly: compatibility.position?.moveCount ?? null,
                playerColor: compatibility.playerColor,
                boardOrientation: compatibility.board?.orientation,
                result: compatibility.game?.result || null,
                mode: compatibility.mode
            },
            provenance: {
                sourceSection: compatibility.section,
                compatibilitySchemaVersion: compatibility.schemaVersion,
                lifecycleSessionId: lifecycle?.lifecycleSessionId ?? null,
                clockSessionId: clock?.clockSessionId ?? null
            }
        });
        if (!created.ok) return created;
        const stored = transport.store(created.value);
        return stored.ok ? result(true, 'ready', null, created.value) : stored;
    }
    global.CaissaAnalyzeHandoff = freeze({
        schemaVersion: VERSION, handoffSchemaVersion: VERSION,
        intents: INTENTS, ttlMs: TTL_MS, limits: freeze({ maxActive: MAX_ACTIVE, maxPgnLength: MAX_PGN }),
        keys: freeze({ prefix: PREFIX, active: ACTIVE_KEY }),
        createTransport, validate,
        createFromPlay,
        resolve: (...args) => transport.resolve(...args),
        cleanup: (...args) => transport.cleanup(...args)
    });
})(window);
