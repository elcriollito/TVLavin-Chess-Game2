/**
 * CAISSA Insights Section
 * Landing page for Caissa Insight modal
 *
 * Part of Phase 2: Section Migration
 */

const InsightsSection = {

    // DOM cache
    elements: {},

    /**
     * Initialize Insights section
     */
    init() {
        console.log('[Insights] Initializing...');
        this.cacheElements();
        this.bindEvents();
        console.log('[Insights] Ready');
    },

    /**
     * Cache DOM elements
     */
    cacheElements() {
        this.elements = {
            openModalBtn1: document.getElementById('openInsightModal'),
            openModalBtn2: document.getElementById('openInsightModal2'),
            insightModal: document.getElementById('insightModal'),
            headerInsightBtn: document.getElementById('caissaInsightBtn')
        };
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Open modal buttons in section
        this.elements.openModalBtn1?.addEventListener('click', () => {
            this.openInsightModal();
        });

        this.elements.openModalBtn2?.addEventListener('click', () => {
            this.openInsightModal();
        });
    },

    /**
     * Open the Caissa Insight modal
     */
    openInsightModal() {
        console.log('[Insights] Opening Caissa Insight modal...');

        // Use existing modal system from app.js
        if (window.showModal) {
            window.showModal('insightModal');
        } else if (this.elements.insightModal) {
            // Fallback: manually show modal
            this.elements.insightModal.classList.add('show');
        }
    },

    /**
     * Section lifecycle: Enter
     */
    onEnter() {
        console.log('[Insights] Section entered');
        // Nothing special needed on enter
    },

    /**
     * Section lifecycle: Exit
     */
    onExit() {
        console.log('[Insights] Section exited');
        // Nothing special needed on exit
    }
};

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        InsightsSection.init();
    });
} else {
    InsightsSection.init();
}

// Register with navigation system
if (window.CaissaNavigation) {
    CaissaNavigation.sections.insights = InsightsSection;
}

// Expose globally
window.InsightsSection = InsightsSection;
