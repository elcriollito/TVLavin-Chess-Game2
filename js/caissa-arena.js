/**
 * CAISSA Arena Module
 *
 * Engine vs Engine battles and tournaments
 * Supports multiple engines with scalable architecture
 */

const CaissaArena = {
    // ===== ENGINE REGISTRY =====
    engines: [
        {
            id: 'stockfish-16',
            name: 'Stockfish 16',
            tier: 'A',
            description: 'World champion engine, maximum strength',
            elo: 3600,
            workerPath: 'stockfish.js', // Default engine
            options: { depth: 20, threads: 4 }
        },
        {
            id: 'stockfish-lite',
            name: 'Stockfish Lite',
            tier: 'B',
            description: 'Reduced strength for training',
            elo: 2800,
            workerPath: 'stockfish.js',
            options: { depth: 12, threads: 2, skillLevel: 15 }
        },
        {
            id: 'stockfish-beginner',
            name: 'Stockfish Beginner',
            tier: 'C',
            description: 'Beginner-friendly opponent',
            elo: 1800,
            workerPath: 'stockfish.js',
            options: { depth: 8, threads: 1, skillLevel: 5 }
        },
        {
            id: 'lc0-sim',
            name: 'Leela Chess Zero (Sim)',
            tier: 'A',
            description: 'Neural network style (simulated)',
            elo: 3500,
            workerPath: 'stockfish.js', // Placeholder until LC0 is integrated
            options: { depth: 18, threads: 4 }
        },
        {
            id: 'komodo-sim',
            name: 'Komodo Dragon (Sim)',
            tier: 'A',
            description: 'Positional style engine (simulated)',
            elo: 3550,
            workerPath: 'stockfish.js',
            options: { depth: 20, threads: 4 }
        }
    ],

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
        moveDelay: 1000,
        currentGame: null,
        evalHistory: [], // For graph: [{move: 1, eval: 0.3}, ...]
        boardMounted: false,
        loopActive: false, // Is engine loop running
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
        this.cacheElements();
        this.bindEvents();
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

            // Game status
            statusWhiteName: document.getElementById('arenaStatusWhite'),
            statusBlackName: document.getElementById('arenaStatusBlack'),
            statusTurn: document.getElementById('arenaStatusTurn'),
            statusMoves: document.getElementById('arenaStatusMoves'),
            statusResult: document.getElementById('arenaStatusResult'),

            // Evaluation panel
            evalEngineName: document.getElementById('arenaEvalEngine'),
            evalScore: document.getElementById('arenaEvalScore'),
            evalDepth: document.getElementById('arenaEvalDepth'),
            evalNodes: document.getElementById('arenaEvalNodes'),
            evalPV: document.getElementById('arenaEvalPV'),

            // Eval graph canvas
            evalGraph: document.getElementById('arenaEvalGraph'),

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
                const containerHeight = containerRect.height - 32;

                // Calculate ideal board size (use smaller dimension for square board)
                let idealSize = Math.min(containerWidth, containerHeight);

                // Clamp to reasonable bounds (chess.com style)
                // Desktop: 480-700px, Mobile: 300-420px
                const isMobile = window.innerWidth < 768;
                const minSize = isMobile ? 300 : 480;
                const maxSize = isMobile ? 420 : 700;

                const boardSize = Math.max(minSize, Math.min(maxSize, idealSize));

                // Apply size to board mount container
                boardMount.style.width = `${boardSize}px`;
                boardMount.style.height = `${boardSize}px`;

                console.log(`[Arena] Resizing board: ${boardSize}px (container: ${containerWidth}x${containerHeight})`);

                // Trigger chessboard.js resize
                this.board.resize();
            }, 150);
        });

        this.resizeObserver.observe(boardContainer);
        console.log('[Arena] ResizeObserver set up with auto-sizing');
    },

    bindEvents() {
        // Tab switching
        this.elements.tabMatch?.addEventListener('click', () => this.switchTab('match'));
        this.elements.tabTournament?.addEventListener('click', () => this.switchTab('tournament'));

        // Engine selection
        this.elements.whiteEngineSelect?.addEventListener('change', (e) => {
            this.selectEngine('white', e.target.value);
        });
        this.elements.blackEngineSelect?.addEventListener('change', (e) => {
            this.selectEngine('black', e.target.value);
        });
        this.elements.swapEnginesBtn?.addEventListener('click', () => this.swapEngines());

        // Match controls
        this.elements.moveDelayInput?.addEventListener('change', (e) => {
            this.state.moveDelay = parseInt(e.target.value) || 1000;
        });
        this.elements.startMatchBtn?.addEventListener('click', () => this.startMatch());
        this.elements.pauseMatchBtn?.addEventListener('click', () => this.togglePause());
        this.elements.stopMatchBtn?.addEventListener('click', () => this.stopMatch());

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

    // ===== ENGINE MANAGEMENT =====
    renderEngineSelectors() {
        console.log('[Arena] Populating engine selects...');
        console.log('[Arena] Available engines:', this.engines.length);

        const createOptions = (selectElement, selectedId, label) => {
            if (!selectElement) {
                console.error(`[Arena] ${label} select element NOT FOUND!`);
                return;
            }

            selectElement.innerHTML = this.engines.map(engine => `
                <option value="${engine.id}" ${engine.id === selectedId ? 'selected' : ''}>
                    ${engine.name} (Tier ${engine.tier})
                </option>
            `).join('');

            console.log(`[Arena] ${label} populated with ${this.engines.length} engines`);
        };

        // Default selections
        this.state.whiteEngine = this.engines[0];
        this.state.blackEngine = this.engines[1];

        console.log('[Arena] Default engines:', this.state.whiteEngine?.name, 'vs', this.state.blackEngine?.name);

        createOptions(this.elements.whiteEngineSelect, this.state.whiteEngine.id, 'WHITE');
        createOptions(this.elements.blackEngineSelect, this.state.blackEngine.id, 'BLACK');

        this.updateEngineInfo();

        console.log('[Arena] Engine selectors ready!');
    },

    selectEngine(color, engineId) {
        const engine = this.engines.find(e => e.id === engineId);
        if (!engine) return;

        if (color === 'white') {
            this.state.whiteEngine = engine;
        } else {
            this.state.blackEngine = engine;
        }

        this.updateEngineInfo();
    },

    swapEngines() {
        const temp = this.state.whiteEngine;
        this.state.whiteEngine = this.state.blackEngine;
        this.state.blackEngine = temp;

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
    }

    // ===== MATCH CONTROLS =====
    async startMatch() {
        // Prevent double-start
        if (this.state.matchState === 'running') {
            console.warn('[Arena] Match already running');
            return;
        }

        if (!this.state.whiteEngine || !this.state.blackEngine) {
            alert('Please select both engines');
            return;
        }

        console.log('[Arena] Starting match:', this.state.whiteEngine.name, 'vs', this.state.blackEngine.name);

        // Wait for board to be mounted if not ready yet
        if (!this.board || !this.state.boardMounted) {
            console.log('[Arena] Waiting for board mount...');
            try {
                await this.waitForBoardMounted({ timeoutMs: 3000, pollMs: 50 });
                console.log('[Arena] Board ready, starting match');
            } catch (error) {
                console.error('[Arena] Board mount failed:', error.message);
                alert('Board failed to mount. Please refresh and try again.');
                return;
            }
        }

        // Initialize engines if not ready
        if (!this.enginesReady) {
            console.log('[Arena] Engines not ready, initializing...');
            const success = await this.initEngines();
            if (!success) {
                alert('Failed to initialize engines. Please try again.');
                return;
            }
        }

        // Reset game state
        this.resetBoard();

        // Set match state
        this.state.matchState = 'running';
        this.state.loopActive = true;
        this.state.evalHistory = [];
        this.state.currentGame = {
            white: this.state.whiteEngine,
            black: this.state.blackEngine,
            moves: [],
            startTime: Date.now()
        };

        // Hide result from previous game
        if (this.elements.statusResult) {
            this.elements.statusResult.style.display = 'none';
        }

        // Update UI
        this.updateMatchControls();
        this.updateGameStatus({
            turn: 'white',
            moveCount: 0
        });
        this.clearEvalGraph();

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
        }, 500); // Small delay to ensure UI is updated
    },

    togglePause() {
        if (this.state.matchState === 'running') {
            // Pause the match
            this.state.matchState = 'paused';
            this.state.loopActive = false;
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
    },

    stopMatch() {
        console.log('[Arena] Stopping match');
        this.state.matchState = 'idle';
        this.state.loopActive = false;

        // Stop any ongoing engine calculations
        if (this.whiteEngineInstance) {
            this.whiteEngineInstance.stop();
        }
        if (this.blackEngineInstance) {
            this.blackEngineInstance.stop();
        }

        window.dispatchEvent(new CustomEvent('caissa-arena-stop'));
        this.updateMatchControls();

        // Show stopped message
        if (this.elements.statusResult) {
            this.elements.statusResult.textContent = 'Match stopped';
            this.elements.statusResult.style.display = 'block';
        }
    },

    updateMatchControls() {
        const { matchState } = this.state;
        const { startMatchBtn, pauseMatchBtn, stopMatchBtn } = this.elements;

        if (startMatchBtn) {
            startMatchBtn.style.display = matchState === 'idle' ? 'block' : 'none';
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
    },

    /**
     * Enable match controls after board is mounted
     */
    enableMatchControls() {
        const { startMatchBtn } = this.elements;
        if (startMatchBtn) {
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
        const { statusTurn, statusMoves, statusResult } = this.elements;

        if (statusTurn && data.turn) {
            const engineName = data.turn === 'white'
                ? this.state.whiteEngine?.name
                : this.state.blackEngine?.name;
            statusTurn.textContent = `${data.turn === 'white' ? 'White' : 'Black'} (${engineName})`;
        }

        if (statusMoves && data.moveCount !== undefined) {
            statusMoves.textContent = data.moveCount;
        }

        if (statusResult && data.result) {
            statusResult.textContent = data.result;
            statusResult.style.display = 'block';
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
    async initEngines() {
        console.log('[Arena] Initializing engine instances...');

        // Check if StockfishEngine class is available
        if (typeof StockfishEngine === 'undefined') {
            console.error('[Arena] StockfishEngine class not found!');
            return false;
        }

        try {
            // Create white engine
            this.whiteEngineInstance = new StockfishEngine();

            // Create black engine
            this.blackEngineInstance = new StockfishEngine();

            // Create evaluator engine
            this.evaluatorEngine = new StockfishEngine();

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

    /**
     * Main engine loop for Arena matches
     * Self-contained - doesn't depend on app.js EVE system
     */
    async runEngineLoop() {
        // Safety check
        if (this.state.matchState !== 'running' || !this.state.loopActive) {
            console.log('[Arena] Loop stopped - match not running');
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

        try {
            // Request best move from engine
            const bestMove = await this.getEngineMove(currentEngine, fen, depth);

            if (!bestMove) {
                console.error('[Arena] Engine returned no move');
                this.handleError('Engine returned no move');
                return;
            }

            // Parse UCI move format (e.g., "e2e4" -> {from: "e2", to: "e4"})
            const from = bestMove.substring(0, 2);
            const to = bestMove.substring(2, 4);
            const promotion = bestMove.length > 4 ? bestMove.substring(4, 5) : undefined;

            // Attempt the move
            const moveResult = this.game.move({
                from: from,
                to: to,
                promotion: promotion
            });

            if (!moveResult) {
                console.error('[Arena] Invalid move from engine:', bestMove);
                this.handleError(`Invalid move: ${bestMove}`);
                return;
            }

            console.log(`[Arena] Move played: ${moveResult.san}`);

            // Update board display
            if (this.board) {
                this.board.position(this.game.fen());
            } else {
                console.error('[Arena] Board is null, cannot update position');
                this.handleError('Board not mounted');
                return;
            }

            // Record move
            if (this.state.currentGame) {
                this.state.currentGame.moves.push({
                    move: moveResult.san,
                    uci: bestMove,
                    fen: this.game.fen(),
                    turn: isWhiteTurn ? 'white' : 'black'
                });
            }

            // Update move history display
            this.updateMoveHistory(moveResult);

            // Update status
            this.updateGameStatus({
                turn: this.game.turn() === 'w' ? 'white' : 'black',
                moveCount: this.game.history().length
            });

            // Request evaluation for current position
            this.evaluatePosition(this.game.fen());

            // Check if game is still running
            if (this.state.matchState !== 'running' || !this.state.loopActive) {
                console.log('[Arena] Loop stopped after move');
                return;
            }

            // Wait for configured delay, then continue loop
            setTimeout(() => {
                this.runEngineLoop();
            }, this.state.moveDelay);

        } catch (error) {
            console.error('[Arena] Engine loop error:', error);
            this.handleError(error.message);
        }
    },

    /**
     * Get move from engine (Promise wrapper)
     */
    getEngineMove(engine, fen, depth) {
        return new Promise((resolve, reject) => {
            if (!engine || !engine.isReady()) {
                reject(new Error('Engine not ready'));
                return;
            }

            // Set up callback for best move
            engine.getBestMove(fen, (bestMove) => {
                console.log(`[Arena] Engine returned: ${bestMove}`);
                resolve(bestMove);
            }, { depth: depth });

            // Timeout after 30 seconds
            setTimeout(() => {
                reject(new Error('Engine move timeout'));
            }, 30000);
        });
    },

    /**
     * Evaluate current position and update eval panel + graph
     */
    evaluatePosition(fen) {
        if (!this.evaluatorEngine || !this.evaluatorReady) {
            return;
        }

        // Set up info callback to capture evaluation data
        this.evaluatorEngine.onInfo = (info) => {
            if (info.depth >= 12 && info.pv && info.pv.length > 0) {
                // Calculate evaluation score (white perspective)
                let evalScore = 0;
                if (info.mate !== null) {
                    evalScore = info.mate > 0 ? 99 : -99; // Mate in X moves
                } else if (info.score !== null) {
                    evalScore = info.score; // Already in pawns (white perspective)
                }

                // Update eval panel
                this.updateEvalPanelWithInfo({
                    score: evalScore,
                    mate: info.mate,
                    depth: info.depth,
                    nodes: info.nodes,
                    pv: info.pv,
                    turn: this.game.turn() === 'w' ? 'white' : 'black'
                });

                // Add to eval history for graph
                this.state.evalHistory.push({
                    move: this.game.history().length,
                    eval: evalScore
                });

                // Update graph
                this.updateEvalGraph();
            }
        };

        // Start analysis with short movetime
        this.evaluatorEngine.setPosition(fen);
        this.evaluatorEngine.go({ movetime: 250 }); // 250ms quick eval
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
        if (this.elements.statusResult) {
            this.elements.statusResult.textContent = result;
            this.elements.statusResult.style.display = 'block';
        }

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
        this.updateMatchControls();

        if (this.elements.statusResult) {
            this.elements.statusResult.textContent = `Error: ${message}`;
            this.elements.statusResult.style.display = 'block';
        }
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

        if (history.length < 2) return;

        // Clear and redraw
        this.clearEvalGraph();

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

        // CRITICAL FIX: Always render engine selectors on enter
        // The previous check `!this.elements.whiteEngineSelect?.options?.length`
        // was unreliable because:
        // 1. Element might be null (not found)
        // 2. Element might exist but options were cleared by DOM manipulation
        // 3. Timing issues with section switching
        // Solution: Force render engines EVERY time we enter Arena section
        console.log('[Arena] Rendering engine selectors...');
        this.renderEngineSelectors();
        this.renderTournamentEngineList();

        // Disable controls while board mounts
        this.disableMatchControls();

        // Mount the board (will enable controls when ready)
        this.mountBoard();

        // Initialize eval graph
        this.initEvalGraph();
    },

    onExit() {
        console.log('[Arena] Section exited');
        // Don't destroy the board, just leave it
        // Stop any running match if needed
        if (this.state.matchState === 'running') {
            // Optionally stop - for now we let it run
            // this.stopMatch();
        }
    },

    /**
     * Update board position
     */
    updateBoardPosition(fen) {
        if (this.board && fen) {
            this.board.position(fen, false);
        }
    },

    /**
     * Reset board to starting position
     */
    resetBoard() {
        if (this.game) {
            this.game.reset();
        }
        if (this.board) {
            this.board.position('start', false);
        }
        this.state.evalHistory = [];
        this.clearEvalGraph();

        // Clear move history display
        if (this.elements.moveHistory) {
            this.elements.moveHistory.innerHTML = '';
        }

        // Reset status
        this.updateGameStatus({
            turn: 'white',
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
