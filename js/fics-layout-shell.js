(function installFicsLayoutShell(root) {
    'use strict';

    const SCHEMA_VERSION = '1.0.0';
    const FLAG = 'CAISSA_FICS_REDESIGN_ENABLED';
    const LOBBY_VIEWS = Object.freeze(['tables', 'players', 'seek']);
    const GAME_STATES = new Set(['PLAYING', 'OBSERVING', 'GAME_OVER']);
    const PRODUCT_EVENTS = Object.freeze([
        'authenticated', 'style12', 'game-ended', 'disconnected', 'observer-left'
    ]);
    let mounted = null;
    let selectedLobbyView = null;
    let lastGameModeAvailable = false;
    let resizeObserver = null;
    let resizeFrame = 0;
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

    function bodyCopy(view) {
        if (view.primaryGameMode) return {
            title: 'Game',
            message: 'The active game remains on the existing FICS board. Game Mode tools arrive in a later redesign phase.'
        };
        if (view.activeTab === 'players') return {
            title: 'Players',
            message: 'A complete FICS player directory is not available yet. No player list is shown.'
        };
        if (view.activeTab === 'seek') return {
            title: 'Seek',
            message: 'The Create Table workspace is prepared here. Existing seek controls remain available below during this transition.'
        };
        if (view.activeTab === 'tables') return {
            title: 'Tables',
            message: 'The active-tables workspace is prepared here. Existing table controls remain available below during this transition.'
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
        const view = getViewState();
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

        mounted.roomPanel.hidden = activeTab !== 'tables';
        mounted.sidePanel.hidden = !(activeTab === 'seek' || view.primaryGameMode);
        scheduleBoardResize();
        return view;
    }

    function selectLobbyView(view) {
        if (!LOBBY_VIEWS.includes(view)) return false;
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
        const compatibility = createElement('div', 'fics-rd2-compatibility', {
            'data-fics-compatibility-region': 'legacy-controls'
        });
        body.append(returnToGameButton, placeholder, compatibility);

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
            body, foot, tabs, returnToGame: returnToGameButton, bodyTitle, bodyMessage };
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
