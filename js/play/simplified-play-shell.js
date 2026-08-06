(function (global) {
    'use strict';

    const SCHEMA_VERSION = '1.7.0';
    const SNAPSHOT_SCHEMA_VERSION = '1.7.0';
    const STATUSES = Object.freeze(['loading', 'ready', 'inactive', 'unavailable', 'error']);
    const REGIONS = Object.freeze([
        'mode-navigation', 'board-stage', 'opponent-header', 'evaluation-rail',
        'chessboard', 'player-header', 'board-actions', 'context-panel',
        'panel-header', 'panel-body', 'advanced-options', 'panel-status', 'action-footer'
    ]);
    const productBoundary = global.CaissaPlayV2ProductBoundary;
    const MODES = Object.freeze({ games: true, bots: true,
        coach: productBoundary ? productBoundary.isModeAllowed?.('coach') === true : true, players: false });
    const LAYOUT_MODES = Object.freeze([
        'phone-compact', 'phone-standard', 'phone-landscape',
        'tablet-portrait-stacked', 'tablet-landscape-split',
        'desktop-split', 'constrained-height'
    ]);
    const REASONS = Object.freeze({
        MOUNTED: 'MOUNTED', ALREADY_MOUNTED: 'ALREADY_MOUNTED', ACTIVATED: 'ACTIVATED',
        ALREADY_ACTIVE: 'ALREADY_ACTIVE', DEACTIVATED: 'DEACTIVATED', ALREADY_INACTIVE: 'ALREADY_INACTIVE',
        PLAY_UNAVAILABLE: 'PLAY_UNAVAILABLE', ADAPTER_UNAVAILABLE: 'ADAPTER_UNAVAILABLE',
        INVALID_MODE: 'INVALID_MODE', MODE_INACTIVE: 'MODE_INACTIVE', INVALID_STATUS: 'INVALID_STATUS',
        DISPOSED: 'DISPOSED'
    });
    let shellSequence = 0;

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.values(value).forEach(deepFreeze);
        return Object.freeze(value);
    }
    function result(ok, status, reasonCode, value = null) {
        return deepFreeze({ ok, status, reasonCode, value });
    }
    function element(tag, className, attributes = {}) {
        const node = global.document.createElement(tag);
        node.className = className;
        Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
        return node;
    }
    function selectLayoutMode(input = {}) {
        const width = Number.isFinite(input.width) ? Math.max(0, input.width) : 0;
        const height = Number.isFinite(input.height) ? Math.max(0, input.height) : 0;
        const portrait = height >= width;
        if (portrait && width <= 359) return 'phone-compact';
        if (portrait && width <= 600) return 'phone-standard';
        if (!portrait && width <= 932) return 'phone-landscape';
        if (portrait && width <= 900) return 'tablet-portrait-stacked';
        if (!portrait && width <= 1180) return 'tablet-landscape-split';
        if (height <= 620) return 'constrained-height';
        return 'desktop-split';
    }
    function calculateGeometry(input = {}) {
        const width = Number.isFinite(input.width) ? Math.max(0, input.width) : 0;
        const height = Number.isFinite(input.height) ? Math.max(0, input.height) : 0;
        const safeLeft = Number.isFinite(input.safeLeft) ? Math.max(0, input.safeLeft) : 0;
        const safeRight = Number.isFinite(input.safeRight) ? Math.max(0, input.safeRight) : 0;
        const mode = LAYOUT_MODES.includes(input.mode) ? input.mode : selectLayoutMode({ width, height });
        const viewportOwnedDesktop = input.viewportOwnedDesktop === true;
        const activeGame = input.activeGame === true;
        const phone = mode.startsWith('phone-');
        const tablet = mode.startsWith('tablet-');
        const compact = mode === 'phone-compact';
        const inlinePadding = compact ? 4 : phone ? 6 : tablet ? 12 : 16;
        const stagePadding = compact ? 4 : phone ? 6 : 10;
        const railWidth = compact ? 10 : phone ? 12 : tablet ? 14 : 16;
        const railGap = phone ? 4 : 6;
        const usableWidth = Math.max(0, width - safeLeft - safeRight - (inlinePadding + stagePadding) * 2);
        let columnWidth = usableWidth;
        let heightLimit = Infinity;
        let contextWidth = 0; let workspaceGap = 0;
        if (viewportOwnedDesktop && mode === 'desktop-split') {
            contextWidth = Math.min(560, Math.max(360, width * .28));
            workspaceGap = Math.min(24, Math.max(12, width * .012));
            columnWidth = Math.max(0, usableWidth - contextWidth - workspaceGap);
            heightLimit = Math.max(0, height - (activeGame ? 250 : 200));
        } else if (mode === 'phone-landscape') {
            columnWidth = usableWidth * .58;
            heightLimit = Math.max(0, height - 112);
        } else if (mode === 'tablet-landscape-split') {
            columnWidth = usableWidth * .58;
            heightLimit = Math.max(0, height - 150);
        } else if (mode === 'desktop-split') {
            columnWidth = usableWidth * .56;
            heightLimit = Math.max(0, height - 190);
        } else if (mode === 'constrained-height') {
            columnWidth = usableWidth * .56;
            heightLimit = Math.max(0, height - 112);
        }
        const boardSize = Math.max(0, Math.floor(Math.min(columnWidth - railWidth - railGap, heightLimit,
            viewportOwnedDesktop ? Infinity : 760)));
        const boardOwnerSize = boardSize + railWidth + railGap + stagePadding * 2;
        return deepFreeze({
            mode, width, height, safeLeft, safeRight, inlinePadding, stagePadding, activeGame,
            railWidth, railGap, boardSize, boardOwnerSize, contextWidth, workspaceGap,
            squareSize: boardSize / 8
        });
    }

    class SimplifiedPlayShell {
        #id = `simplified-play-${++shellSequence}`;
        #root = null; #active = false; #disposed = false; #status = 'loading';
        #mode = 'games'; #placements = []; #listeners = []; #eventScopeId = null; #unsubscribeRoute = null;
        #suppressedLive = [];
        #layoutMode = null; #geometry = null; #resizeCount = 0; #activationCount = 0; #statusNode = null;
        #gamesPanel = null; #botsPanel = null; #coachPanel = null; #postGame = null;
        #activeContext = null; #assistance = null; #actionBar = null; #pgnDialog = null; #stateObserver = null; #panelObserver = null;
        #panelLoadToken = 0;
        #accessibility = null;
        #modeTransitionPending = false;
        #lastPanelSync = Promise.resolve();
        #diagnostics = {
            layoutChanges: 0, orientationChanges: 0, safeAreaApplications: 0,
            boardResizeRequests: 0, drawerCycles: 0, restorationCycles: 0, rejectedGeometry: 0
        };

        mount() {
            if (this.#disposed) return result(false, 'disposed', REASONS.DISPOSED);
            if (this.#root) return result(true, 'unchanged', REASONS.ALREADY_MOUNTED, this.getSnapshot());
            const play = global.document.getElementById('playSection');
            const stage = play?.querySelector('.cais-stage');
            if (!stage) return result(false, 'unavailable', REASONS.PLAY_UNAVAILABLE);

            const route = global.CaissaPlayRouteController?.getCurrent?.();
            const betaEntry = route?.metadata?.betaEntry === true;
            const root = element('div', 'caissa-simplified-shell', {
                'data-caissa-simplified-shell': '',
                'data-entry-experience': betaEntry ? 'beta' : 'qa',
                'aria-label': betaEntry ? 'Play' : 'Simplified Play QA preview'
            });
            if (!betaEntry) root.setAttribute('data-qa-preview', 'true');
            root.hidden = true;

            const preview = element(betaEntry ? 'header' : 'div', 'caissa-simplified-shell__preview');
            if (betaEntry) {
                const purpose = element('h1', 'caissa-simplified-shell__purpose');
                purpose.textContent = 'Play';
                const stageLabel = element('span', 'caissa-simplified-shell__stage');
                stageLabel.textContent = 'Internal preview';
                preview.append(purpose, stageLabel);
            } else preview.textContent = 'QA Preview · Simplified Play';
            const nav = global.CaissaPlayVisualComponents?.createModeTabs?.({
                variant: 'caissa-rail', ariaLabel: 'Play modes',
                items: Object.entries(MODES).filter(([, available]) => available).map(([mode, available]) => ({
                    id: mode, shellMode: mode,
                    label: betaEntry ? ({ games: 'Play Game', bots: 'Play Bots', coach: 'Play Coach' }[mode])
                        : mode[0].toUpperCase() + mode.slice(1),
                    active: mode === 'games', disabled: !available
                }))
            }) || element('nav', 'caissa-simplified-shell__modes', { 'aria-label': 'Play modes' });
            nav.classList.add('caissa-simplified-shell__modes');
            nav.querySelectorAll?.('[data-shell-mode]').forEach(button =>
                button.classList.add('caissa-simplified-shell__mode'));

            const workspace = element('div', 'caissa-simplified-shell__workspace');
            const boardStage = element('section', 'caissa-simplified-shell__board-stage', {
                'aria-labelledby': `${this.#id}-board-heading`
            });
            const heading = element('h2', 'caissa-simplified-shell__sr-heading', { id: `${this.#id}-board-heading` });
            heading.textContent = 'Game board';
            const opponent = element('header', 'caissa-simplified-shell__player caissa-simplified-shell__player--opponent');
            const boardRegion = element('div', 'caissa-simplified-shell__board-region');
            const player = element('header', 'caissa-simplified-shell__player caissa-simplified-shell__player--current');
            const boardActions = element('div', 'caissa-simplified-shell__board-actions', {
                role: 'group', 'aria-label': 'Board actions'
            });
            boardStage.append(heading, opponent, boardRegion, player, boardActions);

            const context = element('aside', 'caissa-simplified-shell__context', {
                'aria-labelledby': `${this.#id}-context-heading`
            });
            const contextHeader = element('header', 'caissa-simplified-shell__context-header');
            const contextHeading = element('h2', '', { id: `${this.#id}-context-heading` });
            contextHeading.textContent = betaEntry ? 'Game setup' : 'Current Play Controls';
            contextHeader.appendChild(contextHeading);
            const contextBody = element('div', 'caissa-simplified-shell__context-body');
            this.#activeContext = element('section', 'caissa-simplified-shell__active-context', {
                'data-active-game-context': '', 'aria-label': 'Active game status'
            });
            const activeTitle = element('h3', ''); activeTitle.textContent = 'Game in progress';
            const activeStatus = element('p', '', { 'data-active-game-status': '', role: 'status' });
            activeStatus.textContent = 'Use the board to play your move.';
            this.#activeContext.append(activeTitle, activeStatus); this.#activeContext.hidden = true;
            contextBody.appendChild(this.#activeContext);
            this.#assistance = element('details', 'caissa-simplified-shell__assistance', {
                'data-play-assistance': '', 'data-assistance-mode': 'none'
            });
            const assistanceSummary = element('summary', '');
            assistanceSummary.textContent = 'Assistance';
            const assistanceBody = element('div', 'caissa-simplified-shell__assistance-body', {
                'data-assistance-body': '', role: 'group', 'aria-label': 'Assistance options'
            });
            this.#assistance.append(assistanceSummary, assistanceBody);
            this.#assistance.hidden = true;
            contextBody.appendChild(this.#assistance);
            const advanced = element('details', 'caissa-simplified-shell__advanced');
            const summary = element('summary', ''); summary.textContent = betaEntry ? 'Game controls' : 'Advanced current controls';
            const advancedBody = element('div', 'caissa-simplified-shell__advanced-body');
            advanced.append(summary, advancedBody);
            this.#statusNode = element('div', 'caissa-simplified-shell__status');
            context.append(contextHeader, contextBody, this.#statusNode);

            const footer = element('footer', 'caissa-simplified-shell__footer', { 'aria-label': 'Primary game actions' });
            this.#actionBar = boardActions;
            for (const [action, label] of [['resign', 'Resign'], ['coach-help', 'Coach help'], ['pgn', 'PGN'], ['menu', 'Menu']]) {
                const button = element('button', `caissa-simplified-shell__active-action caissa-simplified-shell__active-action--${action}`, {
                    type: 'button', 'data-active-game-action': action
                });
                button.textContent = label; boardActions.appendChild(button);
            }
            boardActions.hidden = true;
            this.#pgnDialog = element('dialog', 'caissa-simplified-shell__pgn-dialog', {
                'aria-labelledby': `${this.#id}-pgn-title`
            });
            const pgnTitle = element('h2', '', { id: `${this.#id}-pgn-title` }); pgnTitle.textContent = 'Current game PGN';
            const pgnText = element('textarea', '', { readonly: '', 'data-active-game-pgn': '', rows: '14', 'aria-label': 'Current game PGN' });
            const pgnClose = element('button', '', { type: 'button', 'data-active-game-action': 'close-pgn' }); pgnClose.textContent = 'Close';
            this.#pgnDialog.append(pgnTitle, pgnText, pgnClose);
            workspace.append(boardStage, nav, context, footer, advanced);
            root.append(preview, workspace, this.#pgnDialog);
            stage.appendChild(root);
            this.#root = root;
            const accessibility = global.CaissaPlayAccessibility?.create?.(root);
            if (accessibility?.schemaVersion) this.#accessibility = accessibility;
            this.#unsubscribeRoute = global.CaissaPlayRouteController?.subscribe?.(() => this.syncRoute()) || null;
            this.setStatus('ready');
            return result(true, 'accepted', REASONS.MOUNTED, this.getSnapshot());
        }

        activate() {
            if (this.#disposed) return result(false, 'disposed', REASONS.DISPOSED);
            if (!this.#root) {
                const mounted = this.mount();
                if (!mounted.ok) return mounted;
            }
            if (this.#active) return result(true, 'unchanged', REASONS.ALREADY_ACTIVE);
            if (!global.App?.boardAdapter?.getSnapshot?.().mounted)
                return result(false, 'unavailable', REASONS.ADAPTER_UNAVAILABLE);

            const play = global.document.getElementById('playSection');
            const legacyGrid = play.querySelector('.main-content.cais-grid');
            const topbar = play.querySelector('.cais-topbar');
            if (!global.document.body.hasAttribute('data-caissa-play-theme'))
                global.CaissaPlayThemes?.applyTheme?.('caissa-dark', global.document.body);
            const boardWithEval = play.querySelector('.board-with-eval');
            const leftPanel = play.querySelector('.left-panel.cais-left-col');
            const rightPanel = play.querySelector('.right-panel.cais-right-col');
            const gameMenu = play.querySelector('.game-menu-panel');
            const editor = play.querySelector('.board-editor-wrapper');
            const actions = play.querySelector('.right-controls');
            const names = [global.document.getElementById('playerBlackName'), global.document.getElementById('topClockBlack')];
            const currentNames = [global.document.getElementById('playerWhiteName'), global.document.getElementById('topClockWhite')];
            if (![legacyGrid, boardWithEval, leftPanel, rightPanel, gameMenu, editor, actions, ...names, ...currentNames].every(Boolean))
                return result(false, 'unavailable', REASONS.PLAY_UNAVAILABLE);

            const place = (node, host) => {
                const marker = global.document.createComment(`caissa-shell:${node.id || node.className}`);
                node.parentNode.insertBefore(marker, node);
                this.#placements.push({ node, marker });
                host.appendChild(node);
            };
            const boardRegion = this.#root.querySelector('.caissa-simplified-shell__board-region');
            const opponent = this.#root.querySelector('.caissa-simplified-shell__player--opponent');
            const player = this.#root.querySelector('.caissa-simplified-shell__player--current');
            const contextBody = this.#root.querySelector('.caissa-simplified-shell__context-body');
            const advancedBody = this.#root.querySelector('.caissa-simplified-shell__advanced-body');
            names.forEach(node => place(node, opponent));
            currentNames.forEach(node => place(node, player));
            place(boardWithEval, boardRegion);
            place(rightPanel, advancedBody);
            place(leftPanel, advancedBody);
            place(gameMenu, advancedBody);
            place(editor, advancedBody);
            this.#root.querySelectorAll('[aria-live]').forEach(node => {
                if (node.closest('[data-caissa-accessibility-live-regions]')) return;
                this.#suppressedLive.push({ node, value: node.getAttribute('aria-live') });
                node.removeAttribute('aria-live');
            });
            const betaEntry = this.#root.dataset.entryExperience === 'beta';
            global.document.body.classList.toggle('caissa-play-v2-beta-active', betaEntry);
            this.#gamesPanel = global.CaissaGamesPanel?.create?.({ minimalEntry: betaEntry });
            const panelMount = this.#gamesPanel?.mount?.({
                host: contextBody,
                advancedDisclosure: this.#root.querySelector('.caissa-simplified-shell__advanced')
            });
            if (!panelMount?.ok) {
                this.#gamesPanel?.dispose?.(); this.#gamesPanel = null;
                [...this.#placements].reverse().forEach(({ node, marker }) => {
                    marker.parentNode.insertBefore(node, marker); marker.remove();
                });
                this.#placements = [];
                return result(false, 'unavailable', 'GAMES_PANEL_UNAVAILABLE');
            }
            this.#postGame = global.CaissaPostGameExperience?.create?.({
                onNewGame: () => this.#gamesPanel?.reset?.(),
                onVisibilityChange: visible => {
                    if (visible) {
                        this.#gamesPanel?.hide?.(); this.#botsPanel?.hide?.();
                        this.#coachPanel?.hide?.();
                    }
                    else this.#syncPanels();
                    this.#syncComposition();
                }
            });
            const postGameMount = this.#postGame?.mount?.({ host: contextBody });
            if (!postGameMount?.ok) {
                this.#postGame?.dispose?.(); this.#postGame = null;
                this.#coachPanel?.dispose?.(); this.#coachPanel = null;
                this.#botsPanel?.dispose?.(); this.#botsPanel = null;
                this.#gamesPanel?.dispose?.(); this.#gamesPanel = null;
                [...this.#placements].reverse().forEach(({ node, marker }) => {
                    marker.parentNode.insertBefore(node, marker); marker.remove();
                });
                this.#placements = [];
                return result(false, 'unavailable', 'POST_GAME_UNAVAILABLE');
            }
            global.CaissaPostGameExperienceInstance = this.#postGame;
            legacyGrid.hidden = true;
            topbar.hidden = true;
            this.#root.hidden = false;
            global.document.body.classList.add('caissa-simplified-play-active');
            this.#active = true; this.#activationCount += 1;
            this.setMode(global.CaissaPlayRouteController?.getCurrent?.()?.mode || 'games');
            this.#postGame.syncFromPlay();
            this.#accessibility?.announce?.('PLAY_READY');
            if (!this.#listeners.length) {
                this.#listen(this.#actionBar, 'click', event => this.#handleActiveAction(event));
                this.#listen(this.#pgnDialog, 'click', event => this.#handleActiveAction(event));
                this.#listen(this.#assistance, 'change', event => this.#handleAssistanceChange(event));
                this.#listen(this.#root.querySelector('.caissa-simplified-shell__modes'), 'click', event => {
                    const mode = event.target?.dataset?.shellMode;
                    if (!mode || !MODES[mode]) return;
                    if (this.#postGame?.getSnapshot?.().visible === true && mode !== this.#mode) {
                        event.preventDefault(); this.#transitionPostGameMode(mode); return;
                    }
                    if (this.#postGame?.getSnapshot?.().visible === true && mode === this.#mode) return;
                    const beta = global.location?.pathname?.toLowerCase().startsWith('/play/beta');
                    global.CaissaPlayRouteController?.navigate?.(beta ? `/play/beta/${mode}` : `/play/${mode}?simplified=1`, { source: 'mode-tab' });
                });
                this.#listen(global, 'resize', () => this.resize());
                this.#listen(global, 'orientationchange', () => {
                    this.#diagnostics.orientationChanges += 1;
                    this.resize();
                });
                this.#listen(global, 'caissa-play-load-terminal', event => {
                    const expected = this.#mode === 'bots' ? 'bots-stack'
                        : this.#mode === 'coach' ? 'native-coach-stack' : null;
                    if (event.detail?.resourceId === expected) this.setStatus('unavailable');
                });
                if (global.visualViewport) this.#listen(global.visualViewport, 'resize', () => this.resize());
                this.#listen(global.document, 'transitionend', event => {
                    if (!event.target?.classList?.contains('main-navigation')) return;
                    this.#diagnostics.drawerCycles += 1;
                    this.resize();
                });
                this.#stateObserver = new global.MutationObserver(() => this.#syncComposition());
                this.#stateObserver.observe(global.document.body, { attributes: true, attributeFilter: ['class'] });
                this.#panelObserver = new global.MutationObserver(() => this.#syncComposition());
                this.#panelObserver.observe(contextBody, { subtree: true, attributes: true,
                    attributeFilter: ['disabled', 'aria-busy'] });
            }
            this.#syncComposition();
            this.resize();
            return result(true, 'accepted', REASONS.ACTIVATED, this.getSnapshot());
        }

        deactivate() {
            if (this.#disposed) return result(false, 'disposed', REASONS.DISPOSED);
            if (!this.#active) return result(true, 'unchanged', REASONS.ALREADY_INACTIVE);
            this.#postGame?.dispose?.(); this.#postGame = null;
            if (global.CaissaPostGameExperienceInstance) global.CaissaPostGameExperienceInstance = null;
            this.#botsPanel?.dispose?.(); this.#botsPanel = null;
            this.#coachPanel?.dispose?.(); this.#coachPanel = null;
            if (global.CaissaPlayersPanelInstance) global.CaissaPlayersPanelInstance = null;
            this.#gamesPanel?.dispose?.(); this.#gamesPanel = null;
            [...this.#placements].reverse().forEach(({ node, marker }) => {
                marker.parentNode.insertBefore(node, marker);
                marker.remove();
            });
            this.#placements = [];
            this.#suppressedLive.splice(0).forEach(({ node, value }) => {
                if (node?.isConnected && value) node.setAttribute('aria-live', value);
            });
            const play = global.document.getElementById('playSection');
            play.querySelector('.main-content.cais-grid').hidden = false;
            play.querySelector('.cais-topbar').hidden = false;
            this.#root.hidden = true;
            global.document.body.classList.remove('caissa-simplified-play-active');
            global.document.body.classList.remove('caissa-play-v2-beta-active');
            this.#removeListeners();
            this.#stateObserver?.disconnect?.(); this.#stateObserver = null;
            this.#panelObserver?.disconnect?.(); this.#panelObserver = null;
            this.#active = false;
            this.#diagnostics.restorationCycles += 1;
            global.App?.boardAdapter?.resize?.();
            return result(true, 'accepted', REASONS.DEACTIVATED, this.getSnapshot());
        }

        setMode(mode) {
            if (!Object.hasOwn(MODES, mode)) return result(false, 'rejected', REASONS.INVALID_MODE);
            if (!MODES[mode]) return result(false, 'rejected', REASONS.MODE_INACTIVE);
            const previousMode = this.#mode;
            if (previousMode === 'coach' && mode !== 'coach') {
                this.#coachPanel?.reset?.();
                const sharedStatus = this.#activeContext?.querySelector?.('[data-active-game-status]');
                if (sharedStatus) sharedStatus.textContent = '';
            }
            this.#mode = mode;
            if (this.#root) this.#root.dataset.mode = mode;
            this.#root?.querySelectorAll?.('[data-shell-mode]').forEach(button => {
                const selected = button.dataset.shellMode === mode;
                button.setAttribute('aria-selected', String(selected));
                button.tabIndex = selected ? 0 : -1;
            });
            this.#lastPanelSync = this.#modeTransitionPending ? Promise.resolve() : this.#syncPanels();
            this.#accessibility?.announce?.(`MODE_${mode.toUpperCase()}`);
            return result(true, 'accepted', 'MODE_SET', mode);
        }
        setStatus(status) {
            if (!STATUSES.includes(status)) return result(false, 'rejected', REASONS.INVALID_STATUS);
            const deferredId = this.#mode === 'bots' ? 'bots-stack'
                : this.#mode === 'coach' ? 'native-coach-stack' : null;
            if (status === 'loading' && deferredId
                && global.CaissaPlayLazyLoader?.getState?.(deferredId)?.state === 'failed') status = 'unavailable';
            this.#status = status;
            if (this.#statusNode) {
                this.#statusNode.dataset.status = status;
                const betaEntry = this.#root?.dataset.entryExperience === 'beta';
                this.#statusNode.hidden = betaEntry && status === 'ready';
                this.#statusNode.textContent = betaEntry && status === 'ready' ? '' : status === 'ready' ? 'Current Play runtime connected.' :
                    status === 'loading' ? 'Loading Play preview…' :
                    status === 'inactive' ? 'This mode is not available.' : 'Play preview unavailable.';
            }
            return result(true, 'accepted', 'STATUS_SET', status);
        }
        handleDeferredLoadFailure(resourceId) {
            const expected = this.#mode === 'bots' ? 'bots-stack'
                : this.#mode === 'coach' ? 'native-coach-stack' : null;
            return resourceId === expected ? this.setStatus('unavailable')
                : result(false, 'unchanged', 'STALE_LOAD_FAILURE');
        }
        async #transitionPostGameMode(targetMode) {
            if (this.#modeTransitionPending) return result(false, 'rejected', 'MODE_TRANSITION_PENDING');
            const authorized = global.CaissaPlayV2ModeTransitionPolicy?.authorize?.({
                sourceState: 'postgame', sourceMode: this.#mode, targetMode
            });
            if (!authorized?.ok) return result(false, 'rejected', authorized?.reasonCode || 'MODE_TRANSITION_PROHIBITED');
            this.#modeTransitionPending = true;
            try {
                global.CaissaClockService?.stop?.('postgame-mode-transition');
                global.CaissaEngineRequestIsolation?.cancelSession?.();
                global.CaissaPlayV2BotWorkerReadiness?.teardown?.('route-exit');
                const prepared = global.CaissaPlayCompatibility?.execute?.('prepareNativeSetup');
                if (!prepared?.ok) return result(false, 'failed', prepared?.reasonCode || 'SETUP_PREPARATION_FAILED');
                const cleared = this.#postGame?.clearForModeTransition?.();
                if (!cleared?.ok) return result(false, 'failed', cleared?.reasonCode || 'POSTGAME_CLEAR_FAILED');
                global.CaissaCoachSession?.reset?.(); global.CaissaBotSession?.resetToFullPower?.();
                global.CaissaGameLifecycle?.rotateSession?.(); global.CaissaEngineRequestIsolation?.createSession?.();
                global.CaissaGameLifecycle?.sync?.(
                    global.CaissaPlayCompatibility?.getSnapshot?.(), 'GAME_RESET');
                const beta = global.location?.pathname?.toLowerCase().startsWith('/play/beta');
                global.CaissaPlayRouteController?.navigate?.(
                    beta ? `/play/beta/${targetMode}` : `/play/${targetMode}?simplified=1`,
                    { source: 'postgame-mode-transition' });
                this.#lastPanelSync = this.#syncPanels();
                await this.#lastPanelSync;
                if ((targetMode === 'bots' && !this.#botsPanel)
                    || (targetMode === 'coach' && !this.#coachPanel)) {
                    this.setStatus('unavailable');
                    return result(false, 'failed', 'TARGET_SETUP_UNAVAILABLE');
                }
                if (targetMode === 'games') this.#gamesPanel?.reset?.();
                else if (targetMode === 'bots') this.#botsPanel?.reset?.();
                else this.#coachPanel?.reset?.();
                this.#syncComposition();
                const panel = targetMode === 'games' ? '[data-caissa-games-panel]'
                    : targetMode === 'bots' ? '.caissa-bots-panel' : '.caissa-native-coach-panel';
                const focusTarget = this.#root?.querySelector?.(`${panel} h2`)
                    || this.#root?.querySelector?.(`${panel} [data-games-setup-summary]`)
                    || this.#root?.querySelector?.(`${panel} input, ${panel} select, ${panel} button`);
                focusTarget?.setAttribute?.('tabindex', '-1');
                await new Promise(resolve => global.requestAnimationFrame?.(() => {
                    focusTarget?.focus?.({ preventScroll: true }); resolve();
                }) || resolve());
                return result(true, 'accepted', 'POSTGAME_MODE_TRANSITION_COMPLETED', targetMode);
            } finally { this.#modeTransitionPending = false; }
        }
        setPanelContent() {
            return this.#gamesPanel
                ? result(true, 'unchanged', 'GAMES_PANEL_OWNED', this.#gamesPanel.getSnapshot())
                : result(false, 'unavailable', 'GAMES_PANEL_UNAVAILABLE');
        }
        setPrimaryAction() { return result(false, 'unavailable', 'PRIMARY_ACTION_OWNED_BY_GAMES_PANEL'); }

        resize() {
            if (!this.#root) return result(false, 'unavailable', REASONS.PLAY_UNAVAILABLE);
            const width = global.innerWidth || global.visualViewport?.width || 0;
            const layoutHeight = global.innerHeight || global.visualViewport?.height || 0;
            const visualHeight = global.visualViewport?.height || layoutHeight;
            const height = Math.min(layoutHeight, visualHeight);
            const next = calculateGeometry({ width, height,
                viewportOwnedDesktop: this.#root.dataset.entryExperience === 'beta',
                activeGame: global.document.body.classList.contains('caissa-play-game-active') });
            if (next.boardSize < 180) {
                this.#diagnostics.rejectedGeometry += 1;
                return result(false, 'rejected', 'GEOMETRY_UNUSABLE');
            }
            const unchanged = this.#geometry && Object.keys(next).every(key => next[key] === this.#geometry[key]);
            if (unchanged) return result(true, 'unchanged', 'GEOMETRY_UNCHANGED', this.#layoutMode);
            if (this.#layoutMode && this.#layoutMode !== next.mode) this.#diagnostics.layoutChanges += 1;
            this.#layoutMode = next.mode;
            this.#geometry = next;
            this.#root.dataset.layout = next.mode;
            this.#root.dataset.scrollOwner = next.mode.includes('split') || next.mode === 'desktop-split'
                || next.mode === 'constrained-height' ? 'panel' : 'document';
            this.#root.dataset.stickyAction = 'false';
            this.#root.style.setProperty('--shell-inline-pad', `${next.inlinePadding}px`);
            this.#root.style.setProperty('--play-visual-viewport-height', `${visualHeight}px`);
            this.#root.style.setProperty('--play-visual-viewport-offset-top', `${global.visualViewport?.offsetTop || 0}px`);
            this.#root.style.setProperty('--shell-stage-pad', `${next.stagePadding}px`);
            this.#root.style.setProperty('--shell-eval-width', `${next.railWidth}px`);
            this.#root.style.setProperty('--shell-rail-gap', `${next.railGap}px`);
            this.#root.style.setProperty('--play-board-size', `${next.boardSize}px`);
            this.#root.style.setProperty('--play-board-owner-size', `${next.boardOwnerSize}px`);
            if (next.contextWidth) this.#root.style.setProperty('--play-context-width', `${next.contextWidth}px`);
            if (next.workspaceGap) this.#root.style.setProperty('--play-workspace-gap', `${next.workspaceGap}px`);
            this.#resizeCount += 1;
            if (this.#active) {
                this.#diagnostics.boardResizeRequests += 1;
                global.App?.boardAdapter?.resize?.();
            }
            return result(true, 'accepted', 'LAYOUT_RESIZED', this.#layoutMode);
        }

        syncRoute() {
            const route = global.CaissaPlayRouteController?.getCurrent?.();
            const enabled = route?.section === 'play'
                && (route.query?.simplified === '1' || route.metadata?.betaEntry === true);
            if (!enabled) return this.deactivate();
            const activated = this.activate();
            if (activated.ok) this.setMode(route.mode || 'games');
            return activated;
        }

        getSnapshot() {
            return deepFreeze({
                schemaVersion: SNAPSHOT_SCHEMA_VERSION, shellId: this.#id,
                mounted: !!this.#root, active: this.#active, disposed: this.#disposed,
                qaOnly: true, mode: this.#mode, status: this.#status,
                layoutMode: this.#layoutMode, geometry: this.#geometry,
                scrollOwner: this.#root?.dataset?.scrollOwner || null, stickyAction: false,
                regionCount: this.#root?.querySelectorAll?.('[class*="caissa-simplified-shell__"]').length || 0,
                movedNodeCount: this.#placements.length, activationCount: this.#activationCount,
                resizeCount: this.#resizeCount, listenerCount: this.#listeners.length,
                boardAdapterId: global.App?.boardAdapter?.getSnapshot?.().adapterId || null,
                evaluationRail: global.CaissaEvaluationRailInstance?.getSnapshot?.() || null,
                gamesPanel: this.#gamesPanel?.getSnapshot?.() || null,
                botsPanel: this.#botsPanel?.getSnapshot?.() || null,
                coachPanel: this.#coachPanel?.getSnapshot?.() || null,
                playersPanel: null,
                postGame: this.#postGame?.getSnapshot?.() || null,
                accessibility: this.#accessibility?.inspect?.() || null,
                diagnostics: { ...this.#diagnostics }
            });
        }
        inspect() { return this.getSnapshot(); }
        unmount() {
            this.deactivate();
            this.#removeListeners();
            this.#unsubscribeRoute?.(); this.#unsubscribeRoute = null;
            this.#accessibility?.dispose?.(); this.#accessibility = null;
            this.#root?.remove(); this.#root = null;
            return result(true, 'accepted', 'UNMOUNTED');
        }
        dispose() {
            if (this.#disposed) return result(true, 'unchanged', REASONS.DISPOSED);
            this.unmount(); this.#disposed = true;
            return result(true, 'accepted', REASONS.DISPOSED);
        }
        #listen(target, type, handler) {
            const lifecycle = global.CaissaEventLifecycle;
            if (lifecycle?.createScope && lifecycle?.add) {
                if (!this.#eventScopeId) this.#eventScopeId =
                    lifecycle.createScope({ owner: 'shell' }).scopeId;
                const registered = lifecycle.add(this.#eventScopeId, target, type, handler);
                this.#listeners.push({ listenerId: registered.listenerId });
                return;
            }
            target.addEventListener(type, handler);
            this.#listeners.push({ target, type, handler });
        }
        async #ensureDeferredPanel(mode, token) {
            const map = {
                bots: ['bots-stack', 'CaissaBotsPanel', '#botsPanel'],
                coach: productBoundary ? ['native-coach-stack', 'CaissaNativeCoachPanel', '#coachPanel']
                    : ['coach-stack', 'CaissaCoachPanel', '#coachPanel'],
            };
            const entry = map[mode];
            if (!entry) return true;
            const existing = mode === 'bots' ? this.#botsPanel : this.#coachPanel;
            if (existing) return true;
            this.setStatus('loading');
            try {
                await global.CaissaPlayLazyLoader?.load?.(entry[0], { qa: true, retry: true });
                if (token !== this.#panelLoadToken || this.#mode !== mode || !this.#active) return false;
                const panel = global[entry[1]]?.create?.({
                    minimalEntry: ['bots', 'coach'].includes(mode) && this.#root.dataset.entryExperience === 'beta'
                });
                const mounted = panel?.mount?.({ host: this.#root.querySelector('.caissa-simplified-shell__context-body') });
                if (!mounted?.ok) throw new Error('PANEL_MOUNT_FAILED');
                if (mode === 'bots') this.#botsPanel = panel;
                else if (mode === 'coach') this.#coachPanel = panel;
                this.setStatus('ready');
                return true;
            } catch (_) {
                if (this.#mode === mode) this.setStatus('unavailable');
                return false;
            }
        }
        async #syncPanels() {
            if (!this.#active || this.#postGame?.getSnapshot?.().visible) return;
            if (global.document.body.classList.contains('caissa-play-game-active')) {
                this.#syncComposition(); return;
            }
            const token = ++this.#panelLoadToken;
            if (this.#mode !== 'games' && !(await this.#ensureDeferredPanel(this.#mode, token))) return;
            if (token !== this.#panelLoadToken) return;
            if (this.#mode === 'bots') {
                global.CaissaCoachSession?.reset?.();
                this.#gamesPanel?.hide?.(); this.#coachPanel?.hide?.();
                this.#botsPanel?.show?.();
            } else if (this.#mode === 'coach') {
                global.CaissaBotSession?.resetToFullPower?.();
                this.#gamesPanel?.hide?.(); this.#botsPanel?.hide?.();
                this.#coachPanel?.show?.();
            } else {
                global.CaissaCoachSession?.reset?.();
                this.#botsPanel?.hide?.(); this.#coachPanel?.hide?.();
                this.#gamesPanel?.show?.();
            }
            this.#syncComposition();
        }
        #syncComposition() {
            if (!this.#root) return;
            const postGame = this.#postGame?.getSnapshot?.().visible === true;
            const active = !postGame && global.document.body.classList.contains('caissa-play-game-active');
            const primary = this.#root.querySelector('[data-games-primary]:not([hidden]),[data-bots-primary]:not([hidden]),[data-coach-primary]:not([hidden])');
            const starting = !active && !postGame && primary?.disabled === true;
            const state = postGame ? 'postgame' : active ? 'active' : starting ? 'starting' : 'setup';
            const previousState = this.#root.dataset.uiState;
            this.#root.dataset.uiState = state;
            if (active) {
                this.#gamesPanel?.hide?.(); this.#botsPanel?.hide?.(); this.#coachPanel?.hide?.();
            } else if (!postGame) {
                if (this.#mode === 'games') this.#gamesPanel?.show?.();
                else if (this.#mode === 'bots') this.#botsPanel?.show?.();
                else if (this.#mode === 'coach') this.#coachPanel?.show?.();
            }
            this.#activeContext.hidden = !active;
            this.#actionBar.hidden = !active;
            this.#syncAssistance(active, postGame);
            const coachHelp = this.#actionBar.querySelector('[data-active-game-action="coach-help"]');
            coachHelp.hidden = !(active && this.#mode === 'coach');
            const heading = this.#root.querySelector('.caissa-simplified-shell__context-header h2');
            if (heading) heading.textContent = postGame ? 'Game result' : active ? 'Game status' : starting ? 'Starting game' : 'Game setup';
            this.#syncIdentity();
            if (this.#active && previousState !== state) this.resize();
        }
        #syncIdentity() {
            if (this.#root?.dataset?.entryExperience !== 'beta') return;
            const playerColor = global.App?.playerColor === 'black' ? 'black' : 'white';
            let opponent = null;
            if (this.#mode === 'games') opponent = global.CaissaPlayV2IdentityPolicy?.gamesOpponentName?.() || 'CAISSA';
            else if (this.#mode === 'bots') opponent = global.CaissaBotSession?.getSnapshot?.()?.activeProfile?.name || null;
            else if (this.#mode === 'coach' && global.CaissaCoachSession?.getSnapshot?.()?.active) opponent = 'Coach-assisted game';
            const white = global.document.getElementById('playerWhiteName');
            const black = global.document.getElementById('playerBlackName');
            if (white) white.textContent = playerColor === 'white' ? 'Player' : opponent || '';
            if (black) black.textContent = playerColor === 'black' ? 'Player' : opponent || '';
            this.#syncBoardEdges();
        }
        #syncBoardEdges() {
            if (!this.#root) return;
            const orientation = global.App?.boardAdapter?.getSnapshot?.().orientation
                || (global.App?.isFlipped ? 'black' : 'white');
            const top = this.#root.querySelector('.caissa-simplified-shell__player--opponent');
            const bottom = this.#root.querySelector('.caissa-simplified-shell__player--current');
            const white = [global.document.getElementById('playerWhiteName'), global.document.getElementById('topClockWhite')];
            const black = [global.document.getElementById('playerBlackName'), global.document.getElementById('topClockBlack')];
            if (!top || !bottom || [...white, ...black].some(node => !node)) return;
            const bottomPair = orientation === 'black' ? black : white;
            const topPair = orientation === 'black' ? white : black;
            topPair.forEach(node => top.appendChild(node));
            bottomPair.forEach(node => bottom.appendChild(node));
            top.dataset.edgeColor = orientation === 'black' ? 'white' : 'black';
            bottom.dataset.edgeColor = orientation;
        }
        syncBoardEdges() {
            this.#syncIdentity();
            return result(true, 'accepted', 'BOARD_EDGES_SYNCED');
        }
        #syncAssistance(active, postGame) {
            if (!this.#assistance) return;
            const admitted = ['bots', 'coach'].includes(this.#mode) && !postGame;
            this.#assistance.hidden = !admitted;
            if (!admitted) return;
            const body = this.#assistance.querySelector('[data-assistance-body]');
            const modeChanged = this.#assistance.dataset.assistanceMode !== this.#mode;
            const coachOptionsReady = this.#mode === 'coach' && this.#coachPanel
                && body.querySelectorAll('select option').length === 0;
            if (modeChanged || coachOptionsReady) {
                this.#assistance.dataset.assistanceMode = this.#mode;
                body.replaceChildren();
                if (this.#mode === 'bots') {
                    const message = element('p', 'caissa-simplified-shell__assistance-note', {
                        'data-assistance-empty': '', role: 'status'
                    });
                    message.textContent = 'No optional live assistance is currently approved for bot games.';
                    body.appendChild(message);
                } else {
                    const snapshot = this.#coachPanel?.getSnapshot?.();
                    const configuration = snapshot?.configuration || global.CaissaNativeCoachConfiguration?.defaults || {};
                    const choices = [
                        ['level', 'Assistance messages', global.CaissaNativeCoachConfiguration?.levels || []],
                        ['focus', 'Guidance focus', global.CaissaNativeCoachConfiguration?.focuses || []],
                        ['timing', 'Timing', global.CaissaNativeCoachConfiguration?.timings || []]
                    ];
                    choices.forEach(([key, label, values]) => {
                        const wrapper = element('label', 'caissa-simplified-shell__assistance-option');
                        const copy = element('span', ''); copy.textContent = label;
                        const select = element('select', '', { [`data-assistance-${key}`]: '', 'aria-label': label });
                        values.forEach(value => {
                            const option = element('option', '', { value });
                            option.textContent = value.replace(/-/g, ' ').replace(/^./, character => character.toUpperCase());
                            select.appendChild(option);
                        });
                        select.value = configuration[key]; wrapper.append(copy, select); body.appendChild(wrapper);
                    });
                    const note = element('p', 'caissa-simplified-shell__assistance-note');
                    note.textContent = 'Messages are bounded, sanitized, and available on request.';
                    body.appendChild(note);
                }
            }
            if (active) this.#activeContext.appendChild(this.#assistance);
            else {
                const panel = this.#mode === 'bots' ? this.#root.querySelector('[data-caissa-bots-panel]')
                    : this.#root.querySelector('[data-caissa-native-coach-panel]');
                const primary = panel?.querySelector(this.#mode === 'bots' ? '[data-bot-primary]' : '[data-coach-primary]');
                if (panel && primary) panel.insertBefore(this.#assistance, primary);
            }
        }
        #handleAssistanceChange(event) {
            if (this.#mode !== 'coach') return;
            const entry = Object.entries(event.target?.dataset || {}).find(([key]) => key.startsWith('assistance'));
            if (!entry) return;
            const key = entry[0].slice('assistance'.length);
            const normalized = key[0]?.toLowerCase() + key.slice(1);
            const response = this.#coachPanel?.configure?.({ [normalized]: event.target.value });
            if (!response?.ok) event.target.value = this.#coachPanel?.getSnapshot?.().configuration?.[normalized] || event.target.value;
        }
        #handleActiveAction(event) {
            const action = event.target?.closest?.('[data-active-game-action]')?.dataset?.activeGameAction;
            if (!action) return;
            if (action === 'resign') global.resignGame?.();
            else if (action === 'coach-help' && this.#mode === 'coach') {
                const response = this.#coachPanel?.requestHelp?.();
                const status = this.#activeContext.querySelector('[data-active-game-status]');
                status.textContent = response?.ok ? response.presentation?.message || 'Coach help is available.'
                    : response?.reasonCode === 'COOLDOWN' ? 'Coach help is cooling down.' : 'Coach help is unavailable right now.';
            }
            else if (action === 'menu') {
                if (typeof global.showModal === 'function') global.showModal('menuModal');
                else global.document.getElementById('btnSettings')?.click?.();
            } else if (action === 'pgn') {
                let pgn = '';
                try { pgn = global.CaissaGameRecord?.buildFromPlay?.()?.notation?.pgn || ''; } catch (_) { pgn = ''; }
                this.#pgnDialog.querySelector('[data-active-game-pgn]').value = pgn;
                if (typeof this.#pgnDialog.showModal === 'function') this.#pgnDialog.showModal();
                else this.#pgnDialog.setAttribute('open', '');
            } else if (action === 'close-pgn') this.#pgnDialog.close?.();
        }
        #removeListeners() {
            if (this.#eventScopeId && global.CaissaEventLifecycle?.disposeScope) {
                global.CaissaEventLifecycle.disposeScope(this.#eventScopeId);
                this.#eventScopeId = null; this.#listeners.length = 0;
                return;
            }
            this.#listeners.splice(0).forEach(({ target, type, handler }) =>
                target?.removeEventListener?.(type, handler));
        }
    }

    const api = Object.freeze({
        schemaVersion: SCHEMA_VERSION, snapshotSchemaVersion: SNAPSHOT_SCHEMA_VERSION,
        statuses: STATUSES, regions: REGIONS, modes: MODES, layoutModes: LAYOUT_MODES,
        reasonCodes: REASONS, selectLayoutMode, calculateGeometry,
        create: () => new SimplifiedPlayShell()
    });
    global.CaissaSimplifiedPlayShell = api;

    global.document.addEventListener('DOMContentLoaded', () => {
        const shell = api.create();
        global.CaissaSimplifiedPlayShellInstance = shell;
        shell.mount();
        const route = global.CaissaPlayRouteController?.getCurrent?.();
        if (route?.query?.simplified !== '1' && route?.metadata?.betaEntry !== true) {
            shell.syncRoute();
            return;
        }
        const activateWhenReady = () => {
            if (global.App?.boardAdapter?.getSnapshot?.().mounted) shell.syncRoute();
            else global.setTimeout(activateWhenReady, 50);
        };
        activateWhenReady();
    });
})(typeof window !== 'undefined' ? window : globalThis);
