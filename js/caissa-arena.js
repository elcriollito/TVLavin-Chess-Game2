/**
 * CAISSA Arena Module
 *
 * Engine vs Engine battles and tournaments
 * Supports multiple engines with scalable architecture
 */

console.log('[Arena] caissa-arena.js parsed OK / loaded OK v=20260203-fix2');

const ARENA_ENGINE_MOVETIME_MS = 2000;
const ARENA_ENGINE_TIMEOUT_MS = 12000;
const ARENA_REVIEW_PLAYBACK_MS = 850;

const CaissaArena = {
    // ===== ENGINE REGISTRY =====
    engines: [],

    // ===== BOARD INSTANCE =====
    board: null,
    game: null,
    setupBoardInstance: null,
    manualSetupIgnoreClick: false,
    manualSetupScrollSnapshot: null,

    // ===== ENGINE INSTANCES =====
    // ArenaRuntimeManager is the sole owner; these getters preserve the
    // certified Arena-facing API without duplicating worker references.
    runtimeManager: null,
    reviewTimer: null,
    reviewMarkerVersion: 0,
    get whiteEngineInstance() { return this.runtimeManager?.getInstance('white') || null; },
    get blackEngineInstance() { return this.runtimeManager?.getInstance('black') || null; },
    get evaluatorEngine() { return this.runtimeManager?.getInstance('evaluator') || null; },
    enginesReady: false,
    evaluatorReady: false,

    // ===== STATE =====
    state: {
        mode: 'match', // Active competition type: 'match' or 'tournament'
        activeTab: 'game', // Presentation only; never controls worker or match lifecycle
        matchState: 'idle', // 'idle', 'running', 'paused', 'finished'
        whiteEngine: null, // Engine config (from registry)
        blackEngine: null, // Engine config (from registry)
        moveDelay: 150,
        bookMaxPlies: 12,
        currentGame: null,
        evalHistory: [], // For graph: [{move: 1, eval: 0.3}, ...]
        customStartFen: '',
        analysisRunning: false,
        analysisFen: '',
        setupPiece: 'move',
        setupSelectedSquare: null,
        review: {
            cursor: null,
            playing: false,
            displayFen: ''
        },
        boardMounted: false,
        hasEntered: false,
        loopActive: false, // Is engine loop running
        startToken: 0,
        searchToken: 0,
        loopRunning: false,
        cancelPendingSearch: null,
        tournament: {
            engines: [],
            format: 'round-robin',
            rounds: 3,
            openingMode: 'free',
            standings: [],
            currentRound: 0,
            games: []
        }
    },

    // ===== DOM ELEMENTS =====
    elements: {},

    // ===== INITIALIZATION =====
    init() {
        console.log('[Arena] Initializing...');
        const registry = this.ensureEngineRegistry();
        console.log('[Arena] engine registry source =', registry.source);
        console.log('[Arena] engines found =', registry.engines.length);
        if (typeof window.ArenaRuntimeManager !== 'function') {
            throw new Error('ArenaRuntimeManager is required before Arena initialization.');
        }
        this.runtimeManager = new ArenaRuntimeManager({
            registry: window.EngineRegistry,
            onFailure: failure => this.onRuntimeFailure(failure)
        });
        this.state.engineBinaryAvailable = typeof EngineAdapter !== 'undefined';
        if (!this.state.engineBinaryAvailable) {
            console.warn('[Arena] EngineAdapter class not found at init - engine adapter missing?');
        }
        this.cacheElements();
        this.bindEvents();
        this.switchTab(this.state.activeTab, { focus: false });
        if (this.elements.moveDelayInput) {
            this.elements.moveDelayInput.value = String(this.state.moveDelay);
        }
        this.renderEngineSelectors();
        this.renderTournamentEngineList();
        this.updateTournamentUI();
        this.initEvalGraph();
        this.initGame();
        requestAnimationFrame(() => {
            const arenaSection = document.getElementById('arenaSection');
            if (arenaSection?.classList.contains('active') && !this.state.hasEntered) {
                this.onEnter();
            }
        });
        console.log('[Arena] Ready with', this.engines.length, 'engines');
    },

    /**
     * Initialize chess.js game instance for Arena
     */
    initGame() {
        // Create a new chess.js instance for Arena
        if (typeof Chess !== 'undefined') {
            this.game = new Chess();
            this.resetReviewState();
            console.log('[Arena] Game instance created');
        } else {
            console.warn('[Arena] Chess.js not loaded yet');
        }
    },

    cacheElements() {
        this.elements = {
            // Tabs
            tabMatch: document.getElementById('arenaTabMatch'),
            tabTournament: document.getElementById('arenaTabTournament'),
            tabGame: document.getElementById('arenaTabGame'),
            panelMatch: document.getElementById('arenaPanelMatch'),
            panelTournament: document.getElementById('arenaPanelTournament'),
            panelGame: document.getElementById('arenaPanelGame'),

            // Engine selectors
            whiteEngineSelect: document.getElementById('arenaWhiteEngine'),
            blackEngineSelect: document.getElementById('arenaBlackEngine'),
            swapEnginesBtn: document.getElementById('arenaSwapEngines'),

            // Match controls
            moveDelayInput: document.getElementById('arenaMoveDelay'),
            startMatchBtn: document.getElementById('arenaStartMatch'),
            pauseMatchBtn: document.getElementById('arenaPauseMatch'),
            stopMatchBtn: document.getElementById('arenaStopMatch'),
            declareDrawBtn: document.getElementById('arenaDeclareDraw'),
            infiniteAnalysisBtn: document.getElementById('arenaInfiniteAnalysis'),
            setPositionBtn: document.getElementById('arenaSetPositionBtn'),
            manualSetupBtn: document.getElementById('arenaManualSetupBtn'),
            positionPanel: document.getElementById('arenaPositionPanel'),
            fenInput: document.getElementById('arenaFenInput'),
            applyFenBtn: document.getElementById('arenaApplyFen'),
            useStartPositionBtn: document.getElementById('arenaUseStartPosition'),
            fenMessage: document.getElementById('arenaFenMessage'),
            setupModal: document.getElementById('arenaSetupModal'),
            setupCloseBtn: document.getElementById('arenaSetupClose'),
            setupBoard: document.getElementById('arenaSetupBoard'),
            setupEditorTools: document.getElementById('arenaSetupEditorTools'),
            setupPalette: document.getElementById('arenaSetupPalette'),
            setupTurn: document.getElementById('arenaSetupTurn'),
            setupCastleWK: document.getElementById('arenaSetupCastleWK'),
            setupCastleWQ: document.getElementById('arenaSetupCastleWQ'),
            setupCastleBK: document.getElementById('arenaSetupCastleBK'),
            setupCastleBQ: document.getElementById('arenaSetupCastleBQ'),
            setupClearBtn: document.getElementById('arenaSetupClear'),
            setupResetBtn: document.getElementById('arenaSetupReset'),
            setupApplyBtn: document.getElementById('arenaSetupApply'),
            setupMessage: document.getElementById('arenaSetupMessage'),
            drawModal: document.getElementById('arenaDrawModal'),
            drawCancelBtn: document.getElementById('arenaDrawCancel'),
            drawConfirmBtn: document.getElementById('arenaDrawConfirm'),

            // Game status
            statusWhiteName: document.getElementById('arenaStatusWhite'),
            statusBlackName: document.getElementById('arenaStatusBlack'),
            turnStatus: document.getElementById('arenaTurnStatus'),
            statusTurn: document.getElementById('arenaStatusTurn'),
            statusMoves: document.getElementById('arenaStatusMoves'),
            statusText: document.getElementById('arenaStatusText'),
            boardStatus: document.querySelector('#arenaSection .arena-board-status'),

            // Evaluation panel
            evalEngineName: document.getElementById('arenaEvalEngine'),
            evalScore: document.getElementById('arenaEvalScore'),
            evalDepth: document.getElementById('arenaEvalDepth'),
            evalNodes: document.getElementById('arenaEvalNodes'),
            evalPV: document.getElementById('arenaEvalPV'),

            // Eval graph canvas
            evalGraph: document.getElementById('arenaEvalGraph'),
            graphPanel: document.getElementById('arenaGraphPanel'),

            // Visual game review (presentation only)
            movesPanel: document.getElementById('arenaMovesPanel'),
            reviewControls: document.getElementById('arenaReviewControls'),
            reviewFirstBtn: document.getElementById('arenaReviewFirst'),
            reviewPreviousBtn: document.getElementById('arenaReviewPrevious'),
            reviewPlayBtn: document.getElementById('arenaReviewPlay'),
            reviewNextBtn: document.getElementById('arenaReviewNext'),
            reviewLastBtn: document.getElementById('arenaReviewLast'),
            reviewLiveBtn: document.getElementById('arenaReviewLive'),
            reviewStatus: document.getElementById('arenaReviewStatus'),

            // Tournament
            tournamentEngineList: document.getElementById('arenaTournamentEngines'),
            tournamentRounds: document.getElementById('arenaTournamentRounds'),
            tournamentOpening: document.getElementById('arenaTournamentOpening'),
            startTournamentBtn: document.getElementById('arenaStartTournament'),
            tournamentStandings: document.getElementById('arenaTournamentStandings'),
            tournamentProgress: document.getElementById('arenaTournamentProgress'),

            // Board mount
            boardMount: document.getElementById('arenaBoardMount'),
            moveHistory: document.getElementById('arenaMoveHistory')
        };
    },

    getEngineRegistry() {
        if (window.EngineRegistry && typeof EngineRegistry.listArenaProviders === 'function') {
            return { engines: EngineRegistry.listArenaProviders(), source: 'EngineRegistry.listArenaProviders' };
        }
        return { engines: [], source: 'none' };
    },

    ensureEngineRegistry() {
        const registry = this.getEngineRegistry();
        const engines = Array.isArray(registry.engines) ? registry.engines : [];
        const source = registry.source;

        this.engines = engines.map((engine, index) => ({
            id: engine.id,
            providerId: engine.providerId || engine.id,
            displayName: engine.displayName || engine.name,
            name: engine.displayName || engine.name,
            family: engine.family,
            version: engine.version,
            protocol: engine.protocol,
            runtimeType: engine.runtimeType,
            runtimeId: engine.runtimeId,
            profile: engine.profile || null,
            capabilities: engine.capabilities || {},
            runtimeIdentityExpectation: engine.runtimeIdentityExpectation || null,
            tier: engine.tier || (index === 0 ? 'A' : 'B'),
            description: engine.description || (engine.id === 'stockfish' ? 'World champion engine' : 'Training mode'),
            elo: engine.elo || (engine.id === 'stockfish' ? 3600 : 2800),
            workerPath: engine.workerPath,
            wasmPath: engine.wasmPath || '',
            options: engine.options || { depth: engine.defaultDepth || 15 },
            enabled: engine.enabled !== false,
            availability: engine.availability,
            unavailableReason: engine.unavailableReason || null,
            reason: engine.unavailableReason || engine.reason || engine.notes || ''
        }));
        this.state.enginesAvailable = engines.length > 0;

        return { engines: this.engines, source };
    },

    // Stable board geometry follows the same snapshot/unchanged-guard pattern
    // used by the certified Play shell. Content updates never own board size.
    resizeObserver: null,
    boardResizeFrame: null,
    boardResizeForce: false,
    boardResizeReason: 'layout',
    boardLayout: null,
    boardViewportHandler: null,
    boardOrientationHandler: null,

    /**
     * Mount the chessboard in Arena
     */
    mountBoard() {
        const container = this.elements.boardMount;
        if (!container) {
            console.error('[Arena] Board mount container not found');
            return;
        }

        // Reuse main board if available to avoid duplicate boards
        if (window.App && App.board && document.getElementById('chessboard')) {
            console.log('[Arena] Reusing main board instance');
            const boardEl = document.getElementById('chessboard');
            if (boardEl.parentElement !== container) {
                container.innerHTML = '';
                container.appendChild(boardEl);
            }
            this.board = App.board;
            this.state.boardMounted = true;
            this.setupResizeObserver();
            this.requestBoardResize('shared-board-mounted', true);
            this.enableMatchControls();
            return;
        }

        // Check if board is already mounted and valid
        if (this.board && this.state.boardMounted) {
            console.log('[Arena] Board already mounted, restoring stable sizing...');
            this.setupResizeObserver();
            this.requestBoardResize('section-enter', true);
            return;
        }

        // If board exists but not mounted properly, destroy it first
        if (this.board) {
            console.log('[Arena] Cleaning up incomplete board...');
            this.board.destroy();
            this.board = null;
        }

        // Ensure Chess.js is available
        if (!this.game && typeof Chess !== 'undefined') {
            this.game = new Chess();
        }

        // Check if Chessboard is available
        if (typeof Chessboard === 'undefined') {
            console.error('[Arena] Chessboard.js not loaded');
            return;
        }

        // Clear container completely and create fresh board element
        container.innerHTML = '';
        const boardElement = document.createElement('div');
        boardElement.id = 'arenaBoardElement';
        boardElement.className = 'arena-board';
        container.appendChild(boardElement);

        // Wait for container to have dimensions
        const checkAndMount = () => {
            const rect = container.getBoundingClientRect();

            if (rect.width < 48) {
                // Container is not laid out yet. Short landscape viewports can
                // legitimately produce a compact board below 100px.
                setTimeout(checkAndMount, 50);
                return;
            }

            // Board configuration
            const config = {
                draggable: false, // Arena boards are view-only (engine plays)
                position: this.getBoardPlacement(this.game?.fen()),
                pieceTheme: 'img/chesspieces/wikipedia/{piece}.png',
                showNotation: true,
                orientation: 'white'
            };

            try {
                this.board = Chessboard('arenaBoardElement', config);
                this.state.boardMounted = true;
                console.log('[Arena] Board mounted successfully, container:', rect.width, 'x', rect.height);

                // Set up ResizeObserver for dynamic sizing
                this.setupResizeObserver();
                this.settleLayout();

                // Enable controls after the mounted board has settled.
                setTimeout(() => {
                    if (this.board) {
                        console.log('[Arena] Board resize complete');

                        // Enable Start Match button now that board is ready
                        this.enableMatchControls();
                    }
                }, 300);

            } catch (err) {
                console.error('[Arena] Failed to mount board:', err);
            }
        };

        // Start mounting process
        setTimeout(checkAndMount, 50);
    },

    /**
     * Observe only the stable board-container width. The board's own height is
     * deliberately ignored so applying a square size cannot feed the observer
     * back into another measure -> resize cycle.
     */
    setupResizeObserver() {
        this.teardownBoardSizing();

        const boardContainer = document.querySelector('.arena-board-container');
        if (!boardContainer || !this.elements.boardMount) return;

        if (typeof ResizeObserver !== 'undefined') {
            let observedWidth = 0;
            this.resizeObserver = new ResizeObserver((entries) => {
                const width = entries[0]?.contentRect?.width || 0;
                if (!width || Math.abs(width - observedWidth) < 0.5) return;
                observedWidth = width;
                this.requestBoardResize('container-width');
            });
            this.resizeObserver.observe(boardContainer);
        }

        this.boardViewportHandler = () => this.requestBoardResize('viewport');
        this.boardOrientationHandler = () => this.requestBoardResize('orientation', true);
        window.addEventListener('resize', this.boardViewportHandler, { passive: true });
        window.addEventListener('orientationchange', this.boardOrientationHandler, { passive: true });
        window.visualViewport?.addEventListener('resize', this.boardViewportHandler, { passive: true });
        this.requestBoardResize('setup', true);
        console.log('[Arena] Stable board sizing active');
    },

    calculateBoardSize(boardContainer) {
        if (!boardContainer) return 0;

        const containerStyle = getComputedStyle(boardContainer);
        const horizontalPadding = parseFloat(containerStyle.paddingLeft || 0)
            + parseFloat(containerStyle.paddingRight || 0);
        // clientWidth excludes borders and includes padding, yielding the true
        // content box after padding is removed. Using the border box here made
        // mobile mounts two pixels taller than they were wide.
        const availableWidth = Math.max(0, boardContainer.clientWidth - horizontalPadding);

        const arenaSection = document.getElementById('arenaSection');
        const layout = arenaSection?.querySelector('.arena-layout-v2');
        const containerRect = boardContainer.getBoundingClientRect();
        const sectionRect = arenaSection?.getBoundingClientRect();
        const bottomBar = document.querySelector('#arenaSection .arena-player-bar-bottom');
        const bottomBarHeight = bottomBar?.getBoundingClientRect().height || 56;
        const sectionWidth = arenaSection?.clientWidth || window.innerWidth;
        const measuredSectionHeight = arenaSection?.clientHeight || window.innerHeight;
        const orientation = sectionWidth >= measuredSectionHeight ? 'landscape' : 'portrait';
        const mobileLayout = window.matchMedia('(max-width: 1050px)').matches;
        const previous = this.boardLayout;
        const widthChanged = !previous || Math.abs(sectionWidth - previous.sectionWidth) >= 1;
        const orientationChanged = !previous || orientation !== previous.orientation;
        // Mobile browser chrome produces height-only visual viewport events.
        // Retain the section-height snapshot until width/orientation changes so
        // active games do not breathe as the address bar appears or disappears.
        const sectionHeight = mobileLayout && previous && !widthChanged && !orientationChanged
            ? previous.sectionHeight
            : measuredSectionHeight;
        const layoutTop = layout?.getBoundingClientRect().top ?? sectionRect?.top ?? 0;
        const boardTopInLayout = containerRect.top - layoutTop;
        const availableHeight = Math.max(0, sectionHeight - boardTopInLayout - bottomBarHeight - 28);

        const arenaMax = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--arena-board-max')) || 760;
        const boardSize = Math.min(arenaMax, availableWidth, availableHeight);

        this.boardLayout = {
            sectionWidth,
            sectionHeight,
            orientation,
            boardTopInLayout,
            availableWidth,
            availableHeight,
            size: Math.max(1, Math.floor(boardSize))
        };

        // Never enforce a minimum larger than the measured viewport room; that
        // would clip ranks/files in short mobile-landscape viewports.
        return this.boardLayout.size;
    },

    requestBoardResize(reason = 'layout', force = false) {
        this.boardResizeForce = this.boardResizeForce || force;
        this.boardResizeReason = reason;
        if (this.boardResizeFrame) cancelAnimationFrame(this.boardResizeFrame);
        this.boardResizeFrame = requestAnimationFrame(() => {
            this.boardResizeFrame = null;
            const pendingForce = this.boardResizeForce;
            const pendingReason = this.boardResizeReason;
            this.boardResizeForce = false;
            this.resizeBoardNow(pendingForce, pendingReason);
        });
    },

    resizeBoardNow(force = false, reason = 'layout') {
        const host = document.querySelector('#arenaSection .arena-board-zone');
        const boardContainer = document.querySelector('#arenaSection .arena-board-container');
        const boardMount = this.elements.boardMount;
        if (!host || !boardContainer || !boardMount) return;

        const hostRect = host.getBoundingClientRect();
        const hostWidth = hostRect.width;
        if (!hostWidth || hostWidth < 50) return;

        const boardSize = this.calculateBoardSize(boardContainer);
        const renderedSize = Number.parseFloat(boardMount.style.width) || 0;
        const sizeChanged = Math.abs(renderedSize - boardSize) >= 0.5;

        if (sizeChanged || force) {
            boardMount.style.width = `${boardSize}px`;
            boardMount.style.height = `${boardSize}px`;
            host.style.setProperty('--arena-rendered-board-size', `${boardSize}px`);
        }

        if (this.board && (sizeChanged || force)) {
            this.board.resize();
            console.log(`[Arena] Board geometry ${boardSize}px (${reason})`);
        }
        requestAnimationFrame(() => this.syncBoardAndGraphSize(boardSize));
    },

    syncBoardAndGraphSize(fallbackSize) {
        const { graphPanel, evalGraph } = this.elements;
        const boardElement = document.querySelector('#arenaSection .arena-board-container > #chessboard')
            || document.getElementById('arenaBoardElement')
            || this.elements.boardMount;
        const measuredWidth = Math.round(boardElement?.getBoundingClientRect().width || 0);
        const boardSize = measuredWidth || fallbackSize;
        if (!boardSize) return;

        if (!evalGraph) return;

        const graphWidth = graphPanel?.getBoundingClientRect().width || 0;
        if (!graphWidth) return;
        const canvasWidth = Math.max(256, Math.floor(graphWidth - 24));
        if (evalGraph.width !== canvasWidth) {
            evalGraph.width = canvasWidth;
            this.evalGraphCtx = evalGraph.getContext('2d');
            this.clearEvalGraph();
            this.updateEvalGraph();
        }
    },

    settleLayout() {
        this.requestBoardResize('layout-settle');

        if (document.fonts?.ready) {
            document.fonts.ready.then(() => {
                this.requestBoardResize('fonts-ready');
            });
        }
    },

    teardownBoardSizing() {
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        if (this.boardResizeFrame) cancelAnimationFrame(this.boardResizeFrame);
        this.boardResizeFrame = null;
        this.boardResizeForce = false;
        if (this.boardViewportHandler) {
            window.removeEventListener('resize', this.boardViewportHandler);
            window.visualViewport?.removeEventListener('resize', this.boardViewportHandler);
        }
        if (this.boardOrientationHandler) {
            window.removeEventListener('orientationchange', this.boardOrientationHandler);
        }
        this.boardViewportHandler = null;
        this.boardOrientationHandler = null;
    },

    bindEvents() {
        // Tab switching
        this.elements.tabMatch?.addEventListener('click', () => this.switchTab('match'));
        this.elements.tabTournament?.addEventListener('click', () => this.switchTab('tournament'));
        this.elements.tabGame?.addEventListener('click', () => this.switchTab('game'));
        [this.elements.tabMatch, this.elements.tabTournament, this.elements.tabGame]
            .filter(Boolean)
            .forEach((tab) => tab.addEventListener('keydown', (event) => this.onTabKeydown(event)));

        // Engine selection
        this.elements.whiteEngineSelect?.addEventListener('change', (e) => {
            this.selectEngine('white', e.target.value);
            this.prewarmEngines();
        });
        this.elements.blackEngineSelect?.addEventListener('change', (e) => {
            this.selectEngine('black', e.target.value);
            this.prewarmEngines();
        });
        this.elements.swapEnginesBtn?.addEventListener('click', () => this.swapEngines());

        // Match controls
        this.elements.moveDelayInput?.addEventListener('change', (e) => {
            this.state.moveDelay = parseInt(e.target.value) || 150;
        });
        this.elements.startMatchBtn?.addEventListener('click', () => this.startMatch());
        this.elements.pauseMatchBtn?.addEventListener('click', () => this.togglePause());
        this.elements.stopMatchBtn?.addEventListener('click', () => this.stopMatch());
        this.elements.declareDrawBtn?.addEventListener('click', () => this.openDrawConfirmation());
        this.elements.infiniteAnalysisBtn?.addEventListener('click', () => this.toggleInfiniteAnalysis());
        this.elements.setPositionBtn?.addEventListener('click', () => this.togglePositionPanel());
        this.elements.manualSetupBtn?.addEventListener('click', () => this.openManualSetup());
        this.elements.applyFenBtn?.addEventListener('click', () => this.applyCustomPosition());
        this.elements.useStartPositionBtn?.addEventListener('click', () => this.useInitialPosition());
        this.elements.setupCloseBtn?.addEventListener('click', () => this.closeManualSetup());
        this.elements.setupClearBtn?.addEventListener('click', () => this.clearManualSetup());
        this.elements.setupResetBtn?.addEventListener('click', () => this.resetManualSetup());
        this.elements.setupApplyBtn?.addEventListener('click', () => this.applyManualSetup());
        this.elements.setupBoard?.addEventListener('click', (event) => this.onManualSetupSquareClick(event));
        this.elements.setupBoard?.addEventListener('keydown', (event) => this.onManualSetupSquareKeydown(event));
        this.elements.drawCancelBtn?.addEventListener('click', () => this.closeDrawConfirmation());
        this.elements.drawConfirmBtn?.addEventListener('click', () => this.adjudicateTournamentDraw());
        this.elements.drawModal?.addEventListener('click', (event) => {
            if (event.target === this.elements.drawModal) this.closeDrawConfirmation();
        });
        document.addEventListener('keydown', (event) => this.onDrawDialogKeydown(event));

        // Historical review controls never call the live Chess instance's mutation API.
        this.elements.reviewFirstBtn?.addEventListener('click', () => this.showReviewPosition(0));
        this.elements.reviewPreviousBtn?.addEventListener('click', () => this.reviewPrevious());
        this.elements.reviewPlayBtn?.addEventListener('click', () => this.toggleReviewPlayback());
        this.elements.reviewNextBtn?.addEventListener('click', () => this.reviewNext());
        this.elements.reviewLastBtn?.addEventListener('click', () => this.showReviewPosition(this.getReviewMoveCount()));
        this.elements.reviewLiveBtn?.addEventListener('click', () => this.returnToLivePosition());
        this.elements.moveHistory?.addEventListener('click', (event) => {
            const move = event.target.closest('[data-review-ply]');
            if (move) this.showReviewPosition(Number(move.dataset.reviewPly));
        });
        this.elements.movesPanel?.addEventListener('keydown', (event) => this.onReviewKeydown(event));

        // Tournament controls
        this.elements.startTournamentBtn?.addEventListener('click', () => this.startTournament());
        this.elements.tournamentEngineList?.addEventListener('change', () => this.updateTournamentUI());

        // Listen for engine moves
        window.addEventListener('caissa-engine-move', (e) => this.onEngineMove(e.detail));
        window.addEventListener('caissa-analysis-update', (e) => this.updateEvalPanel(e.detail));
        window.addEventListener('caissa-arena-provider-availability', () => this.refreshEngineAvailabilityUI());
    },

    // ===== TAB SWITCHING =====
    switchTab(tab, options = {}) {
        if (!['match', 'tournament', 'game'].includes(tab)) return;
        this.state.activeTab = tab;

        const tabs = {
            match: this.elements.tabMatch,
            tournament: this.elements.tabTournament,
            game: this.elements.tabGame
        };
        const panels = {
            match: this.elements.panelMatch,
            tournament: this.elements.panelTournament,
            game: this.elements.panelGame
        };

        Object.entries(tabs).forEach(([name, element]) => {
            const isActive = name === tab;
            element?.classList.toggle('active', isActive);
            element?.setAttribute('aria-selected', String(isActive));
            element?.setAttribute('tabindex', isActive ? '0' : '-1');
        });
        Object.entries(panels).forEach(([name, element]) => {
            const isActive = name === tab;
            if (element) element.hidden = !isActive;
            element?.classList.toggle('active', isActive);
        });

        if (options.focus !== false) tabs[tab]?.focus();
        if (tab === 'game') {
            this.renderMoveHistory();
            requestAnimationFrame(() => this.syncBoardAndGraphSize());
        }
    },

    onTabKeydown(event) {
        const tabs = ['match', 'tournament', 'game'];
        const currentIndex = tabs.indexOf(this.state.activeTab);
        let nextIndex = currentIndex;

        if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        else if (event.key === 'Home') nextIndex = 0;
        else if (event.key === 'End') nextIndex = tabs.length - 1;
        else return;

        event.preventDefault();
        this.switchTab(tabs[nextIndex]);
    },

    togglePositionPanel() {
        const panel = this.elements.positionPanel;
        if (!panel) return;

        panel.hidden = !panel.hidden;
        if (!panel.hidden && this.elements.fenInput) {
            this.elements.fenInput.value = this.state.customStartFen || this.game?.fen() || '';
            this.elements.fenInput.focus();
        }
    },

    applyCustomPosition() {
        const fen = this.elements.fenInput?.value.trim();
        if (!fen || typeof Chess === 'undefined') {
            this.setFenMessage('Enter a valid FEN position.', true);
            return false;
        }

        if (!this.applyArenaPosition(fen, 'Custom position')) {
            this.setFenMessage('FEN could not be loaded. Check the position and try again.', true);
            return false;
        }
        return true;
    },

    useInitialPosition() {
        if (this.state.matchState === 'running' || this.state.matchState === 'paused') {
            this.stopMatch();
        }
        this.stopInfiniteAnalysis(false);
        this.state.matchState = 'idle';
        this.state.customStartFen = '';
        this.resetBoard();
        this.updateMatchControls();
        if (this.elements.fenInput) {
            this.elements.fenInput.value = this.game?.fen() || '';
        }
        this.setFenMessage('Initial position ready.');
        this.updateGameStatus({ result: 'Ready: Initial position' });
    },

    applyArenaPosition(fen, label = 'Custom position') {
        if (typeof Chess === 'undefined') return false;
        let normalizedFen = '';
        try {
            const candidate = new Chess();
            if (candidate.load(String(fen || '').trim()) === false) return false;
            normalizedFen = candidate.fen();
        } catch (error) {
            return false;
        }

        if (this.state.matchState === 'running' || this.state.matchState === 'paused') {
            this.stopMatch();
        }
        this.stopInfiniteAnalysis(false);

        this.state.matchState = 'idle';
        this.state.customStartFen = normalizedFen;
        this.resetBoard();
        this.updateBoardPosition(normalizedFen);
        this.updateMatchControls();

        const side = this.game?.turn() === 'b' ? 'Black' : 'White';
        if (this.elements.fenInput) {
            this.elements.fenInput.value = normalizedFen;
        }
        this.setFenMessage(`${label} ready. ${side} to move.`);
        this.updateGameStatus({ result: `Ready: ${label} (${side} to move)` });
        requestAnimationFrame(() => {
            this.board?.resize?.();
            this.syncBoardAndGraphSize();
        });
        return true;
    },

    setFenMessage(message, isError = false) {
        if (!this.elements.fenMessage) return;
        this.elements.fenMessage.textContent = message;
        this.elements.fenMessage.classList.toggle('error', isError);
    },

    openManualSetup() {
        if (!this.elements.setupModal || typeof Chessboard === 'undefined') return;
        this.renderSetupPalette();
        this.selectSetupPiece('move');
        this.setSetupMessage('Move pieces by dragging, or select a piece and then its destination.');
        const arenaSection = document.getElementById('arenaSection');
        this.manualSetupScrollSnapshot = {
            windowX: window.scrollX,
            windowY: window.scrollY,
            sectionLeft: arenaSection?.scrollLeft || 0,
            sectionTop: arenaSection?.scrollTop || 0
        };
        this.elements.setupModal.classList.add('show');
        this.elements.setupModal.setAttribute('aria-hidden', 'false');

        const fen = this.game?.fen() || this.state.customStartFen || 'start';
        const position = fen === 'start' ? 'start' : fen.split(' ')[0];
        if (!this.setupBoardInstance) {
            this.setupBoardInstance = Chessboard('arenaSetupBoard', {
                draggable: true,
                dropOffBoard: 'snapback',
                position,
                pieceTheme: 'img/chesspieces/wikipedia/{piece}.png',
                showNotation: true,
                onDragStart: (source) => this.onManualSetupDragStart(source),
                onDrop: (source, target) => this.onManualSetupDrop(source, target),
                onSnapEnd: () => this.refreshManualSetupSquares()
            });
        } else {
            this.setupBoardInstance.position(position, false);
        }
        this.loadSetupOptionsFromFen(fen);
        requestAnimationFrame(() => {
            this.setupBoardInstance?.resize?.();
            this.refreshManualSetupSquares();
        });
    },

    closeManualSetup() {
        this.elements.setupModal?.classList.remove('show');
        this.elements.setupModal?.setAttribute('aria-hidden', 'true');
        this.state.setupSelectedSquare = null;
        const restoreScroll = () => {
            const snapshot = this.manualSetupScrollSnapshot;
            if (!snapshot) return;
            window.scrollTo(snapshot.windowX, snapshot.windowY);
            const arenaSection = document.getElementById('arenaSection');
            if (arenaSection) {
                arenaSection.scrollLeft = snapshot.sectionLeft;
                arenaSection.scrollTop = snapshot.sectionTop;
            }
        };
        restoreScroll();
        requestAnimationFrame(restoreScroll);
    },

    isActiveTournamentGame() {
        if (this.state.mode !== 'tournament' || this.state.matchState !== 'running') return false;
        const pendingGame = this.state.tournament.games.find(game => game.result === null);
        return !!pendingGame
            && pendingGame.white.id === this.state.currentGame?.white?.id
            && pendingGame.black.id === this.state.currentGame?.black?.id;
    },

    openDrawConfirmation() {
        if (!this.isActiveTournamentGame() || !this.elements.drawModal) return;
        this._drawDialogReturnFocus = document.activeElement;
        this.elements.drawModal.classList.add('show');
        this.elements.drawModal.setAttribute('aria-hidden', 'false');
        requestAnimationFrame(() => this.elements.drawCancelBtn?.focus());
    },

    closeDrawConfirmation({ restoreFocus = true } = {}) {
        if (!this.elements.drawModal) return;
        this.elements.drawModal.classList.remove('show');
        this.elements.drawModal.setAttribute('aria-hidden', 'true');
        if (restoreFocus && this._drawDialogReturnFocus?.focus) {
            this._drawDialogReturnFocus.focus();
        }
        this._drawDialogReturnFocus = null;
    },

    onDrawDialogKeydown(event) {
        if (!this.elements.drawModal?.classList.contains('show')) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            this.closeDrawConfirmation();
            return;
        }
        if (event.key !== 'Tab') return;
        const controls = [this.elements.drawCancelBtn, this.elements.drawConfirmBtn].filter(Boolean);
        if (controls.length < 2) return;
        const currentIndex = controls.indexOf(document.activeElement);
        const nextIndex = event.shiftKey
            ? (currentIndex <= 0 ? controls.length - 1 : currentIndex - 1)
            : (currentIndex === controls.length - 1 ? 0 : currentIndex + 1);
        event.preventDefault();
        controls[nextIndex].focus();
    },

    renderSetupPalette() {
        if (!this.elements.setupEditorTools || !this.elements.setupPalette) return;
        if (this.elements.setupEditorTools.children.length || this.elements.setupPalette.children.length) return;
        const move = document.createElement('button');
        move.type = 'button';
        move.className = 'arena-setup-piece arena-setup-editor-tool active';
        move.dataset.piece = 'move';
        move.title = 'Move existing piece';
        move.setAttribute('aria-label', 'Move existing piece');
        move.innerHTML = '<i class="fas fa-hand" aria-hidden="true"></i><span>Move</span>';
        move.addEventListener('click', () => this.selectSetupPiece('move'));
        this.elements.setupEditorTools.appendChild(move);

        const groups = [
            { color: 'white', label: 'White pieces', pieces: ['wP', 'wN', 'wB', 'wR', 'wQ', 'wK'] },
            { color: 'black', label: 'Black pieces', pieces: ['bP', 'bN', 'bB', 'bR', 'bQ', 'bK'] }
        ];
        groups.forEach(({ color, label, pieces }) => {
            const group = document.createElement('section');
            group.className = 'arena-setup-piece-group';
            group.dataset.color = color;
            group.setAttribute('aria-label', label);
            const heading = document.createElement('h3');
            heading.className = 'arena-setup-group-label';
            heading.textContent = label;
            const row = document.createElement('div');
            row.className = 'arena-setup-piece-row';
            pieces.forEach((piece) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'arena-setup-piece arena-setup-piece-selector';
                button.dataset.piece = piece;
                const pieceLabel = this.getSetupPieceLabel(piece);
                button.title = pieceLabel;
                button.setAttribute('aria-label', `Add ${pieceLabel}`);
                button.innerHTML = `<img src="img/chesspieces/wikipedia/${piece}.png" alt="">`;
                button.addEventListener('click', () => this.selectSetupPiece(piece));
                row.appendChild(button);
            });
            group.append(heading, row);
            this.elements.setupPalette.appendChild(group);
        });
        const erase = document.createElement('button');
        erase.type = 'button';
        erase.className = 'arena-setup-piece arena-setup-editor-tool';
        erase.dataset.piece = 'erase';
        erase.title = 'Erase piece';
        erase.setAttribute('aria-label', 'Erase piece');
        erase.innerHTML = '<i class="fas fa-eraser" aria-hidden="true"></i><span>Erase</span>';
        erase.addEventListener('click', () => this.selectSetupPiece('erase'));
        this.elements.setupEditorTools.appendChild(erase);
    },

    selectSetupPiece(piece) {
        this.state.setupPiece = piece;
        this.state.setupSelectedSquare = null;
        this.elements.setupModal?.querySelectorAll('.arena-setup-piece').forEach((button) => {
            button.classList.toggle('active', button.dataset.piece === piece);
            button.setAttribute('aria-pressed', String(button.dataset.piece === piece));
        });
        this.refreshManualSetupSquares();
    },

    onManualSetupSquareClick(event) {
        if (this.manualSetupIgnoreClick) return;
        const squareElement = event.target.closest('.square-55d63');
        if (!squareElement || !this.setupBoardInstance) return;
        this.activateManualSetupSquare(squareElement);
    },

    onManualSetupSquareKeydown(event) {
        if (!['Enter', ' '].includes(event.key)) return;
        const squareElement = event.target.closest('.square-55d63');
        if (!squareElement || !this.setupBoardInstance) return;
        event.preventDefault();
        this.activateManualSetupSquare(squareElement);
    },

    activateManualSetupSquare(squareElement) {
        const squareClass = Array.from(squareElement.classList).find((name) => /^square-[a-h][1-8]$/.test(name));
        if (!squareClass) return;

        const square = squareClass.replace('square-', '');
        const position = this.setupBoardInstance.position();
        if (this.state.setupPiece === 'move') {
            const source = this.state.setupSelectedSquare;
            if (!source) {
                if (!position[square]) {
                    this.setSetupMessage('Select an existing piece, then choose its destination.');
                    return;
                }
                this.state.setupSelectedSquare = square;
                this.setSetupMessage(`${this.getSetupPieceLabel(position[square])} on ${square} selected.`);
                this.refreshManualSetupSquares({ focusSquare: square });
                return;
            }
            if (source === square) {
                this.state.setupSelectedSquare = null;
                this.setSetupMessage('Piece selection cleared.');
                this.refreshManualSetupSquares({ focusSquare: square });
                return;
            }
            if (!position[source]) {
                this.state.setupSelectedSquare = null;
                this.refreshManualSetupSquares({ focusSquare: square });
                return;
            }
            const movedPiece = position[source];
            position[square] = movedPiece;
            delete position[source];
            this.state.setupSelectedSquare = null;
            this.setupBoardInstance.position(position, false);
            this.setSetupMessage(`${this.getSetupPieceLabel(movedPiece)} moved from ${source} to ${square}.`);
        } else if (this.state.setupPiece === 'erase') {
            delete position[square];
            this.setupBoardInstance.position(position, false);
            this.setSetupMessage(`Square ${square} cleared.`);
        } else {
            position[square] = this.state.setupPiece;
            this.setupBoardInstance.position(position, false);
            this.setSetupMessage(`${this.getSetupPieceLabel(this.state.setupPiece)} placed on ${square}.`);
        }
        requestAnimationFrame(() => this.refreshManualSetupSquares({ focusSquare: square }));
    },

    onManualSetupDragStart(source) {
        if (!/^[a-h][1-8]$/.test(source)) return false;
        const position = this.setupBoardInstance?.position?.() || {};
        if (!position[source]) return false;
        if (this.state.setupPiece !== 'move') return false;
        if (this.state.setupSelectedSquare && this.state.setupSelectedSquare !== source) return false;
        this.state.setupSelectedSquare = source;
        this.refreshManualSetupSquares();
        return true;
    },

    onManualSetupDrop(source, target) {
        if (!/^[a-h][1-8]$/.test(source) || !/^[a-h][1-8]$/.test(target)) return 'snapback';
        this.manualSetupIgnoreClick = true;
        if (source === target) {
            this.state.setupSelectedSquare = source;
            const piece = this.setupBoardInstance?.position?.()[source];
            this.setSetupMessage(`${this.getSetupPieceLabel(piece)} on ${source} selected.`);
        } else {
            this.state.setupSelectedSquare = null;
            this.setSetupMessage(`Piece moved from ${source} to ${target}.`);
        }
        setTimeout(() => {
            this.manualSetupIgnoreClick = false;
            this.refreshManualSetupSquares({ focusSquare: source === target ? source : target });
        }, 0);
        return undefined;
    },

    getSetupPieceLabel(piece) {
        const color = piece?.[0] === 'w' ? 'White' : 'Black';
        const names = { P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king' };
        return `${color} ${names[piece?.[1]] || 'piece'}`;
    },

    refreshManualSetupSquares({ focusSquare = '' } = {}) {
        if (!this.elements.setupBoard || !this.setupBoardInstance) return;
        const position = this.setupBoardInstance.position();
        this.elements.setupBoard.querySelectorAll('.square-55d63').forEach((squareElement) => {
            const squareClass = Array.from(squareElement.classList).find((name) => /^square-[a-h][1-8]$/.test(name));
            if (!squareClass) return;
            const square = squareClass.replace('square-', '');
            const selected = this.state.setupSelectedSquare === square;
            const piece = position[square];
            squareElement.tabIndex = 0;
            squareElement.setAttribute('role', 'button');
            squareElement.setAttribute('aria-pressed', String(selected));
            squareElement.setAttribute('aria-label', `${square}: ${piece ? this.getSetupPieceLabel(piece) : 'empty'}${selected ? ', selected for relocation' : ''}`);
            squareElement.classList.toggle('arena-setup-source-selected', selected);
            if (focusSquare === square && document.activeElement !== squareElement) {
                squareElement.focus({ preventScroll: true });
            }
        });
    },

    clearManualSetup() {
        this.state.setupSelectedSquare = null;
        this.setupBoardInstance?.position({}, false);
        this.setSetupMessage('Board cleared.');
        requestAnimationFrame(() => this.refreshManualSetupSquares());
    },

    resetManualSetup() {
        this.setupBoardInstance?.start?.(false);
        this.loadSetupOptionsFromFen(new Chess().fen());
        this.selectSetupPiece('move');
        this.setSetupMessage('Initial position restored. Move pieces by dragging or click-click relocation.');
        requestAnimationFrame(() => this.refreshManualSetupSquares());
    },

    setSetupMessage(message, isError = false) {
        if (!this.elements.setupMessage) return;
        this.elements.setupMessage.textContent = message;
        this.elements.setupMessage.classList.toggle('error', isError);
    },

    loadSetupOptionsFromFen(fen) {
        const parts = String(fen || '').split(' ');
        const turn = parts[1] || 'w';
        const castling = parts[2] || '-';
        if (this.elements.setupTurn) this.elements.setupTurn.value = turn;
        if (this.elements.setupCastleWK) this.elements.setupCastleWK.checked = castling.includes('K');
        if (this.elements.setupCastleWQ) this.elements.setupCastleWQ.checked = castling.includes('Q');
        if (this.elements.setupCastleBK) this.elements.setupCastleBK.checked = castling.includes('k');
        if (this.elements.setupCastleBQ) this.elements.setupCastleBQ.checked = castling.includes('q');
    },

    applyManualSetup() {
        try {
            const position = this.setupBoardInstance?.position();
            if (!position || typeof generateFENFromPosition !== 'function') {
                throw new Error('Board editor unavailable');
            }
            const turn = this.elements.setupTurn?.value || 'w';
            let castling = '';
            if (this.elements.setupCastleWK?.checked) castling += 'K';
            if (this.elements.setupCastleWQ?.checked) castling += 'Q';
            if (this.elements.setupCastleBK?.checked) castling += 'k';
            if (this.elements.setupCastleBQ?.checked) castling += 'q';
            const fen = `${generateFENFromPosition(position)} ${turn} ${castling || '-'} - 0 1`;
            const candidate = new Chess();
            if (candidate.load(fen) === false) throw new Error('Invalid position');

            this.applyArenaPosition(candidate.fen(), 'Manual position');
            this.closeManualSetup();
        } catch (error) {
            this.setSetupMessage('Invalid position. Place both kings before applying.', true);
        }
    },

    // ===== ENGINE MANAGEMENT =====
    renderEngineSelectors(attempt = 0) {
        const maxAttempts = 6;
        const registry = this.ensureEngineRegistry();
        console.log('[Arena] Populating engine selects...');
        console.log('[Arena] Engine registry source =', registry.source);
        console.log('[Arena] engine registry engines =', this.engines.map(e => e.id));
        console.log('[Arena] engine files exist?', this.engines.map(e => ({ id: e.id, hasPath: !!e.workerPath })));
        console.log('[Arena] Available engines:', this.engines.length);

        // CRITICAL: Verify elements exist before populating
        const whiteSelect = this.elements.whiteEngineSelect || document.getElementById('arenaWhiteEngine');
        const blackSelect = this.elements.blackEngineSelect || document.getElementById('arenaBlackEngine');

        console.log('[Arena] Found selects?', {
            white: !!whiteSelect,
            black: !!blackSelect,
            whiteId: whiteSelect?.id,
            blackId: blackSelect?.id
        });

        if (!whiteSelect || !blackSelect) {
            if (attempt >= maxAttempts) {
                console.error('[Arena] Engine select elements NOT FOUND after retries.');
                return;
            }

            console.warn(`[Arena] Engine select elements not ready (attempt ${attempt + 1}/${maxAttempts}). Retrying...`);

            // Retry on next animation frame (DOM might not be ready yet or section just became visible)
            requestAnimationFrame(() => {
                console.log('[Arena] Retry: Re-caching elements...');
                this.cacheElements();
                this.renderEngineSelectors(attempt + 1);
            });
            return;
        }

        // Update cache with found elements
        this.elements.whiteEngineSelect = whiteSelect;
        this.elements.blackEngineSelect = blackSelect;

        const createOptions = (selectElement, selectedId, label) => {
            if (!selectElement) {
                console.error(`[Arena] ${label} select element is null!`);
                return;
            }

            // Clear existing options
            selectElement.innerHTML = '';

            // Populate with engines
            this.engines.forEach(engine => {
                const option = document.createElement('option');
                option.value = engine.id;
                const availability = this.getEngineAvailability(engine);
                const disabledLabel = availability.available ? '' : ` (${availability.reason || 'Unavailable'})`;
                option.textContent = `${engine.name} (Tier ${engine.tier})${disabledLabel}`;
                if (!availability.available) {
                    option.disabled = true;
                }
                if (engine.id === selectedId) {
                    option.selected = true;
                }
                selectElement.appendChild(option);
            });

            console.log(`[Arena] ${label} populated with ${this.engines.length} engines`);
        };

        // Verify we have engines (ensureEngineRegistry already applied fallback)
        if (this.engines.length === 0) {
            console.error('[Arena] NO ENGINES AVAILABLE even after fallback!');
            if (this.elements.startMatchBtn) {
                this.elements.startMatchBtn.disabled = true;
            }
            this.updateGameStatus({ result: 'No engines are available. Check engine setup and try again.' });
        }

        // Default selections (prefer stored + enabled engines)
        const enabledEngines = this.getRunnableEngines();
        const savedWhiteId = window.localStorage?.getItem('caissa.arena.whiteEngineId') || '';
        const savedBlackId = window.localStorage?.getItem('caissa.arena.blackEngineId') || '';
        const currentWhite = this.engines.find(e => e.id === this.state.whiteEngine?.id);
        const currentBlack = this.engines.find(e => e.id === this.state.blackEngine?.id);
        this.state.whiteEngine = currentWhite
            || this.engines.find(e => e.id === savedWhiteId && this.isEngineRunnable(e))
            || enabledEngines[0]
            || this.engines[0];
        this.state.blackEngine = currentBlack
            || this.engines.find(e => e.id === savedBlackId && this.isEngineRunnable(e))
            || enabledEngines[1]
            || enabledEngines[0]
            || this.engines[0];

        console.log('[Arena] Default engines:', this.state.whiteEngine?.name, 'vs', this.state.blackEngine?.name);

        createOptions(whiteSelect, this.state.whiteEngine?.id, 'WHITE');
        createOptions(blackSelect, this.state.blackEngine?.id, 'BLACK');

        if (whiteSelect.options.length === 0 || blackSelect.options.length === 0) {
            console.error('[Arena] Engine selects populated with 0 options! Check DOM visibility/selector.');
        }

        this.updateEngineInfo();

        // Disable Start Match if engine adapter or worker paths are missing
        const adapterAvailable = typeof window.EngineRegistry?.createArenaEngine === 'function';
        const selectedEnginesValid = !!this.state.whiteEngine?.workerPath
            && !!this.state.blackEngine?.workerPath
            && this.isEngineRunnable(this.state.whiteEngine)
            && this.isEngineRunnable(this.state.blackEngine);
        this.state.engineBinaryAvailable = adapterAvailable && selectedEnginesValid;
        if (!this.state.engineBinaryAvailable) {
            if (this.elements.startMatchBtn) {
                this.elements.startMatchBtn.disabled = true;
                this.elements.startMatchBtn.title = 'Engine adapter or worker path missing.';
            }
            this.updateGameStatus({ result: 'Engine unavailable. Check engine setup and try again.' });
            console.warn('[Arena] Engine unavailable. Start Match disabled.');
        }

        console.log('[Arena] Engine selectors ready! Engines loaded:', this.engines.length);
    },

    selectEngine(color, engineId) {
        const engine = this.engines.find(e => e.id === engineId);
        if (!engine) return;
        if (!this.isEngineRunnable(engine)) {
            console.warn('[Arena] Engine not available yet:', engine.name);
            return;
        }

        if (color === 'white') {
            this.state.whiteEngine = engine;
            if (window.localStorage) {
                localStorage.setItem('caissa.arena.whiteEngineId', engine.id);
            }
        } else {
            this.state.blackEngine = engine;
            if (window.localStorage) {
                localStorage.setItem('caissa.arena.blackEngineId', engine.id);
            }
        }

        this.updateEngineInfo();
        // The isolated Lc0 participant must be opened by a visible user gesture.
        if (![this.state.whiteEngine, this.state.blackEngine].some(candidate =>
            candidate?.id === 'lc0-maia-1100-preview')) this.prewarmEngines();
        const adapterAvailable = typeof window.EngineRegistry?.createArenaEngine === 'function';
        const selectedEnginesValid = !!this.state.whiteEngine?.workerPath
            && !!this.state.blackEngine?.workerPath
            && this.isEngineRunnable(this.state.whiteEngine)
            && this.isEngineRunnable(this.state.blackEngine);
        if (this.elements.startMatchBtn) {
            this.elements.startMatchBtn.disabled = !(adapterAvailable && selectedEnginesValid);
        }
    },

    swapEngines() {
        const temp = this.state.whiteEngine;
        this.state.whiteEngine = this.state.blackEngine;
        this.state.blackEngine = temp;

        if (window.localStorage) {
            localStorage.setItem('caissa.arena.whiteEngineId', this.state.whiteEngine.id);
            localStorage.setItem('caissa.arena.blackEngineId', this.state.blackEngine.id);
        }

        // Update selectors
        if (this.elements.whiteEngineSelect) {
            this.elements.whiteEngineSelect.value = this.state.whiteEngine.id;
        }
        if (this.elements.blackEngineSelect) {
            this.elements.blackEngineSelect.value = this.state.blackEngine.id;
        }

        this.updateEngineInfo();
        if (![this.state.whiteEngine, this.state.blackEngine].some(candidate =>
            candidate?.id === 'lc0-maia-1100-preview')) this.prewarmEngines();
    },

    updateEngineInfo() {
        // Update status panel
        if (this.elements.statusWhiteName) {
            this.elements.statusWhiteName.textContent = this.state.whiteEngine?.name || 'Not selected';
        }
        if (this.elements.statusBlackName) {
            this.elements.statusBlackName.textContent = this.state.blackEngine?.name || 'Not selected';
        }
    },

    getEngineById(id) {
        return this.engines.find(e => e.id === id);
    },

    getEngineAvailability(engine) {
        if (!engine) return { available: false, reason: 'Unknown engine provider' };
        if (window.EngineRegistry?.getArenaProviderAvailability) {
            return EngineRegistry.getArenaProviderAvailability(engine.id);
        }
        return {
            available: engine.availability === 'available' && engine.enabled !== false && !!engine.workerPath,
            reason: engine.unavailableReason || engine.reason || 'Engine unavailable'
        };
    },

    isEngineRunnable(engine) {
        return !!engine && !!engine.workerPath && this.getEngineAvailability(engine).available;
    },

    getRunnableEngines() {
        return this.engines.filter(engine => this.isEngineRunnable(engine));
    },

    playerInstancesMatchSelections() {
        return this.runtimeMatchesProvider(this.whiteEngineInstance, this.state.whiteEngine)
            && this.runtimeMatchesProvider(this.blackEngineInstance, this.state.blackEngine);
    },

    runtimeMatchesProvider(instance, provider) {
        if (!instance || !provider || !instance.isReady?.()) return false;
        const runtime = instance.getRuntimeIdentity?.();
        return !!runtime
            && runtime.status === 'ready'
            && runtime.identityValidated === true
            && runtime.providerId === provider.id
            && runtime.requestedEngineId === provider.id
            && runtime.workerAsset === provider.workerPath;
    },

    inspectEngineDiagnostics() {
        const snapshot = (instance) => instance?.getRuntimeIdentity?.() || null;
        return Object.freeze({
            selectedProviders: Object.freeze({
                white: this.state.whiteEngine?.id || null,
                black: this.state.blackEngine?.id || null
            }),
            runtimes: Object.freeze({
                white: snapshot(this.whiteEngineInstance),
                black: snapshot(this.blackEngineInstance),
                evaluator: snapshot(this.evaluatorEngine)
            }),
            resources: this.runtimeManager?.getResourceSnapshot?.() || null,
            availability: Object.freeze(Object.fromEntries(this.engines.map(engine => [
                engine.id,
                Object.freeze({ ...this.getEngineAvailability(engine) })
            ])))
        });
    },

    onRuntimeFailure(failure) {
        if (failure?.role === 'evaluator') {
            this.evaluatorReady = false;
            this.state.analysisRunning = false;
            this.state.analysisFen = '';
        } else {
            this.enginesReady = false;
            if (['running', 'paused'].includes(this.state.matchState)) {
                this.handleError(`${failure?.role || 'participant'} engine failed`);
            }
        }
        this.refreshEngineAvailabilityUI();
    },

    refreshEngineAvailabilityUI() {
        const applySelectAvailability = (select) => {
            if (!select) return;
            Array.from(select.options).forEach((option) => {
                const provider = this.getEngineById(option.value);
                if (!provider) return;
                const availability = this.getEngineAvailability(provider);
                option.disabled = !availability.available;
                const suffix = availability.available ? '' : ` (${availability.reason || 'Unavailable'})`;
                option.textContent = `${provider.name} (Tier ${provider.tier})${suffix}`;
            });
        };
        applySelectAvailability(this.elements.whiteEngineSelect);
        applySelectAvailability(this.elements.blackEngineSelect);
        this.elements.tournamentEngineList?.querySelectorAll('input[type="checkbox"]').forEach((input) => {
            const provider = this.getEngineById(input.value);
            const availability = this.getEngineAvailability(provider);
            input.disabled = !availability.available;
            if (!availability.available) input.checked = false;
            const item = input.closest('.tournament-engine-item');
            item?.classList.toggle('is-unavailable', !availability.available);
            let message = item?.querySelector('.engine-availability');
            if (!message && item && !availability.available) {
                message = document.createElement('span');
                message.className = 'engine-availability';
                item.appendChild(message);
            }
            if (message) message.textContent = availability.reason || '';
        });
        const selectedAvailable = this.isEngineRunnable(this.state.whiteEngine)
            && this.isEngineRunnable(this.state.blackEngine);
        if (this.elements.startMatchBtn) this.elements.startMatchBtn.disabled = !selectedAvailable;
        if (!selectedAvailable) {
            this.enginesReady = false;
            this.updateGameStatus({ result: 'Selected engine unavailable. Choose another engine.' });
        }
        this.updateTournamentUI();
    },

    /**
     * Wait for board to be fully mounted with real dimensions
     * @param {Object} options - { timeoutMs: 2000, pollMs: 50 }
     * @returns {Promise<void>} - Resolves when board ready, rejects on timeout
     */
    async waitForBoardMounted(options = {}) {
        const { timeoutMs = 2000, pollMs = 50 } = options;
        const startTime = Date.now();

        return new Promise((resolve, reject) => {
            const checkBoard = () => {
                if ((!this.board || !this.state.boardMounted) && this.elements.boardMount) {
                    this.mountBoard();
                }
                // Check if board instance exists
                if (!this.board || !this.state.boardMounted) {
                    if (Date.now() - startTime > timeoutMs) {
                        reject(new Error('Board mount timeout - board instance not created'));
                        return;
                    }
                    setTimeout(checkBoard, pollMs);
                    return;
                }

                // Check if board container has real dimensions
                const container = this.elements.boardMount;
                if (!container) {
                    reject(new Error('Board container element not found'));
                    return;
                }

                const rect = container.getBoundingClientRect();
                if (rect.width <= 0 || rect.height <= 0) {
                    if (Date.now() - startTime > timeoutMs) {
                        reject(new Error(`Board mount timeout - container has no dimensions (${rect.width}x${rect.height})`));
                        return;
                    }
                    setTimeout(checkBoard, pollMs);
                    return;
                }

                // Board is ready!
                console.log('[Arena] Board ready:', rect.width, 'x', rect.height);
                resolve();
            };

            checkBoard();
        });
    },

    // ===== MATCH CONTROLS =====
    async startMatch(options = {}) {
        // Prevent double-start
        if (this.state.matchState === 'running') {
            console.warn('[Arena] Match already running');
            return;
        }

        if (!this.state.whiteEngine || !this.state.blackEngine) {
            alert('Select both engines before starting a match.');
            return;
        }

        const lc0 = 'lc0-maia-1100-preview';
        if (this.state.whiteEngine.id === lc0 && this.state.blackEngine.id === lc0) {
            this.updateGameStatus({ result: 'Choose one Lc0 participant and one other engine.' });
            return;
        }
        if ([this.state.whiteEngine, this.state.blackEngine].some(engine =>
            engine.id === lc0 && !window.CaissaArenaPreview?.enabled)) return;

        this.state.mode = options.competitionMode === 'tournament' ? 'tournament' : 'match';
        if (window.CaissaArenaPreview?.enabled)
            window.CaissaArenaPreview.matchStartAt = performance.now();
        const startToken = ++this.state.startToken;
        const startIsCurrent = () => startToken === this.state.startToken;
        const cancelStaleStart = () => {
            window.CaissaUI?.setButtonLoading(this.elements.startMatchBtn, false);
            return undefined;
        };

        window.CaissaUI?.setButtonLoading(this.elements.startMatchBtn, true, { label: 'Starting...' });
        this.stopInfiniteAnalysis(false);
        console.log('[Arena] Starting match:', this.state.whiteEngine.name, 'vs', this.state.blackEngine.name);

        // Wait for board to be mounted if not ready yet
        if (!this.board || !this.state.boardMounted) {
            console.log('[Arena] Waiting for board mount...');
            this.mountBoard();
            try {
                await this.waitForBoardMounted({ timeoutMs: 3000, pollMs: 50 });
                console.log('[Arena] Board ready, starting match');
            } catch (error) {
                console.error('[Arena] Board mount failed:', error.message);
                alert('The board could not load. Refresh and try again.');
                window.CaissaUI?.setButtonLoading(this.elements.startMatchBtn, false);
                return;
            }
        }
        if (!startIsCurrent()) return cancelStaleStart();

        // Let any selection-triggered prewarm converge before starting.
        if (this._prewarmPromise) await this._prewarmPromise;
        if (!startIsCurrent()) return cancelStaleStart();

        // Initialize engines if not ready
        if (!this.enginesReady || !this.playerInstancesMatchSelections()) {
            console.log('[Arena] Engines not ready, initializing...');
            const success = await this.initEngines();
            if (!startIsCurrent()) return cancelStaleStart();
            if (!success) {
                this.destroyEngines();
                const message = 'Selected engine could not verify its runtime identity and is unavailable for this session.';
                this.updateGameStatus({ result: message });
                alert(message);
                window.CaissaUI?.setButtonLoading(this.elements.startMatchBtn, false);
                return;
            }
        }

        // Reset game state
        this.resetBoard();
        this.cancelActiveSearch('match restart');
        this.state.loopRunning = false;
        this.runtimeManager.newGame('white');
        this.runtimeManager.newGame('black');
        this.runtimeManager.newGame('evaluator');
        try {
            await Promise.all([
                this.waitForEngineReadyOk(this.whiteEngineInstance, 'white'),
                this.waitForEngineReadyOk(this.blackEngineInstance, 'black'),
                this.waitForEngineReadyOk(this.evaluatorEngine, 'evaluator')
            ]);
            if (!startIsCurrent()) return cancelStaleStart();
            this.runtimeManager.markReady('white');
            this.runtimeManager.markReady('black');
            this.runtimeManager.markReady('evaluator');
            if (!this.playerInstancesMatchSelections()) {
                throw new Error('Selected engine identity changed before match start.');
            }
        } catch (error) {
            if (!startIsCurrent()) return cancelStaleStart();
            console.error('[Arena] Player engine readiness failed:', error);
            this.handleError(error.message);
            window.CaissaUI?.setButtonLoading(this.elements.startMatchBtn, false);
            return;
        }

        // Set match state
        this.state.matchState = 'running';
        this.state.loopActive = true;
        this.state.evalHistory = [];
        this.state.currentGame = {
            white: this.state.whiteEngine,
            black: this.state.blackEngine,
            moves: [],
            startFen: this.game.fen(),
            startTime: Date.now(),
            runtimeIdentities: Object.freeze({
                white: this.whiteEngineInstance.getRuntimeIdentity(),
                black: this.blackEngineInstance.getRuntimeIdentity()
            })
        };

        // Update UI
        window.CaissaUI?.setButtonLoading(this.elements.startMatchBtn, false);
        this.updateMatchControls();
        this.updateGameStatus({
            turn: this.game.turn() === 'w' ? 'white' : 'black',
            moveCount: 0
        });
        this.clearEvalGraph();
        this.evaluatePosition(this.game.fen());

        // Dispatch event for external listeners
        window.dispatchEvent(new CustomEvent('caissa-arena-start', {
            detail: {
                white: this.state.whiteEngine,
                black: this.state.blackEngine,
                runtimeIdentities: this.state.currentGame.runtimeIdentities,
                moveDelay: this.state.moveDelay
            }
        }));

        // Start the engine loop
        console.log('[Arena] Starting engine loop...');
        setTimeout(() => {
            this.runEngineLoop();
        }, 50); // Small delay to ensure UI is updated
    },

    togglePause() {
        if (this.state.matchState === 'running') {
            // Pause the match
            this.state.matchState = 'paused';
            this.state.loopActive = false;
            this.cancelActiveSearch('match paused');
            this.state.loopRunning = false;
            this.runtimeManager.stopAll();
            console.log('[Arena] Match paused');
            window.dispatchEvent(new CustomEvent('caissa-arena-pause'));
        } else if (this.state.matchState === 'paused') {
            // Resume the match
            this.state.matchState = 'running';
            this.state.loopActive = true;
            console.log('[Arena] Match resumed');
            window.dispatchEvent(new CustomEvent('caissa-arena-resume'));
            // Resume the loop
            setTimeout(() => {
                this.runEngineLoop();
            }, 100);
        }
        this.updateMatchControls();
        this.updateGameStatus({
            turn: this.game?.turn() === 'w' ? 'white' : 'black',
            moveCount: this.game?.history().length || 0
        });
    },

    stopMatch() {
        if (this.state.analysisRunning && this.state.matchState === 'idle') {
            this.stopInfiniteAnalysis();
            return;
        }
        console.log('[Arena] Stopping match');
        this.state.startToken += 1;
        clearTimeout(this._tournamentAdvanceTimer);
        this._tournamentAdvanceTimer = null;
        this.state.matchState = 'idle';
        this.state.loopActive = false;
        this.cancelActiveSearch('match stopped');
        this.state.loopRunning = false;

        // A stopped Match owns no live competition runtimes. A later start will
        // recreate the selected providers through the shared registry.
        this.destroyEngines();

        window.dispatchEvent(new CustomEvent('caissa-arena-stop'));
        // Stop can race a Tournament transition that temporarily marked the
        // shared Match start button as loading. Always clear that snapshot and
        // then derive disabled state from the currently selected providers.
        window.CaissaUI?.setButtonLoading(this.elements.startMatchBtn, false);
        if (this.elements.startMatchBtn) {
            const adapterAvailable = typeof window.EngineRegistry?.createArenaEngine === 'function';
            const selectedEnginesValid = this.isEngineRunnable(this.state.whiteEngine)
                && this.isEngineRunnable(this.state.blackEngine);
            this.elements.startMatchBtn.disabled = !(adapterAvailable && selectedEnginesValid);
        }
        this.updateMatchControls();

        this.updateGameStatus({ result: 'Match stopped' });
    },

    updateMatchControls() {
        const { matchState, analysisRunning } = this.state;
        const {
            startMatchBtn, pauseMatchBtn, stopMatchBtn, declareDrawBtn, infiniteAnalysisBtn,
            whiteEngineSelect, blackEngineSelect, swapEnginesBtn
        } = this.elements;

        if (startMatchBtn) {
            startMatchBtn.style.display = matchState === 'idle' && !analysisRunning ? 'block' : 'none';
        }
        if (pauseMatchBtn) {
            pauseMatchBtn.style.display = matchState === 'running' || matchState === 'paused' ? 'block' : 'none';
            const isPaused = matchState === 'paused';
            pauseMatchBtn.innerHTML = isPaused
                ? '<i class="fas fa-play" aria-hidden="true"></i> Resume'
                : '<i class="fas fa-pause" aria-hidden="true"></i> Pause';
            pauseMatchBtn.setAttribute('aria-label', isPaused ? 'Resume Arena match' : 'Pause Arena match');
            pauseMatchBtn.title = isPaused ? 'Resume match' : 'Pause match';
        }
        if (stopMatchBtn) {
            stopMatchBtn.style.display = matchState !== 'idle' ? 'block' : 'none';
        }
        if (declareDrawBtn) {
            declareDrawBtn.style.display = this.isActiveTournamentGame() ? 'block' : 'none';
        }
        const selectionLocked = matchState === 'running' || matchState === 'paused';
        if (whiteEngineSelect) whiteEngineSelect.disabled = selectionLocked;
        if (blackEngineSelect) blackEngineSelect.disabled = selectionLocked;
        if (swapEnginesBtn) swapEnginesBtn.disabled = selectionLocked;
        if (infiniteAnalysisBtn) {
            infiniteAnalysisBtn.style.display = matchState === 'idle' ? 'block' : 'none';
            infiniteAnalysisBtn.innerHTML = analysisRunning
                ? '<i class="fas fa-stop"></i> Stop Analysis'
                : '<i class="fas fa-search"></i> Infinite Analysis';
            infiniteAnalysisBtn.classList.toggle('btn-danger', analysisRunning);
            infiniteAnalysisBtn.classList.toggle('btn-secondary', !analysisRunning);
        }
    },

    async toggleInfiniteAnalysis() {
        if (this.state.analysisRunning) {
            this.stopInfiniteAnalysis();
            return;
        }
        if (this.state.matchState === 'running' || this.state.matchState === 'paused') {
            this.stopMatch();
        }
        await this.startInfiniteAnalysis();
    },

    async startInfiniteAnalysis() {
        if (!this.game) return;
        window.CaissaUI?.setButtonLoading(this.elements.infiniteAnalysisBtn, true, { label: 'Loading engine...' });
        if (!this.enginesReady || !this.evaluatorReady) {
            const initialized = await this.initEngines();
            if (!initialized) {
                this.handleError('Unable to initialize analysis engine');
                window.CaissaUI?.setButtonLoading(this.elements.infiniteAnalysisBtn, false);
                return;
            }
        }

        const fen = this.game.fen();
        this.runtimeManager.stop('evaluator');
        this.evaluatorEngine.currentFen = fen;
        this.evaluatorEngine.onBestMove = null;
        this.evaluatorEngine.onInfo = (info) => {
            if (!this.state.analysisRunning || this.state.analysisFen !== fen || this.game.fen() !== fen) return;
            this.recordEvaluationInfo(info);
        };
        this.state.analysisRunning = true;
        this.state.analysisFen = fen;
        window.CaissaUI?.setButtonLoading(this.elements.infiniteAnalysisBtn, false);
        this.updateMatchControls();
        this.updateGameStatus({ result: 'Infinite analysis running' });
        this.evaluatorEngine.setPosition(fen);
        this.runtimeManager.markThinking('evaluator');
        this.evaluatorEngine.go({ infinite: true });
        console.log('[Arena] Infinite analysis started', { fen });
    },

    stopInfiniteAnalysis(updateStatus = true) {
        if (!this.state.analysisRunning) return;
        this.runtimeManager?.stop('evaluator');
        if (this.evaluatorEngine) {
            this.evaluatorEngine.onInfo = null;
            this.evaluatorEngine.onBestMove = null;
        }
        this.state.analysisRunning = false;
        this.state.analysisFen = '';
        this.updateMatchControls();
        if (updateStatus) {
            this.updateGameStatus({ result: 'Infinite analysis stopped' });
        }
        console.log('[Arena] Infinite analysis stopped');
    },

    /**
     * Enable match controls after board is mounted
     */
    enableMatchControls() {
        const { startMatchBtn } = this.elements;
        if (startMatchBtn) {
            const adapterAvailable = typeof window.EngineRegistry?.createArenaEngine === 'function';
            const selectedEnginesValid = this.isEngineRunnable(this.state.whiteEngine)
                && this.isEngineRunnable(this.state.blackEngine);
            if (this.state.engineBinaryAvailable === false || !adapterAvailable || !selectedEnginesValid) {
                console.warn('[Arena] Not enabling controls: selected engine runtime unavailable');
                startMatchBtn.disabled = true;
                return;
            }
            startMatchBtn.disabled = false;
            console.log('[Arena] Match controls enabled - board ready');
        }
    },

    /**
     * Disable match controls while board is mounting
     */
    disableMatchControls() {
        const { startMatchBtn } = this.elements;
        if (startMatchBtn) {
            startMatchBtn.disabled = true;
            console.log('[Arena] Match controls disabled - waiting for board');
        }
    },

    // ===== GAME STATUS =====
    updateGameStatus(data = {}) {
        const { turnStatus, statusTurn, statusMoves, statusText, boardStatus } = this.elements;
        const sideToMove = this.game?.turn?.() === 'b' ? 'black' : 'white';
        const sideLabel = sideToMove === 'white' ? 'White' : 'Black';
        const result = typeof data.result === 'string' ? data.result : '';
        let turnState = this.state.matchState;
        let turnLabel = `${sideLabel} to move`;
        let turnDetail = '';

        if (this.state.matchState === 'finished') {
            turnState = 'finished';
            turnLabel = 'Finished';
            turnDetail = result || 'Game over';
        } else if (this.state.matchState === 'paused') {
            turnState = 'paused';
            turnLabel = 'Paused';
            turnDetail = `${sideLabel} to move when resumed`;
        } else if (this.state.analysisRunning) {
            turnState = 'analysis';
            turnLabel = 'Analysis';
            turnDetail = result || 'Infinite analysis running';
        } else if (/\bstopped\b/i.test(result)) {
            turnState = 'stopped';
            turnLabel = 'Stopped';
            turnDetail = result;
        } else if (this.state.matchState === 'idle') {
            turnState = 'idle';
            turnDetail = result || 'Ready';
        }

        if (turnStatus) {
            turnStatus.dataset.state = turnState;
            turnStatus.dataset.turn = turnState === 'running' || turnState === 'idle' ? sideToMove : 'neutral';
        }
        if (statusTurn) statusTurn.textContent = turnLabel;
        if (boardStatus) {
            boardStatus.textContent = turnDetail;
            boardStatus.hidden = !turnDetail;
        }

        if (statusMoves && data.moveCount !== undefined) {
            statusMoves.textContent = data.moveCount;
        }

        if (statusText) {
            let text = 'Ready';
            if (data.result) {
                text = this.state.matchState === 'finished' ? `Finished: ${data.result}` : data.result;
            } else if (this.state.matchState === 'running') {
                const moveCount = data.moveCount !== undefined ? data.moveCount : this.game?.history().length || 0;
                const turnText = data.turn ? (data.turn === 'white' ? 'White' : 'Black') : (this.game?.turn() === 'w' ? 'White' : 'Black');
                text = `Running… Move ${moveCount} (${turnText})`;
            } else if (this.state.matchState === 'paused') {
                text = 'Paused';
            } else if (this.state.matchState === 'finished') {
                text = data.result ? `Finished: ${data.result}` : 'Finished';
            } else if (this.state.matchState === 'idle') {
                text = 'Ready';
            }
            statusText.textContent = text;
        }
    },

    onEngineMove(detail) {
        if (this.state.matchState !== 'running') return;

        // Record move for history
        if (this.state.currentGame) {
            this.state.currentGame.moves.push(detail);
        }

        // Update status
        this.updateGameStatus({
            turn: detail.turn,
            moveCount: this.state.currentGame?.moves.length || 0
        });

        // Record eval for graph
        if (detail.evaluation !== undefined) {
            this.state.evalHistory.push({
                move: this.state.evalHistory.length + 1,
                eval: detail.evaluation
            });
            this.updateEvalGraph();
        }
    },

    // ===== ARENA ENGINE MANAGEMENT =====
    /**
     * Initialize Stockfish engine instances for Arena
     * Creates three independent engine workers (white, black, evaluator)
     */
    prewarmEngines() {
        if ([this.state.whiteEngine, this.state.blackEngine].some(candidate =>
            candidate?.id === 'lc0-maia-1100-preview')) return Promise.resolve(false);
        if (this.enginesReady && this.playerInstancesMatchSelections()) return Promise.resolve(true);
        if (this._prewarmPromise) return this._prewarmPromise;
        if (this.state.engineBinaryAvailable === false) return Promise.resolve(false);
        this._prewarming = true;
        this._prewarmPromise = (async () => {
            let initialized = false;
            do {
                if ([this.state.whiteEngine, this.state.blackEngine].some(candidate =>
                    candidate?.id === 'lc0-maia-1100-preview')) break;
                initialized = await this.initEngines();
            } while (initialized && !this.playerInstancesMatchSelections());
            return initialized;
        })()
            .catch(() => false)
            .finally(() => {
                this._prewarming = false;
                this._prewarmPromise = null;
            });
        return this._prewarmPromise;
    },

    async initEngines() {
        console.log('[Arena] Initializing engine instances...');

        if (!this.runtimeManager) {
            console.error('[Arena] Arena runtime manager not found!');
            return false;
        }

        try {
            const whiteConfig = this.state.whiteEngine || this.engines[0];
            const blackConfig = this.state.blackEngine || this.engines[1] || this.engines[0];
            const evalConfig = this.engines.find(e => e.id === 'stockfish') || whiteConfig;
            if (whiteConfig.id === 'lc0-maia-1100-preview' &&
                blackConfig.id === 'lc0-maia-1100-preview')
                throw new Error('Only one Lc0 participant is permitted per competition.');
            if (whiteConfig.id === 'lc0-maia-1100-preview' &&
                this.blackEngineInstance?.providerId === whiteConfig.id)
                await this.runtimeManager.terminate('black', 'lc0-role-transition');
            if (blackConfig.id === 'lc0-maia-1100-preview' &&
                this.whiteEngineInstance?.providerId === blackConfig.id)
                await this.runtimeManager.terminate('white', 'lc0-role-transition');

            const [whiteInstance, blackInstance, evaluatorInstance] = await Promise.all([
                this.runtimeManager.acquire('white', whiteConfig.id),
                this.runtimeManager.acquire('black', blackConfig.id),
                this.runtimeManager.acquire('evaluator', evalConfig.id)
            ]);

            if (!whiteInstance || !blackInstance || !evaluatorInstance
                || !this.runtimeMatchesProvider(whiteInstance, whiteConfig)
                || !this.runtimeMatchesProvider(blackInstance, blackConfig)
                || !this.runtimeMatchesProvider(evaluatorInstance, evalConfig)) {
                throw new Error('Engine runtime identity did not match the selected provider.');
            }

            this.enginesReady = true;
            this.evaluatorReady = true;
            console.log('[Arena] All engines ready (white, black, evaluator)!');
            return true;

        } catch (error) {
            console.error('[Arena] Failed to initialize engines:', error);
            this.enginesReady = false;
            this.evaluatorReady = false;
            this.refreshEngineAvailabilityUI();
            return false;
        }
    },

    /**
     * Wait for all engines to report ready
     */
    waitForEngines() {
        return new Promise((resolve, reject) => {
            let whiteReady = false;
            let blackReady = false;
            let evaluatorReady = false;
            let timeout = null;

            const checkAll = () => {
                if (whiteReady && blackReady && evaluatorReady) {
                    clearTimeout(timeout);
                    resolve();
                }
            };

            // Set up ready callbacks
            this.whiteEngineInstance.onReady = () => {
                console.log('[Arena] White engine ready');
                whiteReady = true;
                checkAll();
            };

            this.blackEngineInstance.onReady = () => {
                console.log('[Arena] Black engine ready');
                blackReady = true;
                checkAll();
            };

            this.evaluatorEngine.onReady = () => {
                console.log('[Arena] Evaluator engine ready');
                evaluatorReady = true;
                checkAll();
            };

            // Check if already ready (might have initialized before callbacks set)
            if (this.whiteEngineInstance.isReady()) {
                whiteReady = true;
            }
            if (this.blackEngineInstance.isReady()) {
                blackReady = true;
            }
            if (this.evaluatorEngine.isReady()) {
                evaluatorReady = true;
            }
            checkAll();

            // Timeout after 15 seconds (3 engines now)
            timeout = setTimeout(() => {
                console.error('[Arena] Engine initialization timeout');
                reject(new Error('Engine initialization timeout'));
            }, 15000);
        });
    },

    /**
     * Destroy engine instances to free resources
     */
    destroyEngines() {
        const cleanup = this.runtimeManager?.terminateAll('arena-destroyed');
        if (cleanup && typeof cleanup.catch === 'function') {
            cleanup.catch(error => {
                this.updateGameStatus({ result: `Lc0 cleanup unverified: ${error.message}` });
            });
        }
        this.enginesReady = false;
        this.evaluatorReady = false;
        console.log('[Arena] All engines destroyed');
        return cleanup;
    },

    getBookMove() {
        const book = window.App?.openingBook;
        if (!book || !book.loaded || !this.game) return null;
        if (this.game.history().length >= this.state.bookMaxPlies) return null;
        try {
            const move = book.selectBookMove(this.game);
            if (!move) return null;
            if (!this.findLegalUciMove(move)) {
                console.warn('[Arena] Ignoring unusable book move and falling back to engine', {
                    color: this.game.turn() === 'w' ? 'white' : 'black',
                    fen: this.game.fen(),
                    bookMove: move
                });
                return null;
            }
            return move;
        } catch (error) {
            console.warn('[Arena] Book lookup failed; falling back to engine', {
                color: this.game.turn() === 'w' ? 'white' : 'black',
                fen: this.game.fen(),
                message: error?.message || String(error)
            });
            return null;
        }
    },

    findLegalUciMove(uciMove) {
        if (!this.game || typeof uciMove !== 'string' || uciMove.length < 4) return null;
        const from = uciMove.substring(0, 2).toLowerCase();
        const to = uciMove.substring(2, 4).toLowerCase();
        const promotion = uciMove.length > 4 ? uciMove.substring(4, 5).toLowerCase() : undefined;
        return this.game.moves({ verbose: true }).find((move) =>
            move.from === from &&
            move.to === to &&
            (promotion ? move.promotion === promotion : !move.promotion)
        ) || null;
    },

    cancelActiveSearch(reason) {
        this.state.searchToken += 1;
        const cancel = this.state.cancelPendingSearch;
        this.state.cancelPendingSearch = null;
        if (typeof cancel === 'function') cancel(reason || 'search canceled');
    },

    waitForEngineReadyOk(engine, color) {
        return new Promise((resolve, reject) => {
            if (!engine || !engine.isReady()) {
                reject(new Error(`${color} engine is not initialized`));
                return;
            }

            const previousOnLine = engine.onLine;
            let timeout = null;
            let settled = false;
            const finish = (callback) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                engine.onLine = previousOnLine;
                callback();
            };
            engine.onLine = (line) => {
                if (previousOnLine) previousOnLine(line);
                if (String(line || '').includes('readyok')) {
                    console.log('[Arena] Engine readyok received', {
                        color,
                        engineId: engine.id || 'unknown'
                    });
                    finish(resolve);
                }
            };
            engine.send('isready');
            timeout = setTimeout(() => {
                finish(() => reject(new Error(`${color} engine readyok timeout`)));
            }, 5000);
        });
    },

    playUciMove(uciMove, isWhiteTurn, source = 'engine') {
        if (!uciMove) return false;

        const legalMove = this.findLegalUciMove(uciMove);
        if (!legalMove) return false;

        const moveResult = this.game.move({
            from: legalMove.from,
            to: legalMove.to,
            promotion: legalMove.promotion
        });

        if (!moveResult) {
            return false;
        }

        if (this.board) {
            // A historical review owns only the displayed board. The live game
            // continues to advance without pulling the user's cursor to Live.
            if (!this.isReviewing()) this.board.position(this.game.fen());
        } else {
            console.error('[Arena] Board is null, cannot update position');
            this.handleError('Board not mounted');
            return false;
        }

        if (this.state.currentGame) {
            this.state.currentGame.moves.push({
                move: moveResult.san,
                uci: uciMove,
                fen: this.game.fen(),
                turn: isWhiteTurn ? 'white' : 'black',
                source: source
            });
        }

        this.updateMoveHistory();

        this.updateGameStatus({
            turn: this.game.turn() === 'w' ? 'white' : 'black',
            moveCount: this.game.history().length
        });

        this.evaluatePosition(this.game.fen());

        if (this.state.matchState !== 'running' || !this.state.loopActive) {
            console.log('[Arena] Loop stopped after move');
            return true;
        }

        const delay = source === 'book' ? 0 : this.state.moveDelay;
        setTimeout(() => {
            this.runEngineLoop();
        }, delay);

        return true;
    },

    /**
     * Main engine loop for Arena matches
     * Self-contained - doesn't depend on app.js EVE system
     */
    async runEngineLoop(invalidRetryCount = 0) {
        // Safety check
        if (this.state.matchState !== 'running' || !this.state.loopActive) {
            console.log('[Arena] Loop stopped - match not running');
            return;
        }
        if (this.state.loopRunning) {
            console.warn('[Arena] Loop request ignored because another move search is active');
            return;
        }

        // Check game over
        if (this.game.game_over()) {
            console.log('[Arena] Game over detected');
            this.handleGameOver();
            return;
        }

        // Determine which engine should move
        const isWhiteTurn = this.game.turn() === 'w';
        const currentEngine = isWhiteTurn ? this.whiteEngineInstance : this.blackEngineInstance;
        const engineConfig = isWhiteTurn ? this.state.whiteEngine : this.state.blackEngine;

        console.log(`[Arena] ${isWhiteTurn ? 'White' : 'Black'} (${engineConfig?.name || 'Engine'}) to move`);

        // Update turn display
        this.updateGameStatus({
            turn: isWhiteTurn ? 'white' : 'black',
            moveCount: this.game.history().length
        });

        // Get FEN for current position
        const fen = this.game.fen();

        // Get depth from engine config
        const depth = engineConfig?.options?.depth || 15;
        const color = isWhiteTurn ? 'white' : 'black';

        try {
            const bookMove = this.getBookMove();
            if (bookMove) {
                if (this.playUciMove(bookMove, isWhiteTurn, 'book')) {
                    return;
                }
                console.warn('[Arena] Book move could not be applied; falling back to engine search', {
                    color,
                    engineId: engineConfig?.id,
                    requestedFen: fen,
                    bookMove
                });
            }

            // Request best move from engine
            console.log('[Arena] Falling back to engine search', {
                color,
                engineId: engineConfig?.id || currentEngine?.id || 'unknown',
                requestedFen: fen,
                engineReady: !!currentEngine?.isReady?.(),
                separatePlayerInstances: this.whiteEngineInstance !== this.blackEngineInstance,
                command: `go movetime ${ARENA_ENGINE_MOVETIME_MS}`
            });
            this.state.loopRunning = true;
            const bestMove = await this.getEngineMove(currentEngine, fen, {
                color,
                engineId: engineConfig?.id || currentEngine?.id || 'unknown',
                depth
            });
            this.state.loopRunning = false;

            if (this.state.matchState !== 'running' || !this.state.loopActive) return;
            if (this.game.fen() !== fen) {
                console.warn('[Arena] Ignoring stale bestmove because the board FEN changed', {
                    color,
                    engineId: engineConfig?.id,
                    requestedFen: fen,
                    currentFen: this.game.fen()
                });
                this.runEngineLoop();
                return;
            }

            if (!bestMove) {
                console.error('[Arena] Engine returned no move');
                this.handleError('Engine returned no move');
                return;
            }

            if (!this.playUciMove(bestMove, isWhiteTurn, 'engine')) {
                console.warn('[Arena] Engine returned an illegal move; requesting one fresh move', {
                    color,
                    engineId: engineConfig?.id,
                    requestedFen: fen,
                    bestMove,
                    retry: invalidRetryCount
                });
                if (invalidRetryCount < 1) {
                    this.runEngineLoop(invalidRetryCount + 1);
                    return;
                }
                this.handleError(`Illegal move from ${color} ${engineConfig?.name || 'engine'}: ${bestMove}`);
            }

        } catch (error) {
            this.state.loopRunning = false;
            if (error?.name === 'ArenaStaleSearchError') return;
            console.error('[Arena] Engine loop error:', error);
            this.handleError(error.message);
        }
    },

    /**
     * Get move from engine (Promise wrapper)
     */
    getEngineMove(engine, fen, context = {}) {
        return new Promise((resolve, reject) => {
            if (!engine || !engine.isReady()) {
                reject(new Error('Engine not ready'));
                return;
            }

            const color = context.color || 'unknown';
            const runtimeRole = ['white', 'black'].includes(color) ? color : null;
            const engineId = context.engineId || engine.id || 'unknown';
            const searchToken = ++this.state.searchToken;
            let timeout = null;
            let settled = false;
            let goCommandSent = false;
            let bestMoveReceived = false;
            let workerCrashed = false;
            const previousOnError = engine.onError;
            const finish = (callback) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                engine.onError = previousOnError;
                if (this.state.cancelPendingSearch === cancelSearch) {
                    this.state.cancelPendingSearch = null;
                }
                if (runtimeRole) this.runtimeManager?.markIdle(runtimeRole, engine);
                callback();
            };
            const cancelSearch = (reason) => {
                const error = new Error(reason || 'Arena search canceled');
                error.name = 'ArenaStaleSearchError';
                finish(() => reject(error));
            };
            this.state.cancelPendingSearch = cancelSearch;
            engine.onError = (error) => {
                workerCrashed = true;
                console.error('[Arena] Engine worker error during move search', {
                    color,
                    engineId,
                    requestedFen: fen,
                    searchToken,
                    goCommandSent,
                    message: error?.message || String(error)
                });
                if (previousOnError) previousOnError(error);
                finish(() => reject(new Error(`Engine worker failed (${color}, ${engineId}, search ${searchToken})`)));
            };

            console.log('[Arena] Engine search requested', {
                color,
                engineId,
                requestedFen: fen,
                searchToken,
                engineReady: engine.isReady(),
                goCommandSent: false,
                command: `go movetime ${ARENA_ENGINE_MOVETIME_MS}`
            });

            // Set up callback for best move
            if (runtimeRole) this.runtimeManager?.markThinking(runtimeRole, engine);
            engine.getBestMove(fen, (bestMove) => {
                if (settled || searchToken !== this.state.searchToken) {
                    console.warn('[Arena] Ignoring late or stale bestmove', {
                        color,
                        engineId,
                        requestedFen: fen,
                        searchToken,
                        activeSearchToken: this.state.searchToken,
                        bestMove
                    });
                    return;
                }
                bestMoveReceived = true;
                console.log('[Arena] Engine bestmove received', {
                    color,
                    engineId,
                    requestedFen: fen,
                    searchToken,
                    bestMove
                });
                finish(() => resolve(bestMove));
            }, { movetime: ARENA_ENGINE_MOVETIME_MS });
            goCommandSent = true;
            console.log('[Arena] Engine search command sent', {
                color,
                engineId,
                requestedFen: fen,
                searchToken,
                engineReady: engine.isReady(),
                command: `go movetime ${ARENA_ENGINE_MOVETIME_MS}`
            });

            timeout = setTimeout(() => {
                if (settled || searchToken !== this.state.searchToken) return;
                if (!runtimeRole || !this.runtimeManager?.stop(runtimeRole, engine)) engine.stop?.();
                console.error('[Arena] Engine move timeout diagnostic', {
                    color,
                    engineId,
                    requestedFen: fen,
                    searchToken,
                    engineReady: engine.isReady(),
                    goCommandSent,
                    bestMoveReceived,
                    workerCrashed,
                    command: `go movetime ${ARENA_ENGINE_MOVETIME_MS}`
                });
                finish(() => reject(new Error(
                    `Engine move timeout (${color}, ${engineId}, search ${searchToken}, FEN ${fen})`
                )));
            }, ARENA_ENGINE_TIMEOUT_MS);
        });
    },

    /**
     * Evaluate current position and update eval panel + graph
     */
    evaluatePosition(fen) {
        if (!this.evaluatorEngine || !this.evaluatorReady || this.state.analysisRunning) {
            return;
        }

        this.runtimeManager.stop('evaluator');
        this.evaluatorEngine.currentFen = fen;

        // Set up info callback to capture evaluation data
        this.evaluatorEngine.onInfo = (info) => {
            if (this.game.fen() !== fen) return;
            this.recordEvaluationInfo(info);
        };

        // Start analysis with short movetime
        this.evaluatorEngine.setPosition(fen);
        this.runtimeManager.markThinking('evaluator');
        this.evaluatorEngine.go({ movetime: 400 });
    },

    recordEvaluationInfo(info) {
        if ((info.score == null && info.mate == null) || info.depth <= 0) return;
        const evalScore = info.mate != null ? (info.mate > 0 ? 99 : -99) : info.score;

        this.updateEvalPanelWithInfo({
            score: evalScore,
            mate: info.mate,
            depth: info.depth,
            nodes: info.nodes,
            pv: info.pv,
            fen: this.game.fen(),
            turn: this.game.turn() === 'w' ? 'white' : 'black'
        });

        const move = this.game.history().length;
        const latest = this.state.evalHistory[this.state.evalHistory.length - 1];
        if (latest && latest.move === move) {
            latest.eval = evalScore;
        } else {
            this.state.evalHistory.push({ move, eval: evalScore });
        }
        this.updateEvalGraph();
    },

    /**
     * Update eval panel with parsed info
     */
    updateEvalPanelWithInfo(data) {
        const { evalScore, evalDepth, evalNodes, evalPV } = this.elements;

        if (evalScore) {
            let scoreText = '';
            if (data.mate !== null && data.mate !== undefined) {
                scoreText = data.mate > 0 ? `M${data.mate}` : `M${data.mate}`;
            } else {
                const score = data.score || 0;
                scoreText = score >= 0 ? `+${score.toFixed(2)}` : score.toFixed(2);
            }
            evalScore.textContent = scoreText;

            // Color code the score
            if (data.score > 1.5 || (data.mate && data.mate > 0)) {
                evalScore.className = 'arena-eval-score white-advantage';
            } else if (data.score < -1.5 || (data.mate && data.mate < 0)) {
                evalScore.className = 'arena-eval-score black-advantage';
            } else {
                evalScore.className = 'arena-eval-score';
            }
        }

        if (evalDepth && data.depth) {
            evalDepth.textContent = data.depth;
        }

        if (evalNodes && data.nodes) {
            evalNodes.textContent = this.formatNodes(data.nodes);
        }

        if (evalPV && data.pv) {
            evalPV.textContent = this.formatPvAsSan(data.pv, data.fen);
        }
    },

    /**
     * Convert an engine PV from UCI transport notation to human-readable SAN.
     * Replaying on an isolated position keeps the live Arena game untouched.
     */
    formatPvAsSan(pv, fen) {
        if (!Array.isArray(pv) || pv.length === 0 || typeof Chess === 'undefined') return '--';

        try {
            const analysisGame = new Chess();
            if (fen && analysisGame.load(fen) === false) return '--';

            const sanMoves = [];
            for (const uciMove of pv.slice(0, 5)) {
                const parsed = String(uciMove || '').match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/i);
                if (!parsed) break;

                const move = analysisGame.move({
                    from: parsed[1].toLowerCase(),
                    to: parsed[2].toLowerCase(),
                    promotion: parsed[3]?.toLowerCase()
                });
                if (!move) break;
                sanMoves.push(move.san);
            }

            return sanMoves.length > 0 ? sanMoves.join(' ') : '--';
        } catch (error) {
            console.warn('[Arena] Could not format evaluation PV as SAN', error);
            return '--';
        }
    },

    /**
     * Handle game over condition
     */
    handleGameOver() {
        this.state.matchState = 'finished';
        this.state.loopActive = false;
        this.cancelActiveSearch('game over');
        this.state.loopRunning = false;
        this.runtimeManager.stopAll();

        let result = '';
        let resultCode = '1/2-1/2';

        if (this.game.in_checkmate()) {
            const winner = this.game.turn() === 'w' ? 'Black' : 'White';
            const winnerEngine = winner === 'White' ? this.state.whiteEngine : this.state.blackEngine;
            result = `${winner} wins by checkmate (${winnerEngine?.name || 'Engine'})`;
            resultCode = winner === 'White' ? '1-0' : '0-1';
        } else if (this.game.in_stalemate()) {
            result = 'Draw by stalemate';
        } else if (this.game.in_threefold_repetition()) {
            result = 'Draw by threefold repetition';
        } else if (this.game.insufficient_material()) {
            result = 'Draw - insufficient material';
        } else if (this.game.in_draw()) {
            result = 'Draw';
        } else {
            result = 'Game over';
        }

        console.log('[Arena] Game ended:', result);

        // Update UI
        this.updateMatchControls();
        this.updateGameStatus({ result });

        // Record tournament result if in tournament mode
        if (this.state.mode === 'tournament') {
            this.recordTournamentResult(resultCode);
            this.scheduleNextTournamentGame();
        }
    },

    adjudicateTournamentDraw() {
        if (!this.isActiveTournamentGame()) {
            this.closeDrawConfirmation();
            return false;
        }

        this.closeDrawConfirmation({ restoreFocus: false });
        this.state.matchState = 'finished';
        this.state.loopActive = false;
        this.cancelActiveSearch('tournament draw adjudicated');
        this.state.loopRunning = false;
        this.runtimeManager.stopAll();

        if (this.state.currentGame) {
            this.state.currentGame.result = '1/2-1/2';
            this.state.currentGame.termination = 'Draw by adjudication';
            this.state.currentGame.endTime = Date.now();
        }

        this.updateMatchControls();
        this.updateGameStatus({
            result: 'Draw by adjudication',
            moveCount: this.game?.history().length || 0
        });
        this.recordTournamentResult('1/2-1/2');
        window.dispatchEvent(new CustomEvent('caissa-arena-tournament-draw'));
        this.scheduleNextTournamentGame();
        return true;
    },

    scheduleNextTournamentGame() {
        clearTimeout(this._tournamentAdvanceTimer);
        this._tournamentAdvanceTimer = setTimeout(() => {
            this._tournamentAdvanceTimer = null;
            this.playNextTournamentGame();
        }, 2000);
    },

    /**
     * Handle errors during match
     */
    handleError(message) {
        this.state.startToken += 1;
        this.state.matchState = 'idle';
        this.state.loopActive = false;
        this.cancelActiveSearch('arena error');
        this.state.loopRunning = false;
        this.runtimeManager?.terminateAll('arena-error');
        this.enginesReady = false;
        this.evaluatorReady = false;
        this.updateMatchControls();

        console.warn('[Arena] Match stopped after error:', message);
        this.updateGameStatus({ result: 'Arena match stopped. Try starting a new match.' });
    },

    // ===== VISUAL GAME REVIEW =====
    isReviewing() {
        return Number.isInteger(this.state.review.cursor);
    },

    getReviewMoves() {
        return this.game?.history?.({ verbose: true }) || [];
    },

    getReviewMoveCount() {
        return this.getReviewMoves().length;
    },

    getReviewStartFen() {
        return this.state.currentGame?.startFen || this.state.customStartFen || '';
    },

    /**
     * Reconstruct a display-only position. This isolated Chess instance is the
     * sole state mutated by review navigation; `this.game` remains authoritative.
     */
    reconstructReviewPosition(cursor) {
        if (typeof Chess === 'undefined') return null;
        const reviewGame = new Chess();
        const startFen = this.getReviewStartFen();
        if (startFen && reviewGame.load(startFen) === false) return null;

        const moves = this.game.history({ verbose: true });
        const boundedCursor = Math.max(0, Math.min(Number(cursor) || 0, moves.length));
        let lastMove = null;
        for (const move of moves.slice(0, boundedCursor)) {
            lastMove = reviewGame.move({
                from: move.from,
                to: move.to,
                promotion: move.promotion
            });
            if (!lastMove) return null;
        }
        return Object.freeze({
            cursor: boundedCursor,
            fen: reviewGame.fen(),
            lastMove: lastMove ? Object.freeze({ from: lastMove.from, to: lastMove.to }) : null
        });
    },

    showReviewPosition(cursor, options = {}) {
        const position = this.reconstructReviewPosition(cursor);
        if (!position || !this.board) return false;
        if (!options.keepPlaying) this.stopReviewPlayback({ render: false });

        this.state.review.cursor = position.cursor;
        this.state.review.displayFen = position.fen;
        this.board.position(position.fen, false);
        this.renderReviewLastMove(position.lastMove);
        this.renderMoveHistory();
        return true;
    },

    reviewPrevious() {
        const count = this.getReviewMoveCount();
        const cursor = this.isReviewing() ? this.state.review.cursor : count;
        return this.showReviewPosition(Math.max(0, cursor - 1));
    },

    reviewNext() {
        if (!this.isReviewing()) return false;
        return this.showReviewPosition(Math.min(this.getReviewMoveCount(), this.state.review.cursor + 1));
    },

    returnToLivePosition() {
        this.stopReviewPlayback({ render: false });
        this.state.review.cursor = null;
        this.state.review.displayFen = this.game?.fen?.() || '';
        if (this.board && this.game) this.board.position(this.game.fen(), false);
        this.renderReviewLastMove(null);
        this.renderMoveHistory();
        return true;
    },

    toggleReviewPlayback() {
        if (this.state.review.playing) {
            this.stopReviewPlayback();
            return;
        }
        const moveCount = this.getReviewMoveCount();
        if (!moveCount) return;
        if (!this.isReviewing() || this.state.review.cursor >= moveCount) {
            if (!this.showReviewPosition(0)) return;
        }
        this.state.review.playing = true;
        this.updateReviewControls();
        this.scheduleReviewStep();
    },

    scheduleReviewStep() {
        clearTimeout(this.reviewTimer);
        if (!this.state.review.playing) return;
        this.reviewTimer = setTimeout(() => {
            this.reviewTimer = null;
            if (!this.state.review.playing || !this.isReviewing()) return;
            const moveCount = this.getReviewMoveCount();
            if (this.state.review.cursor >= moveCount) {
                this.stopReviewPlayback();
                return;
            }
            this.showReviewPosition(this.state.review.cursor + 1, { keepPlaying: true });
            if (this.state.review.cursor >= this.getReviewMoveCount()) {
                this.stopReviewPlayback();
            } else {
                this.scheduleReviewStep();
            }
        }, ARENA_REVIEW_PLAYBACK_MS);
    },

    stopReviewPlayback({ render = true } = {}) {
        clearTimeout(this.reviewTimer);
        this.reviewTimer = null;
        this.state.review.playing = false;
        if (render) this.updateReviewControls();
    },

    resetReviewState({ render = true } = {}) {
        this.stopReviewPlayback({ render: false });
        this.state.review.cursor = null;
        this.state.review.displayFen = this.game?.fen?.() || '';
        this.renderReviewLastMove(null);
        if (render) this.renderMoveHistory();
    },

    onReviewKeydown(event) {
        const target = event.target;
        if (target?.matches?.('input, textarea, select, [contenteditable="true"]')) return;
        if (!target?.closest?.('#arenaReviewControls, #arenaMoveHistory')) return;
        const action = {
            ArrowLeft: () => this.reviewPrevious(),
            ArrowRight: () => this.reviewNext(),
            Home: () => this.showReviewPosition(0),
            End: () => this.showReviewPosition(this.getReviewMoveCount()),
            ' ': () => this.toggleReviewPlayback(),
            Spacebar: () => this.toggleReviewPlayback()
        }[event.key];
        if (!action) return;
        event.preventDefault();
        action();
    },

    renderReviewLastMove(move) {
        const boardElement = document.getElementById('arenaBoardElement');
        if (!boardElement) return;
        const markerVersion = ++this.reviewMarkerVersion;
        boardElement.querySelectorAll('.arena-review-last-move')
            .forEach(square => square.classList.remove('arena-review-last-move'));
        if (!move) return;
        requestAnimationFrame(() => {
            if (markerVersion !== this.reviewMarkerVersion) return;
            for (const squareName of [move.from, move.to]) {
                boardElement.querySelector(`.square-${squareName}`)?.classList.add('arena-review-last-move');
            }
        });
    },

    updateReviewControls() {
        const moveCount = this.getReviewMoveCount();
        const reviewing = this.isReviewing();
        const cursor = reviewing ? this.state.review.cursor : moveCount;
        const hasMoves = moveCount > 0;
        const {
            reviewFirstBtn, reviewPreviousBtn, reviewPlayBtn, reviewNextBtn,
            reviewLastBtn, reviewLiveBtn, reviewStatus, reviewControls
        } = this.elements;

        if (reviewFirstBtn) reviewFirstBtn.disabled = !hasMoves || (reviewing && cursor === 0);
        if (reviewPreviousBtn) reviewPreviousBtn.disabled = !hasMoves || (reviewing && cursor === 0);
        if (reviewPlayBtn) {
            reviewPlayBtn.disabled = !hasMoves;
            reviewPlayBtn.setAttribute('aria-label', this.state.review.playing ? 'Pause game review' : 'Play game review');
            reviewPlayBtn.title = this.state.review.playing ? 'Pause game review' : 'Play game review';
            reviewPlayBtn.innerHTML = this.state.review.playing
                ? '<i class="fas fa-pause" aria-hidden="true"></i><span>Pause</span>'
                : '<i class="fas fa-play" aria-hidden="true"></i><span>Play</span>';
        }
        if (reviewNextBtn) reviewNextBtn.disabled = !reviewing || cursor >= moveCount;
        if (reviewLastBtn) reviewLastBtn.disabled = !hasMoves || (reviewing && cursor >= moveCount);
        if (reviewLiveBtn) reviewLiveBtn.disabled = !reviewing;
        reviewControls?.classList.toggle('is-reviewing', reviewing);

        if (reviewStatus) {
            if (!reviewing) {
                reviewStatus.textContent = `Live position \u2022 ${moveCount} ${moveCount === 1 ? 'move' : 'moves'}`;
            } else {
                const newerMoves = Math.max(0, moveCount - cursor);
                reviewStatus.textContent = `Reviewing move ${cursor} of ${moveCount}. ${newerMoves
                    ? `${newerMoves} newer ${newerMoves === 1 ? 'move' : 'moves'} available. `
                    : ''}Evaluation remains live.`;
            }
        }
    },

    ensureReviewMoveVisible() {
        const container = this.elements.moveHistory;
        if (!container || !this.isReviewing() || this.state.review.cursor < 1) return;
        const selected = container.querySelector(`[data-review-ply="${this.state.review.cursor}"]`);
        if (!selected) return;
        const top = selected.offsetTop;
        const bottom = top + selected.offsetHeight;
        if (top < container.scrollTop) container.scrollTop = top;
        else if (bottom > container.scrollTop + container.clientHeight) {
            container.scrollTop = bottom - container.clientHeight;
        }
    },

    inspectReviewState() {
        const moveCount = this.getReviewMoveCount();
        return Object.freeze({
            mode: this.isReviewing() ? 'review' : 'live',
            cursor: this.state.review.cursor,
            playing: this.state.review.playing,
            moveCount,
            newerMoves: this.isReviewing() ? Math.max(0, moveCount - this.state.review.cursor) : 0,
            startFen: this.getReviewStartFen(),
            liveFen: this.game?.fen?.() || '',
            displayFen: this.state.review.displayFen || this.game?.fen?.() || ''
        });
    },

    /**
     * Render the human-facing score sheet from chess.js's canonical SAN history.
     * Engine communication remains UCI; this method never mutates the game.
     */
    renderMoveHistory() {
        const container = this.elements.moveHistory;
        if (!container || !this.game) {
            this.updateReviewControls();
            return;
        }

        const moves = this.game.history({ verbose: true });
        const startFen = this.getReviewStartFen();
        const fenParts = startFen.split(/\s+/);
        let moveNumber = Number.parseInt(fenParts[5], 10) || 1;
        let currentRow = null;

        container.replaceChildren();

        const createPlaceholder = (className) => {
            const cell = document.createElement('span');
            cell.className = className;
            cell.textContent = '\u2026';
            return cell;
        };
        const createRow = (number) => {
            const row = document.createElement('div');
            row.className = 'arena-move-row';
            row.setAttribute('role', 'group');
            row.setAttribute('aria-label', `Move ${number}`);

            const numberCell = document.createElement('span');
            numberCell.className = 'move-num';
            numberCell.textContent = `${number}.`;
            row.append(numberCell, createPlaceholder('move-white'), createPlaceholder('move-black'));
            container.appendChild(row);
            return row;
        };
        const createMoveButton = (move, ply, number) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `arena-move-button move-${move.color === 'w' ? 'white' : 'black'}`;
            button.dataset.reviewPly = String(ply);
            button.textContent = move.san;
            button.setAttribute('aria-label', `Review position after ${number}${move.color === 'w' ? '.' : '...'}${move.san}`);
            if (this.isReviewing() && this.state.review.cursor === ply) {
                button.classList.add('is-current');
                button.setAttribute('aria-current', 'step');
            }
            return button;
        };

        moves.forEach((move, index) => {
            const ply = index + 1;
            if (move.color === 'w') {
                currentRow = createRow(moveNumber);
                currentRow.querySelector('.move-white').replaceWith(createMoveButton(move, ply, moveNumber));
                return;
            }

            if (!currentRow) currentRow = createRow(moveNumber);
            currentRow.querySelector('.move-black').replaceWith(createMoveButton(move, ply, moveNumber));
            currentRow = null;
            moveNumber += 1;
        });

        this.updateReviewControls();
        requestAnimationFrame(() => {
            if (this.isReviewing()) this.ensureReviewMoveVisible();
            else container.scrollTop = container.scrollHeight;
        });
    },

    updateMoveHistory() {
        this.renderMoveHistory();
    },

    // ===== EVALUATION PANEL =====
    updateEvalPanel(data) {
        const { evalEngineName, evalScore, evalDepth, evalNodes, evalPV } = this.elements;

        // Determine which engine is evaluating based on turn
        const evalEngine = data.turn === 'white' ? this.state.whiteEngine : this.state.blackEngine;

        if (evalEngineName && evalEngine) {
            evalEngineName.textContent = evalEngine.name;
        }

        if (evalScore && data.evaluation !== undefined) {
            const evalNum = parseFloat(data.evaluation);
            evalScore.textContent = evalNum >= 0 ? `+${evalNum.toFixed(2)}` : evalNum.toFixed(2);
            evalScore.className = 'eval-score ' + (evalNum > 0.5 ? 'white-advantage' : evalNum < -0.5 ? 'black-advantage' : 'equal');
        }

        if (evalDepth && data.depth !== undefined) {
            evalDepth.textContent = data.depth;
        }

        if (evalNodes && data.nodes !== undefined) {
            evalNodes.textContent = this.formatNodes(data.nodes);
        }

        if (evalPV && data.bestLine) {
            evalPV.textContent = data.bestLine;
        }
    },

    formatNodes(nodes) {
        if (nodes >= 1000000) return (nodes / 1000000).toFixed(1) + 'M';
        if (nodes >= 1000) return (nodes / 1000).toFixed(1) + 'K';
        return nodes.toString();
    },

    // ===== EVALUATION GRAPH =====
    initEvalGraph() {
        this.evalGraphCtx = this.elements.evalGraph?.getContext('2d');
        this.clearEvalGraph();
    },

    clearEvalGraph() {
        if (!this.evalGraphCtx || !this.elements.evalGraph) return;

        const canvas = this.elements.evalGraph;
        const ctx = this.evalGraphCtx;

        ctx.fillStyle = '#1a1f28';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw center line (0 eval)
        ctx.strokeStyle = '#3a4255';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();

        // Draw axis labels
        ctx.fillStyle = '#6a7a8a';
        ctx.font = '10px sans-serif';
        ctx.fillText('+5', 5, 15);
        ctx.fillText('0', 5, canvas.height / 2 + 4);
        ctx.fillText('-5', 5, canvas.height - 5);
    },

    updateEvalGraph() {
        if (!this.evalGraphCtx || !this.elements.evalGraph) return;

        const canvas = this.elements.evalGraph;
        const ctx = this.evalGraphCtx;
        const history = this.state.evalHistory;

        // Clear and redraw
        this.clearEvalGraph();
        if (history.length === 0) return;

        // Draw eval line
        ctx.strokeStyle = '#4ecdc4';
        ctx.lineWidth = 2;
        ctx.beginPath();

        const padding = 30;
        const graphWidth = canvas.width - padding;
        const graphHeight = canvas.height;
        const maxMoves = Math.max(history.length, 40);
        const evalRange = 10; // -5 to +5

        history.forEach((point, i) => {
            const x = padding + (i / maxMoves) * graphWidth;
            const evalClamped = Math.max(-5, Math.min(5, point.eval));
            const y = graphHeight / 2 - (evalClamped / evalRange) * graphHeight;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();
        if (history.length === 1) {
            const evalClamped = Math.max(-5, Math.min(5, history[0].eval));
            const y = graphHeight / 2 - (evalClamped / evalRange) * graphHeight;
            ctx.fillStyle = '#4ecdc4';
            ctx.beginPath();
            ctx.arc(padding, y, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        // Fill areas
        ctx.globalAlpha = 0.2;

        // White advantage area
        ctx.fillStyle = '#e0e0e0';
        ctx.beginPath();
        ctx.moveTo(padding, canvas.height / 2);
        history.forEach((point, i) => {
            const x = padding + (i / maxMoves) * graphWidth;
            const evalClamped = Math.max(0, Math.min(5, point.eval));
            const y = graphHeight / 2 - (evalClamped / evalRange) * graphHeight;
            ctx.lineTo(x, y);
        });
        ctx.lineTo(padding + ((history.length - 1) / maxMoves) * graphWidth, canvas.height / 2);
        ctx.closePath();
        ctx.fill();

        // Black advantage area
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.moveTo(padding, canvas.height / 2);
        history.forEach((point, i) => {
            const x = padding + (i / maxMoves) * graphWidth;
            const evalClamped = Math.min(0, Math.max(-5, point.eval));
            const y = graphHeight / 2 - (evalClamped / evalRange) * graphHeight;
            ctx.lineTo(x, y);
        });
        ctx.lineTo(padding + ((history.length - 1) / maxMoves) * graphWidth, canvas.height / 2);
        ctx.closePath();
        ctx.fill();

        ctx.globalAlpha = 1;
    },

    // ===== TOURNAMENT =====
    renderTournamentEngineList() {
        if (!this.elements.tournamentEngineList) return;

        this.elements.tournamentEngineList.innerHTML = this.engines.map(engine => {
            const engineAvailability = this.getEngineAvailability(engine);
            const runnable = engineAvailability.available && !!engine.workerPath;
            const availability = runnable
                ? ''
                : `<span class="engine-availability">${this.escapeTournamentText(engineAvailability.reason || 'Unavailable')}</span>`;
            return `
            <label class="tournament-engine-item${runnable ? '' : ' is-unavailable'}">
                <input type="checkbox" value="${this.escapeTournamentText(engine.id)}"${runnable ? ' checked' : ' disabled'}>
                <span class="engine-name">${this.escapeTournamentText(engine.name)}</span>
                <span class="engine-tier">Tier ${this.escapeTournamentText(engine.tier)}</span>
                ${availability}
            </label>
        `;
        }).join('');
    },

    getSelectedTournamentEngines() {
        if (!this.elements.tournamentEngineList) return [];

        const checkboxes = this.elements.tournamentEngineList.querySelectorAll('input[type="checkbox"]:checked');
        return Array.from(checkboxes)
            .map(cb => this.getEngineById(cb.value))
            .filter(engine => this.isEngineRunnable(engine));
    },

    startTournament() {
        const selectedEngines = this.getSelectedTournamentEngines();

        if (selectedEngines.filter(engine => engine.id === 'lc0-maia-1100-preview').length > 1) {
            this.updateGameStatus({ result: 'Only one Lc0 participant is permitted per competition.' });
            return;
        }

        if (selectedEngines.length < 2) {
            alert('Please select at least 2 engines for the tournament');
            return;
        }

        this.state.mode = 'tournament';

        const rounds = parseInt(this.elements.tournamentRounds?.value) || 3;
        const openingMode = this.elements.tournamentOpening?.value || 'free';

        console.log('[Arena] Starting tournament with', selectedEngines.length, 'engines,', rounds, 'rounds');

        this.state.tournament = {
            engines: selectedEngines,
            format: 'round-robin',
            rounds: rounds,
            openingMode: openingMode,
            standings: selectedEngines.map(e => ({ engine: e, points: 0, games: 0 })),
            currentRound: 0,
            games: []
        };

        this.generateRoundRobinPairings();
        this.updateTournamentUI();
        this.playNextTournamentGame();
    },

    generateRoundRobinPairings() {
        const { engines, currentRound, rounds } = this.state.tournament;

        if (currentRound >= rounds) {
            console.log('[Arena] Tournament complete!');
            return [];
        }

        if (!window.ArenaTournamentScheduler?.getRoundPairings) {
            throw new Error('Arena round-robin scheduler is unavailable.');
        }
        const pairings = ArenaTournamentScheduler.getRoundPairings(engines, currentRound)
            .map(pairing => ({ ...pairing, result: null }));

        this.state.tournament.games.push(...pairings);
        return pairings;
    },

    playNextTournamentGame() {
        const pendingGame = this.state.tournament.games.find(g => g.result === null);

        if (!pendingGame) {
            this.state.tournament.currentRound++;
            if (this.state.tournament.currentRound < this.state.tournament.rounds) {
                this.generateRoundRobinPairings();
                this.playNextTournamentGame();
            } else {
                this.finishTournament();
            }
            return;
        }

        // Set up the match
        this.state.whiteEngine = pendingGame.white;
        this.state.blackEngine = pendingGame.black;
        this.updateEngineInfo();

        // Start the game
        this.startMatch({ competitionMode: 'tournament' });
    },

    recordTournamentResult(result) {
        const pendingGame = this.state.tournament.games.find(g => g.result === null);
        if (!pendingGame) return;

        pendingGame.result = result;
        pendingGame.moves = (this.state.currentGame?.moves || []).map(move => ({ ...move }));
        pendingGame.runtimeIdentities = this.state.currentGame?.runtimeIdentities || null;
        pendingGame.startFen = this.state.currentGame?.startFen || '';
        pendingGame.endFen = this.game?.fen?.() || '';
        pendingGame.termination = this.state.currentGame?.termination || '';

        // Update standings
        const whiteStanding = this.state.tournament.standings.find(s => s.engine.id === pendingGame.white.id);
        const blackStanding = this.state.tournament.standings.find(s => s.engine.id === pendingGame.black.id);

        if (result === '1-0') {
            whiteStanding.points += 1;
        } else if (result === '0-1') {
            blackStanding.points += 1;
        } else {
            whiteStanding.points += 0.5;
            blackStanding.points += 0.5;
        }

        whiteStanding.games++;
        blackStanding.games++;

        this.updateTournamentUI();
    },

    finishTournament() {
        console.log('[Arena] Tournament finished!');
        this.runtimeManager.stopAll();
        this.updateTournamentUI();

        // Show winner
        const winner = this.getRankedTournamentStandings()[0]?.standing;
        if (this.elements.tournamentProgress) {
            this.elements.tournamentProgress.innerHTML = `
                <div class="tournament-winner">
                    <i class="fas fa-trophy" aria-hidden="true"></i>
                    Winner: ${this.escapeTournamentText(winner?.engine?.name || 'Participant')} (${this.formatTournamentPoints(winner?.points || 0)} points)
                </div>
            `;
        }
    },

    escapeTournamentText(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    },

    formatTournamentPoints(points) {
        const numericPoints = Number(points) || 0;
        return Number.isInteger(numericPoints) ? String(numericPoints) : numericPoints.toFixed(1);
    },

    getRankedTournamentStandings() {
        const tournament = this.state.tournament;
        const standings = tournament.standings.length > 0
            ? tournament.standings
            : this.getSelectedTournamentEngines().map(engine => ({ engine, points: 0, games: 0 }));
        const participantOrder = new Map(
            (tournament.engines.length > 0 ? tournament.engines : standings.map(item => item.engine))
                .map((participant, index) => [participant.id, index])
        );
        const ranked = standings
            .map((standing, index) => ({ standing, seedIndex: participantOrder.get(standing.engine.id) ?? index }))
            .sort((a, b) => b.standing.points - a.standing.points || a.seedIndex - b.seedIndex);

        return ranked.map((entry, index) => {
            const tied = ranked.some((candidate, candidateIndex) => (
                candidateIndex !== index && candidate.standing.points === entry.standing.points
            ));
            const rank = ranked.findIndex(candidate => candidate.standing.points === entry.standing.points) + 1;
            return { ...entry, rank, tied };
        });
    },

    getTournamentHeadToHead(participantId, opponentId) {
        if (participantId === opponentId) {
            return { notation: '\u2014', label: 'Same participant', state: 'self' };
        }

        const notations = this.state.tournament.games
            .filter(game => game.result !== null && (
                (game.white.id === participantId && game.black.id === opponentId)
                || (game.white.id === opponentId && game.black.id === participantId)
            ))
            .map((game) => {
                if (game.result === '1/2-1/2') return '\u00bd';
                const participantIsWhite = game.white.id === participantId;
                const participantWon = (participantIsWhite && game.result === '1-0')
                    || (!participantIsWhite && game.result === '0-1');
                return participantWon ? '1' : '0';
            });

        if (notations.length === 0) {
            return { notation: '', label: 'Not played', state: 'unplayed' };
        }
        return {
            notation: notations.join(' \u00b7 '),
            label: notations.join(', '),
            state: 'played'
        };
    },

    updateTournamentUI() {
        if (this.elements.tournamentStandings) {
            const rankedStandings = this.getRankedTournamentStandings();
            const participants = rankedStandings.map(entry => entry.standing.engine);
            this.elements.tournamentStandings.innerHTML = rankedStandings.length > 0 ? `
                <table class="standings-table" aria-label="Live tournament crosstable">
                    <caption class="sr-only">Live tournament standings and head-to-head results</caption>
                    <thead>
                        <tr>
                            <th class="standings-rank" scope="col">#</th>
                            <th class="standings-participant" scope="col">Participant</th>
                            ${participants.map((participant, index) => `
                                <th class="standings-opponent" scope="col" aria-label="Opponent ${index + 1}: ${this.escapeTournamentText(participant.name)}" title="${this.escapeTournamentText(participant.name)}">${index + 1}</th>
                            `).join('')}
                            <th class="standings-points" scope="col">Pts</th>
                            <th class="standings-games" scope="col">Games</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rankedStandings.map(({ standing, rank, tied }) => `
                            <tr data-participant-id="${this.escapeTournamentText(standing.engine.id)}">
                                <td class="standings-rank" aria-label="Rank ${rank}${tied ? ', tied' : ''}">${rank}${tied ? '<span aria-hidden="true">=</span>' : ''}</td>
                                <th class="standings-participant" scope="row">${this.escapeTournamentText(standing.engine.name)}</th>
                                ${participants.map((opponent) => {
                                    const result = this.getTournamentHeadToHead(standing.engine.id, opponent.id);
                                    return `<td class="standings-result is-${result.state}" aria-label="${result.label}">${result.notation}</td>`;
                                }).join('')}
                                <td class="standings-points">${this.formatTournamentPoints(standing.points)}</td>
                                <td class="standings-games">${standing.games}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            ` : '<div class="tournament-standings-empty">Select at least three participants to preview standings.</div>';
        }

        if (this.elements.tournamentProgress) {
            const { engines, currentRound, rounds, games } = this.state.tournament;
            if (engines.length === 0) {
                const selectedCount = this.getSelectedTournamentEngines().length;
                this.elements.tournamentProgress.textContent = `Ready \u2022 ${selectedCount} participants selected`;
            } else if (currentRound >= rounds) {
                const completedGames = games.filter(game => game.result !== null).length;
                this.elements.tournamentProgress.textContent = `Tournament complete \u2022 ${completedGames} games`;
            } else {
                const roundGames = games.filter(game => (game.round ?? currentRound) === currentRound);
                const completedRoundGames = roundGames.filter(game => game.result !== null).length;
                this.elements.tournamentProgress.textContent = `Round ${currentRound + 1} of ${rounds} \u2022 Games ${completedRoundGames}/${roundGames.length}`;
            }
        }
    },

    // ===== SECTION LIFECYCLE =====
    onEnter() {
        console.log('[Arena] Section entered');
        this.state.hasEntered = true;
        const mobileSectionName = document.getElementById('headerSectionName');
        if (mobileSectionName) mobileSectionName.textContent = 'CAISSA Engine Arena';

        // Re-cache elements (in case they weren't ready on init)
        // CRITICAL: Always re-cache on enter to ensure fresh DOM references
        this.cacheElements();

        // CRITICAL FIX: Always render engine selectors on enter (after paint)
        console.log('[Arena] Rendering engine selectors...');
        requestAnimationFrame(() => {
            this.renderEngineSelectors();
            this.renderTournamentEngineList();
            this.updateTournamentUI();
        });

        // Disable controls while board mounts
        this.disableMatchControls();

        // Mount the board (will enable controls when ready)
        this.mountBoard();

        // Ensure board resize after section is visible
        this.settleLayout();

        // Pre-warm engines to reduce start delay
        this.prewarmEngines();

        // Initialize eval graph
        this.initEvalGraph();

        this.updateGameStatus();
    },

    onExit() {
        console.log('[Arena] Section exited');
        this.stopReviewPlayback({ render: false });
        this.state.startToken += 1;
        clearTimeout(this._tournamentAdvanceTimer);
        this._tournamentAdvanceTimer = null;
        this.state.loopActive = false;
        this.cancelActiveSearch('arena section exited');
        this.state.loopRunning = false;
        if (this.state.matchState !== 'idle') {
            this.stopMatch();
        } else {
            this.destroyEngines();
        }
        this.teardownBoardSizing();
    },

    /**
     * Update board position
     */
    updateBoardPosition(fen) {
        if (this.board && fen) {
            this.board.position(this.getBoardPlacement(fen), false);
            requestAnimationFrame(() => {
                this.board?.resize?.();
                this.syncBoardAndGraphSize();
            });
        }
    },

    getBoardPlacement(fen) {
        const placement = String(fen || '').trim().split(/\s+/)[0];
        return placement || 'start';
    },

    /**
     * Reset board to starting position
     */
    resetBoard() {
        // A new Match or Tournament game always returns the display to Live.
        // This is presentation cleanup only and precedes any live-game reset.
        this.resetReviewState({ render: false });
        if (this.game) {
            if (this.state.customStartFen) {
                this.game.load(this.state.customStartFen);
            } else {
                this.game.reset();
            }
        }
        if (this.board) {
            this.board.position(this.getBoardPlacement(this.game?.fen()), false);
        }
        this.state.evalHistory = [];
        this.clearEvalGraph();

        this.state.review.displayFen = this.game?.fen?.() || '';
        this.renderMoveHistory();

        // Reset status
        this.updateGameStatus({
            turn: this.game?.turn() === 'b' ? 'black' : 'white',
            moveCount: 0
        });
    }
};

// Resolve the internal candidate gate before Arena snapshots its providers.
const initializeArena = async () => {
    if (location.pathname === '/arena-preview') await window.CaissaArenaPreview?.prepare?.();
    CaissaArena.init();
};
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeArena);
} else {
    initializeArena();
}

// Register with navigation system
if (window.CaissaNavigation) {
    CaissaNavigation.registerSection('arena', CaissaArena);
} else {
    // Wait for navigation to be ready
    window.addEventListener('caissa-navigation-ready', () => {
        if (window.CaissaNavigation) {
            CaissaNavigation.registerSection('arena', CaissaArena);
        }
    });
}

// Expose globally
window.CaissaArena = CaissaArena;

