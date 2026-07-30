(function installEvaluationRail(global) {
    'use strict';

    const SCHEMA_VERSION = '1.0.0';
    const SNAPSHOT_SCHEMA_VERSION = '1.0.0';
    const STATUSES = Object.freeze(['idle', 'ready', 'loading', 'error', 'unavailable', 'disposed']);
    const DISPLAY_MODES = Object.freeze(['live', 'delayed', 'frozen', 'hidden', 'post-game', 'unavailable', 'loading', 'error']);
    const SCORE_TYPES = Object.freeze(['neutral', 'centipawn', 'mate']);
    const ORIENTATIONS = Object.freeze(['white', 'black']);
    const REASONS = Object.freeze({
        MOUNTED: 'MOUNTED', ALREADY_MOUNTED: 'ALREADY_MOUNTED', UNMOUNTED: 'UNMOUNTED',
        EVALUATION_SET: 'EVALUATION_SET', MATE_SET: 'MATE_SET', RESET: 'RESET',
        MODE_SET: 'MODE_SET', ORIENTATION_SET: 'ORIENTATION_SET', FROZEN: 'FROZEN',
        HIDDEN: 'HIDDEN', SHOWN: 'SHOWN', UNAVAILABLE: 'UNAVAILABLE', LOADING: 'LOADING',
        ERROR: 'ERROR', RESIZED: 'RESIZED', INVALID_INPUT: 'INVALID_INPUT',
        INVALID_MODE: 'INVALID_MODE', INVALID_ORIENTATION: 'INVALID_ORIENTATION',
        INVALID_POLICY: 'INVALID_POLICY', POLICY_DENIED: 'POLICY_DENIED',
        DISPOSED: 'DISPOSED', INVALID_HOST: 'INVALID_HOST'
    });
    const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
    const MAX_CP = 100000;
    const PRESENTATION_CP = 1500;
    let sequence = 0;

    function deepFreeze(value, seen = new WeakSet()) {
        if (!value || typeof value !== 'object' || seen.has(value)) return value;
        seen.add(value);
        Object.values(value).forEach(item => deepFreeze(item, seen));
        return Object.freeze(value);
    }
    function dangerous(value, seen = new WeakSet()) {
        if (!value || typeof value !== 'object' || seen.has(value)) return false;
        seen.add(value);
        return Object.keys(value).some(key => FORBIDDEN.has(key))
            || Object.values(value).some(item => dangerous(item, seen));
    }
    function result(ok, status, reasonCode, value = null) {
        return deepFreeze({ ok, status, reasonCode, value });
    }
    const finite = value => typeof value === 'number' && Number.isFinite(value);
    function normalizeCp(value) {
        if (!finite(value)) return null;
        return Math.max(-MAX_CP, Math.min(MAX_CP, Math.round(value)));
    }
    function normalizeMate(value) {
        if (!finite(value) || value === 0) return null;
        const normalized = Math.trunc(value);
        return normalized === 0 ? null : Math.max(-999, Math.min(999, normalized));
    }
    function whiteShareForCp(cp) {
        const clamped = Math.max(-PRESENTATION_CP, Math.min(PRESENTATION_CP, cp));
        return 1 / (1 + Math.exp(-clamped / 200));
    }
    function presentation(cp, mate) {
        const normalizedMate = normalizeMate(mate);
        const normalizedCp = normalizeCp(cp);
        if (normalizedMate !== null) {
            const whiteShare = whiteShareForCp(normalizedMate > 0 ? 1400 : -1400);
            return {
                scoreType: 'mate', scoreCp: null, scorePawns: null, mate: normalizedMate,
                normalizedValue: normalizedMate > 0 ? 1 : -1, whiteShare, blackShare: 1 - whiteShare,
                label: `M${normalizedMate}`,
                accessibleLabel: normalizedMate > 0
                    ? `White has mate in ${Math.abs(normalizedMate)}.`
                    : `Black has mate in ${Math.abs(normalizedMate)}.`
            };
        }
        if (normalizedCp === null) return {
            scoreType: 'neutral', scoreCp: null, scorePawns: null, mate: null,
            normalizedValue: 0, whiteShare: 0.5, blackShare: 0.5,
            label: '0.0', accessibleLabel: 'Position is equal.'
        };
        const scorePawns = normalizedCp / 100;
        const whiteShare = whiteShareForCp(normalizedCp);
        return {
            scoreType: 'centipawn', scoreCp: normalizedCp, scorePawns, mate: null,
            normalizedValue: whiteShare * 2 - 1, whiteShare, blackShare: 1 - whiteShare,
            label: scorePawns >= 0 ? `+${scorePawns.toFixed(1)}` : scorePawns.toFixed(1),
            accessibleLabel: normalizedCp === 0 ? 'Position is equal.'
                : `${normalizedCp > 0 ? 'White' : 'Black'} advantage ${Math.abs(scorePawns).toFixed(1)} pawns.`
        };
    }

    class EvaluationRail {
        #id = `evaluation-rail-${++sequence}`;
        #root = null; #fill = null; #labelNode = null; #board = null;
        #disposed = false; #mode = 'unavailable'; #orientation = 'white';
        #state = presentation(null, null); #status = 'idle'; #visible = true; #frozen = false;
        #source = null; #policy = { allowed: false, decisionId: null, reasonCode: null };
        #renderSequence = 0; #updatedAt = null; #policyValidator;
        #diagnostics = {
            mounts: 0, renders: 0, resets: 0, rejectedInputs: 0,
            rejectedPolicies: 0, deniedPolicies: 0, orientationChanges: 0,
            resizes: 0, lastReasonCode: null
        };

        constructor(options = {}) {
            this.#policyValidator = typeof options?.policyValidator === 'function' ? options.policyValidator : null;
        }
        mount(options = {}) {
            if (this.#disposed) return this.#record(result(false, 'disposed', REASONS.DISPOSED));
            if (this.#root) return result(true, 'unchanged', REASONS.ALREADY_MOUNTED, this.getSnapshot());
            const root = options.root || global.document?.getElementById?.('evalBar');
            const fill = options.fill || root?.querySelector?.('#evalFill');
            const label = options.label || root?.querySelector?.('#evalScore');
            if (!root || !fill || !label) return this.#record(result(false, 'rejected', REASONS.INVALID_HOST));
            this.#root = root; this.#fill = fill; this.#labelNode = label;
            this.#board = options.board || global.document?.getElementById?.('chessboard') || null;
            root.dataset.evaluationRailOwner = this.#id;
            root.setAttribute('role', 'meter');
            root.setAttribute('aria-valuemin', '-15');
            root.setAttribute('aria-valuemax', '15');
            root.setAttribute('aria-live', 'polite');
            root.removeAttribute('title');
            this.#diagnostics.mounts += 1; this.#status = 'ready'; this.#render();
            return this.#record(result(true, 'accepted', REASONS.MOUNTED, this.getSnapshot()));
        }
        applyPolicy(decision) {
            if (this.#disposed) return this.#record(result(false, 'disposed', REASONS.DISPOSED));
            if (!decision || typeof decision !== 'object' || dangerous(decision)
                || decision.purpose !== 'live-evaluation'
                || !this.#policyValidator?.(decision, 'live-evaluation')) {
                this.#diagnostics.rejectedPolicies += 1;
                return this.#record(result(false, 'rejected', REASONS.INVALID_POLICY));
            }
            const mode = DISPLAY_MODES.includes(decision.capabilities?.evaluationMode)
                ? decision.capabilities.evaluationMode : 'unavailable';
            this.#policy = {
                allowed: decision.allowed === true && decision.capabilities?.mayShowEvaluation === true,
                decisionId: typeof decision.decisionId === 'string' ? decision.decisionId.slice(0, 160) : null,
                reasonCode: typeof decision.reasonCode === 'string' ? decision.reasonCode.slice(0, 120) : null
            };
            if (!this.#policy.allowed || mode !== 'live') {
                this.#diagnostics.deniedPolicies += 1;
                this.#clear('unavailable', mode === 'frozen' ? 'frozen' : 'unavailable');
                return this.#record(result(true, 'accepted', REASONS.POLICY_DENIED, this.getSnapshot()));
            }
            this.#mode = 'live'; this.#status = 'ready'; this.#visible = true; this.#frozen = false;
            this.#render();
            return this.#record(result(true, 'accepted', REASONS.MODE_SET, this.getSnapshot()));
        }
        applyHumanPolicy(decision) {
            if (this.#disposed) return this.#record(result(false, 'disposed', REASONS.DISPOSED));
            if (!global.CaissaHumanFairPlay?.validateDecision?.(decision) || decision.evaluationMode === 'post-game')
                return this.#record(result(false, 'rejected', REASONS.INVALID_POLICY));
            this.#policy = {
                allowed: false, decisionId: decision.decisionId,
                reasonCode: decision.reasonCodes?.[0] || 'HUMAN_EVALUATION_FROZEN'
            };
            this.#clear('unavailable', decision.evaluationMode === 'delayed' ? 'unavailable' : 'frozen');
            return this.#record(result(true, 'accepted', REASONS.FROZEN, this.getSnapshot()));
        }
        setEvaluation(value, options = {}) {
            if (!this.#canWrite()) return this.#record(result(false, 'rejected', REASONS.POLICY_DENIED));
            const cp = normalizeCp(value);
            if (cp === null || dangerous(options)) {
                this.#diagnostics.rejectedInputs += 1;
                return this.#record(result(false, 'rejected', REASONS.INVALID_INPUT));
            }
            this.#state = presentation(cp, null);
            this.#source = typeof options.source === 'string' ? options.source.slice(0, 80) : 'engine';
            this.#status = 'ready'; this.#updatedAt = Date.now(); this.#render();
            return this.#record(result(true, 'accepted', REASONS.EVALUATION_SET, this.getSnapshot()));
        }
        setMate(value, options = {}) {
            if (!this.#canWrite()) return this.#record(result(false, 'rejected', REASONS.POLICY_DENIED));
            const mate = normalizeMate(value);
            if (mate === null || dangerous(options)) {
                this.#diagnostics.rejectedInputs += 1;
                return this.#record(result(false, 'rejected', REASONS.INVALID_INPUT));
            }
            this.#state = presentation(null, mate);
            this.#source = typeof options.source === 'string' ? options.source.slice(0, 80) : 'engine';
            this.#status = 'ready'; this.#updatedAt = Date.now(); this.#render();
            return this.#record(result(true, 'accepted', REASONS.MATE_SET, this.getSnapshot()));
        }
        setMode(mode) {
            if (!DISPLAY_MODES.includes(mode)) return this.#record(result(false, 'rejected', REASONS.INVALID_MODE));
            if (mode === 'live' && !this.#policy.allowed)
                return this.#record(result(false, 'rejected', REASONS.POLICY_DENIED));
            this.#mode = mode; this.#visible = mode !== 'hidden'; this.#frozen = mode === 'frozen';
            this.#status = mode === 'loading' ? 'loading' : mode === 'error' ? 'error'
                : mode === 'unavailable' ? 'unavailable' : 'ready';
            if (['frozen', 'unavailable', 'hidden'].includes(mode)) this.#state = presentation(null, null);
            this.#render();
            return this.#record(result(true, 'accepted', REASONS.MODE_SET, this.getSnapshot()));
        }
        setOrientation(value) {
            if (!ORIENTATIONS.includes(value))
                return this.#record(result(false, 'rejected', REASONS.INVALID_ORIENTATION));
            if (value === this.#orientation) return result(true, 'unchanged', REASONS.ORIENTATION_SET, value);
            this.#orientation = value; this.#diagnostics.orientationChanges += 1; this.#render();
            return this.#record(result(true, 'accepted', REASONS.ORIENTATION_SET, value));
        }
        reset() {
            this.#diagnostics.resets += 1;
            this.#clear('ready', this.#policy.allowed ? 'live' : 'unavailable');
            return this.#record(result(true, 'accepted', REASONS.RESET, this.getSnapshot()));
        }
        freeze() { return this.setMode('frozen'); }
        hide() { return this.setMode('hidden'); }
        show() { return this.setMode(this.#policy.allowed ? 'live' : 'unavailable'); }
        setUnavailable(reason) {
            if (typeof reason === 'string') this.#policy.reasonCode = reason.slice(0, 120);
            return this.setMode('unavailable');
        }
        setLoading() { return this.setMode('loading'); }
        setError() { return this.setMode('error'); }
        resize() {
            if (!this.#root || !this.#board) return this.#record(result(false, 'rejected', REASONS.INVALID_HOST));
            const rect = this.#board.getBoundingClientRect();
            if (!rect.width || !rect.height) return this.#record(result(false, 'rejected', REASONS.INVALID_HOST));
            const size = Math.floor(Math.min(rect.width, rect.height));
            this.#root.style.height = `${size}px`; this.#root.style.width = '16px'; this.#root.style.minWidth = '16px';
            this.#diagnostics.resizes += 1;
            return this.#record(result(true, 'accepted', REASONS.RESIZED, size));
        }
        getSnapshot() {
            return deepFreeze({
                schemaVersion: SNAPSHOT_SCHEMA_VERSION, railId: this.#id,
                mounted: !!this.#root, disposed: this.#disposed, status: this.#status,
                displayMode: this.#mode, orientation: this.#orientation, ...this.#state,
                visible: this.#visible, frozen: this.#frozen, source: this.#source,
                policy: { ...this.#policy }, renderSequence: this.#renderSequence,
                updatedAt: this.#updatedAt, listenerCount: 0, diagnostics: { ...this.#diagnostics }
            });
        }
        inspect() { return this.getSnapshot(); }
        unmount() {
            if (this.#root) {
                delete this.#root.dataset.evaluationRailOwner;
                for (const name of ['role', 'aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext', 'aria-live'])
                    this.#root.removeAttribute(name);
            }
            this.#root = null; this.#fill = null; this.#labelNode = null; this.#board = null;
            return result(true, 'accepted', REASONS.UNMOUNTED);
        }
        dispose() {
            if (this.#disposed) return result(true, 'unchanged', REASONS.DISPOSED);
            this.unmount(); this.#disposed = true; this.#status = 'disposed';
            return this.#record(result(true, 'accepted', REASONS.DISPOSED));
        }
        #canWrite() { return !this.#disposed && this.#policy.allowed && this.#mode === 'live' && !this.#frozen; }
        #clear(status, mode) {
            this.#state = presentation(null, null); this.#source = null;
            this.#status = status; this.#mode = mode; this.#visible = mode !== 'hidden';
            this.#frozen = mode === 'frozen'; this.#updatedAt = Date.now(); this.#render();
        }
        #render() {
            if (!this.#root || !this.#fill || !this.#labelNode) return;
            this.#root.classList.toggle('eval-flipped', this.#orientation === 'black');
            this.#root.classList.toggle('eval-normal', this.#orientation === 'white');
            this.#root.dataset.displayMode = this.#mode;
            this.#root.hidden = !this.#visible;
            this.#root.style.visibility = this.#visible ? 'visible' : 'hidden';
            this.#root.style.opacity = this.#visible ? '1' : '0';
            this.#fill.style.height = `${this.#state.whiteShare * 100}%`;
            const protectedHuman = this.#mode === 'frozen';
            this.#labelNode.textContent = protectedHuman ? 'Evaluation available after the game.'
                : this.#mode === 'unavailable' ? '—' : this.#state.label;
            this.#labelNode.className = 'eval-score-badge';
            if (this.#state.scoreType === 'mate' || Math.abs(this.#state.scorePawns || 0) > 1.5)
                this.#labelNode.classList.add((this.#state.mate || this.#state.scoreCp) > 0 ? 'white-advantage' : 'black-advantage');
            const accessible = protectedHuman ? 'Evaluation available after the game.'
                : this.#mode === 'unavailable' ? 'Live engine evaluation unavailable.'
                : this.#mode === 'loading' ? 'Engine evaluation loading.'
                : this.#mode === 'error' ? 'Engine evaluation unavailable because of an engine error.'
                : this.#mode === 'post-game' ? `Post-game evaluation. ${this.#state.accessibleLabel}`
                : this.#state.accessibleLabel;
            this.#root.setAttribute('aria-label', accessible);
            if (protectedHuman || this.#mode === 'unavailable') this.#root.removeAttribute('aria-valuenow');
            else this.#root.setAttribute('aria-valuenow', String((this.#state.scoreCp || 0) / 100));
            this.#root.setAttribute('aria-valuetext', accessible);
            this.#renderSequence += 1; this.#diagnostics.renders += 1;
        }
        #record(operation) { this.#diagnostics.lastReasonCode = operation.reasonCode; return operation; }
    }

    const api = Object.freeze({
        schemaVersion: SCHEMA_VERSION, snapshotSchemaVersion: SNAPSHOT_SCHEMA_VERSION,
        statuses: STATUSES, displayModes: DISPLAY_MODES, scoreTypes: SCORE_TYPES,
        orientations: ORIENTATIONS, reasonCodes: REASONS,
        normalizeCentipawns: normalizeCp, normalizeMate,
        mapCentipawnsToWhiteShare: whiteShareForCp,
        create: options => new EvaluationRail(options)
    });
    global.CaissaEvaluationRail = api;
    global.document?.addEventListener?.('DOMContentLoaded', () => {
        const policy = global.CaissaFairPlayPolicy;
        const rail = api.create({
            policyValidator: (decision, purpose) => policy?.validateDisplayDecision?.(decision, purpose) === true
        });
        global.CaissaEvaluationRailInstance = rail;
        rail.mount();
    }, { once: true });
})(typeof window !== 'undefined' ? window : globalThis);
