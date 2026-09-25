(function installArenaMatchClock(globalScope) {
    'use strict';

    const CLOCK_MODES = Object.freeze(['bullet', 'blitz', 'rapid', 'long']);
    const FIXED_DEPTH_MODE = 'fixed-depth';
    const SUPPORTED_PRESETS = Object.freeze({
        bullet: Object.freeze(['1+0', '1+1']),
        blitz: Object.freeze(['3+0', '3+2', '5+0', '5+3']),
        rapid: Object.freeze(['10+0', '10+5', '15+10']),
        long: Object.freeze(['30+0', '30+20', '60+30']),
        'fixed-depth': Object.freeze(['8', '12', '16', '20', '24'])
    });

    function createTimeControl(input = {}) {
        const mode = String(input.mode || 'blitz');
        const preset = String(input.preset || (mode === FIXED_DEPTH_MODE ? '12' : '3+2'));
        if (!Object.hasOwn(SUPPORTED_PRESETS, mode) || !SUPPORTED_PRESETS[mode].includes(preset)) {
            throw new RangeError(`Unsupported Match Lab time control: ${mode} ${preset}`);
        }
        if (mode === FIXED_DEPTH_MODE) {
            return Object.freeze({ mode, preset, initialMs: null, incrementMs: null, depth: Number(preset) });
        }
        const [minutes, incrementSeconds] = preset.split('+').map(Number);
        return Object.freeze({
            mode,
            preset,
            initialMs: minutes * 60_000,
            incrementMs: incrementSeconds * 1_000,
            depth: null
        });
    }

    function createQaTimeControl({ initialMs, incrementMs = 0 } = {}) {
        const initial = Number(initialMs);
        const increment = Number(incrementMs);
        if (!Number.isFinite(initial) || initial <= 0 || !Number.isFinite(increment) || increment < 0) {
            throw new RangeError('QA time control requires positive initialMs and non-negative incrementMs.');
        }
        return Object.freeze({
            mode: 'qa-clock', preset: `qa-${initial}+${increment}`,
            initialMs: initial, incrementMs: increment, depth: null, qaOnly: true
        });
    }

    function tokenMatches(left, right) {
        return Boolean(left && right
            && left.controllerGeneration === right.controllerGeneration
            && left.gameId === right.gameId
            && left.gameGeneration === right.gameGeneration
            && left.searchGeneration === right.searchGeneration
            && left.color === right.color);
    }

    function assertProviderCapabilities(timeControl, engines = []) {
        const capability = timeControl.mode === FIXED_DEPTH_MODE
            ? 'supportsFixedDepth' : 'supportsClockTimeControl';
        const unsupported = engines.find(engine => engine?.capabilities?.[capability] !== true);
        if (unsupported) {
            throw new Error(`${unsupported.name || unsupported.id || 'Selected engine'} does not support ${timeControl.mode} Match time control.`);
        }
        return true;
    }

    class MatchClockController {
        constructor({
            timeControl,
            now = () => globalScope.performance.now(),
            setTimeoutFn = (callback, delay) => globalScope.setTimeout(callback, delay),
            clearTimeoutFn = handle => globalScope.clearTimeout(handle),
            onChange = () => {},
            onFlag = () => {}
        } = {}) {
            this.now = now;
            this.setTimeoutFn = setTimeoutFn;
            this.clearTimeoutFn = clearTimeoutFn;
            this.onChange = onChange;
            this.onFlag = onFlag;
            this.controllerGeneration = 0;
            this.deadlineHandle = null;
            this.trace = [];
            this.reset(timeControl || createTimeControl());
        }

        reset(timeControl) {
            this._cancelDeadline();
            this.controllerGeneration += 1;
            this.timeControl = timeControl?.qaOnly ? timeControl : createTimeControl(timeControl);
            this.whiteRemainingMs = this.timeControl.initialMs;
            this.blackRemainingMs = this.timeControl.initialMs;
            this.activeColor = null;
            this.running = false;
            this.turnStartedAt = null;
            this.deadlineAt = null;
            this.flaggedColor = null;
            this.activeToken = null;
            this.pendingMove = null;
            this.stopped = false;
            this._record('RESET');
            this._emit();
            return this.snapshot();
        }

        isFixedDepth() {
            return this.timeControl.mode === FIXED_DEPTH_MODE;
        }

        beginSearch(color, identity = {}) {
            if (!['white', 'black'].includes(color)) throw new TypeError('Clock color must be white or black.');
            if (this.stopped || this.flaggedColor) return Object.freeze({ accepted: false, reason: 'inactive' });
            if (this.running) throw new Error('A Match clock search is already active.');
            const token = Object.freeze({
                controllerGeneration: this.controllerGeneration,
                gameId: String(identity.gameId || ''),
                gameGeneration: identity.gameGeneration ?? null,
                searchGeneration: identity.searchGeneration ?? null,
                color
            });
            this.activeColor = color;
            this.activeToken = token;
            this.pendingMove = null;
            this.running = true;
            this.turnStartedAt = this.now();
            if (!this.isFixedDepth()) {
                const remaining = this._remaining(color);
                if (remaining <= 0) {
                    this._flag(color, token, this.turnStartedAt);
                    return Object.freeze({ accepted: false, flagged: true, token });
                }
                this.deadlineAt = this.turnStartedAt + remaining;
                this._scheduleDeadline(token, remaining);
            }
            const options = this.getSearchOptions();
            this._record('SEARCH_STARTED', { color, remainingBeforeMs: this._remaining(color), options });
            this._emit();
            return Object.freeze({ accepted: true, token, options });
        }

        getSearchOptions() {
            if (this.isFixedDepth()) return Object.freeze({ depth: this.timeControl.depth });
            return Object.freeze({
                wtime: Math.max(0, Math.floor(this.whiteRemainingMs)),
                btime: Math.max(0, Math.floor(this.blackRemainingMs)),
                winc: this.timeControl.incrementMs,
                binc: this.timeControl.incrementMs
            });
        }

        settleBestMove(token) {
            if (!this.running || !tokenMatches(token, this.activeToken) || this.flaggedColor || this.stopped) {
                return Object.freeze({ accepted: false, reason: 'stale' });
            }
            const at = this.now();
            if (this.isFixedDepth()) {
                this._freezeActive();
                this.pendingMove = token;
                this._record('BESTMOVE_BEFORE_DEADLINE', { color: token.color, elapsedMs: null });
                this._emit();
                return Object.freeze({ accepted: true, token, elapsedMs: null });
            }
            const elapsedMs = Math.max(0, at - this.turnStartedAt);
            const remainingBeforeMs = this._remaining(token.color);
            if (at >= this.deadlineAt || elapsedMs >= remainingBeforeMs) {
                this._flag(token.color, token, at);
                return Object.freeze({ accepted: false, flagged: true, token, elapsedMs });
            }
            this._setRemaining(token.color, remainingBeforeMs - elapsedMs);
            this._freezeActive();
            this.pendingMove = token;
            this._record('BESTMOVE_BEFORE_DEADLINE', {
                color: token.color, remainingBeforeMs, elapsedMs,
                remainingAfterThinkMs: this._remaining(token.color)
            });
            this._emit();
            return Object.freeze({ accepted: true, token, elapsedMs });
        }

        commitLegalMove(token, { gameEnded = false } = {}) {
            if (!tokenMatches(token, this.pendingMove) || this.flaggedColor || this.stopped) return false;
            let incrementAppliedMs = 0;
            if (!this.isFixedDepth() && !gameEnded) {
                incrementAppliedMs = this.timeControl.incrementMs;
                this._setRemaining(token.color, this._remaining(token.color) + incrementAppliedMs);
            }
            this.pendingMove = null;
            this.activeColor = null;
            this._record('LEGAL_MOVE_COMMITTED', {
                color: token.color, incrementAppliedMs,
                remainingAfterMoveMs: this._remaining(token.color), gameEnded: Boolean(gameEnded)
            });
            this._emit();
            return true;
        }

        rejectMove(token) {
            if (!tokenMatches(token, this.pendingMove)) return false;
            this.pendingMove = null;
            this.activeColor = null;
            this._record('MOVE_REJECTED', { color: token.color, incrementAppliedMs: 0 });
            this._emit();
            return true;
        }

        commitInstantLegalMove(color, { gameEnded = false } = {}) {
            if (this.running || this.flaggedColor || this.stopped || this.isFixedDepth()) return false;
            if (!['white', 'black'].includes(color)) return false;
            const incrementAppliedMs = gameEnded ? 0 : this.timeControl.incrementMs;
            this._setRemaining(color, this._remaining(color) + incrementAppliedMs);
            this._record('INSTANT_LEGAL_MOVE_COMMITTED', { color, incrementAppliedMs, gameEnded: Boolean(gameEnded) });
            this._emit();
            return true;
        }

        pause() {
            if (!this.running) return Object.freeze({ paused: true, snapshot: this.snapshot() });
            const token = this.activeToken;
            const at = this.now();
            if (!this.isFixedDepth()) {
                const elapsedMs = Math.max(0, at - this.turnStartedAt);
                const remainingBeforeMs = this._remaining(token.color);
                if (at >= this.deadlineAt || elapsedMs >= remainingBeforeMs) {
                    this._flag(token.color, token, at);
                    return Object.freeze({ paused: false, flagged: true, snapshot: this.snapshot() });
                }
                this._setRemaining(token.color, remainingBeforeMs - elapsedMs);
            }
            this._freezeActive();
            this.pendingMove = null;
            this.activeColor = null;
            this._record('PAUSED');
            this._emit();
            return Object.freeze({ paused: true, snapshot: this.snapshot() });
        }

        stop() {
            this._cancelDeadline();
            this.controllerGeneration += 1;
            this.running = false;
            this.activeColor = null;
            this.activeToken = null;
            this.pendingMove = null;
            this.turnStartedAt = null;
            this.deadlineAt = null;
            this.stopped = true;
            this._record('STOPPED');
            this._emit();
            return this.snapshot();
        }

        snapshot(at = this.now()) {
            let whiteRemainingMs = this.whiteRemainingMs;
            let blackRemainingMs = this.blackRemainingMs;
            if (this.running && !this.isFixedDepth() && this.activeColor && this.turnStartedAt !== null) {
                const projected = Math.max(0, this._remaining(this.activeColor) - Math.max(0, at - this.turnStartedAt));
                if (this.activeColor === 'white') whiteRemainingMs = projected;
                else blackRemainingMs = projected;
            }
            return Object.freeze({
                timeControl: this.timeControl,
                whiteRemainingMs,
                blackRemainingMs,
                activeColor: this.activeColor,
                running: this.running,
                turnStartedAt: this.turnStartedAt,
                incrementMs: this.timeControl.incrementMs,
                depth: this.timeControl.depth,
                flaggedColor: this.flaggedColor,
                deadlineAt: this.deadlineAt,
                stopped: this.stopped
            });
        }

        _scheduleDeadline(token, delayMs) {
            this._cancelDeadline();
            this.deadlineHandle = this.setTimeoutFn(() => {
                this.deadlineHandle = null;
                if (!this.running || !tokenMatches(token, this.activeToken) || this.stopped || this.flaggedColor) return;
                const at = this.now();
                if (at < this.deadlineAt) {
                    this._scheduleDeadline(token, this.deadlineAt - at);
                    return;
                }
                this._flag(token.color, token, at);
            }, Math.max(0, delayMs));
        }

        _flag(color, token, at) {
            if (this.flaggedColor || !tokenMatches(token, this.activeToken)) return false;
            if (!this.isFixedDepth()) this._setRemaining(color, 0);
            this.flaggedColor = color;
            this._freezeActive();
            this.pendingMove = null;
            this.activeColor = color;
            const snapshot = this.snapshot(at);
            this._record('FLAG_FALL', { color, at });
            this._emit(snapshot);
            this.onFlag(Object.freeze({ color, token, snapshot }));
            return true;
        }

        _freezeActive() {
            this._cancelDeadline();
            this.running = false;
            this.turnStartedAt = null;
            this.deadlineAt = null;
            this.activeToken = null;
        }

        _cancelDeadline() {
            if (this.deadlineHandle !== null) this.clearTimeoutFn(this.deadlineHandle);
            this.deadlineHandle = null;
        }

        _remaining(color) {
            return color === 'white' ? this.whiteRemainingMs : this.blackRemainingMs;
        }

        _setRemaining(color, value) {
            if (color === 'white') this.whiteRemainingMs = Math.max(0, value);
            else this.blackRemainingMs = Math.max(0, value);
        }

        _record(event, detail = {}) {
            this.trace.push(Object.freeze({ event, ...detail }));
            if (this.trace.length > 200) this.trace.shift();
        }

        _emit(snapshot = this.snapshot()) {
            this.onChange(snapshot);
        }
    }

    globalScope.CaissaArenaMatchClock = Object.freeze({
        CLOCK_MODES,
        FIXED_DEPTH_MODE,
        SUPPORTED_PRESETS,
        createTimeControl,
        createQaTimeControl,
        assertProviderCapabilities,
        MatchClockController
    });
})(typeof window !== 'undefined' ? window : globalThis);
