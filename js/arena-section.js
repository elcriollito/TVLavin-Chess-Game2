/**
 * CAISSA Arena Section
 * Manages Engine vs Engine matches in the Arena section
 *
 * Part of Phase 2: Section Migration
 */

const ArenaSection = {

    // State
    isRunning: false,
    moveCount: 0,

    // DOM cache
    elements: {},

    /**
     * Initialize Arena section
     */
    init() {
        console.log('[Arena] Initializing...');
        this.cacheElements();
        this.bindEvents();
        console.log('[Arena] Ready');
    },

    /**
     * Cache DOM elements
     */
    cacheElements() {
        this.elements = {
            // Arena-specific controls
            startBtn: document.getElementById('startEveArena'),
            pauseBtn: document.getElementById('pauseEveArena'),
            resumeBtn: document.getElementById('resumeEveArena'),
            stopBtn: document.getElementById('stopEveArena'),
            moveDelayInput: document.getElementById('eveMoveDelayArena'),

            // Stats display
            moveCount: document.getElementById('arenaMoveCount'),
            status: document.getElementById('arenaStatus'),
            turn: document.getElementById('arenaTurn'),
            result: document.getElementById('arenaResult'),
            whiteTime: document.getElementById('arenaWhiteTime'),
            blackTime: document.getElementById('arenaBlackTime')
        };
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        this.elements.startBtn?.addEventListener('click', () => {
            this.startMatch();
        });

        this.elements.pauseBtn?.addEventListener('click', () => {
            this.pauseMatch();
        });

        this.elements.resumeBtn?.addEventListener('click', () => {
            this.resumeMatch();
        });

        this.elements.stopBtn?.addEventListener('click', () => {
            this.stopMatch();
        });

        // Sync move delay with legacy EVE panel
        this.elements.moveDelayInput?.addEventListener('change', (e) => {
            const legacyInput = document.getElementById('eveMoveDelay');
            if (legacyInput) {
                legacyInput.value = e.target.value;
            }
        });
    },

    /**
     * Start Engine vs Engine match
     */
    startMatch() {
        console.log('[Arena] Starting match...');

        // Sync delay with legacy control
        const delay = this.elements.moveDelayInput?.value || 1000;
        const legacyInput = document.getElementById('eveMoveDelay');
        if (legacyInput) {
            legacyInput.value = delay;
        }

        // Trigger legacy EVE start via app.js
        if (window.App) {
            // Enable EVE mode in app.js
            const engineVsEngineBtn = document.getElementById('engineVsEngineBtn');
            if (engineVsEngineBtn) {
                engineVsEngineBtn.click();
            }

            // Set game mode to EVE in New Game modal
            const gameModeSelect = document.getElementById('gameMode');
            if (gameModeSelect) {
                gameModeSelect.value = 'eve';
            }

            // Start new game
            const newGameModal = document.getElementById('newGameModal');
            const startGameBtn = document.querySelector('#newGameModal .btn-primary[type="submit"]');
            if (startGameBtn) {
                // Trigger new game
                App.newGame('eve');
            }
        }

        // Update UI
        this.isRunning = true;
        this.moveCount = 0;
        this.updateUI();
        this.updateStats();

        console.log('[Arena] Match started');
    },

    /**
     * Pause match
     */
    pauseMatch() {
        console.log('[Arena] Pausing match...');

        // Trigger legacy pause
        const pauseBtn = document.getElementById('pauseEve');
        if (pauseBtn && pauseBtn.style.display !== 'none') {
            pauseBtn.click();
        }

        this.updateUI();
    },

    /**
     * Resume match
     */
    resumeMatch() {
        console.log('[Arena] Resuming match...');

        // Trigger legacy resume
        const resumeBtn = document.getElementById('resumeEve');
        if (resumeBtn && resumeBtn.style.display !== 'none') {
            resumeBtn.click();
        }

        this.updateUI();
    },

    /**
     * Stop match
     */
    stopMatch() {
        console.log('[Arena] Stopping match...');

        // Trigger legacy stop
        const stopBtn = document.getElementById('stopEve');
        if (stopBtn && stopBtn.style.display !== 'none') {
            stopBtn.click();
        }

        this.isRunning = false;
        this.updateUI();

        if (this.elements.result) {
            this.elements.result.textContent = 'Match stopped';
        }
    },

    /**
     * Update UI controls state
     */
    updateUI() {
        if (!this.elements.startBtn) return;

        if (this.isRunning) {
            // Match running
            this.elements.startBtn.style.display = 'none';
            this.elements.pauseBtn.style.display = 'block';
            this.elements.resumeBtn.style.display = 'none';
            this.elements.stopBtn.style.display = 'block';

            if (this.elements.status) {
                this.elements.status.textContent = 'Running';
                this.elements.status.style.color = 'var(--success-color)';
            }
        } else {
            // Match stopped
            this.elements.startBtn.style.display = 'block';
            this.elements.pauseBtn.style.display = 'none';
            this.elements.resumeBtn.style.display = 'none';
            this.elements.stopBtn.style.display = 'none';

            if (this.elements.status) {
                this.elements.status.textContent = 'Ready';
                this.elements.status.style.color = 'var(--text-secondary)';
            }
        }
    },

    /**
     * Update match statistics
     */
    updateStats() {
        // This will be called by App when moves are made
        if (window.App && App.game) {
            this.moveCount = App.game.history().length;

            if (this.elements.moveCount) {
                this.elements.moveCount.textContent = this.moveCount;
            }

            if (this.elements.turn) {
                this.elements.turn.textContent = App.game.turn() === 'w' ? 'White' : 'Black';
            }

            // Check game over
            if (App.game.game_over()) {
                this.isRunning = false;
                this.updateUI();

                let result = '';
                if (App.game.in_checkmate()) {
                    result = App.game.turn() === 'w' ? 'Black wins by checkmate' : 'White wins by checkmate';
                } else if (App.game.in_draw()) {
                    result = 'Draw';
                } else if (App.game.in_stalemate()) {
                    result = 'Draw by stalemate';
                } else if (App.game.in_threefold_repetition()) {
                    result = 'Draw by repetition';
                } else if (App.game.insufficient_material()) {
                    result = 'Draw - insufficient material';
                }

                if (this.elements.result) {
                    this.elements.result.textContent = result;
                }

                console.log('[Arena] Match ended:', result);
            }
        }
    },

    /**
     * Section lifecycle: Enter
     */
    onEnter() {
        console.log('[Arena] Section entered');

        // Sync state from app.js if EVE is already running
        if (window.App && App.eveMode) {
            this.isRunning = true;
            this.updateStats();
        }

        this.updateUI();
    },

    /**
     * Section lifecycle: Exit
     */
    onExit() {
        console.log('[Arena] Section exited');
        // Don't stop the match, just hide UI
    }
};

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        ArenaSection.init();
    });
} else {
    ArenaSection.init();
}

// Register with navigation system
if (window.CaissaNavigation) {
    CaissaNavigation.sections.arena = ArenaSection;
}

// Expose globally
window.ArenaSection = ArenaSection;
