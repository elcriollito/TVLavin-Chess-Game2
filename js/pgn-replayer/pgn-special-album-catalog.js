(function () {
    'use strict';

    const SPECIAL_ALBUMS = Object.freeze([
        { id: 'smallchess-world-championship', title: 'World Championship', details: '985 games · Free tournament collection', games: 985, access: 'free', credits: 0, source: '/data/pgn/free/world-championship.pgn', icon: 'fas fa-trophy' },
        { id: 'smallchess-world-rapid-blitz-2021', title: 'World Rapid and Blitz — 2021', details: '2,977 games · Free tournament collection', games: 2977, access: 'free', credits: 0, source: '/data/pgn/free/world-rapid-blitz-2021.pgn', icon: 'fas fa-bolt' },
        { id: 'smallchess-stockfish', title: 'Stockfish Games', details: '373 games · Free engine collection', games: 373, access: 'free', credits: 0, source: '/data/pgn/free/stockfish.pgn', icon: 'fas fa-microchip' },
        { id: 'smallchess-tal-memorial', title: 'Tal Memorial', details: '47 games · Free tournament collection', games: 47, access: 'free', credits: 0, source: '/data/pgn/free/tal-memorial.pgn', icon: 'fas fa-trophy' },
        { id: 'smallchess-tata-chess', title: 'Tata Chess', details: '1,375 games · Free tournament collection', games: 1375, access: 'free', credits: 0, source: '/data/pgn/free/tata-chess.pgn', icon: 'fas fa-trophy' },
        { id: 'smallchess-game-of-the-century', title: 'Game of the Century', details: '1 classic game · Free collection', games: 1, access: 'free', credits: 0, source: '/data/pgn/free/game-of-the-century.pgn', icon: 'fas fa-star' },
        { id: 'smallchess-dortmund-chess', title: 'Dortmund Chess', details: '480 games · Free tournament collection', games: 480, access: 'free', credits: 0, source: '/data/pgn/free/dortmund-chess.pgn', icon: 'fas fa-trophy' },
        { id: 'smallchess-deep-blue-kasparov-1996-game-1', title: 'Deep Blue vs Kasparov — 1996 Game 1', details: '1 historic game · Free collection', games: 1, access: 'free', credits: 0, source: '/data/pgn/free/deep-blue-kasparov-1996-game-1.pgn', icon: 'fas fa-computer' },
        { id: 'smallchess-deep-fritz-kramnik-game-2', title: 'Deep Fritz vs Kramnik — Game 2', details: '1 historic game · Free collection', games: 1, access: 'free', credits: 0, source: '/data/pgn/free/deep-fritz-kramnik-game-2.pgn', icon: 'fas fa-computer' },
        { id: 'smallchess-deep-thought', title: 'Deep Thought', details: '115 games · Free engine collection', games: 115, access: 'free', credits: 0, source: '/data/pgn/free/deep-thought.pgn', icon: 'fas fa-microchip' },
        { id: 'smallchess-sample', title: 'Sample PGN', details: '1 game · Free sample collection', games: 1, access: 'free', credits: 0, source: '/data/pgn/free/sample.pgn', icon: 'fas fa-file-lines' },
        { id: 'smallchess-master-database', title: 'Master Database', details: '20,236 games · Premium master archive', games: 20236, access: 'available', credits: 5, source: null, icon: 'fas fa-database' }
    ]);

    const albumRoot = document.querySelector('[data-pgn-albums]');
    const fileInput = document.querySelector('[data-pgn-file]');
    const message = document.querySelector('[data-pgn-message]');
    if (!albumRoot || !fileInput) return;

    let selectedAlbumId = null;
    let syntheticImport = false;
    let renderQueued = false;

    function accessLabel(album) {
        if (album.access === 'free') return 'Free';
        const credits = Number(album.credits || 1);
        return `${credits} credit${credits === 1 ? '' : 's'}`;
    }

    function createAlbumCard(album) {
        const item = document.createElement('div');
        item.setAttribute('role', 'listitem');
        item.dataset.specialAlbumItem = album.id;

        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'pgn-album-card';
        card.dataset.specialAlbumId = album.id;
        card.dataset.albumKind = album.access === 'free' ? 'seo-free' : 'premium';
        card.setAttribute('aria-current', String(album.id === selectedAlbumId));

        const icon = document.createElement('i');
        icon.className = album.icon || 'fas fa-folder-open';
        icon.setAttribute('aria-hidden', 'true');

        const copy = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = album.title;
        const details = document.createElement('small');
        details.textContent = album.details;
        copy.append(title, details);

        const badge = document.createElement('span');
        badge.className = 'pgn-album-badge';
        badge.dataset.access = album.access;
        badge.textContent = accessLabel(album);

        card.append(icon, copy, badge);
        item.append(card);
        return item;
    }

    function normalizePlayerPricing() {
        albumRoot.querySelectorAll('[data-catalog-album-id]').forEach(card => {
            card.dataset.albumKind = 'player-free';
            card.dataset.creditCost = '0';
            const badge = card.querySelector('.pgn-album-badge');
            if (!badge) return;
            if (badge.dataset.access !== 'free') badge.dataset.access = 'free';
            if (badge.textContent !== 'Free') badge.textContent = 'Free';
        });
    }

    function renderSpecials() {
        renderQueued = false;
        const existingIds = new Set([...albumRoot.querySelectorAll('[data-special-album-id]')].map(card => card.dataset.specialAlbumId));
        const missing = SPECIAL_ALBUMS.filter(album => !existingIds.has(album.id));
        if (missing.length) {
            const fragment = document.createDocumentFragment();
            for (const album of missing) fragment.append(createAlbumCard(album));
            albumRoot.prepend(fragment);
        }
        albumRoot.querySelectorAll('[data-special-album-id]').forEach(card => {
            card.setAttribute('aria-current', String(card.dataset.specialAlbumId === selectedAlbumId));
        });
        if (selectedAlbumId) {
            albumRoot.querySelector('[data-album-id="local-import"]')?.closest('[role="listitem"]')?.remove();
        }
        normalizePlayerPricing();
    }

    function queueRender() {
        if (renderQueued) return;
        renderQueued = true;
        queueMicrotask(renderSpecials);
    }

    function showCatalogMessage(text, tone = 'info') {
        if (!message) return;
        message.textContent = text;
        message.dataset.tone = tone;
        message.hidden = false;
    }

    new MutationObserver(queueRender).observe(albumRoot, { childList: true, subtree: true });

    albumRoot.addEventListener('click', async event => {
        const playerCard = event.target.closest('[data-catalog-album-id]');
        if (playerCard) {
            selectedAlbumId = null;
            queueRender();
            return;
        }

        const card = event.target.closest('[data-special-album-id]');
        if (!card) return;
        event.preventDefault();
        event.stopImmediatePropagation();

        const album = SPECIAL_ALBUMS.find(item => item.id === card.dataset.specialAlbumId);
        if (!album) return;

        if (!album.source) {
            selectedAlbumId = null;
            renderSpecials();
            showCatalogMessage(`Master Database contains ${album.games.toLocaleString()} games and is priced at ${album.credits} credits. Premium delivery will be activated through protected CAISSA storage before purchases are enabled.`);
            return;
        }

        selectedAlbumId = album.id;
        renderSpecials();
        card.disabled = true;
        try {
            const response = await fetch(album.source, {
                credentials: 'same-origin',
                cache: 'force-cache',
                headers: { Accept: 'text/plain' }
            });
            if (!response.ok) throw new Error('The collection is temporarily unavailable.');
            const bytes = await response.arrayBuffer();
            if (bytes.byteLength > 10 * 1024 * 1024) throw new Error('This collection exceeds the 10 MiB free-album safety limit.');
            const transfer = new DataTransfer();
            transfer.items.add(new File([bytes], `${album.title}.pgn`, { type: 'application/x-chess-pgn' }));
            syntheticImport = true;
            fileInput.files = transfer.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            syntheticImport = false;
        } catch (error) {
            selectedAlbumId = null;
            renderSpecials();
            showCatalogMessage(error?.message || 'The collection could not be opened.', 'error');
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

    renderSpecials();
})();
