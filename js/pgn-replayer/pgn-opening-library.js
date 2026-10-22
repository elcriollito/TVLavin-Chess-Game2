import { PgnOpeningProxyClient, isSafeOpeningFile } from './pgn-opening-proxy-client.js';

(function () {
    'use strict';

    const proxyClient = new PgnOpeningProxyClient();

    const root = document.querySelector('[data-pgn-app]');
    const albumRoot = document.querySelector('[data-pgn-albums]');
    const pagebar = document.querySelector('[data-pgn-opening-pagebar]');
    const pageTitle = document.querySelector('[data-pgn-opening-page-title]');
    const pageSummary = document.querySelector('[data-pgn-opening-page-summary]');
    const backButton = document.querySelector('[data-pgn-opening-back]');
    const previousButton = document.querySelector('[data-pgn-opening-previous]');
    const nextButton = document.querySelector('[data-pgn-opening-next]');
    const albumsTab = document.querySelector('[data-pgn-tab="albums"]');
    const openingsButton = document.querySelector('[data-pgn-library-family="openings"]');
    const librarySearch = document.querySelector('[data-pgn-library-search]');
    const message = document.querySelector('[data-pgn-message]');
    const fileInput = document.querySelector('[data-pgn-file]');
    if (!root || !albumRoot || !pagebar || !pageTitle || !pageSummary || !backButton || !previousButton || !nextButton
        || !albumsTab || !openingsButton || !librarySearch) return;

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
            && isSafeOpeningFile(item.file);
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
            const result = await proxyClient.loadPage(opening.file, page);
            state.page = result.page;
            state.pages = result.pages;
            state.totalGames = result.totalGames;
            const pageGames = result.pageGames;
            updatePager(pageGames);
            root.dispatchEvent(new CustomEvent('caissa:pgn-load-text', {
                detail: {
                    text: result.text,
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

    function returnToOpeningLibrary() {
        albumsTab.click();
        openingsButton.click();
        const albumsPanel = librarySearch.closest('[role="tabpanel"]');
        if (albumsPanel) albumsPanel.scrollTop = 0;
        librarySearch.focus({ preventScroll: true });
    }

    albumRoot.addEventListener('click', event => {
        const card = event.target.closest('[data-opening-album-id]');
        if (!card) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const opening = state.catalog.find(item => item.id === card.dataset.openingAlbumId);
        loadPage(opening, 1);
    }, true);
    backButton.addEventListener('click', returnToOpeningLibrary);
    previousButton.addEventListener('click', () => loadPage(state.selected, state.page - 1));
    nextButton.addEventListener('click', () => loadPage(state.selected, state.page + 1));
    root.addEventListener('caissa:pgn-load-text', event => {
        if (event.detail?.openingPage) return;
        resetPager();
    });
    fileInput?.addEventListener('change', resetPager);
    new MutationObserver(queueCatalogRender).observe(albumRoot, { childList: true });

    proxyClient.loadCatalog().then(catalog => {
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
