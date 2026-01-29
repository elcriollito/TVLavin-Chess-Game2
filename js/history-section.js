/**
 * CAISSA History Section
 * Placeholder for game history browser
 *
 * Part of Phase 2: Section Migration
 */

const HistorySection = {

    // DOM cache
    elements: {},

    /**
     * Initialize History section
     */
    init() {
        console.log('[History] Initializing...');
        this.cacheElements();
        this.bindEvents();
        console.log('[History] Ready');
    },

    /**
     * Cache DOM elements
     */
    cacheElements() {
        this.elements = {
            openLibraryBtn: document.getElementById('openLibraryFromHistory')
        };
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Open library button
        this.elements.openLibraryBtn?.addEventListener('click', () => {
            this.openLibrary();
        });
    },

    /**
     * Open Library panel
     */
    openLibrary() {
        console.log('[History] Opening Library panel...');

        // Use existing LibraryUI
        if (window.LibraryUI && typeof window.LibraryUI.open === 'function') {
            window.LibraryUI.open();
        } else {
            // Fallback: click the toggle button
            const toggleBtn = document.getElementById('libraryToggleBtn');
            if (toggleBtn) {
                toggleBtn.click();
            }
        }
    },

    /**
     * Section lifecycle: Enter
     */
    onEnter() {
        console.log('[History] Section entered');
    },

    /**
     * Section lifecycle: Exit
     */
    onExit() {
        console.log('[History] Section exited');
    }
};

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        HistorySection.init();
    });
} else {
    HistorySection.init();
}

// Register with navigation system
if (window.CaissaNavigation) {
    CaissaNavigation.sections.history = HistorySection;
}

// Expose globally
window.HistorySection = HistorySection;
