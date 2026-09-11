/**
 * CAISSA Onboarding
 *
 * First-time user onboarding flow with multi-step tutorial
 */

const CaissaOnboarding = {
    // State
    currentStep: 0,
    isActive: false,
    totalSteps: 5,
    previouslyFocusedElement: null,
    backgroundState: new Map(),
    backgroundObserver: null,
    openTimer: null,
    entranceTimer: null,
    removeTimer: null,
    keydownHandler: null,

    // Storage key
    STORAGE_KEY: 'caissa_onboarding_completed',

    // Steps configuration
    steps: [
        {
            title: 'Welcome to CAISSA Chess',
            icon: 'chess-knight',
            content: `
                <p>CAISSA is your free, AI-powered chess analysis platform.</p>
                <p>Let's take a quick tour of the key features.</p>
            `,
            buttonText: 'Start Tour'
        },
        {
            title: 'Powerful Analysis',
            icon: 'microchip',
            content: `
                <p><strong>Stockfish 2019 MV</strong> runs directly in your browser with multi-variant analysis.</p>
                <p>Load FEN positions or PGN games from the <strong>Game Library</strong> to get instant engine evaluations.</p>
            `,
            buttonText: 'Next'
        },
        {
            title: 'AI Mentor',
            icon: 'graduation-cap',
            content: `
                <p>Click the <strong>Mentor</strong> button to ask questions about any position.</p>
                <p>Get human-readable explanations powered by LLMs (Together.ai, OpenAI, Anthropic, or local models).</p>
                <p><em>Tip: Try "Human" mode for strategic insights or "Engine" mode for tactical lines.</em></p>
            `,
            buttonText: 'Next'
        },
        {
            title: 'Your Library',
            icon: 'book',
            content: `
                <p>Save positions and games to your personal library (click the <strong>Library</strong> button on the left).</p>
                <p>Sign in to enable <strong>cloud sync</strong> across devices.</p>
                <p>Use the <strong>Query Engine</strong> to search your library with natural language.</p>
            `,
            buttonText: 'Next'
        },
        {
            title: "You're All Set!",
            icon: 'check-circle',
            content: `
                <p>You're ready to start analyzing. Here are some quick tips:</p>
                <ul class="onboarding-tips-list">
                    <li><strong>Load a game</strong> from the Game Library to practice analysis</li>
                    <li><strong>Engine vs Engine</strong> mode lets you test openings and watch AI battles</li>
                    <li><strong>CAISSA Insight</strong> analyzes your entire Chess.com game history</li>
                    <li><strong>Position Forge</strong> lets you build custom positions with drag-and-drop</li>
                </ul>
                <p><em>Need help? Check out the <a href="/about" target="_blank">About</a> page or <a href="/roadmap" target="_blank">Roadmap</a>.</em></p>
            `,
            buttonText: 'Get Started'
        }
    ],

    /**
     * Initialize onboarding system
     */
    init() {
        // Check if user has completed onboarding
        const completed = localStorage.getItem(this.STORAGE_KEY);

        if (!completed) {
            // Show onboarding after a short delay
            this.openTimer = setTimeout(() => {
                this.openTimer = null;
                if (!localStorage.getItem(this.STORAGE_KEY)) this.show();
            }, 1500);
        }

        // Listen for manual trigger
        window.addEventListener('caissa-show-onboarding', () => this.show());

        if (window.CaissaLog) {
            CaissaLog.info('Onboarding', 'Initialized', { completed: !!completed });
        }
    },

    /**
     * Show onboarding modal
     */
    show() {
        if (this.isActive) return;

        this.isActive = true;
        this.currentStep = 0;
        this.previouslyFocusedElement = document.activeElement;

        // Create modal
        this.createModal();
        this.renderStep();

        if (window.CaissaLog) {
            CaissaLog.info('Onboarding', 'Started');
        }
    },

    /**
     * Create onboarding modal DOM
     */
    createModal() {
        // Remove existing modal if present
        const existing = document.getElementById('caissaOnboardingModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'caissaOnboardingModal';
        modal.className = 'onboarding-modal';
        modal.innerHTML = `
            <div class="onboarding-backdrop" aria-hidden="true"></div>
            <div class="onboarding-content" role="dialog" aria-modal="true" aria-labelledby="onboardingTitle">
                <button id="onboardingSkip" class="onboarding-skip" aria-label="Skip tour">
                    <i class="fas fa-times"></i> Skip
                </button>
                <div class="onboarding-step-indicator">
                    <span id="onboardingStepText" aria-live="polite">1 of ${this.totalSteps}</span>
                </div>
                <div id="onboardingStepContent" class="onboarding-step-content"></div>
                <div class="onboarding-footer">
                    <button id="onboardingPrev" class="btn btn-secondary" style="visibility: hidden;">
                        <i class="fas fa-arrow-left"></i> Back
                    </button>
                    <button id="onboardingNext" class="btn btn-primary">
                        Next <i class="fas fa-arrow-right"></i>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this.disableBackground(modal);

        // Bind events
        document.getElementById('onboardingSkip').addEventListener('click', () => this.skip());
        document.getElementById('onboardingNext').addEventListener('click', () => this.next());
        document.getElementById('onboardingPrev').addEventListener('click', () => this.prev());
        this.keydownHandler = event => this.handleKeydown(event);
        document.addEventListener('keydown', this.keydownHandler);

        // Add entrance animation
        this.entranceTimer = setTimeout(() => {
            this.entranceTimer = null;
            modal.classList.add('onboarding-modal--visible');
            document.getElementById('onboardingNext')?.focus();
        }, 10);
    },

    /**
     * Make every page-level sibling non-interactive while the modal is open.
     */
    disableBackground(modal) {
        this.backgroundState.clear();

        const disable = element => {
            if (!(element instanceof HTMLElement) || element === modal || this.backgroundState.has(element)) return;
            this.backgroundState.set(element, element.inert);
            element.inert = true;
        };

        Array.from(document.body.children).forEach(disable);
        this.backgroundObserver = new MutationObserver(records => {
            records.forEach(record => Array.from(record.addedNodes).forEach(disable));
        });
        this.backgroundObserver.observe(document.body, { childList: true });
    },

    /**
     * Restore each page-level sibling to the inert state it had before opening.
     */
    restoreBackground() {
        this.backgroundObserver?.disconnect();
        this.backgroundObserver = null;

        this.backgroundState.forEach((wasInert, element) => {
            if (element.isConnected) element.inert = wasInert;
        });
        this.backgroundState.clear();
    },

    /**
     * Return the currently operable controls in DOM tab order.
     */
    getFocusableElements() {
        const dialog = document.querySelector('#caissaOnboardingModal [role="dialog"]');
        if (!dialog) return [];

        const selector = [
            'a[href]',
            'button:not([disabled])',
            'input:not([disabled])',
            'select:not([disabled])',
            'textarea:not([disabled])',
            '[contenteditable="true"]',
            '[tabindex]:not([tabindex="-1"])'
        ].join(',');

        return Array.from(dialog.querySelectorAll(selector)).filter(element => {
            const style = window.getComputedStyle(element);
            return !element.closest('[hidden], [inert]')
                && style.display !== 'none'
                && style.visibility !== 'hidden'
                && element.getClientRects().length > 0;
        });
    },

    /**
     * Keep keyboard focus in the modal and share Escape with Skip Tour.
     */
    handleKeydown(event) {
        if (!this.isActive) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            this.skip();
            return;
        }

        if (event.key !== 'Tab') return;

        const focusable = this.getFocusableElements();
        if (!focusable.length) {
            event.preventDefault();
            return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const activeElement = document.activeElement;

        if (!focusable.includes(activeElement)) {
            event.preventDefault();
            (event.shiftKey ? last : first).focus();
        } else if (event.shiftKey && activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    },

    /**
     * Render current step
     */
    renderStep() {
        const step = this.steps[this.currentStep];
        const contentEl = document.getElementById('onboardingStepContent');
        const stepTextEl = document.getElementById('onboardingStepText');
        const nextBtn = document.getElementById('onboardingNext');
        const prevBtn = document.getElementById('onboardingPrev');

        // Update step indicator
        stepTextEl.textContent = `${this.currentStep + 1} of ${this.totalSteps}`;

        // Update content
        contentEl.innerHTML = `
            <div class="onboarding-icon">
                <i class="fas fa-${step.icon}"></i>
            </div>
            <h2 id="onboardingTitle" class="onboarding-title">${step.title}</h2>
            <div class="onboarding-body">${step.content}</div>
        `;

        // Update button text
        nextBtn.innerHTML = step.buttonText === 'Get Started'
            ? `${step.buttonText} <i class="fas fa-check"></i>`
            : `${step.buttonText} <i class="fas fa-arrow-right"></i>`;

        // Show/hide prev button
        prevBtn.style.visibility = this.currentStep > 0 ? 'visible' : 'hidden';
    },

    /**
     * Go to next step
     */
    next() {
        if (this.currentStep < this.totalSteps - 1) {
            this.currentStep++;
            this.renderStep();
        } else {
            this.complete();
        }
    },

    /**
     * Go to previous step
     */
    prev() {
        if (this.currentStep > 0) {
            this.currentStep--;
            this.renderStep();
        }
    },

    /**
     * Skip onboarding
     */
    skip() {
        if (window.CaissaLog) {
            CaissaLog.info('Onboarding', 'Skipped', { step: this.currentStep });
        }

        this.complete();
    },

    /**
     * Complete onboarding
     */
    complete() {
        // Mark as completed
        localStorage.setItem(this.STORAGE_KEY, 'true');
        if (this.openTimer) {
            clearTimeout(this.openTimer);
            this.openTimer = null;
        }

        if (window.CaissaLog) {
            CaissaLog.info('Onboarding', 'Completed');
        }

        this.close();
    },

    /**
     * Close modal
     */
    close() {
        const modal = document.getElementById('caissaOnboardingModal');
        if (modal) {
            modal.classList.remove('onboarding-modal--visible');
            modal.setAttribute('aria-hidden', 'true');
            modal.inert = true;
            this.removeTimer = setTimeout(() => {
                modal.remove();
                this.removeTimer = null;
            }, 300);
        }

        if (this.entranceTimer) {
            clearTimeout(this.entranceTimer);
            this.entranceTimer = null;
        }
        if (this.keydownHandler) {
            document.removeEventListener('keydown', this.keydownHandler);
            this.keydownHandler = null;
        }

        this.restoreBackground();
        this.isActive = false;
        this.restoreFocus();
    },

    /**
     * Restore the user's pre-modal focus, or use the visible page heading/main.
     */
    restoreFocus() {
        const previous = this.previouslyFocusedElement;
        this.previouslyFocusedElement = null;

        if (this.canReceiveFocus(previous)) {
            previous.focus();
            return;
        }

        const fallbackSelectors = [
            'main h1', '[role="main"] h1', 'h1', 'main', '[role="main"]',
            'a[href]', 'button:not([disabled])'
        ];
        let fallback = null;
        for (const selector of fallbackSelectors) {
            fallback = Array.from(document.querySelectorAll(selector))
                .find(element => this.isVisible(element) && !element.closest('[inert]'));
            if (fallback) break;
        }

        if (!fallback) return;

        const hadTabindex = fallback.hasAttribute('tabindex');
        if (!this.canReceiveFocus(fallback)) fallback.setAttribute('tabindex', '-1');
        fallback.focus();

        if (!hadTabindex) {
            fallback.addEventListener('blur', () => fallback.removeAttribute('tabindex'), { once: true });
        }
    },

    isVisible(element) {
        if (!(element instanceof HTMLElement) || !element.isConnected) return false;
        const style = window.getComputedStyle(element);
        return !element.closest('[hidden]')
            && style.display !== 'none'
            && style.visibility !== 'hidden'
            && element.getClientRects().length > 0;
    },

    canReceiveFocus(element) {
        if (!this.isVisible(element) || element.closest('[inert]')) return false;
        if (element.matches('button, input, select, textarea') && element.disabled) return false;
        return element.tabIndex >= 0;
    },

    /**
     * Reset onboarding (for testing)
     */
    reset() {
        localStorage.removeItem(this.STORAGE_KEY);
        if (window.CaissaLog) {
            CaissaLog.info('Onboarding', 'Reset');
        }
    }
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        CaissaOnboarding.init();
    });
} else {
    CaissaOnboarding.init();
}

// Expose globally for manual triggering
window.CaissaOnboarding = CaissaOnboarding;
