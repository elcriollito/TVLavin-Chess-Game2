import { PgnAnalysisEngine } from './pgn-engine.js';

(function () {
    'use strict';

    const root = document.querySelector('[data-pgn-app]');
    if (!root) return;

    const CAPABLANCA_ALBUM = Object.freeze({
        id: 'capablanca-games-1901-1941',
        title: 'José Raúl Capablanca',
        details: 'Player game collection · PGN',
        games: 597,
        access: 'free',
        credits: 0,
        source: 'protected-player-album'
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
        pasteButtons: root.querySelectorAll('[data-pgn-paste]'),
        openMenu: root.querySelector('[data-pgn-open-menu]'),
        file: root.querySelector('[data-pgn-file]'),
        dialog: root.querySelector('[data-pgn-dialog]'),
        optionsButton: root.querySelector('[data-pgn-options]'),
        optionsDialog: root.querySelector('[data-pgn-options-dialog]'),
        language: root.querySelector('[data-pgn-language]'),
        languageLabel: root.querySelector('[data-pgn-language-label]'),
        pasteInput: root.querySelector('[data-pgn-paste-input]'),
        loadPaste: root.querySelector('[data-pgn-load-paste]'),
        tabs: root.querySelectorAll('[data-pgn-tab]'),
        panels: root.querySelectorAll('[data-pgn-tabpanel]'),
        gameCount: root.querySelector('[data-pgn-game-count]'),
        games: root.querySelector('[data-pgn-games]'),
        gamesEmpty: root.querySelector('[data-pgn-games-empty]'),
        notation: root.querySelector('[data-pgn-notation]'),
        notationScroller: root.querySelector('.pgn-notation-scroll'),
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
        nextGame: root.querySelector('[data-pgn-next-game]'),
        shareMenu: root.querySelector('[data-pgn-share-menu]'),
        copyPgn: root.querySelector('[data-pgn-copy-pgn]'),
        copyFen: root.querySelector('[data-pgn-copy-fen]'),
        saveSource: root.querySelector('[data-pgn-save-source]'),
        exportDiagram: root.querySelector('[data-pgn-export-diagram]'),
        shareDiagram: root.querySelector('[data-pgn-share-diagram]'),
        engine: root.querySelector('[data-pgn-engine]'),
        engineState: root.querySelector('[data-pgn-engine-state]'),
        enginePanels: root.querySelectorAll('[data-pgn-engine-panel]'),
        engineSummaries: root.querySelectorAll('[data-pgn-engine-summary]'),
        engineLineGroups: root.querySelectorAll('[data-pgn-engine-lines]')
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
    const savedLocale = readPreference('caissa_pgn_locale');
    const hasSeenWelcome = readPreference('caissa_pgn_welcome_seen') === '1';
    const preferences = {
        orientation: savedOrientation === 'black' ? 'black' : 'white',
        speed: ['1400', '1000', '650', '400'].includes(savedSpeed) ? savedSpeed : '1000',
        locale: savedLocale === 'es' ? 'es' : 'en'
    };
    elements.speed.value = preferences.speed;
    elements.empty.hidden = hasSeenWelcome;
    if (!hasSeenWelcome) writePreference('caissa_pgn_welcome_seen', '1');

    const interfaceCopy = Object.freeze({
        en: Object.freeze({
            openPgn: 'Open PGN', openFile: 'Open file', pastePgn: 'Paste PGN', options: 'Options',
            albums: 'Albums', games: 'Games', notation: 'Notation', analysis: 'Analysis',
            nextGame: 'Next game', share: 'Share', engine: 'Engine', on: 'On', off: 'Off', loading: 'Loading',
            exportDiagram: 'Export Diagram', shareDiagram: 'Share Diagram',
            languageLabel: 'Español', languageAction: 'Switch interface language to Spanish'
        }),
        es: Object.freeze({
            openPgn: 'Abrir PGN', openFile: 'Abrir archivo', pastePgn: 'Pegar PGN', options: 'Opciones',
            albums: 'Álbumes', games: 'Partidas', notation: 'Notación', analysis: 'Análisis',
            nextGame: 'Siguiente partida', share: 'Compartir', engine: 'Motor', on: 'Activo', off: 'Apagado', loading: 'Cargando',
            exportDiagram: 'Exportar diagrama', shareDiagram: 'Compartir diagrama',
            languageLabel: 'English', languageAction: 'Cambiar el idioma de la interfaz a inglés'
        })
    });

    function copy(key) {
        return interfaceCopy[preferences.locale]?.[key] || interfaceCopy.en[key] || key;
    }

    function applyLocale(locale) {
        preferences.locale = locale === 'es' ? 'es' : 'en';
        writePreference('caissa_pgn_locale', preferences.locale);
        document.documentElement.lang = preferences.locale;
        root.querySelectorAll('[data-pgn-copy]').forEach(element => {
            element.textContent = copy(element.dataset.pgnCopy);
        });
        elements.languageLabel.textContent = copy('languageLabel');
        elements.language.setAttribute('aria-label', copy('languageAction'));
        elements.language.title = copy('languageAction');
    }

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
        sourceText: '',
        filter: '',
        messageTimer: null,
        focusMode: false,
        engine: null,
        engineEnabled: false,
        activeAlbumId: null,
        pendingAlbumId: null,
        pendingTab: null,
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
        elements.pasteButtons.forEach(button => { button.disabled = busy; });
        elements.albums.querySelectorAll('[data-album-id]').forEach(button => { button.disabled = busy; });
        updateControls();
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
            if (album.id === CAPABLANCA_ALBUM.id && window.CaissaPgnPlayerIconography) {
                window.CaissaPgnPlayerIconography.decorate(icon, card, album.title);
            } else {
                icon.className = album.access === 'free' ? 'fas fa-chess-knight' : 'fas fa-folder-open';
                icon.setAttribute('aria-hidden', 'true');
            }
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

    function safeFileStem(value, fallback = 'caissa-game') {
        const stem = String(value || '').trim().replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-').replace(/[. ]+$/g, '');
        return stem.slice(0, 90) || fallback;
    }

    function gameFileStem() {
        if (!state.game) return 'caissa-game';
        const headers = state.game.headers || {};
        return safeFileStem(`${headers.White || 'White'}-${headers.Black || 'Black'}-${headers.Date || ''}`);
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.hidden = true;
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function saveSourcePgn() {
        if (!state.sourceText) return;
        const filename = /\.pgn$/i.test(state.sourceLabel || '') ? safeFileStem(state.sourceLabel).replace(/-pgn$/i, '.pgn') : `${safeFileStem(state.sourceLabel, 'caissa-collection')}.pgn`;
        downloadBlob(new Blob([state.sourceText], { type: 'application/x-chess-pgn;charset=utf-8' }), filename);
        showMessage('Original PGN saved.');
    }

    function loadPieceImage(code) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = reject;
            image.src = `/img/chesspieces/wikipedia/${code}.png`;
        });
    }

    const diagramCopy = Object.freeze({
        en: Object.freeze({
            whiteToMove: 'White to move and win',
            blackToMove: 'Black to move and win',
            heading: 'CAISSA CHESS',
            label: 'PUZZLE DIAGRAM'
        }),
        es: Object.freeze({
            whiteToMove: 'Juegan blancas y ganan',
            blackToMove: 'Juegan negras y ganan',
            heading: 'CAISSA CHESS',
            label: 'DIAGRAMA DE AJEDREZ'
        })
    });

    function currentDiagramCopy() {
        return diagramCopy[preferences.locale] || diagramCopy.en;
    }

    function diagramInstruction(fen) {
        const sideToMove = fen.trim().split(/\s+/)[1] === 'b' ? 'black' : 'white';
        const labels = currentDiagramCopy();
        return sideToMove === 'black' ? labels.blackToMove : labels.whiteToMove;
    }

    async function createDiagramImage() {
        const fen = currentFen();
        if (!fen) throw new Error('No chess position is available.');
        const placement = fen.split(/\s+/)[0];
        const rows = placement.split('/');
        if (rows.length !== 8) throw new Error('The current position is invalid.');
        const pieces = [];
        rows.forEach((row, rank) => {
            let file = 0;
            for (const token of row) {
                if (/\d/.test(token)) { file += Number(token); continue; }
                const color = token === token.toUpperCase() ? 'w' : 'b';
                pieces.push({ code: `${color}${token.toUpperCase()}`, file, rank });
                file += 1;
            }
        });
        const canvas = document.createElement('canvas');
        canvas.width = 1200;
        canvas.height = 1200;
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('The diagram could not be created.');
        const boardX = 160;
        const boardY = 130;
        const square = 110;
        const boardSize = square * 8;
        const background = context.createLinearGradient(0, 0, 1200, 1200);
        background.addColorStop(0, '#18253a');
        background.addColorStop(0.48, '#0b1523');
        background.addColorStop(1, '#070d16');
        context.fillStyle = background;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#f3a72d';
        context.font = '800 27px Arial, sans-serif';
        context.textAlign = 'left';
        context.textBaseline = 'alphabetic';
        context.fillText(`♞  ${currentDiagramCopy().heading}`, boardX, 82);
        context.fillStyle = '#aebdd0';
        context.font = '700 18px Arial, sans-serif';
        context.textAlign = 'right';
        context.fillText(currentDiagramCopy().label, boardX + boardSize, 80);
        context.shadowColor = 'rgba(0, 0, 0, .55)';
        context.shadowBlur = 24;
        context.shadowOffsetY = 10;
        context.fillStyle = '#02060b';
        context.fillRect(boardX - 12, boardY - 12, boardSize + 24, boardSize + 24);
        context.shadowColor = 'transparent';
        const files = preferences.orientation === 'black' ? 'hgfedcba' : 'abcdefgh';
        const ranks = preferences.orientation === 'black' ? '12345678' : '87654321';
        for (let displayRank = 0; displayRank < 8; displayRank += 1) {
            for (let displayFile = 0; displayFile < 8; displayFile += 1) {
                const dark = (displayRank + displayFile) % 2 === 1;
                const x = boardX + displayFile * square;
                const y = boardY + displayRank * square;
                context.fillStyle = dark ? '#b79375' : '#eadbb4';
                context.fillRect(x, y, square, square);
                context.fillStyle = dark ? '#eadbb4' : '#9d7659';
                context.font = '700 16px Arial, sans-serif';
                if (displayFile === 0) {
                    context.textAlign = 'left';
                    context.textBaseline = 'top';
                    context.fillText(ranks[displayRank], x + 7, y + 6);
                }
                if (displayRank === 7) {
                    context.textAlign = 'right';
                    context.textBaseline = 'bottom';
                    context.fillText(files[displayFile], x + square - 7, y + square - 5);
                }
            }
        }
        const images = new Map();
        await Promise.all([...new Set(pieces.map(piece => piece.code))].map(async code => images.set(code, await loadPieceImage(code))));
        for (const piece of pieces) {
            const displayFile = preferences.orientation === 'black' ? 7 - piece.file : piece.file;
            const displayRank = preferences.orientation === 'black' ? 7 - piece.rank : piece.rank;
            context.drawImage(images.get(piece.code), boardX + displayFile * square, boardY + displayRank * square, square, square);
        }
        context.fillStyle = '#f7f9fc';
        context.font = '800 38px Arial, sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(diagramInstruction(fen), canvas.width / 2, 1062);
        context.fillStyle = '#f3a72d';
        context.fillRect(390, 1104, 420, 3);
        context.fillStyle = '#aebdd0';
        context.font = '700 23px Arial, sans-serif';
        context.fillText('www.caissa-chess.org', canvas.width / 2, 1150);
        return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The board image could not be created.')), 'image/png'));
    }

    async function exportDiagram() {
        if (!state.game) return;
        elements.exportDiagram.disabled = true;
        try {
            const blob = await createDiagramImage();
            downloadBlob(blob, `${gameFileStem()}-diagram.png`);
            showMessage(preferences.locale === 'es' ? 'Diagrama exportado.' : 'Diagram exported.');
        } catch (error) {
            showMessage(error?.message || 'The diagram could not be exported.', 'error', false);
        } finally {
            updateControls();
        }
    }

    async function shareDiagram() {
        if (!state.game) return;
        elements.shareDiagram.disabled = true;
        try {
            const blob = await createDiagramImage();
            const filename = `${gameFileStem()}-diagram.png`;
            const file = new File([blob], filename, { type: 'image/png' });
            if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
                await navigator.share({ title: diagramInstruction(currentFen()), files: [file] });
                showMessage(preferences.locale === 'es' ? 'Diagrama compartido.' : 'Diagram shared.');
            } else {
                downloadBlob(blob, filename);
                showMessage(preferences.locale === 'es' ? 'Diagrama descargado.' : 'Diagram downloaded.');
            }
        } catch (error) {
            if (error?.name !== 'AbortError') showMessage(error?.message || 'The diagram could not be shared.', 'error', false);
        } finally {
            updateControls();
        }
    }

    function engineScore(line) {
        const sideToMove = line.fen?.split(/\s+/)[1] === 'b' ? -1 : 1;
        const value = line.score.value * sideToMove;
        if (line.score.type === 'mate') return `M${value > 0 ? '+' : ''}${value}`;
        const pawns = value / 100;
        return `${pawns > 0 ? '+' : ''}${pawns.toFixed(2)}`;
    }

    function renderEngineLines(lines, placeholder = 'Calculating…') {
        elements.engineLineGroups.forEach(group => {
            group.replaceChildren();
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
                group.append(row);
            }
        });
    }

    function updateEngineUi(status) {
        const on = state.engineEnabled && status !== 'error' && status !== 'off';
        elements.engine.setAttribute('aria-pressed', String(on));
        elements.engine.setAttribute('aria-label', on ? 'Turn engine off' : 'Turn engine on');
        elements.engine.title = on ? 'Turn engine off' : 'Turn engine on';
        elements.engineState.textContent = status === 'loading' ? copy('loading') : on ? copy('on') : copy('off');
        const summary = ({
            loading: 'Starting locally…',
            ready: 'Ready · 2 lines',
            analyzing: 'Analyzing · 2 lines',
            stopping: 'Updating position…',
            error: 'Unavailable'
        })[status] || 'Off';
        elements.engineSummaries.forEach(element => { element.textContent = summary; });
        elements.enginePanels.forEach(panel => { panel.dataset.state = status; });
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
        selectTab('analysis');
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
            keepActiveMoveVisible(selected);
        }
        requestEngineAnalysis();
        updateControls();
    }

    function keepActiveMoveVisible(selected) {
        const scroller = elements.notationScroller;
        if (!selected || !scroller || scroller.offsetParent === null) return;
        const scrollerBox = scroller.getBoundingClientRect();
        const selectedBox = selected.getBoundingClientRect();
        const safeInset = 10;
        if (selectedBox.top < scrollerBox.top + safeInset) {
            scroller.scrollTop -= scrollerBox.top + safeInset - selectedBox.top;
        } else if (selectedBox.bottom > scrollerBox.bottom - safeInset) {
            scroller.scrollTop += selectedBox.bottom - scrollerBox.bottom + safeInset;
        }
    }

    function updateControls() {
        const node = activeNode();
        const hasGame = !!state.game;
        const busy = root.hasAttribute('aria-busy');
        elements.first.disabled = busy || !hasGame || !node;
        elements.previous.disabled = busy || !hasGame || !node;
        elements.next.disabled = busy || !hasGame || (node ? !node.nextId : !state.game.mainline.length);
        elements.last.disabled = busy || !hasGame || !state.game.mainline.length;
        elements.play.disabled = elements.next.disabled;
        elements.flip.disabled = busy || !hasGame;
        elements.focus.disabled = busy || !hasGame;
        elements.nextGame.disabled = busy || !hasGame || state.gameIndex >= (state.collection?.games?.length || 0) - 1;
        elements.engine.disabled = busy || !hasGame;
        elements.saveSource.disabled = busy || !state.sourceText;
        elements.exportDiagram.disabled = busy || !hasGame;
        elements.shareDiagram.disabled = busy || !hasGame;
        elements.shareMenu.querySelector('summary').setAttribute('aria-disabled', String(busy || !hasGame));
    }

    function clearGameFilter() {
        if (!state.filter) return;
        state.filter = '';
        elements.filter.value = '';
    }

    function selectGame(index, announce = true) {
        stopAutoplay();
        const game = state.collection?.games?.[index];
        if (!game) return false;
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
        return true;
    }

    function selectAdjacentGame(offset) {
        if (!state.game || root.hasAttribute('aria-busy')) return false;
        const targetIndex = state.gameIndex + offset;
        if (targetIndex < 0 || targetIndex >= state.collection.games.length) return false;
        clearGameFilter();
        return selectGame(targetIndex);
    }

    function escapePgnHeader(value) {
        return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ');
    }

    function serializeCurrentGame() {
        if (!state.game) return '';
        const headers = Object.entries(state.game.headers)
            .map(([key, value]) => `[${key} "${escapePgnHeader(value)}"]`)
            .join('\n');
        const tokens = [];
        state.game.mainline.forEach((node, index) => {
            if (node.turn === 'w') tokens.push(`${node.moveNumber}.`);
            else if (index === 0) tokens.push(`${node.moveNumber}...`);
            tokens.push(node.san);
            tokens.push(...(node.nags || []));
            (node.comments || []).forEach(comment => tokens.push(`{${String(comment).replace(/[{}]/g, '')}}`));
        });
        tokens.push(state.game.result || '*');
        return `${headers}\n\n${tokens.join(' ')}`.trim();
    }

    async function copyToClipboard(text, successMessage) {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            showMessage(successMessage);
        } catch (_) {
            const area = document.createElement('textarea');
            area.value = text;
            area.readOnly = true;
            area.className = 'pgn-visually-hidden';
            document.body.append(area);
            area.select();
            const copied = typeof document.execCommand === 'function' && document.execCommand('copy');
            area.remove();
            showMessage(copied ? successMessage : 'Copying is unavailable in this browser.', copied ? 'info' : 'error');
        }
        elements.shareMenu.open = false;
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
        const destinationTab = state.pendingTab || (collection.games.length > 1 ? 'games' : 'notation');
        state.pendingTab = null;
        elements.filter.value = '';
        elements.empty.hidden = true;
        elements.gamesEmpty.hidden = true;
        elements.notationEmpty.hidden = true;
        renderAlbums();
        elements.gameCount.textContent = `(${collection.games.length})`;
        elements.filterWrap.hidden = collection.games.length <= 20;
        selectGame(0, false);
        selectTab(destinationTab);
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
                state.pendingTab = null;
                showMessage(response.error?.message || 'The PGN could not be read.', 'error', false);
            }
        });
        worker.addEventListener('error', () => {
            setBusy(false);
            state.pendingAlbumId = null;
            state.pendingTab = null;
            showMessage('The local PGN reader stopped unexpectedly. Try a smaller file.', 'error', false);
        }, { once: true });
        return worker;
    }

    function parseText(text, sourceLabel, albumId = null, destinationTab = null) {
        stopAutoplay();
        const worker = ensureWorker();
        state.requestId += 1;
        state.sourceLabel = sourceLabel;
        state.sourceText = text;
        state.pendingAlbumId = albumId;
        state.pendingTab = destinationTab;
        setBusy(true, 'Reading PGN locally…');
        worker.postMessage({ type: 'parse', requestId: state.requestId, text });
    }

    async function loadAlbum(albumId) {
        const album = state.albums.find(item => item.id === albumId);
        if (!album?.source || root.hasAttribute('aria-busy')) return;
        setBusy(true, `Opening ${album.title}…`);
        try {
            let bytes;
            if (album.id === CAPABLANCA_ALBUM.id) {
                if (!window.CaissaPgnEntitlements) throw new Error('Player collection access is unavailable.');
                bytes = await window.CaissaPgnEntitlements.fetchAlbum(album);
                if (!bytes) { setBusy(false); return; }
            } else {
                const response = await fetch(album.source, {
                    credentials: 'same-origin', cache: 'force-cache', headers: { Accept: 'text/plain' }
                });
                if (!response.ok) throw new Error('The collection is temporarily unavailable.');
                bytes = await response.arrayBuffer();
                if (bytes.byteLength > 10 * 1024 * 1024) throw new Error('This collection exceeds the 10 MiB safety limit.');
            }
            parseText(new TextDecoder().decode(bytes), album.title, album.id);
        } catch (error) {
            state.pendingAlbumId = null;
            state.pendingTab = null;
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

    elements.openButtons.forEach(button => button.addEventListener('click', () => {
        elements.openMenu.open = false;
        elements.file.click();
    }));
    elements.file.addEventListener('change', () => loadFile(elements.file.files?.[0]));
    root.addEventListener('caissa:pgn-load-text', event => {
        const detail = event.detail || {};
        if (root.hasAttribute('aria-busy') || typeof detail.text !== 'string' || !detail.text.trim()) return;
        if (new Blob([detail.text]).size > 10 * 1024 * 1024) {
            showMessage('This PGN is larger than the 10 MiB safety limit.', 'error', false);
            return;
        }
        parseText(
            detail.text,
            detail.sourceLabel || 'CAISSA collection',
            detail.albumId || null,
            detail.openingPage ? 'games' : null
        );
    });
    elements.pasteButtons.forEach(button => button.addEventListener('click', () => {
        elements.openMenu.open = false;
        elements.dialog.showModal();
        window.setTimeout(() => elements.pasteInput.focus(), 0);
    }));
    elements.language.addEventListener('click', () => {
        applyLocale(preferences.locale === 'en' ? 'es' : 'en');
        updateEngineUi(state.engineEnabled ? 'ready' : 'off');
    });
    elements.optionsButton.addEventListener('click', () => elements.optionsDialog.showModal());
    elements.optionsDialog.addEventListener('close', () => elements.optionsButton.focus());
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
    elements.nextGame.addEventListener('click', () => selectAdjacentGame(1));
    elements.shareMenu.addEventListener('click', event => {
        if (event.target.closest('summary') && (!state.game || root.hasAttribute('aria-busy'))) {
            event.preventDefault();
        }
    });
    elements.copyPgn.addEventListener('click', () => copyToClipboard(serializeCurrentGame(), 'PGN copied.'));
    elements.copyFen.addEventListener('click', () => copyToClipboard(currentFen(), 'FEN copied.'));
    elements.saveSource.addEventListener('click', saveSourcePgn);
    elements.exportDiagram.addEventListener('click', exportDiagram);
    elements.shareDiagram.addEventListener('click', shareDiagram);
    elements.flip.addEventListener('click', () => {
        const orientation = board.flip();
        preferences.orientation = orientation;
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
        if (!state.game || root.querySelector('dialog[open]') || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable) return;
        if (event.key === 'PageUp') { event.preventDefault(); selectAdjacentGame(-1); }
        if (event.key === 'PageDown') { event.preventDefault(); selectAdjacentGame(1); }
        if (event.key === 'ArrowLeft') { event.preventDefault(); goTo(activeNode()?.previousId || null); }
        if (event.key === 'ArrowRight') { event.preventDefault(); goNext(); }
        if (event.key === 'Home') { event.preventDefault(); goTo(null); }
        if (event.key === 'End') { event.preventDefault(); goTo(state.game.mainline.at(-1)?.id || null); }
        if (event.key === ' ') { event.preventDefault(); startAutoplay(); }
    });
    window.addEventListener('beforeunload', () => { stopAutoplay(); state.worker?.terminate(); state.engine?.disable(); board.destroy(); }, { once: true });

    renderAlbums();
    applyLocale(preferences.locale);
    renderEngineLines([]);
    updateEngineUi('off');
    updateControls();
})();
