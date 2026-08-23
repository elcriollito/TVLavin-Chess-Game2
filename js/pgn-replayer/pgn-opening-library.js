(function () {
    'use strict';

    const CATALOG_URL = '/api/pgn/opening';
    const PAGE_URL = '/api/pgn/opening?file=';
    const MAX_PAGE_BYTES = 10 * 1024 * 1024;
    const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9._()\-]{0,119}\.zip$/;

    const root = document.querySelector('[data-pgn-app]');
    const albumRoot = document.querySelector('[data-pgn-albums]');
    const pagebar = document.querySelector('[data-pgn-opening-pagebar]');
    const pageTitle = document.querySelector('[data-pgn-opening-page-title]');
    const pageSummary = document.querySelector('[data-pgn-opening-page-summary]');
    const previousButton = document.querySelector('[data-pgn-opening-previous]');
    const nextButton = document.querySelector('[data-pgn-opening-next]');
    const message = document.querySelector('[data-pgn-message]');
    const fileInput = document.querySelector('[data-pgn-file]');
    if (!root || !albumRoot || !pagebar || !pageTitle || !pageSummary || !previousButton || !nextButton) return;

    const state = {
        catalog: [],
        selected: null,
        page: 0,
        pages: 0,
        totalGames: 0,
        busy: false
    };
    let renderQueued = false;

    function showMessage(text, tone = 'info') {
        if (!message) return;
        message.textContent = text;
        message.dataset.tone = tone;
        message.hidden = false;
    }

    function validItem(item) {
        return item
            && typeof item.id === 'string'
            && typeof item.title === 'string'
            && SAFE_FILE.test(item.file)
            && !/[\\/]|\.\./.test(item.file);
    }

    function openingCard(opening) {
        const wrapper = document.createElement('div');
        wrapper.setAttribute('role', 'listitem');
        wrapper.dataset.libraryFamily = 'openings';
        wrapper.dataset.openingAlbumItem = opening.id;

        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'pgn-album-card pgn-album-card--opening';
        card.dataset.openingAlbumId = opening.id;
        card.dataset.albumKind = 'seo-free';
        card.dataset.creditCost = '0';
        card.setAttribute('aria-current', String(opening.id === state.selected?.id));

        const icon = document.createElement('i');
        icon.className = 'fas fa-book-open';
        icon.setAttribute('aria-hidden', 'true');
        const copy = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = opening.title;
        const details = document.createElement('small');
        details.textContent = 'Paged opening collection · 100 games at a time';
        copy.append(title, details);
        const badge = document.createElement('span');
        badge.className = 'pgn-album-badge';
        badge.dataset.access = 'free';
        badge.textContent = 'Free';
        card.append(icon, copy, badge);
        wrapper.append(card);
        return wrapper;
    }

    function renderCatalog() {
        const existing = new Set([...albumRoot.querySelectorAll('[data-opening-album-id]')]
            .map(card => card.dataset.openingAlbumId));
        const fragment = document.createDocumentFragment();
        for (const opening of state.catalog) {
            if (!existing.has(opening.id)) fragment.append(openingCard(opening));
        }
        if (fragment.childNodes.length) albumRoot.append(fragment);
        albumRoot.querySelectorAll('[data-opening-album-id]').forEach(card => {
            card.setAttribute('aria-current', String(card.dataset.openingAlbumId === state.selected?.id));
        });
    }

    function queueCatalogRender() {
        if (renderQueued || !state.catalog.length) return;
        renderQueued = true;
        queueMicrotask(() => {
            renderQueued = false;
            renderCatalog();
        });
    }

    function updatePager(pageGames = 0) {
        if (!state.selected || !state.page || !state.pages) {
            pagebar.hidden = true;
            return;
        }
        const firstGame = (state.page - 1) * 100 + 1;
        const lastGame = firstGame + Math.max(0, pageGames - 1);
        pagebar.hidden = false;
        pageTitle.textContent = state.selected.title;
        pageSummary.textContent = `Games ${firstGame.toLocaleString()}–${lastGame.toLocaleString()} of ${state.totalGames.toLocaleString()} · Page ${state.page} of ${state.pages}`;
        previousButton.disabled = state.busy || state.page <= 1;
        nextButton.disabled = state.busy || state.page >= state.pages;
    }

    async function loadPage(opening, page) {
        if (!opening || state.busy) return;
        state.busy = true;
        state.selected = opening;
        renderCatalog();
        previousButton.disabled = true;
        nextButton.disabled = true;
        showMessage(`Opening ${opening.title} · page ${page}…`);
        try {
            const response = await fetch(`${PAGE_URL}${encodeURIComponent(opening.file)}&page=${page}`, {
                credentials: 'same-origin',
                cache: 'force-cache',
                headers: { Accept: 'application/x-chess-pgn, text/plain;q=0.9' }
            });
            if (!response.ok) throw new Error('This opening page is temporarily unavailable.');
            const bytes = await response.arrayBuffer();
            if (bytes.byteLength > MAX_PAGE_BYTES) throw new Error('This opening page exceeds the replayer safety limit.');
            const text = new TextDecoder().decode(bytes);
            if (!text.includes('[Event ') || !text.includes('[White ') || !text.includes('[Black ')) {
                throw new Error('The opening source returned an invalid PGN page.');
            }
            state.page = Number(response.headers.get('X-CAISSA-Opening-Page') || page);
            state.pages = Number(response.headers.get('X-CAISSA-Opening-Pages') || 1);
            state.totalGames = Number(response.headers.get('X-CAISSA-Opening-Games') || 0);
            const pageGames = Number(response.headers.get('X-CAISSA-Opening-Page-Games') || 0);
            updatePager(pageGames);
            root.dispatchEvent(new CustomEvent('caissa:pgn-load-text', {
                detail: {
                    text,
                    sourceLabel: `${opening.title} · page ${state.page} of ${state.pages}`,
                    albumId: `${opening.id}-page-${state.page}`,
                    openingPage: true
                }
            }));
        } catch (error) {
            showMessage(error?.message || 'The opening collection could not be opened.', 'error');
            if (!state.page) {
                state.selected = null;
                updatePager();
            }
        } finally {
            state.busy = false;
            renderCatalog();
            updatePager(Number(responsePageGames()));
        }
    }

    function responsePageGames() {
        if (!state.page || !state.totalGames) return 0;
        return Math.min(100, state.totalGames - ((state.page - 1) * 100));
    }

    function resetPager() {
        state.selected = null;
        state.page = 0;
        state.pages = 0;
        state.totalGames = 0;
        updatePager();
        renderCatalog();
    }

    albumRoot.addEventListener('click', event => {
        const card = event.target.closest('[data-opening-album-id]');
        if (!card) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const opening = state.catalog.find(item => item.id === card.dataset.openingAlbumId);
        loadPage(opening, 1);
    }, true);
    previousButton.addEventListener('click', () => loadPage(state.selected, state.page - 1));
    nextButton.addEventListener('click', () => loadPage(state.selected, state.page + 1));
    root.addEventListener('caissa:pgn-load-text', event => {
        if (event.detail?.openingPage) return;
        resetPager();
    });
    fileInput?.addEventListener('change', resetPager);
    new MutationObserver(queueCatalogRender).observe(albumRoot, { childList: true });

    fetch(CATALOG_URL, {
        credentials: 'same-origin',
        cache: 'force-cache',
        headers: { Accept: 'application/json' }
    }).then(response => {
        if (!response.ok) throw new Error('catalog-unavailable');
        return response.json();
    }).then(catalog => {
        if (catalog?.access !== 'free' || catalog?.pageSize !== 100 || !Array.isArray(catalog.openings)
            || catalog.openings.length !== 233 || !catalog.openings.every(validItem)) {
            throw new Error('catalog-invalid');
        }
        state.catalog = catalog.openings;
        renderCatalog();
    }).catch(() => {
        showMessage('The Opening Library catalog is temporarily unavailable.', 'error');
    });
})();
