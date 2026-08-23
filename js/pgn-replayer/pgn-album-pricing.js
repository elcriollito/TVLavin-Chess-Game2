(function () {
    'use strict';

    const policy = Object.freeze({
        freeSpecialCredits: 0,
        playerAlbumCredits: 0,
        capablancaCredits: 0,
        masterDatabaseCredits: 5,
        enforcement: 'server-entitlement'
    });
    window.CaissaPgnAlbumPricing = policy;

    const albumRoot = document.querySelector('[data-pgn-albums]');
    if (!albumRoot) return;

    let queued = false;

    function setPrice(card, credits) {
        if (!card) return;
        const badge = card.querySelector('.pgn-album-badge');
        if (!badge) return;
        card.dataset.creditCost = String(credits);
        if (credits === 0) {
            badge.dataset.access = 'free';
            if (badge.textContent !== 'Free') badge.textContent = 'Free';
            return;
        }
        const albumId = card.dataset.albumId || card.dataset.catalogAlbumId || card.dataset.mentorPlayerAlbumId || '';
        const owned = window.CaissaPgnEntitlements?.isOwned?.(albumId) === true;
        badge.dataset.access = owned ? 'owned' : 'available';
        const label = `${credits} credit${credits === 1 ? '' : 's'}`;
        const finalLabel = owned ? 'Owned' : label;
        if (badge.textContent !== finalLabel) badge.textContent = finalLabel;
    }

    function applyPolicy() {
        queued = false;
        setPrice(albumRoot.querySelector('[data-album-id="capablanca-games-1901-1941"]'), policy.capablancaCredits);
        albumRoot.querySelectorAll('[data-catalog-album-id]').forEach(card => setPrice(card, policy.playerAlbumCredits));
        albumRoot.querySelectorAll('[data-mentor-player-album-id]').forEach(card => setPrice(card, policy.playerAlbumCredits));
        albumRoot.querySelectorAll('[data-special-album-id][data-album-kind="seo-free"]').forEach(card => setPrice(card, policy.freeSpecialCredits));
        albumRoot.querySelectorAll('[data-mentor-historical-album-id]').forEach(card => setPrice(card, policy.freeSpecialCredits));
        setPrice(albumRoot.querySelector('[data-special-album-id="smallchess-master-database"]'), policy.masterDatabaseCredits);
    }

    function queuePolicy() {
        if (queued) return;
        queued = true;
        queueMicrotask(applyPolicy);
    }

    new MutationObserver(queuePolicy).observe(albumRoot, { childList: true, subtree: true });
    document.addEventListener('caissa:pgn-entitlements-changed', queuePolicy);
    applyPolicy();
})();
