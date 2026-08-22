(function () {
    'use strict';

    const MENTOR_PLAYER_ALBUMS = Object.freeze([
        { id: "pgnmentor-david-bronstein", title: "David Bronstein", details: "1,930 games · CAISSA physical archive", games: 1930, source: "/data/pgn/players/pgnmentor/david-bronstein.pgn" },
        { id: "pgnmentor-aron-nimzowitsch", title: "Aron Nimzowitsch", details: "512 games · CAISSA physical archive", games: 512, source: "/data/pgn/players/pgnmentor/aron-nimzowitsch.pgn" },
        { id: "pgnmentor-akiba-rubinstein", title: "Akiba Rubinstein", details: "797 games · CAISSA physical archive", games: 797, source: "/data/pgn/players/pgnmentor/akiba-rubinstein.pgn" },
        { id: "pgnmentor-bent-larsen", title: "Bent Larsen", details: "2,383 games · CAISSA physical archive", games: 2383, source: "/data/pgn/players/pgnmentor/bent-larsen.pgn" },
        { id: "pgnmentor-richard-reti", title: "Richard Réti", details: "646 games · CAISSA physical archive", games: 646, source: "/data/pgn/players/pgnmentor/richard-reti.pgn" },
        { id: "pgnmentor-miguel-najdorf", title: "Miguel Najdorf", details: "1,604 games · CAISSA physical archive", games: 1604, source: "/data/pgn/players/pgnmentor/miguel-najdorf.pgn" },
        { id: "pgnmentor-svetozar-gligoric", title: "Svetozar Gligorić", details: "2,898 games · CAISSA physical archive", games: 2898, source: "/data/pgn/players/pgnmentor/svetozar-gligoric.pgn" },
        { id: "pgnmentor-efim-geller", title: "Efim Geller", details: "2,198 games · CAISSA physical archive", games: 2198, source: "/data/pgn/players/pgnmentor/efim-geller.pgn" },
        { id: "pgnmentor-ruslan-ponomariov", title: "Ruslan Ponomariov", details: "2,714 games · CAISSA physical archive", games: 2714, source: "/data/pgn/players/pgnmentor/ruslan-ponomariov.pgn" },
        { id: "pgnmentor-alexander-khalifman", title: "Alexander Khalifman", details: "2,348 games · CAISSA physical archive", games: 2348, source: "/data/pgn/players/pgnmentor/alexander-khalifman.pgn" },
        { id: "pgnmentor-rustam-kasimdzhanov", title: "Rustam Kasimdzhanov", details: "1,858 games · CAISSA physical archive", games: 1858, source: "/data/pgn/players/pgnmentor/rustam-kasimdzhanov.pgn" },
        { id: "pgnmentor-nona-gaprindashvili", title: "Nona Gaprindashvili", details: "1,256 games · CAISSA physical archive", games: 1256, source: "/data/pgn/players/pgnmentor/nona-gaprindashvili.pgn" },
        { id: "pgnmentor-maia-chiburdanidze", title: "Maia Chiburdanidze", details: "1,346 games · CAISSA physical archive", games: 1346, source: "/data/pgn/players/pgnmentor/maia-chiburdanidze.pgn" },
        { id: "pgnmentor-xie-jun", title: "Xie Jun", details: "701 games · CAISSA physical archive", games: 701, source: "/data/pgn/players/pgnmentor/xie-jun.pgn" },
        { id: "pgnmentor-susan-polgar", title: "Susan (Zsuzsa) Polgar", details: "909 games · CAISSA physical archive", games: 909, source: "/data/pgn/players/pgnmentor/susan-polgar.pgn" },
        { id: "pgnmentor-antoaneta-stefanova", title: "Antoaneta Stefanova", details: "3,668 games · CAISSA physical archive", games: 3668, source: "/data/pgn/players/pgnmentor/antoaneta-stefanova.pgn" }
    ]);
    const albumRoot = document.querySelector('[data-pgn-albums]');
    const fileInput = document.querySelector('[data-pgn-file]');
    if (!albumRoot || !fileInput) return;

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
        icon.className = 'fas fa-chess-knight';
        icon.setAttribute('aria-hidden', 'true');
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
            const response = await fetch(album.source, { credentials: 'same-origin', cache: 'force-cache', headers: { Accept: 'text/plain' } });
            if (!response.ok) throw new Error('The collection is temporarily unavailable.');
            const bytes = await response.arrayBuffer();
            if (bytes.byteLength > 10 * 1024 * 1024) throw new Error('This collection exceeds the 10 MiB replayer safety limit.');
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
