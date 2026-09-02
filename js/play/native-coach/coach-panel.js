(function installNativeCoachPanel(root) {
    'use strict';
    const SCHEMA_VERSION = '2.3.0';
    const COLORS = Object.freeze([
        Object.freeze({ value: 'white', label: 'White', symbol: '♚' }),
        Object.freeze({ value: 'random', label: 'Random', symbol: '?' }),
        Object.freeze({ value: 'black', label: 'Black', symbol: '♚' })
    ]);
    let sequence = 0; let activePanel = null;
    const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
    const result = (ok, reasonCode, value = null) => freeze({ ok, reasonCode, value });
    const node = (tag, attrs = {}) => { const item = root.document.createElement(tag);
        Object.entries(attrs).forEach(([key, value]) => item.setAttribute(key, value)); return item; };

    class Panel {
        #id = `native-coach-${++sequence}`; #root = null; #host = null; #disposed = false; #listeners = [];
        #configuration = { ...root.CaissaNativeCoachConfiguration.defaults };
        #assistance = root.CaissaNativeCoachAssistance.create(); #status = 'ready'; #starts = 0; #helpSequence = 0;
        #dialogue = root.CaissaNativeCoachDialogue.create(); #experience = 'casual'; #color = 'white';
        #entitlement = root.CaissaCoachEntitlementClient.create(); #submitting = false;

        mount(options = {}) {
            const host = options.host || options;
            if (this.#disposed || !host?.appendChild) return result(false, 'INVALID_HOST');
            this.#host = host;
            const section = this.#root = node('section', { class: 'caissa-native-coach-panel',
                'data-caissa-native-coach-panel': '', 'aria-labelledby': `${this.#id}-title` });
            const title = node('h2', { id: `${this.#id}-title`, class: 'caissa-native-coach-panel__title' });
            title.textContent = 'Play Coach';

            const persona = node('div', { class: 'caissa-native-coach-panel__persona' });
            const portrait = node('img', { class: 'caissa-native-coach-panel__portrait',
                src: '/assets/play/caissa-coach-goddess.png', alt: 'Caissa, goddess of chess', width: '512', height: '512' });
            const speech = node('div', { class: 'caissa-native-coach-panel__speech', 'data-coach-narration': '' });
            speech.textContent = root.CaissaNativeCoachDialogue.messages.WELCOME;
            persona.append(portrait, speech);

            const controls = node('div', { class: 'caissa-native-coach-panel__controls',
                role: 'group', 'aria-label': 'Coach game choices' });
            const experience = node('label', { class: 'caissa-native-coach-panel__experience' });
            const experienceLabel = node('span', { class: 'caissa-native-coach-panel__control-label' });
            experienceLabel.textContent = 'Level';
            const experienceSelect = node('select', { 'data-coach-experience': '', 'aria-label': 'Coach level' });
            root.CaissaNativeCoachLevels.publicOptions.forEach(item => {
                const option = node('option', { value: item.id }); option.textContent = item.label;
                experienceSelect.appendChild(option);
            });
            experience.append(experienceLabel, experienceSelect);

            const color = node('fieldset', { class: 'caissa-native-coach-panel__color' });
            const legend = node('legend', { class: 'caissa-native-coach-panel__control-label' }); legend.textContent = 'Play As';
            const colorOptions = node('div', { class: 'caissa-native-coach-panel__color-options' });
            COLORS.forEach(item => {
                const label = node('label', { class: 'caissa-native-coach-panel__color-choice' });
                const input = node('input', { type: 'radio', name: `${this.#id}-color`, value: item.value,
                    'data-coach-color-choice': item.value, 'aria-label': item.label });
                const symbol = node('span', { class: `caissa-color-token caissa-color-token--${item.value}`,
                    'aria-hidden': 'true', 'data-color-token': item.value }); symbol.textContent = item.symbol;
                label.append(input, symbol); colorOptions.appendChild(label);
            });
            color.append(legend, colorOptions); controls.append(experience, color);

            const action = node('button', { type: 'button', class: 'caissa-native-coach-panel__primary',
                'data-coach-primary': '', disabled: '' }); action.textContent = 'Play';
            const access = node('div', { class: 'caissa-native-coach-panel__access',
                'data-coach-access-status': '', role: 'status', 'aria-live': 'polite' });
            access.textContent = 'Checking Coach access…';
            const premium = node('a', { class: 'caissa-native-coach-panel__premium',
                'data-coach-premium-link': '', href: '/premium', hidden: '' });
            premium.textContent = 'Explore Premium';
            const help = node('button', { type: 'button', 'data-coach-help': '', hidden: '', disabled: '' }); help.textContent = 'Help';
            const dismiss = node('button', { type: 'button', 'data-coach-dismiss': '', hidden: '', disabled: '' });
            dismiss.textContent = 'Dismiss assistance';
            section.append(title, persona, controls, access, premium, action, help, dismiss); host.appendChild(section);
            this.#listen(section, 'change', event => this.#change(event));
            this.#listen(action, 'click', () => this.submit()); this.#listen(help, 'click', () => this.requestHelp());
            this.#listen(dismiss, 'click', () => { this.#assistance.dismiss(); dismiss.disabled = true;
                this.#renderDialogue(this.#dialogue.silence()); });
            this.#listen(root, 'caissa-turn-change', event => this.#handleTurn(event.detail));
            this.#listen(root, 'caissa-coach-observation', event => {
                const message = event.detail?.message?.message;
                if (this.#status === 'active' && typeof message === 'string' && message.length <= 220) this.#render(message);
            });
            this.#listen(root, 'caissa-coach-hint', event => this.#render(event.detail?.message || 'Take another look at the position.'));
            this.#listen(root, 'caissa-coach-narration-request', event => {
                if (this.#status === 'active' && typeof event.detail?.message === 'string') this.#render(event.detail.message);
            });
            this.#listen(root, 'caissa-game-end', () => this.#renderDialogue(this.#dialogue.observe({ type: 'game-complete',
                category: 'completion', messageKey: 'GAME_COMPLETE', ply: 0, requested: true })));
            this.#assistance.configure(this.#configuration); this.#renderSelection();
            this.#refreshEntitlement();
            return result(true, 'MOUNTED', this.getSnapshot());
        }

        async submit() {
            if (this.#disposed) return result(false, 'INVALID_CONFIGURATION');
            if (this.#submitting) return result(false, 'START_IN_PROGRESS');
            const currentAccess = this.#entitlement.inspect();
            if (currentAccess?.code === 'AUTH_REQUIRED') {
                root.CAISSA_AUTH?.redirectToSignIn?.('/play/coach');
                return result(false, 'AUTH_REQUIRED');
            }
            this.#submitting = true;
            const primary = this.#root?.querySelector('[data-coach-primary]');
            if (primary) { primary.disabled = true; primary.setAttribute('aria-busy', 'true'); }
            try {
                const resolvedColor = this.#color === 'random' ? this.#randomColor() : this.#color;
                const level = root.CaissaNativeCoachLevels.get(this.#experience);
                if (!root.CaissaNativeCoachLevels.validate(level)) return result(false, 'INVALID_LEVEL');
                const configuration = { ...this.#configuration, color: resolvedColor,
                    level: level.teachingStrength.assistanceLevel, focus: level.teachingStrength.focus };
                const validation = root.CaissaNativeCoachConfiguration.validate(configuration);
                if (!validation.valid) return result(false, 'INVALID_CONFIGURATION');
                const time = root.CaissaNativeCoachConfiguration.timeControls.find(item => item.id === configuration.timeControl);
                if (root.App?.engine && !root.App.engine.ready && typeof root.App.engine.start === 'function') {
                    try { await root.App.engine.start(); } catch (_) {
                        this.#status = 'error'; this.#renderDialogue(this.#dialogue.observe({ type: 'error', category: 'system',
                            messageKey: 'START_ERROR', ply: 0, requested: true }));
                        return result(false, 'ENGINE_UNAVAILABLE');
                    }
                }
                const access = await this.#entitlement.consume();
                this.#renderAccess(access);
                if (!access.allowed) {
                    if (access.code === 'AUTH_REQUIRED') root.CAISSA_AUTH?.redirectToSignIn?.('/play/coach');
                    return result(false, access.code);
                }
                this.#configuration = configuration;
                this.#assistance.configure(this.#configuration);
                this.#dialogue.configure(level.coachPersonality);
                const command = root.CaissaPlayCompatibility?.execute?.('startNewGame', {
                    mode: 'engine', color: resolvedColor, timeControl: time.seconds,
                    targetElo: level.opponentStrength.targetElo
                });
                if (!command?.ok) { this.#status = 'error'; this.#renderDialogue(this.#dialogue.observe({ type: 'error', category: 'system',
                        messageKey: 'START_ERROR', ply: 0, requested: true }));
                    return result(false, 'COMMAND_FAILED'); }
                this.#starts += 1; this.#status = 'active'; this.#assistance.teardown();
                this.#dialogue.reset();
                this.#root.querySelector('[data-coach-help]').disabled = false;
                this.#renderDialogue(this.#dialogue.observe({ type: 'game-ready', category: 'general',
                    messageKey: 'GAME_READY', ply: 0, requested: true }));
                return result(true, 'STARTED', this.getSnapshot());
            } finally {
                this.#submitting = false;
                if (primary) primary.setAttribute('aria-busy', 'false');
                if (this.#status !== 'active' && !this.#disposed) this.#refreshEntitlement();
            }
        }

        requestHelp() {
            if (this.#status !== 'active' || this.#disposed) return result(false, 'HELP_UNAVAILABLE');
            const game = root.App?.game; const history = game?.history?.() || [];
            const response = this.#assistance.requestHelp({ eventId: `help-${++this.#helpSequence}`,
                turnId: String(history.length), openingPly: history.length,
                opponentWorking: root.App?.engine?.searching === true,
                promotionPending: !!root.document?.querySelector?.('.promotion-modal:not([hidden])'),
                terminal: game?.game_over?.() === true, lowTime: false });
            const dismiss = this.#root.querySelector('[data-coach-dismiss]');
            if (response.ok) { this.#renderDialogue(this.#dialogue.presentAssistance(response.presentation)); dismiss.disabled = false; }
            else this.#render(response.reasonCode === 'COOLDOWN' ? 'Give the position another look first.' : 'I cannot help right now.');
            return response;
        }

        configure(changes = {}) {
            if (this.#disposed || !changes || typeof changes !== 'object') return result(false, 'INVALID_CONFIGURATION');
            const next = { ...this.#configuration, ...changes };
            const validation = root.CaissaNativeCoachConfiguration.validate(next);
            if (!validation.valid) return result(false, 'INVALID_CONFIGURATION');
            this.#configuration = next; this.#assistance.configure(this.#configuration);
            this.#render('Your coaching preferences are ready.');
            return result(true, 'CONFIGURED', this.getSnapshot());
        }
        #change(event) {
            if (event.target?.hasAttribute?.('data-coach-experience')) {
                const level = root.CaissaNativeCoachLevels.get(event.target.value);
                if (level) { this.#experience = level.id; this.#dialogue.configure(level.coachPersonality); }
            }
            if (event.target?.hasAttribute?.('data-coach-color-choice')) this.#color = event.target.value;
            this.#renderSelection();
        }
        #handleTurn(detail = {}) {
            if (this.#status !== 'active' || this.#disposed || detail.turn !== this.#configuration.color) return;
            const ply = root.App?.game?.history?.().length || 0;
            const inCheck = detail.inCheck === true;
            const messageKey = inCheck ? 'CHECK_ALERT' : ply % 8 === 0 ? 'PAUSE_AND_SCAN'
                : ply % 12 === 0 ? 'KEEP_BUILDING' : 'TAKE_YOUR_TIME';
            this.#renderDialogue(this.#dialogue.observe({ type: 'user-turn',
                category: inCheck ? 'check' : 'encouragement', messageKey, ply, requested: false }));
        }
        #randomColor() {
            const bytes = new Uint8Array(1);
            if (typeof root.crypto?.getRandomValues !== 'function') return null;
            root.crypto.getRandomValues(bytes); return bytes[0] % 2 === 0 ? 'white' : 'black';
        }
        async #refreshEntitlement() {
            const access = await this.#entitlement.refresh();
            if (!this.#disposed) this.#renderAccess(access);
            return access;
        }
        #renderAccess(access) {
            const status = this.#root?.querySelector('[data-coach-access-status]');
            const action = this.#root?.querySelector('[data-coach-primary]');
            const premium = this.#root?.querySelector('[data-coach-premium-link]');
            if (!status || !action || !premium) return;
            const messages = {
                OPEN_PREVIEW_ACCESS: 'Coach is open during the Play v3 feedback preview.',
                PREMIUM_ACCESS: 'Coach access is included with your plan.',
                TRIAL_AVAILABLE: '1 complimentary Coach game is available.',
                TRIAL_CONSUMED: 'Your complimentary Coach game is now in progress.',
                TRIAL_REPLAY: 'Your complimentary Coach game is now in progress.',
                COACH_TRIAL_USED: 'Your complimentary Coach game has been used.',
                AUTH_REQUIRED: 'Sign in to use your complimentary Coach game.',
                ACCOUNT_SYNC_REQUIRED: 'Finish account setup before starting Coach.',
                COACH_ACCESS_UNAVAILABLE: 'Coach access is temporarily unavailable.'
            };
            status.textContent = messages[access?.code] || 'Coach access is temporarily unavailable.';
            action.textContent = access?.code === 'AUTH_REQUIRED' ? 'Sign in to play' : 'Play';
            action.disabled = access?.allowed !== true && access?.code !== 'AUTH_REQUIRED';
            action.setAttribute('aria-busy', String(this.#submitting));
            premium.hidden = access?.code !== 'COACH_TRIAL_USED';
        }
        #renderSelection() {
            const experience = this.#root?.querySelector('[data-coach-experience]');
            if (experience) experience.value = this.#experience;
            this.#root?.querySelectorAll('[data-coach-color-choice]').forEach(input => input.checked = input.value === this.#color);
        }
        #render(message) {
            const speech = this.#root?.querySelector('[data-coach-narration]');
            if (speech) speech.textContent = message;
            root.dispatchEvent?.(new CustomEvent('caissa-coach-narration', { detail: { message } }));
        }
        #renderDialogue(outcome) { if (outcome?.ok && outcome.message) this.#render(outcome.message); return outcome; }
        show() { if (this.#root) this.#root.hidden = false; return result(true, 'SHOWN'); }
        hide() { this.#assistance.teardown(); if (this.#root) this.#root.hidden = true; return result(true, 'HIDDEN'); }
        reset() {
            this.#status = 'ready'; this.#assistance.teardown(); this.#assistance.configure(this.#configuration); this.#dialogue.reset();
            const help = this.#root?.querySelector('[data-coach-help]'); if (help) help.disabled = true;
            const dismiss = this.#root?.querySelector('[data-coach-dismiss]'); if (dismiss) dismiss.disabled = true;
            const primary = this.#root?.querySelector('[data-coach-primary]'); if (primary) primary.disabled = true;
            const access = this.#root?.querySelector('[data-coach-access-status]'); if (access) access.textContent = 'Checking Coach access…';
            this.#refreshEntitlement();
            this.#render(root.CaissaNativeCoachDialogue.messages.WELCOME); return result(true, 'RESET', this.getSnapshot());
        }
        getSnapshot() { return freeze({ schemaVersion: SCHEMA_VERSION, status: this.#status,
            experience: this.#experience, selectedColor: this.#color, configuration: { ...this.#configuration },
            level: root.CaissaNativeCoachLevels.get(this.#experience),
            starts: this.#starts, assistance: this.#assistance.inspect(), dialogue: this.#dialogue.inspect(),
            entitlement: this.#entitlement.inspect(), primaryAction: 'Play', publicReady: false }); }
        dispose() { if (activePanel === this) activePanel = null;
            this.#listeners.splice(0).forEach(item => item.target.removeEventListener(item.type, item.handler));
            this.#assistance.dispose(); this.#dialogue.dispose(); this.#entitlement.dispose();
            this.#root?.remove(); this.#root = null; this.#disposed = true; return true; }
        #listen(target, type, handler) { target.addEventListener(type, handler); this.#listeners.push({ target, type, handler }); }
    }
    root.CaissaNativeCoachPanel = freeze({ schemaVersion: SCHEMA_VERSION, colors: COLORS,
        create: () => { const panel = new Panel(); activePanel = panel; return panel; },
        getActiveSnapshot: () => activePanel?.getSnapshot?.() || null });
})(typeof window !== 'undefined' ? window : globalThis);
