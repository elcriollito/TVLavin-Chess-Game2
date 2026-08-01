(function installPlayV2PostGameCore(root) {
    'use strict';

    const VERSION = '1.0.0';
    const ACTIONS = Object.freeze(['rematch', 'analyze', 'copy-pgn', 'download-pgn', 'save-game', 'new-game']);
    let sequence = 0;
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const outcome = (ok, status, reasonCode, value = null) => freeze({ ok, status, reasonCode, value });
    const element = (tag, className, attributes = {}) => {
        const node = root.document.createElement(tag); node.className = className;
        Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value)); return node;
    };
    const resultType = record => record?.status === 'aborted' ? 'aborted'
        : record?.result?.value === '1-0' ? 'white-win' : record?.result?.value === '0-1' ? 'black-win'
            : record?.result?.value === '1/2-1/2' ? 'draw' : 'unknown';

    class PostGameCore {
        #id = `play-v2-post-game-${++sequence}`; #root = null; #record = null; #visible = false;
        #disposed = false; #listeners = []; #feedback = ''; #consent = 'unknown'; #saved = false; #configuration = null;
        #compatibility; #records; #persistence; #handoff; #navigation; #onVisibilityChange;
        #clipboard; #url; #Blob;
        #diagnostics = { hydrations: 0, displays: 0, actions: 0, rematches: 0, newGames: 0,
            handoffs: 0, copies: 0, downloads: 0, saves: 0, failures: 0 };

        constructor(options = {}) {
            this.#compatibility = options.compatibility || root.CaissaPlayCompatibility;
            this.#records = options.records || root.CaissaGameRecord;
            this.#persistence = options.persistence || root.CaissaGameRecordPersistence;
            this.#handoff = options.handoff || root.CaissaAnalyzeHandoff;
            this.#navigation = options.navigation || root.CaissaNavigation;
            this.#onVisibilityChange = typeof options.onVisibilityChange === 'function' ? options.onVisibilityChange : null;
            this.#clipboard = options.clipboard || root.navigator?.clipboard;
            this.#url = options.url || root.URL; this.#Blob = options.Blob || root.Blob;
        }
        mount(options = {}) {
            if (this.#disposed) return outcome(false, 'disposed', 'DISPOSED');
            if (this.#root) return outcome(true, 'unchanged', 'ALREADY_MOUNTED', this.getSnapshot());
            const host = options.host || options; if (!host?.appendChild) return outcome(false, 'rejected', 'INVALID_HOST');
            this.#root = element('section', 'caissa-post-game caissa-vc caissa-vc-game-over', {
                'data-caissa-post-game': '', 'data-play-v2-post-game-core': '',
                'aria-labelledby': `${this.#id}-title`, tabindex: '-1'
            });
            this.#root.hidden = true;
            const title = element('h2', 'caissa-post-game__title', { id: `${this.#id}-title` }); title.textContent = 'Game Over';
            const result = element('p', 'caissa-post-game__announcement', { 'data-post-game-result': '' });
            const summary = element('dl', 'caissa-post-game__summary', { 'data-post-game-summary': '' });
            const actions = element('div', 'caissa-post-game__actions', { 'aria-label': 'Post-game actions' });
            [['rematch','Rematch',true],['analyze','Analyze This Game'],['copy-pgn','Copy PGN'],
                ['download-pgn','Download PGN'],['save-game','Save Game'],['new-game','New Game']]
                .forEach(([action, label, primary]) => {
                    const button = element('button', `caissa-post-game__action${primary ? ' caissa-post-game__action--primary' : ''}`,
                        { type: 'button', 'data-post-game-action': action }); button.textContent = label; actions.appendChild(button);
                });
            const consent = element('label', 'caissa-post-game__consent');
            const input = element('input', '', { type: 'checkbox', 'data-post-game-consent': '' });
            const consentText = element('span', ''); consentText.textContent = 'Allow this completed game to be stored in local game history.';
            consent.append(input, consentText);
            const feedback = element('p', 'caissa-post-game__feedback', { 'data-post-game-feedback': '' });
            this.#root.append(title, result, summary, actions, consent, feedback); host.appendChild(this.#root);
            this.#listen(this.#root, 'click', event => {
                const action = event.target?.closest?.('[data-post-game-action]')?.dataset?.postGameAction;
                if (action) this.execute(action);
            });
            this.#listen(input, 'change', () => {
                const state = input.checked ? 'granted' : 'denied'; const changed = this.#persistence?.setConsent?.(state);
                if (changed?.ok) this.#consent = state; this.#render();
            });
            return outcome(true, 'accepted', 'MOUNTED', this.getSnapshot());
        }
        syncFromPlay() {
            const snapshot = this.#compatibility?.getSnapshot?.();
            if (!snapshot) return outcome(false, 'unavailable', 'INVALID_RECORD');
            root.CaissaGameLifecycle?.sync?.(snapshot,
                snapshot.game?.active === false && snapshot.game?.result ? 'GAME_COMPLETED' : 'LEGACY_STATE_SYNCED');
            if (root.CaissaGameLifecycle?.getSnapshot?.().state !== 'completed') { this.hide(); return outcome(false, 'unchanged', 'INCOMPLETE'); }
            try { return this.hydrateFromGame({ record: this.#records?.buildFromPlay?.(), snapshot }); }
            catch (_) { return outcome(false, 'failed', 'INVALID_RECORD'); }
        }
        hydrateFromGame(input = {}) {
            const record = input.record; const validation = this.#records?.validate?.(record);
            if (!validation?.valid || !['completed', 'aborted'].includes(record?.status) || record?.result?.complete !== true)
                return outcome(false, 'rejected', 'INVALID_RECORD');
            const snapshot = input.snapshot || this.#compatibility?.getSnapshot?.();
            this.#record = record; this.#configuration = {
                mode: snapshot?.mode === 'engine' ? 'engine' : null,
                color: ['white', 'black'].includes(snapshot?.playerColor) ? snapshot.playerColor : null,
                timeControl: Number.isInteger(snapshot?.clocks?.timeControlSeconds) ? snapshot.clocks.timeControlSeconds : null
            };
            this.#consent = this.#persistence?.getConsent?.().value?.state || 'unknown';
            this.#saved = false; this.#feedback = ''; this.#diagnostics.hydrations += 1; this.show();
            root.CaissaEvaluationRailInstance?.setMode?.('post-game'); this.#render();
            return outcome(true, 'accepted', 'HYDRATED', this.getSnapshot());
        }
        show() { if (!this.#root || !this.#record) return outcome(false, 'rejected', 'INVALID_RECORD');
            if (!this.#visible) this.#diagnostics.displays += 1; this.#visible = true; this.#root.hidden = false;
            this.#onVisibilityChange?.(true); this.#render(); this.#root.focus?.(); return outcome(true, 'accepted', 'SHOWN'); }
        hide() { this.#visible = false; if (this.#root) this.#root.hidden = true; this.#onVisibilityChange?.(false); return outcome(true, 'accepted', 'HIDDEN'); }
        execute(action) {
            if (!ACTIONS.includes(action) || !this.#actions()[action]?.enabled) return outcome(false, 'unavailable', 'ACTION_UNAVAILABLE');
            root.CaissaPlayV2ProductBoundary?.requireAllowed?.({ type: 'action', value: action });
            this.#diagnostics.actions += 1;
            try {
                if (action === 'rematch' || action === 'new-game') return this.#start(action);
                if (action === 'analyze') return this.#analyze();
                if (action === 'copy-pgn') return this.#copy();
                if (action === 'download-pgn') return this.#download();
                if (action === 'save-game') return this.#save();
            } catch (_) { this.#diagnostics.failures += 1; return outcome(false, 'failed', 'ACTION_FAILED'); }
            return outcome(false, 'unavailable', 'ACTION_UNAVAILABLE');
        }
        rematch() { return this.execute('rematch'); } analyze() { return this.execute('analyze'); }
        copyPgn() { return this.execute('copy-pgn'); } downloadPgn() { return this.execute('download-pgn'); }
        saveGame() { return this.execute('save-game'); } startNewGame() { return this.execute('new-game'); }
        #start(action) {
            const started = this.#compatibility?.execute?.('startNewGame', { ...this.#configuration });
            if (!started?.ok) return outcome(false, 'failed', 'ACTION_FAILED');
            this.#diagnostics[action === 'rematch' ? 'rematches' : 'newGames'] += 1; this.hide(); return outcome(true, 'accepted', action === 'rematch' ? 'REMATCH_STARTED' : 'NEW_GAME_STARTED');
        }
        #analyze() {
            if (!root.AnalyzeSection?.onEnter && root.CaissaPlayLazyLoader?.load) {
                return root.CaissaPlayLazyLoader.load('analyze-deep', { qa: false, retry: true })
                    .then(() => this.#analyze()).catch(() => outcome(false, 'failed', 'ACTION_FAILED'));
            }
            if (!this.#handoff?.createFromPlay) return outcome(false, 'unavailable', 'ACTION_UNAVAILABLE');
            const opened = this.#navigation?.navigateToSection?.('analyze');
            if (opened === false || opened?.ok === false) return outcome(false, 'failed', 'ACTION_FAILED');
            this.#diagnostics.handoffs += 1; return outcome(true, 'accepted', 'ANALYZE_OPENED');
        }
        #copy() {
            const operation = this.#clipboard?.writeText?.(this.#record.notation.pgn);
            if (operation?.then) return operation.then(() => { this.#diagnostics.copies += 1; this.#feedback = 'PGN copied.'; this.#render(); return outcome(true, 'accepted', 'PGN_COPIED'); });
            this.#diagnostics.copies += 1; return outcome(true, 'accepted', 'PGN_COPIED');
        }
        #download() {
            const blob = new this.#Blob([this.#record.notation.pgn], { type: 'application/x-chess-pgn' });
            const url = this.#url.createObjectURL(blob); const anchor = element('a', '');
            anchor.href = url; anchor.download = `${this.#record.recordId || 'caissa-game'}.pgn`; anchor.click(); this.#url.revokeObjectURL(url);
            this.#diagnostics.downloads += 1; return outcome(true, 'accepted', 'PGN_DOWNLOADED');
        }
        #save() {
            const saved = this.#persistence?.saveCompleted?.(this.#record); if (!saved?.ok) return outcome(false, 'failed', 'ACTION_FAILED');
            this.#saved = true; this.#diagnostics.saves += 1; this.#feedback = 'Game saved.'; this.#render(); return outcome(true, 'accepted', 'GAME_SAVED');
        }
        #actions() {
            const ready = !!this.#record && this.#visible; const pgn = ready && !!this.#record?.notation?.pgn;
            return freeze({ rematch: { enabled: ready, primary: true }, analyze: { enabled: ready },
                'copy-pgn': { enabled: pgn }, 'download-pgn': { enabled: pgn },
                'save-game': { enabled: pgn && this.#consent === 'granted' && !this.#saved }, 'new-game': { enabled: ready } });
        }
        #render() {
            if (!this.#root) return; const type = resultType(this.#record);
            const labels = { 'white-win': 'White wins.', 'black-win': 'Black wins.', draw: 'Draw.', aborted: 'Game ended.', unknown: 'Result unavailable.' };
            this.#root.querySelector('[data-post-game-result]').textContent = labels[type];
            const summary = this.#root.querySelector('[data-post-game-summary]'); summary.textContent = '';
            if (this.#record) {
                const opponent = root.CaissaBotRegistry?.get?.(this.#record.opponent?.id)?.name
                    || (this.#record.opponent?.type === 'engine' ? 'CAISSA Engine' : this.#record.opponent?.name || null);
                const entries = [['Result', this.#record.result.value], ['Reason', this.#record.result.termination || 'unknown']];
                if (opponent) entries.push(['Opponent', opponent]);
                entries.forEach(([term, value]) => { const dt = element('dt', ''); dt.textContent = term; const dd = element('dd', ''); dd.textContent = value; summary.append(dt, dd); });
            }
            const actions = this.#actions(); this.#root.querySelectorAll('[data-post-game-action]').forEach(button => {
                const enabled = actions[button.dataset.postGameAction]?.enabled === true; button.disabled = !enabled; button.setAttribute('aria-disabled', String(!enabled));
            });
            const consent = this.#root.querySelector('[data-post-game-consent]'); consent.checked = this.#consent === 'granted';
            this.#root.querySelector('[data-post-game-feedback]').textContent = this.#feedback;
        }
        getSnapshot() { return freeze({ schemaVersion: VERSION, experienceId: this.#id, mounted: !!this.#root,
            visible: this.#visible, disposed: this.#disposed, gameRecordId: this.#record?.recordId || null,
            result: this.#record ? { type: resultType(this.#record), value: this.#record.result.value,
                winner: this.#record.result.winner, termination: this.#record.result.termination, complete: true }
                : { type: 'unknown', value: null, winner: null, termination: null, complete: false },
            actions: this.#actions(), persistence: { consent: this.#consent, saved: this.#saved },
            trainingMemoryWrites: 0, masteryWrites: 0, listenerCount: this.#listeners.length,
            diagnostics: { ...this.#diagnostics } }); }
        inspect() { return this.getSnapshot(); }
        dispose() { if (this.#disposed) return outcome(true, 'unchanged', 'DISPOSED'); this.hide();
            this.#listeners.splice(0).forEach(({ target, type, handler }) => target.removeEventListener(type, handler));
            this.#root?.remove(); this.#root = null; this.#disposed = true; return outcome(true, 'accepted', 'DISPOSED'); }
        #listen(target, type, handler) { target.addEventListener(type, handler); this.#listeners.push({ target, type, handler }); }
    }

    root.CaissaPostGameExperience = Object.freeze({ schemaVersion: VERSION, actions: ACTIONS,
        create: options => new PostGameCore(options) });
})(typeof window !== 'undefined' ? window : globalThis);
