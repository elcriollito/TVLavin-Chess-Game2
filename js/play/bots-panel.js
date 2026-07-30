(function installBotsPanel(global) {
    'use strict';

    const SCHEMA_VERSION = '1.1.0';
    const CALIBRATION_SUITE_VERSION = '1.0.0';
    const STATUSES = Object.freeze(['ready', 'busy', 'active', 'error', 'disposed']);
    let sequence = 0;
    function deepFreeze(value, seen = new WeakSet()) {
        if (!value || typeof value !== 'object' || seen.has(value)) return value;
        seen.add(value); Object.values(value).forEach(item => deepFreeze(item, seen));
        return Object.freeze(value);
    }
    function result(ok, status, reasonCode, value = null) {
        return deepFreeze({ ok, status, reasonCode, value });
    }
    function element(tag, className, attrs = {}) {
        const node = global.document.createElement(tag); node.className = className;
        Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
        return node;
    }

    class BotsPanel {
        #id = `bots-panel-${++sequence}`; #root = null; #host = null; #disposed = false;
        #selectedId = null; #status = 'ready'; #timeControl = 0; #color = 'white'; #listeners = [];
        #compatibility; #diagnostics = { selections: 0, starts: 0, rejected: 0 };
        constructor(options = {}) { this.#compatibility = options.compatibility || global.CaissaPlayCompatibility; }
        mount(options = {}) {
            const host = options.host || options;
            if (this.#disposed || !host?.appendChild) return result(false, 'rejected', 'INVALID_HOST');
            this.#host = host; this.#selectedId = global.CaissaBotRegistry.getDefault()?.id || null;
            global.CaissaBotSession.select(this.#selectedId);
            this.#root = element('section', 'caissa-bots-panel', {
                'data-caissa-bots-panel': '', 'aria-labelledby': `${this.#id}-title`
            });
            const title = element('h2', 'caissa-bots-panel__title', { id: `${this.#id}-title` });
            title.textContent = 'Choose a CAISSA Bot';
            const note = element('p', 'caissa-bots-panel__note');
            note.textContent = 'QA-only machine opponents. Difficulty is relative and position-suite tested, not a human rating.';
            const ladder = element('ol', 'caissa-bots-panel__ladder', {
                'aria-label': 'Relative difficulty, easiest to hardest'
            });
            const list = element('div', 'caissa-bots-panel__catalog', { role: 'radiogroup', 'aria-label': 'Bot catalog' });
            global.CaissaBotRegistry.list({ enabled: true }).forEach(profile => {
                const rung = element('li', 'caissa-bots-panel__rung', { 'data-bot-rung': profile.id });
                rung.textContent = profile.shortName; ladder.appendChild(rung);
                const label = element('label', 'caissa-bots-panel__card caissa-vc caissa-vc-card', {
                    'data-bot-card': profile.id, 'data-visual-component': 'profile-card'
                });
                const input = element('input', '', {
                    type: 'radio', name: `${this.#id}-bot`, value: profile.id, 'data-bot-id': profile.id
                });
                const emblem = element('span',
                    `caissa-bots-panel__emblem caissa-bots-panel__emblem--${profile.shortName.toLowerCase()}`,
                    { 'aria-hidden': 'true' });
                emblem.textContent = profile.shortName.slice(0, 1);
                const copy = element('span', 'caissa-bots-panel__card-copy');
                const name = element('strong', ''); name.textContent = profile.name;
                const metadata = element('span', '');
                metadata.textContent = profile.difficultyBand;
                copy.append(name, metadata); label.append(input, emblem, copy); list.appendChild(label);
            });
            const detail = element('article', 'caissa-bots-panel__detail', { 'data-bot-detail': '' });
            const settings = element('div', 'caissa-bots-panel__options');
            const color = element('label', ''); color.textContent = 'Play as ';
            const colorSelect = element('select', '', { 'data-bot-color': '' });
            for (const value of ['white', 'black']) {
                const item = element('option', '', { value }); item.textContent = value[0].toUpperCase() + value.slice(1);
                colorSelect.appendChild(item);
            }
            color.appendChild(colorSelect);
            const time = element('label', ''); time.textContent = 'Time control ';
            const timeSelect = element('select', '', { 'data-bot-time': '' });
            for (const [value, labelText] of [['0', 'No limit'], ['300', '5+0'], ['600', '10+0']]) {
                const item = element('option', '', { value }); item.textContent = labelText; timeSelect.appendChild(item);
            }
            time.appendChild(timeSelect); settings.append(color, time);
            const status = element('div', 'caissa-bots-panel__status', {
                'data-bot-status': '', id: `${this.#id}-status`
            });
            const action = element('button', 'caissa-bots-panel__primary', {
                type: 'button', 'data-bot-primary': '', 'aria-describedby': `${this.#id}-status`
            });
            action.textContent = 'Play Bot';
            this.#root.append(title, note, ladder, list, detail, settings, status, action); host.appendChild(this.#root);
            this.#listen(this.#root, 'change', event => this.#change(event));
            this.#listen(action, 'click', () => this.submit());
            this.#render();
            return result(true, 'accepted', 'MOUNTED', this.getSnapshot());
        }
        select(id) {
            const selected = global.CaissaBotSession.select(id);
            if (!selected.ok) { this.#diagnostics.rejected += 1; return selected; }
            this.#selectedId = id; this.#diagnostics.selections += 1; this.#render();
            return result(true, 'accepted', 'SELECTED', this.getSnapshot());
        }
        submit() {
            if (this.#disposed || this.#status === 'busy') return result(false, 'rejected', 'UNAVAILABLE');
            const selected = global.CaissaBotSession.select(this.#selectedId);
            if (!selected.ok) return result(false, 'rejected', 'INVALID_SELECTION');
            this.#status = 'busy'; this.#render();
            const command = this.#compatibility.execute('startNewGame', {
                mode: 'engine', color: this.#color, timeControl: this.#timeControl
            });
            if (!command?.ok) {
                this.#status = 'error'; this.#diagnostics.rejected += 1; this.#render();
                return result(false, 'failed', 'COMMAND_FAILED');
            }
            this.#status = 'active'; this.#diagnostics.starts += 1; this.#render();
            return result(true, 'accepted', 'STARTED', this.getSnapshot());
        }
        show() { if (this.#root) this.#root.hidden = false; return result(true, 'accepted', 'SHOWN'); }
        hide() { if (this.#root) this.#root.hidden = true; return result(true, 'accepted', 'HIDDEN'); }
        getSnapshot() {
            return deepFreeze({
                schemaVersion: SCHEMA_VERSION, panelId: this.#id, mounted: !!this.#root,
                status: this.#status, selectedBotId: this.#selectedId, color: this.#color,
                timeControlSeconds: this.#timeControl, primaryAction: { label: 'Play Bot', available: !this.#disposed },
                listenerCount: this.#listeners.length, diagnostics: { ...this.#diagnostics }
            });
        }
        inspect() { return this.getSnapshot(); }
        dispose() {
            this.#listeners.splice(0).forEach(({ target, type, handler }) => target.removeEventListener(type, handler));
            this.#root?.remove(); this.#root = null; this.#disposed = true; this.#status = 'disposed';
            return result(true, 'accepted', 'DISPOSED');
        }
        #change(event) {
            if (event.target?.dataset?.botId) this.select(event.target.dataset.botId);
            if (event.target?.hasAttribute?.('data-bot-color')) this.#color = event.target.value;
            if (event.target?.hasAttribute?.('data-bot-time')) this.#timeControl = Number(event.target.value);
            this.#render();
        }
        #render() {
            if (!this.#root) return;
            this.#root.querySelectorAll('[data-bot-id]').forEach(input => input.checked = input.value === this.#selectedId);
            const status = this.#root.querySelector('[data-bot-status]');
            const profile = global.CaissaBotRegistry.get(this.#selectedId);
            this.#root.querySelectorAll('[data-bot-rung]').forEach(rung => {
                if (rung.dataset.botRung === this.#selectedId) rung.setAttribute('aria-current', 'step');
                else rung.removeAttribute('aria-current');
            });
            const detail = this.#root.querySelector('[data-bot-detail]');
            if (detail && profile) {
                const preset = global.CaissaBotPresets.get(profile.enginePresetId);
                detail.innerHTML = '';
                const heading = element('h3', 'caissa-bots-panel__detail-title');
                heading.textContent = profile.name;
                const tagline = element('p', 'caissa-bots-panel__detail-tagline');
                tagline.textContent = profile.presentation.tagline;
                const description = element('p', 'caissa-bots-panel__detail-description');
                description.textContent = profile.description;
                const limitation = element('p', 'caissa-bots-panel__detail-limit');
                limitation.textContent = `Known limit: ${profile.presentation.limitations.join(' ')}`;
                const technical = element('details', 'caissa-bots-panel__technical');
                const summary = element('summary', ''); summary.textContent = 'QA technical details';
                const copy = element('p', '');
                copy.textContent = `Bounded search depth ${preset.search.depth}. Calibration status: ${profile.calibrationStatus}. Position suite ${CALIBRATION_SUITE_VERSION}; relative ordering only.`;
                technical.append(summary, copy);
                detail.append(heading, tagline, description, limitation, technical);
            }
            status.textContent = this.#status === 'active' ? `Game started against ${profile?.name}.`
                : this.#status === 'error' ? 'The bot game could not be started.'
                    : profile ? `${profile.name} selected. ${profile.presentation.tagline}` : 'Choose a bot.';
            const action = this.#root.querySelector('[data-bot-primary]');
            action.disabled = !profile || this.#status === 'busy';
            action.setAttribute('aria-busy', String(this.#status === 'busy'));
        }
        #listen(target, type, handler) {
            target.addEventListener(type, handler); this.#listeners.push({ target, type, handler });
        }
    }
    global.CaissaBotsPanel = Object.freeze({
        schemaVersion: SCHEMA_VERSION, snapshotSchemaVersion: SCHEMA_VERSION,
        statuses: STATUSES, create: options => new BotsPanel(options)
    });
})(typeof window !== 'undefined' ? window : globalThis);
