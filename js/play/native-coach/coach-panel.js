(function installNativeCoachPanel(root) {
    'use strict';
    let sequence = 0;
    let activePanel = null;
    const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
    const result = (ok, reasonCode, value = null) => freeze({ ok, reasonCode, value });
    const node = (tag, attrs = {}) => { const item = root.document.createElement(tag);
        Object.entries(attrs).forEach(([key, value]) => item.setAttribute(key, value)); return item; };
    class Panel {
        #id = `native-coach-${++sequence}`; #root = null; #host = null; #disposed = false; #listeners = [];
        #configuration = { ...root.CaissaNativeCoachConfiguration.defaults }; #assistance = root.CaissaNativeCoachAssistance.create();
        #status = 'ready'; #starts = 0; #helpSequence = 0;
        mount(options = {}) {
            const host = options.host || options; if (this.#disposed || !host?.appendChild) return result(false, 'INVALID_HOST');
            this.#host = host; const section = this.#root = node('section', { class: 'caissa-games-panel caissa-native-coach-panel',
                'data-caissa-native-coach-panel': '', 'aria-labelledby': `${this.#id}-title` });
            const title = node('h2', { id: `${this.#id}-title` }); title.textContent = 'Coach · Internal';
            const note = node('p', { 'data-coach-pending': '', role: 'status' });
            note.textContent = 'Bounded assistance is locally certified. Human and device review remain pending.';
            const setup = node('div', { role: 'group', 'aria-label': 'Coach assisted-play setup' });
            for (const [key, label, values] of [['level', 'Assistance level', root.CaissaNativeCoachConfiguration.levels],
                ['focus', 'Assistance focus', root.CaissaNativeCoachConfiguration.focuses],
                ['timing', 'Assistance timing', root.CaissaNativeCoachConfiguration.timings],
                ['timeControl', 'Time control', root.CaissaNativeCoachConfiguration.timeControls.map(item => item.id)],
                ['color', 'Play as', root.CaissaNativeCoachConfiguration.colors]]) {
                const wrapper = node('label'); wrapper.textContent = `${label} `; const select = node('select', { [`data-coach-${key}`]: '' });
                values.forEach(value => { const option = node('option', { value });
                    option.textContent = key === 'timeControl' ? root.CaissaNativeCoachConfiguration.timeControls.find(item => item.id === value).label
                        : value.replace('-', ' ').replace(/^./, character => character.toUpperCase()); select.appendChild(option); });
                wrapper.appendChild(select); setup.appendChild(wrapper);
            }
            const live = node('div', { 'data-coach-assistance-live': '', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
            const action = node('button', { type: 'button', class: 'caissa-games-panel__primary', 'data-coach-primary': '' }); action.textContent = 'Play';
            const help = node('button', { type: 'button', 'data-coach-help': '', disabled: '', 'aria-describedby': `${this.#id}-help-status` }); help.textContent = 'Help';
            const dismiss = node('button', { type: 'button', 'data-coach-dismiss': '', disabled: '' }); dismiss.textContent = 'Dismiss assistance';
            live.id = `${this.#id}-help-status`; section.append(title, note, setup, live, action, help, dismiss); host.appendChild(section);
            this.#listen(section, 'change', event => { const key = Object.keys(event.target.dataset || {})
                .find(name => name.startsWith('coach')); if (key) { this.#configuration[key.slice(5, 6).toLowerCase() + key.slice(6)] = event.target.value;
                    this.#assistance.configure(this.#configuration); } });
            this.#listen(action, 'click', () => this.submit()); this.#listen(help, 'click', () => this.requestHelp());
            this.#listen(dismiss, 'click', () => { this.#assistance.dismiss(); dismiss.disabled = true; this.#render('Assistance dismissed.'); });
            this.#assistance.configure(this.#configuration); return result(true, 'MOUNTED', this.getSnapshot());
        }
        async submit() {
            const validation = root.CaissaNativeCoachConfiguration.validate(this.#configuration);
            if (!validation.valid || this.#disposed) return result(false, 'INVALID_CONFIGURATION');
            const time = root.CaissaNativeCoachConfiguration.timeControls.find(item => item.id === this.#configuration.timeControl);
            if (root.App?.engine && !root.App.engine.ready && typeof root.App.engine.start === 'function') {
                try { await root.App.engine.start(); } catch (_) {
                    this.#status = 'error'; this.#render('The assisted-play game could not start.'); return result(false, 'ENGINE_UNAVAILABLE');
                }
            }
            const command = root.CaissaPlayCompatibility?.execute?.('startNewGame', {
                mode: 'engine', color: this.#configuration.color, timeControl: time.seconds
            });
            if (!command?.ok) { this.#status = 'error'; this.#render('The assisted-play game could not start.'); return result(false, 'COMMAND_FAILED'); }
            this.#starts += 1; this.#status = 'active'; this.#assistance.teardown(); this.#root.querySelector('[data-coach-help]').disabled = false;
            this.#render('Game started. Bounded assistance is available on request.'); return result(true, 'STARTED', this.getSnapshot());
        }
        requestHelp() {
            if (this.#status !== 'active' || this.#disposed) return result(false, 'HELP_UNAVAILABLE');
            const game = root.App?.game; const history = game?.history?.() || []; const opponentWorking = root.App?.engine?.searching === true;
            const promotionPending = !!root.document?.querySelector?.('.promotion-modal:not([hidden])');
            const response = this.#assistance.requestHelp({ eventId: `help-${++this.#helpSequence}`, turnId: String(history.length), openingPly: history.length,
                opponentWorking, promotionPending, terminal: game?.game_over?.() === true, lowTime: false });
            const dismiss = this.#root.querySelector('[data-coach-dismiss]');
            if (response.ok) { this.#render(response.presentation.message); dismiss.disabled = false; }
            else { this.#render(response.reasonCode === 'COOLDOWN' ? 'Help is cooling down.' : 'Help is unavailable right now.'); }
            return response;
        }
        configure(changes = {}) {
            if (this.#disposed || !changes || typeof changes !== 'object') return result(false, 'INVALID_CONFIGURATION');
            const next = { ...this.#configuration, ...changes };
            const validation = root.CaissaNativeCoachConfiguration.validate(next);
            if (!validation.valid) return result(false, 'INVALID_CONFIGURATION');
            this.#configuration = next; this.#assistance.configure(this.#configuration);
            Object.entries(this.#configuration).forEach(([key, value]) => {
                const control = this.#root?.querySelector(`[data-coach-${key}]`);
                if (control) control.value = value;
            });
            this.#render('Assistance options updated for this Play session.');
            return result(true, 'CONFIGURED', this.getSnapshot());
        }
        #render(message) { const live = this.#root?.querySelector('[data-coach-assistance-live]'); if (live) live.textContent = message; }
        show() { if (this.#root) this.#root.hidden = false; return result(true, 'SHOWN'); }
        hide() { this.#assistance.teardown(); if (this.#root) this.#root.hidden = true; return result(true, 'HIDDEN'); }
        reset() {
            this.#status = 'ready'; this.#assistance.teardown(); this.#assistance.configure(this.#configuration);
            const help = this.#root?.querySelector('[data-coach-help]'); if (help) help.disabled = true;
            const dismiss = this.#root?.querySelector('[data-coach-dismiss]'); if (dismiss) dismiss.disabled = true;
            this.#render(''); return result(true, 'RESET', this.getSnapshot());
        }
        getSnapshot() { return freeze({ schemaVersion: '1.0.0', status: this.#status, configuration: { ...this.#configuration },
            starts: this.#starts, assistance: this.#assistance.inspect(), primaryAction: 'Play', publicReady: false }); }
        dispose() { if (activePanel === this) activePanel = null;
            this.#listeners.splice(0).forEach(item => item.target.removeEventListener(item.type, item.handler));
            this.#assistance.dispose(); this.#root?.remove(); this.#root = null; this.#disposed = true; return true; }
        #listen(target, type, handler) { target.addEventListener(type, handler); this.#listeners.push({ target, type, handler }); }
    }
    root.CaissaNativeCoachPanel = freeze({ schemaVersion: '1.0.0', create: () => { const panel = new Panel(); activePanel = panel; return panel; },
        getActiveSnapshot: () => activePanel?.getSnapshot?.() || null });
})(typeof window !== 'undefined' ? window : globalThis);
