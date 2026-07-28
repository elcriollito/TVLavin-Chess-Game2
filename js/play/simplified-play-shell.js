(function (global) {
    'use strict';

    const SCHEMA_VERSION = '1.3.0';
    const SNAPSHOT_SCHEMA_VERSION = '1.3.0';
    const STATUSES = Object.freeze(['loading', 'ready', 'inactive', 'error']);
    const REGIONS = Object.freeze([
        'mode-navigation', 'board-stage', 'opponent-header', 'evaluation-rail',
        'chessboard', 'player-header', 'board-actions', 'context-panel',
        'panel-header', 'panel-body', 'advanced-options', 'panel-status', 'action-footer'
    ]);
    const MODES = Object.freeze({ games: true, bots: false, coach: false, players: false });
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
        if (mode === 'phone-landscape') {
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
        const boardSize = Math.max(0, Math.floor(Math.min(columnWidth - railWidth - railGap, heightLimit, 760)));
        return deepFreeze({
            mode, width, height, safeLeft, safeRight, inlinePadding, stagePadding,
            railWidth, railGap, boardSize, squareSize: boardSize / 8
        });
    }

    class SimplifiedPlayShell {
        #id = `simplified-play-${++shellSequence}`;
        #root = null; #active = false; #disposed = false; #status = 'loading';
        #mode = 'games'; #placements = []; #listeners = []; #unsubscribeRoute = null;
        #layoutMode = null; #geometry = null; #resizeCount = 0; #activationCount = 0; #statusNode = null;
        #gamesPanel = null; #postGame = null;
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

            const root = element('div', 'caissa-simplified-shell', {
                'data-caissa-simplified-shell': '', 'data-qa-preview': 'true',
                'aria-label': 'Simplified Play QA preview'
            });
            root.hidden = true;

            const preview = element('div', 'caissa-simplified-shell__preview', { role: 'status' });
            preview.textContent = 'QA Preview · Simplified Play';
            const nav = element('nav', 'caissa-simplified-shell__modes', { 'aria-label': 'Play modes' });
            Object.entries(MODES).forEach(([mode, available]) => {
                const button = element('button', 'caissa-simplified-shell__mode', {
                    type: 'button', role: 'tab', 'data-shell-mode': mode,
                    'aria-selected': String(mode === 'games'),
                    'aria-disabled': String(!available)
                });
                button.textContent = mode[0].toUpperCase() + mode.slice(1);
                button.disabled = !available;
                if (!available) button.title = 'Not available yet';
                nav.appendChild(button);
            });

            const workspace = element('div', 'caissa-simplified-shell__workspace');
            const boardStage = element('section', 'caissa-simplified-shell__board-stage', {
                'aria-labelledby': `${this.#id}-board-heading`
            });
            const heading = element('h2', 'caissa-simplified-shell__sr-heading', { id: `${this.#id}-board-heading` });
            heading.textContent = 'Game board';
            const opponent = element('header', 'caissa-simplified-shell__player caissa-simplified-shell__player--opponent');
            const boardRegion = element('div', 'caissa-simplified-shell__board-region');
            const player = element('header', 'caissa-simplified-shell__player caissa-simplified-shell__player--current');
            const boardActions = element('div', 'caissa-simplified-shell__board-actions', { 'aria-label': 'Board actions' });
            boardStage.append(heading, opponent, boardRegion, player, boardActions);

            const context = element('aside', 'caissa-simplified-shell__context', {
                'aria-labelledby': `${this.#id}-context-heading`
            });
            const contextHeader = element('header', 'caissa-simplified-shell__context-header');
            const contextHeading = element('h2', '', { id: `${this.#id}-context-heading` });
            contextHeading.textContent = 'Current Play Controls';
            contextHeader.appendChild(contextHeading);
            const contextBody = element('div', 'caissa-simplified-shell__context-body');
            const advanced = element('details', 'caissa-simplified-shell__advanced');
            const summary = element('summary', ''); summary.textContent = 'Advanced current controls';
            const advancedBody = element('div', 'caissa-simplified-shell__advanced-body');
            advanced.append(summary, advancedBody);
            this.#statusNode = element('div', 'caissa-simplified-shell__status', { role: 'status', 'aria-live': 'polite' });
            context.append(contextHeader, contextBody, this.#statusNode);

            const footer = element('footer', 'caissa-simplified-shell__footer', { 'aria-label': 'Primary game actions' });
            workspace.append(boardStage, nav, context, footer, advanced);
            root.append(preview, workspace);
            stage.appendChild(root);
            this.#root = root;
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
            place(actions, advancedBody);
            this.#gamesPanel = global.CaissaGamesPanel?.create?.();
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
                onVisibilityChange: visible => visible ? this.#gamesPanel?.hide?.() : this.#gamesPanel?.show?.()
            });
            const postGameMount = this.#postGame?.mount?.({ host: contextBody });
            if (!postGameMount?.ok) {
                this.#postGame?.dispose?.(); this.#postGame = null;
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
            this.#postGame.syncFromPlay();
            if (!this.#listeners.length) {
                this.#listen(global, 'resize', () => this.resize());
                this.#listen(global, 'orientationchange', () => {
                    this.#diagnostics.orientationChanges += 1;
                    this.resize();
                });
                if (global.visualViewport) this.#listen(global.visualViewport, 'resize', () => this.resize());
                this.#listen(global.document, 'transitionend', event => {
                    if (!event.target?.classList?.contains('main-navigation')) return;
                    this.#diagnostics.drawerCycles += 1;
                    this.resize();
                });
            }
            this.resize();
            return result(true, 'accepted', REASONS.ACTIVATED, this.getSnapshot());
        }

        deactivate() {
            if (this.#disposed) return result(false, 'disposed', REASONS.DISPOSED);
            if (!this.#active) return result(true, 'unchanged', REASONS.ALREADY_INACTIVE);
            this.#postGame?.dispose?.(); this.#postGame = null;
            if (global.CaissaPostGameExperienceInstance) global.CaissaPostGameExperienceInstance = null;
            this.#gamesPanel?.dispose?.(); this.#gamesPanel = null;
            [...this.#placements].reverse().forEach(({ node, marker }) => {
                marker.parentNode.insertBefore(node, marker);
                marker.remove();
            });
            this.#placements = [];
            const play = global.document.getElementById('playSection');
            play.querySelector('.main-content.cais-grid').hidden = false;
            play.querySelector('.cais-topbar').hidden = false;
            this.#root.hidden = true;
            global.document.body.classList.remove('caissa-simplified-play-active');
            this.#removeListeners();
            this.#active = false;
            this.#diagnostics.restorationCycles += 1;
            global.App?.boardAdapter?.resize?.();
            return result(true, 'accepted', REASONS.DEACTIVATED, this.getSnapshot());
        }

        setMode(mode) {
            if (!Object.hasOwn(MODES, mode)) return result(false, 'rejected', REASONS.INVALID_MODE);
            if (!MODES[mode]) return result(false, 'rejected', REASONS.MODE_INACTIVE);
            this.#mode = mode;
            return result(true, 'accepted', 'MODE_SET', mode);
        }
        setStatus(status) {
            if (!STATUSES.includes(status)) return result(false, 'rejected', REASONS.INVALID_STATUS);
            this.#status = status;
            if (this.#statusNode) {
                this.#statusNode.dataset.status = status;
                this.#statusNode.textContent = status === 'ready' ? 'Current Play runtime connected.' :
                    status === 'loading' ? 'Loading Play preview…' :
                    status === 'inactive' ? 'This mode is not available.' : 'Play preview unavailable.';
            }
            return result(true, 'accepted', 'STATUS_SET', status);
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
            const next = calculateGeometry({ width, height });
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
            this.#root.style.setProperty('--shell-stage-pad', `${next.stagePadding}px`);
            this.#root.style.setProperty('--shell-eval-width', `${next.railWidth}px`);
            this.#root.style.setProperty('--shell-rail-gap', `${next.railGap}px`);
            this.#root.style.setProperty('--play-board-size', `${next.boardSize}px`);
            this.#resizeCount += 1;
            if (this.#active) {
                this.#diagnostics.boardResizeRequests += 1;
                global.App?.boardAdapter?.resize?.();
            }
            return result(true, 'accepted', 'LAYOUT_RESIZED', this.#layoutMode);
        }

        syncRoute() {
            const route = global.CaissaPlayRouteController?.getCurrent?.();
            const enabled = route?.section === 'play' && route.query?.simplified === '1';
            return enabled ? this.activate() : this.deactivate();
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
                postGame: this.#postGame?.getSnapshot?.() || null,
                diagnostics: { ...this.#diagnostics }
            });
        }
        inspect() { return this.getSnapshot(); }
        unmount() {
            this.deactivate();
            this.#removeListeners();
            this.#unsubscribeRoute?.(); this.#unsubscribeRoute = null;
            this.#root?.remove(); this.#root = null;
            return result(true, 'accepted', 'UNMOUNTED');
        }
        dispose() {
            if (this.#disposed) return result(true, 'unchanged', REASONS.DISPOSED);
            this.unmount(); this.#disposed = true;
            return result(true, 'accepted', REASONS.DISPOSED);
        }
        #listen(target, type, handler) {
            target.addEventListener(type, handler);
            this.#listeners.push({ target, type, handler });
        }
        #removeListeners() {
            this.#listeners.splice(0).forEach(({ target, type, handler }) => target.removeEventListener(type, handler));
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
        if (route?.query?.simplified !== '1') {
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
