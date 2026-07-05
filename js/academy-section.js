/**
 * CAISSA Academy Section
 *
 * Foundation-only shell for Season 5.0. This module registers Academy with
 * the existing navigation system and intentionally avoids engines, bots, LLMs,
 * networking, and training logic.
 */

const CaissaAcademySection = {
    elements: {},

    init() {
        this.cacheElements();
    },

    cacheElements() {
        this.elements = {
            section: document.getElementById('academySection'),
            title: document.getElementById('academyTitle')
        };
    },

    onEnter() {
        this.elements.section?.setAttribute('data-academy-state', 'ready');
    },

    onExit() {
        this.elements.section?.removeAttribute('data-academy-state');
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => CaissaAcademySection.init());
} else {
    CaissaAcademySection.init();
}

if (window.CaissaNavigation) {
    window.CaissaNavigation.registerSection('academy', CaissaAcademySection);
}

window.CaissaAcademySection = CaissaAcademySection;
