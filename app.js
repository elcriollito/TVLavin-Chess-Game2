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
    engineLevel: 5,
    gameMode: 'engine', // 'engine' or 'analysis'
    timeControl: 0, // seconds, 0 = no limit

    // Game state
    isPlayerTurn: true,
    gameActive: false,
    analyzing: false,
    editMode: false,

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
        
        // Analysis
        evaluation: document.getElementById('evaluation'),
        depth: document.getElementById('depth'),
        nodes: document.getElementById('nodes'),
        bestLine: document.getElementById('bestLine'),
        engineStatusText: document.getElementById('engineStatusText'),
        engineStatus: document.getElementById('engineStatus'),
        
        // Move history
        moveHistory: document.getElementById('moveHistory'),
        
        // Settings
        engineLevel: document.getElementById('engineLevel'),
        playerColor: document.getElementById('playerColor'),
        
        // Modals
        newGameModal: document.getElementById('newGameModal'),
        fenModal: document.getElementById('fenModal'),
        menuModal: document.getElementById('menuModal'),
        embedModal: document.getElementById('embedModal'),
        promotionModal: document.getElementById('promotionModal')
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
        debugLog('Stockfish ready');
        updateEngineStatus('ready', 'Engine Ready');
        App.engine.setSkillLevel(App.engineLevel);
    };

    App.engine.onInfo = (info) => {
        if (App.analyzing) {
            updateAnalysis(info);
        }
    };

    App.engine.onError = (error) => {
        console.error('Engine error:', error);
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
    
    // In analysis mode, only allow moving side to move pieces
    if (App.gameMode === 'analysis') {
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

    updateEngineStatus('busy', 'Engine thinking...');

    const currentFen = App.game.fen();

    App.engine.getBestMove(currentFen, (bestMove) => {
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
    });
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
    if (!App.engine || !App.engine.ready) {
        console.error('Engine not ready for analysis');
        return;
    }
    
    App.analyzing = true;
    updateEngineStatus('busy', 'Analyzing...');
    
    App.engine.startAnalysis(App.game.fen(), (info) => {
        updateAnalysis(info);
    });
}

function stopAnalysis() {
    if (App.engine) {
        App.engine.stopAnalysis();
    }
    App.analyzing = false;
    updateEngineStatus('ready', 'Engine Ready');
}

function toggleAnalysis() {
    if (App.analyzing) {
        stopAnalysis();
        App.elements.toggleAnalysis.innerHTML = '<i class="fas fa-brain"></i> Analyze';
    } else {
        startAnalysis();
        App.elements.toggleAnalysis.innerHTML = '<i class="fas fa-stop"></i> Stop';
    }
}

function updateAnalysis(info) {
    // Update evaluation
    if (info.mate !== null) {
        App.elements.evaluation.textContent = `M${info.mate}`;
        App.elements.evaluation.style.color = info.mate > 0 ? '#4caf50' : '#f44336';
    } else if (info.score !== null) {
        const score = info.score.toFixed(2);
        App.elements.evaluation.textContent = score > 0 ? `+${score}` : score;
        App.elements.evaluation.style.color = score > 0 ? '#4caf50' :
                                               score < 0 ? '#f44336' : '#2c5f9e';
    }

    // Update depth
    App.elements.depth.textContent = info.depth;

    // Update nodes
    App.elements.nodes.textContent = formatNumber(info.nodes);

    // Update best line - convert UCI moves to SAN notation
    if (info.pv && info.pv.length > 0) {
        const sanMoves = convertPVtoSAN(info.pv);
        App.elements.bestLine.textContent = sanMoves;
    }
}

// Convert UCI PV (principal variation) to readable SAN notation
function convertPVtoSAN(pvMoves) {
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
            // If move fails, stop processing
            break;
        }
    }

    // Add ellipsis if there are more moves
    if (pvMoves.length > maxMoves) {
        sanMoves.push('...');
    }

    return sanMoves.join(' ');
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
    // Stop any ongoing operations
    stopAnalysis();
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
    if (options.level) {
        App.engineLevel = options.level;
        App.engine.setSkillLevel(options.level);
    }
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
    App.elements.evaluation.textContent = '0.0';
    App.elements.depth.textContent = '0';
    App.elements.nodes.textContent = '0';
    App.elements.bestLine.textContent = '--';
    
    // Notify engine of new game
    if (App.engine) {
        App.engine.newGame();
    }
}

// ===== FEN OPERATIONS =====
function loadFEN(fen, setAnalysisMode = true) {
    try {
        // Sanitize FEN input
        fen = fen.trim().replace(/[^\w\s\-\/]/g, '');

        const valid = App.game.load(fen);
        if (!valid) {
            throw new Error('Invalid FEN');
        }

        App.board.position(fen);
        App.moveHistory = [];
        App.currentMoveIndex = -1;

        // Optionally set to analysis mode
        if (setAnalysisMode) {
            App.gameActive = false;
            App.gameMode = 'analysis';
        }

        updateMoveHistory();
        updateStatus();

        return true;
    } catch (error) {
        debugLog('FEN load error:', error);
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
        if (!App.gameActive || App.moveHistory.length === 0) {
            alert('No game to analyze. Play some moves first!');
            return;
        }
        App.gameMode = 'analysis';
        App.gameActive = false;
        startAnalysis();
    });
    
    App.elements.toggleAnalysis.addEventListener('click', toggleAnalysis);
    
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
    App.elements.engineLevel.addEventListener('change', (e) => {
        App.engineLevel = parseInt(e.target.value);
        App.engine.setSkillLevel(App.engineLevel);
    });
    
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
    
    // Modal close buttons
    document.querySelectorAll('.modal-close, .btn-secondary[data-modal]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modalId = e.target.dataset.modal || e.target.closest('[data-modal]').dataset.modal;
            hideModal(modalId);
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
    let selectedLevel = 5;
    
    // Game mode change
    gameModeSelect.addEventListener('change', (e) => {
        const isEngine = e.target.value === 'engine';
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
    
    // Engine level selection
    document.getElementById('newGameEngineLevel').addEventListener('change', (e) => {
        selectedLevel = parseInt(e.target.value);
    });
    
    // Start game button
    startButton.addEventListener('click', () => {
        const mode = gameModeSelect.value;
        
        newGame({
            mode: mode,
            color: mode === 'engine' ? selectedColor : 'white',
            level: mode === 'engine' ? selectedLevel : 5,
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
        if (!App.gameActive || App.moveHistory.length === 0) {
            alert('No game to analyze. Play some moves first!');
            return;
        }
        App.gameMode = 'analysis';
        App.gameActive = false;
        startAnalysis();
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
        // Stop any active game
        App.gameActive = false;
        stopAnalysis();

        // Enable piece placement/removal
        App.board.draggable = true;
        showNotification('Edit mode enabled. Drag pieces to edit position.');
    } else {
        // Exit edit mode
        showNotification('Edit mode disabled.');
    }
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
