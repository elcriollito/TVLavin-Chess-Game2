/**
 * CAISSA Classic Section
 *
 * Season 4.3A foundation only. This module intentionally keeps the retro
 * lounge disconnected from FICS/gameplay until a later integration phase.
 */
(function() {
    'use strict';

    const YahooClassicSection = {
        onEnter() {
            const section = document.getElementById('yahooClassicSection');
            if (!section) return;
            section.dataset.ready = 'true';
        },

        onExit() {
            // No live resources yet; future phases can clean up room polling here.
        }
    };

    if (window.CaissaNavigation?.registerSection) {
        window.CaissaNavigation.registerSection('yahooClassic', YahooClassicSection);
    } else {
        window.addEventListener('DOMContentLoaded', () => {
            window.CaissaNavigation?.registerSection?.('yahooClassic', YahooClassicSection);
        });
    }

    window.CaissaYahooClassic = YahooClassicSection;
})();
