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
    fetchedGames: [],
    selectedFetchedGameIndex: -1,
    currentMoveIndex: -1,
    isAnalyzing: false,
    analysisResults: [],
    analysisEngine: null,
    analysisToken: 0,

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

            // Move list
            moveList: document.getElementById('analyzeMoveList'),
            navFirst: document.getElementById('analyzeNavFirst'),
            navPrev: document.getElementById('analyzeNavPrev'),
            navNext: document.getElementById('analyzeNavNext'),
            navLast: document.getElementById('analyzeNavLast')
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
            <button type="button" class="analyze-fetched-game${index === this.selectedFetchedGameIndex ? ' active' : ''}" data-game-index="${index}">
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
                source: source,
                white: metadata.white || headers.White || 'Unknown',
                black: metadata.black || headers.Black || 'Unknown',
                result: metadata.result || headers.Result || '*',
                event: headers.Event || '',
                date: headers.Date || ''
            };
            this.currentMoveIndex = this.loadedGame.game.history().length - 1;
            this.analysisResults = [];

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

            html += `
                <div class="move-row">
                    <span class="move-num">${moveNum}.</span>
                    <span class="move-white${i === this.currentMoveIndex ? ' active' : ''}" data-index="${i}">${whiteMove}${whiteAnnotation ? `<strong class="analyze-move-annotation">${whiteAnnotation}</strong>` : ''}</span>
                    <span class="move-black${i + 1 === this.currentMoveIndex ? ' active' : ''}" data-index="${i + 1}">${blackMove}${blackAnnotation ? `<strong class="analyze-move-annotation">${blackAnnotation}</strong>` : ''}</span>
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

        // Reset to start
        App.game.reset();

        // Replay moves up to index
        for (let i = 0; i <= safeIndex && i < moves.length; i++) {
            App.game.move(moves[i]);
        }

        this.currentMoveIndex = safeIndex;
        this.updateBoardAndUI();
        this.updateMoveList();
        this.updateNavigationControls();
        this.updateMentorPanel();

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

        this.elements.mentor.innerHTML = `
            <div class="analyze-mentor-heading">
                <strong>${this.escapeHtml(move)}</strong>
                <span class="analyze-annotation">${result.annotation}</span>
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
        this.updateMoveList();
        this.updateMentorPanel();

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
            const tempGame = new Chess();
            const positions = [tempGame.fen()];
            moves.forEach((move) => {
                tempGame.move(move.san);
                positions.push(tempGame.fen());
            });

            const positionAnalyses = [];
            for (let i = 0; i < positions.length && this.isAnalyzing && token === this.analysisToken; i++) {
                const progress = Math.round((i / totalMoves) * 100);
                this.updateProgress(progress, `Analyzing position ${i + 1}/${positions.length}`);
                positionAnalyses.push(await this.analyzePosition(positions[i], token));

                if (i > 0) {
                    this.analysisResults[i - 1] = this.buildMoveAnalysis(
                        i - 1,
                        moves[i - 1],
                        positions[i - 1],
                        positionAnalyses[i - 1],
                        positionAnalyses[i]
                    );
                    this.updateMoveList();
                    if (this.currentMoveIndex === i - 1) this.updateMentorPanel();
                }
            }

            if (this.isAnalyzing && token === this.analysisToken) {
                this.updateProgress(100, `Analyzed ${totalMoves} moves`);
                this.updateMoveList();
                this.updateMentorPanel();
                this.setStatus('Analysis complete', 'success');
                console.log('[Analyze] Analysis complete');
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
        const classification = this.classifyMove(loss, gain, isBestMove);

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
            annotation: classification.annotation,
            label: classification.label,
            mentorText: this.buildMentorText(classification, loss, bestMoveSan, isBestMove)
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

    classifyMove(loss, gain, isBestMove) {
        if (isBestMove) {
            return gain >= 0.5
                ? { annotation: '!!', label: 'Exceptional move' }
                : { annotation: '!', label: 'Best move' };
        }
        if (loss > 2) return { annotation: '??', label: 'Blunder' };
        if (loss >= 1) return { annotation: '?', label: 'Mistake' };
        if (loss >= 0.5) return { annotation: '?!', label: 'Questionable move' };
        return { annotation: '!', label: 'Good move' };
    },

    buildMentorText(classification, loss, bestMoveSan, isBestMove) {
        if (classification.annotation === '!!') return 'Exceptional move. You found the engine choice and improved your position.';
        if (classification.annotation === '??') return `Blunder. This lost about ${loss.toFixed(1)} pawns and allowed a decisive swing.${bestMoveSan ? ` Better was ${bestMoveSan}.` : ''}`;
        if (classification.annotation === '?') return `Mistake. This move lost about ${loss.toFixed(1)} pawns.${bestMoveSan ? ` Better was ${bestMoveSan}.` : ''}`;
        if (classification.annotation === '?!') return `Questionable move. This conceded about ${loss.toFixed(1)} pawns.${bestMoveSan ? ` The engine preferred ${bestMoveSan}.` : ''}`;
        if (isBestMove) return 'Good move. You matched the engine choice and kept the position under control.';
        return `Good move. You kept the position stable.${bestMoveSan ? ` The engine slightly preferred ${bestMoveSan}.` : ''}`;
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

    analyzePosition(fen, token) {
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
            }, 10000);

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
            }, { depth: 12 });
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
