/**
 * CAISSA Navigation Module
 * Handles section switching, nav state, and board positioning
 *
 * Part of Phase 1: Vertical Menu Architecture Redesign
 */

const CaissaNavigation = {

    // State
    currentSection: 'yahooClassic',
    isNavCollapsed: false,
    navOpen: false, // Mobile only

    // DOM cache
    elements: {},

    // Section registry (maps section ID to handler module)
    sections: {
        play: null,        // Managed by existing app.js
        analyze: null,     // Future: analyze-section.js
        insights: null,    // Future: insights-section.js
        history: null,     // Future: history-section.js
        arena: null,       // Future: arena-section.js
        yahooClassic: null, // CAISSA Classic page foundation
        academy: null,     // CAISSA Academy foundation
        library: null,     // Opens library panel (existing)
        premium: null,     // Redirect to /premium
        settings: null     // Future: settings-section.js
    },

    /**
     * Initialize navigation system
     */
    init() {
        console.log('[CAISSA Nav] Initializing...');
        this.cacheElements();
        this.bindEvents();
        this.restoreState();
        this.updateUI();
        console.log('[CAISSA Nav] Ready. Current section:', this.currentSection);
    },

    /**
     * Cache DOM elements
     */
    cacheElements() {
        this.elements = {
            nav: document.getElementById('mainNav'),
            collapseBtn: document.getElementById('navCollapseBtn'),
            mobileToggle: document.getElementById('mobileNavToggle'),
            newGameBtn: document.getElementById('navNewGameBtn'),
            mobileQuickActions: document.querySelector('.mobile-quick-actions'),
            mobileActionButtons: document.querySelectorAll('[data-mobile-action]'),
            navItems: document.querySelectorAll('.nav-item[data-section]'),
            sections: document.querySelectorAll('.content-section'),
            appContainer: document.querySelector('.app-container'),
            sectionNameDisplay: document.getElementById('headerSectionName')
        };

        if (!this.elements.nav) {
            console.error('[CAISSA Nav] Navigation element not found! Check HTML structure.');
        }
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Nav item clicks
        this.elements.navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const section = e.currentTarget.dataset.section;
                this.navigateToSection(section);
            });
        });

        // Collapse toggle (desktop)
        this.elements.collapseBtn?.addEventListener('click', () => {
            this.toggleNavCollapse();
        });

        // Mobile nav toggle button
        this.elements.mobileToggle?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMobileNav();
        });

        // New Game button in sidebar
        this.elements.newGameBtn?.addEventListener('click', () => {
            this.openNewGameModal();
        });

        // Mobile: Close nav when clicking outside
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 && this.navOpen) {
                const isMobileToggle = e.target.closest('#mobileNavToggle');
                const isNavClick = this.elements.nav.contains(e.target);
                if (!isMobileToggle && !isNavClick) {
                    this.closeNav();
                }
            }
        });

        // Keyboard shortcut: Ctrl+B to toggle nav
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'b') {
                e.preventDefault();
                this.toggleNavCollapse();
            }
        });

        // Mobile Quick Actions
        this.elements.mobileActionButtons?.forEach((button) => {
            button.addEventListener('click', () => {
                this.handleMobileQuickAction(button.dataset.mobileAction);
            });
        });

        document.getElementById('closeAnalysisSheet')?.addEventListener('click', () => {
            this.closeMobileAnalysis();
        });

        this.closeMobileAnalysis();

        console.log('[CAISSA Nav] Event listeners bound');
    },

    /**
     * Navigate to a section
     */
    navigateToSection(sectionId) {
        if (this.currentSection === sectionId) {
            console.log('[CAISSA Nav] Already on section:', sectionId);
            return;
        }

        console.log('[CAISSA Nav] Navigating from', this.currentSection, 'to', sectionId);

        // Special cases: Library, Mentor, Help, and Premium
        if (sectionId === 'library') {
            // Open library panel instead of switching section
            if (window.LibraryUI && typeof window.LibraryUI.toggle === 'function') {
                window.LibraryUI.toggle();
            }
            return;
        }

        if (sectionId === 'mentor') {
            // Open Mentor AI panel instead of switching section
            this.openMentorPanel();
            return;
        }

        if (sectionId === 'help') {
            // Open Help/FAQ modal
            this.openHelpModal();
            return;
        }

        if (sectionId === 'premium') {
            // Redirect to premium page
            window.location.href = '/premium';
            return;
        }

        if (sectionId === 'cheater-insight') {
            // Cheater Insight opens its existing modal for all users.
            this.openCheaterInsight();
            return;
        }

        // Deactivate current section
        const currentEl = document.getElementById(`${this.currentSection}Section`);
        currentEl?.classList.remove('active');

        // Deactivate current nav item
        this.elements.navItems.forEach(item => {
            if (item.dataset.section === this.currentSection) {
                item.classList.remove('active');
            }
        });

        // Activate new section
        const newEl = document.getElementById(`${sectionId}Section`);
        if (!newEl) {
            console.error('[CAISSA Nav] Section not found:', sectionId);
            return;
        }
        newEl.classList.add('active');

        // Activate nav item
        this.elements.navItems.forEach(item => {
            if (item.dataset.section === sectionId) {
                item.classList.add('active');
            }
        });

        // Call section lifecycle hooks
        this.onSectionExit(this.currentSection);
        this.onSectionEnter(sectionId);

        // Update state
        this.currentSection = sectionId;
        this.saveState();
        this.updateSectionName(sectionId);
        this.updateMobileGameplayControls(sectionId);

        // Close mobile nav
        if (window.innerWidth <= 768) {
            this.closeNav();
        }

        console.log('[CAISSA Nav] Navigation complete. Active section:', sectionId);
    },

    /**
     * Section lifecycle: exit
     */
    onSectionExit(sectionId) {
        const handler = this.sections[sectionId];
        if (handler && typeof handler.onExit === 'function') {
            console.log(`[CAISSA Nav] Calling onExit for ${sectionId}`);
            handler.onExit();
        }

        // Special case: PLAY section - pause timers if needed
        if (sectionId === 'play') {
            if (window.App) {
                // Keep position but stop continuous analysis if not in game
                console.log('[CAISSA Nav] Exiting PLAY section');
            }
        }
    },

    /**
     * Section lifecycle: enter
     */
    onSectionEnter(sectionId) {
        const handler = this.sections[sectionId];
        if (handler && typeof handler.onEnter === 'function') {
            console.log(`[CAISSA Nav] Calling onEnter for ${sectionId}`);
            handler.onEnter();
        }

        // Special case: Sections that need the board
        if (['play', 'analyze', 'arena'].includes(sectionId)) {
            this.syncBoardToSection(sectionId);

            // Resize boards after section becomes visible
            requestAnimationFrame(() => {
                if (sectionId === 'play' && typeof window.ensurePlayInitialized === 'function') {
                    window.ensurePlayInitialized('navigation-enter');
                }
                if (window.App && App.board) {
                    App.board.resize();
                    console.log('[CAISSA Nav] Board resized on section enter');
                }
                if (sectionId === 'arena' && window.CaissaArena?.board) {
                    window.CaissaArena.board.resize();
                    console.log('[CAISSA Nav] Arena board resized on section enter');
                }
            });
        }

        console.log(`[CAISSA Nav] Entered ${sectionId} section`);
    },

    /**
     * Sync board element to current section
     * (Board DOM element moves between sections as needed)
     */
    syncBoardToSection(sectionId) {
        const boardEl = document.getElementById('chessboard');
        if (!boardEl) {
            console.warn('[CAISSA Nav] Board element not found');
            return;
        }

        // Find target container in new section
        const targetContainer = document.querySelector(`#${sectionId}Section .board-zone, #${sectionId}Section .board-container, #${sectionId}Section .arena-board-container`);
        const boardWrapper = sectionId === 'play'
            ? targetContainer?.querySelector('.board-wrapper')
            : targetContainer?.querySelector('.board-editor-wrapper');
        const boardDestination = boardWrapper || targetContainer;

        if (boardDestination && !boardDestination.contains(boardEl)) {
            console.log('[CAISSA Nav] Moving board to section:', sectionId);

            // Move board to new section
            boardDestination.insertBefore(boardEl, boardDestination.firstChild);

            // Trigger board resize/redraw
            if (window.App && App.board) {
                setTimeout(() => {
                    App.board.resize();
                    console.log('[CAISSA Nav] Board resized');
                }, 100);
            }
        }
    },

    /**
     * Register a section handler module
     * @param {string} sectionId - The section ID (e.g., 'arena', 'analyze')
     * @param {object} handler - The handler module with onEnter/onExit methods
     */
    registerSection(sectionId, handler) {
        this.sections[sectionId] = handler;
        console.log(`[CAISSA Nav] Registered section handler: ${sectionId}`);

        // If this section is currently active, call onEnter
        if (this.currentSection === sectionId && typeof handler.onEnter === 'function') {
            handler.onEnter();
        }
    },

    /**
     * Toggle navigation collapse
     */
    toggleNavCollapse() {
        this.isNavCollapsed = !this.isNavCollapsed;
        this.elements.appContainer?.classList.toggle('nav-collapsed', this.isNavCollapsed);

        // Rotate collapse button icon
        const icon = this.elements.collapseBtn?.querySelector('i');
        if (icon) {
            icon.classList.toggle('fa-chevron-left', !this.isNavCollapsed);
            icon.classList.toggle('fa-chevron-right', this.isNavCollapsed);
        }

        this.saveState();

        // Resize board after layout change
        setTimeout(() => {
            if (window.App && App.board) {
                App.board.resize();
            }
        }, 350); // After transition

        console.log('[CAISSA Nav] Nav collapsed:', this.isNavCollapsed);
    },

    /**
     * Open mobile nav
     */
    openNav() {
        this.navOpen = true;
        this.elements.appContainer?.classList.add('nav-open');
        console.log('[CAISSA Nav] Mobile nav opened');
    },

    /**
     * Close mobile nav
     */
    closeNav() {
        this.navOpen = false;
        this.elements.appContainer?.classList.remove('nav-open');
        console.log('[CAISSA Nav] Mobile nav closed');
    },

    /**
     * Toggle mobile nav open/close
     */
    toggleMobileNav() {
        if (this.navOpen) {
            this.closeNav();
        } else {
            this.openNav();
        }
    },

    /**
     * Toggle mobile analysis bottom sheet
     */
    toggleMobileAnalysis() {
        const sheet = document.getElementById('mobileAnalysisSheet');
        if (sheet) {
            const willOpen = !sheet.classList.contains('open');
            sheet.classList.toggle('open', willOpen);
            sheet.hidden = !willOpen;
            sheet.setAttribute('aria-hidden', String(!willOpen));
            sheet.inert = !willOpen;
            if (willOpen) {
                this.updateMobileAnalysis();
            }
        }
    },

    /**
     * Close mobile analysis bottom sheet
     */
    closeMobileAnalysis() {
        const sheet = document.getElementById('mobileAnalysisSheet');
        if (sheet) {
            sheet.classList.remove('open');
            sheet.hidden = true;
            sheet.setAttribute('aria-hidden', 'true');
            sheet.inert = true;
        }
    },

    /**
     * Keep mobile gameplay controls contextual and outside the accessibility
     * tree when the current section does not use them.
     */
    updateMobileGameplayControls(sectionId = this.currentSection) {
        const isGameplaySection = sectionId === 'play' || sectionId === 'analyze' || sectionId === 'arena';
        const quickActions = this.elements.mobileQuickActions || document.querySelector('.mobile-quick-actions');

        document.body?.setAttribute('data-caissa-section', sectionId || '');
        document.body?.classList.toggle('caissa-mobile-gameplay-active', isGameplaySection);

        if (quickActions) {
            quickActions.hidden = !isGameplaySection;
            quickActions.setAttribute('aria-hidden', String(!isGameplaySection));
            quickActions.inert = !isGameplaySection;
        }

        this.configureMobileQuickActions(sectionId);

        if (!isGameplaySection) {
            this.closeMobileAnalysis();
        }
    },

    configureMobileQuickActions(sectionId = this.currentSection) {
        const layouts = {
            play: [
                { action: 'new-game', label: 'New Game', icon: 'fa-plus', style: 'primary' },
                { action: 'undo', label: 'Undo', icon: 'fa-undo' },
                { action: 'hint', label: 'Hint', icon: 'fa-lightbulb' },
                { action: 'pgn', label: 'PGN', icon: 'fa-file-export' },
                { action: 'menu', label: 'Menu', icon: 'fa-bars', style: 'analysis' }
            ],
            analyze: [
                { action: 'analyze-engine', label: 'Engine', icon: 'fa-brain', style: 'primary' },
                { action: 'menu', label: 'Menu', icon: 'fa-bars', style: 'analysis' }
            ],
            arena: [
                { action: 'arena-start', label: 'New Game', icon: 'fa-play', style: 'primary' },
                { action: 'arena-engine', label: 'Engine', icon: 'fa-microchip' },
                { action: 'menu', label: 'Menu', icon: 'fa-bars', style: 'analysis' }
            ]
        };

        const buttons = Array.from(this.elements.mobileActionButtons || document.querySelectorAll('[data-mobile-action]'));
        const config = layouts[sectionId] || [];
        buttons.forEach((button, index) => {
            const item = config[index];
            button.hidden = !item;
            button.setAttribute('aria-hidden', String(!item));
            if (!item) return;

            button.dataset.mobileAction = item.action;
            button.classList.toggle('mobile-quick-btn-primary', item.style === 'primary');
            button.classList.toggle('mobile-quick-btn-analysis', item.style === 'analysis');
            button.classList.toggle('mobile-quick-btn-secondary', !item.style);
            button.setAttribute('aria-label', item.label);
            const icon = button.querySelector('i');
            if (icon) icon.className = `fas ${item.icon}`;
            const label = button.querySelector('span');
            if (label) label.textContent = item.label;
        });
    },

    handleMobileQuickAction(action) {
        const click = (selector) => {
            const target = document.querySelector(selector);
            if (target) {
                target.click();
                return true;
            }
            return false;
        };

        const actions = {
            'new-game': () => this.openNewGameModal(),
            undo: () => click('#btnUndo'),
            hint: () => click('#btnHint'),
            pgn: () => click('#btnDownload'),
            menu: () => {
                if (this.currentSection === 'play' && click('#btnSettings')) return;
                this.openNav();
            },
            'analyze-engine': () => click('#analyzeEngineToggle'),
            'analyze-undo': () => click('#analyzeUndoMove'),
            'analyze-reset': () => click('#analyzeResetBoard'),
            'analyze-flip': () => click('#analyzeFlipBoard'),
            'arena-start': () => click('#arenaStartMatch'),
            'arena-engine': () => click('#arenaInfiniteAnalysis')
        };

        actions[action]?.();
    },

    /**
     * Update mobile analysis display with current engine data
     */
    updateMobileAnalysis() {
        // Get current evaluation from App if available
        if (window.App && App.currentEval !== undefined) {
            const evalScore = App.currentEval;
            const evalDisplay = document.getElementById('mobileEvalScore');
            const evalBar = document.getElementById('mobileEvalBar');
            const pvMoves = document.getElementById('mobilePVMoves');

            if (evalDisplay) {
                // Format evaluation
                let evalText;
                if (typeof evalScore === 'number') {
                    evalText = evalScore > 0 ? `+${evalScore.toFixed(1)}` : evalScore.toFixed(1);
                    evalDisplay.className = 'mobile-eval-score ' +
                        (evalScore > 0.3 ? 'white-advantage' : evalScore < -0.3 ? 'black-advantage' : 'equal');
                } else {
                    evalText = evalScore;
                    evalDisplay.className = 'mobile-eval-score equal';
                }
                evalDisplay.textContent = evalText;
            }

            if (evalBar && typeof evalScore === 'number') {
                // Convert eval to percentage (clamped between -5 and +5)
                const clampedEval = Math.max(-5, Math.min(5, evalScore));
                const percentage = ((clampedEval + 5) / 10) * 100;
                evalBar.style.width = `${percentage}%`;
            }

            // Get PV if available
            if (pvMoves && App.currentPV) {
                pvMoves.textContent = App.currentPV || 'Analyzing...';
            }
        }
    },

    /**
     * Open New Game modal
     */
    openNewGameModal() {
        console.log('[CAISSA Nav] Opening New Game modal...');

        // Navigate to Play section first
        if (this.currentSection !== 'play') {
            this.navigateToSection('play');
        }
        if (typeof window.ensurePlayInitialized === 'function') {
            window.ensurePlayInitialized('open-new-game');
        }

        // Use existing modal system
        const newGameModal = document.getElementById('newGameModal');
        if (typeof window.showModal === 'function') {
            window.showModal('newGameModal');
        } else if (newGameModal) {
            newGameModal.classList.add('show');
        }

        // Also trigger the hidden button for compatibility with app.js
        const hiddenNewGameBtn = document.getElementById('newGameBtn');
        if (hiddenNewGameBtn && typeof hiddenNewGameBtn.click === 'function') {
            // Don't click if modal is already showing
            if (!newGameModal?.classList.contains('show')) {
                hiddenNewGameBtn.click();
            }
        }
    },

    /**
     * Open Mentor AI panel
     */
    openMentorPanel() {
        console.log('[CAISSA Nav] Opening Mentor panel...');

        // Use existing MentorAI toggle if available
        if (window.MentorAI && typeof window.MentorAI.toggle === 'function') {
            window.MentorAI.toggle();
        } else {
            // Fallback: directly toggle mentor panel class
            const mentorPanel = document.querySelector('.mentor-panel');
            const mentorOverlay = document.querySelector('.mentor-overlay');

            if (mentorPanel) {
                mentorPanel.classList.toggle('open');
                if (mentorOverlay) {
                    mentorOverlay.classList.toggle('show');
                }
            }
        }

        // Close mobile nav if open
        if (window.innerWidth <= 768) {
            this.closeNav();
        }
    },

    /**
     * Open Help/FAQ modal
     */
    openHelpModal() {
        console.log('[CAISSA Nav] Opening Help modal...');

        const helpModal = document.getElementById('helpModal');
        if (helpModal) {
            helpModal.classList.add('show');
        }

        // Close mobile nav if open
        if (window.innerWidth <= 768) {
            this.closeNav();
        }
    },

    /**
     * Open Cheater Insight
     */
    openCheaterInsight() {
        console.log('[CAISSA Nav] Opening Cheater Insight...');

        const cheaterModal = document.getElementById('cheaterInsightModal');
        if (cheaterModal) {
            cheaterModal.classList.add('show');
        } else {
            // Fallback to menu modal cheater insight button
            const menuCheaterBtn = document.getElementById('menuCheaterInsight');
            if (menuCheaterBtn) {
                menuCheaterBtn.click();
            }
        }

        // Close mobile nav if open
        if (window.innerWidth <= 768) {
            this.closeNav();
        }
    },

    /**
     * Show premium feature modal for locked features
     */
    showPremiumFeatureModal(featureName, featureDescription) {
        // Check if modal already exists
        let modal = document.getElementById('premiumFeatureModal');

        if (!modal) {
            // Create the modal
            modal = document.createElement('div');
            modal.id = 'premiumFeatureModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content modal-small">
                    <div class="modal-header">
                        <h2 class="modal-title"><i class="fas fa-crown" style="color: var(--accent-color);"></i> Premium Feature</h2>
                        <button class="modal-close" id="closePremiumFeatureModal">&times;</button>
                    </div>
                    <div class="modal-body" style="text-align: center; padding: var(--spacing-lg);">
                        <div style="font-size: 48px; margin-bottom: var(--spacing-md); color: var(--accent-color);">
                            <i class="fas fa-lock"></i>
                        </div>
                        <h3 id="premiumFeatureName" style="margin-bottom: var(--spacing-sm);"></h3>
                        <p id="premiumFeatureDesc" style="color: var(--text-secondary); margin-bottom: var(--spacing-lg);"></p>
                        <div style="display: flex; gap: var(--spacing-sm); justify-content: center;">
                            <a href="/premium" class="btn btn-premium" style="text-decoration: none;">
                                <i class="fas fa-crown"></i> Upgrade Now
                            </a>
                            <button class="btn btn-secondary" id="premiumFeatureLater">Maybe Later</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // Bind close events
            modal.querySelector('#closePremiumFeatureModal').addEventListener('click', () => {
                modal.classList.remove('show');
            });
            modal.querySelector('#premiumFeatureLater').addEventListener('click', () => {
                modal.classList.remove('show');
            });
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('show');
                }
            });
        }

        // Update content and show
        modal.querySelector('#premiumFeatureName').textContent = featureName;
        modal.querySelector('#premiumFeatureDesc').textContent = featureDescription;
        modal.classList.add('show');
    },

    /**
     * Update header section name display (mobile)
     */
    updateSectionName(sectionId) {
        if (this.elements.sectionNameDisplay) {
            const names = {
                play: 'Play',
                analyze: 'Analyze',
                insights: 'Insights',
                history: 'History',
                arena: 'Arena',
                spectator: 'Spectator TV',
                yahooClassic: 'Yahoo Classic',
                academy: 'Academy'
            };
            this.elements.sectionNameDisplay.textContent = names[sectionId] || 'CAISSA';
        }
    },

    /**
     * Save nav state to localStorage
     */
    saveState() {
        try {
            localStorage.setItem('caissa_nav_state', JSON.stringify({
                currentSection: this.currentSection,
                isNavCollapsed: this.isNavCollapsed
            }));
        } catch (e) {
            console.error('[CAISSA Nav] Failed to save state:', e);
        }
    },

    /**
     * Restore nav state from localStorage
     */
    restoreState() {
        try {
            const saved = localStorage.getItem('caissa_nav_state');
            if (saved) {
                const state = JSON.parse(saved);

                // CRITICAL FIX: Always default to 'play' on initial page load
                // Only restore section if user explicitly navigated (not on first visit)
                // This prevents Arena from auto-opening when user refreshes the page
                const urlParams = new URLSearchParams(window.location.search);
                const hasExplicitSection = urlParams.has('section');

                const pathSections = {
                    '/yahoo-classic': 'yahooClassic',
                    '/academy': 'academy'
                };
                const pathSection = pathSections[window.location.pathname];

                if (pathSection) {
                    this.currentSection = pathSection;
                } else if (hasExplicitSection) {
                    // URL override (e.g., ?section=arena)
                    this.currentSection = urlParams.get('section') || 'yahooClassic';
                } else {
                    // Always start with CAISSA Classic, ignore localStorage section
                    this.currentSection = 'yahooClassic';
                }

                this.isNavCollapsed = state.isNavCollapsed || false;

                if (this.isNavCollapsed) {
                    this.elements.appContainer?.classList.add('nav-collapsed');
                }

                console.log('[CAISSA Nav] State restored. Default section: yahooClassic (localStorage ignored for section)');
            } else {
                // No saved state - fresh visit
                const pathSections = {
                    '/yahoo-classic': 'yahooClassic',
                    '/academy': 'academy'
                };
                const urlParams = new URLSearchParams(window.location.search);
                this.currentSection = pathSections[window.location.pathname]
                    || (urlParams.has('section') ? urlParams.get('section') : null)
                    || 'yahooClassic';
                console.log('[CAISSA Nav] No saved state. Starting with:', this.currentSection);
            }
        } catch (e) {
            console.error('[CAISSA Nav] Failed to restore state:', e);
            this.currentSection = 'yahooClassic'; // Fallback to CAISSA Classic on error
        }
    },

    /**
     * Update UI state
     */
    updateUI() {
        // Force activation of current section on initial load
        // (navigateToSection has early return if already on section)
        const targetSection = this.currentSection;

        // CRITICAL FIX: Remove 'active' from ALL sections first
        // This prevents multiple sections being visible simultaneously
        this.elements.sections.forEach(section => {
            section.classList.remove('active');
        });

        // Activate the section directly
        const sectionEl = document.getElementById(`${targetSection}Section`);
        if (sectionEl) {
            if (targetSection !== 'yahooClassic') {
                document.body?.classList.remove('yc-classic-active');
            }
            sectionEl.classList.add('active');

            // Activate nav item
            this.elements.navItems.forEach(item => {
                if (item.dataset.section === targetSection) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });

            // Call section enter hook
            this.onSectionEnter(targetSection);
            this.updateMobileGameplayControls(targetSection);
        }
    }
};

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        CaissaNavigation.init();
    });
} else {
    // DOM already loaded
    CaissaNavigation.init();
}

// Expose globally for other modules
window.CaissaNavigation = CaissaNavigation;
