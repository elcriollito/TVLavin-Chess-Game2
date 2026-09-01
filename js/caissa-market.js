(function () {
    'use strict';
    const pathname = window.location.pathname.replace(/\/$/, '') || '/market';
    const section = pathname.startsWith('/market/books')
        ? 'books'
        : pathname.startsWith('/market/recommendations')
            ? 'recommendations'
            : pathname.startsWith('/account/downloads')
                ? 'downloads'
                : 'software';

    document.documentElement.dataset.caissaMarketStatus = 'prelaunch';
    document.documentElement.dataset.productionBuyEnabled = 'false';
    document.documentElement.dataset.caissaMarketSection = section;
})();
