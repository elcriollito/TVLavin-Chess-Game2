(function installGamesPanel(global) {
    'use strict';

    const SCHEMA_VERSION = '1.4.0';
    const SNAPSHOT_SCHEMA_VERSION = '1.4.0';
    const STATUSES = Object.freeze(['idle', 'ready', 'invalid', 'busy', 'active', 'error', 'disposed']);
    const EVENTS = Object.freeze(['hydrated', 'selection-changed', 'validated', 'submitted', 'started', 'advanced-changed']);
    const SECTIONS = Object.freeze(['game-type', 'time-control', 'color', 'opponent', 'primary-action', 'advanced-options']);
    const TIME_CONTROLS = Object.freeze([
        Object.freeze({ presetId: 'bullet-1', seconds: 60, minutes: 1, incrementSeconds: 0, label: '1+0', category: 'Bullet' }),
        Object.freeze({ presetId: 'bullet-2-1', seconds: 120, minutes: 2, incrementSeconds: 1, label: '2+1', category: 'Bullet' }),
        Object.freeze({ presetId: 'blitz-3', seconds: 180, minutes: 3, incrementSeconds: 0, label: '3+0', category: 'Blitz' }),
        Object.freeze({ presetId: 'blitz-3-2', seconds: 180, minutes: 3, incrementSeconds: 2, label: '3+2', category: 'Blitz' }),
        Object.freeze({ presetId: 'blitz-5', seconds: 300, minutes: 5, incrementSeconds: 0, label: '5+0', category: 'Blitz' }),
        Object.freeze({ presetId: 'rapid-10', seconds: 600, minutes: 10, incrementSeconds: 0, label: '10+0', category: 'Rapid' }),
        Object.freeze({ presetId: 'rapid-15-10', seconds: 900, minutes: 15, incrementSeconds: 10, label: '15+10', category: 'Rapid' })
    ]);
    const COLORS = Object.freeze([
        Object.freeze({ value: 'white', label: 'White' }),
        Object.freeze({ value: 'random', label: 'Random' }),
        Object.freeze({ value: 'black', label: 'Black' })
    ]);
    const STRENGTHS = Object.freeze([
        Object.freeze({ value: 'full-power', label: 'Full Power', legacyMapping: 'fixed-current-engine-setting' })
    ]);
    const REASONS = Object.freeze({
        MOUNTED: 'MOUNTED', ALREADY_MOUNTED: 'ALREADY_MOUNTED', UNMOUNTED: 'UNMOUNTED',
        HYDRATED: 'HYDRATED', SELECTION_CHANGED: 'SELECTION_CHANGED', VALID: 'VALID',
        INVALID_PRESET: 'INVALID_PRESET', INVALID_COLOR: 'INVALID_COLOR',
        INVALID_STRENGTH: 'INVALID_STRENGTH', COMMAND_UNAVAILABLE: 'COMMAND_UNAVAILABLE',
        STARTED: 'STARTED', COMMAND_FAILED: 'COMMAND_FAILED', BUSY: 'BUSY',
        DISPOSED: 'DISPOSED', INVALID_HOST: 'INVALID_HOST'
    });
    let sequence = 0;

    function deepFreeze(value, seen = new WeakSet()) {
        if (!value || typeof value !== 'object' || seen.has(value)) return value;
        seen.add(value);
        Object.values(value).forEach(item => deepFreeze(item, seen));
        return Object.freeze(value);
    }
    function result(ok, status, reasonCode, value = null) {
        return deepFreeze({ ok, status, reasonCode, value });
    }
    function safeObject(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
        return !Object.keys(value).some(key => ['__proto__', 'prototype', 'constructor'].includes(key));
    }
    function byPreset(value) {
        return TIME_CONTROLS.find(item => item.presetId === value) || null;
    }
    function presetForSeconds(value) {
        return TIME_CONTROLS.find(item => item.seconds === value) || null;
    }
    function node(tag, className, attributes = {}) {
        const element = global.document.createElement(tag);
        element.className = className;
        Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
        return element;
    }

    class GamesPanel {
        #id = `games-panel-${++sequence}`;
        #compatibility; #root = null; #host = null; #advanced = null; #disposed = false; #minimalEntry = false;
        #resolveRandomColor; #readiness; #unsubscribeReadiness = null;
        #status = 'idle'; #preset = TIME_CONTROLS[0]; #color = 'white'; #strength = STRENGTHS[0];
        #hydrated = false; #busy = false; #listeners = []; #validation = { valid: false, errors: [], warnings: [] };
        #diagnostics = {
            mounts: 0, hydrations: 0, selections: 0, validations: 0, submits: 0,
            successfulStarts: 0, rejectedStarts: 0, commandFailures: 0, advancedExpansions: 0,
            lastReasonCode: null
        };

        constructor(options = {}) {
            this.#compatibility = safeObject(options) && options.compatibility
                ? options.compatibility : global.CaissaPlayCompatibility;
            this.#minimalEntry = safeObject(options) && options.minimalEntry === true;
            this.#resolveRandomColor = safeObject(options) && typeof options.resolveRandomColor === 'function'
                ? options.resolveRandomColor : () => {
                    const bytes = new Uint8Array(1);
                    if (typeof global.crypto?.getRandomValues !== 'function') return null;
                    global.crypto.getRandomValues(bytes);
                    return bytes[0] % 2 === 0 ? 'white' : 'black';
                };
            this.#readiness = safeObject(options) && options.readiness
                ? options.readiness : global.CaissaPlayV2PlayableReadiness?.create?.();
        }

        mount(options = {}) {
            if (this.#disposed) return this.#record(result(false, 'disposed', REASONS.DISPOSED));
            const host = options.host || options;
            if (!host?.appendChild) return this.#record(result(false, 'rejected', REASONS.INVALID_HOST));
            if (this.#root) return result(true, 'unchanged', REASONS.ALREADY_MOUNTED, this.getSnapshot());
            this.#host = host;
            this.#advanced = options.advancedDisclosure || null;
            this.#root = node('section', 'caissa-games-panel', {
                'data-caissa-games-panel': '', 'aria-labelledby': `${this.#id}-title`
            });
            const title = node('h2', 'caissa-games-panel__title', { id: `${this.#id}-title` });
            title.textContent = this.#minimalEntry ? 'Games' : 'Play Computer';
            const description = node('p', 'caissa-games-panel__description');
            description.textContent = 'Start a local game against the current CAISSA engine.';

            const time = node('fieldset', 'caissa-games-panel__group caissa-games-panel__time caissa-vc caissa-vc-time-controls', {
                'data-visual-component': 'time-control-selector'
            });
            const timeLegend = node('legend', 'caissa-games-panel__legend');
            timeLegend.textContent = 'Time control';
            const timeOptions = node('div', 'caissa-games-panel__options');
            TIME_CONTROLS.forEach(item => {
                const label = node('label', 'caissa-games-panel__option');
                const input = node('input', '', {
                    type: 'radio', name: `${this.#id}-time`, value: item.presetId,
                    'data-games-time': item.presetId
                });
                const text = node('span', '');
                text.textContent = `${item.label} · ${item.category}`;
                label.append(input, text); timeOptions.appendChild(label);
            });
            time.append(timeLegend, timeOptions);

            const color = node('fieldset', 'caissa-games-panel__group caissa-games-panel__color');
            const colorLegend = node('legend', 'caissa-games-panel__legend');
            colorLegend.textContent = 'Play as';
            const colorOptions = node('div', 'caissa-games-panel__options caissa-games-panel__options--color');
            COLORS.forEach(item => {
                const label = node('label', 'caissa-games-panel__option');
                const input = node('input', '', {
                    type: 'radio', name: `${this.#id}-color`, value: item.value,
                    'data-games-color': item.value
                });
                const text = node('span', ''); text.textContent = item.label;
                label.append(input, text); colorOptions.appendChild(label);
            });
            color.append(colorLegend, colorOptions);

            const opponent = node('section', 'caissa-games-panel__group caissa-games-panel__opponent', {
                'aria-labelledby': `${this.#id}-opponent`
            });
            const opponentTitle = node('h3', 'caissa-games-panel__legend', { id: `${this.#id}-opponent` });
            opponentTitle.textContent = 'Machine opponent';
            const opponentValue = node('p', 'caissa-games-panel__opponent-value');
            opponentValue.textContent = 'Full Power';
            const opponentNote = node('p', 'caissa-games-panel__note');
            opponentNote.textContent = 'Current Play uses its fixed maximum-strength engine setting.';
            opponent.append(opponentTitle, opponentValue, opponentNote);

            const status = node('div', 'caissa-games-panel__status', { 'data-games-status': '' });
            const action = node('button', 'caissa-games-panel__primary', {
                type: 'button', 'data-games-primary': '', 'aria-describedby': `${this.#id}-status`
            });
            status.id = `${this.#id}-status`;
            action.textContent = 'Start Game';
            if (this.#minimalEntry) this.#root.setAttribute('aria-label', 'Games setup');
            else this.#root.append(title, description);
            this.#root.append(time, color);
            if (!this.#minimalEntry) this.#root.append(opponent);
            this.#root.append(status, action);
            this.#host.appendChild(this.#root);
            this.#unsubscribeReadiness = this.#readiness?.subscribe?.(() => this.#render()) || null;
            this.#listen(this.#root, 'change', event => this.#handleChange(event));
            this.#listen(action, 'click', () => this.submit());
            if (this.#advanced) this.#listen(this.#advanced, 'toggle', () => {
                if (this.#advanced.open) this.#diagnostics.advancedExpansions += 1;
                this.#diagnostics.lastReasonCode = 'ADVANCED_CHANGED';
            });
            this.#diagnostics.mounts += 1;
            this.hydrateFromLegacy();
            this.#bootReadiness();
            this.#render();
            return this.#record(result(true, 'accepted', REASONS.MOUNTED, this.getSnapshot()));
        }

        hydrateFromLegacy() {
            if (this.#disposed) return this.#record(result(false, 'disposed', REASONS.DISPOSED));
            const snapshot = this.#compatibility?.getSnapshot?.();
            if (!snapshot) {
                this.#status = 'error'; this.#hydrated = false;
                return this.#record(result(false, 'unavailable', REASONS.COMMAND_UNAVAILABLE));
            }
            this.#preset = TIME_CONTROLS.find(item => item.seconds === snapshot.clocks?.timeControlSeconds
                && item.incrementSeconds === (snapshot.clocks?.incrementSeconds || 0)) || TIME_CONTROLS[0];
            this.#color = COLORS.some(item => item.value === snapshot.playerColor) ? snapshot.playerColor : 'white';
            this.#hydrated = true; this.#status = snapshot.game?.active ? 'active' : 'ready';
            this.#diagnostics.hydrations += 1;
            this.validate(); this.#render();
            return this.#record(result(true, 'accepted', REASONS.HYDRATED, this.getSnapshot()));
        }

        setTimeControl(value) {
            const preset = byPreset(value);
            if (!preset) return this.#record(result(false, 'rejected', REASONS.INVALID_PRESET));
            this.#preset = preset; return this.#selection();
        }
        setColor(value) {
            if (!COLORS.some(item => item.value === value))
                return this.#record(result(false, 'rejected', REASONS.INVALID_COLOR));
            this.#color = value; return this.#selection();
        }
        setOpponentStrength(value) {
            if (value !== this.#strength.value)
                return this.#record(result(false, 'rejected', REASONS.INVALID_STRENGTH));
            return result(true, 'unchanged', REASONS.SELECTION_CHANGED, this.getSnapshot());
        }
        setAdvancedExpanded(expanded) {
            if (this.#advanced) this.#advanced.open = expanded === true;
            return result(true, 'accepted', 'ADVANCED_CHANGED', expanded === true);
        }

        validate() {
            const errors = [];
            if (!byPreset(this.#preset?.presetId)) errors.push('Unsupported time control.');
            if (!COLORS.some(item => item.value === this.#color)) errors.push('Unsupported color.');
            if (this.#strength?.value !== 'full-power') errors.push('Unsupported engine strength.');
            if (typeof this.#compatibility?.execute !== 'function') errors.push('Play command is unavailable.');
            this.#validation = { valid: errors.length === 0, errors, warnings: [] };
            this.#diagnostics.validations += 1;
            if (!this.#validation.valid) this.#status = 'invalid';
            this.#render();
            return this.#record(result(this.#validation.valid,
                this.#validation.valid ? 'accepted' : 'rejected',
                this.#validation.valid ? REASONS.VALID : REASONS.COMMAND_UNAVAILABLE,
                this.#validation));
        }

        submit() {
            if (this.#disposed) return this.#record(result(false, 'disposed', REASONS.DISPOSED));
            if (this.#busy) {
                this.#diagnostics.rejectedStarts += 1;
                return this.#record(result(false, 'rejected', REASONS.BUSY));
            }
            const readinessState = this.#readiness?.getSnapshot?.().state;
            if (readinessState === 'recoverable-error') {
                const retry = this.#readiness?.retry?.(); this.#render();
                return this.#record(result(retry?.ok === true, retry?.status || 'rejected', retry?.reasonCode || 'RETRY_UNAVAILABLE'));
            }
            const starting = this.#readiness?.beginStart?.();
            if (!starting?.ok) {
                this.#diagnostics.rejectedStarts += 1;
                return this.#record(result(false, 'rejected', REASONS.COMMAND_UNAVAILABLE));
            }
            this.#diagnostics.submits += 1;
            if (!this.validate().ok) {
                this.#readiness?.completeStart?.(false);
                this.#diagnostics.rejectedStarts += 1;
                return this.#record(result(false, 'rejected', REASONS.COMMAND_UNAVAILABLE));
            }
            const startSource = this.#status === 'active' ? 'new-game' : 'primary-cta';
            this.#busy = true; this.#status = 'busy'; this.#render();
            const resolvedColor = this.#color === 'random' ? this.#resolveRandomColor() : this.#color;
            if (!['white', 'black'].includes(resolvedColor)) {
                this.#readiness?.completeStart?.(false);
                this.#busy = false; this.#status = 'error'; this.#diagnostics.commandFailures += 1;
                this.#diagnostics.rejectedStarts += 1; this.#render();
                return this.#record(result(false, 'failed', REASONS.COMMAND_FAILED));
            }
            const start = () => this.#compatibility.execute('startNewGame', {
                mode: 'engine', color: resolvedColor, timeControl: this.#preset.seconds,
                increment: this.#preset.incrementSeconds
            });
            const commit = () => {
                const command = global.CaissaPlayGameStartAnalytics?.observePanelStart?.({ mode: 'games',
                startSource, timeControlSeconds: this.#preset.seconds, color: resolvedColor,
                opponentType: 'engine', assistanceCategory: 'engine-opponent', qaEligible: true,
                productionEligible: true, actionKey: this.#id }, start) ?? start();
                if (!command?.ok) {
                    this.#readiness?.completeStart?.(false);
                    this.#busy = false;
                    this.#status = 'error'; this.#diagnostics.commandFailures += 1;
                    this.#diagnostics.rejectedStarts += 1; this.#render();
                    return this.#record(result(false, command?.status || 'failed', REASONS.COMMAND_FAILED));
                }
                this.#readiness?.completeStart?.(true);
                this.#status = 'active'; this.#diagnostics.successfulStarts += 1;
                this.#render();
                const board = global.document?.getElementById?.('chessboard');
                if (board?.focus) board.focus({ preventScroll: true });
                const unlock = () => { if (!this.#disposed) { this.#busy = false; this.#render(); } };
                if (typeof global.queueMicrotask === 'function') global.queueMicrotask(unlock);
                else unlock();
                return this.#record(result(true, 'accepted', REASONS.STARTED, this.getSnapshot()));
            };
            if (global.App?.engine && !global.App.engine.ready && typeof global.App.engine.start === 'function') {
                return global.App.engine.start().then(commit).catch(() => {
                    this.#readiness?.completeStart?.(false); this.#busy = false; this.#status = 'error';
                    this.#diagnostics.commandFailures += 1; this.#render();
                    return this.#record(result(false, 'failed', REASONS.COMMAND_FAILED));
                });
            }
            return commit();
        }

        reset() {
            this.#preset = TIME_CONTROLS[0]; this.#color = 'white'; this.#status = 'ready';
            this.#readiness?.reset?.(); this.validate(); this.#bootReadiness(); this.#render();
            return result(true, 'accepted', 'RESET', this.getSnapshot());
        }
        getSnapshot() {
            return deepFreeze({
                schemaVersion: SNAPSHOT_SCHEMA_VERSION, panelId: this.#id,
                mounted: !!this.#root, disposed: this.#disposed, status: this.#status,
                timeControl: { ...this.#preset }, color: this.#color,
                opponent: { type: 'local-engine', strength: this.#strength.value, label: this.#strength.label },
                advancedExpanded: this.#advanced?.open === true,
                primaryAction: {
                    available: this.#validation.valid && !this.#disposed
                        && ['ready', 'recoverable-error'].includes(this.#readiness?.getSnapshot?.().state),
                    label: this.#readiness?.getSnapshot?.().state === 'recoverable-error' ? 'Retry'
                        : this.#status === 'active' ? 'New Game' : 'Play', busy: this.#busy
                },
                playableReadiness: this.#readiness?.getSnapshot?.() || null,
                validation: {
                    valid: this.#validation.valid,
                    errors: [...this.#validation.errors], warnings: [...this.#validation.warnings]
                },
                legacyCompatibility: {
                    hydrated: this.#hydrated, commandAvailable: typeof this.#compatibility?.execute === 'function'
                },
                diagnostics: { ...this.#diagnostics }, listenerCount: this.#listeners.length
            });
        }
        inspect() { return this.getSnapshot(); }
        show() {
            if (this.#root) this.#root.hidden = false;
            return result(true, 'accepted', 'SHOWN', this.getSnapshot());
        }
        hide() {
            if (this.#root) this.#root.hidden = true;
            return result(true, 'accepted', 'HIDDEN', this.getSnapshot());
        }
        unmount() {
            this.#unsubscribeReadiness?.(); this.#unsubscribeReadiness = null; this.#readiness?.dispose?.();
            this.#removeListeners(); this.#root?.remove(); this.#root = null; this.#host = null;
            return result(true, 'accepted', REASONS.UNMOUNTED);
        }
        dispose() {
            if (this.#disposed) return result(true, 'unchanged', REASONS.DISPOSED);
            this.unmount(); this.#disposed = true; this.#status = 'disposed';
            return this.#record(result(true, 'accepted', REASONS.DISPOSED));
        }
        #selection() {
            this.#diagnostics.selections += 1; this.#status = 'ready';
            this.validate(); this.#bootReadiness(); this.#render();
            return this.#record(result(true, 'accepted', REASONS.SELECTION_CHANGED, this.getSnapshot()));
        }
        #handleChange(event) {
            const time = event.target?.dataset?.gamesTime;
            const color = event.target?.dataset?.gamesColor;
            if (time) this.setTimeControl(time);
            if (color) this.setColor(color);
        }
        #render() {
            if (!this.#root) return;
            this.#root.querySelectorAll('[data-games-time]').forEach(input => {
                input.checked = input.value === this.#preset.presetId;
            });
            this.#root.querySelectorAll('[data-games-color]').forEach(input => {
                input.checked = input.value === this.#color;
            });
            const action = this.#root.querySelector('[data-games-primary]');
            const readiness = this.#readiness?.getSnapshot?.();
            const retry = readiness?.state === 'recoverable-error';
            action.disabled = !this.#validation.valid || this.#busy || !['ready', 'recoverable-error'].includes(readiness?.state);
            action.textContent = this.#status === 'active' ? 'New Game' : this.#busy ? 'Starting…' : 'Play';
            action.setAttribute('aria-busy', String(this.#busy));
            const status = this.#root.querySelector('[data-games-status]');
            status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
            if (retry) action.textContent = 'Retry';
            status.textContent = readiness?.state === 'booting' ? 'Preparing the local game...' :
                retry ? 'Play could not be prepared. Retry when ready.' :
                readiness?.state === 'unavailable' ? 'Play is unavailable in this session.' :
                this.#status === 'active' ? 'Local machine game in progress.' :
                this.#status === 'error' ? 'The game could not be started.' :
                this.#status === 'invalid' ? this.#validation.errors.join(' ') :
                this.#minimalEntry ? `${this.#preset.label} · ${COLORS.find(item => item.value === this.#color)?.label} selected.` :
                    'Choose your settings, then start the game.';
        }
        #bootReadiness() {
            return this.#readiness?.boot?.({ mode: 'games', seconds: this.#preset.seconds,
                incrementSeconds: this.#preset.incrementSeconds, color: this.#color });
        }
        #record(operation) {
            this.#diagnostics.lastReasonCode = operation.reasonCode;
            return operation;
        }
        #listen(target, type, handler) {
            target.addEventListener(type, handler);
            this.#listeners.push({ target, type, handler });
        }
        #removeListeners() {
            this.#listeners.splice(0).forEach(({ target, type, handler }) => target.removeEventListener(type, handler));
        }
    }

    global.CaissaGamesPanel = Object.freeze({
        schemaVersion: SCHEMA_VERSION, snapshotSchemaVersion: SNAPSHOT_SCHEMA_VERSION,
        statuses: STATUSES, events: EVENTS, reasonCodes: REASONS, sections: SECTIONS,
        timeControls: TIME_CONTROLS, colors: COLORS, opponentStrengths: STRENGTHS,
        create: options => new GamesPanel(options)
    });
})(typeof window !== 'undefined' ? window : globalThis);
