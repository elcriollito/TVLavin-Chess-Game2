(function () {
    'use strict';

    const MENTOR_PLAYER_ALBUMS = Object.freeze([
        { id: "pgnmentor-akiba-rubinstein", title: "Akiba Rubinstein", details: "Player game collection · PGN", games: 797 },
        { id: "pgnmentor-alexander-khalifman", title: "Alexander Khalifman", details: "Player game collection · PGN", games: 2348 },
        { id: "pgnmentor-antoaneta-stefanova", title: "Antoaneta Stefanova", details: "Player game collection · PGN", games: 3668 },
        { id: "pgnmentor-aron-nimzowitsch", title: "Aron Nimzowitsch", details: "Player game collection · PGN", games: 512 },
        { id: "pgnmentor-bent-larsen", title: "Bent Larsen", details: "Player game collection · PGN", games: 2383 },
        { id: "pgnmentor-david-bronstein", title: "David Bronstein", details: "Player game collection · PGN", games: 1930 },
        { id: "pgnmentor-efim-geller", title: "Efim Geller", details: "Player game collection · PGN", games: 2198 },
        { id: "pgnmentor-maia-chiburdanidze", title: "Maia Chiburdanidze", details: "Player game collection · PGN", games: 1346 },
        { id: "pgnmentor-miguel-najdorf", title: "Miguel Najdorf", details: "Player game collection · PGN", games: 1604 },
        { id: "pgnmentor-nona-gaprindashvili", title: "Nona Gaprindashvili", details: "Player game collection · PGN", games: 1256 },
        { id: "pgnmentor-richard-reti", title: "Richard Réti", details: "Player game collection · PGN", games: 646 },
        { id: "pgnmentor-ruslan-ponomariov", title: "Ruslan Ponomariov", details: "Player game collection · PGN", games: 2714 },
        { id: "pgnmentor-rustam-kasimdzhanov", title: "Rustam Kasimdzhanov", details: "Player game collection · PGN", games: 1858 },
        { id: "pgnmentor-susan-polgar", title: "Susan (Zsuzsa) Polgar", details: "Player game collection · PGN", games: 909 },
        { id: "pgnmentor-svetozar-gligoric", title: "Svetozar Gligorić", details: "Player game collection · PGN", games: 2898 },
        { id: "pgnmentor-xie-jun", title: "Xie Jun", details: "Player game collection · PGN", games: 701 }
    ]);
    const albumRoot = document.querySelector('[data-pgn-albums]');
    const fileInput = document.querySelector('[data-pgn-file]');
    const iconography = window.CaissaPgnPlayerIconography;
    if (!albumRoot || !fileInput || !iconography) return;

    let selectedAlbumId = null;
    let syntheticImport = false;
    let renderQueued = false;

    function createAlbumCard(album) {
        const item = document.createElement('div');
        item.setAttribute('role', 'listitem');
        item.dataset.mentorPlayerAlbumItem = album.id;
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'pgn-album-card';
        card.dataset.mentorPlayerAlbumId = album.id;
        card.dataset.albumKind = 'player-premium';
        card.dataset.creditCost = '1';
        card.setAttribute('aria-current', String(album.id === selectedAlbumId));
        const icon = document.createElement('i');
        iconography.decorate(icon, card, album.title);
        const copy = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = album.title;
        const details = document.createElement('small');
        details.textContent = album.details;
        copy.append(title, details);
        const badge = document.createElement('span');
        badge.className = 'pgn-album-badge';
        badge.dataset.access = 'available';
        badge.textContent = '1 credit';
        card.append(icon, copy, badge);
        item.append(card);
        return item;
    }

    function renderCatalog() {
        renderQueued = false;
        const existingIds = new Set([...albumRoot.querySelectorAll('[data-mentor-player-album-id]')].map(card => card.dataset.mentorPlayerAlbumId));
        for (const album of MENTOR_PLAYER_ALBUMS) {
            if (existingIds.has(album.id)) continue;
            albumRoot.append(createAlbumCard(album));
        }
        albumRoot.querySelectorAll('[data-mentor-player-album-id]').forEach(card => {
            card.setAttribute('aria-current', String(card.dataset.mentorPlayerAlbumId === selectedAlbumId));
        });
        if (selectedAlbumId) albumRoot.querySelector('[data-album-id="local-import"]')?.closest('[role="listitem"]')?.remove();
    }

    function queueRender() {
        if (renderQueued) return;
        renderQueued = true;
        queueMicrotask(renderCatalog);
    }

    new MutationObserver(queueRender).observe(albumRoot, { childList: true });

    albumRoot.addEventListener('click', async event => {
        const card = event.target.closest('[data-mentor-player-album-id]');
        if (!card) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const album = MENTOR_PLAYER_ALBUMS.find(item => item.id === card.dataset.mentorPlayerAlbumId);
        if (!album) return;
        selectedAlbumId = album.id;
        renderCatalog();
        card.disabled = true;
        try {
            if (!window.CaissaPgnEntitlements) throw new Error('Protected album access is unavailable.');
            const bytes = await window.CaissaPgnEntitlements.fetchAlbum(album);
            if (!bytes) { selectedAlbumId = null; renderCatalog(); return; }
            const transfer = new DataTransfer();
            transfer.items.add(new File([bytes], `${album.title}.pgn`, { type: 'application/x-chess-pgn' }));
            syntheticImport = true;
            try {
                fileInput.files = transfer.files;
                fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            } finally {
                syntheticImport = false;
            }
        } catch (error) {
            selectedAlbumId = null;
            renderCatalog();
            const message = document.querySelector('[data-pgn-message]');
            if (message) {
                message.textContent = error?.message || 'The collection could not be opened.';
                message.dataset.tone = 'error';
                message.hidden = false;
            }
        } finally {
            card.disabled = false;
        }
    }, true);

    fileInput.addEventListener('change', () => {
        if (!syntheticImport) {
            selectedAlbumId = null;
            queueRender();
        }
    }, true);

    renderCatalog();
})();
