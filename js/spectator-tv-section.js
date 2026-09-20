/**
 * CAISSA Spectator TV 2.0 — FICS Broadcast Experience
 *
 * Board-first workflow shell over the existing FICS connection, lobby refresh,
 * observe helper, Style12 parser path, state model, and live game catalog.
 * It does not create another socket, board authority, or engine lifecycle.
 */
(function() {
    'use strict';

    const SpectatorTVSection = {
        elements: {},
        state: null,
        catalog: null,
        board: null,
        boardView: null,
        lastRenderedFen: null,
        boardResizeFrame: null,
        lastBoardGeometry: null,
        catalogLoadCompleted: false,
        unsubscribeFics: null,
        contextSnapshot: '',
        selectedGame: null,
        selectionGeneration: 0,
        queuedGameId: null,
        activeWorkspaceTab: 'server',
        selectedServer: 'fics',
        visibleChannelIds: Object.freeze(['featured', 'top-rated', 'blitz', 'bullet', 'rapid']),
        workspaceTabs: Object.freeze(['server', 'channels', 'watch']),

        init() {
            this.cacheElements();
            this.state = window.CaissaSpectatorTV?.createInitialState?.() || null;
            this.catalog = window.CaissaSpectatorTVCatalog?.createCatalog?.() || null;
            this.bindEvents();
            this.subscribeToFics();
            this.render();
        },

        cacheElements() {
            this.elements = {
                section: document.getElementById('spectatorSection'),
                connectionStatus: document.getElementById('spectatorConnectionStatus'),
                featuredBadge: document.getElementById('spectatorFeaturedBadge'),
                message: document.getElementById('spectatorMessage'),
                board: document.getElementById('spectatorBoard'),
                topPlayer: document.getElementById('spectatorTopPlayer'),
                bottomPlayer: document.getElementById('spectatorBottomPlayer'),
                gameStatus: document.getElementById('spectatorGameStatus'),
                moveList: document.getElementById('spectatorMoveList'),
                liveContext: document.getElementById('spectatorLiveContext'),
                channelList: document.getElementById('spectatorChannelList'),
                gameList: document.getElementById('spectatorGameList'),
                gameCount: document.getElementById('spectatorGameCount'),
                viewingState: document.getElementById('spectatorViewingState'),
                layout: document.getElementById('spectatorLayout'),
                stage: document.getElementById('spectatorStage'),
                workspace: document.getElementById('spectatorWorkspace'),
                workspaceHeading: document.getElementById('spectatorWorkspaceHeading'),
                workspaceTabs: Array.from(document.querySelectorAll('[data-spectator-tab]')),
                workspaceViews: Array.from(document.querySelectorAll('[data-spectator-view]')),
                serverContinueBtn: document.getElementById('spectatorServerContinueBtn'),
                workspaceBackBtn: document.getElementById('spectatorWorkspaceBackBtn'),
                flipBoardBtn: document.getElementById('spectatorFlipBoardBtn'),
                theaterBtn: document.getElementById('spectatorTheaterBtn'),
                fullscreenBtn: document.getElementById('spectatorFullscreenBtn'),
                boardRefreshBtn: document.getElementById('spectatorBoardRefreshBtn')
            };
        },

        bindEvents() {
            this.elements.channelList?.addEventListener('click', (event) => {
                const button = event.target.closest('[data-channel]');
                if (button) this.selectChannel(button.dataset.channel);
            });
            this.elements.gameList?.addEventListener('click', (event) => {
                const button = event.target.closest('[data-game-id]');
                if (button) this.watchGame(button.dataset.gameId);
            });
            this.elements.serverContinueBtn?.addEventListener('click', () => this.connectSelectedServer());
            this.elements.workspaceBackBtn?.addEventListener('click', () => this.goBackInWorkspace());
            this.elements.workspaceTabs.forEach((button) => {
                button.addEventListener('click', () => this.selectWorkspaceTab(button.dataset.spectatorTab));
                button.addEventListener('keydown', (event) => this.handleWorkspaceTabKeydown(event));
            });
            this.elements.flipBoardBtn?.addEventListener('click', () => this.flipBoard());
            this.elements.theaterBtn?.addEventListener('click', () => this.toggleTheaterMode());
            this.elements.fullscreenBtn?.addEventListener('click', () => this.toggleFullscreen());
            this.elements.boardRefreshBtn?.addEventListener('click', () => this.refreshFromBoard());
            document.addEventListener('fullscreenchange', () => {
                this.renderFullscreenControl();
                this.scheduleBoardResize();
            });
            window.addEventListener('resize', () => this.scheduleBoardResize(), { passive: true });
            window.addEventListener('orientationchange', () => this.scheduleBoardResize(), { passive: true });
            window.visualViewport?.addEventListener?.('resize', () => this.scheduleBoardResize(), { passive: true });
        },

        subscribeToFics() {
            if (this.unsubscribeFics || !window.CaissaFICSClient?.addSpectatorListener) return;
            this.unsubscribeFics = window.CaissaFICSClient.addSpectatorListener((detail) => this.handleFicsEvent(detail));
        },

        onEnter() {
            this.subscribeToFics();
            this.initBoard();
            this.syncFromFicsClient();
            this.renderChannels();
            if (this.selectedGame || this.lastRenderedFen) {
                this.selectWorkspaceTab('watch');
            } else if (window.CaissaFICSClient?.authenticated) {
                this.selectWorkspaceTab('channels');
            } else {
                this.selectWorkspaceTab('server');
            }
            this.render();
            this.scheduleBoardResize();
        },

        onExit() {
            this.catalogLoadCompleted = false;
        },

        handleFicsEvent(detail) {
            if (!detail || !detail.event) return;

            if (detail.event === 'connection-state') {
                this.handleConnectionState(detail.payload);
            } else if (detail.event === 'authenticated') {
                this.enterLoadingGames();
                if (this.elements.section?.classList.contains('active')) {
                    this.selectWorkspaceTab('channels');
                    this.refreshCatalog(true);
                }
            } else if (detail.event === 'lobby-updated') {
                const activeTables = detail.payload?.activeTables || [];
                this.updateCatalog(activeTables);
            } else if (detail.event === 'style12') {
                this.renderStyle12(detail.payload);
            } else if (detail.event === 'game-ended') {
                this.renderGameEnded(detail.payload);
            } else if (detail.event === 'observation-settled') {
                this.handleObservationSettled(detail.payload);
            } else if (detail.event === 'observation-error') {
                this.handleObservationError(detail.payload);
            } else if (detail.event === 'disconnected') {
                this.handleDisconnected();
            }
        },

        handleConnectionState(payload = {}) {
            const states = window.CaissaSpectatorTV?.STATES;
            if (!states) return;
            if (payload.state === 'connecting' || payload.state === 'reconnecting') {
                this.transition(states.CONNECTING);
            } else if (payload.state === 'connected' && payload.authenticated) {
                this.enterLoadingGames();
            } else if (payload.state === 'error') {
                this.transition(states.ERROR, { error: 'FICS connection issue. Reconnect to continue.' });
            } else if (payload.state === 'disconnected') {
                this.handleDisconnected();
            }
            this.render();
        },

        handleDisconnected() {
            if (window.CaissaSpectatorTV?.cleanupState) {
                this.state = window.CaissaSpectatorTV.cleanupState(this.state);
            }
            if (window.CaissaSpectatorTVCatalog?.clearCatalog) {
                this.catalog = window.CaissaSpectatorTVCatalog.clearCatalog();
            }
            this.selectedGame = null;
            this.selectionGeneration += 1;
            this.queuedGameId = null;
            this.lastRenderedFen = null;
            this.contextSnapshot = '';
            if (this.board) this.board.position('start', false);
            this.renderPlayers(null);
            this.renderLiveContext(null, []);
            this.renderMoveList([]);
            this.renderGameStatus(null);
            this.selectWorkspaceTab('server');
            this.render();
        },

        selectWorkspaceTab(tabId, options = {}) {
            const nextTab = this.workspaceTabs.includes(tabId) ? tabId : 'server';
            this.activeWorkspaceTab = nextTab;
            this.renderWorkspace();
            if (options.focus) {
                this.elements.workspaceTabs.find((button) => button.dataset.spectatorTab === nextTab)?.focus();
            }
            if (nextTab === 'channels' && !window.CaissaFICSClient?.authenticated) {
                this.showMessage('Connect to FICS from Server to load live games.', 'info');
            }
            if (nextTab === 'watch' && !this.selectedGame && !this.lastRenderedFen) {
                this.showMessage('Choose a live game from Channels to begin watching.', 'info');
            }
        },

        renderWorkspace() {
            const labels = {
                server: 'Pick server',
                channels: 'Pick channel',
                watch: 'Watch live'
            };
            if (this.elements.layout) this.elements.layout.dataset.workspaceTab = this.activeWorkspaceTab;
            if (this.elements.workspaceHeading) {
                this.elements.workspaceHeading.textContent = labels[this.activeWorkspaceTab] || labels.server;
            }
            this.elements.workspaceTabs.forEach((button) => {
                const active = button.dataset.spectatorTab === this.activeWorkspaceTab;
                button.classList.toggle('active', active);
                button.setAttribute('aria-selected', active ? 'true' : 'false');
                button.tabIndex = active ? 0 : -1;
            });
            this.elements.workspaceViews.forEach((view) => {
                const active = view.dataset.spectatorView === this.activeWorkspaceTab;
                view.hidden = !active;
                view.classList.toggle('active', active);
            });
            if (this.elements.workspaceBackBtn) {
                const target = this.activeWorkspaceTab === 'watch' ? 'Channels' : 'Server';
                this.elements.workspaceBackBtn.setAttribute('aria-label', `Back to ${target}`);
            }
        },

        handleWorkspaceTabKeydown(event) {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const currentIndex = this.workspaceTabs.indexOf(this.activeWorkspaceTab);
            let nextIndex = currentIndex;
            if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + this.workspaceTabs.length) % this.workspaceTabs.length;
            if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % this.workspaceTabs.length;
            if (event.key === 'Home') nextIndex = 0;
            if (event.key === 'End') nextIndex = this.workspaceTabs.length - 1;
            this.selectWorkspaceTab(this.workspaceTabs[nextIndex], { focus: true });
        },

        goBackInWorkspace() {
            if (this.activeWorkspaceTab === 'watch') {
                this.selectWorkspaceTab('channels', { focus: true });
            } else {
                this.selectWorkspaceTab('server', { focus: true });
            }
        },

        connectSelectedServer() {
            const client = window.CaissaFICSClient;
            if (!client) {
                this.showMessage('FICS is not available yet.', 'error');
                return;
            }
            if (client.authenticated) {
                this.selectWorkspaceTab('channels');
                this.refreshCatalog(true);
                return;
            }
            this.transition(window.CaissaSpectatorTV?.STATES?.CONNECTING, { error: null });
            this.showMessage('Connecting to FICS as a guest…', 'info');
            client.connect?.('guest');
            this.render();
        },

        refreshFromBoard() {
            if (!window.CaissaFICSClient?.authenticated) {
                this.selectWorkspaceTab('server');
                this.showMessage('Connect to FICS before refreshing live games.', 'info');
                return;
            }
            this.refreshCatalog(true);
        },

        toggleTheaterMode() {
            if (!this.elements.layout) return;
            const active = this.elements.layout.classList.toggle('is-theater');
            this.elements.theaterBtn?.setAttribute('aria-pressed', active ? 'true' : 'false');
            this.lastBoardGeometry = null;
            this.scheduleBoardResize();
        },

        async toggleFullscreen() {
            try {
                if (document.fullscreenElement) {
                    await document.exitFullscreen?.();
                } else {
                    await this.elements.stage?.requestFullscreen?.();
                }
            } catch (error) {
                this.showMessage('Fullscreen is not available in this browser.', 'warning');
            }
            this.renderFullscreenControl();
            this.lastBoardGeometry = null;
            this.scheduleBoardResize();
        },

        flipBoard() {
            if (!this.board?.orientation) return;
            const next = this.board.orientation() === 'black' ? 'white' : 'black';
            this.board.orientation(next);
            this.scheduleBoardResize();
        },

        scheduleBoardResize() {
            if (this.boardResizeFrame !== null) return;
            const schedule = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 0));
            this.boardResizeFrame = schedule(() => {
                this.boardResizeFrame = null;
                if (!this.elements.section?.classList.contains('active')) return;
                if (!this.board) this.initBoard();
                const geometry = this.elements.board?.getBoundingClientRect?.();
                if (!this.board || !geometry || geometry.width <= 0 || geometry.height <= 0) return;
                const unchanged = this.lastBoardGeometry
                    && Math.abs(this.lastBoardGeometry.width - geometry.width) <= 0.5
                    && Math.abs(this.lastBoardGeometry.height - geometry.height) <= 0.5;
                if (unchanged) return;
                this.lastBoardGeometry = { width: geometry.width, height: geometry.height };
                this.board.resize?.();
            });
        },

        renderFullscreenControl() {
            const active = document.fullscreenElement === this.elements.stage;
            this.elements.fullscreenBtn?.setAttribute('aria-pressed', active ? 'true' : 'false');
            const label = this.elements.fullscreenBtn?.querySelector('span');
            if (label) label.textContent = active ? 'Exit full screen' : 'Fullscreen';
        },

        transition(toState, updates = {}) {
            if (!window.CaissaSpectatorTV?.transitionTo) return;
            this.state = window.CaissaSpectatorTV.transitionTo(this.state, toState, updates);
        },

        enterLoadingGames() {
            const states = window.CaissaSpectatorTV?.STATES;
            if (!states) return;
            if (this.state?.status === states.DISCONNECTED) {
                this.transition(states.CONNECTING);
            }
            this.catalogLoadCompleted = false;
            this.transition(states.LOADING_GAMES);
        },

        enterWatching() {
            const states = window.CaissaSpectatorTV?.STATES;
            if (!states) return;
            if (this.state?.status === states.DISCONNECTED) {
                this.transition(states.CONNECTING);
            }
            if (this.state?.status === states.CONNECTING) {
                this.transition(states.LOADING_GAMES);
            }
            if (this.state?.status === states.LOADING_GAMES || this.state?.status === states.SWITCHING_GAME) {
                this.transition(states.WATCHING);
            }
        },

        initBoard() {
            if (!this.elements.board || this.board || typeof Chessboard === 'undefined') return false;
            if (!this.elements.section?.classList.contains('active')) return false;
            const geometry = this.elements.board.getBoundingClientRect();
            if (geometry.width <= 0 || geometry.height <= 0) return false;
            const createLegacy = (position = 'start', orientation = 'white') => Chessboard(this.elements.board, {
                draggable: false,
                position,
                orientation
            });
            if (window.CaissaFICSBoardView?.createFicsBoardView) {
                this.boardView = window.CaissaFICSBoardView.createFicsBoardView({
                    container: this.elements.board,
                    position: 'start',
                    orientation: 'white',
                    createLegacy,
                    onRendererChange: () => {
                        this.lastBoardGeometry = null;
                        this.scheduleBoardResize();
                    },
                    onError: error => console.error('[Spectator TV] Persistent board unavailable:', error)
                });
                this.board = this.boardView.board;
            } else {
                this.board = createLegacy();
            }
            this.lastBoardGeometry = { width: geometry.width, height: geometry.height };
            return true;
        },

        syncFromFicsClient() {
            const client = window.CaissaFICSClient;
            if (!client) return;
            if (Array.isArray(client.activeTables) && client.activeTables.length) {
                this.updateCatalog(client.activeTables);
            }
            if (client.authenticated && this.state?.status === window.CaissaSpectatorTV?.STATES.DISCONNECTED) {
                this.enterLoadingGames();
            }
            if (client.liveGame?.currentFen) {
                const gameId = String(client.liveGame.gameNumber || '');
                if (gameId && String(this.selectedGame?.gameId || '') !== gameId) {
                    const catalogGame = this.catalog?.gameMap?.[gameId] || {};
                    this.beginGameSelection({
                        ...catalogGame,
                        gameId,
                        whitePlayer: client.liveGame.whiteName || catalogGame.whitePlayer,
                        blackPlayer: client.liveGame.blackName || catalogGame.blackPlayer
                    }, { requestObservation: false });
                }
                this.renderStyle12({
                    liveGame: { ...client.liveGame },
                    moveHistory: client.moveHistory?.map((move) => ({ ...move })) || []
                });
            }
        },

        selectChannel(channelId) {
            const channel = this.visibleChannelIds.includes(channelId) ? channelId : 'featured';
            if (window.CaissaSpectatorTV?.setChannel) {
                this.state = window.CaissaSpectatorTV.setChannel(this.state, channel);
            }
            this.catalog = window.CaissaSpectatorTVCatalog?.createCatalog?.({
                games: this.catalog?.games || [],
                selectedChannelId: channel,
                refreshPolicy: this.catalog?.refreshPolicy,
                lastRefreshAt: this.catalog?.lastRefreshAt
            }) || this.catalog;
            this.renderChannels();
            this.renderGameList();
        },

        refreshCatalog(manual = false) {
            const client = window.CaissaFICSClient;
            if (!client?.authenticated) {
                this.showMessage('Connect to FICS to load the featured game.', 'info');
                return;
            }

            this.enterLoadingGames();
            this.showMessage('Loading live games...', 'info');
            window.CaissaUI?.setButtonLoading(this.elements.boardRefreshBtn, true, { label: 'Refreshing...' });
            client.refreshLobby?.(manual);
            setTimeout(() => {
                window.CaissaUI?.setButtonLoading(this.elements.boardRefreshBtn, false);
            }, 3200);
            this.render();
        },

        updateCatalog(activeTables) {
            if (!window.CaissaSpectatorTVCatalog?.updateCatalog) return;
            const entries = (activeTables || [])
                .filter((table) => this.isObservableGameTable(table))
                .map((table) => ({
                    gameId: table.number,
                    whitePlayer: table.white,
                    blackPlayer: table.black,
                    whiteRating: table.whiteRating,
                    blackRating: table.blackRating,
                    timeControl: table.timeControl,
                    variant: table.variant,
                    rated: table.rated || table.label,
                    observers: table.observers,
                    status: 'active',
                    source: 'fics-active-tables',
                    label: table.label
                }));
            this.catalog = window.CaissaSpectatorTVCatalog.updateCatalog(this.catalog, entries, {
                selectedChannelId: this.state?.selectedChannelId || 'featured'
            });
            this.catalogLoadCompleted = true;
            const selected = this.selectedGame?.gameId
                ? this.catalog?.gameMap?.[String(this.selectedGame.gameId)]
                : null;
            if (selected) this.mergeSelectedGame(selected);
            this.renderGameList();
            this.renderViewingState();
        },

        isObservableGameTable(table) {
            const label = String(table?.label || '');
            return !!table?.number
                && !!table?.white
                && !!table?.black
                && /\b[WB]:\s*\d+\b/.test(label);
        },

        watchGame(gameId) {
            const client = window.CaissaFICSClient;
            const targetGame = this.catalog?.gameMap?.[String(gameId)] || null;

            if (!client?.authenticated) {
                this.showMessage('Connect to FICS before watching.', 'info');
                return;
            }

            if (!targetGame) {
                this.showMessage('That live game is no longer available. Refresh the list.', 'warning');
                this.renderGameList();
                return;
            }

            this.beginGameSelection(targetGame, { requestObservation: true });
        },

        beginGameSelection(game, options = {}) {
            const gameId = String(game?.gameId ?? game?.number ?? '').trim();
            if (!gameId) return null;
            const generation = this.selectionGeneration + 1;
            this.selectionGeneration = generation;
            this.selectedGame = Object.freeze({
                gameId,
                whitePlayer: game.whitePlayer || game.white || 'White',
                blackPlayer: game.blackPlayer || game.black || 'Black',
                whiteRating: game.whiteRating || null,
                blackRating: game.blackRating || null,
                averageRating: game.averageRating || null,
                timeControl: game.timeControl || null,
                variant: game.variant || null,
                rated: typeof game.rated === 'boolean' ? game.rated : null,
                observers: game.observers || 0,
                result: null,
                status: 'loading',
                generation
            });
            this.queuedGameId = null;
            this.state = window.CaissaSpectatorTV.setObservedGame(this.state, gameId, this.selectedGame);
            this.transition(window.CaissaSpectatorTV.STATES.SWITCHING_GAME, { metadata: this.selectedGame });
            this.clearSelectedGamePresentation();
            this.selectWorkspaceTab('watch');
            this.showMessage(`Opening game #${gameId}...`, 'info');
            this.renderGameList();
            this.render();
            if (options.requestObservation !== false) this.requestSelectedGameObservation(generation);
            return this.selectedGame;
        },

        mergeSelectedGame(updates = {}) {
            if (!this.selectedGame) return null;
            const updateId = String(updates.gameId ?? updates.number ?? this.selectedGame.gameId);
            if (updateId !== String(this.selectedGame.gameId)) return this.selectedGame;
            this.selectedGame = Object.freeze({
                ...this.selectedGame,
                whitePlayer: updates.whitePlayer || updates.white || this.selectedGame.whitePlayer,
                blackPlayer: updates.blackPlayer || updates.black || this.selectedGame.blackPlayer,
                whiteRating: updates.whiteRating || this.selectedGame.whiteRating,
                blackRating: updates.blackRating || this.selectedGame.blackRating,
                averageRating: updates.averageRating || this.selectedGame.averageRating,
                timeControl: updates.timeControl || this.selectedGame.timeControl,
                variant: updates.variant || this.selectedGame.variant,
                rated: typeof updates.rated === 'boolean' ? updates.rated : this.selectedGame.rated,
                result: Object.prototype.hasOwnProperty.call(updates, 'result') ? updates.result : this.selectedGame.result,
                status: updates.status || this.selectedGame.status
            });
            this.state = window.CaissaSpectatorTV.setObservedGame(this.state, this.selectedGame.gameId, this.selectedGame);
            return this.selectedGame;
        },

        clearSelectedGamePresentation() {
            this.lastRenderedFen = null;
            this.contextSnapshot = '';
            if (this.board) this.board.position('start', false);
            this.renderPlayers(null);
            this.renderLiveContext(null, []);
            this.renderMoveList([]);
            this.renderGameStatus(null);
        },

        requestSelectedGameObservation(generation) {
            if (!this.selectedGame || generation !== this.selectionGeneration) return;
            const client = window.CaissaFICSClient;
            const gameId = String(this.selectedGame.gameId);
            const delivery = typeof client?.switchObservedGame === 'function'
                ? client.switchObservedGame(gameId)
                : client?.send?.(`observe ${gameId}`);
            if (delivery?.ok === false && delivery.code === 'OBSERVE_IN_PROGRESS') {
                this.queuedGameId = gameId;
                return;
            }
            if (delivery?.ok === false && delivery.code !== 'ALREADY_OBSERVING') {
                this.queuedGameId = null;
                this.showMessage(`Could not open game #${gameId}. Refresh Channels and try again.`, 'error');
                return;
            }
            this.queuedGameId = null;
        },

        handleObservationSettled(payload = {}) {
            const queued = this.queuedGameId;
            if (!queued || queued !== String(this.selectedGame?.gameId || '')) return;
            if (payload.gameNumber && String(payload.gameNumber) === queued) {
                this.queuedGameId = null;
                return;
            }
            this.requestSelectedGameObservation(this.selectionGeneration);
        },

        handleObservationError(payload = {}) {
            const gameId = String(payload.gameNumber || '');
            if (!this.selectedGame || gameId !== String(this.selectedGame.gameId)) return;
            this.queuedGameId = null;
            this.showMessage(`Game #${gameId} is no longer available. Return to Channels and refresh.`, 'warning');
        },

        isSelectedGameUpdate(liveGame = {}, payload = {}) {
            if (!this.selectedGame) return false;
            const eventGameId = String(liveGame.gameNumber ?? payload.gameNumber ?? '').trim();
            if (!eventGameId || eventGameId !== String(this.selectedGame.gameId)) return false;
            if (payload.selectionGeneration !== undefined
                && Number(payload.selectionGeneration) !== this.selectionGeneration) return false;
            return true;
        },

        renderStyle12(payload = {}) {
            const liveGame = payload.liveGame || {};
            if (!liveGame.currentFen) return;
            if (!this.isSelectedGameUpdate(liveGame, payload)) return;
            const selectionGeneration = this.selectionGeneration;
            this.mergeSelectedGame({
                gameId: liveGame.gameNumber,
                whitePlayer: liveGame.whiteName,
                blackPlayer: liveGame.blackName,
                result: null,
                status: 'live'
            });

            this.initBoard();
            if (this.board && liveGame.currentFen !== this.lastRenderedFen) {
                const previousFen = this.lastRenderedFen;
                const style12 = { ...(payload.style12 || {}), fen: liveGame.currentFen };
                const semanticMove = window.CaissaFICSClient?.deriveStyle12BoardMove?.(style12, previousFen) || null;
                if (this.boardView) {
                    this.boardView.presentCanonicalState({
                        state: {
                            ...liveGame,
                            observedGame: true,
                            status: 'observing',
                            gameActive: false,
                            relation: 0
                        },
                        position: liveGame.currentFen,
                        previousFen,
                        semanticMove,
                        orientation: this.board.orientation?.() || 'white',
                        animate: Boolean(previousFen && semanticMove),
                        reviewing: false
                    });
                } else {
                    this.board.position(liveGame.currentFen, false);
                }
                this.lastRenderedFen = liveGame.currentFen;
            }

            if (selectionGeneration !== this.selectionGeneration) return;
            if (liveGame.observedGame || liveGame.gameNumber) {
                this.enterWatching();
                this.selectWorkspaceTab('watch');
            }

            this.renderPlayers(liveGame);
            this.renderLiveContext(liveGame, payload.moveHistory || []);
            this.renderMoveList(payload.moveHistory || []);
            this.renderGameStatus(liveGame);
            this.render();
        },

        renderGameEnded(payload = {}) {
            const liveGame = payload.liveGame || {};
            if (!this.isSelectedGameUpdate(liveGame, payload)) return;
            const result = payload.result || this.normalizeGameResult(payload.resultLine || liveGame.result);
            this.mergeSelectedGame({ gameId: liveGame.gameNumber, result, status: 'finished' });
            this.transition(window.CaissaSpectatorTV.STATES.GAME_FINISHED, {
                metadata: this.selectedGame
            });
            this.renderLiveContext(liveGame, payload.moveHistory || []);
            this.renderGameStatus(liveGame);
            this.render();
        },

        renderPlayers(liveGame) {
            const selected = this.selectedGame;
            const current = liveGame && this.isSelectedGameUpdate(liveGame) ? liveGame : null;
            const table = selected?.gameId
                ? window.CaissaFICSClient?.getActiveTableForGame?.(selected.gameId)
                : null;
            this.renderPlayerBar(this.elements.topPlayer, {
                color: 'black',
                name: current?.blackName || selected?.blackPlayer || 'Black',
                rating: selected?.blackRating || table?.blackRating || 'FICS',
                clock: current ? this.formatClock(current.blackClock) : '--:--',
                active: current?.sideToMove === 'b'
            });
            this.renderPlayerBar(this.elements.bottomPlayer, {
                color: 'white',
                name: current?.whiteName || selected?.whitePlayer || 'White',
                rating: selected?.whiteRating || table?.whiteRating || 'FICS',
                clock: current ? this.formatClock(current.whiteClock) : '--:--',
                active: current?.sideToMove === 'w'
            });
        },

        renderPlayerBar(element, player) {
            if (!element) return;
            const ficsClient = window.CaissaFICSClient;
            const displayName = ficsClient?.stripComputerMarker?.(player.name) || player.name;
            const computer = !!ficsClient?.isLikelyComputerPlayer?.(player.name);
            const computerMarker = computer
                ? '<span class="fics-computer-marker" title="Computer / engine account" aria-label="Computer / engine account">(C)</span>'
                : '';
            const titleName = ficsClient?.formatComputerPlayerName?.(player.name) || player.name;
            element.className = `spectator-player-bar ${player.color}${player.active ? ' turn-active' : ''}`;
            element.innerHTML = `
                <span class="spectator-turn-led${player.active ? ' active' : ''}" aria-label="${player.active ? `${player.color} to move` : `${player.color} waiting`}"></span>
                <span class="spectator-color-dot" aria-hidden="true"></span>
                <span class="spectator-player-name" title="${this.escapeHtml(titleName)}">${this.escapeHtml(displayName)}${computerMarker}</span>
                <span class="spectator-player-rating">${this.escapeHtml(player.rating || '')}</span>
                <strong class="spectator-player-clock">${this.escapeHtml(player.clock)}</strong>
            `;
        },

        renderBadge(badge) {
            const title = badge.title ? ` title="${this.escapeHtml(badge.title)}"` : '';
            return `<span class="caissa-ui-badge caissa-ui-badge--${this.escapeHtml(badge.variant)}"${title}>${this.escapeHtml(badge.label)}</span>`;
        },

        renderLiveContext(liveGame, moveHistory = []) {
            if (!this.elements.liveContext) return;
            const context = this.getLiveContextData(liveGame, moveHistory);
            const snapshot = JSON.stringify(context);
            if (this.contextSnapshot === snapshot) return;
            this.contextSnapshot = snapshot;

            const statusBadge = this.renderBadge({
                label: context.status,
                variant: context.status === 'Live' ? 'playing' : context.status === 'Finished' ? 'disabled' : 'info'
            });
            const ratedBadge = this.renderBadge({
                label: context.rated,
                variant: context.rated === 'Rated' ? 'success' : context.rated === 'Unrated' ? 'disabled' : 'info'
            });

            this.elements.liveContext.innerHTML = `
                <div class="spectator-context-cell spectator-context-cell--opening" data-spectator-detail="opening"><span>Opening</span><strong title="${this.escapeHtml(context.openingName)}">${this.escapeHtml(context.openingName)}</strong></div>
                <div class="spectator-context-cell" data-spectator-detail="eco"><span>ECO</span><strong>${this.escapeHtml(context.ecoCode)}</strong></div>
                <div class="spectator-context-cell" data-spectator-detail="variant"><span>Variant</span><strong>${this.escapeHtml(context.variant)}</strong></div>
                <div class="spectator-context-cell" data-spectator-detail="rated"><span>Rated</span>${ratedBadge}</div>
                <div class="spectator-context-cell" data-spectator-detail="status"><span>Status</span>${statusBadge}</div>
                <div class="spectator-context-cell" data-spectator-detail="time-control"><span>Time control</span><strong>${this.escapeHtml(context.timeControl)}</strong></div>
                <div class="spectator-context-cell" data-spectator-detail="move"><span>Move</span><strong>${this.escapeHtml(context.currentMove)}</strong></div>
                <div class="spectator-context-cell" data-spectator-detail="phase"><span>Phase</span><strong>${this.escapeHtml(context.phase)}</strong></div>
                <div class="spectator-context-cell" data-spectator-detail="result"><span>Result</span><strong>${this.escapeHtml(context.result)}</strong></div>
                <div class="spectator-context-cell" data-spectator-detail="game"><span>Game #</span><strong>${this.escapeHtml(context.gameNumber)}</strong></div>
                <div class="spectator-context-cell" data-spectator-detail="rating"><span>Rating</span><strong title="${this.escapeHtml(context.ratingTitle)}">${this.escapeHtml(context.rating)}</strong></div>
                <div class="spectator-context-cell spectator-context-cell--players" data-spectator-detail="players"><span>Players</span><strong title="${this.escapeHtml(context.players)}">${this.escapeHtml(context.players)}</strong></div>
            `;
        },

        getLiveContextData(liveGame, moveHistory = []) {
            const game = this.selectedGame;
            const current = liveGame && this.isSelectedGameUpdate(liveGame) ? liveGame : null;
            const opening = this.resolveOpening(moveHistory);
            const plyCount = Array.isArray(moveHistory) ? moveHistory.length : 0;
            const result = this.normalizeGameResult(current?.result || game?.result);
            const finished = !!game && (game.status === 'finished' || result !== '—');
            const live = !!current?.currentFen && !finished;
            const whitePlayer = current?.whiteName || game?.whitePlayer || '—';
            const blackPlayer = current?.blackName || game?.blackPlayer || '—';
            const whiteRating = game?.whiteRating || '—';
            const blackRating = game?.blackRating || '—';
            return {
                openingName: opening.name,
                ecoCode: opening.eco || '—',
                variant: game?.variant ? this.titleCase(game.variant) : '—',
                rated: game?.rated === true ? 'Rated' : game?.rated === false ? 'Unrated' : '—',
                timeControl: game?.timeControl || '—',
                currentMove: current?.moveNumber ? String(current.moveNumber) : plyCount ? String(Math.ceil(plyCount / 2)) : '—',
                phase: current?.currentFen ? this.getGamePhase(current.currentFen, plyCount) : '—',
                result,
                status: finished ? 'Finished' : live ? 'Live' : game ? 'Loading' : 'Not watching',
                gameNumber: game?.gameId ? String(game.gameId) : '—',
                rating: `${whiteRating} / ${blackRating}`,
                ratingTitle: `White ${whiteRating} / Black ${blackRating}`,
                players: game ? `${whitePlayer} vs ${blackPlayer}` : '—'
            };
        },

        normalizeGameResult(value) {
            const text = String(value || '').trim();
            if (!text) return '—';
            if (/\b1-0\b/.test(text)) return '1-0';
            if (/\b0-1\b/.test(text)) return '0-1';
            if (/1\/2-1\/2|drawn|draw/i.test(text)) return '1/2-1/2';
            return '—';
        },

        resolveOpening(moveHistory = []) {
            const playedSAN = (moveHistory || [])
                .map((move) => this.normalizeSan(move?.san))
                .filter(Boolean);
            if (!playedSAN.length) return { name: '—', eco: '' };

            const candidates = [];
            if (Array.isArray(window.App?.openings)) candidates.push(...window.App.openings);
            if (Array.isArray(window.App?.ecoCodeRows)) candidates.push(...window.App.ecoCodeRows);

            let best = null;
            let bestDepth = 0;
            candidates.forEach((candidate) => {
                const moves = this.extractOpeningMoves(candidate).map((move) => this.normalizeSan(move)).filter(Boolean);
                if (!moves.length || moves.length > playedSAN.length || moves.length <= bestDepth) return;
                const match = moves.every((move, index) => move === playedSAN[index]);
                if (!match) return;
                best = {
                    name: candidate.name || candidate.opening || candidate.title || 'Unknown Opening',
                    eco: candidate.eco || candidate.code || ''
                };
                bestDepth = moves.length;
            });

            return best || { name: '—', eco: '' };
        },

        extractOpeningMoves(candidate = {}) {
            const source = Array.isArray(candidate.moves)
                ? candidate.moves
                : String(candidate.moves || candidate.ecoMovesText || candidate.movesText || '').split(/\s+/);
            return source.filter((move) => move && !/^(?:1-0|0-1|1\/2-1\/2|\*)$/.test(String(move)));
        },

        normalizeSan(value) {
            return String(value || '')
                .replace(/^\d+\.(?:\.\.)?/, '')
                .replace(/[!?+#]+/g, '')
                .replace(/\s+/g, '')
                .trim();
        },

        getGamePhase(fen, plyCount) {
            if (!fen || !plyCount) return '—';
            if (plyCount <= 16) return 'Opening';
            if (this.isEndgameFen(fen) || plyCount >= 60) return 'Endgame';
            return 'Middlegame';
        },

        isEndgameFen(fen) {
            const board = String(fen || '').split(' ')[0];
            if (!board) return false;
            const pieces = board.replace(/[0-9/]/g, '');
            const queens = (pieces.match(/[qQ]/g) || []).length;
            const nonKingPieces = pieces.replace(/[kK]/g, '').length;
            return queens === 0 && nonKingPieces <= 8;
        },

        titleCase(value) {
            return String(value || '')
                .replace(/[-_]+/g, ' ')
                .replace(/\b\w/g, (char) => char.toUpperCase());
        },

        renderGameStatus(liveGame) {
            if (!this.elements.gameStatus) return;
            const selected = this.selectedGame;
            if (!selected) {
                this.elements.gameStatus.textContent = 'No live game selected';
                return;
            }
            if (selected.status === 'finished') {
                this.elements.gameStatus.textContent = `Game #${selected.gameId} - Finished`;
                return;
            }
            const current = liveGame && this.isSelectedGameUpdate(liveGame) ? liveGame : null;
            if (!current?.currentFen) {
                this.elements.gameStatus.textContent = `Game #${selected.gameId} - Loading`;
                return;
            }
            const side = current.sideToMove === 'b' ? 'Black' : 'White';
            this.elements.gameStatus.textContent = `Game #${selected.gameId} - ${side} to move`;
        },

        renderMoveList(moveHistory) {
            if (!this.elements.moveList) return;
            if (!moveHistory.length) {
                this.renderEmptyState(this.elements.moveList, {
                    icon: 'fa-list-ol',
                    title: 'No live moves yet.',
                    message: 'Moves will appear when the featured game updates.'
                });
                return;
            }

            const rows = [];
            moveHistory.forEach((move) => {
                let row = rows.find((item) => item.moveNumber === move.moveNumber);
                if (!row) {
                    row = { moveNumber: move.moveNumber, white: '', black: '' };
                    rows.push(row);
                }
                row[move.color] = move.san;
            });

            this.elements.moveList.replaceChildren(...rows.map((row) => {
                const item = document.createElement('div');
                item.className = 'spectator-move-row';
                item.innerHTML = `
                    <span class="spectator-move-number">${row.moveNumber}.</span>
                    <span>${this.escapeHtml(row.white || '...')}</span>
                    <span>${this.escapeHtml(row.black || '')}</span>
                `;
                return item;
            }));
        },

        renderChannels() {
            const selected = this.state?.selectedChannelId || 'featured';
            this.elements.channelList?.querySelectorAll('[data-channel]').forEach((button) => {
                const active = button.dataset.channel === selected;
                button.classList.toggle('active', active);
                button.setAttribute('aria-selected', active ? 'true' : 'false');
            });
        },

        getVisibleGames() {
            return window.CaissaSpectatorTVCatalog?.filterByChannel?.(
                this.catalog?.games || [],
                this.state?.selectedChannelId || 'featured'
            ) || [];
        },

        renderGameList() {
            if (!this.elements.gameList) return;
            const games = this.getVisibleGames();
            if (this.elements.gameCount) this.elements.gameCount.textContent = `${games.length} ${games.length === 1 ? 'game' : 'games'}`;
            if (!games.length) {
                this.renderEmptyState(this.elements.gameList, {
                    icon: 'fa-search',
                    title: 'No games found.',
                    message: 'Try another channel or refresh live games.'
                });
                return;
            }

            this.elements.gameList.replaceChildren(...games.map((game) => {
                const row = document.createElement('div');
                const current = String(this.selectedGame?.gameId || '') === String(game.gameId);
                row.className = `spectator-game-row${current ? ' is-current' : ''}`;
                row.innerHTML = `
                    <div class="spectator-game-main">
                        <div class="spectator-game-players" title="${this.escapeHtml(`${game.whitePlayer} vs ${game.blackPlayer}`)}">
                            ${this.escapeHtml(game.whitePlayer)} vs ${this.escapeHtml(game.blackPlayer)}
                        </div>
                        <div class="spectator-game-meta">
                            <span>#${this.escapeHtml(game.gameId)}</span>
                            <span>${this.escapeHtml(game.timeControl)}</span>
                            <span>${this.escapeHtml(game.variant || 'standard')}</span>
                            <span>${this.escapeHtml(game.averageRating || 'FICS')}</span>
                            <span>${game.rated === true ? 'rated' : game.rated === false ? 'unrated' : 'live'}</span>
                            <span>${this.escapeHtml(game.observers || 0)} watching</span>
                        </div>
                    </div>
                `;
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'fics-btn fics-btn-secondary spectator-game-watch';
                button.dataset.gameId = game.gameId;
                button.textContent = current ? 'Watching' : 'Watch';
                button.disabled = current;
                button.setAttribute('aria-label', `${current ? 'Watching' : 'Watch'} game ${game.gameId}: ${game.whitePlayer} vs ${game.blackPlayer}`);
                row.appendChild(button);
                return row;
            }));
        },

        render() {
            const connection = this.getConnectionFootState();
            if (this.elements.connectionStatus) {
                this.elements.connectionStatus.textContent = connection.label;
                this.elements.connectionStatus.className = `spectator-status spectator-status-${connection.status}`;
            }
            if (this.elements.featuredBadge) {
                this.elements.featuredBadge.textContent = this.catalog?.featuredGameId
                    ? `Featured #${this.catalog.featuredGameId}`
                    : 'Featured';
            }
            this.renderChannels();
            this.renderGameList();
            this.renderViewingState();
            this.renderWorkspace();
            this.renderFullscreenControl();
        },

        renderViewingState() {
            const panel = this.elements.board?.closest('.spectator-board-panel');
            const target = this.elements.viewingState;
            if (!panel || !target) return;
            const states = window.CaissaSpectatorTV?.STATES || {};
            const status = this.state?.status;
            const hasGame = !!this.lastRenderedFen;
            const hasSelection = !!this.selectedGame;
            const loading = !hasGame && (
                (hasSelection && status === states.SWITCHING_GAME)
                || (!hasSelection && !this.catalogLoadCompleted
                    && [states.CONNECTING, states.LOADING_GAMES].includes(status))
            );
            panel.classList.toggle('is-loading', loading);
            panel.classList.toggle('is-empty', !loading && !hasGame);
            target.hidden = hasGame;
            const title = target.querySelector('.spectator-viewing-state__title');
            const message = target.querySelector('.spectator-viewing-state__message');
            const action = target.querySelector('.spectator-viewing-state__action');
            if (loading) {
                if (title) title.textContent = 'Loading live game\u2026';
                if (message) message.textContent = 'Looking for an available game in this channel.';
                if (action) action.hidden = true;
            } else if (!hasGame) {
                if (title) title.textContent = 'No live game available';
                if (message) message.textContent = 'No live game is available in this channel right now. Choose another channel or return to Play.';
                if (action) action.hidden = false;
            }
        },

        showMessage(message, type = 'info') {
            if (!this.elements.message) return;
            this.elements.message.textContent = message || '';
            this.elements.message.className = `spectator-message spectator-message-${type}`;
        },

        renderEmptyState(target, options) {
            if (!target) return;
            if (window.CaissaUI?.createEmptyState) {
                const node = window.CaissaUI.createEmptyState(options);
                node.classList.add('caissa-ui-empty-state--compact');
                target.replaceChildren(node);
                return;
            }
            target.textContent = options.message || options.title || '';
        },

        getConnectionFootState() {
            const client = window.CaissaFICSClient;
            if (client?.authenticated) return { label: 'Connected · FICS', status: 'connected' };
            const connectionState = String(client?.connectionState || '').toLowerCase();
            const connecting = ['connecting', 'reconnecting'].includes(connectionState)
                || this.state?.status === window.CaissaSpectatorTV?.STATES?.CONNECTING;
            if (connecting) return { label: 'Connecting…', status: 'connecting' };
            return { label: 'Disconnected', status: 'disconnected' };
        },

        formatClock(seconds) {
            if (!Number.isFinite(seconds)) return '--:--';
            const safe = Math.max(0, seconds);
            return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
        },

        escapeHtml(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => SpectatorTVSection.init());
    } else {
        SpectatorTVSection.init();
    }

    if (window.CaissaNavigation) {
        window.CaissaNavigation.registerSection('spectator', SpectatorTVSection);
    }

    window.CaissaSpectatorTVSection = SpectatorTVSection;
})();
