/**
 * CAISSA Analyze Section
 * Handles game import and Stockfish analysis
 *
 * Part of Phase 2: Section Migration
 */

const AnalyzeSection = {

    // State
    currentSource: 'online',
    loadedGame: null,
    isAnalyzing: false,
    analysisResults: [],

    // DOM cache
    elements: {},

    /**
     * Initialize Analyze section
     */
    init() {
        console.log('[Analyze] Initializing...');
        this.cacheElements();
        this.bindEvents();
        console.log('[Analyze] Ready');
    },

    /**
     * Cache DOM elements
     */
    cacheElements() {
        this.elements = {
            // Tabs
            tabs: document.querySelectorAll('#analyzeSection .analyze-tab'),
            panels: {
                online: document.getElementById('analyzePanelOnline'),
                pgn: document.getElementById('analyzePanelPgn'),
                caissa: document.getElementById('analyzePanelCaissa')
            },

            // Online import
            provider: document.getElementById('analyzeProvider'),
            username: document.getElementById('analyzeUsername'),
            gameCount: document.getElementById('analyzeGameCount'),
            fetchBtn: document.getElementById('analyzeFetchBtn'),

            // PGN import
            pgnInput: document.getElementById('analyzePgnInput'),
            pgnFile: document.getElementById('analyzePgnFile'),
            pgnFileName: document.getElementById('analyzePgnFileName'),
            loadPgnBtn: document.getElementById('analyzeLoadPgnBtn'),

            // CAISSA games
            openLibraryBtn: document.getElementById('analyzeOpenLibrary'),

            // Metadata
            gameSource: document.getElementById('analyzeGameSource'),
            whitePlayer: document.getElementById('analyzeWhitePlayer'),
            blackPlayer: document.getElementById('analyzeBlackPlayer'),
            gameResult: document.getElementById('analyzeGameResult'),
            status: document.getElementById('analyzeStatus'),

            // Analysis controls
            startBtn: document.getElementById('analyzeStartBtn'),
            stopBtn: document.getElementById('analyzeStopBtn'),
            progressBar: document.getElementById('analyzeProgressBar'),
            progressFill: document.getElementById('analyzeProgressFill'),
            progressText: document.getElementById('analyzeProgressText'),

            // Move list
            moveList: document.getElementById('analyzeMoveList')
        };
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Tab switching
        this.elements.tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const source = e.currentTarget.dataset.source;
                this.switchTab(source);
            });
        });

        // Online fetch
        this.elements.fetchBtn?.addEventListener('click', () => {
            this.fetchOnlineGames();
        });

        // PGN load
        this.elements.loadPgnBtn?.addEventListener('click', () => {
            this.loadPgn();
        });

        // PGN file input
        this.elements.pgnFile?.addEventListener('change', (e) => {
            this.handlePgnFile(e);
        });

        // Open library
        this.elements.openLibraryBtn?.addEventListener('click', () => {
            this.openLibrary();
        });

        // Start analysis
        this.elements.startBtn?.addEventListener('click', () => {
            this.startAnalysis();
        });

        // Stop analysis
        this.elements.stopBtn?.addEventListener('click', () => {
            this.stopAnalysis();
        });
    },

    /**
     * Switch between tabs
     */
    switchTab(source) {
        this.currentSource = source;

        // Update tabs
        this.elements.tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.source === source);
        });

        // Update panels
        Object.keys(this.elements.panels).forEach(key => {
            const panel = this.elements.panels[key];
            if (panel) {
                panel.classList.toggle('active', key === source);
            }
        });

        console.log('[Analyze] Switched to tab:', source);
    },

    /**
     * Fetch games from Chess.com or Lichess
     */
    async fetchOnlineGames() {
        const provider = this.elements.provider?.value || 'lichess';
        const username = this.elements.username?.value?.trim();
        const count = parseInt(this.elements.gameCount?.value || '10');

        if (!username) {
            this.showNotification('Please enter a username', 'error');
            return;
        }

        console.log(`[Analyze] Fetching ${count} games from ${provider} for ${username}`);
        this.setStatus('Fetching games...', 'loading');

        try {
            // Use existing ChessComAPI if available
            if (window.ChessComAPI && provider === 'chess.com') {
                const games = await ChessComAPI.fetchGames(username, count);
                if (games && games.length > 0) {
                    this.loadGameFromPgn(games[0].pgn, provider, games[0]);
                } else {
                    throw new Error('No games found');
                }
            } else if (provider === 'lichess') {
                // Lichess API
                const response = await fetch(
                    `https://lichess.org/api/games/user/${username}?max=${count}&pgnInJson=true`,
                    { headers: { Accept: 'application/x-ndjson' } }
                );

                if (!response.ok) throw new Error('Failed to fetch from Lichess');

                const text = await response.text();
                const lines = text.trim().split('\n');
                if (lines.length > 0) {
                    const game = JSON.parse(lines[0]);
                    this.loadGameFromPgn(game.pgn, 'Lichess', {
                        white: game.players?.white?.user?.name || 'Unknown',
                        black: game.players?.black?.user?.name || 'Unknown',
                        result: game.winner ? (game.winner === 'white' ? '1-0' : '0-1') : '1/2-1/2'
                    });
                }
            }

            this.setStatus('Game loaded', 'success');
        } catch (error) {
            console.error('[Analyze] Fetch error:', error);
            this.setStatus('Fetch failed', 'error');
            this.showNotification(`Failed to fetch games: ${error.message}`, 'error');
        }
    },

    /**
     * Load PGN from textarea
     */
    loadPgn() {
        const pgn = this.elements.pgnInput?.value?.trim();

        if (!pgn) {
            this.showNotification('Please paste a PGN', 'error');
            return;
        }

        this.loadGameFromPgn(pgn, 'Manual PGN');
    },

    /**
     * Handle PGN file upload
     */
    handlePgnFile(e) {
        const file = e.target.files?.[0];
        if (!file) return;

        if (this.elements.pgnFileName) {
            this.elements.pgnFileName.textContent = file.name;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const pgn = event.target?.result;
            if (pgn) {
                if (this.elements.pgnInput) {
                    this.elements.pgnInput.value = pgn;
                }
                this.loadGameFromPgn(pgn, 'PGN File');
            }
        };
        reader.readAsText(file);
    },

    /**
     * Load game from PGN string
     */
    loadGameFromPgn(pgn, source, metadata = {}) {
        console.log('[Analyze] Loading PGN from:', source);

        try {
            // Use global Chess.js if available
            const game = new Chess();
            const loaded = game.load_pgn(pgn);

            if (!loaded) {
                throw new Error('Invalid PGN format');
            }

            // Extract headers
            const headers = game.header();

            this.loadedGame = {
                pgn: pgn,
                game: game,
                source: source,
                white: metadata.white || headers.White || 'Unknown',
                black: metadata.black || headers.Black || 'Unknown',
                result: metadata.result || headers.Result || '*',
                event: headers.Event || '',
                date: headers.Date || ''
            };

            // Update metadata display
            this.updateMetadata();

            // Load into main board via App
            if (window.App) {
                App.game.load_pgn(pgn);
                App.board.position(App.game.fen());
                if (typeof App.updateUI === 'function') {
                    App.updateUI();
                } else if (typeof window.updateUI === 'function') {
                    window.updateUI();
                }
            }

            // Update move list
            this.updateMoveList();

            this.setStatus('Ready to analyze', 'ready');
            console.log('[Analyze] Game loaded successfully');

        } catch (error) {
            console.error('[Analyze] PGN load error:', error);
            this.showNotification(`Failed to load PGN: ${error.message}`, 'error');
            this.setStatus('Load failed', 'error');
        }
    },

    /**
     * Update metadata display
     */
    updateMetadata() {
        if (!this.loadedGame) return;

        if (this.elements.gameSource) {
            this.elements.gameSource.textContent = this.loadedGame.source;
        }
        if (this.elements.whitePlayer) {
            this.elements.whitePlayer.textContent = this.loadedGame.white;
        }
        if (this.elements.blackPlayer) {
            this.elements.blackPlayer.textContent = this.loadedGame.black;
        }
        if (this.elements.gameResult) {
            this.elements.gameResult.textContent = this.loadedGame.result;
        }
    },

    /**
     * Update move list display
     */
    updateMoveList() {
        if (!this.elements.moveList || !this.loadedGame) return;

        const moves = this.loadedGame.game.history();

        if (moves.length === 0) {
            this.elements.moveList.innerHTML = '<p class="empty-state">No moves in game</p>';
            return;
        }

        let html = '<div class="move-list-grid">';
        for (let i = 0; i < moves.length; i += 2) {
            const moveNum = Math.floor(i / 2) + 1;
            const whiteMove = moves[i] || '';
            const blackMove = moves[i + 1] || '';

            html += `
                <div class="move-row">
                    <span class="move-num">${moveNum}.</span>
                    <span class="move-white" data-index="${i}">${whiteMove}</span>
                    <span class="move-black" data-index="${i + 1}">${blackMove}</span>
                </div>
            `;
        }
        html += '</div>';

        this.elements.moveList.innerHTML = html;

        // Add click handlers
        this.elements.moveList.querySelectorAll('.move-white, .move-black').forEach(el => {
            el.addEventListener('click', () => {
                const index = parseInt(el.dataset.index);
                this.jumpToMove(index);
            });
        });
    },

    /**
     * Jump to specific move
     */
    jumpToMove(index) {
        if (!this.loadedGame || !window.App) return;

        // Reset to start
        App.game.reset();

        // Replay moves up to index
        const moves = this.loadedGame.game.history();
        for (let i = 0; i <= index && i < moves.length; i++) {
            App.game.move(moves[i]);
        }

        // Update board
        App.board.position(App.game.fen());
        App.updateUI();

        console.log('[Analyze] Jumped to move:', index + 1);
    },

    /**
     * Start Stockfish analysis
     */
    async startAnalysis() {
        if (!this.loadedGame) {
            this.showNotification('Load a game first', 'error');
            return;
        }

        console.log('[Analyze] Starting analysis...');
        this.isAnalyzing = true;
        this.analysisResults = [];

        // Update UI
        this.elements.startBtn.style.display = 'none';
        this.elements.stopBtn.style.display = 'block';
        this.elements.progressBar.style.display = 'block';
        this.setStatus('Analyzing...', 'loading');

        const moves = this.loadedGame.game.history({ verbose: true });
        const totalMoves = moves.length;

        try {
            // Reset to start
            const tempGame = new Chess();

            for (let i = 0; i < totalMoves && this.isAnalyzing; i++) {
                // Update progress
                const progress = Math.round(((i + 1) / totalMoves) * 100);
                this.updateProgress(progress, `Move ${i + 1}/${totalMoves}`);

                // Analyze position
                const fen = tempGame.fen();
                const analysis = await this.analyzePosition(fen);

                this.analysisResults.push({
                    moveIndex: i,
                    move: moves[i].san,
                    fen: fen,
                    ...analysis
                });

                // Make move
                tempGame.move(moves[i].san);
            }

            this.setStatus('Analysis complete', 'success');
            console.log('[Analyze] Analysis complete');

        } catch (error) {
            console.error('[Analyze] Analysis error:', error);
            this.setStatus('Analysis failed', 'error');
        } finally {
            this.isAnalyzing = false;
            this.elements.startBtn.style.display = 'block';
            this.elements.stopBtn.style.display = 'none';
            this.elements.progressBar.style.display = 'none';
        }
    },

    /**
     * Stop ongoing analysis
     */
    stopAnalysis() {
        console.log('[Analyze] Stopping analysis...');
        this.isAnalyzing = false;
        this.setStatus('Analysis stopped', 'warning');
    },

    /**
     * Analyze single position with Stockfish
     */
    analyzePosition(fen) {
        return new Promise((resolve) => {
            // Use existing App.analyzePosition if available
            if (window.App && typeof App.analyzePosition === 'function') {
                // Temporarily capture analysis result
                const originalCallback = App.onAnalysisResult;
                const timeout = setTimeout(() => {
                    App.onAnalysisResult = originalCallback;
                    resolve({ eval: 0, bestMove: null, depth: 0 });
                }, 3000);

                App.onAnalysisResult = (result) => {
                    clearTimeout(timeout);
                    App.onAnalysisResult = originalCallback;
                    resolve({
                        eval: result.eval || 0,
                        bestMove: result.bestMove || null,
                        depth: result.depth || 0,
                        pv: result.pv || ''
                    });
                };

                // Trigger analysis
                App.analyzePosition(fen);
            } else if (window.App && App.stockfish) {
                // Direct Stockfish worker communication
                const timeout = setTimeout(() => {
                    resolve({ eval: 0, bestMove: null, depth: 0 });
                }, 3000);

                // Send position to stockfish
                App.stockfish.postMessage('position fen ' + fen);
                App.stockfish.postMessage('go depth 12');

                const handler = (e) => {
                    const data = e.data;
                    if (typeof data === 'string' && data.startsWith('bestmove')) {
                        clearTimeout(timeout);
                        App.stockfish.removeEventListener('message', handler);
                        const bestMove = data.split(' ')[1];
                        resolve({
                            eval: 0,
                            bestMove: bestMove,
                            depth: 12
                        });
                    }
                };

                App.stockfish.addEventListener('message', handler);
            } else {
                // Fallback - no engine available
                console.warn('[Analyze] No Stockfish engine available');
                resolve({ eval: 0, bestMove: null, depth: 0 });
            }
        });
    },

    /**
     * Update progress bar
     */
    updateProgress(percent, text) {
        if (this.elements.progressFill) {
            this.elements.progressFill.style.width = `${percent}%`;
        }
        if (this.elements.progressText) {
            this.elements.progressText.textContent = text || `${percent}%`;
        }
    },

    /**
     * Set status display
     */
    setStatus(text, type = 'ready') {
        if (!this.elements.status) return;

        this.elements.status.textContent = text;
        this.elements.status.className = 'metadata-value badge';

        switch (type) {
            case 'loading':
                this.elements.status.style.background = 'var(--accent-color)';
                this.elements.status.style.color = 'white';
                break;
            case 'success':
                this.elements.status.style.background = 'var(--success-color)';
                this.elements.status.style.color = 'white';
                break;
            case 'error':
                this.elements.status.style.background = 'var(--danger-color)';
                this.elements.status.style.color = 'white';
                break;
            case 'warning':
                this.elements.status.style.background = '#ffc107';
                this.elements.status.style.color = '#333';
                break;
            default:
                this.elements.status.style.background = 'var(--success-color)';
                this.elements.status.style.color = 'white';
        }
    },

    /**
     * Open Library panel
     */
    openLibrary() {
        if (window.LibraryUI && typeof window.LibraryUI.open === 'function') {
            window.LibraryUI.open();
        } else {
            const toggleBtn = document.getElementById('libraryToggleBtn');
            if (toggleBtn) toggleBtn.click();
        }
    },

    /**
     * Show notification
     */
    showNotification(message, type = 'info') {
        if (window.CaissaNotify) {
            CaissaNotify[type](message);
        } else if (window.showNotification) {
            showNotification(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    },

    /**
     * Section lifecycle: Enter
     */
    onEnter() {
        console.log('[Analyze] Section entered');
        // Could sync board here if needed
    },

    /**
     * Section lifecycle: Exit
     */
    onExit() {
        console.log('[Analyze] Section exited');
        // Stop analysis if running
        if (this.isAnalyzing) {
            this.stopAnalysis();
        }
    }
};

// Add move list styles inline
const style = document.createElement('style');
style.textContent = `
    .move-list-grid {
        font-size: 13px;
    }
    .move-row {
        display: grid;
        grid-template-columns: 30px 1fr 1fr;
        gap: 4px;
        padding: 4px 0;
        border-bottom: 1px solid var(--border-color);
    }
    .move-row:hover {
        background: var(--bg-primary);
    }
    .move-num {
        color: var(--text-secondary);
        font-weight: 500;
    }
    .move-white, .move-black {
        cursor: pointer;
        padding: 2px 4px;
        border-radius: 3px;
    }
    .move-white:hover, .move-black:hover {
        background: var(--primary-color);
        color: white;
    }
`;
document.head.appendChild(style);

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        AnalyzeSection.init();
    });
} else {
    AnalyzeSection.init();
}

// Register with navigation system
if (window.CaissaNavigation) {
    CaissaNavigation.sections.analyze = AnalyzeSection;
}

// Expose globally
window.AnalyzeSection = AnalyzeSection;
