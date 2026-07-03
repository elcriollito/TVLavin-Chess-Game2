/**
 * CAISSA Arena Module
 *
 * Engine vs Engine battles and tournaments
 * Supports multiple engines with scalable architecture
 */

console.log('[Arena] caissa-arena.js parsed OK / loaded OK v=20260203-fix2');

const ArenaEngineRegistry = (window.EngineRegistry && typeof EngineRegistry.list === 'function')
    ? EngineRegistry.list()
    : [
        { id: 'stockfish', name: 'Stockfish 16', workerPath: 'engine/stockfish-working.js', enabled: true },
        { id: 'stockfish-lite', name: 'Stockfish Lite', workerPath: 'engine/stockfish-working.js', enabled: true }
    ];

const ARENA_ENGINE_MOVETIME_MS = 2000;
const ARENA_ENGINE_TIMEOUT_MS = 12000;

const CaissaArena = {
    // ===== ENGINE REGISTRY =====
    engines: ArenaEngineRegistry.map((engine, index) => ({
        id: engine.id,
        name: engine.name,
        tier: engine.tier || (index === 0 ? 'A' : 'B'),
        description: engine.description || (engine.id === 'stockfish' ? 'World champion engine' : 'Training mode'),
        elo: engine.elo || (engine.id === 'stockfish' ? 3600 : 2800),
        workerPath: engine.workerPath,
        options: engine.options || { depth: engine.defaultDepth || 15, threads: 2 },
        enabled: engine.enabled !== false,
        reason: engine.notes || engine.reason || ''
    })),

    // ===== BOARD INSTANCE =====
    board: null,
    game: null,

    // ===== ENGINE INSTANCES =====
    // Actual Stockfish engine workers for Arena
    whiteEngineInstance: null,
    blackEngineInstance: null,
    evaluatorEngine: null, // Dedicated evaluation engine
    enginesReady: false,
    evaluatorReady: false,

    // ===== STATE =====
    state: {
        mode: 'match', // 'match' or 'tournament'
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
        setupPiece: 'erase',
        boardMounted: false,
        loopActive: false, // Is engine loop running
        searchToken: 0,
        loopRunning: false,
        cancelPendingSearch: null,
        tournament: {
            engines: [],
            format: 'swiss',
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
        this.state.engineBinaryAvailable = typeof EngineAdapter !== 'undefined';
        if (!this.state.engineBinaryAvailable) {
            console.warn('[Arena] EngineAdapter class not found at init - engine adapter missing?');
        }
        this.cacheElements();
        this.bindEvents();
        if (this.elements.moveDelayInput) {
            this.elements.moveDelayInput.value = String(this.state.moveDelay);
        }
        this.renderEngineSelectors();
        this.renderTournamentEngineList();
        this.initEvalGraph();
        this.initGame();
        console.log('[Arena] Ready with', this.engines.length, 'engines');
    },

    /**
     * Initialize chess.js game instance for Arena
     */
    initGame() {
        // Create a new chess.js instance for Arena
        if (typeof Chess !== 'undefined') {
            this.game = new Chess();
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
            panelMatch: document.getElementById('arenaPanelMatch'),
            panelTournament: document.getElementById('arenaPanelTournament'),

            // Engine selectors
            whiteEngineSelect: document.getElementById('arenaWhiteEngine'),
            blackEngineSelect: document.getElementById('arenaBlackEngine'),
            swapEnginesBtn: document.getElementById('arenaSwapEngines'),

            // Match controls
            moveDelayInput: document.getElementById('arenaMoveDelay'),
            startMatchBtn: document.getElementById('arenaStartMatch'),
            pauseMatchBtn: document.getElementById('arenaPauseMatch'),
            stopMatchBtn: document.getElementById('arenaStopMatch'),
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

            // Game status
            statusWhiteName: document.getElementById('arenaStatusWhite'),
            statusBlackName: document.getElementById('arenaStatusBlack'),
            statusTurn: document.getElementById('arenaStatusTurn'),
            statusMoves: document.getElementById('arenaStatusMoves'),
            statusText: document.getElementById('arenaStatusText'),

            // Evaluation panel
            evalEngineName: document.getElementById('arenaEvalEngine'),
            evalScore: document.getElementById('arenaEvalScore'),
            evalDepth: document.getElementById('arenaEvalDepth'),
            evalNodes: document.getElementById('arenaEvalNodes'),
            evalPV: document.getElementById('arenaEvalPV'),

            // Eval graph canvas
            evalGraph: document.getElementById('arenaEvalGraph'),
            graphPanel: document.getElementById('arenaGraphPanel'),

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
        if (Array.isArray(ArenaEngineRegistry)) {
            return { engines: ArenaEngineRegistry, source: 'ArenaEngineRegistry' };
        }
        if (window.EngineRegistry && typeof EngineRegistry.list === 'function') {
            return { engines: EngineRegistry.list(), source: 'EngineRegistry.list' };
        }
        return { engines: [], source: 'none' };
    },

    ensureEngineRegistry() {
        const registry = this.getEngineRegistry();
        let engines = Array.isArray(registry.engines) ? registry.engines : [];
        let source = registry.source;

        if (engines.length === 0) {
            console.warn('[Arena] Engine registry empty. Applying fallback list.');
            engines = [
                { id: 'stockfish', name: 'Stockfish 16', workerPath: 'engine/stockfish-working.js', enabled: true },
                { id: 'stockfish-lite', name: 'Stockfish Lite', workerPath: 'engine/stockfish-working.js', enabled: true }
            ];
            source = 'fallback';
        }

        this.engines = engines.map((engine, index) => ({
            id: engine.id,
            name: engine.name,
            tier: engine.tier || (index === 0 ? 'A' : 'B'),
            description: engine.description || (engine.id === 'stockfish' ? 'World champion engine' : 'Training mode'),
            elo: engine.elo || (engine.id === 'stockfish' ? 3600 : 2800),
            workerPath: engine.workerPath,
            options: engine.options || { depth: engine.defaultDepth || 15, threads: 2 },
            enabled: engine.enabled !== false,
            reason: engine.notes || engine.reason || ''
        }));
        this.state.enginesAvailable = engines.length > 0;

        return { engines: this.engines, source };
    },

    createEngineInstance(engineConfig) {
        if (!engineConfig || engineConfig.enabled === false) return null;
        if (window.EngineRegistry && typeof EngineRegistry.createEngine === 'function') {
            const instance = EngineRegistry.createEngine(engineConfig.id);
            if (instance) return instance;
        }
        if (typeof EngineAdapter !== 'undefined') {
            return new EngineAdapter(engineConfig);
        }
        if (typeof StockfishEngine !== 'undefined') {
            return new StockfishEngine();
        }
        console.warn('[Arena] No engine adapter available for', engineConfig?.id);
        return null;
    },

    // ResizeObserver for dynamic board sizing
    resizeObserver: null,

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
            requestAnimationFrame(() => {
                if (this.board) this.board.resize();
            });
            this.enableMatchControls();
            return;
        }

        // Check if board is already mounted and valid
        if (this.board && this.state.boardMounted) {
            console.log('[Arena] Board already mounted, resizing...');
            this.board.resize();
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

            if (rect.width < 100) {
                // Container not ready, retry
                setTimeout(checkAndMount, 50);
                return;
            }

            // Board configuration
            const config = {
                draggable: false, // Arena boards are view-only (engine plays)
                position: 'start',
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
                this.resizeBoardNow();

                // Resize after short delay to ensure proper rendering
                setTimeout(() => {
                    if (this.board) {
                        this.board.resize();
                    }
                }, 100);

                // Another resize for safety and enable controls
                setTimeout(() => {
                    if (this.board) {
                        this.board.resize();
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
     * Set up ResizeObserver for dynamic board sizing (chess.com style)
     */
    setupResizeObserver() {
        // Clean up existing observer
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }

        const boardContainer = document.querySelector('.arena-board-container');
        const boardMount = this.elements.boardMount;

        if (!boardContainer || !boardMount || typeof ResizeObserver === 'undefined') return;

        let resizeTimeout = null;

        this.resizeObserver = new ResizeObserver((entries) => {
            // Debounce resize events
            if (resizeTimeout) clearTimeout(resizeTimeout);

            resizeTimeout = setTimeout(() => {
                if (!this.board || !this.state.boardMounted) return;

                // Get container dimensions
                const containerRect = boardContainer.getBoundingClientRect();
                const containerWidth = containerRect.width - 32; // padding
                const idealSize = containerWidth;

                // Clamp to reasonable bounds
                // Desktop: 480px target (~5" visual), Mobile: 280px min
                const isMobile = window.innerWidth < 768;
                const minSize = isMobile ? 280 : 380;
                const cssBoardSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--board-size'));
                const maxSize = Math.min(isMobile ? 520 : 660, cssBoardSize || Infinity);

                const boardSize = Math.max(minSize, Math.min(maxSize, idealSize));

                // Apply size to board mount container
                boardMount.style.width = `${boardSize}px`;
                boardMount.style.height = `${boardSize}px`;

                console.log(`[Arena] Resizing board: ${boardSize}px (container width: ${containerWidth}px)`);

                // Trigger chessboard.js resize
                this.board.resize();
                requestAnimationFrame(() => this.syncBoardAndGraphSize(boardSize));
            }, 150);
        });

        this.resizeObserver.observe(boardContainer);
        console.log('[Arena] ResizeObserver set up with auto-sizing');
    },

    resizeBoardNow() {
        const host = document.querySelector('.arena-board-zone');
        const boardMount = this.elements.boardMount;
        if (!host || !boardMount) return;

        const hostRect = host.getBoundingClientRect();
        const hostWidth = hostRect.width;
        if (!hostWidth || hostWidth < 50) return;

        const containerWidth = hostWidth - 32;
        const idealSize = containerWidth;

        const isMobile = window.innerWidth < 768;
        const minSize = isMobile ? 280 : 380;
        const cssBoardSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--board-size'));
        const maxSize = Math.min(isMobile ? 520 : 660, cssBoardSize || Infinity);
        const boardSize = Math.max(minSize, Math.min(maxSize, idealSize));

        boardMount.style.width = `${boardSize}px`;
        boardMount.style.height = `${boardSize}px`;

        if (this.board) {
            this.board.resize();
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

        if (graphPanel) {
            graphPanel.style.width = `${boardSize}px`;
        }
        if (!evalGraph) return;

        const canvasWidth = Math.max(256, Math.floor(boardSize - 24));
        if (evalGraph.width !== canvasWidth) {
            evalGraph.width = canvasWidth;
            this.evalGraphCtx = evalGraph.getContext('2d');
            this.clearEvalGraph();
            this.updateEvalGraph();
        }
    },

    settleLayout() {
        // Stage 1: Immediate resize (before any layout)
        this.resizeBoardNow();

        // Stage 2: Next animation frame (after paint)
        requestAnimationFrame(() => {
            this.resizeBoardNow();
        });

        // Stage 3: Font load settlement (if supported)
        if (document.fonts?.ready) {
            document.fonts.ready.then(() => {
                this.resizeBoardNow();
            });
        }

        // Stage 4: Short timeout for late shifts
        setTimeout(() => {
            this.resizeBoardNow();
        }, 100);

        // Stage 5: Setup continuous layout observer
        this.setupLayoutObserver();
    },

    setupLayoutObserver() {
        if (this.layoutObserver) {
            this.layoutObserver.disconnect();
        }

        const container = document.querySelector('.arena-board-zone');
        if (!container || typeof ResizeObserver === 'undefined') return;

        this.layoutObserver = new ResizeObserver(() => {
            requestAnimationFrame(() => {
                this.resizeBoardNow();
            });
        });

        this.layoutObserver.observe(container);
    },

    bindEvents() {
        // Tab switching
        this.elements.tabMatch?.addEventListener('click', () => this.switchTab('match'));
        this.elements.tabTournament?.addEventListener('click', () => this.switchTab('tournament'));

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
        this.elements.infiniteAnalysisBtn?.addEventListener('click', () => this.toggleInfiniteAnalysis());
        this.elements.setPositionBtn?.addEventListener('click', () => this.togglePositionPanel());
        this.elements.manualSetupBtn?.addEventListener('click', () => this.openManualSetup());
        this.elements.applyFenBtn?.addEventListener('click', () => this.applyCustomPosition());
        this.elements.useStartPositionBtn?.addEventListener('click', () => this.useInitialPosition());
        this.elements.setupCloseBtn?.addEventListener('click', () => this.closeManualSetup());
        this.elements.setupClearBtn?.addEventListener('click', () => this.setupBoardInstance?.position({}));
        this.elements.setupResetBtn?.addEventListener('click', () => this.resetManualSetup());
        this.elements.setupApplyBtn?.addEventListener('click', () => this.applyManualSetup());
        this.elements.setupBoard?.addEventListener('click', (event) => this.onManualSetupSquareClick(event));

        // Tournament controls
        this.elements.startTournamentBtn?.addEventListener('click', () => this.startTournament());

        // Listen for engine moves
        window.addEventListener('caissa-engine-move', (e) => this.onEngineMove(e.detail));
        window.addEventListener('caissa-analysis-update', (e) => this.updateEvalPanel(e.detail));
    },

    // ===== TAB SWITCHING =====
    switchTab(tab) {
        this.state.mode = tab;

        // Update tab styles
        this.elements.tabMatch?.classList.toggle('active', tab === 'match');
        this.elements.tabTournament?.classList.toggle('active', tab === 'tournament');

        // Show/hide panels
        if (this.elements.panelMatch) {
            this.elements.panelMatch.style.display = tab === 'match' ? 'block' : 'none';
        }
        if (this.elements.panelTournament) {
            this.elements.panelTournament.style.display = tab === 'tournament' ? 'block' : 'none';
        }
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
            return;
        }

        try {
            const candidate = new Chess();
            const loaded = candidate.load(fen);
            if (loaded === false) {
                throw new Error('Invalid FEN');
            }

            this.applyArenaPosition(candidate.fen(), 'Custom position');
        } catch (error) {
            this.setFenMessage('FEN could not be loaded. Check the position and try again.', true);
        }
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
        if (this.state.matchState === 'running' || this.state.matchState === 'paused') {
            this.stopMatch();
        }
        this.stopInfiniteAnalysis(false);

        this.state.matchState = 'idle';
        this.state.customStartFen = fen;
        this.resetBoard();
        this.updateBoardPosition(fen);
        this.updateMatchControls();

        const side = this.game?.turn() === 'b' ? 'Black' : 'White';
        if (this.elements.fenInput) {
            this.elements.fenInput.value = fen;
        }
        this.setFenMessage(`${label} ready. ${side} to move.`);
        this.updateGameStatus({ result: `Ready: ${label} (${side} to move)` });
        requestAnimationFrame(() => {
            this.board?.resize?.();
            this.syncBoardAndGraphSize();
        });
    },

    setFenMessage(message, isError = false) {
        if (!this.elements.fenMessage) return;
        this.elements.fenMessage.textContent = message;
        this.elements.fenMessage.classList.toggle('error', isError);
    },

    openManualSetup() {
        if (!this.elements.setupModal || typeof Chessboard === 'undefined') return;
        this.renderSetupPalette();
        this.elements.setupModal.classList.add('show');

        const fen = this.game?.fen() || this.state.customStartFen || 'start';
        const position = fen === 'start' ? 'start' : fen.split(' ')[0];
        if (!this.setupBoardInstance) {
            this.setupBoardInstance = Chessboard('arenaSetupBoard', {
                draggable: false,
                position,
                pieceTheme: 'img/chesspieces/wikipedia/{piece}.png',
                showNotation: true
            });
        } else {
            this.setupBoardInstance.position(position, false);
        }
        this.loadSetupOptionsFromFen(fen);
        requestAnimationFrame(() => this.setupBoardInstance?.resize?.());
    },

    closeManualSetup() {
        this.elements.setupModal?.classList.remove('show');
    },

    renderSetupPalette() {
        if (!this.elements.setupPalette || this.elements.setupPalette.children.length) return;
        const pieces = ['wP', 'wN', 'wB', 'wR', 'wQ', 'wK', 'bP', 'bN', 'bB', 'bR', 'bQ', 'bK'];
        pieces.forEach((piece) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'arena-setup-piece';
            button.dataset.piece = piece;
            button.title = piece;
            button.setAttribute('aria-label', `Select ${piece} for manual setup`);
            button.innerHTML = `<img src="img/chesspieces/wikipedia/${piece}.png" alt="${piece}">`;
            button.addEventListener('click', () => this.selectSetupPiece(piece));
            this.elements.setupPalette.appendChild(button);
        });
        const erase = document.createElement('button');
        erase.type = 'button';
        erase.className = 'arena-setup-piece active';
        erase.dataset.piece = 'erase';
        erase.title = 'Erase piece';
        erase.setAttribute('aria-label', 'Select eraser for manual setup');
        erase.innerHTML = '<i class="fas fa-eraser" aria-hidden="true"></i>';
        erase.addEventListener('click', () => this.selectSetupPiece('erase'));
        this.elements.setupPalette.appendChild(erase);
    },

    selectSetupPiece(piece) {
        this.state.setupPiece = piece;
        this.elements.setupPalette?.querySelectorAll('.arena-setup-piece').forEach((button) => {
            button.classList.toggle('active', button.dataset.piece === piece);
        });
    },

    onManualSetupSquareClick(event) {
        const squareElement = event.target.closest('.square-55d63');
        if (!squareElement || !this.setupBoardInstance) return;
        const squareClass = Array.from(squareElement.classList).find((name) => /^square-[a-h][1-8]$/.test(name));
        if (!squareClass) return;

        const square = squareClass.replace('square-', '');
        const position = this.setupBoardInstance.position();
        if (this.state.setupPiece === 'erase') {
            delete position[square];
        } else {
            position[square] = this.state.setupPiece;
        }
        this.setupBoardInstance.position(position, false);
    },

    resetManualSetup() {
        this.setupBoardInstance?.start?.(false);
        this.loadSetupOptionsFromFen(new Chess().fen());
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
            if (this.elements.setupMessage) {
                this.elements.setupMessage.textContent = 'Invalid position. Place both kings before applying.';
                this.elements.setupMessage.classList.add('error');
            }
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
                const disabledLabel = engine.enabled === false ? ' (WASM build needed)' : '';
                option.textContent = `${engine.name} (Tier ${engine.tier})${disabledLabel}`;
                if (engine.enabled === false) {
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
        const enabledEngines = this.engines.filter(e => e.enabled !== false);
        const savedWhiteId = window.localStorage?.getItem('caissa.arena.whiteEngineId') || '';
        const savedBlackId = window.localStorage?.getItem('caissa.arena.blackEngineId') || '';
        this.state.whiteEngine = this.engines.find(e => e.id === savedWhiteId && e.enabled !== false)
            || enabledEngines[0]
            || this.engines[0];
        this.state.blackEngine = this.engines.find(e => e.id === savedBlackId && e.enabled !== false)
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
        const adapterAvailable = typeof EngineAdapter !== 'undefined';
        const selectedEnginesValid = !!this.state.whiteEngine?.workerPath
            && !!this.state.blackEngine?.workerPath
            && this.state.whiteEngine?.enabled !== false
            && this.state.blackEngine?.enabled !== false;
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
        if (engine.enabled === false) {
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
        const adapterAvailable = typeof EngineAdapter !== 'undefined';
        const selectedEnginesValid = !!this.state.whiteEngine?.workerPath
            && !!this.state.blackEngine?.workerPath
            && this.state.whiteEngine?.enabled !== false
            && this.state.blackEngine?.enabled !== false;
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
    async startMatch() {
        // Prevent double-start
        if (this.state.matchState === 'running') {
            console.warn('[Arena] Match already running');
            return;
        }

        if (!this.state.whiteEngine || !this.state.blackEngine) {
            alert('Select both engines before starting a match.');
            return;
        }

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

        // Initialize engines if not ready
        if (!this.enginesReady) {
            console.log('[Arena] Engines not ready, initializing...');
            const success = await this.initEngines();
            if (!success) {
                alert('Engines could not start. Try again.');
                window.CaissaUI?.setButtonLoading(this.elements.startMatchBtn, false);
                return;
            }
        }

        // Reset game state
        this.resetBoard();
        this.cancelActiveSearch('match restart');
        this.state.loopRunning = false;
        this.whiteEngineInstance.newGame?.();
        this.blackEngineInstance.newGame?.();
        this.evaluatorEngine?.newGame?.();
        try {
            await Promise.all([
                this.waitForEngineReadyOk(this.whiteEngineInstance, 'white'),
                this.waitForEngineReadyOk(this.blackEngineInstance, 'black')
            ]);
        } catch (error) {
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
            startTime: Date.now()
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
            this.whiteEngineInstance?.stop?.();
            this.blackEngineInstance?.stop?.();
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
        this.state.matchState = 'idle';
        this.state.loopActive = false;
        this.cancelActiveSearch('match stopped');
        this.state.loopRunning = false;

        // Stop any ongoing engine calculations
        if (this.whiteEngineInstance) {
            this.whiteEngineInstance.stop();
        }
        if (this.blackEngineInstance) {
            this.blackEngineInstance.stop();
        }

        window.dispatchEvent(new CustomEvent('caissa-arena-stop'));
        this.updateMatchControls();

        this.updateGameStatus({ result: 'Match stopped' });
    },

    updateMatchControls() {
        const { matchState, analysisRunning } = this.state;
        const { startMatchBtn, pauseMatchBtn, stopMatchBtn, infiniteAnalysisBtn } = this.elements;

        if (startMatchBtn) {
            startMatchBtn.style.display = matchState === 'idle' && !analysisRunning ? 'block' : 'none';
        }
        if (pauseMatchBtn) {
            pauseMatchBtn.style.display = matchState === 'running' || matchState === 'paused' ? 'block' : 'none';
            pauseMatchBtn.innerHTML = matchState === 'paused'
                ? '<i class="fas fa-play"></i> Resume'
                : '<i class="fas fa-pause"></i> Pause';
        }
        if (stopMatchBtn) {
            stopMatchBtn.style.display = matchState !== 'idle' ? 'block' : 'none';
        }
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
        this.evaluatorEngine.stop?.();
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
        this.evaluatorEngine.go({ infinite: true });
        console.log('[Arena] Infinite analysis started', { fen });
    },

    stopInfiniteAnalysis(updateStatus = true) {
        if (!this.state.analysisRunning) return;
        this.evaluatorEngine?.stop?.();
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
            if (this.state.engineBinaryAvailable === false) {
                console.warn('[Arena] Not enabling controls: engine binary missing');
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
        const { statusTurn, statusMoves, statusText } = this.elements;

        if (statusTurn && data.turn) {
            const engineName = data.turn === 'white'
                ? this.state.whiteEngine?.name
                : this.state.blackEngine?.name;
            statusTurn.textContent = `${data.turn === 'white' ? 'White' : 'Black'} (${engineName})`;
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
        if (this.enginesReady || this._prewarming) return;
        if (this.state.engineBinaryAvailable === false) return;
        this._prewarming = true;
        this.initEngines()
            .catch(() => {})
            .finally(() => {
                this._prewarming = false;
            });
    },

    async initEngines() {
        console.log('[Arena] Initializing engine instances...');

        if (typeof EngineAdapter === 'undefined') {
            console.error('[Arena] EngineAdapter class not found!');
            return false;
        }

        try {
            const whiteConfig = this.state.whiteEngine || this.engines[0];
            const blackConfig = this.state.blackEngine || this.engines[1] || this.engines[0];
            const evalConfig = this.engines.find(e => e.id === 'stockfish') || whiteConfig;

            // Create white engine
            this.whiteEngineInstance = this.createEngineInstance(whiteConfig);

            // Create black engine
            this.blackEngineInstance = this.createEngineInstance(blackConfig);

            // Create evaluator engine
            this.evaluatorEngine = this.createEngineInstance(evalConfig);

            if (!this.whiteEngineInstance || !this.blackEngineInstance || !this.evaluatorEngine) {
                console.error('[Arena] Failed to create engine instances');
                return false;
            }

            // Wait for all engines to be ready
            await this.waitForEngines();

            this.enginesReady = true;
            this.evaluatorReady = true;
            console.log('[Arena] All engines ready (white, black, evaluator)!');
            return true;

        } catch (error) {
            console.error('[Arena] Failed to initialize engines:', error);
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
        if (this.whiteEngineInstance) {
            this.whiteEngineInstance.terminate();
            this.whiteEngineInstance = null;
        }
        if (this.blackEngineInstance) {
            this.blackEngineInstance.terminate();
            this.blackEngineInstance = null;
        }
        if (this.evaluatorEngine) {
            this.evaluatorEngine.terminate();
            this.evaluatorEngine = null;
        }
        this.enginesReady = false;
        this.evaluatorReady = false;
        console.log('[Arena] All engines destroyed');
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
            this.board.position(this.game.fen());
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

        this.updateMoveHistory(moveResult);

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
                engine.stop?.();
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

        this.evaluatorEngine.stop?.();
        this.evaluatorEngine.currentFen = fen;

        // Set up info callback to capture evaluation data
        this.evaluatorEngine.onInfo = (info) => {
            if (this.game.fen() !== fen) return;
            this.recordEvaluationInfo(info);
        };

        // Start analysis with short movetime
        this.evaluatorEngine.setPosition(fen);
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
            // Show first 5 moves of PV
            const pvMoves = data.pv.slice(0, 5).join(' ');
            evalPV.textContent = pvMoves;
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
            // Play next game after delay
            setTimeout(() => {
                this.playNextTournamentGame();
            }, 2000);
        }
    },

    /**
     * Handle errors during match
     */
    handleError(message) {
        this.state.matchState = 'idle';
        this.state.loopActive = false;
        this.cancelActiveSearch('arena error');
        this.state.loopRunning = false;
        this.updateMatchControls();

        console.warn('[Arena] Match stopped after error:', message);
        this.updateGameStatus({ result: 'Arena match stopped. Try starting a new match.' });
    },

    /**
     * Update move history display
     */
    updateMoveHistory(move) {
        if (!this.elements.moveHistory) return;

        const moveNum = Math.ceil(this.game.history().length / 2);
        const isWhite = move.color === 'w';

        if (isWhite) {
            // Start new row for white move
            const row = document.createElement('div');
            row.className = 'arena-move-row';
            row.innerHTML = `<span class="move-num">${moveNum}.</span>
                            <span class="move-white">${move.san}</span>
                            <span class="move-black">-</span>`;
            this.elements.moveHistory.appendChild(row);
        } else {
            // Fill in black move in last row
            const lastRow = this.elements.moveHistory.querySelector('.arena-move-row:last-child');
            if (lastRow) {
                const blackSpan = lastRow.querySelector('.move-black');
                if (blackSpan) {
                    blackSpan.textContent = move.san;
                }
            }
        }

        // Scroll to bottom
        this.elements.moveHistory.scrollTop = this.elements.moveHistory.scrollHeight;
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

        this.elements.tournamentEngineList.innerHTML = this.engines.map(engine => `
            <label class="tournament-engine-item">
                <input type="checkbox" value="${engine.id}" checked>
                <span class="engine-name">${engine.name}</span>
                <span class="engine-tier">Tier ${engine.tier}</span>
            </label>
        `).join('');
    },

    getSelectedTournamentEngines() {
        if (!this.elements.tournamentEngineList) return [];

        const checkboxes = this.elements.tournamentEngineList.querySelectorAll('input[type="checkbox"]:checked');
        return Array.from(checkboxes).map(cb => this.getEngineById(cb.value)).filter(Boolean);
    },

    startTournament() {
        const selectedEngines = this.getSelectedTournamentEngines();

        if (selectedEngines.length < 3) {
            alert('Please select at least 3 engines for the tournament');
            return;
        }

        const rounds = parseInt(this.elements.tournamentRounds?.value) || 3;
        const openingMode = this.elements.tournamentOpening?.value || 'free';

        console.log('[Arena] Starting tournament with', selectedEngines.length, 'engines,', rounds, 'rounds');

        this.state.tournament = {
            engines: selectedEngines,
            format: 'swiss',
            rounds: rounds,
            openingMode: openingMode,
            standings: selectedEngines.map(e => ({ engine: e, points: 0, games: 0 })),
            currentRound: 0,
            games: []
        };

        this.generateSwissPairings();
        this.updateTournamentUI();
        this.playNextTournamentGame();
    },

    generateSwissPairings() {
        const { engines, standings, currentRound, rounds } = this.state.tournament;

        if (currentRound >= rounds) {
            console.log('[Arena] Tournament complete!');
            return [];
        }

        // Sort by points for Swiss pairing
        const sorted = [...standings].sort((a, b) => b.points - a.points);

        const pairings = [];
        const paired = new Set();

        for (let i = 0; i < sorted.length; i++) {
            if (paired.has(sorted[i].engine.id)) continue;

            for (let j = i + 1; j < sorted.length; j++) {
                if (paired.has(sorted[j].engine.id)) continue;

                pairings.push({
                    white: sorted[i].engine,
                    black: sorted[j].engine,
                    result: null
                });

                paired.add(sorted[i].engine.id);
                paired.add(sorted[j].engine.id);
                break;
            }
        }

        this.state.tournament.games.push(...pairings);
        return pairings;
    },

    playNextTournamentGame() {
        const pendingGame = this.state.tournament.games.find(g => g.result === null);

        if (!pendingGame) {
            this.state.tournament.currentRound++;
            if (this.state.tournament.currentRound < this.state.tournament.rounds) {
                this.generateSwissPairings();
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
        this.startMatch();
    },

    recordTournamentResult(result) {
        const pendingGame = this.state.tournament.games.find(g => g.result === null);
        if (!pendingGame) return;

        pendingGame.result = result;

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
        // Sort final standings
        this.state.tournament.standings.sort((a, b) => b.points - a.points);
        this.updateTournamentUI();

        // Show winner
        const winner = this.state.tournament.standings[0];
        if (this.elements.tournamentProgress) {
            this.elements.tournamentProgress.innerHTML = `
                <div class="tournament-winner">
                    <i class="fas fa-trophy"></i>
                    Winner: ${winner.engine.name} (${winner.points} points)
                </div>
            `;
        }
    },

    updateTournamentUI() {
        // Update standings table
        if (this.elements.tournamentStandings) {
            const standings = this.state.tournament.standings;
            this.elements.tournamentStandings.innerHTML = `
                <table class="standings-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Engine</th>
                            <th>Pts</th>
                            <th>Games</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${standings.map((s, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td>${s.engine.name}</td>
                                <td>${s.points}</td>
                                <td>${s.games}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }

        // Update progress
        if (this.elements.tournamentProgress) {
            const { currentRound, rounds, games } = this.state.tournament;
            const completedGames = games.filter(g => g.result !== null).length;
            this.elements.tournamentProgress.innerHTML = `
                Round ${currentRound + 1} of ${rounds} | Games: ${completedGames}/${games.length}
            `;
        }
    },

    // ===== SECTION LIFECYCLE =====
    onEnter() {
        console.log('[Arena] Section entered');

        // Re-cache elements (in case they weren't ready on init)
        // CRITICAL: Always re-cache on enter to ensure fresh DOM references
        this.cacheElements();

        // CRITICAL FIX: Always render engine selectors on enter (after paint)
        console.log('[Arena] Rendering engine selectors...');
        requestAnimationFrame(() => {
            this.renderEngineSelectors();
            this.renderTournamentEngineList();
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
        // Don't destroy the board, just leave it
        // Stop any running match if needed
        if (this.state.matchState === 'running') {
            // Optionally stop - for now we let it run
            // this.stopMatch();
        }
        if (this.layoutObserver) {
            this.layoutObserver.disconnect();
            this.layoutObserver = null;
        }
    },

    /**
     * Update board position
     */
    updateBoardPosition(fen) {
        if (this.board && fen) {
            this.board.position(fen, false);
            requestAnimationFrame(() => {
                this.board?.resize?.();
                this.syncBoardAndGraphSize();
            });
        }
    },

    /**
     * Reset board to starting position
     */
    resetBoard() {
        if (this.game) {
            if (this.state.customStartFen) {
                this.game.load(this.state.customStartFen);
            } else {
                this.game.reset();
            }
        }
        if (this.board) {
            this.board.position(this.game?.fen() || 'start', false);
        }
        this.state.evalHistory = [];
        this.clearEvalGraph();

        // Clear move history display
        if (this.elements.moveHistory) {
            this.elements.moveHistory.innerHTML = '';
        }

        // Reset status
        this.updateGameStatus({
            turn: this.game?.turn() === 'b' ? 'black' : 'white',
            moveCount: 0
        });
    }
};

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => CaissaArena.init());
} else {
    CaissaArena.init();
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

