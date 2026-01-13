/**
 * TVLavin Chess Application
 * Main application logic and game management
 */

// ===== APPLICATION STATE =====
const App = {
    // Game state
    game: new Chess(),
    board: null,
    engine: null,

    // Settings
    playerColor: 'white',
    gameMode: 'engine', // 'engine' or 'analysis'
    timeControl: 0, // seconds, 0 = no limit

    // Game state
    isPlayerTurn: true,
    gameActive: false,
    analyzing: false,
    editMode: false,
    selectedEditorPiece: 'erase', // Piece to place in editor mode
    editorMoveSource: null, // Source square for move/adjust tool

    // Engine vs Engine
    eveMode: false,
    evePaused: false,
    eveRunning: false,
    engineWhite: null,
    engineBlack: null,
    eveMoveCount: 0,
    eveMoveDelay: 1000,

    // MultiPV analysis
    multiPvEnabled: false,
    pvLines: {}, // Store up to 3 PV lines { 1: info, 2: info, 3: info }

    // History navigation
    moveHistory: [],
    currentMoveIndex: -1,

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

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    debugLog('Initializing TVLavin Chess...');

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

    // Setup event listeners
    setupEventListeners();

    // Update UI
    updateUI();

    // Load PGN library
    loadPGNLibrary();

    debugLog('Application initialized');
});

// ===== CACHE DOM ELEMENTS =====
function cacheElements() {
    App.elements = {
        // Buttons
        newGameBtn: document.getElementById('newGameBtn'),
        menuBtn: document.getElementById('menuBtn'),
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
        editBoardBtn: document.getElementById('editBoardBtn'),
        editorPanel: document.getElementById('editorPanel'),
        exitEditor: document.getElementById('exitEditor'),
        clearBoard: document.getElementById('clearBoard'),
        resetToStart: document.getElementById('resetToStart'),
        applyPosition: document.getElementById('applyPosition'),

        // Engine vs Engine
        engineVsEngineBtn: document.getElementById('engineVsEngineBtn'),
        evePanel: document.getElementById('evePanel'),
        eveMoveDelay: document.getElementById('eveMoveDelay'),
        eveStatus: document.getElementById('eveStatus'),
        eveStatusText: document.getElementById('eveStatusText'),
        eveMoveCount: document.getElementById('eveMoveCount'),
        startEve: document.getElementById('startEve'),
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
        if (App.analyzing) {
            updateAnalysis(info);
        } else {
            console.log('⚠️ Received info but App.analyzing is false - ignoring');
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
        return;
    }

    // Try to make the move
    const result = App.game.move({
        from: source,
        to: target
    });

    // Illegal move
    if (result === null) return 'snapback';

    onMoveMade(result);
}

function onSnapEnd() {
    App.board.position(App.game.fen());
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
    
    // Check game status
    if (App.game.game_over()) {
        handleGameOver();
        return;
    }
    
    // In engine mode, make engine move
    if (App.gameMode === 'engine') {
        App.isPlayerTurn = false;
        updateStatus();
        
        // Delay engine move slightly for better UX
        setTimeout(() => {
            makeEngineMove();
        }, 250);
    }
    
    // If analysis is on, update it
    if (App.analyzing) {
        startAnalysis();
    }
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

    // Full power - use optimal thinking time
    const moveTime = 2000; // 2 seconds for full strength

    console.log(`🎯 Engine at FULL POWER using movetime: ${moveTime}ms`);

    App.engine.getBestMove(currentFen, (bestMove) => {
        console.log('[BESTMOVE EVENT]', bestMove);
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
    
    if (App.game.in_checkmate()) {
        const winner = App.game.turn() === 'w' ? 'Black' : 'White';
        App.elements.turnIndicator.textContent = `Checkmate! ${winner} wins!`;
        App.elements.turnIndicator.style.color = '#f44336';
    } else if (App.game.in_draw()) {
        App.elements.turnIndicator.textContent = 'Game drawn';
        App.elements.turnIndicator.style.color = '#ff9800';
    } else if (App.game.in_stalemate()) {
        App.elements.turnIndicator.textContent = 'Stalemate!';
        App.elements.turnIndicator.style.color = '#ff9800';
    } else if (App.game.in_check()) {
        App.elements.turnIndicator.textContent = `${turn} in check!`;
        App.elements.turnIndicator.style.color = '#f44336';
    } else {
        App.elements.turnIndicator.textContent = `${turn} to move`;
        App.elements.turnIndicator.style.color = '#2c5f9e';
    }
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
    
    App.elements.gameResult.textContent = message;
    App.elements.gameResult.classList.add('show');
    
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
    
    // Update navigation buttons
    updateNavigationButtons();
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
    if (App.timeControl === 0) {
        App.elements.whiteTime.textContent = '--:--';
        App.elements.blackTime.textContent = '--:--';
        return;
    }
    
    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };
    
    App.elements.whiteTime.textContent = formatTime(App.whiteTime);
    App.elements.blackTime.textContent = formatTime(App.blackTime);
    
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
    console.log('📈 updateAnalysis called with:', {
        depth: info.depth,
        score: info.score,
        mate: info.mate,
        nodes: info.nodes,
        pvLength: info.pv?.length
    });

    // Update depth and nodes
    App.elements.depth.textContent = info.depth;
    App.elements.nodes.textContent = formatNumber(info.nodes);

    const evalElem = document.getElementById('evaluation');
    const lineElem = document.getElementById('bestLine');

    if (!evalElem || !lineElem) return;

    // Update evaluation
    if (info.mate !== null) {
        evalElem.textContent = `M${info.mate}`;
        evalElem.style.color = info.mate > 0 ? '#4caf50' : '#f44336';
    } else if (info.score !== null) {
        const score = info.score.toFixed(2);
        evalElem.textContent = score > 0 ? `+${score}` : score;
        evalElem.style.color = score > 0 ? '#4caf50' :
                               score < 0 ? '#f44336' : '#2c5f9e';
    }

    // Update best line - convert UCI moves to SAN notation (show up to 5 moves / 10 ply)
    if (info.pv && info.pv.length > 0) {
        const sanMoves = convertPVtoSAN(info.pv.slice(0, 10)); // Limit to 10 ply (5 moves)
        if (sanMoves && sanMoves !== '') {
            lineElem.textContent = sanMoves;
        } else {
            lineElem.textContent = 'Calculating...';
        }
    } else if (info.depth > 0) {
        // Show something even if PV is not available yet
        lineElem.textContent = 'Analyzing...';
    }

    console.log('  - Analysis updated');
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
    
    // Reset UI
    App.elements.gameResult.classList.remove('show');
    updateMoveHistory();
    updateStatus();
    updateTimers();
    
    // Start timer if needed
    if (App.timeControl > 0) {
        startTimer();
    }
    
    // In engine mode, if player is black, make engine move
    if (App.gameMode === 'engine' && App.playerColor === 'black') {
        App.isPlayerTurn = false;
        setTimeout(() => {
            makeEngineMove();
        }, 500);
    }

    // Clear analysis panel
    App.elements.depth.textContent = '0';
    App.elements.nodes.textContent = '0';
    const evalElem = document.getElementById('evaluation');
    const lineElem = document.getElementById('bestLine');
    if (evalElem) evalElem.textContent = '0.0';
    if (lineElem) lineElem.textContent = '--';

    // Notify engine of new game
    if (App.engine) {
        App.engine.newGame();
    }

    // Show resign button in engine mode
    if (App.gameMode === 'engine') {
        App.elements.resignBtn.style.display = 'block';
    } else {
        App.elements.resignBtn.style.display = 'none';
    }
}

function resignGame() {
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

    showNotification(`${winner} wins by resignation`);
}

// ===== FEN OPERATIONS =====
function loadFEN(fen, setAnalysisMode = true) {
    try {
        console.log('📝 Loading FEN - raw input:', fen);

        // Sanitize FEN input - trim and collapse multiple spaces
        fen = fen.trim().replace(/\s+/g, ' ');
        console.log('📝 After sanitization:', fen);

        // Check if this looks like PGN instead of FEN
        if (fen.includes('[Event') || fen.includes('1.') || fen.includes('1..')) {
            console.error('❌ This looks like PGN, not FEN');
            throw new Error('This is not FEN. Paste a FEN string.');
        }

        // Split into parts
        const fenParts = fen.split(' ');
        console.log('📝 FEN parts:', fenParts.length, fenParts);

        // FEN needs at least: position + side to move
        if (fenParts.length < 2) {
            console.error('❌ FEN needs at least position and side to move');
            throw new Error('Invalid FEN: needs at least position and side to move');
        }

        // Complete missing fields with defaults
        if (fenParts.length === 2) {
            // Add castling, en passant, halfmove, fullmove
            fen = `${fenParts[0]} ${fenParts[1]} - - 0 1`;
            console.log('📝 FEN had 2 fields, completed to:', fen);
        } else if (fenParts.length === 3) {
            // Add en passant, halfmove, fullmove
            fen = `${fenParts[0]} ${fenParts[1]} ${fenParts[2]} - 0 1`;
            console.log('📝 FEN had 3 fields, completed to:', fen);
        } else if (fenParts.length === 4) {
            // Add halfmove, fullmove
            fen = `${fenParts[0]} ${fenParts[1]} ${fenParts[2]} ${fenParts[3]} 0 1`;
            console.log('📝 FEN had 4 fields, completed to:', fen);
        } else if (fenParts.length === 5) {
            // Add fullmove
            fen = `${fenParts[0]} ${fenParts[1]} ${fenParts[2]} ${fenParts[3]} ${fenParts[4]} 1`;
            console.log('📝 FEN had 5 fields, completed to:', fen);
        }

        // Exit edit mode if active
        if (App.editMode) {
            exitEditMode();
        }

        // Try to load the FEN
        console.log('📝 Attempting to load FEN into chess.js:', fen);
        const valid = App.game.load(fen);

        if (!valid) {
            console.error('❌ chess.js rejected FEN:', fen);
            console.error('❌ Game state after failed load:', App.game.fen());
            throw new Error('Invalid FEN - chess.js validation failed');
        }

        console.log('✅ FEN loaded successfully!');
        console.log('📝 Resulting position:', App.game.fen());

        App.board.position(App.game.fen());
        App.moveHistory = [];
        App.currentMoveIndex = -1;

        // Optionally set to analysis mode
        if (setAnalysisMode) {
            App.gameActive = false;
            App.gameMode = 'analysis';
        }

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
}

// ===== MODAL MANAGEMENT =====
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('show');
    }
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
    }
}

// ===== EVENT LISTENERS =====
function setupEventListeners() {
    // Header buttons
    App.elements.newGameBtn.addEventListener('click', () => {
        showModal('newGameModal');
    });
    
    App.elements.menuBtn.addEventListener('click', () => {
        showModal('menuModal');
    });
    
    // Quick actions
    App.elements.flipBoard.addEventListener('click', flipBoard);
    
    App.elements.pasteFEN.addEventListener('click', () => {
        showModal('fenModal');
    });

    App.elements.editBoard.addEventListener('click', () => {
        toggleEditMode();
    });

    App.elements.analyzeGame.addEventListener('click', () => {
        // Check if there's a game history to analyze
        if (App.moveHistory.length === 0) {
            alert('No game to analyze. Play some moves first!');
            return;
        }

        // Enter analysis mode
        App.gameMode = 'analysis';
        App.gameActive = false;

        // Navigate to the start of the game
        navigateToStart();

        // Start analysis from current position
        startAnalysis();

        showNotification('Analysis mode: Use navigation buttons to explore the game');
    });
    
    App.elements.toggleAnalysis.addEventListener('click', toggleAnalysis);

    // Resign button
    App.elements.resignBtn.addEventListener('click', resignGame);

    // PGN Library
    App.elements.categorySelector.addEventListener('change', onCategoryChange);
    App.elements.playerSelector.addEventListener('change', onPlayerChange);
    App.elements.loadPgnBtn.addEventListener('click', loadSelectedPGN);

    // Navigation
    App.elements.navFirst.addEventListener('click', navigateToStart);
    App.elements.navPrev.addEventListener('click', navigateToPrevious);
    App.elements.navNext.addEventListener('click', navigateToNext);
    App.elements.navLast.addEventListener('click', navigateToEnd);
    
    // Move history clicks
    App.elements.moveHistory.addEventListener('click', (e) => {
        if (e.target.classList.contains('move')) {
            const index = parseInt(e.target.dataset.index);
            navigateToMove(index);
        }
    });
    
    // Settings changes
    App.elements.playerColor.addEventListener('change', (e) => {
        App.playerColor = e.target.value;
    });
    
    // Export PGN
    document.getElementById('exportPGN').addEventListener('click', exportPGN);
    
    // New Game Modal
    setupNewGameModal();
    
    // FEN Modal
    setupFENModal();
    
    // Menu Modal
    setupMenuModal();
    
    // Embed Modal
    setupEmbedModal();

    // Board Editor
    setupBoardEditor();

    // Engine vs Engine
    setupEngineVsEngine();

    // Modal close buttons
    document.querySelectorAll('.modal-close, [data-modal]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modalId = e.target.dataset.modal || e.target.closest('[data-modal]').dataset.modal;
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
        const fen = fenInput.value.trim();
        
        if (!fen) {
            fenError.textContent = 'Please enter a FEN string';
            fenError.classList.add('show');
            return;
        }
        
        const success = loadFEN(fen);
        
        if (success) {
            hideModal('fenModal');
            fenInput.value = '';
            fenError.classList.remove('show');
        } else {
            fenError.textContent = 'Invalid FEN string. Please check and try again.';
            fenError.classList.add('show');
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

        // Navigate to the start of the game
        navigateToStart();

        // Start analysis from current position
        startAnalysis();

        showNotification('Analysis mode: Use navigation buttons to explore the game');
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
    // Edit Board button in header
    App.elements.editBoardBtn.addEventListener('click', () => {
        toggleEditMode();
    });

    // Exit Editor button
    App.elements.exitEditor.addEventListener('click', () => {
        exitEditMode();
    });

    // Piece palette buttons
    document.querySelectorAll('.piece-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const piece = btn.dataset.piece;
            selectEditorPiece(piece);
        });
    });

    // Clear board button
    App.elements.clearBoard.addEventListener('click', () => {
        clearBoardEditor();
    });

    // Reset to start button
    App.elements.resetToStart.addEventListener('click', () => {
        resetBoardEditor();
    });

    // Apply position button
    App.elements.applyPosition.addEventListener('click', () => {
        applyEditorPosition();
    });

    // Clear All button (completely empty board)
    document.getElementById('clearAllBtn').addEventListener('click', () => {
        if (confirm('Clear all pieces from the board?')) {
            App.board.position({});
            showNotification('Board cleared');
        }
    });

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
function toggleEngineVsEngineMode() {
    App.eveMode = !App.eveMode;

    if (App.eveMode) {
        enterEngineVsEngineMode();
    } else {
        exitEngineVsEngineMode();
    }
}

function enterEngineVsEngineMode() {
    console.log('🤖 Entering Engine vs Engine mode');

    // Stop analysis if running
    if (App.analyzing) {
        stopAnalysis();
    }

    // Show EvE panel, hide other panels
    App.elements.evePanel.style.display = 'block';
    document.querySelector('.engine-panel').style.display = 'none';
    document.querySelector('.actions-panel').style.display = 'none';

    // Automatically start engines to continue from current position
    showNotification('Engine vs Engine mode: Click Start to continue from current position');
}

function exitEngineVsEngineMode() {
    console.log('🤖 Exiting Engine vs Engine mode');

    // Stop any running game
    if (App.eveRunning) {
        stopEngineVsEngine();
    }

    // Hide EvE panel, show other panels
    App.elements.evePanel.style.display = 'none';
    document.querySelector('.engine-panel').style.display = 'block';
    document.querySelector('.actions-panel').style.display = 'block';

    showNotification('Engine vs Engine mode disabled.');
}

async function startEngineVsEngine() {
    console.log('🤖 Starting Engine vs Engine game');

    try {
        // Get configuration
        App.eveMoveDelay = parseInt(App.elements.eveMoveDelay.value);

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
        App.gameMode = 'eve';
        App.gameActive = true;

        // Update UI
        App.eveRunning = true;
        App.evePaused = false;
        App.eveMoveCount = App.moveHistory.length;
        App.elements.startEve.style.display = 'none';
        App.elements.pauseEve.style.display = 'block';
        App.elements.stopEve.style.display = 'block';
        App.elements.eveStatus.style.display = 'block';
        App.elements.eveStatusText.textContent = 'Running';
        App.elements.eveMoveCount.textContent = '0';

        // Disable configuration while running
        App.elements.eveMoveDelay.disabled = true;

        showNotification('Engine vs Engine game started!');

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
            App.elements.eveStatusText.textContent = 'Game Over';

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
    App.elements.eveStatusText.textContent = `${engineName} thinking...`;

    // Get current position
    const currentFen = App.game.fen();

    // Request best move from engine
    currentEngine.getBestMove(currentFen, async (bestMove) => {
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
            App.eveMoveCount++;
            App.elements.eveMoveCount.textContent = App.eveMoveCount;
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
}

function pauseEngineVsEngine() {
    console.log('🤖 Pausing Engine vs Engine');
    App.evePaused = true;
    App.elements.eveStatusText.textContent = 'Paused';
    App.elements.pauseEve.style.display = 'none';
    App.elements.resumeEve.style.display = 'block';
    showNotification('Game paused.');
}

function resumeEngineVsEngine() {
    console.log('🤖 Resuming Engine vs Engine');
    App.evePaused = false;
    App.elements.eveStatusText.textContent = 'Running';
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
    App.elements.startEve.style.display = 'block';
    App.elements.pauseEve.style.display = 'none';
    App.elements.resumeEve.style.display = 'none';
    App.elements.stopEve.style.display = 'none';
    App.elements.eveStatusText.textContent = 'Stopped';

    // Re-enable configuration
    App.elements.eveMoveDelay.disabled = false;

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

async function loadSelectedPGN() {
    const selectedFile = App.elements.fileSelector.value;

    if (!selectedFile) {
        showNotification('Please select a game first.');
        return;
    }

    const selectedOption = App.elements.fileSelector.options[App.elements.fileSelector.selectedIndex];
    console.log('📖 Loading PGN from path:', selectedFile);

    try {
        // Fetch PGN file (file path already includes 'pgn/' prefix from library.json)
        const response = await fetch(selectedFile);

        if (!response.ok) {
            console.error('❌ Failed to fetch PGN file:', response.status, response.statusText);
            throw new Error(`Failed to load PGN: ${response.statusText}`);
        }

        const pgnText = await response.text();
        console.log('📖 PGN file fetched successfully');
        console.log('📖 First 200 chars:', pgnText.substring(0, 200));

        // Parse PGN for metadata
        const pgnData = parsePGN(pgnText);
        console.log('📖 Parsed PGN metadata:', pgnData);

        // Reset game first
        App.game.reset();

        // Try to load the PGN
        // Chess.js uses loadPgn() (camelCase), not load_pgn()
        console.log('📖 Attempting to load PGN into chess.js...');
        let success = false;

        // Try modern method first (loadPgn)
        if (typeof App.game.loadPgn === 'function') {
            success = App.game.loadPgn(pgnText);
            console.log('📖 loadPgn() result:', success);
        }
        // Fallback to older method (load_pgn)
        else if (typeof App.game.load_pgn === 'function') {
            success = App.game.load_pgn(pgnText);
            console.log('📖 load_pgn() result:', success);
        }
        else {
            console.error('❌ No PGN loading method found on chess.js instance');
            throw new Error('Chess.js PGN loader not found');
        }

        if (!success) {
            console.error('❌ chess.js rejected PGN');
            console.error('❌ PGN text:', pgnText);
            throw new Error('Invalid PGN format - chess.js validation failed');
        }

        console.log('✅ PGN loaded successfully into chess.js');

        // Set game mode to analysis (allows free navigation)
        App.gameMode = 'analysis';
        App.gameActive = false;

        // Update move history from PGN
        const history = App.game.history({ verbose: true });
        App.moveHistory = history;
        App.currentMoveIndex = history.length - 1; // Start at end position

        console.log('📖 Move history populated:', App.moveHistory.length, 'moves');

        // Update board to final position
        App.board.position(App.game.fen());

        // Update UI
        updateMoveHistory();
        updateStatus();

        // Show PGN info (use dataset from option if available, fallback to parsed data)
        App.elements.pgnInfo.style.display = 'block';
        const white = selectedOption.dataset.white || pgnData.white || '?';
        const black = selectedOption.dataset.black || pgnData.black || '?';
        const event = selectedOption.dataset.event || pgnData.event || '-';
        const result = selectedOption.dataset.result || pgnData.result || '-';

        App.elements.pgnEvent.textContent = event;
        App.elements.pgnPlayers.textContent = `${white} vs ${black}`;
        App.elements.pgnResult.textContent = result;

        showNotification(`Loaded: ${white} vs ${black} (${App.moveHistory.length} moves)`);

        console.log('✅ PGN load complete');

    } catch (error) {
        console.error('❌ Failed to load PGN:', error);
        console.error('❌ Error stack:', error.stack);
        showErrorNotification(`Failed to load game: ${error.message}`);
    }
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

// Setup Engine vs Engine event listeners
function setupEngineVsEngine() {
    // Engine vs Engine button in header
    App.elements.engineVsEngineBtn.addEventListener('click', () => {
        toggleEngineVsEngineMode();
    });

    // Start button
    App.elements.startEve.addEventListener('click', () => {
        startEngineVsEngine();
    });

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
    console.error('Application error:', e.error);
    showErrorNotification('An unexpected error occurred. The application may need to be refreshed.');
    return false;
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled promise rejection:', e.reason);
    showErrorNotification('An error occurred while processing your request.');
    return false;
});

// ===== PERFORMANCE MONITORING =====
console.log('TVLavin Chess loaded successfully');

// Export for debugging
window.App = App;
