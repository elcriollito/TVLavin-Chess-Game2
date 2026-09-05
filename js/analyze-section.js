/**
 * CAISSA Analyze Section
 * Handles game import and Stockfish analysis
 *
 * Part of Phase 2: Section Migration
 * Analyze Page Status: v1.2 Production Ready
 */

const AnalyzeSection = {
    // State
    currentSource: 'online',
    loadedGame: null,
    session: null,
    board: null,
    activeHandoffId: null,
    pendingPromotion: null,
    fetchedGames: [],
    selectedFetchedGameIndex: -1,
    currentMoveIndex: -1,
    isAnalyzing: false,
    analysisResults: [],
    positionAnalyses: [],
    analysisEngine: null,
    analysisToken: 0,
    analysisPhase: 'idle',
    analyzedPositions: 0,
    totalPositions: 0,
    keyboardHandler: null,
    boardFlipped: false,
    studyModeInitialized: false,
    tapSource: null,
    tapTargets: [],
    liveEngineEnabled: false,
    liveEngineToken: 0,
    liveEngineTimer: null,
    liveEngineOwner: null,
    livePositionAnalyses: {},
    liveCurrentFen: null,
    liveCurrentResult: null,

    // DOM cache
    elements: {},

    renderEmptyState(target, options = {}) {
        if (!target) return;
        const payload = { icon: false, ...options };
        if (window.CaissaUI?.createEmptyState) {
            const node = window.CaissaUI.createEmptyState(payload);
            node.classList.add('caissa-ui-empty-state--compact');
            target.replaceChildren(node);
            return;
        }
        target.innerHTML = `<p class="empty-state">${this.escapeHtml(payload.message || payload.title || 'Nothing to show yet.')}</p>`;
    },

    /**
     * Initialize Analyze section
     */
    init() {
        console.log('[Analyze] Initializing...');
        this.cacheElements();
        this.bindEvents();
        this.updateNavigationControls();
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
            fetchedGames: document.getElementById('analyzeFetchedGames'),

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
            termination: document.getElementById('analyzeTermination'),
            status: document.getElementById('analyzeStatus'),

            // Analysis controls
            startBtn: document.getElementById('analyzeStartBtn'),
            stopBtn: document.getElementById('analyzeStopBtn'),
            progressBar: document.getElementById('analyzeProgressBar'),
            progressFill: document.getElementById('analyzeProgressFill'),
            progressText: document.getElementById('analyzeProgressText'),
            mentor: document.getElementById('analyzeMoveEvidence'),
            evalBar: document.getElementById('analyzeEvalBar'),
            evalFill: document.getElementById('analyzeEvalFill'),
            evalScore: document.getElementById('analyzeEvalScore'),
            reviewSummary: document.getElementById('analyzeReviewSummary'),
            criticalMoments: document.getElementById('analyzeCriticalMoments'),

            // Move list
            moveList: document.getElementById('analyzeMoveList'),
            navFirst: document.getElementById('analyzeNavFirst'),
            navPrev: document.getElementById('analyzeNavPrev'),
            navNext: document.getElementById('analyzeNavNext'),
            navLast: document.getElementById('analyzeNavLast'),
            engineToggle: document.getElementById('analyzeEngineToggle'),
            undoMove: document.getElementById('analyzeUndoMove'),
            resetBoard: document.getElementById('analyzeResetBoard'),
            flipBoard: document.getElementById('analyzeFlipBoard')
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

        this.elements.navFirst?.addEventListener('click', () => this.jumpToMove(-1));
        this.elements.navPrev?.addEventListener('click', () => this.jumpToMove(this.currentMoveIndex - 1));
        this.elements.navNext?.addEventListener('click', () => this.jumpToMove(this.currentMoveIndex + 1));
        this.elements.navLast?.addEventListener('click', () => {
            this.jumpToMove(this.getLoadedMoves().length - 1);
        });
        this.elements.engineToggle?.addEventListener('click', () => this.toggleLiveEngine());
        this.elements.undoMove?.addEventListener('click', () => this.undoStudyMove());
        this.elements.resetBoard?.addEventListener('click', () => this.resetStudyBoard({ explicit: true }));
        this.elements.flipBoard?.addEventListener('click', () => this.flipAnalyzeBoard());

        this.bindKeyboardNavigation();
    },

    bindKeyboardNavigation() {
        if (this.keyboardHandler) return;
        this.keyboardHandler = (event) => this.handleKeyboardNavigation(event);
        document.addEventListener('keydown', this.keyboardHandler);
    },

    handleKeyboardNavigation(event) {
        if (!this.loadedGame || !this.isAnalyzeActive() || this.isEditableTarget(event.target)) return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;

        const lastMoveIndex = this.getLoadedMoves().length - 1;
        const destinations = {
            ArrowLeft: this.currentMoveIndex - 1,
            ArrowRight: this.currentMoveIndex + 1,
            Home: -1,
            End: lastMoveIndex
        };
        if (!Object.prototype.hasOwnProperty.call(destinations, event.key)) return;

        event.preventDefault();
        this.jumpToMove(destinations[event.key]);
    },

    isAnalyzeActive() {
        if (document.getElementById('analyzeSection')?.classList.contains('caissa-play-v2-inline-analyze')) return true;
        if (window.CaissaNavigation?.currentSection) {
            return CaissaNavigation.currentSection === 'analyze';
        }
        return document.getElementById('analyzeSection')?.classList.contains('active') || false;
    },

    isEditableTarget(target) {
        if (!(target instanceof Element)) return false;
        return target.isContentEditable
            || !!target.closest('input, select, textarea, [contenteditable="true"]');
    },

    getGame() {
        return this.loadedGame?.game || null;
    },

    ensureAnalyzeBoard() {
        if (this.board || !window.Chessboard || !document.getElementById('analyzeChessboard')) return !!this.board;
        this.board = Chessboard('analyzeChessboard', {
            draggable: true,
            position: this.getGame()?.fen?.() || 'start',
            onDragStart: (source, piece) => this.canStartStudyMove(source, piece),
            onDrop: (source, target) => this.handleBoardDrop(source, target),
            onSnapEnd: () => this.board?.position(this.getGame()?.fen?.(), false),
            pieceTheme: 'img/chesspieces/wikipedia/{piece}.png',
            showNotation: true
        });
        return true;
    },

    handleBoardDrop(source, target) {
        const move = this.getGame()?.moves({ verbose: true })
            .find(candidate => candidate.from === source && candidate.to === target);
        if (move?.flags?.includes('p')) {
            this.pendingPromotion = { from: source, to: target };
            window.showPromotionDialog?.();
            return undefined;
        }
        return this.playStudyMove(source, target) ? undefined : 'snapback';
    },

    completePromotion(piece) {
        if (!this.pendingPromotion) return false;
        const { from, to } = this.pendingPromotion;
        this.pendingPromotion = null;
        return this.playStudyMove(from, to, piece);
    },

    ensureStudyBoard() {
        if (!window.Chess) return false;

        if (!this.loadedGame) {
            this.resetStudyBoard({ silent: true });
        }

        const game = this.getGame();
        this.ensureAnalyzeBoard();
        if (this.board && game) {
            this.board.position(game.fen(), false);
            this.board.orientation(this.boardFlipped ? 'black' : 'white');
            this.board.resize?.();
        }

        this.updateMetadata();
        this.updateMoveList();
        this.updateNavigationControls();
        this.updateMentorPanel();
        this.updateEvaluationBar();
        return true;
    },

    cloneGame(game = this.getGame()) {
        if (!game || !window.Chess) return null;
        const clone = new Chess();
        game.history().forEach((san) => clone.move(san));
        return clone;
    },

    syncLoadedMoveLine(game = this.getGame()) {
        if (!this.loadedGame || !game?.history) return;
        this.loadedGame.movesSan = game.history().slice();
        this.loadedGame.movesVerbose = game.history({ verbose: true }).map((move) => ({ ...move }));
    },

    getLoadedMoves({ verbose = false } = {}) {
        if (!this.loadedGame) return [];
        if (verbose && Array.isArray(this.loadedGame.movesVerbose)) {
            return this.loadedGame.movesVerbose.map((move) => ({ ...move }));
        }
        if (!verbose && Array.isArray(this.loadedGame.movesSan)) {
            return this.loadedGame.movesSan.slice();
        }
        return this.loadedGame.game.history(verbose ? { verbose: true } : undefined);
    },

    resetStudyBoard({ explicit = false, silent = false } = {}) {
        if (!window.Chess) return;

        if (this.isAnalyzing) this.stopAnalysis();
        this.livePositionAnalyses = {};
        this.liveCurrentFen = null;
        this.liveCurrentResult = null;
        const session = window.CaissaAnalyzeSession?.createSession?.() || null;
        const game = session?.game || new Chess();
        this.session = session;
        this.loadedGame = {
            pgn: '',
            game,
            initialFen: null,
            source: 'Study Board',
            white: 'White',
            black: 'Black',
            result: '*',
            event: 'Free Study',
            date: '',
            eco: '',
            opening: '',
            movesSan: [],
            movesVerbose: []
        };
        this.currentMoveIndex = -1;
        this.analysisResults = [];
        this.positionAnalyses = [];
        this.clearTapSelection();

        window.CaissaClockService?.stop('analyze-enter');
        this.ensureAnalyzeBoard();
        this.board?.position(game.fen(), false);

        this.updateMetadata();
        this.updateMoveList();
        this.updateNavigationControls();
        this.updateMentorPanel();
        this.updateEvaluationBar();
        this.refreshLiveEvaluation();
        this.updateReviewSummary();
        this.updateCriticalMoments();
        this.setStatus('Study board ready', 'ready');
        this.studyModeInitialized = true;
        if (explicit && !silent) {
            this.showNotification('Study board reset to the starting position.', 'success');
        }
    },

    canStartStudyMove(square) {
        const game = this.getGame();
        if (!this.isAnalyzeActive() || !game) return false;
        const piece = game.get(square);
        if (!piece) return false;
        return piece.color === game.turn() && !game.game_over();
    },

    playStudyMove(from, to, promotion) {
        const game = this.getGame();
        if (!this.isAnalyzeActive() || !game) return false;
        const move = game.move({ from, to, promotion });
        if (!move) return false;

        this.syncLoadedMoveLine(game);
        this.currentMoveIndex = game.history().length - 1;
        this.analysisResults = [];
        this.positionAnalyses = [];
        this.clearTapSelection();
        this.updateBoardAndUI();
        this.updateMoveList();
        this.updateNavigationControls();
        this.updateMentorPanel();
        this.updateEvaluationBar();
        this.refreshLiveEvaluation();
        this.updateReviewSummary();
        this.updateCriticalMoments();
        this.setStatus(`${game.turn() === 'w' ? 'White' : 'Black'} to move`, 'ready');
        return true;
    },

    undoStudyMove() {
        const game = this.getGame();
        if (!game) return;
        const move = game.undo();
        if (!move) return;
        this.syncLoadedMoveLine(game);
        this.currentMoveIndex = game.history().length - 1;
        this.analysisResults = [];
        this.positionAnalyses = [];
        this.clearTapSelection();
        this.updateBoardAndUI();
        this.updateMoveList();
        this.updateNavigationControls();
        this.updateMentorPanel();
        this.updateEvaluationBar();
        this.refreshLiveEvaluation();
        this.updateReviewSummary();
        this.updateCriticalMoments();
        this.setStatus(`${game.turn() === 'w' ? 'White' : 'Black'} to move`, 'ready');
    },

    clearTapSelection() {
        this.tapSource = null;
        this.tapTargets = [];
        document.querySelectorAll('#analyzeSection #chessboard .analyze-tap-source, #analyzeSection #chessboard .analyze-tap-target').forEach((el) => {
            el.classList.remove('analyze-tap-source', 'analyze-tap-target');
        });
    },

    markTapSource(square) {
        this.clearTapSelection();
        this.tapSource = square;
        this.tapTargets = this.getGame().moves({ square, verbose: true }).map((move) => move.to);
        document.querySelector(`#analyzeSection #chessboard .square-${square}`)?.classList.add('analyze-tap-source');
        this.tapTargets.forEach((target) => {
            document.querySelector(`#analyzeSection #chessboard .square-${target}`)?.classList.add('analyze-tap-target');
        });
    },

    handleBoardTap(square) {
        if (!square || !this.getGame()) return false;

        if (!this.tapSource) {
            if (this.canStartStudyMove(square)) {
                this.markTapSource(square);
                return true;
            }
            return false;
        }

        const source = this.tapSource;
        if (source === square) {
            this.clearTapSelection();
            return true;
        }

        const moved = this.playStudyMove(source, square);
        if (!moved) {
            this.clearTapSelection();
            if (this.canStartStudyMove(square)) this.markTapSource(square);
            else this.board?.position(this.getGame().fen(), false);
        }
        return true;
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

        console.log('[Analyze] Fetching games via provider', { provider, username, count });
        this.setStatus('Loading games...', 'loading');
        window.CaissaUI?.setButtonLoading(this.elements.fetchBtn, true, { label: 'Loading games...' });

        try {
            const data = provider === 'lichess'
                ? await this.fetchLichessGames(username, count)
                : await this.fetchChessComGames(username, count);
            if (!data.pgn || !data.count) {
                throw new Error('No games found');
            }

            this.fetchedGames = this.parsePgnCollection(data.pgn, data.source || provider);
            this.selectedFetchedGameIndex = -1;
            console.log(`[Analyze] Received ${this.fetchedGames.length} games`);
            this.renderFetchedGames();

            if (this.fetchedGames.length === 1) {
                this.selectFetchedGame(0);
            } else {
                this.setStatus('Select a game', 'ready');
            }
        } catch (error) {
            console.error('[Analyze] Fetch error:', error);
            const providerName = provider === 'lichess' ? 'Lichess' : 'Chess.com';
            if (String(error?.message || '').toLowerCase().includes('no games')) {
                this.setStatus('No games found', 'warning');
                if (this.elements.fetchedGames) {
                    this.elements.fetchedGames.hidden = false;
                    this.renderEmptyState(this.elements.fetchedGames, {
                        icon: 'fa-search',
                        title: 'No games found.',
                        message: `Try a different ${providerName} username or upload PGN manually.`
                    });
                }
                this.showNotification(`No games found for this ${providerName} username.`, 'warning');
                return;
            }
            this.setStatus('Could not load games', 'error');
            this.showNotification(
                `Could not fetch games from ${providerName}. Please try again or upload PGN manually.`,
                'error'
            );
        } finally {
            window.CaissaUI?.setButtonLoading(this.elements.fetchBtn, false);
        }
    },

    async fetchLichessGames(username, count) {
        const requestUrl = new URL(`https://lichess.org/api/games/user/${encodeURIComponent(username)}`);
        requestUrl.search = new URLSearchParams({
            max: String(count),
            moves: 'true',
            tags: 'true',
            clocks: 'false',
            evals: 'false',
            opening: 'false'
        }).toString();

        console.log('[Analyze] Using Lichess CORS API');
        console.log('[Analyze] Request URL:', requestUrl.toString());

        const response = await fetch(requestUrl.toString(), {
            headers: { Accept: 'application/x-chess-pgn' }
        });
        if (!response.ok) {
            throw new Error(`Lichess request failed (${response.status})`);
        }

        const pgn = (await response.text()).trim();
        return {
            pgn,
            count: (pgn.match(/\[Event\s/g) || []).length,
            source: 'Lichess'
        };
    },

    async fetchChessComGames(username, count) {
        const archivesUrl = `https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/games/archives`;
        console.log('[Analyze] Using Chess.com CORS API');
        console.log('[Analyze] Request URL:', archivesUrl);

        const archivesResponse = await fetch(archivesUrl, {
            headers: { Accept: 'application/json' }
        });
        if (!archivesResponse.ok) {
            throw new Error(`Chess.com archives request failed (${archivesResponse.status})`);
        }

        const { archives = [] } = await archivesResponse.json();
        const games = [];
        for (const archiveUrl of archives.slice().reverse()) {
            if (games.length >= count) break;
            console.log('[Analyze] Request URL:', archiveUrl);
            const response = await fetch(archiveUrl, {
                headers: { Accept: 'application/json' }
            });
            if (!response.ok) continue;
            const data = await response.json();
            games.push(...(data.games || []).slice().reverse().filter((game) => (
                game.pgn && this.isLoadablePgn(game.pgn)
            )));
        }

        const selected = games.slice(0, count);
        return {
            pgn: selected.map((game) => game.pgn.trim()).join('\n\n'),
            count: selected.length,
            source: 'Chess.com'
        };
    },

    isLoadablePgn(pgn) {
        try {
            const game = new Chess();
            return !!game.load_pgn(pgn);
        } catch (_error) {
            return false;
        }
    },

    parsePgnCollection(combinedPgn, source) {
        return String(combinedPgn || '')
            .trim()
            .split(/\r?\n\s*\r?\n(?=\[Event\s)/)
            .map((pgn, index) => {
                try {
                    const game = new Chess();
                    if (!game.load_pgn(pgn)) return null;
                    const headers = game.header();
                    return {
                        index,
                        pgn,
                        source,
                        white: headers.White || 'Unknown',
                        black: headers.Black || 'Unknown',
                        result: headers.Result || '*',
                        date: headers.Date || ''
                    };
                } catch (_error) {
                    return null;
                }
            })
            .filter(Boolean);
    },

    renderFetchedGames() {
        if (!this.elements.fetchedGames) return;
        if (this.fetchedGames.length === 0) {
            this.elements.fetchedGames.hidden = true;
            this.elements.fetchedGames.innerHTML = '';
            return;
        }

        this.elements.fetchedGames.hidden = false;
        this.elements.fetchedGames.innerHTML = this.fetchedGames.map((game, index) => `
            <button type="button" class="analyze-fetched-game${index === this.selectedFetchedGameIndex ? ' active' : ''}" data-game-index="${index}" aria-label="Load game ${index + 1}: ${this.escapeHtml(game.white)} versus ${this.escapeHtml(game.black)}, ${this.escapeHtml(game.result)}">
                <span class="analyze-game-number">${index + 1}</span>
                <span class="analyze-game-label">${this.escapeHtml(game.white)} vs ${this.escapeHtml(game.black)}</span>
                <span class="analyze-game-meta">${this.escapeHtml(game.source)} · ${this.escapeHtml(game.result)}${game.date ? ` · ${this.escapeHtml(game.date)}` : ''}</span>
            </button>
        `).join('');

        this.elements.fetchedGames.querySelectorAll('[data-game-index]').forEach((button) => {
            button.addEventListener('click', () => this.selectFetchedGame(Number(button.dataset.gameIndex)));
        });
    },

    selectFetchedGame(index) {
        const game = this.fetchedGames[index];
        if (!game) return;
        this.selectedFetchedGameIndex = index;
        this.renderFetchedGames();
        this.loadGameFromPgn(game.pgn, game.source, game);
    },

    escapeHtml(value) {
        const div = document.createElement('div');
        div.textContent = String(value ?? '');
        return div.innerHTML;
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
            const session = window.CaissaAnalyzeSession?.createSession?.({ pgn });
            const game = session?.game;
            if (!game) {
                throw new Error('Invalid PGN format');
            }
            this.session = session;

            // Extract headers
            const headers = game.header();

            this.loadedGame = {
                pgn: pgn,
                game: game,
                initialFen: headers.SetUp === '1' && headers.FEN ? headers.FEN : null,
                source: source,
                white: metadata.white || headers.White || 'Unknown',
                black: metadata.black || headers.Black || 'Unknown',
                result: metadata.result || headers.Result || '*',
                termination: metadata.termination || headers.Termination || null,
                event: headers.Event || '',
                date: headers.Date || '',
                eco: metadata.eco || headers.ECO || '',
                opening: metadata.opening || headers.Opening || '',
                recordId: metadata.recordId || null,
                movesSan: game.history().slice(),
                movesVerbose: game.history({ verbose: true }).map((move) => ({ ...move }))
            };
            this.currentMoveIndex = this.getLoadedMoves().length - 1;
            this.analysisResults = [];
            this.positionAnalyses = [];
            this.updateReviewSummary();
            this.updateCriticalMoments();

            // Update metadata display
            this.updateMetadata();

            this.ensureAnalyzeBoard();
            this.updateBoardAndUI();
            this.projectCoachReviewBoardAssistance();

            // Update move list
            this.updateMoveList();
            this.updateNavigationControls();
            this.updateMentorPanel();
            this.updateEvaluationBar();

            this.setStatus('Ready to analyze', 'ready');
            console.log('[Analyze] Game loaded successfully');

        } catch (error) {
            console.error('[Analyze] PGN load error:', error);
            this.showNotification('Could not load PGN. Check the format and try again.', 'error');
            this.setStatus('Could not load PGN', 'error');
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
        if (this.elements.termination) {
            const value = String(this.loadedGame.termination || '').replace(/-/g, ' ');
            this.elements.termination.textContent = value ? value.replace(/^./, character => character.toUpperCase()) : 'Not recorded';
        }
    },

    /**
     * Update move list display
     */
    updateMoveList() {
        if (!this.elements.moveList || !this.loadedGame) return;

        const moves = this.getLoadedMoves();

        if (moves.length === 0) {
            this.renderEmptyState(this.elements.moveList, {
                icon: 'fa-list-ol',
                title: 'No moves yet.',
                message: 'Use the board to enter moves from a book, magazine, or PGN.'
            });
            return;
        }

        let html = '<div class="move-list-grid">';
        for (let i = 0; i < moves.length; i += 2) {
            const moveNum = Math.floor(i / 2) + 1;
            const whiteMove = moves[i] || '';
            const blackMove = moves[i + 1] || '';
            const whiteAnnotation = this.analysisPhase === 'complete' ? this.analysisResults[i]?.annotation || '' : '';
            const blackAnnotation = this.analysisPhase === 'complete' ? this.analysisResults[i + 1]?.annotation || '' : '';
            const whiteAnnotationClass = this.getAnnotationClass(whiteAnnotation);
            const blackAnnotationClass = this.getAnnotationClass(blackAnnotation);

            html += `
                <div class="move-row">
                    <span class="move-num">${moveNum}.</span>
                    <button type="button" class="move-white${i === this.currentMoveIndex ? ' active' : ''}" data-index="${i}" aria-label="${this.escapeHtml(this.getMoveAccessibleLabel(i, whiteMove))}">${whiteMove}${whiteAnnotation ? `<strong aria-hidden="true" class="analyze-move-annotation ${whiteAnnotationClass}">${whiteAnnotation}</strong>` : ''}</button>
                    <button type="button" class="move-black${i + 1 === this.currentMoveIndex ? ' active' : ''}" data-index="${i + 1}" aria-label="${this.escapeHtml(this.getMoveAccessibleLabel(i + 1, blackMove))}">${blackMove}${blackAnnotation ? `<strong aria-hidden="true" class="analyze-move-annotation ${blackAnnotationClass}">${blackAnnotation}</strong>` : ''}</button>
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
        if (!this.loadedGame) return;
        const moves = this.getLoadedMoves();
        const game = this.getGame();
        const safeIndex = Math.max(-1, Math.min(index, moves.length - 1));

        // Reset to the game's actual starting position.
        if (this.loadedGame.initialFen) {
            game.load(this.loadedGame.initialFen);
        } else {
            game.reset();
        }

        // Replay moves up to index
        for (let i = 0; i <= safeIndex && i < moves.length; i++) {
            game.move(moves[i]);
        }

        this.currentMoveIndex = safeIndex;
        this.updateBoardAndUI();
        this.updateMoveList();
        this.updateNavigationControls();
        this.updateMentorPanel();
        this.updateEvaluationBar();
        this.refreshLiveEvaluation();

        const selected = this.analysisPhase === 'complete' ? this.analysisResults[safeIndex] : null;
        const coachReviewActive = document.body?.classList?.contains('caissa-coach-review-summary-active');
        const botsReviewActive = document.body?.classList?.contains('caissa-bots-guided-review-active');
        if (!coachReviewActive && !botsReviewActive && selected && ['Inaccuracy', 'Mistake', 'Blunder'].includes(selected.quality)) {
            this.board?.position?.(selected.fenBefore, false);
        }
        this.projectCoachReviewBoardAssistance();

        if (document.body?.classList?.contains('caissa-coach-review-summary-active')) {
            window.dispatchEvent(new CustomEvent('caissa:coach-review-ply-change', {
                detail: Object.freeze({ currentMoveIndex: this.currentMoveIndex })
            }));
        }
        if (botsReviewActive) {
            window.dispatchEvent(new CustomEvent('caissa:bots-review-ply-change', {
                detail: Object.freeze({ currentMoveIndex: this.currentMoveIndex })
            }));
        }

        console.log('[Analyze] Jumped to move:', safeIndex + 1);
    },

    projectCoachReviewBoardAssistance() {
        if (!document.body?.classList?.contains('caissa-coach-review-summary-active')
            && !document.body?.classList?.contains('caissa-bots-guided-review-active')) return false;
        const projection = this.getCoachReviewProjection();
        if (!projection) return false;
        return window.App?.projectCoachReviewBoardAssistance?.({
            fen: projection.fen,
            move: projection.move
        }) === true;
    },

    getCoachReviewProjection() {
        const game = this.getGame();
        if (!game) return null;
        const selected = this.analysisPhase === 'complete' ? this.analysisResults[this.currentMoveIndex] : null;
        const displayedMoveIndex = this.currentMoveIndex;
        const move = displayedMoveIndex >= 0 ? this.getLoadedMoves({ verbose: true })[displayedMoveIndex] : null;
        return Object.freeze({
            fen: typeof selected?.fenAfter === 'string' ? selected.fenAfter : game.fen(),
            move: move?.from && move?.to ? Object.freeze({ from: move.from, to: move.to }) : null,
            authoritativeIndex: this.currentMoveIndex,
            displayedMoveIndex,
            showsFenBefore: false
        });
    },

    getMoveAccessibleLabel(index, san) {
        const result = this.analysisPhase === 'complete' ? this.analysisResults[index] : null;
        const quality = result?.quality || (result?.unavailable ? 'Analysis unavailable' : 'Not analyzed');
        return `${san || 'Empty move'}, ${quality}`;
    },

    updateBoardAndUI() {
        const game = this.getGame();
        if (!game) return;
        if (this.board && typeof this.board.position === 'function') {
            this.board.position(game.fen(), false);
        }
        if (typeof App.updateUI === 'function') {
            App.updateUI();
        }
    },

    updateNavigationControls() {
        const moveCount = this.getLoadedMoves().length;
        const atStart = this.currentMoveIndex < 0;
        const atEnd = moveCount === 0 || this.currentMoveIndex >= moveCount - 1;
        if (this.elements.navFirst) this.elements.navFirst.disabled = atStart || moveCount === 0;
        if (this.elements.navPrev) this.elements.navPrev.disabled = atStart || moveCount === 0;
        if (this.elements.navNext) this.elements.navNext.disabled = atEnd;
        if (this.elements.navLast) this.elements.navLast.disabled = atEnd;
        if (this.elements.undoMove) {
            const disabled = moveCount === 0;
            this.elements.undoMove.disabled = disabled;
            this.elements.undoMove.setAttribute('aria-disabled', String(disabled));
        }
        if (this.elements.resetBoard) {
            this.elements.resetBoard.disabled = false;
            this.elements.resetBoard.setAttribute('aria-disabled', 'false');
        }
    },

    updateMentorPanel() {
        if (!this.elements.mentor) return;
        if (this.liveEngineEnabled && !this.isAnalyzing) {
            this.updateLiveMentorPanel();
            return;
        }
        if (this.currentMoveIndex < 0) {
            this.renderEmptyState(this.elements.mentor, {
                icon: 'fa-brain',
                title: 'No move selected.',
                message: 'Select a move to see analysis guidance.'
            });
            return;
        }

        const result = this.analysisPhase === 'complete' ? this.analysisResults[this.currentMoveIndex] : null;
        const move = this.getLoadedMoves()[this.currentMoveIndex] || '';
        if (!result) {
            this.elements.mentor.innerHTML = `
                <div class="analyze-mentor-heading"><strong>${this.escapeHtml(move)}</strong></div>
                <p class="analyze-mentor-copy">Analyze the game to see an engine evaluation and recommendation for this move.</p>
            `;
            return;
        }
        if (result.unavailable) {
            this.elements.mentor.innerHTML = `
                <div class="analyze-mentor-heading">
                    <strong>${this.escapeHtml(move)}</strong>
                    <span class="analyze-annotation">-</span>
                    <span>Analysis unavailable</span>
                </div>
                <p class="analyze-mentor-copy">Stockfish could not evaluate this move in time. Other analyzed moves remain available.</p>
            `;
            return;
        }

        const negative = ['Inaccuracy', 'Mistake', 'Blunder'].includes(result.quality);
        const book = result.quality === 'Book' && result.bookEvidence;
        const recommendation = negative && result.recommendationAvailable;
        const accessibleEvidence = this.buildMoveEvidenceDescription(result, recommendation);
        this.elements.mentor.innerHTML = `
            <div class="analyze-evidence" role="group" aria-label="${this.escapeHtml(accessibleEvidence)}">
                <div class="analyze-evidence__visual ${negative ? 'is-comparison' : 'is-compact'}${negative && !recommendation ? ' is-without-recommendation' : ''}" aria-hidden="true">
                    <div class="analyze-evidence__classification ${this.getAnnotationClass(result.annotation)}">
                        <strong>${this.escapeHtml(result.quality)}</strong>
                        ${result.annotation ? `<span>${this.escapeHtml(result.annotation)}</span>` : ''}
                    </div>
                    ${book ? `<div class="analyze-evidence__field analyze-evidence__played"><span>Played</span><strong>${this.escapeHtml(result.move)}</strong></div>
                    <div class="analyze-evidence__field analyze-evidence__opening"><span>Opening</span><strong>${this.escapeHtml(book.name)}</strong></div>
                    <a class="analyze-review-opening__explore" href="/eco/${book.eco}" target="_blank" rel="noopener">Explore in ECO Database</a>` : ''}
                    ${negative ? `<div class="analyze-evidence__field analyze-evidence__played"><span>Played</span><strong>${this.escapeHtml(result.move)}</strong></div>
                    ${recommendation ? `<div class="analyze-evidence__field analyze-evidence__recommendation"><span>Engine recommends</span><strong>${this.escapeHtml(result.bestMoveSan)}</strong></div>` : ''}
                    <div class="analyze-evidence__field analyze-evidence__evaluation"><span>Evaluation</span><strong>${this.formatEvaluation(result.beforePlayerEval, result.mateBefore)} → ${this.formatEvaluation(result.afterPlayerEval, result.mateAfter)}</strong></div>
                    <div class="analyze-evidence__field analyze-evidence__loss"><span>Loss</span><strong>${result.loss.toFixed(2)}</strong></div>` : ''}
                </div>
                ${negative ? `<p class="analyze-position-note">Position shown: before ${this.escapeHtml(result.move)}.</p>` : ''}
            </div>
        `;
    },

    describeSan(san) {
        const clean = String(san || '').replace(/[+#?!]/g, '');
        const names = { K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight' };
        return `${names[clean[0]] ? `${names[clean[0]]} ` : ''}${clean}`.trim();
    },

    describeEvaluation(value, mate) {
        if (mate !== null && mate !== undefined) return `mate ${mate}`;
        if (!Number.isFinite(value)) return 'unavailable';
        return `${value >= 0 ? 'plus' : 'minus'} ${Math.abs(value).toFixed(2)}`;
    },

    buildMoveEvidenceDescription(result, recommendation) {
        const parts = [`${result.quality}.`];
        if (!['Inaccuracy', 'Mistake', 'Blunder'].includes(result.quality))
            return `${result.quality} move. ${this.describeSan(result.move)}.`;
        parts.push(`Played ${this.describeSan(result.move)}.`);
        if (recommendation) parts.push(`Engine recommends ${this.describeSan(result.bestMoveSan)}.`);
        parts.push(`Evaluation changed from ${this.describeEvaluation(result.beforePlayerEval, result.mateBefore)} to ${this.describeEvaluation(result.afterPlayerEval, result.mateAfter)}.`);
        parts.push(`Evaluation loss ${result.loss.toFixed(2)} pawns.`);
        parts.push(`The board shows the position before ${this.describeSan(result.move)}.`);
        return parts.join(' ');
    },

    updateReviewSummary() {
        if (!this.elements.reviewSummary) return;
        if (this.analysisPhase !== 'complete') {
            const states = {
                preparing: ['Preparing local engine.', 'Results will appear only after every position is evaluated.'],
                analyzing: ['Analysis in progress.', `Analyzing position ${this.analyzedPositions} of ${this.totalPositions}.`],
                failed: ['Analysis unavailable.', 'No accuracy or move-quality claims were produced. Retry when ready.'],
                cancelled: ['Analysis cancelled.', 'The completed game is preserved and no partial results are shown.']
            };
            const copy = states[this.analysisPhase] || ['Ready to analyze.', 'Start local analysis to calculate evidence-backed results.'];
            this.renderEmptyState(this.elements.reviewSummary, { icon: 'fa-chart-pie', title: copy[0], message: copy[1] });
            return;
        }
        const analyzed = this.analysisResults.filter((result) => result && !result.unavailable);
        if (analyzed.length === 0) {
            this.renderEmptyState(this.elements.reviewSummary, {
                icon: 'fa-chart-pie',
                title: 'No review yet.',
                message: 'Analyze a loaded game to see accuracy and move quality.'
            });
            return;
        }

        const white = this.buildSideReview(analyzed.filter((result) => result.moveIndex % 2 === 0));
        const black = this.buildSideReview(analyzed.filter((result) => result.moveIndex % 2 === 1));
        const qualities = ['Book', 'Acceptable', 'Inaccuracy', 'Mistake', 'Blunder'];
        const opening = this.getAnalyzeOpening();
        const trustedOpening = this.getTrustedEcoOpening(opening);

        this.elements.reviewSummary.innerHTML = `
            <div class="analyze-review-opening">
                <span>Opening</span>
                <strong>${this.escapeHtml(trustedOpening?.name || opening?.name || 'Opening not identified')}</strong>
                ${trustedOpening ? `<span class="analyze-review-opening__code">${trustedOpening.eco}</span>
                <a class="analyze-review-opening__explore" href="/eco/${trustedOpening.eco}" target="_blank" rel="noopener" aria-label="Explore ${this.escapeHtml(trustedOpening.name)} ${trustedOpening.eco} in ECO Database (opens in a new tab)">Explore in ECO Database <span aria-hidden="true">↗</span></a>` : ''}
            </div>
            <div class="analyze-accuracy-grid">
                <div class="analyze-accuracy-card"><span>White accuracy</span><strong>${this.formatAccuracy(white.accuracy)}</strong></div>
                <div class="analyze-accuracy-card"><span>Black accuracy</span><strong>${this.formatAccuracy(black.accuracy)}</strong></div>
            </div>
            <div class="analyze-quality-table">
                <div class="analyze-quality-row analyze-quality-header"><span>Quality</span><strong>White</strong><strong>Black</strong></div>
                ${qualities.map((quality) => `
                    <div class="analyze-quality-row">
                        <span class="quality-${quality.toLowerCase()}">${quality}</span>
                        <strong>${white.counts[quality]}</strong>
                        <strong>${black.counts[quality]}</strong>
                    </div>
                `).join('')}
            </div>
            <p class="analyze-accuracy-note">Accuracy estimates consistency from average evaluation loss.</p>
        `;
    },

    getAnalyzeOpening() {
        if (!this.loadedGame) return null;
        const played = this.getLoadedMoves().map((move) => this.normalizeEcoSan(move));
        let best = null;
        let bestDepth = -1;

        for (const opening of window.App?.openings || []) {
            const moves = (Array.isArray(opening.moves) ? opening.moves : String(opening.moves || '').split(/\s+/))
                .map((move) => this.normalizeEcoSan(move))
                .filter(Boolean);
            if (!moves.length || moves.length > played.length || moves.length <= bestDepth) continue;
            if (moves.every((move, index) => move === played[index])) {
                best = { name: opening.name || '', eco: opening.eco || opening.code || '' };
                bestDepth = moves.length;
            }
        }

        if (best) return best;
        if (this.loadedGame.opening || this.loadedGame.eco) {
            return { name: this.loadedGame.opening || 'ECO opening', eco: this.loadedGame.eco || '' };
        }
        return null;
    },

    getTrustedEcoOpening(opening) {
        const code = String(opening?.eco || '').toUpperCase();
        if (!/^[A-E]\d{2}$/.test(code)) return null;
        const row = (window.App?.ecoCodeRows || []).find(item =>
            String(item.eco || item.code || '').toUpperCase() === code);
        if (!row || !String(row.name || '').trim()) return null;
        if (opening?.name && String(opening.name).trim() !== String(row.name).trim()) return null;
        return { eco: code, name: String(row.name).trim() };
    },

    isRecognizedBookPly(moveIndex) {
        const played = this.getLoadedMoves().map((move) => this.normalizeEcoSan(move));
        return (window.App?.openings || []).some(opening => {
            const line = (Array.isArray(opening.moves) ? opening.moves : String(opening.moves || '').split(/\s+/))
                .map(move => this.normalizeEcoSan(move)).filter(Boolean);
            return line.length > moveIndex && line.slice(0, moveIndex + 1)
                .every((move, index) => move === played[index]);
        });
    },

    normalizeEcoSan(move) {
        return String(move || '').replace(/[+#?!]/g, '').trim();
    },

    buildSideReview(results) {
        const qualities = ['Book', 'Acceptable', 'Inaccuracy', 'Mistake', 'Blunder'];
        const counts = Object.fromEntries(qualities.map((quality) => [quality, 0]));
        if (results.length === 0) return { accuracy: null, counts };

        results.forEach((result) => {
            counts[this.getMoveQuality(result)] += 1;
        });
        const accuracy = window.CaissaAnalyzeReviewPolicy?.accuracy?.(results);
        return { accuracy: accuracy?.ok ? accuracy.value : null, counts };
    },

    formatAccuracy(accuracy) {
        return accuracy === null ? '-' : `${accuracy}%`;
    },

    getMoveQuality(result) {
        return result.quality || 'Acceptable';
    },

    updateCriticalMoments() {
        if (!this.elements.criticalMoments) return;
        if (this.analysisPhase !== 'complete') {
            this.renderEmptyState(this.elements.criticalMoments, {
                icon: 'fa-exclamation-triangle',
                title: this.analysisPhase === 'failed' ? 'Critical moments unavailable.' : 'Critical moments pending.',
                message: 'Critical moments require a successfully completed analysis.'
            });
            return;
        }
        const critical = this.analysisResults.filter((result) => result && !result.unavailable && this.isCriticalMoment(result));
        if (critical.length === 0) {
            this.renderEmptyState(this.elements.criticalMoments, {
                icon: 'fa-exclamation-triangle',
                title: 'No critical moments yet.',
                message: 'Run analysis to highlight training moments.'
            });
            return;
        }

        this.elements.criticalMoments.innerHTML = critical.map((result) => {
            const moveNumber = Math.floor(result.moveIndex / 2) + 1;
            const sideSuffix = result.moveIndex % 2 === 1 ? '...' : '';
            const label = `Jump to critical moment move ${moveNumber}${sideSuffix} ${result.move}: ${this.getCriticalMomentText(result)}`;
            return `
                <button class="analyze-critical-moment" type="button" data-index="${result.moveIndex}" aria-label="${this.escapeHtml(label)}">
                    <span class="analyze-critical-move">Move ${moveNumber}${sideSuffix} · ${this.escapeHtml(result.move)} <strong class="${this.getAnnotationClass(result.annotation)}">${result.annotation}</strong></span>
                    <span class="analyze-critical-swing">${this.getCriticalMomentText(result)}</span>
                </button>
            `;
        }).join('');

        this.elements.criticalMoments.querySelectorAll('.analyze-critical-moment').forEach((button) => {
            button.addEventListener('click', () => this.jumpToMove(Number(button.dataset.index)));
        });
    },

    isCriticalMoment(result) {
        return window.CaissaAnalyzeReviewPolicy?.critical?.(result) === true;
    },

    getCriticalMomentText(result) {
        if (result.mateSwing) return 'Decisive mate swing';
        if (result.beforePlayerEval >= 1.5 && result.afterPlayerEval < 0.5) {
            return `Missed winning chance · lost ${result.loss.toFixed(1)} pawns`;
        }
        return `Lost ${result.loss.toFixed(1)} pawns`;
    },

    flipAnalyzeBoard() {
        if (document.body?.classList?.contains('caissa-coach-guided-review-active') && window.App?.board) {
            window.flipBoard?.();
            this.boardFlipped = window.App.isFlipped === true;
            return;
        }
        this.boardFlipped = !this.boardFlipped;
        this.applyAnalyzeOrientation();
    },

    applyAnalyzeOrientation() {
        if (!this.board || typeof this.board.orientation !== 'function') return;
        this.board.orientation(this.boardFlipped ? 'black' : 'white');
        this.elements.evalBar?.classList.toggle('eval-flipped', this.boardFlipped);
        this.elements.flipBoard?.classList.toggle('active', this.boardFlipped);
        setTimeout(() => this.board?.resize?.(), 0);
    },

    updateEvaluationBar() {
        const fill = this.elements.evalFill;
        const score = this.elements.evalScore;
        if (!fill || !score) return;

        const current = this.getCurrentEvaluation();
        const evaluation = current.evaluation;
        const mate = current.mate;
        const available = Number.isFinite(evaluation) || Number.isFinite(mate);
        if (!available) {
            fill.style.height = '50%'; score.textContent = '\u2014';
            score.classList.remove('white-advantage', 'black-advantage');
            score.classList.toggle('engine-off', !this.liveEngineEnabled && !this.isAnalyzing);
            return;
        }
        const centipawns = mate !== null && mate !== undefined
            ? (mate > 0 ? 1500 : -1500)
            : evaluation * 100;
        const bounded = Math.max(-1500, Math.min(1500, centipawns));
        const whitePercent = (1 / (1 + Math.exp(-bounded / 200))) * 100;

        fill.style.height = `${whitePercent}%`;
        score.textContent = this.formatEvalBarScore(evaluation, mate);
        score.classList.toggle('white-advantage', centipawns > 75);
        score.classList.toggle('black-advantage', centipawns < -75);
        score.classList.toggle('engine-off', !this.liveEngineEnabled && !this.isAnalyzing);
    },

    getCurrentEvaluation() {
        const positionIndex = Math.max(0, this.currentMoveIndex + 1);
        if (this.liveEngineEnabled && this.livePositionAnalyses[positionIndex]) {
            const live = this.livePositionAnalyses[positionIndex];
            return { evaluation: live.eval, mate: live.mate };
        }

        const positionAnalysis = this.positionAnalyses[positionIndex];
        if (positionAnalysis) {
            return { evaluation: positionAnalysis.eval, mate: positionAnalysis.mate };
        }

        if (this.currentMoveIndex < 0) return { evaluation: null, mate: null };

        const selected = this.analysisResults[this.currentMoveIndex];
        return selected && !selected.unavailable
            ? { evaluation: selected.evalAfter, mate: selected.mateAfter }
            : { evaluation: null, mate: null };
    },

    formatEvalBarScore(evaluation, mate) {
        if (mate !== null && mate !== undefined) return mate > 0 ? `M+${mate}` : `M${mate}`;
        const value = evaluation ?? 0;
        if (Math.abs(value) < 0.05) return '0.0';
        return `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
    },

    toggleLiveEngine() {
        this.setLiveEngineEnabled(!this.liveEngineEnabled);
    },

    setLiveEngineEnabled(enabled, { silent = false } = {}) {
        this.liveEngineEnabled = !!enabled;
        this.liveEngineToken += 1;
        this.updateLiveEngineButton();

        if (!this.liveEngineEnabled) {
            clearTimeout(this.liveEngineTimer);
            this.liveEngineToken += 1;
            this.liveEngineOwner = null;
            this.liveCurrentResult = null;
            this.analysisEngine?.stop?.();
            if (this.analysisEngine) {
                this.analysisEngine.onInfo = null;
                this.analysisEngine.onBestMove = null;
            }
            this.setStatus('Engine off - study board ready', 'ready');
            this.updateEvaluationBar();
            this.updateLiveMentorPanel({ off: true });
            return;
        }

        if (!silent) this.setStatus('Engine loading...', 'loading');
        this.refreshLiveEvaluation({ immediate: true });
    },

    updateLiveEngineButton() {
        const button = this.elements.engineToggle;
        if (!button) return;
        button.classList.toggle('active', this.liveEngineEnabled);
        button.setAttribute('aria-pressed', String(this.liveEngineEnabled));
        button.setAttribute('aria-label', this.liveEngineEnabled
            ? 'Turn live engine evaluation off'
            : 'Turn live engine evaluation on');
        const label = button.querySelector('span');
        if (label) label.textContent = this.liveEngineEnabled ? 'Engine On' : 'Engine Off';
    },

    refreshLiveEvaluation({ immediate = false } = {}) {
        if (!this.liveEngineEnabled || !this.getGame() || this.isAnalyzing) return;
        clearTimeout(this.liveEngineTimer);
        const delay = immediate ? 0 : 180;
        this.liveEngineTimer = setTimeout(() => {
            this.runLiveEvaluation();
        }, delay);
    },

    async runLiveEvaluation() {
        if (!this.liveEngineEnabled || !this.getGame() || this.isAnalyzing) return;
        const token = ++this.liveEngineToken;
        const fen = this.getGame().fen();
        const positionIndex = Math.max(0, this.currentMoveIndex + 1);
        this.liveCurrentFen = fen;
        this.liveCurrentResult = null;
        delete this.livePositionAnalyses[positionIndex];
        this.liveEngineOwner = 'analyze-live';

        this.setStatus('Engine analyzing...', 'loading');
        this.updateEvaluationBar();
        this.updateLiveMentorPanel({ loading: true, fen });
        const engine = await this.ensureAnalysisEngine();
        if (!engine || token !== this.liveEngineToken || !this.liveEngineEnabled) {
            if (this.liveEngineEnabled) this.setStatus('Engine unavailable', 'error');
            return;
        }

        try {
            const result = await this.analyzePosition(fen, token, 10, 10000, {
                tokenType: 'live',
                owner: 'analyze-live'
            });
            if (token !== this.liveEngineToken || !this.liveEngineEnabled) return;
            this.livePositionAnalyses[positionIndex] = result;
            this.liveCurrentResult = result;
            this.updateEvaluationBar();
            this.updateLiveMentorPanel({ result, fen });
            this.setStatus('Evaluation ready', 'success');
        } catch (_error) {
            if (token !== this.liveEngineToken || !this.liveEngineEnabled) return;
            this.setStatus('Engine evaluation unavailable', 'warning');
            this.updateLiveMentorPanel({ unavailable: true, fen });
        }
    },

    updateLiveMentorPanel({ loading = false, result = null, unavailable = false, off = false, fen = null } = {}) {
        if (!this.elements.mentor) return;
        if (off || !this.liveEngineEnabled) {
            this.renderEmptyState(this.elements.mentor, {
                icon: 'fa-chess-board',
                title: 'Study board ready.',
                message: 'Turn Engine On for live evaluation of the current position.'
            });
            return;
        }

        const activeFen = fen || window.App?.game?.fen?.() || '';
        if (loading) {
            this.elements.mentor.innerHTML = `
                <div class="analyze-mentor-heading"><strong>Engine analyzing...</strong></div>
                <p class="analyze-mentor-copy">Stockfish is evaluating the current Study Board position.</p>
                <div class="analyze-live-fen">${this.escapeHtml(activeFen)}</div>
            `;
            return;
        }

        if (unavailable) {
            this.elements.mentor.innerHTML = `
                <div class="analyze-mentor-heading"><strong>Engine unavailable</strong></div>
                <p class="analyze-mentor-copy">Toggle Engine Off and On to retry. The Study Board remains fully interactive.</p>
            `;
            return;
        }

        const live = result || this.liveCurrentResult;
        if (!live) {
            this.elements.mentor.innerHTML = `
                <div class="analyze-mentor-heading"><strong>Engine on</strong></div>
                <p class="analyze-mentor-copy">Waiting for the current position evaluation.</p>
            `;
            return;
        }

        const bestMoveSan = this.uciToSan(activeFen, live.bestMove || live.pv?.[0]) || live.bestMove || live.pv?.[0] || '-';
        const pv = Array.isArray(live.pv) && live.pv.length ? live.pv.slice(0, 5).join(' ') : '-';
        this.elements.mentor.innerHTML = `
            <div class="analyze-mentor-heading">
                <strong>Live evaluation</strong>
                <span>${this.formatEvaluation(live.eval, live.mate)}</span>
            </div>
            <p class="analyze-mentor-copy">Stockfish is evaluating this position only. It will not move pieces or start a game.</p>
            <div class="analyze-eval-grid">
                <div class="analyze-eval-item">Best move<strong>${this.escapeHtml(bestMoveSan)}</strong></div>
                <div class="analyze-eval-item">Depth<strong>${Number(live.depth || 0)}</strong></div>
                <div class="analyze-eval-item">PV<strong>${this.escapeHtml(pv)}</strong></div>
            </div>
        `;
    },

    /**
     * Start Stockfish analysis
     */
    async startAnalysis() {
        if (this.isAnalyzing || ['preparing', 'analyzing'].includes(this.analysisPhase)) return;
        if (!this.loadedGame) {
            this.showNotification('Load a game before starting analysis.', 'error');
            return;
        }

        if (this.liveEngineEnabled) {
            this.setLiveEngineEnabled(false, { silent: true });
        }

        console.log('[Analyze] Starting analysis...');
        this.analysisPhase = 'preparing'; this.analyzedPositions = 0; this.totalPositions = 0;
        this.updateReviewSummary(); this.updateCriticalMoments();
        this.setStatus('Preparing local engine', 'loading');
        window.CaissaUI?.setButtonLoading(this.elements.startBtn, true, { label: 'Loading engine...' });
        const engine = await this.ensureAnalysisEngine();
        if (!engine) {
            this.analysisPhase = 'failed'; this.setStatus('Analysis unavailable', 'error');
            this.updateReviewSummary(); this.updateCriticalMoments();
            window.CaissaUI?.setButtonLoading(this.elements.startBtn, false);
            this.elements.startBtn.lastChild.textContent = ' Retry analysis';
            this.showNotification('Analysis engine could not start. Try again.', 'error');
            return;
        }

        this.isAnalyzing = true;
        const token = ++this.analysisToken;
        this.analysisResults = [];
        this.positionAnalyses = [];
        this.updateMoveList();
        this.updateMentorPanel();
        this.updateEvaluationBar();
        this.updateReviewSummary();
        this.updateCriticalMoments();

        // Update UI
        this.elements.startBtn.style.display = 'none';
        this.elements.stopBtn.style.display = 'block';
        this.elements.progressBar.style.display = 'block';
        this.setStatus('Preparing analysis...', 'loading');

        const moves = this.getLoadedMoves({ verbose: true });
        const totalMoves = moves.length;
        this.totalPositions = totalMoves + 1;
        if (totalMoves === 0) {
            this.isAnalyzing = false;
            this.analysisPhase = 'failed';
            this.setStatus('No moves to analyze', 'warning');
            this.elements.startBtn.style.display = 'block';
            this.elements.stopBtn.style.display = 'none';
            this.elements.progressBar.style.display = 'none';
            window.CaissaUI?.setButtonLoading(this.elements.startBtn, false);
            this.updateReviewSummary(); this.updateCriticalMoments();
            this.teardownAnalysisEngine('empty-game');
            return;
        }

        try {
            const tempGame = this.loadedGame.initialFen
                ? new Chess(this.loadedGame.initialFen)
                : new Chess();
            const positions = [tempGame.fen()];
            moves.forEach((move) => {
                tempGame.move(move.san);
                positions.push(tempGame.fen());
            });

            const positionAnalyses = [];
            let skippedPositions = 0;
            for (let i = 0; i < positions.length && this.isAnalyzing && token === this.analysisToken; i++) {
                const progress = Math.round((i / totalMoves) * 100);
                this.analysisPhase = 'analyzing'; this.analyzedPositions = i;
                this.updateProgress(progress, `Analyzing position ${i + 1}/${positions.length}`);
                const analysis = await this.analyzePositionWithRetry(positions[i], token);
                positionAnalyses.push(analysis);
                this.positionAnalyses[i] = analysis;
                if (!analysis) skippedPositions += 1;

                if (i > 0) {
                    this.analysisResults[i - 1] = positionAnalyses[i - 1] && positionAnalyses[i]
                        ? this.buildMoveAnalysis(i - 1, moves[i - 1], positions[i - 1], positions[i], positionAnalyses[i - 1], positionAnalyses[i])
                        : this.buildUnavailableMoveAnalysis(i - 1, moves[i - 1]);
                }
            }

            if (this.isAnalyzing && token === this.analysisToken) {
                this.updateProgress(100, `Analyzed ${totalMoves} moves`);
                const analyzedPositions = positions.length - skippedPositions;
                this.analyzedPositions = analyzedPositions;
                if (analyzedPositions === positions.length) {
                    this.analysisPhase = 'complete';
                    this.updateMoveList(); this.updateMentorPanel(); this.updateEvaluationBar();
                    this.updateReviewSummary(); this.updateCriticalMoments();
                    this.setAnalysisCompletionStatus(analyzedPositions, positions.length);
                } else {
                    this.analysisPhase = 'failed'; this.analysisResults = []; this.positionAnalyses = [];
                    this.updateMoveList(); this.updateReviewSummary(); this.updateCriticalMoments();
                    this.setStatus(`Analysis unavailable Â· ${analyzedPositions}/${positions.length} positions evaluated`, 'error');
                    this.elements.startBtn.lastChild.textContent = ' Retry analysis';
                }
            }

        } catch (error) {
            console.error('[Analyze] Analysis error:', error);
            this.analysisPhase = 'failed'; this.analysisResults = []; this.positionAnalyses = [];
            this.updateMoveList(); this.updateReviewSummary(); this.updateCriticalMoments();
            this.setStatus('Analysis unavailable. Try again.', 'error');
            this.elements.startBtn.lastChild.textContent = ' Retry analysis';
        } finally {
            this.isAnalyzing = false;
            this.elements.startBtn.style.display = 'block';
            this.elements.stopBtn.style.display = 'none';
            this.elements.progressBar.style.display = 'none';
            window.CaissaUI?.setButtonLoading(this.elements.startBtn, false);
            if (this.analysisPhase === 'failed') this.elements.startBtn.lastChild.textContent = ' Retry analysis';
            this.teardownAnalysisEngine('analysis-finished');
        }
    },

    buildMoveAnalysis(moveIndex, move, fenBefore, fenAfter, before, after) {
        const playedUci = `${move.from}${move.to}${move.promotion || ''}`;
        const bestMove = before.bestMove || before.pv?.[0] || null;
        const bestMoveSan = this.uciToSan(fenBefore, bestMove);
        const isBestMove = !!bestMove && playedUci.toLowerCase() === bestMove.toLowerCase();
        const beforePlayerEval = this.playerPerspectiveEval(before, move.color);
        const afterPlayerEval = this.playerPerspectiveEval(after, move.color);
        const playV2Review = !!window.CaissaPlayV2ProductBoundary;
        const samplesComparable = !playV2Review || Number.isFinite(beforePlayerEval) && Number.isFinite(afterPlayerEval)
            && before.completed === true && after.completed === true
            && before.requestedDepth === after.requestedDepth
            && before.depth >= before.requestedDepth && after.depth >= after.requestedDepth;
        if (!samplesComparable) return this.buildUnavailableMoveAnalysis(moveIndex, move, 'EVALUATION_NOT_COMPARABLE');
        const loss = isBestMove ? 0 : Math.max(0, beforePlayerEval - afterPlayerEval);
        const gain = afterPlayerEval - beforePlayerEval;
        const mateSwing = this.hasMateSwing(before, after, move.color);
        const bookEvidence = playV2Review ? window.CaissaAnalyzeOpeningEvidence?.lookup?.({
            ply: moveIndex + 1, playedSan: move.san, playedUci, legal: true, fenAfter,
            positionMap: window.App?.ecoPositionMap, lookupComplete: !!window.App?.ecoPositionMap,
            recordId: this.loadedGame?.recordId || this.activeHandoffId || null,
            generation: this.analysisToken, stale: !this.isAnalyzing
        }) : null;
        const classification = this.classifyMove(loss, mateSwing, bookEvidence, moveIndex);

        return {
            moveIndex,
            move: move.san,
            fenBefore,
            fenAfter,
            playedUci,
            bestMove,
            bestMoveSan,
            recommendationAvailable: !!bestMoveSan && !!(this.loadedGame?.recordId || this.activeHandoffId)
                && before.depth > 0 && this.isAnalyzing,
            bestMoveEval: before.eval,
            recordId: this.loadedGame?.recordId || this.activeHandoffId || null,
            ply: moveIndex + 1,
            generation: this.analysisToken,
            depth: before.depth || 0,
            isBestMove,
            evalBefore: before.eval,
            evalAfter: after.eval,
            mateBefore: before.mate,
            mateAfter: after.mate,
            loss,
            gain,
            mateSwing,
            beforePlayerEval,
            afterPlayerEval,
            quality: classification.quality,
            accuracyIncluded: classification.accuracyIncluded !== false,
            book: classification.quality === 'Book',
            bookEvidence: classification.quality === 'Book' ? bookEvidence : null,
            annotation: classification.annotation,
            label: classification.label,
            mentorText: this.buildMentorText(classification, loss)
        };
    },

    buildUnavailableMoveAnalysis(moveIndex, move, reasonCode = 'POSITION_ANALYSIS_UNAVAILABLE') {
        return {
            moveIndex,
            move: move.san,
            unavailable: true,
            reasonCode,
            annotation: '-',
            label: 'Analysis unavailable'
        };
    },

    playerPerspectiveEval(analysis, color) {
        if (analysis.mate !== null && analysis.mate !== undefined) {
            const mateValue = analysis.mate > 0 ? 100 : -100;
            return color === 'w' ? mateValue : -mateValue;
        }
        const evaluation = analysis.eval;
        if (!Number.isFinite(evaluation)) return null;
        return color === 'w' ? evaluation : -evaluation;
    },

    hasMateSwing(before, after, color) {
        const beforeMate = before.mate;
        const afterMate = after.mate;
        const beforeForPlayer = beforeMate === null || beforeMate === undefined
            ? null
            : (color === 'w' ? beforeMate : -beforeMate);
        const afterForPlayer = afterMate === null || afterMate === undefined
            ? null
            : (color === 'w' ? afterMate : -afterMate);
        const allowedLosingMate = afterForPlayer !== null
            && afterForPlayer < 0
            && (beforeForPlayer === null || beforeForPlayer >= 0);
        const lostWinningMate = beforeForPlayer !== null
            && beforeForPlayer > 0
            && (afterForPlayer === null || afterForPlayer <= 0);
        return allowedLosingMate || lostWinningMate;
    },

    classifyMove(loss, mateSwing = false, bookEvidence = null, moveIndex = -1) {
        const input = window.CaissaPlayV2ProductBoundary
            ? { loss, mateSwing, bookEvidence }
            : { loss, mateSwing, book: this.isRecognizedBookPly(moveIndex) };
        const classified = window.CaissaAnalyzeReviewPolicy?.classify?.(input);
        if (!classified?.ok) return { annotation: '-', label: 'Analysis unavailable' };
        return { ...classified, label: `${classified.quality} move` };
    },

    buildMentorText(classification, loss) {
        if (classification.quality === 'Blunder') return `Blunder. The evaluation loss was ${loss.toFixed(2)} pawns.`;
        if (classification.quality === 'Mistake') return `Mistake. The evaluation loss was ${loss.toFixed(2)} pawns.`;
        if (classification.quality === 'Inaccuracy') return `Inaccuracy. The evaluation loss was ${loss.toFixed(2)} pawns.`;
        if (classification.quality === 'Book') return 'Book move from a repository-recognized opening line.';
        return 'Acceptable move. No meaningful negative threshold was crossed.';
    },

    setAnalysisCompletionStatus(analyzedPositions, totalPositions) {
        const ratio = totalPositions > 0 ? analyzedPositions / totalPositions : 0;
        if (ratio >= 0.9) {
            this.setStatus(`Analysis complete · ${analyzedPositions}/${totalPositions} positions analyzed`, 'success');
            console.log(`[Analyze] Analysis complete; ${analyzedPositions}/${totalPositions} positions analyzed`);
        } else if (ratio >= 0.5) {
            this.setStatus(`Partial analysis complete · ${analyzedPositions}/${totalPositions} positions analyzed`, 'warning');
            console.warn(`[Analyze] Partial analysis complete; ${analyzedPositions}/${totalPositions} positions analyzed`);
        } else {
            this.setStatus(`Analysis failed · only ${analyzedPositions}/${totalPositions} positions analyzed`, 'error');
            console.error(`[Analyze] Analysis failed; only ${analyzedPositions}/${totalPositions} positions analyzed`);
        }
    },

    getAnnotationClass(annotation) {
        const classes = {
            '!!': 'annotation-brilliant',
            '!': 'annotation-good',
            '!?': 'annotation-interesting',
            '?!': 'annotation-dubious',
            '?': 'annotation-mistake',
            '??': 'annotation-blunder',
            '-': 'annotation-unavailable'
        };
        return classes[annotation] || '';
    },

    uciToSan(fen, uci) {
        if (!uci || !/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(uci)) return null;
        try {
            const game = new Chess(fen);
            const move = game.move({
                from: uci.slice(0, 2),
                to: uci.slice(2, 4),
                promotion: uci.slice(4, 5) || undefined
            });
            return move?.san || null;
        } catch (_error) {
            return null;
        }
    },

    formatEvaluation(evaluation, mate) {
        if (mate !== null && mate !== undefined) return `Mate ${mate}`;
        if (evaluation === null || evaluation === undefined) return '-';
        return `${evaluation >= 0 ? '+' : ''}${evaluation.toFixed(2)}`;
    },

    /**
     * Stop ongoing analysis
     */
    stopAnalysis() {
        console.log('[Analyze] Stopping analysis...');
        this.isAnalyzing = false;
        this.analysisToken += 1;
        this.analysisPhase = 'cancelled'; this.analysisResults = []; this.positionAnalyses = [];
        this.teardownAnalysisEngine('analysis-cancelled');
        this.updateMoveList(); this.updateReviewSummary(); this.updateCriticalMoments();
        this.setStatus('Analysis cancelled', 'warning');
    },

    teardownAnalysisEngine(reason = 'owner-exit') {
        if (!this.analysisEngine) return;
        this.analysisEngine.onInfo = null; this.analysisEngine.onBestMove = null;
        this.analysisEngine.stop?.(); this.analysisEngine.terminate?.(reason);
        this.analysisEngine = null; this.liveEngineOwner = null;
    },

    /**
     * Analyze single position with Stockfish
     */
    async ensureAnalysisEngine() {
        if (this.analysisEngine?.isReady?.()) return this.analysisEngine;
        if (!this.analysisEngine && window.EngineRegistry?.createEngine) {
            this.analysisEngine = EngineRegistry.createEngine('stockfish', {
                autoStart: false, owner: 'play-v2-postgame-analyze', handshakeTimeoutMs: 4000, searchTimeoutMs: 12000
            });
        }
        if (!this.analysisEngine) return null;
        try { await this.analysisEngine.start?.(); }
        catch (_) { this.teardownAnalysisEngine('handshake-failed'); return null; }
        return this.analysisEngine?.isReady?.() ? this.analysisEngine : null;
    },

    async analyzePositionWithRetry(fen, token) {
        try {
            return await this.analyzePosition(fen, token, 12, 12000, { tokenType: 'review', owner: 'analyze-review' });
        } catch (error) {
            if (token !== this.analysisToken || !this.isAnalyzing) return null;
            console.warn('[Analyze] Position analysis timed out; retrying at lower depth');
            try {
                return await this.analyzePosition(fen, token, 8, 12000, { tokenType: 'review', owner: 'analyze-review' });
            } catch (_retryError) {
                console.warn('[Analyze] Position analysis unavailable after retry');
                return null;
            }
        }
    },

    isAnalyzeTokenActive(token, tokenType = 'review') {
        if (tokenType === 'live') {
            return this.liveEngineEnabled
                && !this.isAnalyzing
                && token === this.liveEngineToken
                && this.isAnalyzeActive();
        }
        return this.isAnalyzing && token === this.analysisToken && this.isAnalyzeActive();
    },

    analyzePosition(fen, token, depth = 12, timeoutMs = 12000, options = {}) {
        return new Promise((resolve, reject) => {
            const engine = this.analysisEngine;
            if (!engine?.isReady?.()) {
                reject(new Error('Stockfish engine is not ready'));
                return;
            }

            const tokenType = options.tokenType || 'review';
            const owner = options.owner || (tokenType === 'live' ? 'analyze-live' : 'analyze-review');
            let latestInfo = null;
            const finish = (result) => {
                clearTimeout(timeout);
                if (this.liveEngineOwner === owner || tokenType === 'review') {
                    engine.onInfo = null;
                    engine.onBestMove = null;
                    if (this.liveEngineOwner === owner) this.liveEngineOwner = null;
                }
                resolve(result);
            };
            const timeout = setTimeout(() => {
                engine.stop();
                if (this.liveEngineOwner === owner || tokenType === 'review') {
                    engine.onInfo = null;
                    engine.onBestMove = null;
                    if (this.liveEngineOwner === owner) this.liveEngineOwner = null;
                }
                reject(new Error('Stockfish analysis timed out'));
            }, timeoutMs);

            engine.stop?.();
            this.liveEngineOwner = owner;
            engine.onInfo = (info) => {
                if (!this.isAnalyzeTokenActive(token, tokenType)) return;
                latestInfo = info;
                if (tokenType === 'live') {
                    const positionIndex = Math.max(0, this.currentMoveIndex + 1);
                    const interim = {
                        eval: info.score ?? null,
                        mate: info.mate ?? null,
                        bestMove: info.pv?.[0] || null,
                        depth: info.depth ?? 0,
                        pv: info.pv ?? []
                    };
                    this.livePositionAnalyses[positionIndex] = interim;
                    this.liveCurrentResult = interim;
                    this.updateEvaluationBar();
                    this.updateLiveMentorPanel({ result: interim, fen });
                }
            };
            engine.getBestMove(fen, (bestMove) => {
                if (!this.isAnalyzeTokenActive(token, tokenType)) {
                    clearTimeout(timeout); engine.onInfo = null; engine.onBestMove = null;
                    reject(new Error('Stale analysis result rejected'));
                    return;
                }
                const score = latestInfo?.score;
                const mate = latestInfo?.mate;
                if (!Number.isFinite(score) && !Number.isFinite(mate)) {
                    clearTimeout(timeout); engine.onInfo = null; engine.onBestMove = null;
                    reject(new Error('Stockfish returned no attributable evaluation'));
                    return;
                }
                finish({
                    eval: Number.isFinite(score) ? score : null,
                    mate: Number.isFinite(mate) ? mate : null,
                    bestMove,
                    depth: latestInfo?.depth ?? 0,
                    requestedDepth: depth,
                    completed: (latestInfo?.depth ?? 0) >= depth,
                    pv: latestInfo?.pv ?? []
                });
            }, { depth });
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
        this.elements.status.setAttribute('role', 'status');
        this.elements.status.setAttribute('aria-live', 'polite');
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
    onEnter(options = {}) {
        console.log('[Analyze] Section entered');
        window.CaissaClockService?.stop('analyze-enter');
        this.analysisPhase = 'idle'; this.analyzedPositions = 0; this.analysisResults = []; this.positionAnalyses = [];
        const requestedToken = new URLSearchParams(window.location.search).get('handoff');
        const handoff = options.handoff ? { ok: true, value: options.handoff }
            : window.CaissaAnalyzeHandoff?.resolve?.(requestedToken);
        if (handoff?.ok && handoff.value?.handoffId !== this.activeHandoffId) {
            this.activeHandoffId = handoff.value.handoffId;
            const payload = handoff.value.payload;
            if (payload.pgn) {
                this.loadGameFromPgn(payload.pgn, 'Play handoff', {
                    white: payload.whiteLabel || 'White', black: payload.blackLabel || 'Black',
                    result: payload.result || '*', termination: payload.termination || null,
                    recordId: payload.recordId
                });
            } else if (payload.finalFen) {
                const session = window.CaissaAnalyzeSession?.createSession?.({ initialFen: payload.finalFen });
                const game = session?.game;
                if (game) {
                    this.session = session;
                    this.loadedGame = {
                        pgn: '', game, initialFen: payload.finalFen, source: 'Play position',
                        white: 'White', black: 'Black', result: payload.result || '*',
                        event: '', date: '', eco: '', opening: '', movesSan: [], movesVerbose: []
                    };
                    this.currentMoveIndex = -1;
                }
            }
            this.boardFlipped = payload.boardOrientation === 'black';
        }
        this.analysisPhase = 'idle'; this.analyzedPositions = 0;
        this.totalPositions = this.getLoadedMoves().length + 1;
        this.analysisResults = []; this.positionAnalyses = [];
        this.updateReviewSummary(); this.updateCriticalMoments(); this.updateEvaluationBar();
        this.updateLiveEngineButton();
        if (!this.loadedGame) {
            this.resetStudyBoard({ silent: true });
        } else {
            this.ensureStudyBoard();
        }
        setTimeout(() => {
            this.ensureAnalyzeBoard();
            this.ensureStudyBoard();
            this.applyAnalyzeOrientation();
            this.board?.resize?.();
            if (this.liveEngineEnabled) {
                this.refreshLiveEvaluation({ immediate: true });
            }
        }, 0);
    },

    /**
     * Section lifecycle: Exit
     */
    onExit() {
        if (document.body?.classList?.contains('caissa-coach-review-summary-active')
            || document.body?.classList?.contains('caissa-bots-guided-review-active')) {
            window.App?.restorePlayBoardAfterCoachReview?.();
        }
        if (this.liveEngineEnabled) {
            clearTimeout(this.liveEngineTimer);
            this.liveEngineToken += 1;
            this.analysisEngine?.stop?.();
            if (this.analysisEngine) {
                this.analysisEngine.onInfo = null;
                this.analysisEngine.onBestMove = null;
            }
            this.liveEngineOwner = null;
        }
        // Stop analysis if running
        if (this.isAnalyzing) {
            this.stopAnalysis();
        }
        this.teardownAnalysisEngine('analyze-exit');
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
    .move-white.active, .move-black.active {
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
