/**
 * CAISSA Chess Application
 * Main application logic and game management
 */

// ===== APPLICATION STATE =====
const App = {
    // Game state
    game: new Chess(),
    board: null,
    engine: null,
    openingBook: null, // Polyglot opening book
    openings: [
        { eco: 'C20', name: "King's Pawn Game", moves: 'e4 e5' },
        { eco: 'C50', name: 'Italian Game', moves: 'e4 e5 Nf3 Nc6 Bc4' },
        { eco: 'C60', name: 'Ruy Lopez', moves: 'e4 e5 Nf3 Nc6 Bb5' },
        { eco: 'B01', name: 'Scandinavian Defense', moves: 'e4 d5' },
        { eco: 'B20', name: 'Sicilian Defense', moves: 'e4 c5' },
        { eco: 'D00', name: "Queen's Pawn Game", moves: 'd4 d5' },
        { eco: 'D02', name: "Queen's Gambit", moves: 'd4 d5 c4' },
        { eco: 'A40', name: "Queen's Pawn", moves: 'd4' },
        { eco: 'A00', name: 'Bird Opening', moves: 'f4' }
    ],

    // Settings
    playerColor: 'white',
    gameMode: 'engine', // 'engine' or 'analysis'
    timeControl: 0, // seconds, 0 = no limit
    useOpeningBook: true, // Enable book moves

    // HOTFIX 4: Engine play control (independent of UI mode)
    engineEnabled: false, // Whether engine should play moves
    enginePlaysAs: 'black', // 'white' | 'black'
    engineDepth: 12, // Default search depth

    // Game state
    isPlayerTurn: true,
    gameActive: false,
    analyzing: false,
    editMode: false,
    isFlipped: false, // MINI PATCH: Track board flip state for eval bar orientation
    lastEvalCp: null,
    lastEvalMate: null,
    selectedEditorPiece: 'erase', // Piece to place in editor mode
    editorMoveSource: null, // Source square for move/adjust tool

    // Engine vs Engine
    eveMode: false,
    evePaused: false,
    eveRunning: false,
    engineWhite: null,
    engineBlack: null,
    eveMoveDelay: 1000,

    // MultiPV analysis
    multiPvEnabled: false,
    pvLines: {}, // Store up to 3 PV lines { 1: info, 2: info, 3: info }

    // History navigation
    moveHistory: [],
    currentMoveIndex: -1,

    // Loaded game metadata (from PGN)
    loadedGameInfo: null, // { white, black, date, result, event, ... }

    // Timers
    whiteTime: 0,
    blackTime: 0,
    timerInterval: null,
    lastMoveTime: null,

    // Pending promotion
    pendingPromotion: null,

    // Debug mode
    debug: false,

    // UI elements
    elements: {}
};

function engineSend(engine, cmd) {
    if (!engine) return;

    if (typeof engine.send === 'function') return engine.send(cmd);
    if (typeof engine.postMessage === 'function') return engine.postMessage(cmd);
    if (typeof engine.write === 'function') return engine.write(cmd);

    if (engine.worker && typeof engine.worker.postMessage === 'function') {
        return engine.worker.postMessage(cmd);
    }

    console.warn('[Engine] No send method found for cmd:', cmd, engine);
}

function engineNewGame(engine) {
    if (!engine) return;
    if (typeof engine.ucinewgame === 'function') return engine.ucinewgame();

    engineSend(engine, 'ucinewgame');
    engineSend(engine, 'isready');
}

// ===== UTILITY FUNCTIONS =====
function debugLog(...args) {
    if (App.debug) {
        console.log(...args);
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Sleep utility for async delays
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after delay
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Lock page scrolling (for mobile drag stability)
 * Prevents page from scrolling while dragging chess pieces
 */
function lockScroll() {
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
}

/**
 * Unlock page scrolling (restore after drag)
 */
function unlockScroll() {
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    debugLog('Initializing CAISSA Chess...');

    // Check for embed mode
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('embed') === '1') {
        document.querySelector('.app-container').classList.add('embed-mode');
    }

    // Check for debug mode
    if (urlParams.get('debug') === '1') {
        App.debug = true;
    }

    // Cache DOM elements
    cacheElements();

    // Initialize board
    initializeBoard();

    // Initialize engine
    initializeEngine();

    // Initialize opening book
    initializeOpeningBook();

    // Load ECO opening names dataset
    loadOpeningsDataset();

    // Setup event listeners
    setupEventListeners();

    // Update UI
    updateUI();

    // HOTFIX: Initialize eval bar orientation (white at bottom by default)
    syncEvalOrientation();

    // Load PGN library
    loadPGNLibrary();

    // Check for FEN parameter in URL (for shared positions)
    const fenParam = urlParams.get('fen');
    if (fenParam) {
        try {
            const decodedFen = decodeURIComponent(fenParam);
            debugLog('Loading FEN from URL parameter:', decodedFen);
            // Small delay to ensure board is ready
            setTimeout(() => {
                if (loadFEN(decodedFen, true)) {
                    showNotification('Position loaded from shared link');
                    // Clean URL without reloading (remove fen param)
                    const cleanUrl = window.location.pathname;
                    window.history.replaceState({}, '', cleanUrl);
                }
            }, 100);
        } catch (error) {
            console.error('Failed to load FEN from URL:', error);
        }
    }

    debugLog('Application initialized');
});

// ===== CACHE DOM ELEMENTS =====
function cacheElements() {
    App.elements = {
        // Buttons
        newGameBtn: document.getElementById('newGameBtn'),
        menuBtn: document.getElementById('menuBtn'),
        menuBtnHeader: document.getElementById('menuBtnHeader'),
        flipBoard: document.getElementById('flipBoard'),
        pasteFEN: document.getElementById('pasteFEN'),
        editBoard: document.getElementById('editBoard'),
        analyzeGame: document.getElementById('analyzeGame'),
        toggleAnalysis: document.getElementById('toggleAnalysis'),
        
        // Navigation
        navFirst: document.getElementById('navFirst'),
        navPrev: document.getElementById('navPrev'),
        navNext: document.getElementById('navNext'),
        navLast: document.getElementById('navLast'),
        
        // Status
        turnIndicator: document.getElementById('turnIndicator'),
        whiteTime: document.getElementById('whiteTime'),
        blackTime: document.getElementById('blackTime'),
        gameResult: document.getElementById('gameResult'),
        resignBtn: document.getElementById('resignBtn'),
        
        // Analysis
        depth: document.getElementById('depth'),
        nodes: document.getElementById('nodes'),
        nps: document.getElementById('nps'),
        engineStatusText: document.getElementById('engineStatusText'),
        engineStatus: document.getElementById('engineStatus'),
        
        // Move history
        moveHistory: document.getElementById('moveHistory'),

        // Settings
        playerColor: document.getElementById('playerColor'),
        
        // Modals
        newGameModal: document.getElementById('newGameModal'),
        fenModal: document.getElementById('fenModal'),
        menuModal: document.getElementById('menuModal'),
        embedModal: document.getElementById('embedModal'),
        promotionModal: document.getElementById('promotionModal'),

        // Board Editor
        // editBoardBtn removed - now only accessible via Menu → Edit Board
        editorPanel: document.getElementById('editorPanel'),
        exitEditor: document.getElementById('exitEditor'),
        clearBoard: document.getElementById('clearBoard'),
        resetToStart: document.getElementById('resetToStart'),
        applyPosition: document.getElementById('applyPosition'),

        // Engine vs Engine (accessible via button + New Game menu)
        engineVsEngineBtn: document.getElementById('engineVsEngineBtn'),
        evePanel: document.getElementById('evePanel'),
        eveMoveDelay: document.getElementById('eveMoveDelay'),
        pauseEve: document.getElementById('pauseEve'),
        resumeEve: document.getElementById('resumeEve'),
        stopEve: document.getElementById('stopEve'),

        // PGN Library
        categorySelector: document.getElementById('categorySelector'),
        playerSelector: document.getElementById('playerSelector'),
        fileSelector: document.getElementById('fileSelector'),
        loadPgnBtn: document.getElementById('loadPgnBtn'),
        pgnInfo: document.getElementById('pgnInfo'),
        pgnEvent: document.getElementById('pgnEvent'),
        pgnPlayers: document.getElementById('pgnPlayers'),
        pgnResult: document.getElementById('pgnResult')
    };
}

// ===== BOARD INITIALIZATION =====
function initializeBoard() {
    const config = {
        draggable: true,
        position: 'start',
        onDragStart: onDragStart,
        onDrop: onDrop,
        onSnapEnd: onSnapEnd,
        // Use local piece images (required for file:// and better reliability)
        pieceTheme: 'img/chesspieces/wikipedia/{piece}.png',
        showNotation: true,
        // CRITICAL: Disable spare pieces to prevent layout issues
        sparePieces: false,
        // CRITICAL: Ensure all squares are rendered
        appearSpeed: 'fast',
        moveSpeed: 'fast',
        snapbackSpeed: 'fast',
        snapSpeed: 'fast',
        trashSpeed: 'fast'
    };

    // Wait for board container to be ready with proper dimensions
    initBoardWhenReady(config);
}

function initBoardWhenReady(config) {
    const boardContainer = document.getElementById('chessboard');

    if (!boardContainer) {
        console.error('Board container #chessboard not found');
        return;
    }

    // Check if container has proper dimensions
    const checkAndInit = () => {
        const rect = boardContainer.getBoundingClientRect();

        if (rect.width >= 300 && rect.height >= 300) {
            // Container is ready, create the board
            App.board = Chessboard('chessboard', config);

            // Ensure game state is initialized to starting position
            App.game.reset();

            // Log dimensions for debugging
            console.log('Board initialized with container rect:', {
                width: rect.width,
                height: rect.height,
                isSquare: rect.width === rect.height
            });

            // Multiple resize calls to ensure proper rendering
            setTimeout(() => {
                if (App.board) {
                    App.board.resize();
                    console.log('First resize completed');
                }
            }, 50);

            setTimeout(() => {
                if (App.board) {
                    App.board.resize();
                    const finalRect = boardContainer.getBoundingClientRect();
                    console.log('Board after second resize:', {
                        width: finalRect.width,
                        height: finalRect.height,
                        isSquare: finalRect.width === finalRect.height
                    });

                    // Force refresh the position
                    App.board.position('start', false);

                    // One final resize to ensure everything is correct
                    setTimeout(() => {
                        if (App.board) {
                            App.board.resize();
                            console.log('Final resize completed - board should be fully rendered');
                        }
                    }, 100);
                }
            }, 150);

            // Handle window resize with debouncing
            const debouncedResize = debounce(() => {
                if (App.board) {
                    App.board.resize();
                }
            }, 250);

            window.addEventListener('resize', debouncedResize);

            // Handle orientation change (mobile devices)
            window.addEventListener('orientationchange', () => {
                if (App.board) {
                    // Small delay to ensure viewport has updated
                    setTimeout(() => {
                        App.board.resize();
                        console.log('Board resized after orientation change');
                    }, 100);
                }
            });

            // Prevent page scroll during touch drag on mobile (fallback)
            const boardElement = document.getElementById('chessboard');
            if (boardElement) {
                boardElement.addEventListener('touchmove', (e) => {
                    // Only prevent default if we're dragging a piece
                    // Check if target is a piece or part of the board
                    if (e.target.closest('.piece-417db') || e.target.closest('.square-55d63')) {
                        e.preventDefault();
                    }
                }, { passive: false });
            }
        } else {
            // Container not ready, wait and try again
            console.log('Board container not ready, retrying... (current width:', rect.width, 'height:', rect.height, ')');
            setTimeout(checkAndInit, 50);
        }
    };

    // Start checking
    checkAndInit();
}

// ===== ENGINE INITIALIZATION =====
function initializeEngine() {
    App.engine = new StockfishEngine();

    App.engine.onReady = () => {
        console.log('✅ App.engine.onReady - Stockfish ready at FULL POWER');
        debugLog('Stockfish ready at FULL POWER');
        updateEngineStatus('ready', 'Engine Ready - Full Power');
        // NO skill level limitation - full power
    };

    App.engine.onInfo = (info) => {
        console.log('📊 App.engine.onInfo called - analyzing:', App.analyzing, 'info:', info);

        // PATCH B: Update eval bar ALWAYS (Play mode + Analysis mode)
        if (info.mate !== null && info.mate !== undefined) {
            updateEvalBar(info.mate > 0 ? 1400 : -1400, info.mate);
        } else if (info.score !== null && info.score !== undefined) {
            updateEvalBar(info.score * 100, null);
        }

        // Full analysis panel update only when in analysis mode
        if (App.analyzing) {
            updateAnalysis(info);
        }
    };

    App.engine.onBestMove = (bestMove, ponder) => {
        console.log('🎯 App.engine.onBestMove called - move:', bestMove);
        // The onBestMove callback is already set by getBestMove()
        // This global handler just logs for debugging
    };

    App.engine.onError = (error) => {
        console.error('❌ Engine error:', error);
        updateEngineStatus('error', 'Engine Error');
        showErrorNotification('Engine error. Please refresh the page.');
    };
}

/**
 * Initialize opening book (Polyglot format)
 */
async function initializeOpeningBook() {
    if (window.CAISSA_DEBUG || App.debug) {
        console.log('📚 Initializing opening book...');
    }

    if (typeof PolyglotBook === 'undefined') {
        console.warn('⚠️ PolyglotBook class not loaded');
        return;
    }

    App.openingBook = new PolyglotBook();

    // Try to load book.bin
    const bookLoaded = await App.openingBook.loadBook('book.bin');

    if (bookLoaded) {
        if (window.CAISSA_DEBUG || App.debug) {
            console.log('✅ Opening book ready');
        }
    } else {
        if (window.CAISSA_DEBUG || App.debug) {
            console.log('ℹ️ No opening book found, using engine only');
        }
        App.openingBook = null;
    }
}

// ===== BOARD EVENT HANDLERS =====
function onDragStart(source, piece, position, orientation) {
    // Don't allow moves if in edit mode
    if (App.editMode) return false;

    // Don't allow moves if game is not active
    if (!App.gameActive) return false;

    // Don't allow moves if not navigated to end
    if (App.currentMoveIndex !== App.moveHistory.length - 1 && App.moveHistory.length > 0) {
        return false;
    }

    // In engine mode, only allow player's pieces
    if (App.gameMode === 'engine') {
        if (!App.isPlayerTurn) return false;

        if ((App.playerColor === 'white' && piece.search(/^b/) !== -1) ||
            (App.playerColor === 'black' && piece.search(/^w/) !== -1)) {
            return false;
        }
    }

    // In analysis and human vs human mode, only allow moving side to move pieces
    if (App.gameMode === 'analysis' || App.gameMode === 'human') {
        if ((App.game.turn() === 'w' && piece.search(/^b/) !== -1) ||
            (App.game.turn() === 'b' && piece.search(/^w/) !== -1)) {
            return false;
        }
    }

    // Don't allow moves if game is over
    if (App.game.game_over()) return false;

    // Lock page scrolling on mobile during drag
    lockScroll();

    return true;
}

function onDrop(source, target) {
    // Check if it's a promotion move
    const moves = App.game.moves({ verbose: true });
    const move = moves.find(m => m.from === source && m.to === target);

    if (move && move.flags.includes('p')) {
        // Promotion - show promotion dialog
        App.pendingPromotion = { from: source, to: target };
        showPromotionDialog();
        // Unlock scroll after drop
        unlockScroll();
        return;
    }

    // Try to make the move
    const result = App.game.move({
        from: source,
        to: target
    });

    // Unlock scroll after drop
    unlockScroll();

    // Illegal move
    if (result === null) return 'snapback';

    onMoveMade(result);
}

function onSnapEnd() {
    App.board.position(App.game.fen());
    // Unlock scroll after snap animation completes
    unlockScroll();
}

// ===== MOVE HANDLING =====
function onMoveMade(move) {
    // Add move to history
    App.moveHistory.push(move);
    App.currentMoveIndex = App.moveHistory.length - 1;

    // Update UI
    updateMoveHistory();
    updateStatus();
    updateTimers();
    detectOpening();

    // Notify CAISSA Mentor AI of the move (for hooks)
    if (typeof MentorAI !== 'undefined' && MentorAI.onMoveMade) {
        MentorAI.onMoveMade(move, App.game.fen());
    }

    // Check game status
    if (App.game.game_over()) {
        handleGameOver();
        return;
    }

    // HOTFIX 4: Trigger engine move (independent of UI mode)
    maybeTriggerEngineMove();

    // If analysis is on, update it
    if (App.analyzing) {
        startAnalysis();
    }
}

function undoMove() {
    if (!App.game) return;

    const isEngineGame = App.gameMode === 'engine' || App.engineEnabled;
    let undone = false;

    const undoOnce = () => {
        const move = App.game.undo();
        if (!move) return false;
        App.moveHistory.pop();
        return true;
    };

    undone = undoOnce();

    if (undone && isEngineGame) {
        undoOnce();
    }

    if (!undone) return;

    App.currentMoveIndex = App.moveHistory.length - 1;
    App.board.position(App.game.fen(), false);
    updateMoveHistory();
    updateStatus();
    detectOpening();

    const fen = App.game.fen();
    if (App.engine) {
        engineSend(App.engine, `position fen ${fen}`);
        engineSend(App.engine, 'isready');
    }

    if (App.analyzing) {
        startAnalysis();
    }
}

/**
 * HOTFIX 4: Single source of truth for engine move triggering
 * Engine play logic independent of UI mode (Play / Analyze)
 */
function maybeTriggerEngineMove() {
    console.log("[ENGINE CHECK] maybeTriggerEngineMove called");

    if (!App.engine) {
        console.warn("[ENGINE] missing");
        return;
    }

    if (!App.engineEnabled) {
        console.log("[ENGINE] disabled");
        return;
    }

    if (App.game.game_over()) {
        console.log("[ENGINE] game over");
        return;
    }

    const turn = App.game.turn(); // 'w' or 'b'
    const engineColor = App.enginePlaysAs; // 'white' | 'black'

    const engineTurn =
        (engineColor === 'white' && turn === 'w') ||
        (engineColor === 'black' && turn === 'b');

    if (!engineTurn) {
        console.log("[ENGINE] waiting for player move");
        return;
    }

    const fen = App.game.fen();
    console.log("[ENGINE] go", fen);

    // Use makeEngineMove() which has all the book/engine logic
    setTimeout(() => {
        makeEngineMove();
    }, 250);
}

function makeEngineMove() {
    // Verify game is still active and at current position
    if (!App.gameActive || App.game.game_over()) {
        updateEngineStatus('ready', 'Engine Ready');
        return;
    }

    // Don't make engine move if not at the end of history
    if (App.currentMoveIndex !== App.moveHistory.length - 1 && App.moveHistory.length > 0) {
        debugLog('Not at end of history, skipping engine move');
        updateEngineStatus('ready', 'Engine Ready');
        return;
    }

    updateEngineStatus('busy', 'Engine thinking at FULL POWER...');

    const currentFen = App.game.fen();

    // CHECK OPENING BOOK FIRST
    if (App.useOpeningBook && App.openingBook && App.openingBook.loaded) {
        const fenParts = currentFen.split(' ');
        const fullmove = parseInt(fenParts[5]);

        // Only use book in opening (first 12 full moves)
        if (fullmove <= 12) {
            const bookMove = App.openingBook.selectBookMove(App.game);
            if (bookMove) {
                console.log('📖 Using opening book move:', bookMove);

                // Parse UCI move
                const from = bookMove.substring(0, 2);
                const to = bookMove.substring(2, 4);
                const promotion = bookMove.length > 4 ? bookMove[4] : undefined;

                const move = App.game.move({ from, to, promotion });

                if (move) {
                    // Update board and history
                    App.board.position(App.game.fen());
                    App.moveHistory.push(move);
                    App.currentMoveIndex = App.moveHistory.length - 1;

                    // Update UI
                    updateMoveHistory();
                    updateStatus();
                    updateTimers();

                    // Check game status
                    if (App.game.game_over()) {
                        handleGameOver();
                    } else {
                        App.isPlayerTurn = true;
                        updateEngineStatus('ready', 'Engine Ready');
                    }

                    return; // Book move played, exit early
                } else {
                    console.warn('⚠️ Book move invalid, falling back to engine');
                }
            } else {
                console.log('📚 Position not in book, using engine');
            }
        } else {
            console.log('📚 Out of opening phase, using engine');
        }
    }

    // No book move available, use engine at full power
    const moveTime = 2000; // 2 seconds for full strength

    console.log(`🎯 Engine at FULL POWER using movetime: ${moveTime}ms`);

    App.engine.getBestMove(currentFen, (bestMove) => {
        console.log('[ENGINE] bestmove', bestMove); // HOTFIX 4: Verification log
        // Verify game state hasn't changed
        if (!App.gameActive || App.game.fen() !== currentFen) {
            debugLog('Game state changed, canceling engine move');
            updateEngineStatus('ready', 'Engine Ready');
            return;
        }

        // Parse move
        const from = bestMove.substring(0, 2);
        const to = bestMove.substring(2, 4);
        const promotion = bestMove.length > 4 ? bestMove.substring(4, 5) : undefined;

        // Make move
        const move = App.game.move({
            from: from,
            to: to,
            promotion: promotion
        });

        if (move) {
            App.board.position(App.game.fen());

            // Add to history
            App.moveHistory.push(move);
            App.currentMoveIndex = App.moveHistory.length - 1;

            // Update UI
            updateMoveHistory();
            updateStatus();
            updateTimers();

            // Check game status
            if (App.game.game_over()) {
                handleGameOver();
            } else {
                App.isPlayerTurn = true;
                updateStatus();
            }
        }

        updateEngineStatus('ready', 'Engine Ready');
    }, { movetime: moveTime });
}

// ===== GAME STATUS =====
function updateStatus() {
    const turn = App.game.turn() === 'w' ? 'White' : 'Black';
    const indicator = App.elements.turnIndicator;

    let statusText = '';
    let statusColor = '#2c5f9e';

    if (App.game.in_checkmate()) {
        const winner = App.game.turn() === 'w' ? 'Black' : 'White';
        statusText = `Checkmate! ${winner} wins!`;
        statusColor = '#f44336';
    } else if (App.game.in_draw()) {
        statusText = 'Game drawn';
        statusColor = '#ff9800';
    } else if (App.game.in_stalemate()) {
        statusText = 'Stalemate!';
        statusColor = '#ff9800';
    } else if (App.game.in_check()) {
        statusText = `${turn} in check!`;
        statusColor = '#f44336';
    } else {
        statusText = `${turn} to move`;
        statusColor = '#2c5f9e';
    }

    // Update text indicator if it exists
    if (indicator) {
        indicator.textContent = statusText;
        indicator.style.color = statusColor;
    }

    updateGameStatusPanel();

    // Dispatch turn change event for LED indicator (caissa-ui-refactor.js)
    window.dispatchEvent(new CustomEvent('caissa-turn-change', {
        detail: {
            turn: App.game.turn() === 'w' ? 'white' : 'black',
            inCheck: App.game.in_check(),
            statusText: statusText
        }
    }));
}

function handleGameOver() {
    App.gameActive = false;
    clearInterval(App.timerInterval);

    let message = '';
    if (App.game.in_checkmate()) {
        const winner = App.game.turn() === 'w' ? 'Black' : 'White';
        message = `Checkmate! ${winner} wins!`;
    } else if (App.game.in_draw()) {
        message = 'Game drawn';
    } else if (App.game.in_stalemate()) {
        message = 'Stalemate!';
    } else if (App.game.in_threefold_repetition()) {
        message = 'Draw by threefold repetition';
    } else if (App.game.insufficient_material()) {
        message = 'Draw by insufficient material';
    }

    // Update game result display if element exists
    if (App.elements.gameResult) {
        App.elements.gameResult.textContent = message;
        App.elements.gameResult.classList.add('show');
    }

    // Dispatch game end event for UI components
    window.dispatchEvent(new CustomEvent('caissa-game-end', {
        detail: { result: message }
    }));

    // Stop analysis if running
    if (App.analyzing) {
        stopAnalysis();
    }
}

// ===== MOVE HISTORY =====
function updateMoveHistory() {
    let html = '';
    
    for (let i = 0; i < App.moveHistory.length; i += 2) {
        const moveNumber = Math.floor(i / 2) + 1;
        const whiteMove = App.moveHistory[i];
        const blackMove = App.moveHistory[i + 1];
        
        html += `<div class="move-pair">`;
        html += `<span class="move-number">${moveNumber}.</span>`;
        html += `<span class="move ${i === App.currentMoveIndex ? 'current' : ''}" 
                       data-index="${i}">${whiteMove.san}</span>`;
        
        if (blackMove) {
            html += `<span class="move ${i + 1 === App.currentMoveIndex ? 'current' : ''}" 
                           data-index="${i + 1}">${blackMove.san}</span>`;
        }
        
        html += `</div>`;
    }
    
    App.elements.moveHistory.innerHTML = html || '<p style="text-align: center; color: #999;">No moves yet</p>';

    // Scroll to bottom
    App.elements.moveHistory.scrollTop = App.elements.moveHistory.scrollHeight;

    // HOTFIX 2: Also render moves to right panel
    renderMovesToPanel();

    // Update navigation buttons
    updateNavigationButtons();
}

/**
 * HOTFIX 2: Render moves to right panel (3-column layout)
 * Displays moves in a compact format for the moves panel
 */
function renderMovesToPanel() {
    const el = document.getElementById("movesPanel");
    if (!el) return;

    const moves = App.moveHistory; // Array of {san, ...}
    let html = "";

    for (let i = 0; i < moves.length; i += 2) {
        const turn = Math.floor(i / 2) + 1;
        const w = moves[i] ? moves[i].san : "";
        const b = moves[i + 1] ? moves[i + 1].san : "";
        html += `<div class="move-row"><span class="turn">${turn}.</span> <span>${w}</span> <span>${b || ''}</span></div>`;
    }

    el.innerHTML = html || `<div class="muted">No moves yet</div>`;

    // Scroll to bottom
    el.scrollTop = el.scrollHeight;
}

function detectOpening() {
    if (!App.game || !App.openings || App.openings.length === 0) return;

    const playedSAN = App.game.history({ verbose: false });
    const maxLen = Math.min(playedSAN.length, 10); // first 5 full moves
    let best = null;

    for (const op of App.openings) {
        const openingMoves = Array.isArray(op.moves) ? op.moves : String(op.moves || '').split(/\s+/).filter(Boolean);
        const n = Math.min(openingMoves.length, maxLen);
        let ok = true;

        for (let i = 0; i < n; i++) {
            if (playedSAN[i] !== openingMoves[i]) {
                ok = false;
                break;
            }
        }

        if (ok && n > 0) {
            if (!best || openingMoves.length > (Array.isArray(best.moves) ? best.moves.length : String(best.moves || '').split(/\s+/).length)) {
                best = op;
            }
        }
    }

    const openingText = best ? `${best.eco} ? ${best.name}` : 'Opening: (unknown)';
    const openingName = document.getElementById('openingName');
    const openingTitleRight = document.getElementById('openingTitleRight');

    if (openingName) openingName.textContent = openingText;
    if (openingTitleRight) openingTitleRight.textContent = openingText;
}

function updateNavigationButtons() {
    const atStart = App.currentMoveIndex < 0;
    const atEnd = App.currentMoveIndex === App.moveHistory.length - 1;

    App.elements.navFirst.disabled = atStart || App.moveHistory.length === 0;
    App.elements.navPrev.disabled = atStart || App.moveHistory.length === 0;
    App.elements.navNext.disabled = atEnd || App.moveHistory.length === 0;
    App.elements.navLast.disabled = atEnd || App.moveHistory.length === 0;
}

// ===== MOVE NAVIGATION =====
function navigateToStart() {
    App.game.reset();
    App.currentMoveIndex = -1;
    App.board.position(App.game.fen());
    updateStatus();
    updateMoveHistory();
    
    if (App.analyzing) {
        startAnalysis();
    }
}

function navigateToPrevious() {
    if (App.currentMoveIndex >= 0) {
        App.game.undo();
        App.currentMoveIndex--;
        App.board.position(App.game.fen());
        updateStatus();
        updateMoveHistory();
        
        if (App.analyzing) {
            startAnalysis();
        }
    }
}

function navigateToNext() {
    if (App.currentMoveIndex < App.moveHistory.length - 1) {
        const nextMove = App.moveHistory[App.currentMoveIndex + 1];
        App.game.move(nextMove);
        App.currentMoveIndex++;
        App.board.position(App.game.fen());
        updateStatus();
        updateMoveHistory();
        
        if (App.analyzing) {
            startAnalysis();
        }
    }
}

function navigateToEnd() {
    while (App.currentMoveIndex < App.moveHistory.length - 1) {
        const nextMove = App.moveHistory[App.currentMoveIndex + 1];
        App.game.move(nextMove);
        App.currentMoveIndex++;
    }
    App.board.position(App.game.fen());
    updateStatus();
    updateMoveHistory();
    
    if (App.analyzing) {
        startAnalysis();
    }
}

function navigateToMove(index) {
    // Reset to start
    App.game.reset();
    App.currentMoveIndex = -1;
    
    // Replay moves up to index
    for (let i = 0; i <= index; i++) {
        App.game.move(App.moveHistory[i]);
        App.currentMoveIndex++;
    }
    
    App.board.position(App.game.fen());
    updateStatus();
    updateMoveHistory();
    
    if (App.analyzing) {
        startAnalysis();
    }
}

// ===== TIMERS =====
function updateTimers() {
    const topClockWhite = document.getElementById('topClockWhite');
    const topClockBlack = document.getElementById('topClockBlack');

    if (App.timeControl === 0) {
        App.elements.whiteTime.textContent = '--:--';
        App.elements.blackTime.textContent = '--:--';
        if (topClockWhite) topClockWhite.textContent = '--:--';
        if (topClockBlack) topClockBlack.textContent = '--:--';
        return;
    }
    
    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };
    
    App.elements.whiteTime.textContent = formatTime(App.whiteTime);
    App.elements.blackTime.textContent = formatTime(App.blackTime);
    if (topClockWhite) topClockWhite.textContent = formatTime(App.whiteTime);
    if (topClockBlack) topClockBlack.textContent = formatTime(App.blackTime);
    
    // Check for time out
    if (App.whiteTime <= 0 || App.blackTime <= 0) {
        const winner = App.whiteTime <= 0 ? 'Black' : 'White';
        App.gameActive = false;
        clearInterval(App.timerInterval);
        App.elements.gameResult.textContent = `Time out! ${winner} wins!`;
        App.elements.gameResult.classList.add('show');
    }
}

function startTimer() {
    if (App.timeControl === 0) return;

    // Clear any existing timer to prevent memory leaks
    if (App.timerInterval) {
        clearInterval(App.timerInterval);
    }

    App.lastMoveTime = Date.now();

    App.timerInterval = setInterval(() => {
        // Only decrement by 1 second per interval
        if (App.game.turn() === 'w') {
            App.whiteTime = Math.max(0, App.whiteTime - 1);
        } else {
            App.blackTime = Math.max(0, App.blackTime - 1);
        }

        updateTimers();

        // Check for timeout
        if (App.whiteTime <= 0 || App.blackTime <= 0) {
            clearInterval(App.timerInterval);
            App.timerInterval = null;
        }
    }, 1000);
}

// ===== ANALYSIS =====
function startAnalysis() {
    console.log('🔍 startAnalysis called');
    console.log('  - Engine ready:', App.engine?.ready);
    console.log('  - Current FEN:', App.game.fen());

    if (!App.engine || !App.engine.ready) {
        console.error('❌ Engine not ready for analysis');
        return;
    }

    App.analyzing = true;
    console.log('  - Set App.analyzing = true');
    updateEngineStatus('busy', 'Analyzing...');

    console.log('  - Calling App.engine.startAnalysis...');
    App.engine.startAnalysis(App.game.fen(), (info) => {
        console.log('🔄 Analysis callback received:', info);
        updateAnalysis(info);
    });
    console.log('  - startAnalysis() called on engine');
}

// toggleMultiPV removed - now using simple 1-line analysis

function stopAnalysis() {
    console.log('⏹️ stopAnalysis called');
    console.trace('Stack trace:');
    if (App.engine) {
        App.engine.stopAnalysis();
    }
    App.analyzing = false;
    updateEngineStatus('ready', 'Engine Ready');
}

function toggleAnalysis() {
    console.log('🔘 toggleAnalysis clicked - currently analyzing:', App.analyzing);

    // Prevent rapid double-clicks
    if (App._toggleAnalysisLock) {
        console.log('  - ⚠️ Button locked, ignoring duplicate click');
        return;
    }

    App._toggleAnalysisLock = true;
    setTimeout(() => {
        App._toggleAnalysisLock = false;
    }, 300); // 300ms debounce

    if (App.analyzing) {
        stopAnalysis();
        App.elements.toggleAnalysis.innerHTML = '<i class="fas fa-brain"></i> Analyze';
    } else {
        startAnalysis();
        App.elements.toggleAnalysis.innerHTML = '<i class="fas fa-stop"></i> Stop';
    }
}

function updateAnalysis(info) {
    App.currentEvaluation = {
        score: info.score,
        depth: info.depth,
        mate: info.mate,
        bestMove: info.pv?.[0] || null,
        pv: info.pv?.slice(0, 10)?.join(' ') || null
    };

    if (typeof MentorAI !== 'undefined' && MentorAI.onEvaluationUpdate) {
        MentorAI.onEvaluationUpdate(App.currentEvaluation);
    }

    App.elements.depth.textContent = info.depth || '0';
    App.elements.nodes.textContent = formatNumber(info.nodes || 0);
    App.elements.nps.textContent = formatNumber(info.nps || 0);

    const evalElem = document.getElementById('evaluation');
    const lineElem = document.getElementById('bestLine');
    const hintLine = document.getElementById('hintPV');
    const evalNumeric = document.getElementById('evalNumeric');
    const evalEngineInfo = document.getElementById('evalEngineInfo');

    if (!evalElem || !lineElem) return;

    if (info.mate !== null && info.mate !== undefined) {
        const mateText = `M${info.mate}`;
        evalElem.textContent = mateText;
        evalElem.style.color = info.mate > 0 ? '#4caf50' : '#f44336';
        updateEvalBar(info.mate > 0 ? 1400 : -1400, info.mate);
        if (evalNumeric) evalNumeric.textContent = mateText;
        App.lastEvalMate = info.mate;
        App.lastEvalCp = null;
    } else if (info.score !== null && info.score !== undefined) {
        const score = info.score.toFixed(2);
        evalElem.textContent = score >= 0 ? `+${score}` : score;
        evalElem.style.color = score > 0 ? '#4caf50' : score < 0 ? '#f44336' : '#2c5f9e';
        updateEvalBar(info.score * 100, null);
        if (evalNumeric) {
            const scoreNum = parseFloat(score);
            evalNumeric.textContent = scoreNum >= 0 ? `+${scoreNum.toFixed(1)}` : scoreNum.toFixed(1);
        }
        App.lastEvalCp = info.score * 100;
        App.lastEvalMate = null;
    }

    if (evalEngineInfo && info.depth) {
        evalEngineInfo.textContent = `Stockfish 16 ? Depth ${info.depth} ? NNUE`;
    }

    const parsedPvFromLine = extractPV(info.rawLine);
    const pvArray = (info.pv && info.pv.length > 0)
        ? (Array.isArray(info.pv) ? info.pv : info.pv.split(/\s+/).filter(m => m.length > 0))
        : (parsedPvFromLine ? parsedPvFromLine.split(/\s+/).filter(m => m.length > 0) : []);

    if (pvArray.length > 0) {
        const displayPlies = Math.min(pvArray.length, 14);
        const pvToConvert = pvArray.slice(0, displayPlies);
        const shortPv = pvArray.slice(0, 8).join(' ');
        const sanMoves = convertPVtoSAN(pvToConvert);
        const sanTokens = sanMoves ? sanMoves.split(/\s+/).filter(Boolean) : [];
        const shortSan = sanTokens.slice(0, 8).join(' ');

        if (sanMoves && sanMoves.trim() !== '') {
            lineElem.textContent = sanMoves;
            if (hintLine) hintLine.textContent = shortSan || sanMoves;
        } else {
            const uciLine = pvToConvert.join(' ');
            lineElem.textContent = uciLine;
            if (hintLine) hintLine.textContent = shortPv || uciLine;
        }
    } else if (info.depth > 0) {
        lineElem.textContent = 'Analyzing...';
        if (hintLine) hintLine.textContent = 'Analyzing...';
    } else {
        lineElem.textContent = '--';
        if (hintLine) hintLine.textContent = '--';
    }
}

function extractPV(infoLine) {
    if (!infoLine || typeof infoLine !== 'string') return null;
    const idx = infoLine.indexOf(' pv ');
    if (idx === -1) return null;
    const pv = infoLine.slice(idx + 4).trim();
    if (!pv) return null;
    return pv;
}

// Convert UCI PV (principal variation) to readable SAN notation
function convertPVtoSAN(pvMoves) {
    try {
        console.log('🔄 Converting PV to SAN:', pvMoves);

        // Create a temporary game to convert moves
        const tempGame = new Chess(App.game.fen());
        const sanMoves = [];

        // Convert up to first 10 moves (to avoid clutter)
        const maxMoves = Math.min(pvMoves.length, 10);

        for (let i = 0; i < maxMoves; i++) {
            const uciMove = pvMoves[i];

            // Parse UCI move (e.g., "e2e4" or "e7e8q")
            const from = uciMove.substring(0, 2);
            const to = uciMove.substring(2, 4);
            const promotion = uciMove.length > 4 ? uciMove.substring(4, 5) : undefined;

            // Make move and get SAN
            const move = tempGame.move({
                from: from,
                to: to,
                promotion: promotion
            });

            if (move) {
                sanMoves.push(move.san);
            } else {
                console.warn(`⚠️ Failed to convert UCI move: ${uciMove} at position ${tempGame.fen()}`);
                // If move fails, use UCI notation as fallback for this move
                sanMoves.push(uciMove);
            }
        }

        // Add ellipsis if there are more moves
        if (pvMoves.length > maxMoves) {
            sanMoves.push('...');
        }

        const result = sanMoves.join(' ');
        console.log('✅ PV converted to SAN:', result);
        return result;

    } catch (error) {
        console.error('❌ Error converting PV to SAN:', error);
        // Fallback: return UCI moves as-is
        const fallback = pvMoves.slice(0, 10).join(' ');
        console.log('⚠️ Using UCI fallback:', fallback);
        return fallback;
    }
}

function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

// ===== REFINEMENT 2: ENGINE EVAL BAR FUNCTIONS =====
/**
 * Convert centipawns to ratio (0..1) for eval bar visualization
 * Uses sigmoid function for smooth scaling
 * @param {number} cp - Centipawns (-1500 to +1500)
 * @returns {number} - Ratio 0 (black winning) to 1 (white winning)
 */
function cpToRatio(cp) {
    const x = Math.max(-1500, Math.min(1500, cp)); // Clamp to reasonable bounds
    const t = 1 / (1 + Math.exp(-x / 200)); // Sigmoid function
    return t; // 0..1
}

/**
 * Update the engine evaluation bar (Lichess style)
 * @param {number} cp - Centipawns (-1500 to +1500)
 * @param {number|null} mate - Mate in X moves (null if not mate)
 */
function updateEvalBar(cp, mate) {
    const fill = document.getElementById("evalFill");
    const badge = document.getElementById("evalScore");

    if (!fill || !badge) return; // Elements not found (eval bar not rendered)

    // Calculate white's advantage percentage
    const t = cpToRatio(cp);
    const whitePct = t * 100;

    // Update bar fill (white area from top)
    fill.style.height = `${whitePct}%`;
    fill.style.marginTop = `${100 - whitePct}%`;

    // Update score badge
    if (mate !== null && mate !== undefined) {
        // Mate score
        const mateText = mate > 0 ? `M${mate}` : `M${mate}`;
        badge.textContent = mateText;
        badge.className = 'eval-score-badge ' + (mate > 0 ? 'white-advantage' : 'black-advantage');
    } else {
        // Centipawn score (convert back to pawns)
        const score = cp / 100;
        const scoreText = score >= 0 ? `+${score.toFixed(1)}` : score.toFixed(1);
        badge.textContent = scoreText;

        // Color based on advantage
        if (score > 1.5) {
            badge.className = 'eval-score-badge white-advantage';
        } else if (score < -1.5) {
            badge.className = 'eval-score-badge black-advantage';
        } else {
            badge.className = 'eval-score-badge';
        }
    }
}

function updateEngineStatus(status, text) {
    App.elements.engineStatusText.textContent = text;
    App.elements.engineStatus.className = 'status-dot';
    
    if (status === 'busy') {
        App.elements.engineStatus.classList.add('busy');
    } else if (status === 'error') {
        App.elements.engineStatus.classList.add('error');
    }
}

// ===== NEW GAME =====
function newGame(options = {}) {
    // Exit edit mode if active (MUST be first to clean up state)
    if (App.editMode) {
        exitEditMode();
    }

    // Exit Engine vs Engine mode if active
    if (App.eveMode) {
        exitEngineVsEngineMode();
        App.eveMode = false;
    }

    // Stop any ongoing operations
    // ONLY stop analysis if it's actually running
    if (App.analyzing) {
        stopAnalysis();
    }
    clearInterval(App.timerInterval);

    // Reset game
    App.game.reset();
    App.board.position('start');
    App.moveHistory = [];
    App.currentMoveIndex = -1;
    App.isPlayerTurn = true;
    App.gameActive = true;

    // Clear loaded game info
    App.loadedGameInfo = null;
    if (typeof LibraryUI !== 'undefined') {
        LibraryUI.onGameLoaded(null);
    }
    
    // Apply options
    if (options.mode) App.gameMode = options.mode;
    if (options.color) App.playerColor = options.color;
    // No level setting - always full power
    if (options.timeControl !== undefined) {
        App.timeControl = options.timeControl;
        App.whiteTime = options.timeControl;
        App.blackTime = options.timeControl;
    }
    
    // Flip board if playing as black
    if (App.playerColor === 'black') {
        App.board.flip();
    } else {
        App.board.orientation('white');
    }
    App.isFlipped = (App.playerColor === 'black');
    syncEvalOrientation();
    
    // Reset UI
    App.elements.gameResult.classList.remove('show');
    updateMoveHistory();
    updateStatus();
    updateTimers();

    // TASK 8: Show/Hide analysis panels based on mode
    const playSection = document.getElementById('playSection');
    if (playSection) {
        if (App.gameMode === 'analysis') {
            playSection.classList.add('show-analysis');
        } else {
            playSection.classList.remove('show-analysis');
        }
    }

    // 3-COLUMN: Show opening panel only in Analyze mode
    const openingPanel = document.getElementById('openingPanel');
    if (openingPanel) {
        if (App.gameMode === 'analysis') {
            openingPanel.classList.remove('hidden');
        } else {
            openingPanel.classList.add('hidden');
        }
    }
    
    // Start timer if needed
    if (App.timeControl > 0) {
        startTimer();
    }
    
    // Auto-start analysis in Analysis mode (New Game Analyzer)
    if (App.gameMode === 'analysis') {
        App.analyzing = true;
        if (App.elements.toggleAnalysis) {
            App.elements.toggleAnalysis.innerHTML = '<i class="fas fa-stop"></i> Stop';
        }
        setTimeout(() => {
            if (App.analyzing) {
                startAnalysis();
            }
        }, 100);
    }
    
    // Handle Engine vs Engine mode (from "New Game" modal)
    // This starts a NEW game from starting position
    if (App.gameMode === 'eve') {
        // Start Engine vs Engine mode from starting position
        setTimeout(() => {
            startEngineVsEngine();
        }, 100);
        return; // Exit early, Eve mode handles its own UI
    }

    // Clear analysis panel
    App.elements.depth.textContent = '0';
    App.elements.nodes.textContent = '0';
    App.elements.nps.textContent = '0';
    const evalElem = document.getElementById('evaluation');
    const lineElem = document.getElementById('bestLine');
    if (evalElem) evalElem.textContent = '0.0';
    if (lineElem) lineElem.textContent = '--';

    // Notify engine of new game
    if (App.engine) {
        App.engine.stop();
        engineNewGame(App.engine);
    }

    // Show resign button in engine mode
    if (App.gameMode === 'engine') {
        App.elements.resignBtn.style.display = 'block';
    } else {
        App.elements.resignBtn.style.display = 'none';
    }

    // HOTFIX 4: Configure engine play
    console.log("[START GAME]");
    App.engineEnabled = (App.gameMode === 'engine');
    App.enginePlaysAs = (App.playerColor === 'white') ? 'black' : 'white';

    console.log("[ENGINE CONFIG] enabled:", App.engineEnabled, "plays as:", App.enginePlaysAs);

    // HOTFIX 4: Trigger engine move if it's engine's turn
    maybeTriggerEngineMove();
}

function resignGame() {
    if (App.eveRunning || App.gameMode === 'eve' || App.eveMode) {
        console.log('ðŸ³ï¸ Resign in Engine vs Engine');
        stopEngineVsEngine();
        if (App.elements.gameResult) {
            App.elements.gameResult.textContent = 'Engine match stopped by resignation';
            App.elements.gameResult.classList.add('show');
        }
        setGameStatusText('Match stopped - resignation');
        showNotification('Engine match stopped by resignation');
        return;
    }

    if (!App.gameActive) {
        showNotification('No active game to resign.');
        return;
    }

    // Confirm resignation
    if (!confirm('Are you sure you want to resign?')) {
        return;
    }

    console.log('🏳️ Player resigned');

    // Determine winner based on player color
    const winner = App.playerColor === 'white' ? 'Black' : 'White';

    // Stop game
    App.gameActive = false;
    stopAnalysis();
    clearInterval(App.timerInterval);

    // Hide resign button
    App.elements.resignBtn.style.display = 'none';

    // Show game result
    App.elements.gameResult.textContent = `${winner} wins by resignation`;
    App.elements.gameResult.classList.add('show');
    App.elements.gameResult.style.background = winner === 'White' ? '#4caf50' : '#333';
    App.elements.gameResult.style.color = 'white';

    setGameStatusText(`${winner} wins - resignation`);
    showNotification(`${winner} wins by resignation`);
}

// ===== FEN OPERATIONS =====
function loadFEN(fen, setAnalysisMode = true) {
    try {
        console.log('📝 Loading FEN - raw input:', fen);
        console.log('📝 Raw input length:', fen.length);

        // Sanitize FEN input:
        // 1. Trim whitespace
        fen = fen.trim();

        // 2. Remove BOM (Byte Order Mark)
        fen = fen.replace(/^\uFEFF/, '');

        // 3. Replace NBSP (non-breaking space) with normal space
        fen = fen.replace(/\u00A0/g, ' ');

        // 4. Collapse multiple spaces into one
        fen = fen.replace(/\s+/g, ' ');

        console.log('📝 After sanitization:', fen);
        console.log('📝 Sanitized length:', fen.length);

        // Check if this looks like PGN instead of FEN
        if (fen.includes('[Event') || fen.includes('1.') || fen.includes('1..')) {
            console.error('❌ This looks like PGN, not FEN');
            throw new Error('This is not FEN. Paste a FEN string.');
        }

        // Exit edit mode if active
        if (App.editMode) {
            exitEditMode();
        }

        // Validate with chess.js ONLY - let chess.js be the source of truth
        console.log('📝 Validating FEN with chess.js:', fen);
        const valid = App.game.load(fen);

        if (!valid) {
            console.error('❌ chess.js rejected FEN:', fen);
            throw new Error('Invalid FEN');
        }

        console.log('✅ FEN loaded successfully!');
        console.log('📝 Resulting position:', App.game.fen());

        // Update board to match chess.js state
        App.board.position(App.game.fen());

        // Reset move history
        App.moveHistory = [];
        App.currentMoveIndex = -1;

        // Stop engine analysis if running
        if (App.engine) {
            stopAnalysis();
        }

        // Optionally set to analysis mode
        if (setAnalysisMode) {
            App.gameActive = false;
            App.gameMode = 'analysis';

            // TASK 8: Show analysis panels when loading FEN for analysis
            const playSection = document.getElementById('playSection');
            if (playSection) {
                playSection.classList.add('show-analysis');
            }
        }

        // Update UI
        updateMoveHistory();
        updateStatus();
        showNotification('Position loaded from FEN');

        return true;
    } catch (error) {
        console.error('❌ FEN load error:', error.message);
        console.error('❌ Failed FEN string:', fen);
        showErrorNotification(error.message || 'Invalid FEN string');
        return false;
    }
}

function getCurrentFEN() {
    return App.game.fen();
}

// ===== PGN OPERATIONS =====
function exportPGN() {
    const pgn = App.game.pgn({
        max_width: 80,
        newline_char: '\n'
    });
    
    // Create download
    const blob = new Blob([pgn], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `game-${Date.now()}.pgn`;
    a.click();
    URL.revokeObjectURL(url);
}

// ===== BOARD OPERATIONS =====
function flipBoard() {
    App.board.flip();

    // HOTFIX: Toggle flipped state and sync eval bar orientation
    App.isFlipped = !App.isFlipped;
    syncEvalOrientation();

    if (App.lastEvalMate !== null && App.lastEvalMate !== undefined) {
        updateEvalBar(App.lastEvalMate > 0 ? 1400 : -1400, App.lastEvalMate);
    } else if (App.lastEvalCp !== null && App.lastEvalCp !== undefined) {
        updateEvalBar(App.lastEvalCp, null);
    }

    setTimeout(() => {
        try { App.board.resize(); } catch (e) {}
    }, 0);
}

/**
 * Sync eval bar orientation with board orientation
 * Default: white at bottom (no flip)
 * Flipped: white at top (apply white-top class)
 * Logic: whiteAtTop = App.isFlipped
 */
function syncEvalOrientation() {
    const evalBar = document.getElementById('evalBar');
    if (!evalBar) return;

    const whiteAtTop = App.isFlipped;

    if (whiteAtTop) {
        evalBar.classList.add('white-top');
    } else {
        evalBar.classList.remove('white-top');
    }
}

function updateGameStatusPanel() {
    const el = document.getElementById('gameStatusText');
    if (!el) return;

    const game = App.game;
    const isCheckmate = (typeof game.isCheckmate === 'function' && game.isCheckmate()) ||
        (typeof game.in_checkmate === 'function' && game.in_checkmate());
    const isDraw = (typeof game.isDraw === 'function' && game.isDraw()) ||
        (typeof game.in_draw === 'function' && game.in_draw());
    const isStalemate = (typeof game.isStalemate === 'function' && game.isStalemate()) ||
        (typeof game.in_stalemate === 'function' && game.in_stalemate());
    const isThreefold = (typeof game.isThreefoldRepetition === 'function' && game.isThreefoldRepetition()) ||
        (typeof game.in_threefold_repetition === 'function' && game.in_threefold_repetition());
    const isInsufficient = (typeof game.isInsufficientMaterial === 'function' && game.isInsufficientMaterial()) ||
        (typeof game.insufficient_material === 'function' && game.insufficient_material());

    let text = 'In progress…';
    if (isCheckmate) {
        const winner = game.turn() === 'w' ? 'Black' : 'White';
        text = `${winner} wins — checkmate`;
    } else if (isStalemate) {
        text = 'Draw — stalemate';
    } else if (isThreefold) {
        text = 'Draw — threefold repetition';
    } else if (isInsufficient) {
        text = 'Draw — insufficient material';
    } else if (isDraw) {
        text = 'Draw';
    } else {
        const turn = game.turn() === 'w' ? 'White' : 'Black';
        text = `In progress… (${turn} to move)`;
    }

    el.textContent = text;
}

function setGameStatusText(text) {
    const el = document.getElementById('gameStatusText');
    if (el) el.textContent = text;
}

async function loadOpeningsDataset() {
    try {
        const response = await fetch('data/openings.json', { cache: 'no-cache' });
        if (!response.ok) {
            throw new Error(`Failed to load openings.json (${response.status})`);
        }
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
            App.openings = data;
            console.log(`✅ Openings dataset loaded (${data.length} entries)`);
        }
    } catch (error) {
        console.warn('⚠️ Openings dataset not loaded. Using fallback list.', error);
    }
}

// ===== MODAL MANAGEMENT =====
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('show');

        // Auto-focus FEN input when opening FEN modal
        if (modalId === 'fenModal') {
            setTimeout(() => {
                const fenInput = document.getElementById('fenInput');
                if (fenInput) {
                    fenInput.focus();
                    fenInput.select(); // Select any existing text
                }
            }, 100); // Small delay to ensure modal is visible
        }
    }
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
    }
}

// ===== MENTOR PANEL HELPER =====
/**
 * Opens the CAISSA Mentor panel with safety guards.
 * Used by header button, menu item, and floating toggle.
 */
function openMentorPanel() {
    if (typeof MentorAI !== 'undefined' && MentorAI.open) {
        MentorAI.open();
    } else {
        console.warn('CAISSA Mentor AI is not available yet. Please wait for the page to fully load.');
        showNotification('Mentor is loading, please try again...');
    }
}

// ===== EVENT LISTENERS =====
function setupEventListeners() {
    if (App._listenersBound) {
        return;
    }
    const missingElements = new Set();
    let loggedPlayInactive = false;
    const safeOn = (el, eventName, handler, label) => {
        if (!el) {
            if (!missingElements.has(label)) {
                console.warn(`[Play] Missing element for ${label}`);
                missingElements.add(label);
            }
            return;
        }
        el.addEventListener(eventName, handler);
    };

    const playSection = document.getElementById('playSection');
    const isPlayActive = !!playSection?.classList.contains('active');
    if (!isPlayActive) {
        if (!loggedPlayInactive) {
            console.warn('[Play] setupEventListeners skipped: Play section not active');
            loggedPlayInactive = true;
        }
        let attempts = 0;
        const maxAttempts = 10;
        const retry = () => {
            const active = !!document.getElementById('playSection')?.classList.contains('active');
            if (active) {
                setupEventListeners();
                return;
            }
            attempts += 1;
            if (attempts < maxAttempts) {
                requestAnimationFrame(retry);
            } else {
                console.warn('[Play] setupEventListeners aborted: Play section still inactive');
            }
        };
        requestAnimationFrame(retry);
        return;
    }

    App._listenersBound = true;

    // Header buttons
    safeOn(App.elements.newGameBtn, 'click', () => {
        showModal('newGameModal');
    }, 'newGameBtn');

    // Caissa Insight button in header
    const caissaInsightBtn = document.getElementById('caissaInsightBtn');
    safeOn(caissaInsightBtn, 'click', () => {
        showModal('insightModal');
        loadInsightProfile(); // Load saved profile if exists
        updateInsightIndicator(); // Update indicator visibility
    }, 'caissaInsightBtn');

    // CAISSA Mentor button in header
    const mentorBtn = document.getElementById('mentorBtn');
    safeOn(mentorBtn, 'click', () => {
        openMentorPanel();
    }, 'mentorBtn');

    // Menu button in analysis panel (mobile + desktop)
    safeOn(App.elements.menuBtn, 'click', () => {
        showModal('menuModal');
    }, 'menuBtn');

    // Menu button in header (desktop only, hidden on mobile)
    safeOn(App.elements.menuBtnHeader, 'click', () => {
        showModal('menuModal');
    }, 'menuBtnHeader');
    
    // Quick actions
    safeOn(App.elements.flipBoard, 'click', flipBoard, 'flipBoard');
    
    safeOn(App.elements.pasteFEN, 'click', () => {
        showModal('fenModal');
    }, 'pasteFEN');

    safeOn(App.elements.editBoard, 'click', () => {
        toggleEditMode();
    }, 'editBoard');

    safeOn(App.elements.analyzeGame, 'click', () => {
        // Check if there's a game history to analyze
        if (App.moveHistory.length === 0) {
            alert('No game to analyze. Play some moves first!');
            return;
        }

        // Enter analysis mode
        App.gameMode = 'analysis';
        App.gameActive = false;

        // TASK 8: Show analysis panels in analyze mode
        const playSection = document.getElementById('playSection');
        if (playSection) {
            playSection.classList.add('show-analysis');
        }

        // 3-COLUMN: Show opening panel in Analyze mode
        const openingPanel = document.getElementById('openingPanel');
        if (openingPanel) {
            openingPanel.classList.remove('hidden');
        }

        // Navigate to the start of the game
        navigateToStart();

        // Start analysis from current position
        startAnalysis();

        showNotification('Analysis mode: Use navigation buttons to explore the game');
    }, 'analyzeGame');
    
    safeOn(App.elements.toggleAnalysis, 'click', toggleAnalysis, 'toggleAnalysis');

    // Resign button
    safeOn(App.elements.resignBtn, 'click', resignGame, 'resignBtn');

    // PGN Library
    safeOn(App.elements.categorySelector, 'change', onCategoryChange, 'categorySelector');
    safeOn(App.elements.playerSelector, 'change', onPlayerChange, 'playerSelector');
    safeOn(App.elements.loadPgnBtn, 'click', loadSelectedPGN, 'loadPgnBtn');

    // Navigation
    safeOn(App.elements.navFirst, 'click', navigateToStart, 'navFirst');
    safeOn(App.elements.navPrev, 'click', navigateToPrevious, 'navPrev');
    safeOn(App.elements.navNext, 'click', navigateToNext, 'navNext');
    safeOn(App.elements.navLast, 'click', navigateToEnd, 'navLast');
    
    // Move history clicks
    safeOn(App.elements.moveHistory, 'click', (e) => {
        if (e.target.classList.contains('move')) {
            const index = parseInt(e.target.dataset.index);
            navigateToMove(index);
        }
    }, 'moveHistory');
    
    // Settings changes
    safeOn(App.elements.playerColor, 'change', (e) => {
        App.playerColor = e.target.value;
    }, 'playerColor');
    
    // Export PGN
    safeOn(document.getElementById('exportPGN'), 'click', exportPGN, 'exportPGN');

    // Copy FEN to clipboard
    safeOn(document.getElementById('copyFEN'), 'click', () => {
        const fen = App.game.fen();
        navigator.clipboard.writeText(fen).then(() => {
            // Show brief feedback
            const btn = document.getElementById('copyFEN');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            btn.classList.add('btn-success');
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.classList.remove('btn-success');
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy FEN:', err);
            alert('Failed to copy FEN to clipboard');
        });
    }, 'copyFEN');

    // 3-COLUMN LAYOUT: Action Bar Buttons
    const btnSettings = document.getElementById('btnSettings');
    const btnResign = document.getElementById('btnResign');
    const btnHint = document.getElementById('btnHint');
    const btnUndo = document.getElementById('btnUndo');
    const btnDownload = document.getElementById('btnDownload');

    safeOn(btnSettings, 'click', () => {
        showModal('menuModal');
    }, 'btnSettings');

    safeOn(btnResign, 'click', () => {
        resignGame();
    }, 'btnResign');

    safeOn(btnHint, 'click', () => {
        if (!App.analyzing) {
            startAnalysis();
            showNotification('Analyzing position for best move...');
        } else {
            showNotification('Already analyzing - check Engine Analysis panel');
        }
        if (App.gameMode !== 'analysis' && !App.editMode) {
            App.gameActive = true;
            if (App.board) {
                App.board.draggable = true;
            }
        }
    }, 'btnHint');

    safeOn(btnUndo, 'click', () => {
        if (App.moveHistory.length > 0) {
            undoMove();
        } else {
            showNotification('No moves to undo');
        }
    }, 'btnUndo');

    safeOn(btnDownload, 'click', () => {
        exportPGN();
    }, 'btnDownload');

    // New Game Modal
    setupNewGameModal();
    
    // FEN Modal
    setupFENModal();
    
    // Menu Modal
    setupMenuModal();
    
    // Embed Modal
    setupEmbedModal();

    // Caissa Insight Modal
    setupInsightModal();

    // Coach Report Modal
    setupCoachModal();

    // Clear Insight Session Modal
    setupClearInsightHandlers();

    // Board Editor
    setupBoardEditor();

    // Engine vs Engine
    setupEngineVsEngine();

    // Modal close buttons (X buttons and "Close" buttons)
    document.querySelectorAll('.modal-close, button[data-modal]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const modalId = btn.dataset.modal || btn.getAttribute('data-modal');
            console.log('Close button clicked, modal:', modalId);
            if (modalId) {
                hideModal(modalId);
            }
        });
    });
    
    // Close modals on outside click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                hideModal(modal.id);
            }
        });
    });
}

// ===== NEW GAME MODAL =====
function setupNewGameModal() {
    const modal = document.getElementById('newGameModal');
    const gameModeSelect = document.getElementById('gameMode');
    const colorSelection = document.getElementById('colorSelection');
    const engineLevelSelection = document.getElementById('engineLevelSelection');
    const timeButtons = document.querySelectorAll('.time-btn');
    const colorButtons = document.querySelectorAll('.color-btn');
    const startButton = document.getElementById('startNewGame');
    
    let selectedTime = 0;
    let selectedColor = 'white';

    // Game mode change
    gameModeSelect.addEventListener('change', (e) => {
        const mode = e.target.value;
        const isEngine = mode === 'engine';

        // Show color/level selection only for engine mode
        // Hide for human, eve, and analysis modes
        colorSelection.style.display = isEngine ? 'block' : 'none';
        engineLevelSelection.style.display = isEngine ? 'block' : 'none';
    });

    // Time control selection
    timeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            timeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedTime = parseInt(btn.dataset.time);
        });
    });

    // Color selection
    colorButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            colorButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedColor = btn.dataset.color;
        });
    });

    // No engine level selection - always full power

    // Start game button
    startButton.addEventListener('click', () => {
        const mode = gameModeSelect.value;

        newGame({
            mode: mode,
            color: mode === 'engine' ? selectedColor : 'white',
            // No level - always full power
            timeControl: selectedTime
        });

        hideModal('newGameModal');
    });
}

// ===== FEN MODAL =====
function setupFENModal() {
    const loadButton = document.getElementById('loadFEN');
    const fenInput = document.getElementById('fenInput');
    const fenError = document.getElementById('fenError');

    loadButton.addEventListener('click', () => {
        console.log('🔘 Load FEN button clicked');
        const fen = fenInput.value.trim();
        console.log('📝 FEN input value:', fen);
        console.log('📝 FEN input length:', fen.length);

        if (!fen || fen.length === 0) {
            console.log('❌ FEN input is empty');
            fenError.textContent = 'Please enter a FEN string';
            fenError.classList.add('show');
            return;
        }

        console.log('✅ FEN input has content, attempting to load...');
        const success = loadFEN(fen);
        console.log('📝 loadFEN returned:', success);

        if (success) {
            console.log('✅ FEN loaded successfully, closing modal');
            hideModal('fenModal');
            fenInput.value = '';
            fenError.classList.remove('show');
        } else {
            console.log('❌ FEN load failed');
            fenError.textContent = 'Invalid FEN string. Please check and try again.';
            fenError.classList.add('show');
        }
    });

    // Also allow Enter key to submit
    fenInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            console.log('⌨️ Enter key pressed in FEN input');
            loadButton.click();
        }
    });

    // Clear error on input
    fenInput.addEventListener('input', () => {
        fenError.classList.remove('show');
    });
}

// ===== MENU MODAL =====
function setupMenuModal() {
    document.getElementById('menuNewGame').addEventListener('click', () => {
        hideModal('menuModal');
        showModal('newGameModal');
    });
    
    document.getElementById('menuFlipBoard').addEventListener('click', () => {
        flipBoard();
        hideModal('menuModal');
    });
    
    document.getElementById('menuPasteFEN').addEventListener('click', () => {
        hideModal('menuModal');
        showModal('fenModal');
    });

    document.getElementById('menuEditBoard').addEventListener('click', () => {
        hideModal('menuModal');
        toggleEditMode();
    });

    document.getElementById('menuAnalyzeGame').addEventListener('click', () => {
        hideModal('menuModal');

        // Check if there's a game history to analyze
        if (App.moveHistory.length === 0) {
            alert('No game to analyze. Play some moves first!');
            return;
        }

        // Enter analysis mode
        App.gameMode = 'analysis';
        App.gameActive = false;

        // TASK 8: Show analysis panels in analyze mode
        const playSection = document.getElementById('playSection');
        if (playSection) {
            playSection.classList.add('show-analysis');
        }

        // Navigate to the start of the game
        navigateToStart();

        // Start analysis from current position
        startAnalysis();

        showNotification('Analysis mode: Use navigation buttons to explore the game');
    });

    document.getElementById('menuEngineVsEngine')?.addEventListener('click', () => {
        hideModal('menuModal');
        const eveBtn = document.getElementById('engineVsEngineBtn');
        if (eveBtn) {
            eveBtn.click();
        } else if (typeof toggleEngineVsEngineMode === 'function') {
            toggleEngineVsEngineMode();
        } else {
            showNotification('Engine vs Engine mode unavailable');
        }
    });
    
    document.getElementById('menuCaissaInsight').addEventListener('click', () => {
        hideModal('menuModal');
        showModal('insightModal');
        loadInsightProfile(); // Load saved profile if exists
    });

    document.getElementById('menuMentor')?.addEventListener('click', () => {
        hideModal('menuModal');
        openMentorPanel();
    });

    document.getElementById('menuCheaterInsight').addEventListener('click', () => {
        hideModal('menuModal');
        showModal('cheaterInsightModal');
        initializeCheaterInsight();
    });

    document.getElementById('menuEmbed').addEventListener('click', () => {
        hideModal('menuModal');
        showModal('embedModal');
        generateEmbedCode();
    });

    document.getElementById('menuExportPGN').addEventListener('click', () => {
        exportPGN();
        hideModal('menuModal');
    });

    document.getElementById('menuAbout').addEventListener('click', () => {
        hideModal('menuModal');
        showModal('aboutModal');
    });

    document.getElementById('menuCredits').addEventListener('click', () => {
        hideModal('menuModal');
        showModal('creditsModal');
    });
}

// ===== EMBED MODAL =====
function setupEmbedModal() {
    const copyButton = document.getElementById('copyEmbed');

    copyButton.addEventListener('click', async () => {
        const embedCode = document.getElementById('embedCode');

        try {
            // Use modern Clipboard API
            await navigator.clipboard.writeText(embedCode.value);

            // Visual feedback
            const originalText = copyButton.innerHTML;
            copyButton.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => {
                copyButton.innerHTML = originalText;
            }, 2000);
        } catch (error) {
            // Fallback for older browsers
            try {
                embedCode.select();
                document.execCommand('copy');

                const originalText = copyButton.innerHTML;
                copyButton.innerHTML = '<i class="fas fa-check"></i> Copied!';
                setTimeout(() => {
                    copyButton.innerHTML = originalText;
                }, 2000);
            } catch (fallbackError) {
                showErrorNotification('Failed to copy to clipboard. Please copy manually.');
                debugLog('Clipboard error:', fallbackError);
            }
        }
    });
}

function generateEmbedCode() {
    const baseUrl = window.location.origin + window.location.pathname;
    const embedUrl = `${baseUrl}?embed=1`;
    const embedCode = `<iframe src="${embedUrl}" width="700" height="700" frameborder="0" allowfullscreen></iframe>`;

    document.getElementById('embedCode').value = embedCode;
}

// ===== BOARD EDITOR SETUP =====
function setupBoardEditor() {
    // Edit Board button removed from header - now only in Menu
    // Event listener for Menu → Edit Board is set up in setupEventListeners()

    // Exit Editor button
    if (App.elements.exitEditor) {
        App.elements.exitEditor.addEventListener('click', () => {
            exitEditMode();
        });
    }

    // Piece palette buttons
    document.querySelectorAll('.piece-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const piece = btn.dataset.piece;
            selectEditorPiece(piece);
        });
    });

    // Clear board button
    if (App.elements.clearBoard) {
        App.elements.clearBoard.addEventListener('click', () => {
            clearBoardEditor();
        });
    }

    // Reset to start button
    if (App.elements.resetToStart) {
        App.elements.resetToStart.addEventListener('click', () => {
            resetBoardEditor();
        });
    }

    // Apply position button
    if (App.elements.applyPosition) {
        App.elements.applyPosition.addEventListener('click', () => {
            applyEditorPosition();
        });
    }

    // Clear All button (completely empty board)
    const clearAllBtn = document.getElementById('clearAllBtn');
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', () => {
            if (confirm('Clear all pieces from the board?')) {
                App.board.position({});
                showNotification('Board cleared');
            }
        });
    }

    // Board square click handler for piece placement
    // We'll attach this to the board div and delegate to square clicks
    document.getElementById('chessboard').addEventListener('click', (e) => {
        if (!App.editMode) return;

        // Find the clicked square
        let target = e.target;

        // Traverse up to find the square element
        while (target && !target.classList.contains('square-55d63')) {
            target = target.parentElement;
            if (target === document.getElementById('chessboard')) {
                return; // Clicked outside a square
            }
        }

        if (target && target.classList.contains('square-55d63')) {
            // Extract square notation from class (e.g., 'square-a1')
            const squareClass = Array.from(target.classList).find(cls => cls.match(/square-[a-h][1-8]/));
            if (squareClass) {
                const square = squareClass.replace('square-', '');
                placeEditorPiece(square);
            }
        }
    });
}

// ===== PROMOTION DIALOG =====
function showPromotionDialog() {
    showModal('promotionModal');

    // Setup promotion piece selection (only once)
    const promotionButtons = document.querySelectorAll('.promotion-btn');
    promotionButtons.forEach(btn => {
        btn.replaceWith(btn.cloneNode(true)); // Remove old listeners
    });

    // Add new listeners
    document.querySelectorAll('.promotion-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const piece = btn.dataset.piece;
            handlePromotion(piece);
        });
    });
}

function handlePromotion(piece) {
    if (!App.pendingPromotion) return;

    const { from, to } = App.pendingPromotion;

    // Make the promotion move
    const result = App.game.move({
        from: from,
        to: to,
        promotion: piece
    });

    if (result === null) {
        App.board.position(App.game.fen());
    } else {
        onMoveMade(result);
    }

    // Clear pending promotion
    App.pendingPromotion = null;
    hideModal('promotionModal');
}

// ===== EDIT BOARD FUNCTIONALITY =====
function toggleEditMode() {
    App.editMode = !App.editMode;

    if (App.editMode) {
        enterEditMode();
    } else {
        exitEditMode();
    }
}

function enterEditMode() {
    console.log('🎨 Entering Board Editor mode');

    // Stop any active game
    App.gameActive = false;
    if (App.analyzing) {
        stopAnalysis();
    }

    // Show editor panel, hide analysis panel
    App.elements.editorPanel.style.display = 'block';
    document.getElementById('analysisPanel').style.display = 'none';

    // Add edit-mode class to board container
    document.querySelector('.board-container').classList.add('edit-mode');

    // Disable normal game logic
    App.board.draggable = false; // Disable drag-and-drop, use click instead

    // Store current position for cancellation
    App.editorStartPosition = App.game.fen();

    showNotification('Edit Mode: Select a piece and click on the board to place it.');
}

function exitEditMode() {
    console.log('🎨 Exiting Board Editor mode');

    // Reset edit mode state
    App.editMode = false;
    App.selectedEditorPiece = 'erase';
    App.editorMoveSource = null;

    // Hide editor panel, show analysis panel
    App.elements.editorPanel.style.display = 'none';
    document.getElementById('analysisPanel').style.display = 'block';

    // Remove edit-mode class
    document.querySelector('.board-container').classList.remove('edit-mode');

    // Re-enable normal game logic
    App.board.draggable = true;

    // Reset piece button selections
    document.querySelectorAll('.piece-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const eraseBtn = document.querySelector('.piece-btn[data-piece="erase"]');
    if (eraseBtn) eraseBtn.classList.add('active');

    showNotification('Edit mode disabled.');
}

// Board Editor: Select piece from palette
function selectEditorPiece(piece) {
    console.log('🎨 Selected piece:', piece);
    App.selectedEditorPiece = piece;
    App.editorMoveSource = null; // Reset move source when changing tool

    // Update active button
    document.querySelectorAll('.piece-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`.piece-btn[data-piece="${piece}"]`).classList.add('active');
}

// Board Editor: Place piece on square (click handler)
function placeEditorPiece(square) {
    if (!App.editMode) return;

    console.log('🎨 Placing piece on square:', square, 'piece:', App.selectedEditorPiece);

    const position = App.board.position();

    if (App.selectedEditorPiece === 'move') {
        // Move/Adjust mode: select source, then destination
        if (!App.editorMoveSource) {
            // First click: select piece to move
            if (position[square]) {
                App.editorMoveSource = square;
                console.log('🎨 Selected piece at', square, 'to move');
                showNotification(`Selected ${position[square]} at ${square}. Click destination square.`);
            } else {
                showNotification('No piece on that square. Select a piece to move.');
            }
        } else {
            // Second click: move piece to destination
            const piece = position[App.editorMoveSource];
            delete position[App.editorMoveSource];
            position[square] = piece;
            App.board.position(position);
            console.log('🎨 Moved piece from', App.editorMoveSource, 'to', square);
            showNotification(`Moved ${piece} from ${App.editorMoveSource} to ${square}`);
            App.editorMoveSource = null; // Reset for next move
        }
    } else if (App.selectedEditorPiece === 'erase') {
        // Remove piece from square
        delete position[square];
        App.board.position(position);
    } else {
        // Place selected piece on square
        position[square] = App.selectedEditorPiece;
        App.board.position(position);
    }
}

// Board Editor: Clear all pieces
function clearBoardEditor() {
    console.log('🎨 Clearing board');
    App.board.position({});
}

// Board Editor: Reset to starting position
function resetBoardEditor() {
    console.log('🎨 Resetting to start position');
    App.board.start();
}

// Board Editor: Apply position and generate FEN
function applyEditorPosition() {
    console.log('🎨 Applying editor position');

    try {
        // Get current board position
        const position = App.board.position();

        // Get side to move
        const sideToMove = document.querySelector('input[name="sideToMove"]:checked').value;

        // Get castling rights
        let castling = '';
        if (document.getElementById('castleWK').checked) castling += 'K';
        if (document.getElementById('castleWQ').checked) castling += 'Q';
        if (document.getElementById('castleBK').checked) castling += 'k';
        if (document.getElementById('castleBQ').checked) castling += 'q';
        if (castling === '') castling = '-';

        // Generate FEN (simplified - no en passant, halfmove, fullmove)
        const fenPosition = generateFENFromPosition(position);
        const fen = `${fenPosition} ${sideToMove} ${castling} - 0 1`;

        console.log('🎨 Generated FEN:', fen);

        // Load position into game
        const success = App.game.load(fen);

        if (success) {
            App.board.position(App.game.fen());
            updateStatus();
            exitEditMode();
            showNotification('Position loaded successfully!');
        } else {
            throw new Error('Invalid position');
        }
    } catch (error) {
        console.error('Failed to apply position:', error);
        showErrorNotification('Invalid position. Make sure both kings are on the board.');
    }
}

// Generate FEN position string from board position object
function generateFENFromPosition(position) {
    const rows = [];

    for (let rank = 8; rank >= 1; rank--) {
        let rowStr = '';
        let emptyCount = 0;

        for (let file = 'a'.charCodeAt(0); file <= 'h'.charCodeAt(0); file++) {
            const square = String.fromCharCode(file) + rank;
            const piece = position[square];

            if (piece) {
                if (emptyCount > 0) {
                    rowStr += emptyCount;
                    emptyCount = 0;
                }
                // Convert piece notation (e.g., 'wP' -> 'P', 'bP' -> 'p')
                const pieceChar = piece[0] === 'w' ? piece[1].toUpperCase() : piece[1].toLowerCase();
                rowStr += pieceChar;
            } else {
                emptyCount++;
            }
        }

        if (emptyCount > 0) {
            rowStr += emptyCount;
        }

        rows.push(rowStr);
    }

    return rows.join('/');
}

// ===== ENGINE VS ENGINE MODE =====
async function toggleEngineVsEngineMode() {
    console.log('🔄 Toggling Engine vs Engine mode. Current state:', App.eveMode);
    App.eveMode = !App.eveMode;
    console.log('🔄 New state:', App.eveMode);

    if (App.eveMode) {
        console.log('✅ Entering Engine vs Engine mode...');
        await enterEngineVsEngineMode();
    } else {
        console.log('❌ Exiting Engine vs Engine mode...');
        exitEngineVsEngineMode();
    }
}

async function enterEngineVsEngineMode() {
    try {
        console.log('🤖 Entering Engine vs Engine mode (external quick button)');
        console.log('🤖 Current position:', App.game.fen());

        // Stop analysis if running
        if (App.analyzing) {
            console.log('🛑 Stopping analysis first...');
            stopAnalysis();
        }

        // Show EvE panel, hide other panels
        console.log('🎨 Updating UI panels...');
        if (App.elements.evePanel) {
            App.elements.evePanel.style.display = 'block';
        }
        const enginePanel = document.querySelector('.engine-panel');
        const gameMenuPanel = document.querySelector('.game-menu-panel');
        const actionsPanel = document.querySelector('.actions-panel');
        if (enginePanel) enginePanel.style.display = 'none';
        if (gameMenuPanel) gameMenuPanel.style.display = 'none';
        if (actionsPanel) actionsPanel.style.display = 'none';

        // Automatically start engines from current position (QUICK START)
        // This is different from "New Game → Engine vs Engine" which resets to startpos
        showNotification('Engine vs Engine: Starting from current position...');

        // Auto-start the engines from current board position
        console.log('🚀 Starting engines...');
        await startEngineVsEngine();
        setTimeout(() => {
            try { App.board?.resize(); } catch (e) {}
        }, 0);
        console.log('✅ Engines started successfully');
    } catch (error) {
        console.error('❌ Error in enterEngineVsEngineMode:', error);
        showErrorNotification('Failed to enter Engine vs Engine mode');
        // Revert state
        App.eveMode = false;
        throw error;
    }
}

function exitEngineVsEngineMode() {
    console.log('🤖 Exiting Engine vs Engine mode');

    // Stop any running game
    if (App.eveRunning) {
        stopEngineVsEngine();
    }

    // Hide EvE panel, show other panels
    if (App.elements.evePanel) {
        App.elements.evePanel.style.display = 'none';
    }
    const enginePanel = document.querySelector('.engine-panel');
    const gameMenuPanel = document.querySelector('.game-menu-panel');
    const actionsPanel = document.querySelector('.actions-panel');
    if (enginePanel) enginePanel.style.display = 'block';
    if (gameMenuPanel) gameMenuPanel.style.display = 'block';
    if (actionsPanel) actionsPanel.style.display = 'block';
    setTimeout(() => {
        try { App.board?.resize(); } catch (e) {}
    }, 0);

    showNotification('Engine vs Engine mode disabled.');
}

async function startEngineVsEngine() {
    console.log('🤖 Starting Engine vs Engine game from position:', App.game.fen());

    try {
        // Get configuration
        App.eveMoveDelay = parseInt(App.elements.eveMoveDelay.value);

        // Clean up existing engines if they exist
        if (App.engineWhite) {
            console.log('Cleaning up existing White engine');
            App.engineWhite.terminate?.();
            App.engineWhite = null;
        }
        if (App.engineBlack) {
            console.log('Cleaning up existing Black engine');
            App.engineBlack.terminate?.();
            App.engineBlack = null;
        }

        // Create two engine instances at FULL POWER
        console.log('Creating White engine at FULL POWER');
        App.engineWhite = new StockfishEngine();
        // No skill level - full power

        console.log('Creating Black engine at FULL POWER');
        App.engineBlack = new StockfishEngine();
        // No skill level - full power

        // Wait for both engines to be ready
        await Promise.all([
            new Promise(resolve => {
                if (App.engineWhite.isReady()) {
                    resolve();
                } else {
                    App.engineWhite.onReady = resolve;
                }
            }),
            new Promise(resolve => {
                if (App.engineBlack.isReady()) {
                    resolve();
                } else {
                    App.engineBlack.onReady = resolve;
                }
            })
        ]);

        console.log('Both engines ready!');

        // Continue from current position (don't reset the board)
        const currentPosition = App.game.fen();
        const currentTurn = App.game.turn() === 'w' ? 'White' : 'Black';
        console.log(`🤖 Starting Engine vs Engine from position: ${currentPosition}`);
        console.log(`🤖 Current turn: ${currentTurn}`);

        App.gameMode = 'eve';
        App.gameActive = true;

        // Update UI
        App.eveRunning = true;
        App.evePaused = false;
        App.elements.pauseEve.style.display = 'block';
        App.elements.stopEve.style.display = 'block';

        // Disable configuration while running
        App.elements.eveMoveDelay.disabled = true;

        showNotification(`Engine vs Engine started! ${currentTurn} to move.`);

        // Start the game loop
        engineVsEngineLoop();

    } catch (error) {
        console.error('Failed to start Engine vs Engine:', error);
        showErrorNotification('Failed to start Engine vs Engine mode.');
    }
}

async function engineVsEngineLoop() {
    // Check if game is over or stopped
    if (!App.eveRunning || App.game.game_over()) {
        if (App.game.game_over()) {
            console.log('🤖 Game over!');

            if (App.game.in_checkmate()) {
                const winner = App.game.turn() === 'w' ? 'Black' : 'White';
                showNotification(`Game Over: ${winner} wins by checkmate!`);
            } else if (App.game.in_draw()) {
                showNotification('Game Over: Draw!');
            } else if (App.game.in_stalemate()) {
                showNotification('Game Over: Stalemate!');
            }
        }
        return;
    }

    // Check if paused
    if (App.evePaused) {
        console.log('🤖 Game paused');
        return;
    }

    // Determine which engine to use
    const currentTurn = App.game.turn(); // 'w' or 'b'
    const currentEngine = currentTurn === 'w' ? App.engineWhite : App.engineBlack;
    const engineName = currentTurn === 'w' ? 'White' : 'Black';

    console.log(`🤖 ${engineName} engine thinking...`);

    // Get current position
    const currentFen = App.game.fen();

    // CHECK OPENING BOOK FIRST
    let bookMoveUsed = false;
    if (App.useOpeningBook && App.openingBook && App.openingBook.loaded) {
        const fenParts = currentFen.split(' ');
        const fullmove = parseInt(fenParts[5]);

        // Only use book in opening (first 12 full moves)
        if (fullmove <= 12) {
            const bookMove = App.openingBook.selectBookMove(App.game);
            if (bookMove) {
                console.log(`📖 ${engineName} using opening book move:`, bookMove);
                bookMoveUsed = true;

                // Parse UCI move
                const from = bookMove.substring(0, 2);
                const to = bookMove.substring(2, 4);
                const promotion = bookMove.length > 4 ? bookMove[4] : undefined;

                const move = App.game.move({ from, to, promotion });

                if (move) {
                    // Update board and history
                    App.board.position(App.game.fen());
                    App.moveHistory.push(move);
                    App.currentMoveIndex = App.moveHistory.length - 1;

                    // Update UI
                    updateMoveHistory();
                    updateStatus();

                    console.log(`📖 ${engineName} played book move:`, move.san);

                    // Wait before next move
                    await sleep(500);

                    // Continue the loop
                    engineVsEngineLoop();
                    return;
                } else {
                    console.warn(`⚠️ ${engineName} book move invalid, falling back to engine`);
                    bookMoveUsed = false;
                }
            }
        }
    }

    // If book move wasn't used, proceed with engine
    if (!bookMoveUsed) {
        // Start analysis to show evaluation during thinking
        if (App.engine && App.engine.ready) {
            console.log(`🔍 Starting analysis for ${engineName}'s position`);
            App.analyzing = true;
            App.engine.startAnalysis(currentFen, (info) => {
                if (App.eveRunning) {
                    updateAnalysis(info);
                }
            });
        }

        // Request best move from engine
        currentEngine.getBestMove(currentFen, async (bestMove) => {
        // Stop analysis when move is found
        if (App.analyzing && App.engine) {
            console.log('⏹️ Stopping analysis - move found');
            App.engine.stopAnalysis();
            App.analyzing = false;
        }

        if (!App.eveRunning || App.evePaused) {
            return; // Game was stopped or paused during thinking
        }

        console.log(`🤖 ${engineName} engine selected move:`, bestMove);

        // Parse and make the move
        const from = bestMove.substring(0, 2);
        const to = bestMove.substring(2, 4);
        const promotion = bestMove.length > 4 ? bestMove[4] : undefined;

        const move = App.game.move({ from, to, promotion });

        if (move) {
            // Update board
            App.board.position(App.game.fen());

            // Update UI
            onMoveMade(move);

            // Wait for configured delay before next move
            await new Promise(resolve => setTimeout(resolve, App.eveMoveDelay));

            // Continue loop
            engineVsEngineLoop();
        } else {
            console.error('Invalid move from engine:', bestMove);
            showErrorNotification('Engine returned invalid move. Stopping game.');
            stopEngineVsEngine();
        }
        }, { movetime: 1000 }); // 1 second thinking time per move
    } // End if (!bookMoveUsed)
}

function pauseEngineVsEngine() {
    console.log('🤖 Pausing Engine vs Engine');
    App.evePaused = true;
    App.elements.pauseEve.style.display = 'none';
    App.elements.resumeEve.style.display = 'block';
    showNotification('Game paused.');
}

function resumeEngineVsEngine() {
    console.log('🤖 Resuming Engine vs Engine');
    App.evePaused = false;
    App.elements.pauseEve.style.display = 'block';
    App.elements.resumeEve.style.display = 'none';
    showNotification('Game resumed.');

    // Continue the loop
    engineVsEngineLoop();
}

function stopEngineVsEngine() {
    console.log('🤖 Stopping Engine vs Engine');

    // Stop the game
    App.eveRunning = false;
    App.evePaused = false;

    // Stop analysis if running
    if (App.analyzing && App.engine) {
        console.log('⏹️ Stopping analysis');
        App.engine.stopAnalysis();
        App.analyzing = false;
    }

    // Terminate engines
    if (App.engineWhite) {
        App.engineWhite.terminate();
        App.engineWhite = null;
    }
    if (App.engineBlack) {
        App.engineBlack.terminate();
        App.engineBlack = null;
    }

    // Update UI
    App.elements.pauseEve.style.display = 'none';
    App.elements.resumeEve.style.display = 'none';
    App.elements.stopEve.style.display = 'none';

    // Re-enable configuration
    App.elements.eveMoveDelay.disabled = false;

    setGameStatusText('Match stopped');
    showNotification('Engine vs Engine game stopped.');
}

// ===== PGN LIBRARY =====
let libraryData = null; // Store library data globally

async function loadPGNLibrary() {
    try {
        console.log('📚 Loading PGN library.json...');
        const response = await fetch('pgn/library.json');

        if (!response.ok) {
            console.warn('⚠️  library.json not found');
            return;
        }

        libraryData = await response.json();
        console.log('📚 Library loaded:', libraryData);

        // Populate category dropdown
        const categorySelector = App.elements.categorySelector;
        categorySelector.innerHTML = '<option value="">-- Select category --</option>';

        for (const category of Object.keys(libraryData)) {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categorySelector.appendChild(option);
        }

        console.log('✅ PGN Library loaded');
    } catch (error) {
        console.error('❌ Failed to load PGN library:', error);
    }
}

function onCategoryChange() {
    const category = App.elements.categorySelector.value;
    const playerSelector = App.elements.playerSelector;
    const fileSelector = App.elements.fileSelector;

    // Reset player and file dropdowns
    playerSelector.innerHTML = '<option value="">-- Select player --</option>';
    fileSelector.innerHTML = '<option value="">-- Select game --</option>';
    fileSelector.disabled = true;

    if (!category || !libraryData || !libraryData[category]) {
        playerSelector.disabled = true;
        return;
    }

    // Populate player dropdown
    playerSelector.disabled = false;
    const players = libraryData[category];

    for (const player of Object.keys(players)) {
        const option = document.createElement('option');
        option.value = player;
        option.textContent = player;
        playerSelector.appendChild(option);
    }
}

function onPlayerChange() {
    const category = App.elements.categorySelector.value;
    const player = App.elements.playerSelector.value;
    const fileSelector = App.elements.fileSelector;

    fileSelector.innerHTML = '<option value="">-- Select game --</option>';

    if (!category || !player || !libraryData || !libraryData[category] || !libraryData[category][player]) {
        fileSelector.disabled = true;
        return;
    }

    // Populate file dropdown
    fileSelector.disabled = false;
    const files = libraryData[category][player];

    files.forEach(game => {
        const option = document.createElement('option');
        option.value = game.file;
        option.textContent = game.label;
        option.dataset.white = game.white || '';
        option.dataset.black = game.black || '';
        option.dataset.event = game.event || '';
        option.dataset.result = game.result || '';
        fileSelector.appendChild(option);
    });
}

/**
 * Normalize PGN text by removing problematic characters and standardizing format
 * @param {string} text - Raw PGN text
 * @returns {string} - Normalized PGN text
 */
function normalizePGN(text) {
    if (!text) return '';

    // 1. Remove BOM (Byte Order Mark)
    text = text.replace(/^\uFEFF/, '');

    // 2. Normalize line endings: CRLF -> LF
    text = text.replace(/\r\n/g, '\n');

    // 3. Remove NBSP (non-breaking space) -> regular space
    text = text.replace(/\u00A0/g, ' ');

    // 4. Remove null bytes
    text = text.replace(/\0/g, '');

    // 5. Trim leading/trailing whitespace
    text = text.trim();

    return text;
}

/**
 * Split multi-game PGN text into individual games using [Event header as delimiter
 * @param {string} text - Normalized PGN text containing one or more games
 * @returns {string[]} - Array of individual game PGN strings
 */
function splitGamesFromPGN(text) {
    if (!text) return [];

    const games = [];
    const eventIndices = [];

    // Find all occurrences of [Event header
    // We need to find the actual position of [Event, not the newline before it
    let index = 0;
    while (index < text.length) {
        // Look for [Event at current position
        if (text.substring(index, index + 6) === '[Event') {
            eventIndices.push(index);
            // Move past this [Event to find the next one
            index += 6;
        } else {
            index++;
        }
    }

    console.log('🔍 Found [Event headers at indices:', eventIndices);

    // If no [Event headers found, treat entire text as single game
    if (eventIndices.length === 0) {
        console.log('⚠️ No [Event headers found, returning entire text as single game');
        return [text.trim()];
    }

    // Slice games between [Event positions
    for (let i = 0; i < eventIndices.length; i++) {
        const start = eventIndices[i];
        const end = i < eventIndices.length - 1 ? eventIndices[i + 1] : text.length;

        // Get the game text
        let game = text.slice(start, end);

        // Trim leading/trailing whitespace but preserve internal structure
        game = game.trim();

        if (game) {
            console.log(`📄 Game ${i + 1}: ${game.length} chars, starts: "${game.substring(0, 50)}..."`);
            games.push(game);
        }
    }

    console.log(`✅ Split into ${games.length} game(s)`);
    return games;
}

/**
 * Load PGN programmatically by extracting and playing moves one by one.
 * This bypasses chess.js v0.10.3's character length limit in load_pgn().
 *
 * @param {string} pgnText - The PGN text to load
 * @returns {boolean} - True if successful, false otherwise
 */
function loadPGNProgrammatically(pgnText) {
    console.log('🔧 Loading PGN programmatically...');

    try {
        // Extract movetext (everything after headers)
        const headerEndIndex = pgnText.lastIndexOf(']');
        if (headerEndIndex === -1) {
            console.error('❌ No headers found in PGN');
            return false;
        }

        let movetext = pgnText.substring(headerEndIndex + 1).trim();
        console.log('🔧 Movetext length:', movetext.length, 'chars');
        console.log('🔧 First 100 chars of movetext:', movetext.substring(0, 100));

        // Remove comments in braces { }
        movetext = movetext.replace(/\{[^}]*\}/g, '');

        // Remove variations in parentheses ( ) - simple approach
        while (movetext.includes('(')) {
            movetext = movetext.replace(/\([^()]*\)/g, '');
        }

        // Remove result tokens (1-0, 0-1, 1/2-1/2, *)
        movetext = movetext.replace(/\s*(1-0|0-1|1\/2-1\/2|\*)\s*$/g, '');

        // Remove move numbers (e.g., "1.", "2.", "15...")
        movetext = movetext.replace(/\d+\.\s*/g, '');

        // Remove extra whitespace and split into individual moves
        const moves = movetext.trim().split(/\s+/).filter(m => m.length > 0);

        console.log('🔧 Extracted', moves.length, 'moves:', moves.slice(0, 10).join(' '), '...');

        // Play each move on the chess.js board
        let moveCount = 0;
        for (const move of moves) {
            const result = App.game.move(move, { sloppy: true });
            if (!result) {
                console.error('❌ Failed to play move:', move, 'at position', moveCount);
                console.error('❌ FEN at failure:', App.game.fen());
                console.error('❌ Legal moves:', App.game.moves().join(', '));
                return false;
            }
            moveCount++;
        }

        console.log('✅ Successfully loaded', moveCount, 'moves programmatically');
        return true;

    } catch (error) {
        console.error('❌ Error in programmatic PGN loading:', error);
        console.error('❌ Error stack:', error.stack);
        return false;
    }
}

async function loadSelectedPGN() {
    const selectedFile = App.elements.fileSelector.value;

    if (!selectedFile) {
        showNotification('Please select a game first.');
        return;
    }

    const selectedOption = App.elements.fileSelector.options[App.elements.fileSelector.selectedIndex];
    console.log('📖 Loading PGN from path:', selectedFile);

    try {
        // Fetch PGN file
        const response = await fetch(selectedFile);

        // Log fetch details
        console.log('📖 Fetch URL:', response.url);
        console.log('📖 Response status:', response.status, response.statusText);

        if (!response.ok) {
            console.error('❌ Failed to fetch PGN file:', response.status, response.statusText);
            throw new Error(`Failed to load PGN: ${response.statusText}`);
        }

        let pgnText = await response.text();
        console.log('📖 PGN file fetched successfully');
        console.log('📖 Response text length:', pgnText.length);
        console.log('📖 First 200 chars:', pgnText.substring(0, 200));

        // Normalize PGN using robust normalization function
        pgnText = normalizePGN(pgnText);
        console.log('📖 After normalization - length:', pgnText.length);

        // Split multi-game PGN using robust [Event-based delimiter
        const games = splitGamesFromPGN(pgnText);
        console.log('📖 Found', games.length, 'game(s) in PGN file');

        // For now, use first game (or implement game selection later)
        let selectedGamePgn = games.length > 0 ? games[0] : pgnText;

        console.log('📖 Selected game PGN (first 200 chars):', selectedGamePgn.substring(0, 200));

        // ===== CRITICAL DEBUG LOGS BEFORE CHESS.JS LOADING =====
        console.log('🔍 Selected PGN length:', selectedGamePgn.length);

        // Count [Event headers - must be exactly 1 for a single game
        const eventCount = (selectedGamePgn.match(/\[Event\s/g) || []).length;
        console.log('🔍 [Event header count:', eventCount, '(must be 1)');

        // Show last 300 characters to verify completeness
        const last300 = selectedGamePgn.slice(-300);
        console.log('🔍 Last 300 chars:', last300);

        // Check if ends with result token (1-0, 0-1, 1/2-1/2, or *)
        const hasResultToken = /\s*(1-0|0-1|1\/2-1\/2|\*)\s*$/.test(selectedGamePgn.trim());
        console.log('🔍 Ends with result token:', hasResultToken);

        // If no result token, append " *" to make it valid
        if (!hasResultToken) {
            selectedGamePgn = selectedGamePgn.trim() + ' *';
            console.log('🔧 Appended result token: *');
        }
        // ===== END DEBUG LOGS =====

        // Reset game first
        App.game.reset();

        // Load with chess.js using sloppy mode
        console.log('📖 Attempting to load PGN into chess.js with sloppy mode...');
        let success = false;

        // WORKAROUND: chess.js v0.10.3 has a character length limit (~400-500 chars)
        // For long PGN files, we need to load moves programmatically instead of using load_pgn()
        console.log('🔧 PGN length:', selectedGamePgn.length, 'chars');

        if (selectedGamePgn.length > 450) {
            console.log('🔧 PGN exceeds 450 chars - using programmatic move loading to bypass chess.js limit');
            success = loadPGNProgrammatically(selectedGamePgn);
        } else {
            // Try load_pgn with sloppy (chess.js v0.10.3 uses underscores)
            if (typeof App.game.load_pgn === 'function') {
                success = App.game.load_pgn(selectedGamePgn, { sloppy: true });
                console.log('📖 load_pgn() result:', success);
            }
            // Fallback to loadPgn (newer versions)
            else if (typeof App.game.loadPgn === 'function') {
                success = App.game.loadPgn(selectedGamePgn, { sloppy: true });
                console.log('📖 loadPgn() result:', success);
            }
            else {
                console.error('❌ No PGN loading method found on chess.js instance');
                throw new Error('Chess.js PGN loader not found');
            }
        }

        if (!success) {
            console.error('❌ chess.js rejected PGN');
            console.error('❌ First 200 chars of rejected PGN:', selectedGamePgn.substring(0, 200));
            throw new Error('Invalid PGN format');
        }

        console.log('✅ PGN loaded successfully into chess.js');

        // Set game mode to analysis (allows free navigation)
        App.gameMode = 'analysis';
        App.gameActive = false;

        // TASK 8: Show analysis panels when loading PGN for analysis
        const playSection = document.getElementById('playSection');
        if (playSection) {
            playSection.classList.add('show-analysis');
        }

        // Stop engine if running
        if (App.engine) {
            stopAnalysis();
        }

        // Rebuild move history from chess.js
        const history = App.game.history({ verbose: true });
        App.moveHistory = history;
        App.currentMoveIndex = history.length - 1; // Start at end position

        console.log('📖 Move history populated:', App.moveHistory.length, 'moves');

        // Update board to match chess.js state (final position)
        App.board.position(App.game.fen());

        // Update UI
        updateMoveHistory();
        updateStatus();

        // Parse PGN for metadata display
        const pgnData = parsePGN(selectedGamePgn);

        // Show PGN info (use dataset from option if available, fallback to parsed data)
        App.elements.pgnInfo.style.display = 'block';
        const white = selectedOption.dataset.white || pgnData.white || '?';
        const black = selectedOption.dataset.black || pgnData.black || '?';
        const event = selectedOption.dataset.event || pgnData.event || '-';
        const result = selectedOption.dataset.result || pgnData.result || '-';

        App.elements.pgnEvent.textContent = event;
        App.elements.pgnPlayers.textContent = `${white} vs ${black}`;
        App.elements.pgnResult.textContent = result;

        // Store loaded game info for Library integration
        App.loadedGameInfo = {
            white: white,
            black: black,
            date: pgnData.date || new Date().toISOString().split('T')[0],
            result: result,
            event: event,
            site: pgnData.site || null
        };

        // Notify Library UI that a game is loaded
        if (typeof LibraryUI !== 'undefined') {
            LibraryUI.onGameLoaded(App.loadedGameInfo);
        }

        showNotification(`Loaded: ${white} vs ${black} (${App.moveHistory.length} moves)`);

        console.log('✅ PGN load complete');

    } catch (error) {
        console.error('❌ Failed to load PGN:', error);
        console.error('❌ Error stack:', error.stack);
        showErrorNotification(`Failed to load game: ${error.message}`);
    }
}

function cleanPGN(pgnText) {
    console.log('🧹 Cleaning PGN...');

    // Remove comments between { }
    let cleaned = pgnText.replace(/\{[^}]*\}/g, '');

    // Remove variations between ( )
    // This is tricky because variations can be nested, but we'll do a simple pass
    cleaned = cleaned.replace(/\([^)]*\)/g, '');

    // Remove NAG (Numeric Annotation Glyphs) like $1, $2, etc.
    cleaned = cleaned.replace(/\$\d+/g, '');

    // Remove excessive whitespace but keep line breaks initially
    cleaned = cleaned.replace(/[ \t]+/g, ' ').trim();

    // Split into headers and moves
    const headerSection = [];
    let movesText = '';

    const lines = cleaned.split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith('[')) {
            headerSection.push(trimmed);
        } else if (trimmed.length > 0 && !trimmed.startsWith('[')) {
            movesText += ' ' + trimmed;
        }
    }

    // Clean up moves text
    movesText = movesText.trim();

    // Ensure game result is present at the end
    // Check if moves end with a game termination marker
    const gameResults = ['1-0', '0-1', '1/2-1/2', '*'];
    let hasResult = false;

    for (const result of gameResults) {
        if (movesText.endsWith(result)) {
            hasResult = true;
            break;
        }
    }

    // If no result found at end, try to extract it from Result header
    if (!hasResult) {
        const resultHeader = headerSection.find(h => h.includes('[Result'));
        if (resultHeader) {
            const match = resultHeader.match(/\[Result "(.+)"\]/);
            if (match && match[1]) {
                movesText += ' ' + match[1];
                console.log('📌 Added game result from header:', match[1]);
            }
        }
    }

    // Rebuild PGN with clean formatting
    const result = headerSection.join('\n') + '\n\n' + movesText;

    console.log('✅ PGN cleaned');
    return result;
}

function parsePGN(pgnText) {
    const lines = pgnText.split('\n');
    const data = {
        event: '',
        site: '',
        date: '',
        white: '',
        black: '',
        result: ''
    };

    for (const line of lines) {
        const eventMatch = line.match(/\[Event\s+"([^"]+)"\]/);
        const siteMatch = line.match(/\[Site\s+"([^"]+)"\]/);
        const dateMatch = line.match(/\[Date\s+"([^"]+)"\]/);
        const whiteMatch = line.match(/\[White\s+"([^"]+)"\]/);
        const blackMatch = line.match(/\[Black\s+"([^"]+)"\]/);
        const resultMatch = line.match(/\[Result\s+"([^"]+)"\]/);

        if (eventMatch) data.event = eventMatch[1];
        if (siteMatch) data.site = siteMatch[1];
        if (dateMatch) data.date = dateMatch[1];
        if (whiteMatch) data.white = whiteMatch[1];
        if (blackMatch) data.black = blackMatch[1];
        if (resultMatch) data.result = resultMatch[1];
    }

    return data;
}

// Parse multi-game PGN and extract aggregate statistics
function parseMultiGamePGN(pgnText) {
    console.log('🔍 Parsing multi-game PGN...');

    // Normalize PGN text first
    pgnText = normalizePGN(pgnText);

    // Split by [Event header using robust splitting function
    const gameSections = splitGamesFromPGN(pgnText);
    const games = [];
    const stats = {
        total: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        avgPlyCount: 0,
        openings: {} // ECO code counts
    };

    let totalPlies = 0;

    for (const section of gameSections) {
        const trimmed = section.trim();
        if (!trimmed || !trimmed.startsWith('[Event')) continue;

        // Extract headers
        const headers = {};
        const headerMatches = {
            event: /\[Event\s+"([^"]+)"\]/,
            site: /\[Site\s+"([^"]+)"\]/,
            date: /\[Date\s+"([^"]+)"\]/,
            white: /\[White\s+"([^"]+)"\]/,
            black: /\[Black\s+"([^"]+)"\]/,
            result: /\[Result\s+"([^"]+)"\]/,
            eco: /\[ECO\s+"([^"]+)"\]/,
            timeControl: /\[TimeControl\s+"([^"]+)"\]/
        };

        for (const [key, regex] of Object.entries(headerMatches)) {
            const match = trimmed.match(regex);
            if (match) headers[key] = match[1];
        }

        // Store raw PGN for this game
        headers.pgn = trimmed;

        // Parse moves using Chess.js
        let moves = [];
        let plyCount = 0;
        try {
            const chess = new Chess();
            const loaded = chess.load_pgn(trimmed);
            if (loaded) {
                moves = chess.history();
                plyCount = moves.length;
            }
        } catch (error) {
            console.warn('⚠️ Failed to parse moves for game:', headers.event, error);
        }

        // Determine outcome
        let outcome = 'unknown';
        let userColor = 'unknown';

        if (headers.result) {
            if (headers.result === '1-0') {
                outcome = 'white-win';
            } else if (headers.result === '0-1') {
                outcome = 'black-win';
            } else if (headers.result === '1/2-1/2') {
                outcome = 'draw';
            }
        }

        // Store game data
        games.push({
            headers,
            moves,
            plyCount,
            outcome,
            userColor
        });

        // Update stats
        stats.total++;
        totalPlies += plyCount;

        // Count openings
        if (headers.eco) {
            stats.openings[headers.eco] = (stats.openings[headers.eco] || 0) + 1;
        }
    }

    // Calculate average ply count
    if (stats.total > 0) {
        stats.avgPlyCount = Math.round(totalPlies / stats.total);
    }

    console.log(`✅ Parsed ${stats.total} games`);
    console.log('📊 Stats:', stats);

    return {
        games,
        stats,
        rawText: pgnText
    };
}

// Setup Engine vs Engine event listeners
function setupEngineVsEngine() {
    // Engine vs Engine button in header (kept for quick access)
    if (!App.elements.engineVsEngineBtn) {
        console.error('❌ Engine vs Engine button not found in DOM!');
        return;
    }

    console.log('✅ Setting up Engine vs Engine button');
    console.log('📍 Button element:', App.elements.engineVsEngineBtn);
    console.log('📍 Button visible:', App.elements.engineVsEngineBtn.offsetParent !== null);
    console.log('📍 Button computed style:', window.getComputedStyle(App.elements.engineVsEngineBtn).display);

    // Add both click and touchend for better mobile support
    const handleEveClick = async (e) => {
        console.log('🤖 Engine vs Engine button clicked/touched');
        e.preventDefault();
        e.stopPropagation();
        try {
            await toggleEngineVsEngineMode();
        } catch (error) {
            console.error('❌ Error toggling Engine vs Engine mode:', error);
            showErrorNotification('Failed to start Engine vs Engine mode');
        }
    };

    App.elements.engineVsEngineBtn.addEventListener('click', handleEveClick);
    App.elements.engineVsEngineBtn.addEventListener('touchend', handleEveClick, { passive: false });

    // Pause button
    App.elements.pauseEve.addEventListener('click', () => {
        pauseEngineVsEngine();
    });

    // Resume button
    App.elements.resumeEve.addEventListener('click', () => {
        resumeEngineVsEngine();
    });

    // Stop button
    App.elements.stopEve.addEventListener('click', () => {
        stopEngineVsEngine();
    });
}

// ===== NOTIFICATION SYSTEM =====
function showNotification(message, duration = 3000) {
    // Create notification element if it doesn't exist
    let notification = document.getElementById('notification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'notification';
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: var(--primary-color);
            color: white;
            padding: 16px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            z-index: 2000;
            animation: slideInRight 0.3s ease;
        `;
        document.body.appendChild(notification);
    }

    notification.textContent = message;
    notification.style.display = 'block';

    setTimeout(() => {
        notification.style.display = 'none';
    }, duration);
}

function showErrorNotification(message) {
    let notification = document.getElementById('notification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'notification';
        document.body.appendChild(notification);
    }

    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: var(--danger-color);
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        z-index: 2000;
        animation: slideInRight 0.3s ease;
    `;

    notification.textContent = message;
    notification.style.display = 'block';

    setTimeout(() => {
        notification.style.display = 'none';
    }, 4000);
}

// ===== UTILITY FUNCTIONS =====
function updateUI() {
    updateStatus();
    updateMoveHistory();
    updateTimers();
    updateNavigationButtons();
}

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', (e) => {
    // Don't handle shortcuts if typing in input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
    }
    
    switch(e.key) {
        case 'ArrowLeft':
            navigateToPrevious();
            break;
        case 'ArrowRight':
            navigateToNext();
            break;
        case 'Home':
            navigateToStart();
            break;
        case 'End':
            navigateToEnd();
            break;
        case 'f':
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                flipBoard();
            }
            break;
        case 'n':
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                showModal('newGameModal');
            }
            break;
        case 'Escape':
            // Close any open modal
            const openModal = document.querySelector('.modal.show');
            if (openModal) {
                hideModal(openModal.id);
            }
            break;
    }
});

// ===== ERROR HANDLING =====
window.addEventListener('error', (e) => {
    // Ignore Clerk errors if auth is not configured (we handle this gracefully)
    const errorMsg = e.error?.message || '';
    if (errorMsg.includes('clerk') || errorMsg.includes('publishableKey')) {
        console.warn('Application error (auth related):', e.error);
        return true; // Prevent error propagation
    }

    console.error('Application error:', e.error);
    showErrorNotification('An unexpected error occurred. The application may need to be refreshed.');
    return false;
});

window.addEventListener('unhandledrejection', (e) => {
    // Ignore Clerk promise rejections
    const reason = e.reason?.message || String(e.reason || '');
    if (reason.includes('clerk') || reason.includes('publishableKey')) {
        console.warn('Unhandled promise rejection (auth related):', e.reason);
        return true;
    }

    console.error('Unhandled promise rejection:', e.reason);
    showErrorNotification('An error occurred while processing your request.');
    return false;
});

// ===== CAISSA INSIGHT MODULE =====

// Insight state
let insightProfile = null;

// Load saved insight profile from localStorage
function loadInsightProfile() {
    console.log('📊 Loading Caissa Insight profile...');
    try {
        const saved = localStorage.getItem('caissa_insight_profile');
        if (saved) {
            insightProfile = JSON.parse(saved);
            console.log('✅ Profile loaded:', insightProfile);

            // Display saved profile in modal
            displayInsightResults(insightProfile);

            // Also populate the textarea with the raw PGN for potential refresh
            const pgnInput = document.getElementById('insightPgnInput');
            if (pgnInput && insightProfile.rawText) {
                pgnInput.value = insightProfile.rawText;
            }
        } else {
            console.log('ℹ️ No saved profile found');
        }
    } catch (error) {
        console.error('❌ Failed to load insight profile:', error);
    }
}

// Save insight profile to localStorage
function saveInsightProfile(profile) {
    console.log('💾 Saving Caissa Insight profile...');
    try {
        localStorage.setItem('caissa_insight_profile', JSON.stringify(profile));
        insightProfile = profile;
        console.log('✅ Profile saved successfully');
        updateInsightIndicator(); // Update indicator when data is saved
    } catch (error) {
        console.error('❌ Failed to save insight profile:', error);
        showErrorNotification('Failed to save your profile');
    }
}

// Calculate 8-dimensional radar metrics (0-100 scale)
function calculateRadarMetrics(data) {
    console.log('🧮 Calculating radar metrics...');

    if (!data.games || data.games.length === 0) {
        return Array(8).fill(0);
    }

    const games = data.games;
    const total = games.length;

    // 1. TACTICS - Based on short decisive games (<40 moves with wins)
    const shortWins = games.filter(g =>
        g.plyCount < 80 && (g.outcome === 'white-win' || g.outcome === 'black-win')
    ).length;
    const tacticsScore = Math.min(100, (shortWins / total) * 200);

    // 2. STRATEGY - Based on long games (>60 moves)
    const longGames = games.filter(g => g.plyCount > 120).length;
    const strategyScore = Math.min(100, (longGames / total) * 150);

    // 3. OPENING - ECO diversity + games with ECO defined
    const ecoCount = Object.keys(data.stats.openings).length;
    const gamesWithEco = games.filter(g => g.headers.eco).length;
    const openingScore = Math.min(100, (ecoCount * 15) + ((gamesWithEco / total) * 40));

    // 4. ENDGAME - Games reaching >40 moves
    const endgames = games.filter(g => g.plyCount > 80).length;
    const endgameScore = Math.min(100, (endgames / total) * 120);

    // 5. PRECISION - Win rate in decisive games
    const decisiveGames = games.filter(g =>
        g.outcome === 'white-win' || g.outcome === 'black-win'
    ).length;
    const draws = games.filter(g => g.outcome === 'draw').length;
    const precisionScore = decisiveGames > 0
        ? Math.min(100, ((decisiveGames - draws) / total) * 100 + 30)
        : 30;

    // 6. AGGRESSION - Inverse of average ply count (shorter = more aggressive)
    const avgPly = data.stats.avgPlyCount || 80;
    const aggressionScore = Math.max(0, Math.min(100, 150 - avgPly * 0.8));

    // 7. DEFENSE - Draw percentage
    const defenseScore = Math.min(100, (draws / total) * 200);

    // 8. CONSISTENCY - Inverse of standard deviation (lower stddev = more consistent)
    const plyCounts = games.map(g => g.plyCount);
    const mean = plyCounts.reduce((a, b) => a + b, 0) / plyCounts.length;
    const variance = plyCounts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / plyCounts.length;
    const stdDev = Math.sqrt(variance);
    const consistencyScore = Math.max(0, Math.min(100, 100 - stdDev * 0.5));

    const metrics = [
        tacticsScore,
        strategyScore,
        openingScore,
        endgameScore,
        precisionScore,
        aggressionScore,
        defenseScore,
        consistencyScore
    ];

    console.log('📊 Radar metrics calculated:', metrics);
    return metrics;
}

// Render radar chart on canvas
function renderRadarChart(canvasId, metrics) {
    console.log('🎨 Rendering radar chart...');

    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error('❌ Canvas not found:', canvasId);
        return;
    }

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.35;

    const labels = [
        'Tactics',
        'Strategy',
        'Opening',
        'Endgame',
        'Precision',
        'Aggression',
        'Defense',
        'Consistency'
    ];

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw grid circles (background)
    ctx.strokeStyle = '#dfe6e9';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 5; i++) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, (radius * i) / 5, 0, 2 * Math.PI);
        ctx.stroke();
    }

    // Draw axes
    ctx.strokeStyle = '#b2bec3';
    ctx.lineWidth = 1;
    const angleStep = (2 * Math.PI) / 8;

    for (let i = 0; i < 8; i++) {
        const angle = angleStep * i - Math.PI / 2;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);

        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(x, y);
        ctx.stroke();
    }

    // Draw labels
    ctx.fillStyle = '#2c3e50';
    ctx.font = 'bold 13px Segoe UI';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < 8; i++) {
        const angle = angleStep * i - Math.PI / 2;
        const labelRadius = radius + 30;
        const x = centerX + labelRadius * Math.cos(angle);
        const y = centerY + labelRadius * Math.sin(angle);

        ctx.fillText(labels[i], x, y);
    }

    // Draw data polygon
    ctx.beginPath();
    ctx.strokeStyle = '#2c5f9e';
    ctx.fillStyle = 'rgba(44, 95, 158, 0.2)';
    ctx.lineWidth = 3;

    for (let i = 0; i < 8; i++) {
        const angle = angleStep * i - Math.PI / 2;
        const value = metrics[i] / 100; // Normalize to 0-1
        const x = centerX + radius * value * Math.cos(angle);
        const y = centerY + radius * value * Math.sin(angle);

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }

    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Draw data points
    ctx.fillStyle = '#2c5f9e';
    for (let i = 0; i < 8; i++) {
        const angle = angleStep * i - Math.PI / 2;
        const value = metrics[i] / 100;
        const x = centerX + radius * value * Math.cos(angle);
        const y = centerY + radius * value * Math.sin(angle);

        ctx.beginPath();
        ctx.arc(x, y, 5, 0, 2 * Math.PI);
        ctx.fill();
    }

    console.log('✅ Radar chart rendered');
}

// Generate Caissa narrative based on metrics
function generateCaissaNarrative(data, metrics) {
    console.log('📝 Generating Caissa narrative...');

    const [tactics, strategy, opening, endgame, precision, aggression, defense, consistency] = metrics;
    const total = data.stats.total;
    // Use full moves (not plies) - same calculation as the stat card
    const avgFullMoves = Math.round(data.stats.avgPlyCount / 2);

    // Identify strengths (>70) and weaknesses (<40)
    const dimensions = [
        { name: 'tactics', value: tactics, threshold: 70 },
        { name: 'strategy', value: strategy, threshold: 70 },
        { name: 'opening', value: opening, threshold: 70 },
        { name: 'endgame', value: endgame, threshold: 70 },
        { name: 'precision', value: precision, threshold: 70 },
        { name: 'aggression', value: aggression, threshold: 70 },
        { name: 'defense', value: defense, threshold: 70 },
        { name: 'consistency', value: consistency, threshold: 70 }
    ];

    const strengths = dimensions.filter(d => d.value >= 70);
    const weaknesses = dimensions.filter(d => d.value < 40);
    const balanced = dimensions.filter(d => d.value >= 40 && d.value < 70);

    // Build narrative paragraphs
    let narrative = '';

    // Introduction - use avgFullMoves (full moves, not plies)
    narrative += `<p><strong>Caissa, the goddess of chess, has examined your ${total} games</strong> and reveals a unique profile. `;
    narrative += `Your games average ${avgFullMoves} moves, `;
    if (avgFullMoves < 30) {
        narrative += 'showing a tendency toward quick and decisive battles.';
    } else if (avgFullMoves < 45) {
        narrative += 'reflecting a balance between tactical and strategic play.';
    } else {
        narrative += 'demonstrating a preference for positional warfare and long endgames.';
    }
    narrative += '</p>';

    // Strengths
    if (strengths.length > 0) {
        narrative += '<p><strong>Manifest Strengths:</strong> ';
        if (tactics >= 70) {
            narrative += 'Your tactical vision is sharp as a blade, capable of detecting hidden combinations on the board. ';
        }
        if (strategy >= 70) {
            narrative += 'You master the art of long-term planning, weaving strategic nets that trap your opponents. ';
        }
        if (opening >= 70) {
            narrative += 'Your opening repertoire is diverse and solid, demonstrating deep theoretical knowledge. ';
        }
        if (endgame >= 70) {
            narrative += 'In the endgame, when the board clears, your technique shines with mastery. ';
        }
        if (precision >= 70) {
            narrative += 'Your decisions are precise and calculated, minimizing errors in critical moments. ';
        }
        if (aggression >= 70) {
            narrative += 'You play with fire in your veins, attacking with courage and determination. ';
        }
        if (defense >= 70) {
            narrative += 'You are an unbreakable fortress, capable of defending seemingly lost positions. ';
        }
        if (consistency >= 70) {
            narrative += 'Your play is consistent and reliable, maintaining a stable level game after game. ';
        }
        narrative += '</p>';
    }

    // Weaknesses and recommendations
    if (weaknesses.length > 0) {
        narrative += '<p><strong>Areas Caissa Invites You to Cultivate:</strong> ';
        if (tactics < 40) {
            narrative += 'Strengthen your tactical vision with combination exercises. Sacrifices and basic tactical motifs await you. ';
        }
        if (strategy < 40) {
            narrative += 'Dedicate time to studying games by Capablanca and Karpov to improve your strategic understanding. ';
        }
        if (opening < 40) {
            narrative += 'Expand your opening repertoire. Study fundamental principles: development, center control, king safety. ';
        }
        if (endgame < 40) {
            narrative += 'Endgames are the foundation of mastery. Practice basic pawn and rook endings. ';
        }
        if (precision < 40) {
            narrative += 'Take more time to calculate. Precision is built through patience and variation checking. ';
        }
        if (aggression < 40) {
            narrative += 'Do not fear calculated risk. Study games by Tal and Kasparov to learn the art of attack. ';
        }
        if (defense < 40) {
            narrative += 'Develop your defensive resilience. Learn to create counterplay when under pressure. ';
        }
        if (consistency < 40) {
            narrative += 'Work on maintaining a stable level. Analyze your errors to avoid ups and downs in your play. ';
        }
        narrative += '</p>';
    }

    // Balanced areas
    if (balanced.length > 0 && strengths.length > 0 && weaknesses.length > 0) {
        narrative += '<p>Your skills in ';
        const balancedNames = balanced.map(d => d.name).slice(0, 3);
        narrative += balancedNames.join(', ');
        narrative += ' show solid fundamentals with room to grow. ';
        narrative += 'These aspects can become strengths with dedicated practice.</p>';
    }

    // Closing wisdom
    narrative += '<p><em>Caissa reminds you: chess is an infinite journey of learning. ';
    narrative += 'Each game is a lesson, each mistake an opportunity. ';
    narrative += 'May your pieces dance with grace and your plans flourish in victory.</em></p>';

    console.log('✅ Narrative generated');
    return narrative;
}

// Display insight analysis results in the modal
function displayInsightResults(data) {
    console.log('📊 Displaying insight results...');

    // Notify CAISSA Mentor AI that insight data is available (for personalized advice)
    if (typeof MentorAI !== 'undefined' && MentorAI.onInsightDataAvailable) {
        MentorAI.onInsightDataAvailable(data);
    }

    const importSection = document.getElementById('insightImportSection');
    const resultsSection = document.getElementById('insightResultsSection');
    const statsSummary = document.getElementById('insightStatsSummary');
    const sourceBadge = document.getElementById('insightSourceBadge');

    if (!resultsSection || !statsSummary) {
        console.error('❌ Results elements not found');
        return;
    }

    // Hide import section, show results
    if (importSection) importSection.style.display = 'none';
    resultsSection.style.display = 'block';

    // Detect and display source platform
    if (sourceBadge && data.games && data.games.length > 0) {
        const firstGame = data.games[0];
        const source = firstGame.source || 'local';

        // Set badge text and class
        if (source === 'lichess') {
            sourceBadge.textContent = 'Source: Lichess';
            sourceBadge.className = 'source-badge lichess';
        } else if (source === 'chess.com') {
            sourceBadge.textContent = 'Source: Chess.com';
            sourceBadge.className = 'source-badge chesscom';
        } else {
            sourceBadge.textContent = 'Source: Local PGN';
            sourceBadge.className = 'source-badge local';
        }
        sourceBadge.style.display = 'inline-block';
    } else if (sourceBadge) {
        sourceBadge.style.display = 'none';
    }

    // Calculate wins/losses/draws
    let wins = 0, losses = 0, draws = 0;
    data.games.forEach(game => {
        if (game.outcome === 'draw') {
            draws++;
        } else if (game.outcome === 'white-win' || game.outcome === 'black-win') {
            // For now, count all decisive games (Phase 3+ will determine user color)
            if (game.outcome === 'white-win') wins++;
            else losses++;
        }
    });

    // Display basic statistics
    statsSummary.innerHTML = `
        <div class="stat-card">
            <div class="stat-label">Total Games</div>
            <div class="stat-value">${data.stats.total}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Avg Game Length</div>
            <div class="stat-value">${Math.round(data.stats.avgPlyCount / 2)} moves</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Decisive Games</div>
            <div class="stat-value">${wins + losses}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Draws</div>
            <div class="stat-value">${draws}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Openings Found</div>
            <div class="stat-value">${Object.keys(data.stats.openings).length}</div>
        </div>
    `;

    // Calculate and render radar chart
    const metrics = calculateRadarMetrics(data);
    renderRadarChart('insightRadarChart', metrics);

    // Generate and display narrative
    const narrative = generateCaissaNarrative(data, metrics);
    const narrativeElement = document.getElementById('insightNarrative');
    if (narrativeElement) {
        narrativeElement.innerHTML = narrative;
    }

    console.log('✅ Results displayed');
}

// Setup Caissa Insight modal event listeners
function setupInsightModal() {
    const analyzeBtn = document.getElementById('insightAnalyzeBtn');
    const pgnInput = document.getElementById('insightPgnInput');
    const pgnFile = document.getElementById('insightPgnFile');
    const fileNameDisplay = document.getElementById('insightFileName');
    const refreshBtn = document.getElementById('insightRefreshBtn');
    const exportBtn = document.getElementById('insightExportBtn');

    // Import tab elements
    const importTabs = document.querySelectorAll('.import-tab');
    const importFetchBtn = document.getElementById('importFetchBtn');
    const importProvider = document.getElementById('importProvider');
    const importUsername = document.getElementById('importUsername');
    const importGameCount = document.getElementById('importGameCount');
    const importTimeControl = document.getElementById('importTimeControl');
    const importProgressSection = document.getElementById('importProgressSection');
    const importProgressBar = document.getElementById('importProgressBar');
    const importProgressText = document.getElementById('importProgressText');
    const importCorsMessage = document.getElementById('importCorsMessage');
    const corsProviderLink = document.getElementById('corsProviderLink');

    if (!analyzeBtn) {
        console.warn('⚠️ Insight modal elements not found');
        return;
    }

    // Setup import tab switching
    importTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;

            // Update active tab
            importTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Show corresponding panel
            const panels = {
                'online': document.getElementById('importOnlinePanel'),
                'local': document.getElementById('importLocalPanel')
            };

            Object.values(panels).forEach(panel => panel.classList.remove('active'));
            if (panels[tabName]) {
                panels[tabName].classList.add('active');
            }

            // Hide CORS message when switching tabs
            if (importCorsMessage) {
                importCorsMessage.style.display = 'none';
            }
        });
    });

    // Import fetch button handler
    if (importFetchBtn) {
        importFetchBtn.addEventListener('click', async () => {
            const provider = importProvider.value;
            const username = importUsername.value.trim();
            const count = parseInt(importGameCount.value);
            const timeControl = importTimeControl.value;

            if (!username) {
                showErrorNotification('Please enter a username');
                return;
            }

            console.log(`🎮 Fetching ${count} games from ${provider} for user: ${username}`);

            // Show progress
            importProgressSection.style.display = 'block';
            importCorsMessage.style.display = 'none';
            importProgressBar.style.width = '10%';
            importProgressText.textContent = `Connecting to ${provider}...`;
            importFetchBtn.disabled = true;

            try {
                let importedGames;

                // Fetch from provider
                if (provider === 'chess.com') {
                    importProgressText.textContent = 'Fetching from Chess.com...';
                    importProgressBar.style.width = '30%';
                    importedGames = await GameSourceService.fetchFromChessCom(username, count, { timeControl });
                } else if (provider === 'lichess') {
                    importProgressText.textContent = 'Fetching from Lichess...';
                    importProgressBar.style.width = '30%';
                    importedGames = await GameSourceService.fetchFromLichess(username, count, { timeControl });
                }

                if (!importedGames || importedGames.length === 0) {
                    throw new Error('No games found with the specified filters');
                }

                importProgressText.textContent = `Processing ${importedGames.length} games...`;
                importProgressBar.style.width = '60%';

                // Convert to PGN text
                const pgnText = importedGames.map(g => g.pgn).join('\n\n');

                // Parse and analyze
                importProgressText.textContent = 'Analyzing games...';
                importProgressBar.style.width = '80%';

                const parsedData = parseMultiGamePGN(pgnText);

                if (parsedData.stats.total === 0) {
                    throw new Error('Failed to parse imported games');
                }

                // Save to profile
                insightProfile = parsedData;
                saveInsightProfile(parsedData);

                // Store import metadata
                localStorage.setItem('lastGameImport', JSON.stringify({
                    provider,
                    username,
                    count: importedGames.length,
                    timeControl,
                    timestamp: new Date().toISOString()
                }));

                importProgressBar.style.width = '100%';
                importProgressText.textContent = 'Complete!';

                // Display results
                displayInsightResults(parsedData);

                // Hide progress after short delay
                setTimeout(() => {
                    importProgressSection.style.display = 'none';
                }, 1000);

                showNotification(`Successfully imported ${importedGames.length} games from ${provider}!`);

            } catch (error) {
                console.error('❌ Import error:', error);

                importProgressSection.style.display = 'none';

                if (error.message === 'CORS_BLOCKED') {
                    // Show CORS fallback message
                    const providerLinks = {
                        'chess.com': `<a href="https://www.chess.com/member/${username}" target="_blank">Chess.com</a>`,
                        'lichess': `<a href="https://lichess.org/@/${username}/export" target="_blank">Lichess Export Page</a>`
                    };

                    corsProviderLink.innerHTML = providerLinks[provider] || provider;
                    importCorsMessage.style.display = 'block';

                    showErrorNotification('Direct fetching blocked by CORS. Please use the fallback method shown below.');
                } else {
                    showErrorNotification(error.message || 'Failed to import games');
                }
            } finally {
                importFetchBtn.disabled = false;
            }
        });
    }

    // File upload handler
    pgnFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                pgnInput.value = event.target.result;
                fileNameDisplay.textContent = file.name;
                console.log('📁 PGN file loaded:', file.name);
            };
            reader.readAsText(file);
        }
    });

    // Analyze button handler
    analyzeBtn.addEventListener('click', () => {
        // --- Credit check for CAISSA Insight ---
        if (typeof CAISSA_ACCESS !== 'undefined') {
            if (!CAISSA_ACCESS.requireSignIn('insight')) return;
            if (!CAISSA_ACCESS.canUse('insight')) {
                CAISSA_ACCESS.showLockedMessage('insight');
                return;
            }
        }

        const pgnText = pgnInput.value.trim();
        if (!pgnText) {
            showErrorNotification('Please paste PGN content or load a file');
            return;
        }

        // Consume credits after validation but before analysis
        if (typeof CAISSA_ACCESS !== 'undefined') {
            if (!CAISSA_ACCESS.consumeCredits('insight')) {
                CAISSA_ACCESS.showLockedMessage('insight', 'credits');
                return;
            }
        }

        console.log('🧠 Analyzing PGN...');

        try {
            // Parse multi-game PGN
            const parsedData = parseMultiGamePGN(pgnText);

            if (parsedData.stats.total === 0) {
                showErrorNotification('No valid games found in PGN');
                return;
            }

            // Save to profile
            insightProfile = parsedData;
            saveInsightProfile(parsedData);

            // Display results
            displayInsightResults(parsedData);
            showNotification(`Analysis complete! Parsed ${parsedData.stats.total} games.`);

        } catch (error) {
            console.error('❌ Failed to parse PGN:', error);
            showErrorNotification('Failed to parse PGN. Please check the format.');
        }
    });

    // Refresh button handler
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            const pgnText = pgnInput.value.trim();
            if (!pgnText) {
                showErrorNotification('No PGN content to analyze');
                return;
            }

            console.log('🔄 Recalculating profile...');

            try {
                // Re-parse PGN
                const parsedData = parseMultiGamePGN(pgnText);

                if (parsedData.stats.total === 0) {
                    showErrorNotification('No valid games found in PGN');
                    return;
                }

                // Save updated profile
                insightProfile = parsedData;
                saveInsightProfile(parsedData);

                // Re-display results (this will recalculate metrics, radar, and narrative)
                displayInsightResults(parsedData);
                showNotification(`Profile refreshed! Analyzed ${parsedData.stats.total} games.`);

            } catch (error) {
                console.error('❌ Failed to refresh profile:', error);
                showErrorNotification('Failed to refresh. Please check the PGN format.');
            }
        });
    }

    // Clear session button handler
    const clearBtn = document.getElementById('insightClearBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            console.log('🗑️ Clear session button clicked');
            showModal('clearInsightModal');
        });
    }

    // Export button handler
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            if (!insightProfile) {
                showErrorNotification('No profile to export');
                return;
            }

            console.log('📥 Exporting profile...');

            try {
                // Create export data (exclude rawText to reduce size)
                const exportData = {
                    timestamp: new Date().toISOString(),
                    stats: insightProfile.stats,
                    gamesAnalyzed: insightProfile.stats.total,
                    metrics: calculateRadarMetrics(insightProfile),
                    openings: insightProfile.stats.openings
                };

                // Create JSON blob
                const json = JSON.stringify(exportData, null, 2);
                const blob = new Blob([json], { type: 'application/json' });

                // Create download link
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;

                // Generate filename with date
                const date = new Date().toISOString().split('T')[0];
                link.download = `caissa-insight-${date}.json`;

                // Trigger download
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);

                showNotification('Profile exported successfully!');

            } catch (error) {
                console.error('❌ Failed to export profile:', error);
                showErrorNotification('Failed to export profile.');
            }
        });
    }

    console.log('✅ Caissa Insight modal setup complete');
}

// ===== PERFORMANCE MONITORING =====
console.log('CAISSA Chess loaded successfully');

// ===== GAME IMPORT SERVICE =====

/**
 * GameSourceService - Unified service for importing games from multiple sources
 * Supports: Chess.com, Lichess, and local PGN
 */

// API URL for Lichess proxy (uses local server endpoint to bypass CORS)
// In production, this could point to a Cloudflare Worker
function getLichessProxyUrl() {
    // Use local server proxy for Lichess
    const baseUrl = window.location.origin;
    return `${baseUrl}/api/lichess/games`;
}

const GameSourceService = {
    /**
     * Fetch recent games from Chess.com
     * @param {string} username - Chess.com username
     * @param {number} count - Number of games to fetch (max 50)
     * @param {object} filters - {timeControl: 'bullet'|'blitz'|'rapid'|'classical'|'all'}
     * @returns {Promise<ImportedGame[]>}
     */
    async fetchFromChessCom(username, count = 20, filters = {}) {
        console.log(`🌐 Fetching ${count} games from Chess.com for user: ${username}`);

        try {
            // Fetch archives list
            const archivesUrl = `https://api.chess.com/pub/player/${username}/games/archives`;
            console.log('📡 Fetching archives:', archivesUrl);

            const archivesResponse = await fetch(archivesUrl);

            if (!archivesResponse.ok) {
                if (archivesResponse.status === 404) {
                    throw new Error(`User "${username}" not found on Chess.com`);
                }
                throw new Error(`Chess.com API error: ${archivesResponse.status}`);
            }

            const archivesData = await archivesResponse.json();

            if (!archivesData.archives || archivesData.archives.length === 0) {
                throw new Error(`No game archives found for user "${username}"`);
            }

            console.log(`📚 Found ${archivesData.archives.length} archive(s)`);

            // Fetch games from most recent archives
            const importedGames = [];
            const archives = archivesData.archives.reverse(); // Most recent first

            for (const archiveUrl of archives) {
                if (importedGames.length >= count) break;

                console.log('📥 Fetching archive:', archiveUrl);

                const gamesResponse = await fetch(archiveUrl);
                if (!gamesResponse.ok) continue;

                const gamesData = await gamesResponse.json();
                const games = gamesData.games || [];

                console.log(`  ✓ Got ${games.length} games from archive`);

                for (const game of games) {
                    if (importedGames.length >= count) break;

                    // Extract PGN
                    const pgn = game.pgn;
                    if (!pgn) continue;

                    // Infer time control from game
                    const timeControl = this._inferTimeControlChessCom(game);

                    // Apply filter
                    if (filters.timeControl && filters.timeControl !== 'all' && timeControl !== filters.timeControl) {
                        continue;
                    }

                    importedGames.push({
                        id: game.url || `chessdotcom-${game.end_time}`,
                        source: 'chess.com',
                        username: username,
                        playedAt: new Date(game.end_time * 1000).toISOString(),
                        timeControl: timeControl,
                        pgn: pgn
                    });
                }
            }

            console.log(`✅ Successfully imported ${importedGames.length} games from Chess.com`);
            return importedGames;

        } catch (error) {
            console.error('❌ Chess.com fetch error:', error);

            // Check for CORS error
            if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
                throw new Error('CORS_BLOCKED');
            }

            throw error;
        }
    },

    /**
     * Fetch recent games from Lichess (uses server proxy to bypass CORS)
     * @param {string} username - Lichess username
     * @param {number} count - Number of games to fetch (max 50)
     * @param {object} filters - {timeControl: 'bullet'|'blitz'|'rapid'|'classical'|'all'}
     * @returns {Promise<ImportedGame[]>}
     */
    async fetchFromLichess(username, count = 20, filters = {}) {
        console.log(`♔ Fetching ${count} games from Lichess for user: ${username}`);
        console.log('📡 Using server proxy to bypass CORS...');

        try {
            // Build proxy URL (server-side fetch to avoid CORS)
            const timeControl = filters.timeControl || 'all';
            const proxyUrl = `${getLichessProxyUrl()}?username=${encodeURIComponent(username)}&max=${count}&timeControl=${timeControl}`;

            console.log('📡 Fetching via proxy:', proxyUrl);

            const response = await fetch(proxyUrl);
            console.log('📥 Proxy response status:', response.status);

            // Try to parse response as JSON
            let data;
            try {
                data = await response.json();
            } catch (parseError) {
                console.error('❌ Failed to parse response as JSON:', parseError);
                throw new Error('Server returned invalid response. Please try again.');
            }

            if (!response.ok) {
                const errorMsg = data.error || `Server error: ${response.status}`;
                console.error('❌ Proxy error response:', data);
                throw new Error(errorMsg);
            }

            if (!data.success) {
                throw new Error(data.error || 'Failed to fetch games from Lichess');
            }

            // Convert proxy response to ImportedGame format
            const importedGames = [];
            const games = data.games || [];

            for (const game of games) {
                if (!game.pgn) continue;

                importedGames.push({
                    id: game.id || `lichess-${Date.now()}-${importedGames.length}`,
                    source: 'lichess',
                    username: username,
                    playedAt: game.playedAt || new Date().toISOString(),
                    timeControl: game.timeControl || 'unknown',
                    pgn: game.pgn
                });
            }

            console.log(`✅ Successfully imported ${importedGames.length} games from Lichess`);
            return importedGames;

        } catch (error) {
            console.error('❌ Lichess fetch error:', error);

            // Provide user-friendly error message
            if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
                throw new Error('Could not reach Lichess proxy server. Please check your connection and try again.');
            }

            throw error;
        }
    },

    /**
     * Parse local PGN into ImportedGame format
     * @param {string} pgnText - PGN text content
     * @returns {ImportedGame[]}
     */
    parseLocalPGN(pgnText) {
        console.log('📄 Parsing local PGN...');

        const importedGames = [];
        const gameSections = pgnText.split(/\n\s*\n(?=\[Event\s)/);

        for (const section of gameSections) {
            const trimmed = section.trim();
            if (!trimmed || !trimmed.startsWith('[Event')) continue;

            // Extract date if available
            let playedAt = new Date().toISOString();
            const dateMatch = trimmed.match(/\[Date\s+"([^"]+)"\]/);
            if (dateMatch) {
                try {
                    const dateStr = dateMatch[1].replace(/\./g, '-');
                    playedAt = new Date(dateStr).toISOString();
                } catch (e) {
                    // Keep default if parse fails
                }
            }

            // Infer time control if available
            let timeControl = 'unknown';
            const timeControlMatch = trimmed.match(/\[TimeControl\s+"([^"]+)"\]/);
            if (timeControlMatch) {
                timeControl = this._inferTimeControlFromHeader(timeControlMatch[1]);
            }

            importedGames.push({
                id: `local-${Date.now()}-${Math.random()}`,
                source: 'local',
                username: 'local',
                playedAt: playedAt,
                timeControl: timeControl,
                pgn: trimmed
            });
        }

        console.log(`✅ Parsed ${importedGames.length} games from local PGN`);
        return importedGames;
    },

    /**
     * Infer time control from Chess.com game object
     */
    _inferTimeControlChessCom(game) {
        const timeClass = game.time_class;
        if (timeClass) {
            return timeClass; // bullet, blitz, rapid, daily
        }

        const timeControl = game.time_control;
        if (typeof timeControl === 'string') {
            return this._inferTimeControlFromHeader(timeControl);
        }

        return 'unknown';
    },

    /**
     * Infer time control category from TimeControl header
     */
    _inferTimeControlFromHeader(timeControl) {
        if (!timeControl || timeControl === '-') return 'unknown';

        // Parse time control format: "baseTime+increment"
        const match = timeControl.match(/^(\d+)\+?(\d+)?$/);
        if (!match) return 'unknown';

        const baseTime = parseInt(match[1]);
        const increment = parseInt(match[2] || '0');

        // Total time in seconds
        const totalTime = baseTime + (40 * increment); // Assume 40 moves average

        if (totalTime < 180) return 'bullet';
        if (totalTime < 600) return 'blitz';
        if (totalTime < 1500) return 'rapid';
        return 'classical';
    }
};

// ===== COACH REPORT MODULE =====

// Configuration constants
const COACH_CONFIG = {
    SWING_THRESHOLD: 0.8,      // Eval swing to mark critical moment (pawns)
    BLUNDER_THRESHOLD: 1.2,    // Move loss threshold for blunder (pawns)
    ANALYSIS_DEPTH: 12,        // Engine depth for quick analysis
    MULTI_PV: 3,               // Number of lines to analyze
    OPENING_MOVES: 15,         // Moves considered "opening phase"
    ENDGAME_PIECES: 12         // Max pieces for endgame phase
};

// Error pattern tags
const ERROR_TAGS = {
    HANGING_PIECE: 'Hanging Piece',
    FORK: 'Fork',
    PIN: 'Pin',
    SKEWER: 'Skewer',
    BACK_RANK: 'Back Rank Weakness',
    KING_SAFETY: 'King Safety',
    BAD_TRADE: 'Bad Trade',
    QUEEN_ENDGAME: 'Queen Endgame',
    ROOK_ENDGAME: 'Rook Endgame',
    PAWN_ENDGAME: 'Pawn Endgame',
    TIME_TROUBLE: 'Time Trouble',
    TACTICAL_MISS: 'Missed Tactic',
    POSITIONAL_ERROR: 'Positional Error'
};

// ===== CLEAR INSIGHT SESSION HANDLERS =====

// Setup clear insight session modal handlers
function setupClearInsightHandlers() {
    const keepHistoryBtn = document.getElementById('clearKeepHistoryBtn');
    const deleteHistoryBtn = document.getElementById('clearDeleteHistoryBtn');
    const cancelBtn = document.getElementById('clearCancelBtn');

    if (keepHistoryBtn) {
        keepHistoryBtn.addEventListener('click', () => {
            clearInsightSession(false); // Keep history
            hideModal('clearInsightModal');
            hideModal('insightModal');
        });
    }

    if (deleteHistoryBtn) {
        deleteHistoryBtn.addEventListener('click', () => {
            clearInsightSession(true); // Delete history
            hideModal('clearInsightModal');
            hideModal('insightModal');
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            hideModal('clearInsightModal');
        });
    }
}

// Clear Insight session (and optionally delete history)
function clearInsightSession(deleteHistory = false) {
    console.log('🗑️ Clearing Insight session, deleteHistory:', deleteHistory);

    // Clear current session data
    insightProfile = null;

    if (deleteHistory) {
        // Delete all stored data
        console.log('🗑️ Deleting all Insight history...');
        localStorage.removeItem('caissa_insight_profile');
        localStorage.removeItem('caissa_coach_report');
        localStorage.removeItem('caissa_insight_sessions'); // Future: session history
        coachReportData = null;
        showNotification('All Insight data cleared successfully!');
    } else {
        // Keep history, just clear current session
        console.log('🗑️ Clearing current session only...');
        localStorage.removeItem('caissa_insight_profile');
        localStorage.removeItem('caissa_coach_report');
        coachReportData = null;
        showNotification('Current session cleared! Historical data preserved.');
    }

    // Reset UI to empty state
    resetInsightUI();
    updateInsightIndicator();
}

// Reset Insight UI to empty state
function resetInsightUI() {
    console.log('🔄 Resetting Insight UI...');

    // Hide results section
    const resultsSection = document.getElementById('insightResultsSection');
    if (resultsSection) {
        resultsSection.style.display = 'none';
    }

    // Clear input
    const pgnInput = document.getElementById('insightPgnInput');
    if (pgnInput) {
        pgnInput.value = '';
    }

    // Clear file name display
    const fileNameDisplay = document.getElementById('insightFileName');
    if (fileNameDisplay) {
        fileNameDisplay.textContent = '';
    }

    // Reset import progress
    const importProgressSection = document.getElementById('importProgressSection');
    if (importProgressSection) {
        importProgressSection.style.display = 'none';
    }

    // Clear any errors
    const insightError = document.getElementById('insightError');
    if (insightError) {
        insightError.style.display = 'none';
    }

    console.log('✅ Insight UI reset complete');
}

// Update the insight indicator visibility based on data presence
function updateInsightIndicator() {
    const indicator = document.getElementById('insightIndicator');
    if (!indicator) return;

    // Show indicator if there's saved insight data
    const hasInsightData = insightProfile !== null || localStorage.getItem('caissa_insight_profile') !== null;
    indicator.style.display = hasInsightData ? 'block' : 'none';

    console.log('🔔 Insight indicator:', hasInsightData ? 'shown' : 'hidden');
}

// Coach report state
let coachReportData = null;

// Setup coach report modal
function setupCoachModal() {
    const coachBtn = document.getElementById('insightCoachBtn');
    const generateBtn = document.getElementById('coachGenerateBtn');
    const backBtn = document.getElementById('coachBackBtn');
    const exportBtn = document.getElementById('coachExportBtn');

    if (!coachBtn) {
        console.warn('⚠️ Coach button not found');
        return;
    }

    // Open coach modal from insight
    coachBtn.addEventListener('click', () => {
        if (!insightProfile || !insightProfile.games || insightProfile.games.length === 0) {
            showErrorNotification('Please analyze games in Caissa Insight first');
            return;
        }

        hideModal('insightModal');
        showModal('coachModal');
        showCoachSection('config');
    });

    // Generate report
    generateBtn.addEventListener('click', async () => {
        const gameCount = parseInt(document.getElementById('coachGameCount').value);
        const colorFilter = document.getElementById('coachColorFilter').value;

        console.log(`🎓 Generating coach report for ${gameCount} games, color: ${colorFilter}`);

        try {
            showCoachSection('progress');
            await generateCoachReport(gameCount, colorFilter);
            showCoachSection('report');
        } catch (error) {
            console.error('❌ Coach report generation failed:', error);
            showErrorNotification('Failed to generate coach report: ' + error.message);
            showCoachSection('config');
        }
    });

    // Back to config
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            showCoachSection('config');
        });
    }

    // Export report
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            if (!coachReportData) {
                showErrorNotification('No report to export');
                return;
            }

            const date = new Date().toISOString().split('T')[0];
            const json = JSON.stringify(coachReportData, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `coach-report-${date}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            showNotification('Coach report exported successfully!');
        });
    }

    console.log('✅ Coach modal setup complete');
}

// Show specific coach section
function showCoachSection(section) {
    const sections = {
        config: document.getElementById('coachConfigSection'),
        progress: document.getElementById('coachProgressSection'),
        report: document.getElementById('coachReportSection')
    };

    // Hide all sections
    Object.values(sections).forEach(el => {
        if (el) el.style.display = 'none';
    });

    // Show selected section
    if (sections[section]) {
        sections[section].style.display = 'block';
    }
}

// Update progress bar
function updateCoachProgress(percent, text) {
    const progressBar = document.getElementById('coachProgressBar');
    const progressText = document.getElementById('coachProgressText');

    if (progressBar) {
        progressBar.style.width = percent + '%';
    }

    if (progressText) {
        progressText.textContent = text;
    }
}

// Generate coach report
async function generateCoachReport(gameCount, colorFilter) {
    if (!insightProfile || !insightProfile.games) {
        throw new Error('No games available for analysis');
    }

    updateCoachProgress(5, 'Preparing games for analysis...');

    // Filter games
    let games = insightProfile.games.slice(0, gameCount);

    // Apply color filter if needed
    if (colorFilter !== 'both') {
        games = games.filter(game => {
            // Determine user's color based on game headers
            // This is a simplified filter - in production, you'd track user's actual color
            return true; // For MVP, analyze all games
        });
    }

    console.log(`📊 Analyzing ${games.length} games...`);

    updateCoachProgress(10, `Analyzing game 1 of ${games.length}...`);

    // Analyze each game for critical moments
    const allMoments = [];
    for (let i = 0; i < games.length; i++) {
        const game = games[i];
        const progress = 10 + (i / games.length) * 60;
        updateCoachProgress(progress, `Analyzing game ${i + 1} of ${games.length}...`);

        const moments = await analyzeGameForMoments(game, i);
        allMoments.push(...moments);

        // Small delay to avoid freezing UI
        await new Promise(resolve => setTimeout(resolve, 10));
    }

    updateCoachProgress(75, 'Aggregating patterns...');

    // Aggregate data
    const aggregate = aggregateCoachData(games, allMoments);

    updateCoachProgress(85, 'Generating training plan...');

    // Generate training plan
    const plan = generateTrainingPlan(aggregate);

    updateCoachProgress(95, 'Finalizing report...');

    // Build report
    coachReportData = {
        config: { gameCount, colorFilter },
        gamesAnalyzed: games.length,
        moments: allMoments,
        aggregate,
        plan,
        timestamp: new Date().toISOString()
    };

    // Display report
    displayCoachReport(coachReportData);

    updateCoachProgress(100, 'Report complete!');

    console.log('✅ Coach report generated:', coachReportData);
}

// Analyze single game for critical moments using Stockfish engine
async function analyzeGameForMoments(game, gameIndex) {
    const moments = [];

    // Use existing chess.js instance
    const chess = new Chess();

    try {
        chess.load_pgn(game.headers.pgn || '');
    } catch (e) {
        console.warn(`⚠️ Failed to load game ${gameIndex}:`, e);
        return moments;
    }

    const history = chess.history({ verbose: true });

    // Reset to start position for incremental analysis
    chess.reset();

    let prevEval = 0; // Evaluation in pawns (White's perspective)
    let prevBestMove = null;

    // Ensure engine is ready
    if (!App.engine || !App.engine.isReady()) {
        console.warn(`⚠️ Engine not ready for game ${gameIndex}, using fallback`);
        return await analyzeGameForMomentsFallback(game, gameIndex);
    }

    // Set engine to use MultiPV=3 for critical moment detection
    App.engine.setMultiPV(COACH_CONFIG.MULTI_PV);

    // Analyze each position incrementally
    for (let ply = 0; ply < history.length; ply++) {
        const move = history[ply];
        const fenBefore = chess.fen();

        // Get engine evaluation BEFORE the move
        const evalInfo = await getEngineEvaluation(fenBefore, COACH_CONFIG.ANALYSIS_DEPTH);

        if (!evalInfo) {
            // Engine failed, skip this position
            chess.move(move.san);
            continue;
        }

        const evalBefore = evalInfo.score !== null ? evalInfo.score : 0;
        const bestMove = evalInfo.bestMove || null;

        // Make the move
        chess.move(move.san);
        const fenAfter = chess.fen();

        // Get engine evaluation AFTER the move
        const evalAfterInfo = await getEngineEvaluation(fenAfter, COACH_CONFIG.ANALYSIS_DEPTH);
        const evalAfter = evalAfterInfo && evalAfterInfo.score !== null ? evalAfterInfo.score : evalBefore;

        // Calculate evaluation swing (from perspective of side that just moved)
        const playerColor = move.color; // 'w' or 'b'
        const evalSwing = Math.abs(evalAfter - evalBefore);

        // Calculate move loss (how much worse than best move)
        let moveLoss = 0;
        if (bestMove) {
            // If player didn't play the best move, calculate loss
            const playedMove = move.from + move.to + (move.promotion || '');
            if (playedMove !== bestMove) {
                moveLoss = Math.abs(evalAfter - evalBefore);
            }
        }

        // Detect critical moments based on thresholds
        const isCritical = (
            evalSwing >= COACH_CONFIG.SWING_THRESHOLD ||
            moveLoss >= COACH_CONFIG.BLUNDER_THRESHOLD
        );

        if (isCritical) {
            // Classify the error and assign tags
            const tags = classifyError(fenBefore, fenAfter, move, evalBefore, evalAfter, bestMove);

            const moment = {
                gameId: gameIndex,
                ply,
                moveSAN: move.san,
                playedMove: move.from + move.to + (move.promotion || ''),
                fen: fenBefore,
                fenAfter: fenAfter,
                evalBefore: evalBefore,
                evalAfter: evalAfter,
                evalSwing: evalSwing,
                moveLoss: moveLoss,
                bestMove: bestMove,
                tags: tags,
                phase: getGamePhase(ply, countPieces(fenBefore)),
                playerColor: playerColor
            };

            moments.push(moment);
        }

        // Update previous evaluation
        prevEval = evalAfter;
        prevBestMove = bestMove;
    }

    // Restore MultiPV to default
    App.engine.setMultiPV(1);

    return moments;
}

// Get engine evaluation for a position (returns { score, bestMove, mate, pv })
async function getEngineEvaluation(fen, depth) {
    return new Promise((resolve, reject) => {
        let evalResult = null;
        let timeout = null;

        // Set up info callback to capture evaluation
        const infoCallback = (info) => {
            if (info.depth >= depth) {
                evalResult = {
                    score: info.score,
                    mate: info.mate,
                    bestMove: info.pv && info.pv.length > 0 ? info.pv[0] : null,
                    pv: info.pv || [],
                    depth: info.depth
                };
            }
        };

        // Set up bestmove callback to finish analysis
        const bestMoveCallback = (move) => {
            clearTimeout(timeout);
            App.engine.onBestMove = null;
            App.engine.onInfo = null;

            if (!evalResult) {
                evalResult = { score: 0, mate: null, bestMove: move, pv: [move], depth: 0 };
            } else if (!evalResult.bestMove) {
                evalResult.bestMove = move;
            }

            resolve(evalResult);
        };

        // Set callbacks
        App.engine.onInfo = infoCallback;
        App.engine.onBestMove = bestMoveCallback;

        // Start analysis
        App.engine.currentFen = fen; // For score normalization
        App.engine.setPosition(fen);
        App.engine.go({ depth: depth });

        // Timeout after 5 seconds per position
        timeout = setTimeout(() => {
            App.engine.stop();
            App.engine.onBestMove = null;
            App.engine.onInfo = null;
            resolve(evalResult || { score: 0, mate: null, bestMove: null, pv: [], depth: 0 });
        }, 5000);
    });
}

// Fallback analysis when engine is not available
async function analyzeGameForMomentsFallback(game, gameIndex) {
    const moments = [];
    const chess = new Chess();

    try {
        chess.load_pgn(game.headers.pgn || '');
    } catch (e) {
        return moments;
    }

    const moves = chess.history({ verbose: true });

    // Use simplified material-based detection
    for (let ply = 0; ply < moves.length; ply++) {
        const move = moves[ply];

        if (move.captured) {
            const capturedValue = getPieceValue(move.captured);
            const movedValue = getPieceValue(move.piece);

            if (capturedValue < movedValue - 2) {
                moments.push({
                    gameId: gameIndex,
                    ply,
                    moveSAN: move.san,
                    fen: move.before,
                    evalBefore: 0,
                    evalAfter: -(movedValue - capturedValue),
                    tags: [ERROR_TAGS.BAD_TRADE],
                    phase: getGamePhase(ply, countPieces(move.before))
                });
            }
        }
    }

    return moments;
}

// Classify error type based on position analysis and evaluation change
function classifyError(fenBefore, fenAfter, move, evalBefore, evalAfter, bestMove) {
    const tags = [];
    const chess = new Chess(fenBefore);

    // Material change detection
    const materialDrop = hasMaterialDrop(fenBefore, fenAfter);
    if (materialDrop) {
        // Check if piece was captured without compensation
        if (move.captured && !move.promotion) {
            const capturedValue = getPieceValue(move.captured);
            const movedValue = getPieceValue(move.piece);

            if (capturedValue < movedValue - 1) {
                tags.push(ERROR_TAGS.BAD_TRADE);
            }
        } else if (!move.captured) {
            // Piece hung without capture
            tags.push(ERROR_TAGS.HANGING_PIECE);
        }
    }

    // Back rank weakness detection
    if (isBackRankPattern(fenAfter, move.color)) {
        tags.push(ERROR_TAGS.BACK_RANK);
    }

    // King safety issues
    if (isKingSafetyIssue(fenBefore, fenAfter, move)) {
        tags.push(ERROR_TAGS.KING_SAFETY);
    }

    // Tactical pattern detection (fork, pin, skewer)
    const tacticalPattern = detectTacticalPattern(fenAfter, move);
    if (tacticalPattern) {
        tags.push(tacticalPattern);
    }

    // Endgame error classification
    const phase = getGamePhase(chess.history().length, countPieces(fenAfter));
    if (phase === 'endgame') {
        const endgameTag = classifyEndgameError(fenAfter, move);
        if (endgameTag) {
            tags.push(endgameTag);
        }
    }

    // If no specific pattern detected but eval dropped significantly, mark as tactical miss
    if (tags.length === 0 && Math.abs(evalAfter - evalBefore) >= COACH_CONFIG.BLUNDER_THRESHOLD) {
        tags.push(ERROR_TAGS.TACTICAL_MISS);
    }

    // If still no tags, default to positional error for smaller mistakes
    if (tags.length === 0) {
        tags.push(ERROR_TAGS.POSITIONAL_ERROR);
    }

    return tags;
}

// Detect if material was lost
function hasMaterialDrop(fenBefore, fenAfter) {
    const materialBefore = calculateMaterial(fenBefore);
    const materialAfter = calculateMaterial(fenAfter);

    // Material imbalance suggests piece was lost
    return Math.abs(materialBefore.white - materialBefore.black) !==
           Math.abs(materialAfter.white - materialAfter.black);
}

// Calculate material balance from FEN
function calculateMaterial(fen) {
    const board = fen.split(' ')[0];
    const material = { white: 0, black: 0 };

    for (const char of board) {
        if (/[PNBRQ]/.test(char)) {
            material.white += getPieceValue(char);
        } else if (/[pnbrq]/.test(char)) {
            material.black += getPieceValue(char);
        }
    }

    return material;
}

// Detect back rank weakness pattern
function isBackRankPattern(fen, playerColor) {
    const chess = new Chess(fen);
    const rank = playerColor === 'w' ? '1' : '8';

    // Check if king is on back rank and boxed in by own pieces/pawns
    const kingSquare = findKingSquare(fen, playerColor);
    if (!kingSquare || !kingSquare.includes(rank)) {
        return false;
    }

    // Check if opponent has rook or queen on same rank/file
    const opponentPieces = playerColor === 'w' ? ['r', 'q'] : ['R', 'Q'];
    const board = fen.split(' ')[0];

    return opponentPieces.some(piece => board.includes(piece));
}

// Find king square in FEN
function findKingSquare(fen, color) {
    const board = fen.split(' ')[0];
    const king = color === 'w' ? 'K' : 'k';
    const rows = board.split('/');

    for (let rank = 0; rank < 8; rank++) {
        let file = 0;
        for (const char of rows[rank]) {
            if (char === king) {
                return String.fromCharCode(97 + file) + (8 - rank);
            } else if (/\d/.test(char)) {
                file += parseInt(char);
            } else {
                file++;
            }
        }
    }

    return null;
}

// Detect king safety issues
function isKingSafetyIssue(fenBefore, fenAfter, move) {
    // Check if king moved or castling rights changed
    if (move.piece === 'k') {
        return true;
    }

    // Check if pawn shield was weakened
    const chess = new Chess(fenAfter);
    const kingSquare = findKingSquare(fenAfter, move.color);

    if (!kingSquare) return false;

    // Simplified: check if move exposed king to checks
    return chess.in_check();
}

// Detect tactical patterns (fork, pin, skewer)
function detectTacticalPattern(fen, move) {
    const chess = new Chess(fen);

    // Check for knight forks (knight attacking multiple pieces)
    if (move.piece === 'n') {
        const attacks = getAttackedSquares(fen, move.to, move.color);
        if (attacks.length >= 2) {
            return ERROR_TAGS.FORK;
        }
    }

    // Check for pins and skewers (simplified heuristic)
    if (move.piece === 'b' || move.piece === 'r' || move.piece === 'q') {
        const opponentColor = move.color === 'w' ? 'b' : 'w';
        const kingSquare = findKingSquare(fen, opponentColor);

        if (kingSquare && isOnSameLine(move.to, kingSquare)) {
            return ERROR_TAGS.PIN;
        }
    }

    return null;
}

// Check if two squares are on same rank/file/diagonal
function isOnSameLine(sq1, sq2) {
    const file1 = sq1.charCodeAt(0);
    const rank1 = parseInt(sq1[1]);
    const file2 = sq2.charCodeAt(0);
    const rank2 = parseInt(sq2[1]);

    return file1 === file2 || rank1 === rank2 ||
           Math.abs(file1 - file2) === Math.abs(rank1 - rank2);
}

// Get squares attacked by a piece (simplified)
function getAttackedSquares(fen, square, color) {
    const chess = new Chess(fen);
    const moves = chess.moves({ square: square, verbose: true });

    return moves
        .filter(m => m.captured)
        .map(m => m.to);
}

// Classify endgame error types
function classifyEndgameError(fen, move) {
    const board = fen.split(' ')[0];

    // Count remaining pieces
    const hasQueens = /[Qq]/.test(board);
    const hasRooks = /[Rr]/.test(board);
    const hasBishops = /[Bb]/.test(board);
    const hasKnights = /[Nn]/.test(board);

    if (hasQueens) {
        return ERROR_TAGS.QUEEN_ENDGAME;
    } else if (hasRooks) {
        return ERROR_TAGS.ROOK_ENDGAME;
    } else if (!hasBishops && !hasKnights && !hasQueens && !hasRooks) {
        return ERROR_TAGS.PAWN_ENDGAME;
    }

    return null;
}

// Get piece value for material calculation
function getPieceValue(piece) {
    const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    return values[piece.toLowerCase()] || 0;
}

// Count total pieces on board
function countPieces(fen) {
    const board = fen.split(' ')[0];
    let count = 0;
    for (const char of board) {
        if (/[pnbrqkPNBRQK]/.test(char)) count++;
    }
    return count;
}

// Determine game phase
function getGamePhase(ply, pieceCount) {
    if (ply < COACH_CONFIG.OPENING_MOVES) return 'opening';
    if (pieceCount <= COACH_CONFIG.ENDGAME_PIECES) return 'endgame';
    return 'middlegame';
}

// Aggregate coach data
function aggregateCoachData(games, moments) {
    const wld = { wins: 0, losses: 0, draws: 0 };
    const tagStats = {};
    const phaseStats = { opening: 0, middlegame: 0, endgame: 0 };

    // Aggregate W/L/D
    games.forEach(game => {
        if (game.outcome === 'white-win' || game.outcome === 'black-win') {
            wld.wins++;
        } else if (game.outcome === 'draw') {
            wld.draws++;
        } else {
            wld.losses++;
        }
    });

    // Aggregate tag frequencies
    moments.forEach(moment => {
        moment.tags.forEach(tag => {
            if (!tagStats[tag]) {
                tagStats[tag] = { count: 0, totalImpact: 0 };
            }
            tagStats[tag].count++;
            tagStats[tag].totalImpact += Math.abs(moment.evalAfter - moment.evalBefore);
        });

        // Phase stats
        phaseStats[moment.phase]++;
    });

    // Calculate average impact
    Object.keys(tagStats).forEach(tag => {
        tagStats[tag].avgImpact = tagStats[tag].totalImpact / tagStats[tag].count;
    });

    // Sort tags by frequency
    const topPatterns = Object.entries(tagStats)
        .map(([tag, stats]) => ({ tag, ...stats }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    return {
        wld,
        gamesCount: games.length,
        totalMoments: moments.length,
        topPatterns,
        phaseStats,
        avgMomentsPerGame: moments.length / games.length
    };
}

// Generate training plan
function generateTrainingPlan(aggregate) {
    const plan = [];
    const topPatterns = aggregate.topPatterns;

    // Day 1-2: Focus on top weakness
    if (topPatterns.length > 0) {
        const top = topPatterns[0];
        plan.push({
            day: 1,
            title: `${top.tag} Drills`,
            description: `Focus on recognizing and avoiding ${top.tag.toLowerCase()} situations. Practice 15-20 tactical puzzles specifically targeting this weakness.`
        });
        plan.push({
            day: 2,
            title: `${top.tag} Review`,
            description: `Review your own games where you made this error. Analyze what triggered the mistake and how to prevent it.`
        });
    }

    // Day 3: Second weakness
    if (topPatterns.length > 1) {
        const second = topPatterns[1];
        plan.push({
            day: 3,
            title: `${second.tag} Training`,
            description: `Work on ${second.tag.toLowerCase()} patterns. Study master games showing correct technique in similar positions.`
        });
    }

    // Day 4: Phase-specific training
    const weakestPhase = Object.entries(aggregate.phaseStats)
        .sort((a, b) => b[1] - a[1])[0];
    plan.push({
        day: 4,
        title: `${weakestPhase[0].charAt(0).toUpperCase() + weakestPhase[0].slice(1)} Focus`,
        description: `Your ${weakestPhase[0]} phase needs attention. Study classic games and patterns specific to this phase.`
    });

    // Day 5: Mixed tactics
    plan.push({
        day: 5,
        title: 'Mixed Tactics Test',
        description: 'Test your progress with mixed tactical puzzles combining all your weakness areas. Aim for 80%+ accuracy.'
    });

    // Day 6: Game review
    plan.push({
        day: 6,
        title: 'Deep Game Review',
        description: 'Analyze 2-3 of your recent games in detail, focusing on the critical moments where you made errors.'
    });

    // Day 7: Assessment
    plan.push({
        day: 7,
        title: 'Progress Check',
        description: 'Play 3-5 practice games and review them for the same patterns. Track improvement in your error rate.'
    });

    return plan;
}

// Display coach report
function displayCoachReport(data) {
    // Summary stats
    const summaryHtml = `
        <div class="stat-card">
            <div class="stat-label">Games Analyzed</div>
            <div class="stat-value">${data.gamesAnalyzed}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Critical Moments</div>
            <div class="stat-value">${data.aggregate.totalMoments}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Win Rate</div>
            <div class="stat-value">${Math.round((data.aggregate.wld.wins / data.gamesAnalyzed) * 100)}%</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Avg Errors/Game</div>
            <div class="stat-value">${data.aggregate.avgMomentsPerGame.toFixed(1)}</div>
        </div>
    `;
    document.getElementById('coachSummaryStats').innerHTML = summaryHtml;

    // What's working
    const workingHtml = generateWorkingContent(data.aggregate);
    document.getElementById('coachWorkingContent').innerHTML = workingHtml;

    // What's not working
    const notWorkingHtml = generateNotWorkingContent(data.aggregate);
    document.getElementById('coachNotWorkingContent').innerHTML = notWorkingHtml;

    // Patterns
    const patternsHtml = generatePatternsContent(data.aggregate.topPatterns);
    document.getElementById('coachPatternsContent').innerHTML = patternsHtml;

    // Habits
    const habitsHtml = generateHabitsContent(data.aggregate.topPatterns);
    document.getElementById('coachHabitsContent').innerHTML = habitsHtml;

    // Training plan
    const planHtml = generateTrainingPlanHTML(data.plan);
    document.getElementById('coachPlanContent').innerHTML = planHtml;
}

// Generate "What's Working" content
function generateWorkingContent(aggregate) {
    const winRate = (aggregate.wld.wins / aggregate.gamesCount) * 100;
    let html = '<ul>';

    if (winRate > 50) {
        html += `<li><strong>Positive Win Rate:</strong> You're winning more than you're losing (${winRate.toFixed(0)}%), showing overall solid play.</li>`;
    }

    if (aggregate.avgMomentsPerGame < 3) {
        html += `<li><strong>Low Error Rate:</strong> Averaging ${aggregate.avgMomentsPerGame.toFixed(1)} critical errors per game shows good fundamental accuracy.</li>`;
    }

    const bestPhase = Object.entries(aggregate.phaseStats)
        .sort((a, b) => a[1] - b[1])[0];
    html += `<li><strong>${bestPhase[0].charAt(0).toUpperCase() + bestPhase[0].slice(1)} Stability:</strong> Your ${bestPhase[0]} play shows fewer errors compared to other phases.</li>`;

    html += '</ul>';
    return html;
}

// Generate "What's Not Working" content
function generateNotWorkingContent(aggregate) {
    let html = '<ul>';

    if (aggregate.topPatterns.length > 0) {
        aggregate.topPatterns.slice(0, 3).forEach(pattern => {
            html += `<li><strong>${pattern.tag}:</strong> Occurring ${pattern.count} times across your games with average impact of ${pattern.avgImpact.toFixed(1)} pawns.</li>`;
        });
    }

    const worstPhase = Object.entries(aggregate.phaseStats)
        .sort((a, b) => b[1] - a[1])[0];
    html += `<li><strong>${worstPhase[0].charAt(0).toUpperCase() + worstPhase[0].slice(1)} Struggles:</strong> Most errors occur in the ${worstPhase[0]} phase.</li>`;

    html += '</ul>';
    return html;
}

// Generate patterns content
function generatePatternsContent(patterns) {
    if (patterns.length === 0) {
        return '<p>No recurring patterns detected. Great job!</p>';
    }

    return patterns.map(pattern => `
        <div class="pattern-card">
            <div class="pattern-header">
                <span class="pattern-name">${pattern.tag}</span>
                <span class="pattern-badge">${pattern.count}x</span>
            </div>
            <div class="pattern-stats">
                Frequency: ${pattern.count} occurrences
            </div>
            <div class="pattern-impact">
                Average Impact: <strong>-${pattern.avgImpact.toFixed(1)} pawns</strong>
            </div>
        </div>
    `).join('');
}

// Generate habits content
function generateHabitsContent(patterns) {
    let html = '<ul>';

    if (patterns.length > 0) {
        const top = patterns[0];
        if (top.tag === ERROR_TAGS.HANGING_PIECE) {
            html += '<li><strong>Before every move:</strong> Scan all your pieces. Count attackers and defenders. Never leave pieces undefended.</li>';
        } else if (top.tag === ERROR_TAGS.BAD_TRADE) {
            html += '<li><strong>Before capturing:</strong> Always calculate material value. Don\'t trade a more valuable piece for a less valuable one without compensation.</li>';
        } else {
            html += '<li><strong>After every opponent move:</strong> Check for tactical threats before making your next move. Take time to understand what changed.</li>';
        }
    }

    html += '<li><strong>Time management:</strong> Don\'t rush in critical positions. Use your thinking time wisely, especially in complex tactical situations.</li>';
    html += '<li><strong>Pattern recognition:</strong> Study one tactical theme per week and actively look for it in your games.</li>';

    html += '</ul>';
    return html;
}

// Generate training plan HTML
function generateTrainingPlanHTML(plan) {
    return plan.map(day => `
        <div class="training-day">
            <div class="training-day-number">Day ${day.day}</div>
            <div class="training-day-content">
                <div class="training-day-title">${day.title}</div>
                <div class="training-day-description">${day.description}</div>
            </div>
        </div>
    `).join('');
}

// ===== CHEATER INSIGHT (Chess.com) =====

let cheaterInsightResults = null;

function initializeCheaterInsight() {
    // Set default month to current month
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    document.getElementById('cheaterMonth').value = `${year}-${month}`;

    // Reset UI
    document.getElementById('cheaterProgressSection').style.display = 'none';
    document.getElementById('cheaterResultsSection').style.display = 'none';
    document.getElementById('cheaterError').style.display = 'none';
}

document.getElementById('cheaterSearchBtn').addEventListener('click', async () => {
    const username = document.getElementById('cheaterUsername').value.trim();
    const monthInput = document.getElementById('cheaterMonth').value;
    const timeControl = document.getElementById('cheaterTimeControl').value;

    // Validate inputs
    if (!username) {
        showCheaterError('Please enter a Chess.com username');
        return;
    }

    if (!monthInput) {
        showCheaterError('Please select a month');
        return;
    }

    // Parse month input (YYYY-MM)
    const [year, month] = monthInput.split('-').map(Number);

    // Reset UI
    document.getElementById('cheaterProgressSection').style.display = 'block';
    document.getElementById('cheaterResultsSection').style.display = 'none';
    document.getElementById('cheaterError').style.display = 'none';

    try {
        // Run analysis
        cheaterInsightResults = await CheaterAnalyzer.analyze({
            username,
            year,
            month,
            timeControl,
            onProgress: updateCheaterProgress
        });

        // Hide progress, show results
        document.getElementById('cheaterProgressSection').style.display = 'none';
        document.getElementById('cheaterResultsSection').style.display = 'block';

        // Render results
        renderCheaterResults(cheaterInsightResults);

    } catch (error) {
        console.error('❌ Cheater Insight error:', error);
        document.getElementById('cheaterProgressSection').style.display = 'none';
        showCheaterError(error.message);
    }
});

function updateCheaterProgress(progress) {
    const progressBar = document.getElementById('cheaterProgressBar');
    const progressText = document.getElementById('cheaterProgressText');

    if (progress.progress) {
        progressBar.style.width = `${progress.progress}%`;
    }

    if (progress.message) {
        progressText.textContent = progress.message;
    }
}

function renderCheaterResults(results) {
    // Render summary stats
    const summaryHTML = `
        <div class="stat-card">
            <div class="stat-label">Games Scanned</div>
            <div class="stat-value">${results.totalGames}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Unique Opponents</div>
            <div class="stat-value">${results.totalOpponents}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Closed: Fair Play</div>
            <div class="stat-value ${results.flaggedOpponents > 0 ? 'stat-danger' : ''}">${results.flaggedOpponents}</div>
        </div>
    `;
    document.getElementById('cheaterSummaryStats').innerHTML = summaryHTML;

    // Render flagged opponents list
    const listHTML = results.flaggedGames.length > 0
        ? results.flaggedGames.map((game, index) => `
            <div class="cheater-opponent-card">
                <div class="opponent-header">
                    <h4>
                        ${index + 1}.
                        <a href="${game.opponentUrl}" target="_blank" rel="noopener">
                            ${game.opponent}
                        </a>
                    </h4>
                    <span class="opponent-status-badge">${game.opponentStatus}</span>
                </div>
                <div class="opponent-details">
                    <div class="detail-item">
                        <i class="fas fa-trophy"></i>
                        <strong>Your Result:</strong>
                        <span class="result-${game.yourResult.toLowerCase()}">${game.yourResult}</span>
                    </div>
                    <div class="detail-item">
                        <i class="fas fa-calendar"></i>
                        <strong>Date:</strong> ${game.date}
                    </div>
                    <div class="detail-item">
                        <i class="fas fa-clock"></i>
                        <strong>Time Control:</strong> ${game.timeControl}
                    </div>
                    <div class="detail-item">
                        <i class="fas fa-link"></i>
                        <strong>Game:</strong>
                        <a href="${game.gameUrl}" target="_blank" rel="noopener">View on Chess.com</a>
                    </div>
                </div>
            </div>
        `).join('')
        : '<div class="cheater-no-results"><i class="fas fa-check-circle"></i> No opponents with fair play closures found in this period.</div>';

    document.getElementById('cheaterOpponentsList').innerHTML = listHTML;
}

function showCheaterError(message) {
    const errorDiv = document.getElementById('cheaterError');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

// Export JSON
document.getElementById('cheaterExportJsonBtn').addEventListener('click', () => {
    if (!cheaterInsightResults) return;

    const json = CheaterAnalyzer.exportAsJSON(cheaterInsightResults);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cheater-insight-${cheaterInsightResults.username}-${cheaterInsightResults.year}-${cheaterInsightResults.month}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showNotification('Results exported as JSON');
});

// Copy list
document.getElementById('cheaterCopyListBtn').addEventListener('click', () => {
    if (!cheaterInsightResults) return;

    const text = CheaterAnalyzer.exportAsText(cheaterInsightResults);

    navigator.clipboard.writeText(text).then(() => {
        showNotification('Results copied to clipboard');
    }).catch(err => {
        console.error('Failed to copy:', err);
        showErrorNotification('Failed to copy to clipboard');
    });
});

// Export for debugging
window.App = App;
