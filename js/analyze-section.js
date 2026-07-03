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
    fetchedGames: [],
    selectedFetchedGameIndex: -1,
    currentMoveIndex: -1,
    isAnalyzing: false,
    analysisResults: [],
    positionAnalyses: [],
    analysisEngine: null,
    analysisToken: 0,
    keyboardHandler: null,
    boardFlipped: false,

    // DOM cache
    elements: {},

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
            status: document.getElementById('analyzeStatus'),

            // Analysis controls
            startBtn: document.getElementById('analyzeStartBtn'),
            stopBtn: document.getElementById('analyzeStopBtn'),
            progressBar: document.getElementById('analyzeProgressBar'),
            progressFill: document.getElementById('analyzeProgressFill'),
            progressText: document.getElementById('analyzeProgressText'),
            mentor: document.getElementById('analyzeMentor'),
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
            this.jumpToMove((this.loadedGame?.game.history().length || 0) - 1);
        });
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

        const lastMoveIndex = this.loadedGame.game.history().length - 1;
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
        this.setStatus('Fetching games...', 'loading');
        if (this.elements.fetchBtn) {
            this.elements.fetchBtn.disabled = true;
        }

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
            this.setStatus('Fetch failed', 'error');
            const providerName = provider === 'lichess' ? 'Lichess' : 'Chess.com';
            this.showNotification(
                `Could not fetch games from ${providerName}. Please try again or upload PGN manually.`,
                'error'
            );
        } finally {
            if (this.elements.fetchBtn) {
                this.elements.fetchBtn.disabled = false;
            }
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
                initialFen: headers.SetUp === '1' && headers.FEN ? headers.FEN : null,
                source: source,
                white: metadata.white || headers.White || 'Unknown',
                black: metadata.black || headers.Black || 'Unknown',
                result: metadata.result || headers.Result || '*',
                event: headers.Event || '',
                date: headers.Date || '',
                eco: metadata.eco || headers.ECO || '',
                opening: metadata.opening || headers.Opening || ''
            };
            this.currentMoveIndex = this.loadedGame.game.history().length - 1;
            this.analysisResults = [];
            this.positionAnalyses = [];
            this.updateReviewSummary();
            this.updateCriticalMoments();

            // Update metadata display
            this.updateMetadata();

            // Load into main board via App
            if (window.App) {
                App.game.load_pgn(pgn);
                this.updateBoardAndUI();
            }

            // Update move list
            this.updateMoveList();
            this.updateNavigationControls();
            this.updateMentorPanel();
            this.updateEvaluationBar();

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
            const whiteAnnotation = this.analysisResults[i]?.annotation || '';
            const blackAnnotation = this.analysisResults[i + 1]?.annotation || '';
            const whiteAnnotationClass = this.getAnnotationClass(whiteAnnotation);
            const blackAnnotationClass = this.getAnnotationClass(blackAnnotation);

            html += `
                <div class="move-row">
                    <span class="move-num">${moveNum}.</span>
                    <span class="move-white${i === this.currentMoveIndex ? ' active' : ''}" data-index="${i}">${whiteMove}${whiteAnnotation ? `<strong class="analyze-move-annotation ${whiteAnnotationClass}">${whiteAnnotation}</strong>` : ''}</span>
                    <span class="move-black${i + 1 === this.currentMoveIndex ? ' active' : ''}" data-index="${i + 1}">${blackMove}${blackAnnotation ? `<strong class="analyze-move-annotation ${blackAnnotationClass}">${blackAnnotation}</strong>` : ''}</span>
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
        const moves = this.loadedGame.game.history();
        const safeIndex = Math.max(-1, Math.min(index, moves.length - 1));

        // Reset to the game's actual starting position.
        if (this.loadedGame.initialFen) {
            App.game.load(this.loadedGame.initialFen);
        } else {
            App.game.reset();
        }

        // Replay moves up to index
        for (let i = 0; i <= safeIndex && i < moves.length; i++) {
            App.game.move(moves[i]);
        }

        this.currentMoveIndex = safeIndex;
        this.updateBoardAndUI();
        this.updateMoveList();
        this.updateNavigationControls();
        this.updateMentorPanel();
        this.updateEvaluationBar();

        console.log('[Analyze] Jumped to move:', safeIndex + 1);
    },

    updateBoardAndUI() {
        if (!window.App || !App.game) return;
        if (App.board && typeof App.board.position === 'function') {
            App.board.position(App.game.fen());
        }
        if (typeof App.updateUI === 'function') {
            App.updateUI();
        }
    },

    updateNavigationControls() {
        const moveCount = this.loadedGame?.game.history().length || 0;
        const atStart = this.currentMoveIndex < 0;
        const atEnd = moveCount === 0 || this.currentMoveIndex >= moveCount - 1;
        if (this.elements.navFirst) this.elements.navFirst.disabled = atStart || moveCount === 0;
        if (this.elements.navPrev) this.elements.navPrev.disabled = atStart || moveCount === 0;
        if (this.elements.navNext) this.elements.navNext.disabled = atEnd;
        if (this.elements.navLast) this.elements.navLast.disabled = atEnd;
    },

    updateMentorPanel() {
        if (!this.elements.mentor) return;
        if (this.currentMoveIndex < 0) {
            this.elements.mentor.innerHTML = '<p class="empty-state">Starting position. Select a move to see guidance.</p>';
            return;
        }

        const result = this.analysisResults[this.currentMoveIndex];
        const move = this.loadedGame?.game.history()[this.currentMoveIndex] || '';
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

        this.elements.mentor.innerHTML = `
            <div class="analyze-mentor-heading">
                <strong>${this.escapeHtml(move)}</strong>
                <span class="analyze-annotation ${this.getAnnotationClass(result.annotation)}">${result.annotation}</span>
                <span>${this.escapeHtml(result.label)}</span>
            </div>
            <p class="analyze-mentor-copy">${this.escapeHtml(result.mentorText)}</p>
            <div class="analyze-eval-grid">
                <div class="analyze-eval-item">Before<strong>${this.formatEvaluation(result.evalBefore, result.mateBefore)}</strong></div>
                <div class="analyze-eval-item">After<strong>${this.formatEvaluation(result.evalAfter, result.mateAfter)}</strong></div>
                <div class="analyze-eval-item">Eval loss<strong>${result.loss.toFixed(2)}</strong></div>
                <div class="analyze-eval-item">Engine preferred<strong>${this.escapeHtml(result.bestMoveSan || result.bestMove || 'Played move')}</strong></div>
            </div>
        `;
    },

    updateReviewSummary() {
        if (!this.elements.reviewSummary) return;
        const analyzed = this.analysisResults.filter((result) => result && !result.unavailable);
        if (analyzed.length === 0) {
            this.elements.reviewSummary.innerHTML = '<p class="empty-state">Analyze the game to see accuracy and move quality.</p>';
            return;
        }

        const white = this.buildSideReview(analyzed.filter((result) => result.moveIndex % 2 === 0));
        const black = this.buildSideReview(analyzed.filter((result) => result.moveIndex % 2 === 1));
        const qualities = ['Brilliant', 'Great', 'Best', 'Good', 'Interesting', 'Dubious', 'Mistake', 'Blunder'];
        const opening = this.getAnalyzeOpening();

        this.elements.reviewSummary.innerHTML = `
            <div class="analyze-review-opening">
                <span>Opening</span>
                <strong>${this.escapeHtml(opening?.name || 'Opening not identified')}</strong>
                ${opening?.eco ? `<a href="/eco/${this.escapeHtml(opening.eco)}">${this.escapeHtml(opening.eco)}</a>` : ''}
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
        const played = this.loadedGame.game.history().map((move) => this.normalizeEcoSan(move));
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

    normalizeEcoSan(move) {
        return String(move || '').replace(/[+#?!]/g, '').trim();
    },

    buildSideReview(results) {
        const qualities = ['Brilliant', 'Great', 'Best', 'Good', 'Interesting', 'Dubious', 'Mistake', 'Blunder'];
        const counts = Object.fromEntries(qualities.map((quality) => [quality, 0]));
        if (results.length === 0) return { accuracy: null, counts };

        let accuracyTotal = 0;
        results.forEach((result) => {
            counts[this.getMoveQuality(result)] += 1;
            // Consistent, explainable estimate: each pawn of eval loss reduces move accuracy exponentially.
            accuracyTotal += 100 * Math.exp(-0.55 * Math.max(0, result.loss || 0));
        });
        return { accuracy: (accuracyTotal / results.length).toFixed(1), counts };
    },

    formatAccuracy(accuracy) {
        return accuracy === null ? '-' : `${accuracy}%`;
    },

    getMoveQuality(result) {
        if (result.annotation === '!!') return 'Brilliant';
        if (result.annotation === '!?') return 'Interesting';
        if (result.annotation === '?!') return 'Dubious';
        if (result.annotation === '?') return 'Mistake';
        if (result.annotation === '??') return 'Blunder';
        if (result.annotation === '!') {
            if (result.isBestMove && result.gain >= 0.5) return 'Great';
            if (result.isBestMove) return 'Best';
            return 'Good';
        }
        return 'Good';
    },

    updateCriticalMoments() {
        if (!this.elements.criticalMoments) return;
        const critical = this.analysisResults.filter((result) => result && !result.unavailable && this.isCriticalMoment(result));
        if (critical.length === 0) {
            this.elements.criticalMoments.innerHTML = '<p class="empty-state">No critical moments identified yet.</p>';
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
        return result.annotation === '?'
            || result.annotation === '??'
            || result.mateSwing
            || result.loss >= 1.5
            || (result.beforePlayerEval >= 1.5 && result.afterPlayerEval < 0.5);
    },

    getCriticalMomentText(result) {
        if (result.mateSwing) return 'Decisive mate swing';
        if (result.beforePlayerEval >= 1.5 && result.afterPlayerEval < 0.5) {
            return `Missed winning chance · lost ${result.loss.toFixed(1)} pawns`;
        }
        return `Lost ${result.loss.toFixed(1)} pawns`;
    },

    flipAnalyzeBoard() {
        this.boardFlipped = !this.boardFlipped;
        this.applyAnalyzeOrientation();
    },

    applyAnalyzeOrientation() {
        if (!window.App?.board || typeof App.board.orientation !== 'function') return;
        App.board.orientation(this.boardFlipped ? 'black' : 'white');
        this.elements.evalBar?.classList.toggle('eval-flipped', this.boardFlipped);
        this.elements.flipBoard?.classList.toggle('active', this.boardFlipped);
        setTimeout(() => App.board?.resize?.(), 0);
    },

    updateEvaluationBar() {
        const fill = this.elements.evalFill;
        const score = this.elements.evalScore;
        if (!fill || !score) return;

        const current = this.getCurrentEvaluation();
        const evaluation = current.evaluation ?? 0;
        const mate = current.mate;
        const centipawns = mate !== null && mate !== undefined
            ? (mate > 0 ? 1500 : -1500)
            : evaluation * 100;
        const bounded = Math.max(-1500, Math.min(1500, centipawns));
        const whitePercent = (1 / (1 + Math.exp(-bounded / 200))) * 100;

        fill.style.height = `${whitePercent}%`;
        score.textContent = this.formatEvalBarScore(evaluation, mate);
        score.classList.toggle('white-advantage', centipawns > 75);
        score.classList.toggle('black-advantage', centipawns < -75);
    },

    getCurrentEvaluation() {
        if (this.currentMoveIndex < 0) {
            return { evaluation: 0, mate: null };
        }

        const positionAnalysis = this.positionAnalyses[this.currentMoveIndex + 1];
        if (positionAnalysis) {
            return { evaluation: positionAnalysis.eval, mate: positionAnalysis.mate };
        }

        const selected = this.analysisResults[this.currentMoveIndex];
        return selected && !selected.unavailable
            ? { evaluation: selected.evalAfter, mate: selected.mateAfter }
            : { evaluation: 0, mate: null };
    },

    formatEvalBarScore(evaluation, mate) {
        if (mate !== null && mate !== undefined) return mate > 0 ? `M+${mate}` : `M${mate}`;
        const value = evaluation ?? 0;
        if (Math.abs(value) < 0.05) return '0.0';
        return `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
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
        this.setStatus('Engine loading...', 'loading');
        const engine = await this.ensureAnalysisEngine();
        if (!engine) {
            this.setStatus('Engine unavailable', 'error');
            this.showNotification('Stockfish could not be loaded. Please try again.', 'error');
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
        this.setStatus('Analyzing...', 'loading');

        const moves = this.loadedGame.game.history({ verbose: true });
        const totalMoves = moves.length;
        if (totalMoves === 0) {
            this.isAnalyzing = false;
            this.setStatus('No moves to analyze', 'warning');
            this.elements.startBtn.style.display = 'block';
            this.elements.stopBtn.style.display = 'none';
            this.elements.progressBar.style.display = 'none';
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
                this.updateProgress(progress, `Analyzing position ${i + 1}/${positions.length}`);
                const analysis = await this.analyzePositionWithRetry(positions[i], token);
                positionAnalyses.push(analysis);
                this.positionAnalyses[i] = analysis;
                if (!analysis) skippedPositions += 1;

                if (i > 0) {
                    this.analysisResults[i - 1] = positionAnalyses[i - 1] && positionAnalyses[i]
                        ? this.buildMoveAnalysis(i - 1, moves[i - 1], positions[i - 1], positionAnalyses[i - 1], positionAnalyses[i])
                        : this.buildUnavailableMoveAnalysis(i - 1, moves[i - 1]);
                    this.updateMoveList();
                    this.updateReviewSummary();
                    this.updateCriticalMoments();
                    if (this.currentMoveIndex === i - 1) {
                        this.updateMentorPanel();
                        this.updateEvaluationBar();
                    }
                }
            }

            if (this.isAnalyzing && token === this.analysisToken) {
                this.updateProgress(100, `Analyzed ${totalMoves} moves`);
                this.updateMoveList();
                this.updateMentorPanel();
                this.updateEvaluationBar();
                this.updateReviewSummary();
                this.updateCriticalMoments();
                const analyzedPositions = positions.length - skippedPositions;
                this.setAnalysisCompletionStatus(analyzedPositions, positions.length);
            }

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

    buildMoveAnalysis(moveIndex, move, fenBefore, before, after) {
        const playedUci = `${move.from}${move.to}${move.promotion || ''}`;
        const bestMove = before.bestMove || before.pv?.[0] || null;
        const bestMoveSan = this.uciToSan(fenBefore, bestMove);
        const isBestMove = !!bestMove && playedUci.toLowerCase() === bestMove.toLowerCase();
        const beforePlayerEval = this.playerPerspectiveEval(before, move.color);
        const afterPlayerEval = this.playerPerspectiveEval(after, move.color);
        const loss = isBestMove ? 0 : Math.max(0, beforePlayerEval - afterPlayerEval);
        const gain = afterPlayerEval - beforePlayerEval;
        const mateSwing = this.hasMateSwing(before, after, move.color);
        const classification = this.classifyMove(loss, gain, isBestMove, moveIndex, mateSwing, move.san);

        return {
            moveIndex,
            move: move.san,
            playedUci,
            bestMove,
            bestMoveSan,
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
            annotation: classification.annotation,
            label: classification.label,
            mentorText: this.buildMentorText(classification, loss, bestMoveSan, isBestMove)
        };
    },

    buildUnavailableMoveAnalysis(moveIndex, move) {
        return {
            moveIndex,
            move: move.san,
            unavailable: true,
            annotation: '-',
            label: 'Analysis unavailable'
        };
    },

    playerPerspectiveEval(analysis, color) {
        if (analysis.mate !== null && analysis.mate !== undefined) {
            const mateValue = analysis.mate > 0 ? 100 : -100;
            return color === 'w' ? mateValue : -mateValue;
        }
        const evaluation = analysis.eval ?? 0;
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

    classifyMove(loss, gain, isBestMove, moveIndex = 0, mateSwing = false, san = '') {
        const openingPhase = moveIndex < 16;
        const commonFirstMove = moveIndex === 0 && ['d4', 'e4', 'Nf3', 'c4'].includes(san);
        if (commonFirstMove && !mateSwing && loss <= 2) {
            return { annotation: '!', label: 'Good opening move', commonOpeningChoice: true };
        }
        if (isBestMove && gain >= 1) return { annotation: '!!', label: 'Brilliant move' };
        if (isBestMove || loss <= 0.5) return { annotation: '!', label: 'Excellent move' };
        if (!openingPhase && loss <= 0.75) return { annotation: '!?', label: 'Interesting move' };
        if (openingPhase && !mateSwing && loss <= 2) {
            return { annotation: '!', label: 'Sound opening move', openingProtected: true };
        }
        if (mateSwing || loss > 2.5) return { annotation: '??', label: 'Blunder' };
        if (loss > 1.25) return { annotation: '?', label: 'Mistake' };
        return { annotation: '?!', label: 'Dubious move' };
    },

    buildMentorText(classification, loss, bestMoveSan, isBestMove) {
        if (classification.commonOpeningChoice) return 'Good opening move. The engine may prefer another line, but this is a fully sound opening choice.';
        if (classification.openingProtected) return `Sound opening move.${bestMoveSan ? ` The engine preferred ${bestMoveSan}, but this remains a reasonable opening choice.` : ' This remains a reasonable opening choice.'}`;
        if (classification.annotation === '!!') return 'Brilliant move. You found the engine choice and created a major improvement.';
        if (classification.annotation === '??') return `Blunder. This caused a decisive swing.${bestMoveSan ? ` Better was ${bestMoveSan}.` : ''}`;
        if (classification.annotation === '?') return `Mistake. This lost about ${loss.toFixed(1)} pawns.${bestMoveSan ? ` Better was ${bestMoveSan}.` : ''}`;
        if (classification.annotation === '?!') return `Dubious move. You gave up about ${loss.toFixed(1)} pawns of evaluation.${bestMoveSan ? ` The engine preferred ${bestMoveSan}.` : ''}`;
        if (classification.annotation === '!?') return `Interesting choice.${bestMoveSan ? ` The engine slightly preferred ${bestMoveSan}, but this remains playable.` : ' This remains playable.'}`;
        if (isBestMove) return 'Excellent move. You matched the engine choice and kept the position healthy.';
        return 'Excellent move. It keeps the position healthy.';
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
        this.analysisEngine?.stop?.();
        this.setStatus('Analysis stopped', 'warning');
    },

    /**
     * Analyze single position with Stockfish
     */
    async ensureAnalysisEngine() {
        if (this.analysisEngine?.isReady?.()) return this.analysisEngine;
        if (!this.analysisEngine && window.EngineRegistry?.createEngine) {
            this.analysisEngine = EngineRegistry.createEngine('stockfish');
        }
        if (!this.analysisEngine) return null;

        const started = Date.now();
        while (!this.analysisEngine.isReady?.() && Date.now() - started < 8000) {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return this.analysisEngine.isReady?.() ? this.analysisEngine : null;
    },

    async analyzePositionWithRetry(fen, token) {
        try {
            return await this.analyzePosition(fen, token, 12, 12000);
        } catch (error) {
            if (token !== this.analysisToken || !this.isAnalyzing) return null;
            console.warn('[Analyze] Position analysis timed out; retrying at lower depth');
            try {
                return await this.analyzePosition(fen, token, 8, 12000);
            } catch (_retryError) {
                console.warn('[Analyze] Position analysis unavailable after retry');
                return null;
            }
        }
    },

    analyzePosition(fen, token, depth = 12, timeoutMs = 12000) {
        return new Promise((resolve, reject) => {
            const engine = this.analysisEngine;
            if (!engine?.isReady?.()) {
                reject(new Error('Stockfish engine is not ready'));
                return;
            }

            let latestInfo = null;
            const finish = (result) => {
                clearTimeout(timeout);
                engine.onInfo = null;
                engine.onBestMove = null;
                resolve(result);
            };
            const timeout = setTimeout(() => {
                engine.stop();
                engine.onInfo = null;
                engine.onBestMove = null;
                reject(new Error('Stockfish analysis timed out'));
            }, timeoutMs);

            engine.onInfo = (info) => {
                if (token !== this.analysisToken) return;
                latestInfo = info;
            };
            engine.getBestMove(fen, (bestMove) => {
                if (token !== this.analysisToken) {
                    finish({ eval: null, bestMove: null, depth: 0, pv: [] });
                    return;
                }
                finish({
                    eval: latestInfo?.score ?? null,
                    mate: latestInfo?.mate ?? null,
                    bestMove,
                    depth: latestInfo?.depth ?? 0,
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
        setTimeout(() => this.applyAnalyzeOrientation(), 0);
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
        if (window.App?.board && typeof App.board.orientation === 'function') {
            App.board.orientation(App.isFlipped ? 'black' : 'white');
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
