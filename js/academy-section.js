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
        this.bindLearningPathFilters();
    },

    cacheElements() {
        this.elements = {
            section: document.getElementById('academySection'),
            title: document.getElementById('academyTitle'),
            pathFilters: Array.from(document.querySelectorAll('[data-academy-path-filter]')),
            pathCards: Array.from(document.querySelectorAll('[data-academy-path-difficulty]')),
            pathFilterNote: document.querySelector('[data-academy-path-filter-note]')
        };
    },

    bindLearningPathFilters() {
        if (!this.elements.pathFilters?.length || !this.elements.pathCards?.length) return;

        this.elements.pathFilters.forEach((filterButton) => {
            filterButton.addEventListener('click', () => {
                const filter = filterButton.dataset.academyPathFilter || 'all';
                this.applyLearningPathFilter(filter);
            });
        });
    },

    applyLearningPathFilter(filter) {
        const normalizedFilter = filter || 'all';
        let visibleCount = 0;

        this.elements.pathFilters.forEach((button) => {
            const isActive = button.dataset.academyPathFilter === normalizedFilter;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-pressed', String(isActive));
        });

        this.elements.pathCards.forEach((card) => {
            const matches = normalizedFilter === 'all' || card.dataset.academyPathDifficulty === normalizedFilter;
            card.hidden = !matches;
            if (matches) visibleCount += 1;
        });

        if (this.elements.pathFilterNote) {
            const label = normalizedFilter === 'all'
                ? 'all learning paths'
                : `${normalizedFilter} learning paths`;
            this.elements.pathFilterNote.textContent = `Showing ${visibleCount} ${label}. Filters are active in this beta; lessons still remain Coming Soon.`;
        }
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
