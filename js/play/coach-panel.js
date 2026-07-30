(function installCoachPanel(global) {
    'use strict';
    const SCHEMA_VERSION = '1.1.0';
    let sequence = 0;
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
        return value;
    };
    const result = (ok, reasonCode, value = null) => freeze({ ok, reasonCode, value });
    const el = (tag, className, attrs = {}) => {
        const node = global.document.createElement(tag); node.className = className;
        Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value)); return node;
    };
    class CoachPanel {
        #id = `coach-panel-${++sequence}`; #root = null; #listeners = []; #selected = null;
        #assistance = 'guided'; #color = 'white'; #time = 0; #compatibility;
        #diagnostics = { selections: 0, starts: 0, messages: 0, dismissals: 0 };
        constructor(options = {}) { this.#compatibility = options.compatibility || global.CaissaPlayCompatibility; }
        mount(options = {}) {
            const host = options.host || options; if (!host?.appendChild) return result(false, 'INVALID_HOST');
            this.#selected = global.CaissaCoachRegistry.getDefault()?.id || null;
            const root = this.#root = el('section', 'caissa-coach-panel', { 'aria-labelledby': `${this.#id}-title` });
            const title = el('h2', '', { id: `${this.#id}-title` }); title.textContent = 'Play with a Coach';
            const note = el('p', 'caissa-coach-panel__note');
            note.textContent = 'QA-only session coaching. Prompts do not provide exact move answers or pause the clock.';
            const catalog = el('div', 'caissa-coach-panel__catalog', { role: 'radiogroup', 'aria-label': 'Coach catalog' });
            global.CaissaCoachRegistry.list().forEach(profile => {
                const label = el('label', 'caissa-coach-panel__card caissa-vc caissa-vc-card', {
                    'data-visual-component': 'profile-card'
                });
                const input = el('input', '', { type: 'radio', name: `${this.#id}-coach`, value: profile.id, 'data-coach-id': profile.id });
                const emblem = el('span', 'caissa-coach-panel__emblem', { 'aria-hidden': 'true' }); emblem.textContent = profile.presentation.avatar;
                const copy = el('span', 'caissa-coach-panel__copy');
                const name = el('strong', ''); name.textContent = profile.name;
                const meta = el('span', ''); meta.textContent = `${profile.learnerLevel} · ${profile.teachingFocus}`;
                copy.append(name, meta); label.append(input, emblem, copy); catalog.appendChild(label);
            });
            const detail = el('article', 'caissa-coach-panel__detail', { 'data-coach-detail': '' });
            const optionsNode = el('div', 'caissa-coach-panel__options');
            const assistanceLabel = el('label', ''); assistanceLabel.textContent = 'Assistance ';
            const assistance = el('select', '', { 'data-coach-assistance': '' });
            global.CaissaCoachInterventionPolicy.assistanceLevels.forEach(value => {
                const option = el('option', '', { value }); option.textContent = value[0].toUpperCase() + value.slice(1);
                if (value === this.#assistance) option.selected = true; assistance.appendChild(option);
            });
            assistanceLabel.appendChild(assistance);
            const colorLabel = el('label', ''); colorLabel.textContent = 'Play as ';
            const color = el('select', '', { 'data-coach-color': '' });
            ['white', 'black'].forEach(value => { const option = el('option', '', { value }); option.textContent = value; color.appendChild(option); });
            colorLabel.appendChild(color); optionsNode.append(assistanceLabel, colorLabel);
            const goal = el('p', 'caissa-coach-panel__goal', { 'data-coach-goal': '' });
            const intervention = el('div', 'caissa-coach-panel__intervention', { 'data-coach-intervention': '', hidden: '' });
            const category = el('strong', '', { 'data-coach-category': '' });
            const interventionText = el('p', '', { 'data-coach-message': '' });
            const knowledge = el('a', 'caissa-coach-panel__knowledge', {
                'data-coach-knowledge': '', hidden: '', rel: 'noopener'
            }); knowledge.textContent = 'Study this verified concept';
            const why = el('details', 'caissa-coach-panel__why', { 'data-coach-why': '', hidden: '' });
            const whySummary = el('summary', ''); whySummary.textContent = 'Why?';
            const whyText = el('p', '', { 'data-coach-explanation': '' }); why.append(whySummary, whyText);
            const dismiss = el('button', '', { type: 'button', 'data-coach-dismiss': '' }); dismiss.textContent = 'Dismiss';
            intervention.append(category, interventionText, why, knowledge, dismiss);
            const status = el('div', '', { 'data-coach-status': '' });
            const action = el('button', 'caissa-coach-panel__primary', { type: 'button', 'data-coach-primary': '' }); action.textContent = 'Play Coach';
            root.append(title, note, catalog, detail, optionsNode, goal, intervention, status, action); host.appendChild(root);
            this.#listen(root, 'change', event => this.#change(event));
            this.#listen(action, 'click', () => this.submit());
            this.#listen(dismiss, 'click', () => this.dismiss());
            this.#listen(global, 'caissa-coach-observation', event => this.handleObservation(event.detail));
            this.#render(); return result(true, 'MOUNTED', this.getSnapshot());
        }
        submit() {
            const profile = global.CaissaCoachRegistry.get(this.#selected);
            const selected = global.CaissaCoachSession.select({ coachId: profile?.id, learnerLevel: profile?.learnerLevel,
                teachingFocus: profile?.teachingFocus, assistanceLevel: this.#assistance, playerColor: this.#color, timeControl: this.#time });
            if (!selected.ok) return selected;
            global.CaissaBotSession?.resetToFullPower?.();
            const command = this.#compatibility.execute('startNewGame', { mode: 'engine', color: this.#color, timeControl: this.#time });
            if (!command?.ok) return result(false, 'COMMAND_FAILED');
            this.#diagnostics.starts += 1; this.#render(); return result(true, 'STARTED', this.getSnapshot());
        }
        handleObservation(detail) {
            const panel = this.#root?.querySelector('[data-coach-intervention]');
            if (!panel || !detail?.message?.message) return result(false, 'NO_MESSAGE');
            panel.querySelector('[data-coach-message]').textContent = detail.message.message;
            panel.querySelector('[data-coach-category]').textContent =
                `${String(detail.category || 'Coach').replace(/-/g, ' ')} guidance`;
            const why = panel.querySelector('[data-coach-why]');
            why.querySelector('[data-coach-explanation]').textContent = detail.message.explanation || '';
            why.hidden = !detail.message.explanation; why.open = false;
            const knowledge = panel.querySelector('[data-coach-knowledge]');
            const mapping = detail.message.knowledge;
            knowledge.hidden = !mapping; knowledge.removeAttribute('href');
            if (mapping) {
                knowledge.href = mapping.publicUrl;
                knowledge.setAttribute('aria-label', `Study verified concept: ${mapping.unitId.split(':').at(-1).replace(/-/g, ' ')}`);
            }
            panel.hidden = false; this.#diagnostics.messages += 1; return result(true, 'MESSAGE_SHOWN');
        }
        dismiss() { const node = this.#root?.querySelector('[data-coach-intervention]'); if (node) node.hidden = true; this.#diagnostics.dismissals += 1; return result(true, 'DISMISSED'); }
        show() { if (this.#root) this.#root.hidden = false; return result(true, 'SHOWN'); }
        hide() { if (this.#root) this.#root.hidden = true; return result(true, 'HIDDEN'); }
        #change(event) {
            if (event.target?.dataset?.coachId) { this.#selected = event.target.value; this.#diagnostics.selections += 1; }
            if (event.target?.hasAttribute?.('data-coach-assistance')) this.#assistance = event.target.value;
            if (event.target?.hasAttribute?.('data-coach-color')) this.#color = event.target.value;
            this.#render();
        }
        #render() {
            if (!this.#root) return; const profile = global.CaissaCoachRegistry.get(this.#selected);
            this.#root.querySelectorAll('[data-coach-id]').forEach(input => { input.checked = input.value === this.#selected; });
            const detail = this.#root.querySelector('[data-coach-detail]'); detail.replaceChildren();
            if (profile) {
                const heading = el('h3', ''); heading.textContent = profile.name;
                const description = el('p', ''); description.textContent = profile.description;
                const limits = el('p', ''); limits.textContent = `Limit: ${profile.presentation.limitations.join(' ')}`;
                detail.append(heading, description, limits);
                this.#root.querySelector('[data-coach-goal]').textContent = `Learning goal: ${profile.presentation.tagline}`;
                const active = global.CaissaCoachSession.getSnapshot().active;
                const count = active?.coachId === profile.id ? ` ${active.interventionCount} prompts shown.` : '';
                this.#root.querySelector('[data-coach-status]').textContent =
                    `${profile.name} selected with ${this.#assistance} assistance.${count}`;
            }
        }
        getSnapshot() { return freeze({ schemaVersion: SCHEMA_VERSION, selectedCoachId: this.#selected,
            assistanceLevel: this.#assistance, color: this.#color, timeControl: this.#time,
            listenerCount: this.#listeners.length, diagnostics: freeze({ ...this.#diagnostics }) }); }
        dispose() { this.#listeners.splice(0).forEach(({ target, type, handler }) => target.removeEventListener(type, handler)); this.#root?.remove(); this.#root = null; return result(true, 'DISPOSED'); }
        #listen(target, type, handler) { target.addEventListener(type, handler); this.#listeners.push({ target, type, handler }); }
    }
    global.CaissaCoachPanel = Object.freeze({ schemaVersion: SCHEMA_VERSION, create: options => new CoachPanel(options) });
})(typeof window !== 'undefined' ? window : globalThis);
