import { PgnAnalysisEngine } from './pgn-engine.js';

(function () {
    'use strict';

    const root = document.querySelector('[data-pgn-app]');
    if (!root) return;

    const CAPABLANCA_ALBUM = Object.freeze({
        id: 'capablanca-games-1901-1941',
        title: 'José Raúl Capablanca',
        details: '597 games · 1901–1941 · CAISSA collection',
        games: 597,
        access: 'free',
        source: '/data/pgn/capablanca-games-1901-1941.pgn'
    });

    const elements = {
        title: root.querySelector('[data-pgn-title]'),
        subtitle: root.querySelector('[data-pgn-subtitle]'),
        white: root.querySelector('[data-pgn-white]'),
        whiteElo: root.querySelector('[data-pgn-white-elo]'),
        black: root.querySelector('[data-pgn-black]'),
        blackElo: root.querySelector('[data-pgn-black-elo]'),
        board: root.querySelector('#pgn-chessboard'),
        empty: root.querySelector('[data-pgn-empty]'),
        dropZone: root.querySelector('[data-pgn-drop-zone]'),
        dropOverlay: root.querySelector('[data-pgn-drop-overlay]'),
        openButtons: root.querySelectorAll('[data-pgn-open]'),
        pasteButton: root.querySelector('[data-pgn-paste]'),
        file: root.querySelector('[data-pgn-file]'),
        dialog: root.querySelector('[data-pgn-dialog]'),
        pasteInput: root.querySelector('[data-pgn-paste-input]'),
        loadPaste: root.querySelector('[data-pgn-load-paste]'),
        tabs: root.querySelectorAll('[data-pgn-tab]'),
        panels: root.querySelectorAll('[data-pgn-tabpanel]'),
        gameCount: root.querySelector('[data-pgn-game-count]'),
        games: root.querySelector('[data-pgn-games]'),
        gamesEmpty: root.querySelector('[data-pgn-games-empty]'),
        notation: root.querySelector('[data-pgn-notation]'),
        notationEmpty: root.querySelector('[data-pgn-notation-empty]'),
        gameInfo: root.querySelector('[data-pgn-game-info]'),
        gameInfoShell: root.querySelector('[data-pgn-game-info-shell]'),
        albums: root.querySelector('[data-pgn-albums]'),
        albumsEmpty: root.querySelector('[data-pgn-albums-empty]'),
        filterWrap: root.querySelector('[data-pgn-filter-wrap]'),
        filter: root.querySelector('[data-pgn-filter]'),
        position: root.querySelector('[data-pgn-position]'),
        result: root.querySelector('[data-pgn-result]'),
        message: root.querySelector('[data-pgn-message]'),
        first: root.querySelector('[data-pgn-first]'),
        previous: root.querySelector('[data-pgn-previous]'),
        play: root.querySelector('[data-pgn-play]'),
        next: root.querySelector('[data-pgn-next]'),
        last: root.querySelector('[data-pgn-last]'),
        flip: root.querySelector('[data-pgn-flip]'),
        focus: root.querySelector('[data-pgn-focus]'),
        speed: root.querySelector('[data-pgn-speed]'),
        engine: root.querySelector('[data-pgn-engine]'),
        engineState: root.querySelector('[data-pgn-engine-state]'),
        enginePanel: root.querySelector('[data-pgn-engine-panel]'),
        engineSummary: root.querySelector('[data-pgn-engine-summary]'),
        engineLines: root.querySelector('[data-pgn-engine-lines]')
    };

    function readPreference(key) {
        try {
            return window.localStorage?.getItem(key) || '';
        } catch (_) {
            return '';
        }
    }

    function writePreference(key, value) {
        try {
            window.localStorage?.setItem(key, value);
        } catch (_) {
            // Preferences remain session-only when storage is unavailable.
        }
    }

    const savedOrientation = readPreference('caissa_pgn_orientation');
    const savedSpeed = readPreference('caissa_pgn_speed');
    const hasSeenWelcome = readPreference('caissa_pgn_welcome_seen') === '1';
    const preferences = {
        orientation: savedOrientation === 'black' ? 'black' : 'white',
        speed: ['1400', '1000', '650', '400'].includes(savedSpeed) ? savedSpeed : '1000'
    };
    elements.speed.value = preferences.speed;
    elements.empty.hidden = hasSeenWelcome;
    if (!hasSeenWelcome) writePreference('caissa_pgn_welcome_seen', '1');

    const state = {
        collection: null,
        gameIndex: -1,
        game: null,
        nodes: new Map(),
        currentNodeId: null,
        worker: null,
        requestId: 0,
        autoplayTimer: null,
        sourceLabel: '',
        filter: '',
        messageTimer: null,
        focusMode: false,
        engine: null,
        engineEnabled: false,
        activeAlbumId: null,
        pendingAlbumId: null,
        albums: [{ ...CAPABLANCA_ALBUM }]
    };

    let board;
    try {
        board = window.CaissaPgnBoard.create(elements.board, { orientation: preferences.orientation });
    } catch (_) {
        showMessage('The chessboard could not be initialized.', 'error', false);
        return;
    }

    function showMessage(text, tone = 'info', temporary = true) {
        window.clearTimeout(state.messageTimer);
        elements.message.textContent = text;
        elements.message.dataset.tone = tone;
        elements.message.hidden = false;
        if (temporary) state.messageTimer = window.setTimeout(() => { elements.message.hidden = true; }, 5200);
    }

    function setBusy(busy, label = '') {
        root.toggleAttribute('aria-busy', busy);
        elements.openButtons.forEach(button => { button.disabled = busy; });
        elements.pasteButton.disabled = busy;
        elements.albums.querySelectorAll('[data-album-id]').forEach(button => { button.disabled = busy; });
        if (busy) showMessage(label || 'Reading PGN…', 'info', false);
    }

    function stopAutoplay() {
        window.clearTimeout(state.autoplayTimer);
        state.autoplayTimer = null;
        elements.play.querySelector('[data-pgn-play-icon]').textContent = '▶';
        elements.play.setAttribute('aria-label', 'Play moves automatically');
        elements.play.title = 'Play moves automatically';
    }

    function activeNode() { return state.currentNodeId ? state.nodes.get(state.currentNodeId) || null : null; }

    function indexNodes(line) {
        for (const node of line || []) {
            state.nodes.set(node.id, node);
            for (const variation of node.variations || []) indexNodes(variation);
        }
    }

    function nagLabel(nag) {
        return ({ '$1': '!', '$2': '?', '$3': '!!', '$4': '??', '$5': '!?', '$6': '?!',
            '$10': '=', '$13': '∞', '$14': '+=', '$15': '=+', '$16': '±', '$17': '∓' })[nag] || nag;
    }

    function renderGames() {
        elements.games.replaceChildren();
        if (!state.collection) return;
        const query = state.filter.trim().toLocaleLowerCase();
        state.collection.games.forEach((game, index) => {
            const headers = game.headers;
            const haystack = [headers.White, headers.Black, headers.Event, headers.Site, headers.ECO].join(' ').toLocaleLowerCase();
            if (query && !haystack.includes(query)) return;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'pgn-game-row';
            button.setAttribute('role', 'listitem');
            button.setAttribute('aria-current', String(index === state.gameIndex));
            button.dataset.gameIndex = String(index);
            const names = document.createElement('strong');
            names.textContent = `${headers.White || 'Unknown'} — ${headers.Black || 'Unknown'}`;
            const details = document.createElement('small');
            details.textContent = [headers.WhiteElo && `${headers.WhiteElo}/${headers.BlackElo || '—'}`, headers.Event, headers.Round && `Round ${headers.Round}`, headers.ECO].filter(Boolean).join(' · ') || 'PGN game';
            const result = document.createElement('span');
            result.className = 'pgn-game-result';
            result.textContent = headers.Result || '*';
            button.append(names, result, details);
            elements.games.append(button);
        });
    }

    function moveButton(node) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'pgn-move';
        button.dataset.nodeId = node.id;
        button.setAttribute('aria-label', `${node.turn === 'w' ? `${node.moveNumber}.` : `${node.moveNumber}...`} ${node.san}`);
        if (node.id === state.currentNodeId) button.classList.add('is-active');
        const number = document.createElement('span');
        number.className = 'pgn-move-number';
        number.textContent = node.turn === 'w' ? `${node.moveNumber}.` : `${node.moveNumber}…`;
        const san = document.createElement('span');
        san.textContent = node.san;
        button.append(number, san);
        for (const nag of node.nags || []) {
            const mark = document.createElement('span');
            mark.className = 'pgn-nag';
            mark.textContent = nagLabel(nag);
            button.append(mark);
        }
        return button;
    }

    function notationLine(line, depth = 0) {
        const container = document.createElement('div');
        container.className = 'pgn-notation-line';
        for (const node of line || []) {
            container.append(moveButton(node));
            for (const comment of node.comments || []) {
                const paragraph = document.createElement('p');
                paragraph.className = 'pgn-comment';
                paragraph.textContent = comment;
                container.append(paragraph);
            }
            for (const variation of node.variations || []) {
                const details = document.createElement('details');
                details.className = 'pgn-variation';
                if (depth === 0) details.open = true;
                const summary = document.createElement('summary');
                summary.textContent = 'Variation';
                details.append(summary, notationLine(variation, depth + 1));
                container.append(details);
            }
        }
        return container;
    }

    function renderNotation() {
        elements.notation.replaceChildren();
        elements.gameInfo.replaceChildren();
        if (!state.game) return;
        renderGameInfo();
        elements.notation.append(notationLine(state.game.mainline));
    }

    function renderGameInfo() {
        elements.gameInfo.replaceChildren();
        if (!state.game) return;
        const preferred = ['Event', 'Site', 'Date', 'Round', 'ECO', 'Opening', 'Variation', 'White', 'WhiteElo', 'Black', 'BlackElo', 'Result', 'SetUp', 'FEN'];
        const entries = Object.entries(state.game.headers).sort(([left], [right]) => {
            const a = preferred.indexOf(left); const b = preferred.indexOf(right);
            return (a < 0 ? 999 : a) - (b < 0 ? 999 : b) || left.localeCompare(right);
        });
        for (const [key, value] of entries) {
            const pair = document.createElement('div');
            pair.className = 'pgn-game-info-pair';
            const term = document.createElement('dt');
            const detail = document.createElement('dd');
            term.textContent = key;
            detail.textContent = value || '—';
            pair.append(term, detail);
            elements.gameInfo.append(pair);
        }
        elements.gameInfoShell.hidden = false;
    }

    function albumAccessLabel(album) {
        if (album.access === 'free') return 'Free';
        if (album.access === 'owned') return 'Owned';
        if (album.access === 'available') return `${album.credits || 1} credit${album.credits === 1 || !album.credits ? '' : 's'}`;
        return 'Local PGN';
    }

    function renderAlbums() {
        elements.albums.replaceChildren();
        elements.albumsEmpty.hidden = state.albums.length > 0;
        for (const album of state.albums) {
            const item = document.createElement('div');
            item.setAttribute('role', 'listitem');
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'pgn-album-card';
            card.setAttribute('aria-current', String(album.id === state.activeAlbumId));
            card.dataset.albumId = album.id;
            const icon = document.createElement('i');
            icon.className = album.access === 'free' ? 'fas fa-chess-king' : 'fas fa-folder-open';
            icon.setAttribute('aria-hidden', 'true');
            const copy = document.createElement('div');
            const title = document.createElement('strong');
            title.textContent = album.title;
            const details = document.createElement('small');
            details.textContent = album.details || `${album.games.toLocaleString()} game${album.games === 1 ? '' : 's'} · Processed locally`;
            copy.append(title, details);
            const badge = document.createElement('span');
            badge.className = 'pgn-album-badge';
            badge.dataset.access = album.access;
            badge.textContent = albumAccessLabel(album);
            card.append(icon, copy, badge);
            item.append(card);
            elements.albums.append(item);
        }
    }

    function selectTab(name, focus = false) {
        elements.tabs.forEach(tab => {
            const selected = tab.dataset.pgnTab === name;
            tab.setAttribute('aria-selected', String(selected));
            tab.tabIndex = selected ? 0 : -1;
            if (selected && focus) tab.focus();
        });
        elements.panels.forEach(panel => { panel.hidden = panel.dataset.pgnTabpanel !== name; });
    }

    function currentFen() {
        return activeNode()?.fenAfter || state.game?.startFen || null;
    }

    function engineScore(line) {
        const sideToMove = line.fen?.split(/\s+/)[1] === 'b' ? -1 : 1;
        const value = line.score.value * sideToMove;
        if (line.score.type === 'mate') return `M${value > 0 ? '+' : ''}${value}`;
        const pawns = value / 100;
        return `${pawns > 0 ? '+' : ''}${pawns.toFixed(2)}`;
    }

    function renderEngineLines(lines, placeholder = 'Calculating…') {
        elements.engineLines.replaceChildren();
        for (let index = 0; index < 2; index += 1) {
            const line = lines[index];
            const row = document.createElement('div');
            row.className = 'pgn-engine-line';
            const rank = document.createElement('span');
            rank.className = 'pgn-engine-rank';
            rank.textContent = String(index + 1);
            const score = document.createElement('strong');
            score.className = 'pgn-engine-score';
            score.textContent = line ? engineScore(line) : '—';
            score.title = 'Evaluation from White’s perspective';
            const moves = document.createElement('span');
            moves.className = 'pgn-engine-pv';
            moves.textContent = line?.san?.length ? line.san.join(' ') : placeholder;
            const depth = document.createElement('small');
            depth.textContent = line ? `d${line.depth}` : '';
            row.append(rank, score, moves, depth);
            elements.engineLines.append(row);
        }
    }

    function updateEngineUi(status) {
        const on = state.engineEnabled && status !== 'error' && status !== 'off';
        elements.engine.setAttribute('aria-pressed', String(on));
        elements.engine.setAttribute('aria-label', on ? 'Turn engine off' : 'Turn engine on');
        elements.engine.title = on ? 'Turn engine off' : 'Turn engine on';
        elements.engineState.textContent = status === 'loading' ? 'Loading' : on ? 'On' : 'Off';
        elements.engineSummary.textContent = ({
            loading: 'Starting locally…',
            ready: 'Ready · 2 lines',
            analyzing: 'Analyzing · 2 lines',
            stopping: 'Updating position…',
            error: 'Unavailable'
        })[status] || 'Off';
        elements.enginePanel.dataset.state = status;
        if (status === 'off') renderEngineLines([], 'Turn Engine on to analyze');
        if (status === 'error') renderEngineLines([], 'Engine unavailable · try again');
    }

    function requestEngineAnalysis() {
        const fen = currentFen();
        if (!state.engineEnabled || !fen || !state.engine) return;
        try {
            state.engine.analyze(fen);
        } catch (_) {
            state.engineEnabled = false;
            state.engine.disable();
            updateEngineUi('error');
            showMessage('The local engine could not analyze this position.', 'error', false);
        }
    }

    async function toggleEngine() {
        if (!state.game) return;
        if (state.engineEnabled) {
            state.engineEnabled = false;
            state.engine?.disable();
            updateEngineUi('off');
            showMessage('Engine off.');
            return;
        }
        state.engineEnabled = true;
        selectTab('notation');
        renderEngineLines([]);
        state.engine = new PgnAnalysisEngine({
            moveTimeMs: window.matchMedia('(max-width: 620px)').matches ? 650 : 900,
            onLines: renderEngineLines,
            onState: (status, detail) => {
                if (status === 'error' && state.engineEnabled) {
                    state.engineEnabled = false;
                    const errorCode = typeof detail === 'string' ? detail : detail?.code;
                    updateEngineUi('error');
                    const message = errorCode === 'engine-initialization-timeout'
                        ? 'The local engine took too long to start. You can try turning it on again.'
                        : 'The local engine could not be loaded. You can try turning it on again.';
                    showMessage(message, 'error', false);
                    return;
                }
                updateEngineUi(status);
            }
        });
        try {
            await state.engine.enable(currentFen());
        } catch (error) {
            if (error?.code === 'engine-disabled' || !state.engineEnabled) return;
            state.engineEnabled = false;
            updateEngineUi('error');
            showMessage('The local engine could not be started.', 'error', false);
        }
    }

    function updateBoard(animate = true) {
        const node = activeNode();
        board.setPosition(node?.fenAfter || state.game?.startFen || 'start', node, animate);
        elements.position.textContent = node ? `Move ${node.moveNumber}${node.turn === 'b' ? '…' : '.'} ${node.san}` : 'Start position';
        root.querySelectorAll('.pgn-move.is-active').forEach(item => item.classList.remove('is-active'));
        if (node) {
            const selected = root.querySelector(`[data-node-id="${node.id}"]`);
            selected?.classList.add('is-active');
            selected?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
        requestEngineAnalysis();
        updateControls();
    }

    function updateControls() {
        const node = activeNode();
        const hasGame = !!state.game;
        elements.first.disabled = !hasGame || !node;
        elements.previous.disabled = !hasGame || !node;
        elements.next.disabled = !hasGame || (node ? !node.nextId : !state.game.mainline.length);
        elements.last.disabled = !hasGame || !state.game.mainline.length;
        elements.play.disabled = elements.next.disabled;
        elements.flip.disabled = !hasGame;
        elements.focus.disabled = !hasGame;
        elements.engine.disabled = !hasGame;
    }

    function selectGame(index, announce = true) {
        stopAutoplay();
        const game = state.collection?.games?.[index];
        if (!game) return;
        state.gameIndex = index;
        state.game = game;
        state.currentNodeId = null;
        state.nodes = new Map();
        indexNodes(game.mainline);
        const h = game.headers;
        elements.title.textContent = `${h.White || 'Unknown'} — ${h.Black || 'Unknown'}`;
        elements.subtitle.textContent = [h.Event, h.Round && `Round ${h.Round}`, h.Date].filter(Boolean).join(' · ') || state.sourceLabel;
        elements.white.textContent = h.White || 'White';
        elements.whiteElo.textContent = h.WhiteElo || '—';
        elements.black.textContent = h.Black || 'Black';
        elements.blackElo.textContent = h.BlackElo || '—';
        elements.result.textContent = `Result ${h.Result || '*'}`;
        renderGames();
        renderNotation();
        updateBoard(false);
        if (announce) showMessage(`Game ${index + 1} of ${state.collection.games.length}: ${game.label}`);
    }

    function applyCollection(collection, sourceLabel) {
        state.collection = collection;
        state.sourceLabel = sourceLabel;
        state.filter = '';
        if (state.pendingAlbumId) {
            state.activeAlbumId = state.pendingAlbumId;
        } else {
            state.activeAlbumId = 'local-import';
            state.albums = state.albums.filter(album => album.id !== 'local-import');
            state.albums.push({ id: 'local-import', title: sourceLabel || 'Imported PGN', games: collection.games.length, access: 'local' });
        }
        state.pendingAlbumId = null;
        elements.filter.value = '';
        elements.empty.hidden = true;
        elements.gamesEmpty.hidden = true;
        elements.notationEmpty.hidden = true;
        renderAlbums();
        elements.gameCount.textContent = `(${collection.games.length})`;
        elements.filterWrap.hidden = collection.games.length <= 20;
        selectGame(0, false);
        selectTab(collection.games.length > 1 ? 'games' : 'notation');
        const warning = collection.warnings.length ? ` ${collection.warnings.length} damaged game${collection.warnings.length === 1 ? ' was' : 's were'} skipped.` : '';
        showMessage(`${collection.games.length} game${collection.games.length === 1 ? '' : 's'} loaded locally.${warning}`, collection.warnings.length ? 'warning' : 'info', !collection.warnings.length);
    }

    function ensureWorker() {
        if (state.worker) state.worker.terminate();
        const worker = new Worker('/js/pgn-replayer/pgn-worker.js', { type: 'module' });
        state.worker = worker;
        worker.addEventListener('message', event => {
            const response = event.data || {};
            if (response.requestId !== state.requestId) return;
            setBusy(false);
            if (response.type === 'parsed') applyCollection(response.collection, state.sourceLabel);
            else {
                state.pendingAlbumId = null;
                showMessage(response.error?.message || 'The PGN could not be read.', 'error', false);
            }
        });
        worker.addEventListener('error', () => {
            setBusy(false);
            state.pendingAlbumId = null;
            showMessage('The local PGN reader stopped unexpectedly. Try a smaller file.', 'error', false);
        }, { once: true });
        return worker;
    }

    function parseText(text, sourceLabel, albumId = null) {
        stopAutoplay();
        const worker = ensureWorker();
        state.requestId += 1;
        state.sourceLabel = sourceLabel;
        state.pendingAlbumId = albumId;
        setBusy(true, 'Reading PGN locally…');
        worker.postMessage({ type: 'parse', requestId: state.requestId, text });
    }

    async function loadAlbum(albumId) {
        const album = state.albums.find(item => item.id === albumId);
        if (!album?.source || root.hasAttribute('aria-busy')) return;
        setBusy(true, `Opening ${album.title}…`);
        try {
            const response = await fetch(album.source, {
                credentials: 'same-origin',
                cache: 'force-cache',
                headers: { Accept: 'text/plain' }
            });
            if (!response.ok) throw new Error('The collection is temporarily unavailable.');
            const bytes = await response.arrayBuffer();
            if (bytes.byteLength > 10 * 1024 * 1024) throw new Error('This collection exceeds the 10 MiB safety limit.');
            parseText(new TextDecoder().decode(bytes), album.title, album.id);
        } catch (error) {
            state.pendingAlbumId = null;
            setBusy(false);
            showMessage(error?.message || 'The collection could not be opened.', 'error', false);
        }
    }

    async function loadFile(file) {
        if (!file) return;
        if (!/\.pgn$/i.test(file.name) && !['text/plain', 'application/x-chess-pgn', 'application/vnd.chess-pgn', ''].includes(file.type)) {
            showMessage('Choose a .pgn file.', 'error');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            showMessage('This PGN is larger than the 10 MiB safety limit.', 'error', false);
            return;
        }
        try { parseText(await file.text(), file.name); }
        catch (_) { showMessage('The selected file could not be read.', 'error', false); }
        finally { elements.file.value = ''; }
    }

    function goTo(nodeId) {
        stopAutoplay();
        state.currentNodeId = nodeId || null;
        updateBoard();
    }

    function goNext(fromAutoplay = false) {
        const node = activeNode();
        const nextId = node?.nextId || (!node ? state.game?.mainline?.[0]?.id : null);
        if (!nextId) { stopAutoplay(); return false; }
        state.currentNodeId = nextId;
        updateBoard();
        if (!fromAutoplay) stopAutoplay();
        return true;
    }

    function startAutoplay() {
        if (state.autoplayTimer) { stopAutoplay(); return; }
        elements.play.querySelector('[data-pgn-play-icon]').textContent = 'Ⅱ';
        elements.play.setAttribute('aria-label', 'Pause automatic replay');
        elements.play.title = 'Pause automatic replay';
        const tick = () => {
            if (!goNext(true)) return;
            state.autoplayTimer = window.setTimeout(tick, Number(elements.speed.value));
        };
        tick();
    }

    function toggleFocus() {
        if (!state.game) return;
        state.focusMode = !state.focusMode;
        document.body.classList.toggle('pgn-focus-mode', state.focusMode);
        elements.focus.querySelector('[data-pgn-focus-icon]').textContent = state.focusMode ? '▣' : '⛶';
        elements.focus.setAttribute('aria-label', state.focusMode ? 'Exit focus view' : 'Enter focus view');
        window.setTimeout(() => board.resize(), 30);
    }

    elements.openButtons.forEach(button => button.addEventListener('click', () => elements.file.click()));
    elements.file.addEventListener('change', () => loadFile(elements.file.files?.[0]));
    elements.pasteButton.addEventListener('click', () => {
        elements.dialog.showModal();
        window.setTimeout(() => elements.pasteInput.focus(), 0);
    });
    elements.loadPaste.addEventListener('click', () => {
        if (!elements.pasteInput.value.trim()) { showMessage('Paste PGN text before loading.', 'error'); return; }
        const text = elements.pasteInput.value;
        elements.dialog.close();
        parseText(text, 'Pasted PGN');
    });
    elements.tabs.forEach(tab => tab.addEventListener('click', () => selectTab(tab.dataset.pgnTab)));
    elements.tabs.forEach((tab, index) => tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const direction = event.key === 'ArrowRight' ? 1 : -1;
        const target = elements.tabs[(index + direction + elements.tabs.length) % elements.tabs.length];
        selectTab(target.dataset.pgnTab, true);
    }));
    elements.games.addEventListener('click', event => {
        const row = event.target.closest('[data-game-index]');
        if (row) selectGame(Number(row.dataset.gameIndex));
    });
    elements.albums.addEventListener('click', event => {
        const album = event.target.closest('[data-album-id]');
        if (album) loadAlbum(album.dataset.albumId);
    });
    elements.notation.addEventListener('click', event => {
        const move = event.target.closest('[data-node-id]');
        if (move) goTo(move.dataset.nodeId);
    });
    elements.filter.addEventListener('input', () => { state.filter = elements.filter.value; renderGames(); });
    elements.first.addEventListener('click', () => goTo(null));
    elements.previous.addEventListener('click', () => goTo(activeNode()?.previousId || null));
    elements.next.addEventListener('click', () => goNext());
    elements.last.addEventListener('click', () => goTo(state.game?.mainline?.at(-1)?.id || null));
    elements.play.addEventListener('click', startAutoplay);
    elements.flip.addEventListener('click', () => {
        const orientation = board.flip();
        writePreference('caissa_pgn_orientation', orientation);
        showMessage(`Board flipped to ${orientation}.`);
    });
    elements.focus.addEventListener('click', toggleFocus);
    elements.engine.addEventListener('click', toggleEngine);
    elements.speed.addEventListener('change', () => {
        writePreference('caissa_pgn_speed', elements.speed.value);
        if (state.autoplayTimer) { stopAutoplay(); startAutoplay(); }
    });

    let dragDepth = 0;
    document.addEventListener('dragenter', event => {
        if (![...event.dataTransfer?.types || []].includes('Files')) return;
        event.preventDefault(); dragDepth += 1; elements.dropOverlay.hidden = false;
    });
    document.addEventListener('dragover', event => {
        if ([...event.dataTransfer?.types || []].includes('Files')) event.preventDefault();
    });
    document.addEventListener('dragleave', () => {
        dragDepth = Math.max(0, dragDepth - 1);
        if (!dragDepth) elements.dropOverlay.hidden = true;
    });
    document.addEventListener('drop', event => {
        event.preventDefault(); dragDepth = 0; elements.dropOverlay.hidden = true;
        loadFile(event.dataTransfer?.files?.[0]);
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && state.focusMode) { toggleFocus(); elements.focus.focus(); return; }
        if (!state.game || elements.dialog.open || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
        if (event.key === 'ArrowLeft') { event.preventDefault(); goTo(activeNode()?.previousId || null); }
        if (event.key === 'ArrowRight') { event.preventDefault(); goNext(); }
        if (event.key === 'Home') { event.preventDefault(); goTo(null); }
        if (event.key === 'End') { event.preventDefault(); goTo(state.game.mainline.at(-1)?.id || null); }
        if (event.key === ' ') { event.preventDefault(); startAutoplay(); }
    });
    window.addEventListener('beforeunload', () => { stopAutoplay(); state.worker?.terminate(); state.engine?.disable(); board.destroy(); }, { once: true });

    renderAlbums();
    renderEngineLines([]);
    updateEngineUi('off');
    updateControls();
})();
