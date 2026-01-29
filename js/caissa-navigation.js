/**
 * CAISSA Navigation Module
 * Handles section switching, nav state, and board positioning
 *
 * Part of Phase 1: Vertical Menu Architecture Redesign
 */

const CaissaNavigation = {

    // State
    currentSection: 'play',
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
        document.getElementById('mobileNewGame')?.addEventListener('click', () => {
            this.openNewGameModal();
        });

        document.getElementById('mobileArena')?.addEventListener('click', () => {
            this.navigateToSection('arena');
        });

        document.getElementById('mobileAnalysisToggle')?.addEventListener('click', () => {
            this.toggleMobileAnalysis();
        });

        document.getElementById('closeAnalysisSheet')?.addEventListener('click', () => {
            this.closeMobileAnalysis();
        });

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
            // Cheater Insight - premium gated feature
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
        const targetContainer = document.querySelector(`#${sectionId}Section .board-zone, #${sectionId}Section .board-container`);
        if (targetContainer && !targetContainer.contains(boardEl)) {
            console.log('[CAISSA Nav] Moving board to section:', sectionId);

            // Move board to new section
            const boardWrapper = targetContainer.querySelector('.board-editor-wrapper');
            if (boardWrapper) {
                boardWrapper.insertBefore(boardEl, boardWrapper.firstChild);
            } else {
                targetContainer.insertBefore(boardEl, targetContainer.firstChild);
            }

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
            sheet.classList.toggle('open');
            if (sheet.classList.contains('open')) {
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
        }
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

        // Use existing modal system
        const newGameModal = document.getElementById('newGameModal');
        if (newGameModal) {
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
     * Open Cheater Insight (premium gated)
     */
    openCheaterInsight() {
        console.log('[CAISSA Nav] Opening Cheater Insight...');

        // Check if user is premium (via CaissaAccess or app-container class)
        const isPremium = document.querySelector('.app-container')?.classList.contains('user-premium') ||
                         (window.CaissaAccess && CaissaAccess.hasFeature && CaissaAccess.hasFeature('cheater_insight'));

        if (isPremium) {
            // Premium user - open the actual cheater insight modal
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
        } else {
            // Not premium - show upgrade modal
            this.showPremiumFeatureModal('Cheater Insight', 'Detect suspicious play patterns with AI-powered analysis. Analyze Chess.com games for engine correlation and statistical anomalies.');
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
                arena: 'Arena'
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
                this.currentSection = state.currentSection || 'play';
                this.isNavCollapsed = state.isNavCollapsed || false;

                if (this.isNavCollapsed) {
                    this.elements.appContainer?.classList.add('nav-collapsed');
                }

                console.log('[CAISSA Nav] State restored:', state);
            }
        } catch (e) {
            console.error('[CAISSA Nav] Failed to restore state:', e);
        }
    },

    /**
     * Update UI state
     */
    updateUI() {
        // Ensure correct section is active
        this.navigateToSection(this.currentSection);
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
