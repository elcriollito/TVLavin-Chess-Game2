(function installPlayFocusManager(global) {
    'use strict';

    const SCHEMA_VERSION = '1.0.0';
    const MAX_RECORDS = 16;
    const records = new Map();
    let sequence = 0;
    let disposed = false;
    const diagnostics = {
        captures: 0, moves: 0, restores: 0, fallbacks: 0,
        staleRecords: 0, rejected: 0
    };

    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze);
            Object.freeze(value);
        }
        return value;
    };
    const result = (ok, reasonCode, value = null) => freeze({ ok, reasonCode, value });
    const focusable = value => value && typeof value.focus === 'function'
        && value.isConnected !== false && value.hidden !== true;

    function capture(trigger) {
        if (disposed || !focusable(trigger)) {
            diagnostics.rejected += 1;
            return result(false, disposed ? 'DISPOSED' : 'INVALID_FOCUS_TARGET');
        }
        const token = `focus-${++sequence}`;
        records.set(token, trigger);
        while (records.size > MAX_RECORDS) records.delete(records.keys().next().value);
        diagnostics.captures += 1;
        return result(true, 'FOCUS_CAPTURED', token);
    }

    function moveFocus(target, options = {}) {
        if (disposed || !focusable(target)) {
            diagnostics.rejected += 1;
            return result(false, disposed ? 'DISPOSED' : 'INVALID_FOCUS_TARGET');
        }
        if (options.root?.contains && !options.root.contains(target)) {
            diagnostics.rejected += 1;
            return result(false, 'TARGET_OUTSIDE_ROOT');
        }
        target.focus({ preventScroll: options.preventScroll === true });
        diagnostics.moves += 1;
        return result(true, 'FOCUS_MOVED');
    }

    function restoreFocus(token, fallback) {
        if (disposed) return result(false, 'DISPOSED');
        if (typeof token !== 'string' || !records.has(token)) {
            diagnostics.rejected += 1;
            return focusable(fallback) ? moveFallback(fallback) : result(false, 'UNKNOWN_FOCUS_TOKEN');
        }
        const target = records.get(token);
        records.delete(token);
        if (!focusable(target)) {
            diagnostics.staleRecords += 1;
            return focusable(fallback) ? moveFallback(fallback) : result(false, 'STALE_FOCUS_TARGET');
        }
        target.focus();
        diagnostics.restores += 1;
        return result(true, 'FOCUS_RESTORED');
    }

    function moveFallback(fallback) {
        fallback.focus();
        diagnostics.fallbacks += 1;
        return result(true, 'FOCUS_FALLBACK_USED');
    }

    function dispose() {
        if (disposed) return result(true, 'ALREADY_DISPOSED');
        records.clear();
        disposed = true;
        return result(true, 'DISPOSED');
    }

    global.CaissaPlayFocusManager = freeze({
        schemaVersion: SCHEMA_VERSION,
        maxRecords: MAX_RECORDS,
        capture,
        moveFocus,
        restoreFocus,
        inspect: () => freeze({
            schemaVersion: SCHEMA_VERSION,
            disposed,
            recordCount: records.size,
            diagnostics: { ...diagnostics }
        }),
        dispose
    });
})(typeof window !== 'undefined' ? window : globalThis);
