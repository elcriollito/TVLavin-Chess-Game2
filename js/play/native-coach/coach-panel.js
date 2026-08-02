(function installNativeCoachPanel(root) {
    'use strict';
    let sequence = 0;
    const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
    const result = (ok, reasonCode, value = null) => freeze({ ok, reasonCode, value });
    const node = (tag, attrs = {}) => { const item = root.document.createElement(tag);
        Object.entries(attrs).forEach(([key, value]) => item.setAttribute(key, value)); return item; };
    class Panel {
        #id = `native-coach-${++sequence}`; #root = null; #host = null; #disposed = false; #listeners = [];
        #configuration = { ...root.CaissaNativeCoachConfiguration.defaults }; #assistance = root.CaissaNativeCoachAssistance.create();
        #status = 'ready'; #starts = 0;
        mount(options = {}) {
            const host = options.host || options; if (this.#disposed || !host?.appendChild) return result(false, 'INVALID_HOST');
            this.#host = host; const section = this.#root = node('section', { class: 'caissa-games-panel caissa-native-coach-panel',
                'data-caissa-native-coach-panel': '', 'aria-labelledby': `${this.#id}-title` });
            const title = node('h2', { id: `${this.#id}-title` }); title.textContent = 'Coach · Internal';
            const note = node('p', { 'data-coach-pending': '', role: 'status' });
            note.textContent = 'Assistance certification pending. This remains a local chess game.';
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
            section.append(title, note, setup, live, action); host.appendChild(section);
            this.#listen(section, 'change', event => { const key = Object.keys(event.target.dataset || {})
                .find(name => name.startsWith('coach')); if (key) this.#configuration[key.slice(5, 6).toLowerCase() + key.slice(6)] = event.target.value; });
            this.#listen(action, 'click', () => this.submit()); return result(true, 'MOUNTED', this.getSnapshot());
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
            this.#starts += 1; this.#status = 'active'; this.#assistance.observe({ type: 'game-start' });
            this.#render('Game started. Bounded assistance is available.'); return result(true, 'STARTED', this.getSnapshot());
        }
        #render(message) { const live = this.#root?.querySelector('[data-coach-assistance-live]'); if (live) live.textContent = message; }
        show() { if (this.#root) this.#root.hidden = false; return result(true, 'SHOWN'); }
        hide() { if (this.#root) this.#root.hidden = true; return result(true, 'HIDDEN'); }
        getSnapshot() { return freeze({ schemaVersion: '1.0.0', status: this.#status, configuration: { ...this.#configuration },
            starts: this.#starts, assistance: this.#assistance.inspect(), primaryAction: 'Play', publicReady: false }); }
        dispose() { this.#listeners.splice(0).forEach(item => item.target.removeEventListener(item.type, item.handler));
            this.#assistance.dispose(); this.#root?.remove(); this.#root = null; this.#disposed = true; return true; }
        #listen(target, type, handler) { target.addEventListener(type, handler); this.#listeners.push({ target, type, handler }); }
    }
    root.CaissaNativeCoachPanel = freeze({ schemaVersion: '1.0.0', create: () => new Panel() });
})(typeof window !== 'undefined' ? window : globalThis);
