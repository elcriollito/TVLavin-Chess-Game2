(function () {
    'use strict';

    const CATALOG_URL = '/data/pgn/pgnmentor-historical-catalog.json';
    const GATEWAY_URL = '/api/pgn/pgnmentor?kind=event&file=';
    const MAX_PGN_BYTES = 10 * 1024 * 1024;
    const SAFE_EVENT_FILE = /^[A-Za-z0-9][A-Za-z0-9._()-]{0,119}\.pgn$/;
    const FAMILY_COPY = Object.freeze({
        players: Object.freeze({ title: 'Players', placeholder: 'Search players' }),
        'world-championships': Object.freeze({ title: 'World Championships', placeholder: 'Search year or player' }),
        qualifiers: Object.freeze({ title: 'Candidates & World Cups', placeholder: 'Search year or event' }),
        tournaments: Object.freeze({ title: 'Tournaments', placeholder: 'Search tournaments' }),
        openings: Object.freeze({ title: 'Openings', placeholder: 'Opening search is coming next' })
    });

    const root = document.querySelector('[data-pgn-app]');
    const albumRoot = document.querySelector('[data-pgn-albums]');
    const albumEmpty = document.querySelector('[data-pgn-albums-empty]');
    const nav = document.querySelector('[data-pgn-library-nav]');
    const search = document.querySelector('[data-pgn-library-search]');
    const title = document.querySelector('[data-pgn-library-title]');
    const summary = document.querySelector('[data-pgn-library-summary]');
    const notice = document.querySelector('[data-pgn-library-notice]');
    const noticeTitle = document.querySelector('[data-pgn-library-notice-title]');
    const noticeCopy = document.querySelector('[data-pgn-library-notice-copy]');
    const statusKey = document.querySelector('.pgn-album-status-key');
    const message = document.querySelector('[data-pgn-message]');
    const fileInput = document.querySelector('[data-pgn-file]');
    if (!root || !albumRoot || !nav || !search || !title || !summary || !notice) return;

    const state = {
        activeFamily: 'players',
        catalog: null,
        catalogError: false,
        selectedAlbumId: null,
        query: '',
        renderQueued: false,
        syntheticLoad: false
    };

    function showMessage(text, tone = 'info') {
        if (!message) return;
        message.textContent = text;
        message.dataset.tone = tone;
        message.hidden = false;
    }

    function formatCheckedDate(value) {
        const date = new Date(value);
        if (Number.isNaN(date.valueOf())) return 'Source catalog checked recently';
        return `Source catalog checked ${new Intl.DateTimeFormat('en-US', {
            month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'
        }).format(date)}`;
    }

    function iconFor(item) {
        if (item.kind === 'world-championship') return 'fas fa-crown';
        if (item.kind === 'world-cup') return 'fas fa-trophy';
        if (item.kind === 'interzonal') return 'fas fa-route';
        return 'fas fa-medal';
    }

    function historicalCard(item, family) {
        const wrapper = document.createElement('div');
        wrapper.setAttribute('role', 'listitem');
        wrapper.dataset.libraryFamily = family;
        wrapper.dataset.historicalAlbumItem = item.id;

        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'pgn-album-card pgn-album-card--historical';
        card.dataset.mentorHistoricalAlbumId = item.id;
        card.dataset.albumKind = 'seo-free';
        card.dataset.creditCost = '0';
        card.setAttribute('aria-current', String(item.id === state.selectedAlbumId));

        const icon = document.createElement('i');
        icon.className = iconFor(item);
        icon.setAttribute('aria-hidden', 'true');
        const copy = document.createElement('div');
        const heading = document.createElement('strong');
        heading.textContent = item.title;
        const details = document.createElement('small');
        details.textContent = item.details;
        copy.append(heading, details);
        const badge = document.createElement('span');
        badge.className = 'pgn-album-badge';
        badge.dataset.access = 'free';
        badge.textContent = 'Free';
        card.append(icon, copy, badge);
        wrapper.append(card);
        return wrapper;
    }

    function validateCatalog(catalog) {
        if (!catalog || catalog.playerDirectoryExposed !== false) return false;
        if (catalog.runtimePolicy?.players !== 'physical-caissa-archives-only') return false;
        const families = catalog.families || {};
        if (!Array.isArray(families.worldChampionships) || !Array.isArray(families.qualifiers)) return false;
        const all = [...families.worldChampionships, ...families.qualifiers];
        const ids = new Set();
        return all.length > 100 && all.every(item => {
            if (!item || item.access !== 'free' || !SAFE_EVENT_FILE.test(item.file) || ids.has(item.id)) return false;
            if (item.file.includes('..') || item.file.includes('/') || item.file.includes('\\')) return false;
            ids.add(item.id);
            return true;
        });
    }

    function appendHistoricalCollections() {
        if (!state.catalog) return;
        const existing = new Set([...albumRoot.querySelectorAll('[data-mentor-historical-album-id]')]
            .map(card => card.dataset.mentorHistoricalAlbumId));
        const fragment = document.createDocumentFragment();
        for (const item of state.catalog.families.worldChampionships) {
            if (!existing.has(item.id)) fragment.append(historicalCard(item, 'world-championships'));
        }
        for (const item of state.catalog.families.qualifiers) {
            if (!existing.has(item.id)) fragment.append(historicalCard(item, 'qualifiers'));
        }
        if (fragment.childNodes.length) albumRoot.append(fragment);
    }

    function classifyExistingCollections() {
        for (const item of albumRoot.querySelectorAll(':scope > [role="listitem"]')) {
            if (item.dataset.libraryFamily) continue;
            const card = item.querySelector('.pgn-album-card');
            if (!card) continue;
            if (card.matches('[data-special-album-id="smallchess-world-championship"]')) {
                item.dataset.libraryFamily = 'world-championships';
            } else if (card.matches('[data-special-album-id]')) {
                item.dataset.libraryFamily = 'tournaments';
            } else {
                item.dataset.libraryFamily = 'players';
            }
        }
    }

    function sortPlayerCollections() {
        const items = [...albumRoot.querySelectorAll(':scope > [data-library-family="players"]')];
        const sorted = [...items].sort((left, right) => {
            const leftTitle = left.querySelector('.pgn-album-card strong')?.textContent.trim() || '';
            const rightTitle = right.querySelector('.pgn-album-card strong')?.textContent.trim() || '';
            return leftTitle.localeCompare(rightTitle, 'en', { sensitivity: 'base' });
        });
        if (items.every((item, index) => item === sorted[index])) return;
        const fragment = document.createDocumentFragment();
        for (const item of sorted) fragment.append(item);
        albumRoot.append(fragment);
    }

    function familyItems(family) {
        return [...albumRoot.querySelectorAll(`:scope > [data-library-family="${family}"]`)];
    }

    function updateCounts() {
        for (const family of ['players', 'world-championships', 'qualifiers', 'tournaments']) {
            const counter = nav.querySelector(`[data-pgn-library-count="${family}"]`);
            if (counter) counter.textContent = String(familyItems(family).length);
        }
    }

    function setNotice(heading = '', copy = '') {
        notice.hidden = !heading;
        noticeTitle.textContent = heading;
        noticeCopy.textContent = copy;
    }

    function updateFamilyHeader(visibleCount) {
        const metadata = FAMILY_COPY[state.activeFamily];
        title.textContent = metadata.title;
        search.placeholder = metadata.placeholder;
        search.disabled = state.activeFamily === 'openings';
        statusKey.hidden = state.activeFamily === 'openings';
        albumRoot.hidden = state.activeFamily === 'openings';

        if (state.activeFamily === 'players') {
            const playerUpdate = state.catalog?.sourceUpdates?.players;
            summary.textContent = `${familyItems('players').length} player game collections${playerUpdate ? ` · enrichment source updated ${playerUpdate}` : ''} · stored by CAISSA`;
        } else if (state.activeFamily === 'world-championships') {
            summary.textContent = `${familyItems('world-championships').length} free archives · ${formatCheckedDate(state.catalog?.updatedAt)}`;
        } else if (state.activeFamily === 'qualifiers') {
            summary.textContent = `${familyItems('qualifiers').length} Candidates, World Cup, and Interzonal archives · ${formatCheckedDate(state.catalog?.updatedAt)}`;
        } else if (state.activeFamily === 'tournaments') {
            summary.textContent = `${familyItems('tournaments').length} featured collections · full historical expansion follows this phase`;
        } else {
            summary.textContent = 'Large opening databases will use indexed search instead of full browser downloads';
        }

        if (state.activeFamily === 'openings') {
            const openingUpdate = state.catalog?.sourceUpdates?.openings;
            setNotice('Opening Library is the next indexed phase', `The source catalog${openingUpdate ? ` (updated ${openingUpdate})` : ''} is ready, but CAISSA will search and page these large databases instead of downloading entire ZIP archives into your browser.`);
        } else if (state.catalogError && ['world-championships', 'qualifiers'].includes(state.activeFamily)) {
            setNotice('Historical catalog temporarily unavailable', 'Player albums remain local and unaffected. Try the historical archive again shortly.');
        } else if (!visibleCount && state.query) {
            setNotice('No matching collections', 'Try another player, event, or year.');
        } else {
            setNotice();
        }
    }

    function syncLibrary() {
        state.renderQueued = false;
        appendHistoricalCollections();
        classifyExistingCollections();
        sortPlayerCollections();
        const normalizedQuery = state.query.trim().toLocaleLowerCase();
        let visibleCount = 0;
        for (const item of albumRoot.querySelectorAll(':scope > [role="listitem"]')) {
            const familyMatches = item.dataset.libraryFamily === state.activeFamily;
            const queryMatches = !normalizedQuery || item.textContent.toLocaleLowerCase().includes(normalizedQuery);
            item.hidden = !(familyMatches && queryMatches);
            if (!item.hidden) visibleCount += 1;
        }
        albumRoot.querySelectorAll('[data-mentor-historical-album-id]').forEach(card => {
            card.setAttribute('aria-current', String(card.dataset.mentorHistoricalAlbumId === state.selectedAlbumId));
        });
        nav.querySelectorAll('[data-pgn-library-family]').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.pgnLibraryFamily === state.activeFamily));
        });
        updateCounts();
        updateFamilyHeader(visibleCount);
        if (albumEmpty) albumEmpty.hidden = state.activeFamily === 'openings' || visibleCount > 0 || Boolean(state.query);
    }

    function queueSync() {
        if (state.renderQueued) return;
        state.renderQueued = true;
        queueMicrotask(syncLibrary);
    }

    function setFamily(family, focusSearch = false) {
        if (!FAMILY_COPY[family]) return;
        state.activeFamily = family;
        state.query = '';
        search.value = '';
        syncLibrary();
        if (focusSearch && family !== 'openings') search.focus();
    }

    function findHistoricalAlbum(id) {
        if (!state.catalog) return null;
        return [...state.catalog.families.worldChampionships, ...state.catalog.families.qualifiers]
            .find(item => item.id === id) || null;
    }

    async function loadHistoricalAlbum(card, album) {
        if (!album || root.hasAttribute('aria-busy')) return;
        card.disabled = true;
        showMessage(`Opening ${album.title}…`);
        try {
            const response = await fetch(`${GATEWAY_URL}${encodeURIComponent(album.file)}`, {
                credentials: 'same-origin',
                cache: 'force-cache',
                headers: { Accept: 'application/x-chess-pgn, text/plain;q=0.9' }
            });
            if (!response.ok) throw new Error('The historical collection is temporarily unavailable.');
            const bytes = await response.arrayBuffer();
            if (bytes.byteLength > MAX_PGN_BYTES) throw new Error('This collection exceeds the replayer safety limit.');
            const text = new TextDecoder().decode(bytes);
            if (!text.includes('[Event ') || !text.includes('[White ') || !text.includes('[Black ')) {
                throw new Error('The historical source returned an invalid PGN collection.');
            }
            state.selectedAlbumId = album.id;
            state.syntheticLoad = true;
            root.dispatchEvent(new CustomEvent('caissa:pgn-load-text', {
                detail: { text, sourceLabel: album.title, albumId: album.id }
            }));
            state.syntheticLoad = false;
            syncLibrary();
        } catch (error) {
            state.selectedAlbumId = null;
            state.syntheticLoad = false;
            syncLibrary();
            showMessage(error?.message || 'The historical collection could not be opened.', 'error');
        } finally {
            card.disabled = false;
        }
    }

    nav.addEventListener('click', event => {
        const button = event.target.closest('[data-pgn-library-family]');
        if (button) setFamily(button.dataset.pgnLibraryFamily);
    });
    nav.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        const buttons = [...nav.querySelectorAll('[data-pgn-library-family]')];
        const index = buttons.indexOf(event.target.closest('[data-pgn-library-family]'));
        if (index < 0) return;
        event.preventDefault();
        const direction = event.key === 'ArrowRight' ? 1 : -1;
        const target = buttons[(index + direction + buttons.length) % buttons.length];
        target.focus();
        setFamily(target.dataset.pgnLibraryFamily);
    });
    search.addEventListener('input', () => {
        state.query = search.value;
        syncLibrary();
    });
    albumRoot.addEventListener('click', event => {
        const card = event.target.closest('[data-mentor-historical-album-id]');
        if (!card) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        loadHistoricalAlbum(card, findHistoricalAlbum(card.dataset.mentorHistoricalAlbumId));
    }, true);
    fileInput?.addEventListener('change', () => {
        if (state.syntheticLoad) return;
        state.selectedAlbumId = null;
        queueSync();
    }, true);

    new MutationObserver(queueSync).observe(albumRoot, { childList: true });
    syncLibrary();

    fetch(CATALOG_URL, {
        credentials: 'same-origin',
        cache: 'force-cache',
        headers: { Accept: 'application/json' }
    }).then(response => {
        if (!response.ok) throw new Error('catalog-unavailable');
        return response.json();
    }).then(catalog => {
        if (!validateCatalog(catalog)) throw new Error('catalog-invalid');
        state.catalog = catalog;
        state.catalogError = false;
        syncLibrary();
    }).catch(() => {
        state.catalogError = true;
        syncLibrary();
    });
})();
