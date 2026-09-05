(function installPlayV2PostGameCore(root) {
    'use strict';

    const VERSION = '1.1.0';
    const ACTIONS = Object.freeze(['rematch', 'analyze', 'mentor-review', 'copy-pgn', 'download-pgn', 'save-game', 'new-game']);
    let sequence = 0; let retainedRecord = null; let retainedKey = null;
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
    const recordKey = record => JSON.stringify([record?.status, record?.result?.value, record?.result?.termination,
        record?.position?.finalFen, record?.notation?.pgn]);

    class PostGameCore {
        #id = `play-v2-post-game-${++sequence}`; #root = null; #actionsContainer = null; #actionButtons = [];
        #record = null; #visible = false;
        #disposed = false; #listeners = []; #feedback = ''; #consent = 'unknown'; #saved = false; #configuration = null; #reviewLaunching = false; #busyAction = null;
        #compatibility; #records; #persistence; #handoff; #navigation; #onVisibilityChange; #onNewGame;
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
            this.#onNewGame = typeof options.onNewGame === 'function' ? options.onNewGame : null;
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
            const title = element('h2', 'caissa-post-game__title caissa-post-game__announcement', { id: `${this.#id}-title`, 'data-post-game-result': '', tabindex: '-1' }); title.textContent = 'Game Over';
            const reason = element('p', 'caissa-post-game__reason', { 'data-post-game-reason': '' });
            const summary = element('dl', 'caissa-post-game__summary', { 'data-post-game-summary': '' });
            const actions = element('div', 'caissa-post-game__actions', { 'aria-label': 'Post-game actions' });
            this.#actionsContainer = actions;
            [['analyze','Analyze This Game','primary'],['rematch','Rematch','secondary'],['new-game','New Game','secondary'],['mentor-review','Review with Mentor','mentor'],['copy-pgn','Copy PGN','pgn'],
                ['download-pgn','Download PGN','pgn'],['save-game','Save PGN Locally','pgn']]
                .forEach(([action, label, hierarchy]) => {
                    const button = element('button', `caissa-post-game__action caissa-post-game__action--${hierarchy}`,
                        { type: 'button', 'data-post-game-action': action }); button.textContent = label; actions.appendChild(button);
                });
            const consent = element('label', 'caissa-post-game__consent');
            const input = element('input', '', { type: 'checkbox', 'data-post-game-consent': '' });
            const consentText = element('span', ''); consentText.textContent = 'Allow this completed game to be stored in local game history.';
            consent.append(input, consentText);
            const feedback = element('p', 'caissa-post-game__feedback', { 'data-post-game-feedback': '' });
            this.#root.append(title, reason, summary, actions, consent, feedback);
            this.#actionButtons = [...actions.querySelectorAll('[data-post-game-action]')];
            host.appendChild(this.#root);
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
            try { const candidate = this.#records?.buildFromPlay?.(); const key = recordKey(candidate);
                return this.hydrateFromGame({ record: retainedRecord && retainedKey === key ? retainedRecord : candidate, snapshot }); }
            catch (_) { return outcome(false, 'failed', 'INVALID_RECORD'); }
        }
        hydrateFromGame(input = {}) {
            const record = input.record; const validation = this.#records?.validate?.(record);
            if (!validation?.valid || !['completed', 'aborted'].includes(record?.status) || record?.result?.complete !== true)
                return outcome(false, 'rejected', 'INVALID_RECORD');
            const snapshot = input.snapshot || this.#compatibility?.getSnapshot?.();
            this.#record = record; retainedRecord = record; retainedKey = recordKey(record); this.#configuration = {
                mode: snapshot?.mode === 'engine' ? 'engine' : null,
                color: ['white', 'black'].includes(snapshot?.playerColor) ? snapshot.playerColor : null,
                timeControl: Number.isInteger(snapshot?.clocks?.timeControlSeconds) ? snapshot.clocks.timeControlSeconds : null,
                increment: Number.isInteger(snapshot?.clocks?.incrementSeconds) ? snapshot.clocks.incrementSeconds : 0
            };
            root.CaissaClockService?.stop?.('postgame');
            root.CaissaEngineRequestIsolation?.cancelSession?.();
            const worker = root.CaissaPlayV2BotWorkerReadiness?.getSnapshot?.();
            if (worker && ['initializing', 'ready', 'playing'].includes(worker.state)) root.CaissaPlayV2BotWorkerReadiness.teardown('postgame');
            this.#consent = this.#persistence?.getConsent?.().value?.state || 'unknown';
            this.#saved = false; this.#feedback = ''; this.#diagnostics.hydrations += 1; this.show();
            root.CaissaEvaluationRailInstance?.setMode?.('post-game'); this.#render();
            return outcome(true, 'accepted', 'HYDRATED', this.getSnapshot());
        }
        show() { if (!this.#root || !this.#record) return outcome(false, 'rejected', 'INVALID_RECORD');
            if (!this.#visible) this.#diagnostics.displays += 1; this.#visible = true; this.#root.hidden = false;
            this.#onVisibilityChange?.(true); this.#render(); this.#root.querySelector('[data-post-game-result]')?.focus?.(); return outcome(true, 'accepted', 'SHOWN'); }
        hide() { this.#visible = false; root.CaissaCoachGameOverPresentation?.unmount?.({ section: this.#root });
            if (this.#root) this.#root.hidden = true; this.#onVisibilityChange?.(false); return outcome(true, 'accepted', 'HIDDEN'); }
        execute(action) {
            if (this.#busyAction) return outcome(false, 'rejected', 'ACTION_BUSY');
            if (!ACTIONS.includes(action) || !this.#actions()[action]?.enabled) return outcome(false, 'unavailable', 'ACTION_UNAVAILABLE');
            root.CaissaPlayV2ProductBoundary?.requireAllowed?.({ type: 'action', value: action });
            const authorized = root.CaissaPlayV2PostGameExitPolicy?.authorize?.(action, this.#record);
            if (authorized && !authorized.ok) return outcome(false, 'rejected', authorized.reasonCode);
            this.#busyAction = action; this.#render();
            this.#diagnostics.actions += 1;
            try {
                let operation = null;
                if (action === 'rematch' || action === 'new-game') operation = this.#start(action);
                else if (action === 'analyze') operation = this.#analyze();
                else if (action === 'mentor-review') operation = this.#mentorReview();
                else if (action === 'copy-pgn') operation = this.#copy();
                else if (action === 'download-pgn') operation = this.#download();
                else if (action === 'save-game') operation = this.#save();
                if (operation?.then) return operation.then(value => this.#finish(value, action)).catch(() => this.#finish(outcome(false, 'failed', 'ACTION_FAILED'), action));
                if (operation) return this.#finish(operation, action);
            } catch (_) { return this.#finish(outcome(false, 'failed', 'ACTION_FAILED'), action); }
            return outcome(false, 'unavailable', 'ACTION_UNAVAILABLE');
        }
        rematch() { return this.execute('rematch'); } analyze() { return this.execute('analyze'); }
        copyPgn() { return this.execute('copy-pgn'); }
        downloadPgn(options = {}) {
            if (options.preservePresentation !== true) return this.execute('download-pgn');
            if (!this.#actions()['download-pgn']?.enabled) return outcome(false, 'unavailable', 'ACTION_UNAVAILABLE');
            try { return this.#download(); } catch (_) { return outcome(false, 'failed', 'ACTION_FAILED'); }
        }
        saveGame() { return this.execute('save-game'); } startNewGame() { return this.execute('new-game'); }
        #start(action) {
            const prepared = root.CaissaPlayV2PostGameExitPolicy?.prepare?.(action, this.#record);
            if (prepared && !prepared.ok) return outcome(false, 'failed', prepared.reasonCode);
            if (action === 'new-game') {
                root.CaissaClockService?.stop?.('new-game-setup');
                root.CaissaEngineRequestIsolation?.createSession?.();
                root.CaissaGameLifecycle?.rotateSession?.();
                retainedRecord = null; retainedKey = null; this.#diagnostics.newGames += 1; this.hide(); this.#onNewGame?.();
                return outcome(true, 'accepted', 'NEW_GAME_READY');
            }
            if (root.CaissaBotSession?.getSnapshot?.()?.activeBotId && root.CaissaPlayV2BotWorkerReadiness) {
                return root.CaissaPlayV2BotWorkerReadiness.begin({
                    color: this.#configuration.color, timeControl: this.#configuration.timeControl
                }).then(prepared => {
                    if (!prepared.ok) return outcome(false, prepared.status || 'failed', 'ACTION_FAILED');
                    const started = this.#compatibility?.execute?.('startNewGame', { ...this.#configuration });
                    if (!started?.ok) return outcome(false, 'failed', 'ACTION_FAILED');
                    root.CaissaPlayV2BotWorkerReadiness?.markPlaying?.();
                    retainedRecord = null; retainedKey = null; this.#diagnostics.rematches += 1; this.hide();
                    return outcome(true, 'accepted', 'REMATCH_STARTED');
                });
            }
            const started = this.#compatibility?.execute?.('startNewGame', { ...this.#configuration });
            if (!started?.ok) return outcome(false, 'failed', 'ACTION_FAILED');
            root.CaissaPlayV2BotWorkerReadiness?.markPlaying?.();
            retainedRecord = null; retainedKey = null; this.#diagnostics.rematches += 1; this.hide(); return outcome(true, 'accepted', 'REMATCH_STARTED');
        }
        #analyze() {
            if (!root.AnalyzeSection?.onEnter && root.CaissaPlayLazyLoader?.load) {
                return root.CaissaPlayLazyLoader.load('analyze-deep', { qa: false, retry: true })
                    .then(() => this.#analyze()).catch(() => outcome(false, 'failed', 'ACTION_FAILED'));
            }
            if (!this.#handoff?.createFromCompletedPlayRecord) return outcome(false, 'unavailable', 'ACTION_UNAVAILABLE');
            const prepared = root.CaissaPlayV2PostGameExitPolicy?.prepare?.('analyze', this.#record);
            if (prepared && !prepared.ok) return outcome(false, 'failed', prepared.reasonCode);
            root.CaissaClockService?.stop?.('analyze'); root.CaissaEngineRequestIsolation?.cancelSession?.();
            const worker = root.CaissaPlayV2BotWorkerReadiness?.getSnapshot?.();
            if (worker && ['initializing', 'ready', 'playing'].includes(worker.state)) root.CaissaPlayV2BotWorkerReadiness.teardown('analyze');
            root.App?.engine?.terminate?.('post-game-analyze');
            const handoff = this.#handoff.createFromCompletedPlayRecord(this.#record, { identityContext: 'play-v2' });
            if (!handoff?.ok) return outcome(false, 'failed', handoff?.reasonCode || 'ACTION_FAILED');
            const sourceMode = root.CaissaSimplifiedPlayShellInstance?.getSnapshot?.()?.mode || null;
            const coachContext = root.CaissaCoachReviewContext?.create?.({
                owner: 'post-game-core', sourceMode
            });
            const opened = root.CaissaPlayV2InlineAnalyze?.open
                ? root.CaissaPlayV2InlineAnalyze.open({
                    token: handoff.value.token,
                    reviewContext: coachContext?.ok ? coachContext.value : null
                })
                : this.#navigation?.navigateToSection?.('analyze', { handoffToken: handoff.value.token });
            if (opened === false || opened?.ok === false) return outcome(false, 'failed', 'ACTION_FAILED');
            this.#diagnostics.handoffs += 1; return outcome(true, 'accepted', 'ANALYZE_OPENED');
        }
        #mentorReview() {
            if (this.#reviewLaunching) return outcome(false, 'rejected', 'DUPLICATE_ACTIVATION');
            if (!root.CaissaNativeMentorReviewWorkspace?.open && root.CaissaPlayLazyLoader?.load) {
                this.#reviewLaunching = true; return root.CaissaPlayLazyLoader.load('native-mentor-review', { qa: true, retry: true })
                    .then(() => { this.#reviewLaunching = false; return this.#mentorReview(); })
                    .catch(() => { this.#reviewLaunching = false; return outcome(false, 'failed', 'ACTION_FAILED'); });
            }
            if (!root.CaissaNativeMentorReviewHandoff?.create || !root.CaissaNativeMentorReviewWorkspace?.open)
                return outcome(false, 'unavailable', 'ACTION_UNAVAILABLE');
            const prepared = root.CaissaPlayV2PostGameExitPolicy?.prepare?.('mentor-review', this.#record);
            if (prepared && !prepared.ok) return outcome(false, 'failed', prepared.reasonCode);
            const handoff = root.CaissaNativeMentorReviewHandoff.create(this.#record); if (!handoff.ok) return outcome(false, 'failed', handoff.reasonCode);
            const opened = root.CaissaNativeMentorReviewWorkspace.open({ token: handoff.value.token });
            if (!opened.ok) { root.CaissaNativeMentorReviewHandoff.consume(handoff.value.token); return outcome(false, 'failed', opened.reasonCode); }
            this.#diagnostics.handoffs += 1; return outcome(true, 'accepted', 'MENTOR_REVIEW_OPENED');
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
        #finish(operation, action) {
            this.#busyAction = null;
            if (!operation?.ok) { this.#diagnostics.failures += 1; this.#feedback = action === 'copy-pgn'
                ? 'PGN could not be copied. You can try again.' : 'That action could not be completed. You can try again.';
                this.#render(); this.#root?.querySelector(`[data-post-game-action="${action}"]`)?.focus?.(); }
            else if (operation.reasonCode === 'PGN_DOWNLOADED') { this.#feedback = 'PGN downloaded.'; this.#render(); }
            this.#render();
            return operation;
        }
        #actions() {
            const ready = !!this.#record && this.#visible; const pgn = ready && !!this.#record?.notation?.pgn;
            return freeze({ analyze: { enabled: ready, primary: true }, rematch: { enabled: ready, strongSecondary: true },
                'mentor-review': { enabled: ready, secondary: true },
                'copy-pgn': { enabled: pgn }, 'download-pgn': { enabled: pgn },
                'save-game': { enabled: pgn && this.#consent === 'granted' && !this.#saved },
                'new-game': { enabled: ready, strongSecondary: true } });
        }
        #render() {
            if (!this.#root) return; const description = root.CaissaPlayV2PostGamePolicy?.describe?.(this.#record)
                || { title: 'Result Unavailable', reason: 'Reason Unavailable' };
            const sourceMode = root.CaissaSimplifiedPlayShellInstance?.getSnapshot?.()?.mode || null;
            this.#root.querySelector('[data-post-game-result]').textContent = description.title;
            this.#root.querySelector('[data-post-game-reason]').textContent = description.reason;
            const summary = this.#root.querySelector('[data-post-game-summary]'); summary.textContent = '';
            if (this.#record) {
                const shellMode = root.CaissaSimplifiedPlayShellInstance?.getSnapshot?.()?.mode;
                const opponent = shellMode === 'coach' ? 'CAISSA Coach'
                    : this.#record.opponent?.name
                    || root.CaissaBotRegistry?.get?.(this.#record.opponent?.id)?.name
                    || root.CaissaPlayV2IdentityPolicy?.normalizePlayV2Display?.(
                        this.#record.opponent?.name, this.#record.opponent?.type)
                    || this.#record.opponent?.name || null;
                const entries = [];
                if (opponent) entries.push(['Opponent', opponent]);
                entries.forEach(([term, value]) => { const dt = element('dt', ''); dt.textContent = term; const dd = element('dd', ''); dd.textContent = value; summary.append(dt, dd); });
            }
            const actions = this.#actions(); this.#actionButtons.forEach(button => {
                const enabled = actions[button.dataset.postGameAction]?.enabled === true && !this.#busyAction; button.disabled = !enabled; button.setAttribute('aria-disabled', String(!enabled));
            });
            this.#root.setAttribute('aria-busy', String(!!this.#busyAction));
            const consent = this.#root.querySelector('[data-post-game-consent]'); consent.checked = this.#consent === 'granted';
            this.#root.querySelector('[data-post-game-feedback]').textContent = this.#feedback;
            if (this.#visible && this.#record && sourceMode === 'coach') {
                root.CaissaCoachGameOverPresentation?.mount?.({
                    section: this.#root, owner: 'post-game-core', sourceMode, record: this.#record,
                    description, annotations: root.App?.coachMoveAnnotations || []
                });
            } else root.CaissaCoachGameOverPresentation?.unmount?.({ section: this.#root });
        }
        getSnapshot() { return freeze({ schemaVersion: VERSION, experienceId: this.#id, mounted: !!this.#root,
            visible: this.#visible, disposed: this.#disposed, gameRecordId: this.#record?.recordId || null,
            result: this.#record ? { type: resultType(this.#record), value: this.#record.result.value,
                winner: this.#record.result.winner, termination: this.#record.result.termination, complete: true }
                : { type: 'unknown', value: null, winner: null, termination: null, complete: false },
            actions: this.#actions(), persistence: { consent: this.#consent, saved: this.#saved },
            trainingMemoryWrites: 0, masteryWrites: 0, listenerCount: this.#listeners.length, busyAction: this.#busyAction,
            coachGameOver: root.CaissaCoachGameOverPresentation?.getSnapshot?.() || null,
            diagnostics: { ...this.#diagnostics } }); }
        inspect() { return this.getSnapshot(); }
        clearForModeTransition() {
            if (this.#busyAction) return outcome(false, 'rejected', 'ACTION_BUSY');
            retainedRecord = null; retainedKey = null; this.#record = null; this.#configuration = null;
            this.#feedback = ''; this.#saved = false; this.hide(); this.#render();
            return outcome(true, 'accepted', 'MODE_TRANSITION_CLEARED');
        }
        dispose() { if (this.#disposed) return outcome(true, 'unchanged', 'DISPOSED'); this.hide();
            this.#listeners.splice(0).forEach(({ target, type, handler }) => target.removeEventListener(type, handler));
            if (this.#actionsContainer && !this.#root?.contains(this.#actionsContainer)) this.#actionsContainer.remove();
            this.#root?.remove(); this.#root = null; this.#actionsContainer = null; this.#actionButtons = [];
            this.#disposed = true; return outcome(true, 'accepted', 'DISPOSED'); }
        #listen(target, type, handler) { target.addEventListener(type, handler); this.#listeners.push({ target, type, handler }); }
    }

    root.CaissaPostGameExperience = Object.freeze({ schemaVersion: VERSION, actions: ACTIONS,
        create: options => new PostGameCore(options) });
})(typeof window !== 'undefined' ? window : globalThis);
