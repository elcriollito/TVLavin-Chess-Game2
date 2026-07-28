/**
 * Authoritative local Play clock service 1.0.0.
 * Owns monotonic calculations and the single local clock RAF.
 */
(function installClockService(global) {
    'use strict';
    const VERSION = '1.0.0';
    if (global.CaissaClockService?.schemaVersion === VERSION) return;

    const STATUSES = Object.freeze([
        'configured', 'started', 'paused', 'resumed', 'switched', 'incremented',
        'stopped', 'reset', 'synchronized', 'updated', 'timed-out', 'unchanged', 'rejected',
        'invalid', 'disposed'
    ]);
    const EVENTS = Object.freeze([
        'CLOCK_CONFIGURED', 'CLOCK_STARTED', 'CLOCK_UPDATED', 'CLOCK_PAUSED',
        'CLOCK_RESUMED', 'CLOCK_SWITCHED', 'CLOCK_STOPPED', 'CLOCK_RESET',
        'CLOCK_TIMED_OUT', 'CLOCK_SYNCHRONIZED', 'CLOCK_DISPOSED'
    ]);
    const REASONS = Object.freeze({
        INVALID_CONFIGURATION: 'INVALID_CONFIGURATION',
        NOT_CONFIGURED: 'NOT_CONFIGURED',
        ALREADY_RUNNING: 'ALREADY_RUNNING',
        NOT_RUNNING: 'NOT_RUNNING',
        ALREADY_PAUSED: 'ALREADY_PAUSED',
        NOT_PAUSED: 'NOT_PAUSED',
        INVALID_COLOR: 'INVALID_COLOR',
        STALE_TICK: 'STALE_TICK',
        DUPLICATE_SWITCH: 'DUPLICATE_SWITCH',
        TIMED_OUT: 'TIMED_OUT',
        DISPOSED: 'DISPOSED'
    });
    const LIMITS = Object.freeze({ maxTimeMs: 86400000, maxIncrementMs: 86400000 });
    const COLORS = Object.freeze(['white', 'black']);
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze);
            Object.freeze(value);
        }
        return value;
    };
    const clone = value => JSON.parse(JSON.stringify(value));
    const integer = value => Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
    const configuredInteger = value => Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
    const validObject = value => value && typeof value === 'object'
        && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

    function formatClock(milliseconds) {
        const wholeSeconds = Math.max(0, Math.ceil(integer(milliseconds) ?? 0));
        const seconds = Math.ceil(wholeSeconds / 1000);
        return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    }

    function createClock(options = {}) {
        const monotonicNow = typeof options.monotonicNow === 'function'
            ? options.monotonicNow : () => global.performance.now();
        const requestFrame = typeof options.requestFrame === 'function'
            ? options.requestFrame : callback => global.requestAnimationFrame(callback);
        const cancelFrame = typeof options.cancelFrame === 'function'
            ? options.cancelFrame : handle => global.cancelAnimationFrame(handle);
        const wallNow = typeof options.wallNow === 'function' ? options.wallNow : Date.now;
        const sessionIdFactory = typeof options.sessionIdFactory === 'function'
            ? options.sessionIdFactory : null;
        let sessionSequence = 0;
        let frameHandle = null;
        let bridge = null;
        let configured = false;
        let disposed = false;
        let lastSwitchToken = null;
        let state = {
            schemaVersion: VERSION, clockSessionId: null, sequence: 0, mode: 'local-play',
            initialTimeMs: 0, incrementMs: 0, delayMs: 0,
            whiteRemainingMs: 0, blackRemainingMs: 0, activeColor: null,
            running: false, paused: false, timedOutColor: null,
            startedAtMonotonic: null, lastTickMonotonic: null,
            updatedAt: null, disposed: false
        };
        const snapshot = () => freeze(clone(state));
        const result = (ok, status, reasonCode = null) =>
            freeze({ ok, status, reasonCode, snapshot: snapshot() });
        const rotateSession = () => sessionIdFactory?.()
            || `clock-session:${++sessionSequence}`;
        const emit = (event, status) => {
            if (typeof bridge !== 'function') return;
            try { bridge(freeze({ schemaVersion: VERSION, event, status, snapshot: snapshot() })); }
            catch (_) { /* Rendering is deliberately non-authoritative. */ }
        };
        const cancelLoop = () => {
            if (frameHandle !== null) {
                cancelFrame(frameHandle);
                frameHandle = null;
            }
        };
        const schedule = () => {
            if (frameHandle === null && state.running && !state.paused && !state.timedOutColor)
                frameHandle = requestFrame(onFrame);
        };
        const update = patch => {
            state = { ...state, ...patch, sequence: state.sequence + 1, updatedAt: wallNow() };
        };
        const rejectDisposed = () => disposed ? result(false, 'disposed', REASONS.DISPOSED) : null;

        function charge(nowValue) {
            const now = Number(nowValue);
            if (!Number.isFinite(now)) return result(false, 'invalid', REASONS.STALE_TICK);
            if (!state.running || state.paused || state.activeColor === null)
                return result(true, 'unchanged', REASONS.NOT_RUNNING);
            if (state.lastTickMonotonic === null) {
                update({ lastTickMonotonic: now });
                return result(true, 'unchanged');
            }
            if (now < state.lastTickMonotonic)
                return result(false, 'rejected', REASONS.STALE_TICK);
            const elapsed = Math.max(0, now - state.lastTickMonotonic);
            const key = state.activeColor === 'white' ? 'whiteRemainingMs' : 'blackRemainingMs';
            const remaining = Math.max(0, state[key] - elapsed);
            const timedOut = remaining <= 0 ? state.activeColor : null;
            update({
                [key]: Math.round(remaining), lastTickMonotonic: now,
                timedOutColor: timedOut, running: timedOut ? false : state.running
            });
            if (timedOut) cancelLoop();
            emit(timedOut ? 'CLOCK_TIMED_OUT' : 'CLOCK_UPDATED', timedOut ? 'timed-out' : 'updated');
            return result(true, timedOut ? 'timed-out' : 'updated',
                timedOut ? REASONS.TIMED_OUT : null);
        }
        function onFrame(now) {
            frameHandle = null;
            if (disposed || !state.running || state.paused) return;
            charge(now);
            schedule();
        }
        function configure(config) {
            const terminal = rejectDisposed();
            if (terminal) return terminal;
            if (!validObject(config)) return result(false, 'invalid', REASONS.INVALID_CONFIGURATION);
            const initial = configuredInteger(config.initialTimeMs);
            const increment = configuredInteger(config.incrementMs ?? 0);
            if (initial === null || increment === null || initial > LIMITS.maxTimeMs
                || increment > LIMITS.maxIncrementMs || (config.activeColor != null
                && !COLORS.includes(config.activeColor)))
                return result(false, 'invalid', REASONS.INVALID_CONFIGURATION);
            cancelLoop();
            configured = true;
            lastSwitchToken = null;
            state = {
                schemaVersion: VERSION, clockSessionId: rotateSession(), sequence: state.sequence + 1,
                mode: typeof config.mode === 'string' ? config.mode.slice(0, 40) : 'local-play',
                initialTimeMs: initial, incrementMs: increment, delayMs: 0,
                whiteRemainingMs: initial, blackRemainingMs: initial,
                activeColor: config.activeColor ?? null, running: false, paused: false,
                timedOutColor: null, startedAtMonotonic: null, lastTickMonotonic: null,
                updatedAt: wallNow(), disposed: false
            };
            emit('CLOCK_CONFIGURED', 'configured');
            return result(true, 'configured');
        }
        function start(input = {}) {
            const terminal = rejectDisposed();
            if (terminal) return terminal;
            if (!configured) return result(false, 'rejected', REASONS.NOT_CONFIGURED);
            if (state.running) return result(true, 'unchanged', REASONS.ALREADY_RUNNING);
            const color = input.activeColor ?? state.activeColor;
            if (!COLORS.includes(color)) return result(false, 'invalid', REASONS.INVALID_COLOR);
            if (state.timedOutColor) return result(false, 'rejected', REASONS.TIMED_OUT);
            const now = monotonicNow();
            update({ activeColor: color, running: true, paused: false,
                startedAtMonotonic: state.startedAtMonotonic ?? now, lastTickMonotonic: now });
            emit('CLOCK_STARTED', 'started');
            schedule();
            return result(true, 'started');
        }
        function pause() {
            const terminal = rejectDisposed();
            if (terminal) return terminal;
            if (state.paused) return result(true, 'unchanged', REASONS.ALREADY_PAUSED);
            if (!state.running) return result(false, 'rejected', REASONS.NOT_RUNNING);
            const charged = charge(monotonicNow());
            if (charged.status === 'timed-out') return charged;
            cancelLoop();
            update({ running: false, paused: true, lastTickMonotonic: null });
            emit('CLOCK_PAUSED', 'paused');
            return result(true, 'paused');
        }
        function resume() {
            const terminal = rejectDisposed();
            if (terminal) return terminal;
            if (state.running) return result(true, 'unchanged', REASONS.ALREADY_RUNNING);
            if (!state.paused) return result(false, 'rejected', REASONS.NOT_PAUSED);
            update({ running: true, paused: false, lastTickMonotonic: monotonicNow() });
            emit('CLOCK_RESUMED', 'resumed');
            schedule();
            return result(true, 'resumed');
        }
        function applyIncrement(input = {}) {
            const terminal = rejectDisposed();
            if (terminal) return terminal;
            const color = input.color ?? state.activeColor;
            if (!COLORS.includes(color)) return result(false, 'invalid', REASONS.INVALID_COLOR);
            const key = color === 'white' ? 'whiteRemainingMs' : 'blackRemainingMs';
            update({ [key]: Math.min(LIMITS.maxTimeMs, state[key] + state.incrementMs) });
            emit('CLOCK_UPDATED', 'incremented');
            return result(true, 'incremented');
        }
        function switchTurn(input = {}) {
            const terminal = rejectDisposed();
            if (terminal) return terminal;
            if (!state.running) return result(false, 'rejected', REASONS.NOT_RUNNING);
            const token = typeof input.moveToken === 'string' ? input.moveToken.slice(0, 160) : null;
            if (token && token === lastSwitchToken)
                return result(false, 'rejected', REASONS.DUPLICATE_SWITCH);
            const now = monotonicNow();
            const charged = charge(now);
            if (charged.status === 'timed-out') return charged;
            const movingColor = input.movingColor ?? state.activeColor;
            if (!COLORS.includes(movingColor) || movingColor !== state.activeColor)
                return result(false, 'rejected', REASONS.INVALID_COLOR);
            if (state.incrementMs > 0) applyIncrement({ color: movingColor });
            lastSwitchToken = token;
            update({ activeColor: movingColor === 'white' ? 'black' : 'white',
                lastTickMonotonic: now });
            emit('CLOCK_SWITCHED', 'switched');
            return result(true, 'switched');
        }
        function stop(reason = null) {
            const terminal = rejectDisposed();
            if (terminal) return terminal;
            if (state.running) charge(monotonicNow());
            cancelLoop();
            if (!state.running && !state.paused)
                return result(true, 'unchanged', REASONS.NOT_RUNNING);
            update({ running: false, paused: false, lastTickMonotonic: null });
            emit('CLOCK_STOPPED', 'stopped');
            return result(true, 'stopped', typeof reason === 'string' ? reason.slice(0, 80) : null);
        }
        function reset(config) {
            const terminal = rejectDisposed();
            if (terminal) return terminal;
            if (config !== undefined) {
                const configuredResult = configure(config);
                if (!configuredResult.ok) return configuredResult;
            } else {
                if (!configured) return result(false, 'rejected', REASONS.NOT_CONFIGURED);
                cancelLoop();
                lastSwitchToken = null;
                update({
                    clockSessionId: rotateSession(), whiteRemainingMs: state.initialTimeMs,
                    blackRemainingMs: state.initialTimeMs, activeColor: null, running: false,
                    paused: false, timedOutColor: null, startedAtMonotonic: null,
                    lastTickMonotonic: null
                });
            }
            emit('CLOCK_RESET', 'reset');
            return result(true, 'reset');
        }
        function synchronize(input) {
            const terminal = rejectDisposed();
            if (terminal) return terminal;
            if (!validObject(input)) return result(false, 'invalid', REASONS.INVALID_CONFIGURATION);
            const white = configuredInteger(input.whiteRemainingMs);
            const black = configuredInteger(input.blackRemainingMs);
            if (white === null || black === null || (input.activeColor != null
                && !COLORS.includes(input.activeColor)))
                return result(false, 'invalid', REASONS.INVALID_CONFIGURATION);
            cancelLoop();
            configured = true;
            update({ whiteRemainingMs: white, blackRemainingMs: black,
                activeColor: input.activeColor ?? state.activeColor,
                running: false, paused: input.paused === true,
                timedOutColor: input.timedOutColor ?? null, lastTickMonotonic: null });
            emit('CLOCK_SYNCHRONIZED', 'synchronized');
            return result(true, 'synchronized');
        }
        function dispose() {
            if (disposed) return result(true, 'disposed', REASONS.DISPOSED);
            cancelLoop();
            disposed = true;
            update({ running: false, paused: false, lastTickMonotonic: null, disposed: true });
            emit('CLOCK_DISPOSED', 'disposed');
            bridge = null;
            return result(true, 'disposed');
        }
        return freeze({
            configure, start, pause, resume, switchTurn, applyIncrement, stop, reset,
            tick: now => rejectDisposed() || charge(now ?? monotonicNow()),
            synchronize, getSnapshot: snapshot,
            inspect: () => freeze({ configured, disposed, rafActive: frameHandle !== null,
                clockSessionId: state.clockSessionId, sequence: state.sequence }),
            setBridge: renderer => {
                if (disposed || (renderer !== null && typeof renderer !== 'function')) return false;
                bridge = renderer;
                return true;
            },
            dispose
        });
    }

    const current = createClock();
    global.CaissaClockService = freeze({
        schemaVersion: VERSION, snapshotSchemaVersion: VERSION, eventSchemaVersion: VERSION,
        statuses: STATUSES, events: EVENTS, reasonCodes: REASONS, limits: LIMITS,
        formatClock, createClock, getCurrent: () => current,
        configure: (...args) => current.configure(...args),
        start: (...args) => current.start(...args),
        pause: (...args) => current.pause(...args),
        resume: (...args) => current.resume(...args),
        switchTurn: (...args) => current.switchTurn(...args),
        applyIncrement: (...args) => current.applyIncrement(...args),
        stop: (...args) => current.stop(...args),
        reset: (...args) => current.reset(...args),
        tick: (...args) => current.tick(...args),
        synchronize: (...args) => current.synchronize(...args),
        getSnapshot: (...args) => current.getSnapshot(...args),
        inspect: (...args) => current.inspect(...args),
        setBridge: (...args) => current.setBridge(...args),
        dispose: (...args) => current.dispose(...args)
    });
})(window);
