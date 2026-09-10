(function installFicsLayoutShell(root) {
    'use strict';

    const SCHEMA_VERSION = '1.1.0';
    const FLAG = 'CAISSA_FICS_REDESIGN_ENABLED';
    const LOBBY_VIEWS = Object.freeze(['tables', 'players', 'seek']);
    const GAME_STATES = new Set(['PLAYING', 'OBSERVING', 'GAME_OVER']);
    const PRODUCT_EVENTS = Object.freeze([
        'authenticated', 'lobby-updated', 'style12', 'game-ended', 'disconnected', 'observer-left',
        'observation-requested', 'observation-settled', 'observation-error'
    ]);
    let mounted = null;
    let selectedLobbyView = null;
    let lastGameModeAvailable = false;
    let resizeObserver = null;
    let resizeFrame = 0;
    let actionNotice = null;
    const seekDraft = { minutes: '5', increment: '0', rated: 'unrated', color: 'random' };
    const eventListeners = [];

    function createElement(tag, className, attributes = {}) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
        return element;
    }

    function getBaseViewState() {
        return root.CaissaFICSPresentation?.getViewState?.() || Object.freeze({
            productState: 'DISCONNECTED', bodyMode: 'CONNECTION', activeTab: null,
            primaryGameMode: false, gameModeAvailable: false, returnToGameAvailable: false
        });
    }

    function getViewState() {
        const options = selectedLobbyView ? { requestedLobbyView: selectedLobbyView } : {};
        return root.CaissaFICSPresentation?.getViewState?.(options) || getBaseViewState();
    }

    function getProjection() {
        const options = selectedLobbyView ? { requestedLobbyView: selectedLobbyView } : {};
        return root.CaissaFICSPresentation?.getSnapshot?.(options) || {
            productState: 'DISCONNECTED', connection: { authenticated: false }, session: {},
            lobby: { activeTables: [], pendingSeek: null, playersSupported: false }, game: {},
            capabilities: { observeTable: false, createSeek: false, cancelSeek: false },
            presentation: getViewState()
        };
    }

    function bodyCopy(view) {
        if (view.primaryGameMode) return {
            title: 'Game',
            message: 'The active game remains on the existing FICS board. Game Mode tools arrive in a later redesign phase.'
        };
        if (view.activeTab === 'players') return {
            title: 'Players',
            message: 'A complete FICS player directory is not available yet. No player list is shown.'
        };
        if (view.productState === 'AUTHENTICATING') return {
            title: 'Connecting', message: 'FICS authentication is in progress. Login and connection status remain available below.'
        };
        if (view.productState === 'RECONNECTING') return {
            title: 'Reconnecting', message: 'The retained game snapshot is not treated as live while the connection is unavailable.'
        };
        if (view.productState === 'ERROR') return {
            title: 'Connection unavailable', message: 'Review the existing FICS connection controls below and try again.'
        };
        return {
            title: 'FICS', message: 'Connect below to browse tables, seek a game, or observe play.'
        };
    }

    function appendText(parent, tag, className, text, attributes = {}) {
        const element = createElement(tag, className, attributes);
        element.textContent = text;
        parent.append(element);
        return element;
    }

    function rememberFocus() {
        const active = document.activeElement;
        if (!mounted?.body.contains(active)) return null;
        return {
            key: active.dataset.ficsFocusKey || null,
            start: typeof active.selectionStart === 'number' ? active.selectionStart : null,
            end: typeof active.selectionEnd === 'number' ? active.selectionEnd : null
        };
    }

    function restoreFocus(focus) {
        if (!focus?.key || !mounted) return;
        const schedule = root.requestAnimationFrame || ((callback) => root.setTimeout(callback, 0));
        schedule(() => {
            const target = [...mounted.body.querySelectorAll('[data-fics-focus-key]')]
                .find((node) => node.dataset.ficsFocusKey === focus.key);
            if (!target) return;
            target.focus({ preventScroll: true });
            if (focus.start !== null && typeof target.setSelectionRange === 'function') {
                target.setSelectionRange(focus.start, focus.end);
            }
        });
    }

    function noticeNode(view) {
        if (!actionNotice || actionNotice.view !== view) return null;
        const notice = createElement('p', `fics-rd3-notice is-${actionNotice.type}`, {
            role: actionNotice.type === 'error' ? 'alert' : 'status'
        });
        notice.textContent = actionNotice.message;
        return notice;
    }

    function tablePlayer(name, rating) {
        const row = createElement('span', 'fics-rd3-table-player');
        appendText(row, 'strong', 'fics-rd3-table-player-name', name || '—');
        appendText(row, 'span', 'fics-rd3-table-rating', rating || 'rating —');
        return row;
    }

    function renderTables(snapshot) {
        const wrapper = createElement('div', 'fics-rd3-tables', { 'data-fics-body-view': 'tables' });
        const heading = createElement('div', 'fics-rd3-body-heading');
        const headingCopy = createElement('div');
        appendText(headingCopy, 'h3', 'fics-rd3-title', 'Active Tables');
        appendText(headingCopy, 'p', 'fics-rd3-subtitle', 'Recently reported games from a capped FICS feed; this is not a complete server directory.');
        const refresh = appendText(heading, 'button', 'fics-rd3-secondary-action', 'Refresh', {
            type: 'button', 'data-fics-focus-key': 'tables-refresh'
        });
        refresh.disabled = !snapshot.connection.authenticated || snapshot.lobby.loading;
        refresh.addEventListener('click', () => {
            actionNotice = { view: 'tables', type: 'status', message: 'Requesting recent FICS games…' };
            root.CaissaFICSClient?.refreshLobby?.(true);
            render();
        });
        heading.prepend(headingCopy);
        wrapper.append(heading);
        const notice = noticeNode('tables');
        if (notice) wrapper.append(notice);

        const tables = Array.isArray(snapshot.lobby.activeTables) ? snapshot.lobby.activeTables : [];
        if (snapshot.lobby.loading && !tables.length) {
            appendText(wrapper, 'p', 'fics-rd3-empty', 'Loading recently reported games…', { role: 'status' });
            return wrapper;
        }
        if (!tables.length) {
            const message = snapshot.connection.authenticated
                ? 'No recently reported games are available. Refresh to ask FICS again.'
                : 'Connect to FICS to load recently reported games.';
            appendText(wrapper, 'p', 'fics-rd3-empty', message, { role: 'status' });
            return wrapper;
        }

        const list = createElement('div', 'fics-rd3-table-list', { role: 'list', 'aria-label': 'Recently reported FICS games' });
        tables.forEach((table) => {
            const number = table.number === null || table.number === undefined ? null : String(table.number);
            const card = createElement('article', 'fics-rd3-table-card', { role: 'listitem' });
            const identity = createElement('div', 'fics-rd3-table-identity');
            appendText(identity, 'span', 'fics-rd3-table-number', number ? `#${number}` : '#—');
            const players = createElement('div', 'fics-rd3-table-players');
            players.append(tablePlayer(table.white, table.whiteRating));
            appendText(players, 'span', 'fics-rd3-versus', 'vs');
            players.append(tablePlayer(table.black, table.blackRating));
            identity.append(players);

            const details = [
                table.timeControl || 'time —',
                typeof table.rated === 'boolean' ? (table.rated ? 'Rated' : 'Casual') : table.rated,
                table.variant,
                table.observers ? `${table.observers} watching` : null
            ].filter(Boolean);
            appendText(identity, 'p', 'fics-rd3-table-meta', details.join(' · '));

            const current = snapshot.game.observed && String(snapshot.game.gameNumber) === number;
            const own = [table.white, table.black].some((name) => name
                && snapshot.session.username && String(name).toLowerCase() === String(snapshot.session.username).toLowerCase());
            const inFlight = snapshot.lobby.observationRequest?.target === number;
            const button = appendText(card, 'button', 'fics-rd3-primary-action', current ? 'Watching' : inFlight ? 'Opening…' : 'Observe', {
                type: 'button', 'data-fics-focus-key': `observe-${number || 'unknown'}`,
                'aria-label': `Observe table ${number || 'unknown'}: ${table.white || 'unknown'} versus ${table.black || 'unknown'}`
            });
            button.disabled = !number || own || current || inFlight || !snapshot.capabilities.observeTable;
            button.addEventListener('click', () => {
                const result = root.CaissaFICSClient?.switchObservedGame?.(number)
                    || { ok: false, code: 'OBSERVE_UNAVAILABLE' };
                actionNotice = result.ok
                    ? { view: 'tables', type: 'status', message: `Opening table #${number}…` }
                    : { view: 'tables', type: 'error', message: `Table #${number} could not be opened (${result.code}).` };
                render();
            });
            card.prepend(identity);
            list.append(card);
        });
        wrapper.append(list);
        return wrapper;
    }

    function seekStatusCopy(pending) {
        if (pending.status === 'cancel_requested') return 'Cancel requested. Waiting for the local FICS refresh.';
        if (pending.status === 'error') return pending.error || 'The last seek action was not delivered.';
        if (pending.status === 'creating') return 'Sending your table request…';
        return 'Command sent. Waiting for a FICS opponent; server acknowledgement is not available.';
    }

    function renderPendingSeek(snapshot, pending) {
        const card = createElement('div', 'fics-rd3-pending-seek', {
            role: pending.status === 'error' ? 'alert' : 'status', 'aria-live': 'polite'
        });
        appendText(card, 'span', 'fics-rd3-waiting-label', pending.status === 'error' ? 'Action needs attention' : 'Waiting for opponent');
        appendText(card, 'strong', 'fics-rd3-pending-time', pending.timeControl || 'Time —');
        const preferences = [
            typeof pending.rated === 'boolean' ? (pending.rated ? 'Rated' : 'Casual') : null,
            pending.color === 'white' ? 'Play as White' : pending.color === 'black' ? 'Play as Black' : 'Random color'
        ].filter(Boolean);
        appendText(card, 'span', 'fics-rd3-pending-meta', preferences.join(' · '));
        appendText(card, 'p', 'fics-rd3-pending-message', seekStatusCopy(pending));
        const cancel = appendText(card, 'button', 'fics-rd3-cancel-action', pending.status === 'error' ? 'Try Cancel Again' : pending.status === 'cancel_requested' ? 'Canceling…' : 'Cancel', {
            type: 'button', 'data-fics-focus-key': 'seek-cancel'
        });
        cancel.disabled = pending.status === 'cancel_requested' || !snapshot.capabilities.cancelSeek;
        cancel.addEventListener('click', () => {
            const result = root.CaissaFICSClient?.cancelSeek?.() || { ok: false, code: 'CANCEL_UNAVAILABLE' };
            actionNotice = result.ok
                ? { view: 'seek', type: 'status', message: 'Cancellation requested.' }
                : { view: 'seek', type: 'error', message: `The seek could not be canceled (${result.code}).` };
            render();
        });
        return card;
    }

    function labeledControl(form, labelText, control) {
        const group = createElement('div', 'fics-rd3-field');
        const key = control.dataset.ficsFocusKey || labelText.toLowerCase().replace(/[^a-z]+/g, '-');
        control.id = `ficsRd3-${key}`;
        const label = appendText(group, 'label', 'fics-rd3-label', labelText, { for: control.id });
        label.htmlFor = control.id;
        group.append(control);
        form.append(group);
        return control;
    }

    function renderSeek(snapshot) {
        const wrapper = createElement('div', 'fics-rd3-seek', { 'data-fics-body-view': 'seek' });
        appendText(wrapper, 'h3', 'fics-rd3-title', 'Create Table');
        appendText(wrapper, 'p', 'fics-rd3-subtitle', 'Choose a time control and how you would like to play.');
        const notice = noticeNode('seek');
        if (notice) wrapper.append(notice);
        const pending = snapshot.lobby.pendingSeek;
        const pendingActive = pending && (pending.status !== 'error' || pending.operation === 'cancel');
        if (pendingActive) {
            wrapper.append(renderPendingSeek(snapshot, pending));
            return wrapper;
        }
        if (pending?.status === 'error') {
            appendText(wrapper, 'p', 'fics-rd3-notice is-error', pending.error || 'The table request was not delivered.', { role: 'alert' });
        }

        const form = createElement('form', 'fics-rd3-seek-form', { 'aria-label': 'Create FICS table' });
        const timeRow = createElement('div', 'fics-rd3-time-row');
        const minutes = createElement('input', 'fics-rd3-input', {
            type: 'number', min: '1', max: '180', step: '1', required: '', inputmode: 'numeric',
            value: seekDraft.minutes, 'data-fics-focus-key': 'seek-minutes'
        });
        minutes.value = seekDraft.minutes;
        const increment = createElement('input', 'fics-rd3-input', {
            type: 'number', min: '0', max: '60', step: '1', required: '', inputmode: 'numeric',
            value: seekDraft.increment, 'data-fics-focus-key': 'seek-increment'
        });
        increment.value = seekDraft.increment;
        labeledControl(timeRow, 'Time (minutes)', minutes);
        labeledControl(timeRow, 'Increment (seconds)', increment);
        form.append(timeRow);

        const game = createElement('select', 'fics-rd3-select', { 'data-fics-focus-key': 'seek-rated' });
        [['unrated', 'Casual'], ['rated', 'Rated']].forEach(([value, label]) => {
            const option = createElement('option');
            option.value = value;
            option.textContent = label;
            game.append(option);
        });
        game.value = seekDraft.rated;
        labeledControl(form, 'Game', game);

        const color = createElement('select', 'fics-rd3-select', { 'data-fics-focus-key': 'seek-color' });
        [['white', 'White'], ['random', 'Random'], ['black', 'Black']].forEach(([value, label]) => {
            const option = createElement('option');
            option.value = value;
            option.textContent = label;
            color.append(option);
        });
        color.value = seekDraft.color;
        labeledControl(form, 'Play as', color);

        [minutes, increment, game, color].forEach((control) => {
            control.addEventListener('input', () => {
                seekDraft.minutes = minutes.value;
                seekDraft.increment = increment.value;
                seekDraft.rated = game.value;
                seekDraft.color = color.value;
            });
        });
        const submit = appendText(form, 'button', 'fics-rd3-create-action', 'Create Table', {
            type: 'submit', 'data-fics-focus-key': 'seek-submit'
        });
        submit.disabled = !snapshot.capabilities.createSeek;
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            if (!form.reportValidity()) return;
            seekDraft.minutes = minutes.value;
            seekDraft.increment = increment.value;
            seekDraft.rated = game.value;
            seekDraft.color = color.value;
            const result = root.CaissaFICSClient?.requestSeek?.({
                minutes: minutes.value,
                increment: increment.value,
                rated: game.value,
                color: color.value
            }) || { ok: false, code: 'SEEK_UNAVAILABLE' };
            actionNotice = result.ok
                ? { view: 'seek', type: 'status', message: 'Table request sent.' }
                : root.CaissaFICSClient?.pendingSeek?.status === 'error'
                    ? null
                    : { view: 'seek', type: 'error', message: result.message || `The table request failed (${result.code}).` };
            render();
        });
        wrapper.append(form);
        if (!snapshot.capabilities.createSeek) {
            const reason = snapshot.presentation.gameModeAvailable
                ? 'Return from the active game before creating a new table.'
                : 'Connect to FICS to create a table.';
            appendText(wrapper, 'p', 'fics-rd3-form-note', reason);
        }
        return wrapper;
    }

    function renderBody(snapshot, view) {
        const focus = rememberFocus();
        const dynamic = mounted.dynamic;
        dynamic.replaceChildren();
        const lobbyBody = view.activeTab === 'tables' || view.activeTab === 'seek';
        mounted.placeholder.hidden = lobbyBody;
        dynamic.hidden = !lobbyBody;
        if (view.activeTab === 'tables') dynamic.append(renderTables(snapshot));
        if (view.activeTab === 'seek') dynamic.append(renderSeek(snapshot));
        restoreFocus(focus);
    }

    function scheduleBoardResize() {
        if (resizeFrame) root.cancelAnimationFrame?.(resizeFrame);
        const schedule = root.requestAnimationFrame || ((callback) => root.setTimeout(callback, 0));
        resizeFrame = schedule(() => {
            resizeFrame = 0;
            if (!mounted?.section?.classList.contains('fics-rd2-enabled')) return;
            if (!mounted.boardContainer.offsetParent) return;
            root.CaissaFICSClient?.board?.resize?.();
        });
    }

    function render() {
        if (!mounted) return null;
        const baseView = getBaseViewState();
        if (baseView.gameModeAvailable && !lastGameModeAvailable) selectedLobbyView = null;
        lastGameModeAvailable = baseView.gameModeAvailable;
        const snapshot = getProjection();
        const view = { productState: snapshot.productState, ...snapshot.presentation };
        const activeTab = view.activeTab;

        mounted.section.dataset.ficsProductState = view.productState;
        mounted.body.dataset.ficsBodyMode = view.bodyMode;
        mounted.body.toggleAttribute('data-game-mode', view.primaryGameMode);
        mounted.tabs.forEach((tab) => {
            const selected = tab.dataset.ficsLobbyView === activeTab;
            tab.setAttribute('aria-selected', String(selected));
            tab.tabIndex = selected || (!activeTab && tab.dataset.ficsLobbyView === 'tables') ? 0 : -1;
        });

        if (activeTab) mounted.body.setAttribute('aria-labelledby', `ficsRd2Tab${activeTab[0].toUpperCase()}${activeTab.slice(1)}`);
        else mounted.body.removeAttribute('aria-labelledby');
        mounted.returnToGame.hidden = !view.returnToGameAvailable;

        const copy = bodyCopy(view);
        mounted.bodyTitle.textContent = copy.title;
        mounted.bodyMessage.textContent = copy.message;
        renderBody(snapshot, view);

        mounted.roomPanel.hidden = true;
        mounted.sidePanel.hidden = !view.primaryGameMode;
        scheduleBoardResize();
        return view;
    }

    function selectLobbyView(view) {
        if (!LOBBY_VIEWS.includes(view)) return false;
        if (selectedLobbyView !== view) actionNotice = null;
        selectedLobbyView = view;
        render();
        return true;
    }

    function returnToGame() {
        if (!getBaseViewState().gameModeAvailable) return false;
        selectedLobbyView = null;
        render();
        return true;
    }

    function bindProductUpdates() {
        if (!root.addEventListener) return;
        PRODUCT_EVENTS.forEach((event) => {
            const type = `caissa:fics:${event}`;
            const listener = () => render();
            root.addEventListener(type, listener);
            eventListeners.push({ type, listener });
        });
    }

    function unbindProductUpdates() {
        eventListeners.splice(0).forEach(({ type, listener }) => root.removeEventListener?.(type, listener));
    }

    function mount() {
        if (mounted) return true;
        const section = document.getElementById('ficsSection');
        const layout = section?.querySelector('.fics-layout');
        const gameArea = section?.querySelector('.fics-game-area');
        const connection = section?.querySelector('.fics-connection');
        const boardSection = section?.querySelector('.fics-board-section');
        const boardContainer = document.getElementById('ficsBoardContainer');
        const roomPanel = section?.querySelector('.fics-room-panel');
        const sidePanel = section?.querySelector('.fics-side-panel');
        const consoleSection = section?.querySelector('.fics-console-section');
        if (![section, layout, gameArea, connection, boardSection, boardContainer,
            roomPanel, sidePanel, consoleSection].every(Boolean)) return false;

        const shell = createElement('div', 'fics-rd2-shell', { 'data-fics-redesign-shell': 'v2' });
        const boardRegion = createElement('div', 'fics-rd2-board', {
            'data-fics-shell-region': 'board', role: 'group', 'aria-label': 'FICS chessboard'
        });
        const workspace = createElement('aside', 'fics-rd2-workspace', {
            'data-fics-shell-region': 'workspace', 'aria-label': 'FICS workspace'
        });
        const head = createElement('header', 'fics-rd2-workspace-head', { 'data-fics-workspace-region': 'head' });
        const tabList = createElement('div', 'fics-rd2-tabs', { role: 'tablist', 'aria-label': 'FICS lobby views' });
        const tabs = LOBBY_VIEWS.map((view) => {
            const label = `${view[0].toUpperCase()}${view.slice(1)}`;
            const tab = createElement('button', 'fics-rd2-tab', {
                id: `ficsRd2Tab${label}`, type: 'button', role: 'tab',
                'aria-controls': 'ficsRd2Body', 'aria-selected': 'false', 'data-fics-lobby-view': view
            });
            tab.textContent = label;
            tab.addEventListener('click', () => selectLobbyView(view));
            return tab;
        });
        tabs.forEach((tab) => tabList.append(tab));
        tabList.addEventListener('keydown', (event) => {
            const current = tabs.indexOf(document.activeElement);
            if (current < 0) return;
            const target = event.key === 'ArrowRight' ? (current + 1) % tabs.length
                : event.key === 'ArrowLeft' ? (current - 1 + tabs.length) % tabs.length
                    : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
            if (target < 0) return;
            event.preventDefault();
            tabs[target].focus();
            selectLobbyView(tabs[target].dataset.ficsLobbyView);
        });
        head.append(tabList);

        const body = createElement('section', 'fics-rd2-workspace-body', {
            id: 'ficsRd2Body', role: 'tabpanel', tabindex: '0', 'data-fics-workspace-region': 'body'
        });
        const returnToGameButton = createElement('button', 'fics-rd2-return-game', {
            type: 'button', 'aria-label': 'Return to active FICS game'
        });
        returnToGameButton.textContent = '\u2190 Game';
        returnToGameButton.hidden = true;
        returnToGameButton.addEventListener('click', returnToGame);
        const placeholder = createElement('div', 'fics-rd2-placeholder', { role: 'status', 'aria-live': 'polite' });
        const bodyTitle = createElement('h3', 'fics-rd2-placeholder-title');
        const bodyMessage = createElement('p', 'fics-rd2-placeholder-message');
        placeholder.append(bodyTitle, bodyMessage);
        const dynamic = createElement('div', 'fics-rd3-dynamic-body', { 'aria-live': 'off' });
        const compatibility = createElement('div', 'fics-rd2-compatibility', {
            'data-fics-compatibility-region': 'legacy-controls'
        });
        body.append(returnToGameButton, placeholder, dynamic, compatibility);

        const foot = createElement('footer', 'fics-rd2-workspace-foot', { 'data-fics-workspace-region': 'foot' });
        workspace.append(head, body, foot);
        shell.append(boardRegion, workspace);
        layout.insertBefore(shell, gameArea);
        boardRegion.append(boardSection);
        compatibility.append(roomPanel, sidePanel);
        foot.append(connection, consoleSection);
        gameArea.hidden = true;
        section.classList.add('fics-rd2-enabled');
        section.dataset.ficsRedesign = 'v2';

        mounted = { section, layout, gameArea, connection, boardSection, boardContainer,
            roomPanel, sidePanel, consoleSection, shell, boardRegion, workspace, head,
            body, foot, tabs, returnToGame: returnToGameButton, placeholder, dynamic, bodyTitle, bodyMessage };
        if (typeof root.ResizeObserver === 'function') {
            resizeObserver = new root.ResizeObserver(scheduleBoardResize);
            resizeObserver.observe(boardRegion);
        }
        root.addEventListener?.('resize', scheduleBoardResize, { passive: true });
        root.addEventListener?.('orientationchange', scheduleBoardResize, { passive: true });
        bindProductUpdates();
        render();
        return true;
    }

    function unmount() {
        if (!mounted) return true;
        const current = mounted;
        unbindProductUpdates();
        resizeObserver?.disconnect();
        resizeObserver = null;
        root.removeEventListener?.('resize', scheduleBoardResize);
        root.removeEventListener?.('orientationchange', scheduleBoardResize);
        current.boardSection.append(current.consoleSection);
        current.gameArea.append(current.roomPanel, current.boardSection, current.sidePanel);
        current.layout.insertBefore(current.connection, current.gameArea);
        current.gameArea.hidden = false;
        current.shell.remove();
        current.section.classList.remove('fics-rd2-enabled');
        delete current.section.dataset.ficsRedesign;
        delete current.section.dataset.ficsProductState;
        mounted = null;
        selectedLobbyView = null;
        lastGameModeAvailable = false;
        actionNotice = null;
        root.CaissaFICSClient?.board?.resize?.();
        return true;
    }

    function setEnabled(enabled) {
        root[FLAG] = enabled === true;
        return enabled === true ? mount() : unmount();
    }

    function getSnapshot() {
        return Object.freeze({
            schemaVersion: SCHEMA_VERSION,
            enabled: root[FLAG] !== false,
            mounted: Boolean(mounted),
            selectedLobbyView,
            productState: mounted?.section.dataset.ficsProductState || null,
            boardNodePreserved: Boolean(mounted && mounted.boardContainer === document.getElementById('ficsBoardContainer')),
            owner: 'PRESENTATION_ONLY'
        });
    }

    const api = Object.freeze({
        schemaVersion: SCHEMA_VERSION,
        getSnapshot,
        refresh: render,
        selectLobbyView,
        returnToGame,
        setEnabled
    });
    root.CaissaFICSShell = api;

    function boot() {
        if (root[FLAG] !== false) mount();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})(typeof window !== 'undefined' ? window : globalThis);
