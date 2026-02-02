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

    // ===== STATE =====
    state: {
        mode: 'match', // 'match' or 'tournament'
        matchState: 'idle', // 'idle', 'running', 'paused', 'finished'
        whiteEngine: null,
        blackEngine: null,
        moveDelay: 1000,
        currentGame: null,
        evalHistory: [], // For graph: [{move: 1, eval: 0.3}, ...]
        boardMounted: false,
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

    /**
     * Mount the chessboard in Arena
     */
    mountBoard() {
        const container = this.elements.boardMount;
        if (!container) {
            console.error('[Arena] Board mount container not found');
            return;
        }

        // Check if board is already mounted
        if (this.board && this.state.boardMounted) {
            console.log('[Arena] Board already mounted, resizing...');
            this.board.resize();
            return;
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

        // Clear container and create board element
        container.innerHTML = '<div id="arenaBoardElement" class="arena-board"></div>';

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

                // Resize after short delay to ensure proper rendering
                setTimeout(() => {
                    if (this.board) {
                        this.board.resize();
                    }
                }, 100);

                // Another resize for safety
                setTimeout(() => {
                    if (this.board) {
                        this.board.resize();
                        console.log('[Arena] Board resize complete');
                    }
                }, 300);

            } catch (err) {
                console.error('[Arena] Failed to mount board:', err);
            }
        };

        // Start mounting process
        setTimeout(checkAndMount, 50);
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
        const createOptions = (selectElement, selectedId) => {
            if (!selectElement) return;

            selectElement.innerHTML = this.engines.map(engine => `
                <option value="${engine.id}" ${engine.id === selectedId ? 'selected' : ''}>
                    ${engine.name} (Tier ${engine.tier})
                </option>
            `).join('');
        };

        // Default selections
        this.state.whiteEngine = this.engines[0];
        this.state.blackEngine = this.engines[1];

        createOptions(this.elements.whiteEngineSelect, this.state.whiteEngine.id);
        createOptions(this.elements.blackEngineSelect, this.state.blackEngine.id);

        this.updateEngineInfo();
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

    // ===== MATCH CONTROLS =====
    startMatch() {
        if (!this.state.whiteEngine || !this.state.blackEngine) {
            alert('Please select both engines');
            return;
        }

        console.log('[Arena] Starting match:', this.state.whiteEngine.name, 'vs', this.state.blackEngine.name);

        this.state.matchState = 'running';
        this.state.evalHistory = [];
        this.state.currentGame = {
            white: this.state.whiteEngine,
            black: this.state.blackEngine,
            moves: [],
            startTime: Date.now()
        };

        // Update UI
        this.updateMatchControls();
        this.updateGameStatus();
        this.clearEvalGraph();

        // Dispatch event to start engine battle
        window.dispatchEvent(new CustomEvent('caissa-arena-start', {
            detail: {
                white: this.state.whiteEngine,
                black: this.state.blackEngine,
                moveDelay: this.state.moveDelay
            }
        }));

        // If using existing EVE system, trigger it
        if (window.App && window.App.startEngineVsEngine) {
            window.App.startEngineVsEngine();
        }
    },

    togglePause() {
        if (this.state.matchState === 'running') {
            this.state.matchState = 'paused';
            window.dispatchEvent(new CustomEvent('caissa-arena-pause'));
            if (window.App && window.App.pauseEngineVsEngine) {
                window.App.pauseEngineVsEngine();
            }
        } else if (this.state.matchState === 'paused') {
            this.state.matchState = 'running';
            window.dispatchEvent(new CustomEvent('caissa-arena-resume'));
            if (window.App && window.App.resumeEngineVsEngine) {
                window.App.resumeEngineVsEngine();
            }
        }
        this.updateMatchControls();
    },

    stopMatch() {
        this.state.matchState = 'idle';
        window.dispatchEvent(new CustomEvent('caissa-arena-stop'));
        if (window.App && window.App.stopEngineVsEngine) {
            window.App.stopEngineVsEngine();
        }
        this.updateMatchControls();
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
        if (!this.elements.boardMount) {
            this.cacheElements();
        }

        // Initialize engine selectors if needed
        if (!this.elements.whiteEngineSelect?.options?.length) {
            this.renderEngineSelectors();
            this.renderTournamentEngineList();
        }

        // Mount the board
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
