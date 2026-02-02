/**
 * CAISSA UI Refactor Controller
 *
 * Handles new UI components from the refactor:
 * - LED Turn Indicator
 * - Sidebar Analysis Panel sync
 * - Vertical Clocks
 * - Game Menu interactions
 */

const CaissaUIRefactor = {
    // DOM Elements
    elements: {
        // LED Indicator
        ledWhite: null,
        ledBlack: null,
        turnLedIndicator: null,

        // Clocks
        clockWhite: null,
        clockBlack: null,

        // Sidebar Analysis
        evaluationSidebar: null,
        depthSidebar: null,
        bestLineSidebar: null,

        // Library panel toggle
        toggleLibraryPanel: null,
        libraryPanelContent: null
    },

    /**
     * Initialize the UI controller
     */
    init() {
        this.cacheElements();
        this.bindEvents();
        this.observeGameState();
        console.log('[UI Refactor] Initialized');
    },

    /**
     * Cache DOM elements
     */
    cacheElements() {
        this.elements = {
            // LED Indicator
            ledWhite: document.getElementById('ledWhite'),
            ledBlack: document.getElementById('ledBlack'),
            turnLedIndicator: document.getElementById('turnLedIndicator'),

            // Clocks
            clockWhite: document.getElementById('clockWhite'),
            clockBlack: document.getElementById('clockBlack'),

            // Sidebar Analysis
            evaluationSidebar: document.getElementById('evaluationSidebar'),
            depthSidebar: document.getElementById('depthSidebar'),
            bestLineSidebar: document.getElementById('bestLineSidebar'),

            // Library panel toggle
            toggleLibraryPanel: document.getElementById('toggleLibraryPanel'),
            libraryPanelContent: document.getElementById('libraryPanelContent'),

            // Game result
            gameResultPanel: document.getElementById('gameResultPanel'),
            gameResult: document.getElementById('gameResult')
        };
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Library panel toggle
        this.elements.toggleLibraryPanel?.addEventListener('click', () => {
            this.toggleLibrary();
        });

        // Listen for analysis updates
        window.addEventListener('caissa-analysis-update', (e) => {
            this.updateSidebarAnalysis(e.detail);
        });

        // Listen for turn changes
        window.addEventListener('caissa-turn-change', (e) => {
            this.updateLedIndicator(e.detail.turn);
        });

        // Listen for game end
        window.addEventListener('caissa-game-end', (e) => {
            this.showGameResult(e.detail);
        });
    },

    /**
     * Observe game state changes by watching the main turnIndicator
     */
    observeGameState() {
        // Watch for changes to the original turn indicator text
        const turnIndicator = document.getElementById('turnIndicator');
        if (turnIndicator) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList' || mutation.type === 'characterData') {
                        const text = turnIndicator.textContent || '';
                        this.parseAndUpdateLed(text);
                    }
                });
            });

            observer.observe(turnIndicator, {
                childList: true,
                characterData: true,
                subtree: true
            });
        }

        // Watch for changes to evaluation display
        const evaluation = document.getElementById('evaluation');
        if (evaluation) {
            const observer = new MutationObserver(() => {
                this.syncAnalysisFromMain();
            });

            observer.observe(evaluation, {
                childList: true,
                characterData: true,
                subtree: true
            });
        }

        // Watch for changes to best line
        const bestLine = document.getElementById('bestLine');
        if (bestLine) {
            const observer = new MutationObserver(() => {
                this.syncAnalysisFromMain();
            });

            observer.observe(bestLine, {
                childList: true,
                characterData: true,
                subtree: true
            });
        }
    },

    /**
     * Parse turn indicator text and update LED
     */
    parseAndUpdateLed(text) {
        const lowerText = text.toLowerCase();

        // Check for game end states
        if (lowerText.includes('checkmate') || lowerText.includes('wins')) {
            this.showGameOver(text);
            return;
        }

        if (lowerText.includes('drawn') || lowerText.includes('stalemate')) {
            this.showGameOver(text);
            return;
        }

        // Determine whose turn
        if (lowerText.includes('white')) {
            this.updateLedIndicator('white');
        } else if (lowerText.includes('black')) {
            this.updateLedIndicator('black');
        }

        // Check if in check
        const inCheck = lowerText.includes('check');
        this.setCheckState(inCheck);
    },

    /**
     * Update LED turn indicator
     */
    updateLedIndicator(turn) {
        const { ledWhite, ledBlack } = this.elements;

        if (!ledWhite || !ledBlack) return;

        if (turn === 'white') {
            ledWhite.classList.add('active');
            ledBlack.classList.remove('active');
        } else {
            ledWhite.classList.remove('active');
            ledBlack.classList.add('active');
        }

        // Also update clock active states
        this.updateClockActive(turn);
    },

    /**
     * Set check state (pulsing LED)
     */
    setCheckState(inCheck) {
        const { ledWhite, ledBlack } = this.elements;

        if (inCheck) {
            const activeLed = ledWhite?.classList.contains('active') ? ledWhite : ledBlack;
            activeLed?.classList.add('in-check');
        } else {
            ledWhite?.classList.remove('in-check');
            ledBlack?.classList.remove('in-check');
        }
    },

    /**
     * Update which clock is active
     */
    updateClockActive(turn) {
        const { clockWhite, clockBlack } = this.elements;

        if (turn === 'white') {
            clockWhite?.classList.add('active');
            clockBlack?.classList.remove('active');
        } else {
            clockWhite?.classList.remove('active');
            clockBlack?.classList.add('active');
        }
    },

    /**
     * Show game over state
     */
    showGameOver(resultText) {
        const { ledWhite, ledBlack, gameResultPanel, gameResult } = this.elements;

        // Turn off both LEDs
        ledWhite?.classList.remove('active');
        ledBlack?.classList.remove('active');

        // Show result panel
        if (gameResultPanel && gameResult) {
            gameResult.textContent = resultText;
            gameResultPanel.style.display = 'block';
        }
    },

    /**
     * Sync analysis from main panel to sidebar
     */
    syncAnalysisFromMain() {
        const mainEval = document.getElementById('evaluation');
        const mainDepth = document.getElementById('depth');
        const mainBestLine = document.getElementById('bestLine');

        if (this.elements.evaluationSidebar && mainEval) {
            this.elements.evaluationSidebar.textContent = mainEval.textContent;

            // Copy color class
            const evalColor = mainEval.className;
            this.elements.evaluationSidebar.className = 'eval-value ' + evalColor;
        }

        if (this.elements.depthSidebar && mainDepth) {
            this.elements.depthSidebar.textContent = mainDepth.textContent;
        }

        if (this.elements.bestLineSidebar && mainBestLine) {
            this.elements.bestLineSidebar.textContent = mainBestLine.textContent;
        }
    },

    /**
     * Update sidebar analysis directly
     */
    updateSidebarAnalysis(data) {
        const { evaluationSidebar, depthSidebar, bestLineSidebar } = this.elements;

        if (evaluationSidebar && data.evaluation !== undefined) {
            evaluationSidebar.textContent = data.evaluation;
        }

        if (depthSidebar && data.depth !== undefined) {
            depthSidebar.textContent = data.depth;
        }

        if (bestLineSidebar && data.bestLine !== undefined) {
            bestLineSidebar.textContent = data.bestLine;
        }
    },

    /**
     * Toggle library panel
     */
    toggleLibrary() {
        const { toggleLibraryPanel, libraryPanelContent } = this.elements;

        if (!toggleLibraryPanel || !libraryPanelContent) return;

        const isCollapsed = toggleLibraryPanel.classList.toggle('collapsed');
        libraryPanelContent.style.display = isCollapsed ? 'none' : 'block';
    },

    /**
     * Show game result
     */
    showGameResult(detail) {
        const { gameResultPanel, gameResult } = this.elements;

        if (gameResultPanel && gameResult) {
            gameResult.textContent = detail.result || 'Game Over';
            gameResultPanel.style.display = 'block';
        }
    },

    /**
     * Reset UI for new game
     */
    reset() {
        const { ledWhite, ledBlack, gameResultPanel } = this.elements;

        // Reset LEDs
        ledWhite?.classList.add('active');
        ledWhite?.classList.remove('in-check');
        ledBlack?.classList.remove('active');
        ledBlack?.classList.remove('in-check');

        // Hide result panel
        if (gameResultPanel) {
            gameResultPanel.style.display = 'none';
        }

        // Reset analysis
        if (this.elements.evaluationSidebar) {
            this.elements.evaluationSidebar.textContent = '0.0';
        }
        if (this.elements.depthSidebar) {
            this.elements.depthSidebar.textContent = '0';
        }
        if (this.elements.bestLineSidebar) {
            this.elements.bestLineSidebar.textContent = '--';
        }
    }
};

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => CaissaUIRefactor.init());
} else {
    CaissaUIRefactor.init();
}

// Expose globally
window.CaissaUIRefactor = CaissaUIRefactor;
