/**
 * CAISSA Onboarding
 *
 * First-time product discovery flow
 */

const CaissaOnboarding = {
    // State
    currentStep: 0,
    isActive: false,
    totalSteps: 6,
    isPreviewMode: false,
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
                <p class="onboarding-eyebrow">YOUR CHESS, EXPANDED</p>
                <p class="onboarding-lead">Play, study, analyze, and explore chess far beyond the ordinary board.</p>
                <p class="onboarding-product-line" aria-label="Six million plus puzzles, Mentor, live chess, engine battles, and deep analysis">
                    <span>6M+ puzzles</span><span>Mentor</span><span>Live chess</span><span>Engine battles</span><span>Deep analysis</span>
                </p>
            `,
            buttonText: 'Explore CAISSA'
        },
        {
            title: '6M+ Chess Puzzles',
            icon: 'puzzle-piece',
            content: `
                <p>Train with more than six million real chess puzzles across themes, motifs, openings, special moves, and rating-based difficulty.</p>
            `,
            cta: { label: 'Explore Puzzles', route: '/puzzles' },
            buttonText: 'Next'
        },
        {
            title: 'CAISSA Mentor',
            icon: 'graduation-cap',
            content: `
                <p>Ask questions, explore positions, and understand the ideas behind your moves with an interactive chess mentor.</p>
            `,
            cta: { label: 'Meet Mentor', route: '/mentor' },
            buttonText: 'Next'
        },
        {
            title: 'Play Your Way',
            icon: 'chess-board',
            content: `
                <p>Challenge the engine, play Bots, train with Coach, or connect to live players through FICS.</p>
            `,
            cta: { label: 'Play Chess', route: '/play' },
            buttonText: 'Next'
        },
        {
            title: 'Engine Battles',
            icon: 'trophy',
            content: `
                <p>Watch chess engines compete in matches and tournaments with live moves, evaluations, standings, and analysis.</p>
            `,
            cta: { label: 'Open Engine Arena', route: '/arena' },
            buttonText: 'Next'
        },
        {
            title: 'Analyze Everything',
            icon: 'chart-line',
            content: `
                <p>Open PGNs, explore real variation trees, compare ideas, flip the board, and analyze without losing the main line.</p>
            `,
            cta: { label: 'Open Analyzer', route: '/analyze' },
            buttonText: 'Start Exploring'
        }
    ],

    isLocalPreviewRequested() {
        return ['127.0.0.1', 'localhost', '::1'].includes(window.location.hostname)
            && new URLSearchParams(window.location.search).get('welcome-preview') === '1';
    },

    /**
     * Initialize onboarding system
     */
    init() {
        // Check if user has completed onboarding
        const completed = localStorage.getItem(this.STORAGE_KEY);

        this.isPreviewMode = this.isLocalPreviewRequested();

        if (this.isPreviewMode) {
            this.openTimer = setTimeout(() => {
                this.openTimer = null;
                this.show({ preview: true });
            }, 0);
        } else if (!completed) {
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
    show(options = {}) {
        if (this.isActive) return;

        this.isActive = true;
        this.isPreviewMode = options.preview === true;
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
            <div class="onboarding-content" role="dialog" aria-modal="true" aria-labelledby="onboardingTitle" aria-describedby="onboardingDescription">
                <button id="onboardingSkip" class="onboarding-skip" aria-label="Skip welcome">
                    <i class="fas fa-times"></i> Skip
                </button>
                <div class="onboarding-step-indicator" aria-label="Welcome progress">
                    <span id="onboardingStepText" aria-live="polite">1 of ${this.totalSteps}</span>
                    <div id="onboardingProgressDots" class="onboarding-progress-dots" aria-hidden="true"></div>
                </div>
                <div id="onboardingStepContent" class="onboarding-step-content"></div>
                <div class="onboarding-footer">
                    <button id="onboardingPrev" class="btn btn-secondary" hidden>
                        <i class="fas fa-arrow-left"></i> Previous
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
        const progressDots = document.getElementById('onboardingProgressDots');
        const footer = document.querySelector('.onboarding-footer');

        // Update step indicator
        stepTextEl.textContent = `${this.currentStep + 1} of ${this.totalSteps}`;
        progressDots.innerHTML = this.steps.map((_, index) =>
            `<span class="onboarding-progress-dot${index === this.currentStep ? ' is-active' : ''}"></span>`
        ).join('');

        // Update content
        contentEl.innerHTML = `
            <div class="onboarding-icon" aria-hidden="true">
                <i class="fas fa-${step.icon}"></i>
            </div>
            <h2 id="onboardingTitle" class="onboarding-title">${step.title}</h2>
            <div id="onboardingDescription" class="onboarding-body">${step.content}</div>
            ${step.cta ? `<a class="onboarding-card-cta" data-onboarding-route href="${step.cta.route}">${step.cta.label} <i class="fas fa-arrow-right" aria-hidden="true"></i></a>` : ''}
        `;

        contentEl.querySelector('[data-onboarding-route]')?.addEventListener('click', () => this.complete());

        // Update button text
        nextBtn.innerHTML = step.buttonText === 'Start Exploring'
            ? `${step.buttonText} <i class="fas fa-check"></i>`
            : `${step.buttonText} <i class="fas fa-arrow-right"></i>`;

        // Show/hide prev button
        prevBtn.hidden = this.currentStep === 0;
        footer?.classList.toggle('onboarding-footer--first', this.currentStep === 0);
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
        if (!this.isPreviewMode) localStorage.setItem(this.STORAGE_KEY, 'true');
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
        this.isPreviewMode = false;
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
