(function installFicsLayoutShell(root) {
    'use strict';

    const SCHEMA_VERSION = '1.4.0';
    const FLAG = 'CAISSA_FICS_REDESIGN_ENABLED';
    const LOBBY_VIEWS = Object.freeze(['tables', 'players', 'seek']);
    const GAME_STATES = new Set(['PLAYING', 'OBSERVING', 'GAME_OVER']);
    const PRODUCT_EVENTS = Object.freeze([
        'authenticated', 'lobby-updated', 'style12', 'game-ended', 'disconnected', 'observer-left',
        'observation-requested', 'observation-settled', 'observation-error', 'connection-state',
        'game-action-delivery', 'game-action-ready'
    ]);
    let mounted = null;
    let selectedLobbyView = null;
    let dismissedEndedGameKey = null;
    let lastGameModeAvailable = false;
    let lastProductState = null;
    let resizeObserver = null;
    let resizeFrame = 0;
    let actionNotice = null;
    let resignConfirmationKey = null;
    let gameMoveScrollTop = 0;
    let lastGameMoveSignature = null;
    let settingsOpen = false;
    let settingsReturnFocus = null;
    let lastAuthenticated = false;
    const seekDraft = { minutes: '5', increment: '0', rated: 'unrated', color: 'random' };
    const eventListeners = [];

    function createElement(tag, className, attributes = {}) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
        return element;
    }

    function rememberRelocation(node) {
        return { node, parent: node.parentNode, nextSibling: node.nextSibling };
    }

    function restoreRelocations(relocations = []) {
        relocations.forEach(({ node, parent, nextSibling }) => {
            parent.insertBefore(node, nextSibling?.parentNode === parent ? nextSibling : null);
        });
    }

    function focusableSettingsControls() {
        if (!mounted?.settingsPanel) return [];
        return [...mounted.settingsPanel.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )].filter((node) => !node.hidden && node.getClientRects().length > 0);
    }

    function setSettingsOpen(open, { restoreFocus = true } = {}) {
        if (!mounted) return false;
        settingsOpen = open === true;
        mounted.settingsLayer.hidden = !settingsOpen;
        mounted.settingsButton.setAttribute('aria-expanded', String(settingsOpen));
        mounted.settingsButton.classList.toggle('is-open', settingsOpen);
        if (settingsOpen) {
            settingsReturnFocus = document.activeElement;
            mounted.backgroundInertRecords = [...document.body.children]
                .filter((node) => node !== mounted.settingsLayer)
                .map((node) => ({ node, inert: node.inert }));
            mounted.backgroundInertRecords.forEach(({ node }) => { node.inert = true; });
            mounted.shell.inert = true;
            if (mounted.pageHeader) mounted.pageHeader.inert = true;
            document.body.classList.add('fics-rd5-settings-active');
            mounted.settingsClose.focus({ preventScroll: true });
        } else {
            mounted.backgroundInertRecords?.forEach(({ node, inert }) => { node.inert = inert; });
            mounted.backgroundInertRecords = [];
            mounted.shell.inert = false;
            if (mounted.pageHeader) mounted.pageHeader.inert = false;
            document.body.classList.remove('fics-rd5-settings-active');
            if (restoreFocus) {
                const target = settingsReturnFocus?.isConnected ? settingsReturnFocus : mounted.settingsButton;
                target?.focus?.({ preventScroll: true });
            }
            settingsReturnFocus = null;
        }
        return settingsOpen;
    }

    function handleSettingsKeydown(event) {
        if (!settingsOpen) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            setSettingsOpen(false);
            return;
        }
        if (event.key !== 'Tab') return;
        const controls = focusableSettingsControls();
        if (!controls.length) {
            event.preventDefault();
            mounted.settingsPanel.focus();
            return;
        }
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function setConsoleExpanded(expanded) {
        return root.CaissaFICSClient?.setConsoleExpanded?.(expanded);
    }

    function getBaseViewState() {
        return root.CaissaFICSPresentation?.getViewState?.() || Object.freeze({
            productState: 'DISCONNECTED', bodyMode: 'CONNECTION', activeTab: null,
            primaryGameMode: false, gameModeAvailable: false, returnToGameAvailable: false
        });
    }

    function getViewState() {
        const options = {
            ...(selectedLobbyView ? { requestedLobbyView: selectedLobbyView } : {}),
            ...(dismissedEndedGameKey ? { dismissEndedGame: true } : {})
        };
        return root.CaissaFICSPresentation?.getViewState?.(options) || getBaseViewState();
    }

    function getProjection() {
        const options = {
            ...(selectedLobbyView ? { requestedLobbyView: selectedLobbyView } : {}),
            ...(dismissedEndedGameKey ? { dismissEndedGame: true } : {})
        };
        return root.CaissaFICSPresentation?.getSnapshot?.(options) || {
            productState: 'DISCONNECTED', connection: { authenticated: false }, session: {},
            lobby: { activeTables: [], pendingSeek: null, playersSupported: false }, game: {},
            capabilities: { observeTable: false, createSeek: false, cancelSeek: false },
            presentation: getViewState()
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
            appendText(wrapper, 'p', 'fics-rd3-empty', 'No tables loaded.', { role: 'status' });
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
        if (!snapshot.capabilities.createSeek && snapshot.presentation.gameModeAvailable) {
            appendText(wrapper, 'p', 'fics-rd3-form-note', 'Return from the active game before creating a new table.');
        }
        return wrapper;
    }

    function renderPlayers() {
        const wrapper = createElement('div', 'fics-rd6-players', { 'data-fics-body-view': 'players' });
        appendText(wrapper, 'p', 'fics-rd6-minimal-state', 'Player directory unavailable.', { role: 'status' });
        return wrapper;
    }

    function gameKey(game = {}) {
        return `${game.gameNumber ?? 'unknown'}:${game.mode || 'idle'}`;
    }

    function resultHeadline(result = {}) {
        if (result.result === '1-0') return 'White wins';
        if (result.result === '0-1') return 'Black wins';
        if (result.result === '1/2-1/2') return 'Draw';
        return 'Game complete';
    }

    function pairMoves(moves = []) {
        const rows = [];
        moves.forEach((move) => {
            const number = Number.isFinite(move.moveNumber) ? move.moveNumber : null;
            const color = move.color === 'white' || move.color === 'black' ? move.color : null;
            let row = rows[rows.length - 1];
            if (!row || row.moveNumber !== number || (color && row[color] !== null)) {
                row = { moveNumber: number, white: null, black: null };
                rows.push(row);
            }
            if (color) row[color] = move.san || '';
        });
        return rows;
    }

    function actionResultNotice(result, successMessage, failureLabel) {
        if (result?.ok) return { view: 'game', type: 'status', message: successMessage };
        const code = result?.code || 'ACTION_UNAVAILABLE';
        return { view: 'game', type: 'error', message: `${failureLabel} (${code}).` };
    }

    function renderGameMoves(snapshot) {
        const moves = Array.isArray(snapshot.game.moves) ? snapshot.game.moves : [];
        const region = createElement('section', 'fics-rd4-moves', { 'aria-labelledby': 'ficsRd4MovesTitle' });
        const heading = createElement('div', 'fics-rd4-moves-heading');
        appendText(heading, 'h4', 'fics-rd4-moves-title', 'Moves', { id: 'ficsRd4MovesTitle' });
        appendText(heading, 'span', 'fics-rd4-move-count', `${moves.length} captured`);
        region.append(heading);

        const scroller = createElement('div', 'fics-rd4-move-scroll', {
            tabindex: '0', 'data-fics-game-moves': '', 'aria-label': 'Game move notation'
        });
        if (!moves.length) {
            appendText(scroller, 'p', 'fics-rd4-moves-empty', snapshot.game.observed
                ? 'No moves have been captured since observation began.'
                : 'No moves have been captured yet.');
        } else {
            const header = createElement('div', 'fics-rd4-move-row is-header', { 'aria-hidden': 'true' });
            appendText(header, 'span', '', '#');
            appendText(header, 'span', '', 'White');
            appendText(header, 'span', '', 'Black');
            scroller.append(header);
            pairMoves(moves).forEach((row) => {
                const item = createElement('div', 'fics-rd4-move-row', { role: 'group' });
                appendText(item, 'span', 'fics-rd4-move-number', row.moveNumber === null ? '—' : `${row.moveNumber}.`);
                for (const color of ['white', 'black']) {
                    const san = row[color];
                    appendText(item, 'span', san ? 'fics-rd4-san' : 'fics-rd4-san is-missing', san || '—',
                        san ? {} : { title: 'Canonical notation was not captured' });
                }
                scroller.append(item);
            });
        }
        region.append(scroller);

        if (snapshot.game.observed) {
            appendText(region, 'p', 'fics-rd4-record-note',
                'Observation history is locally captured and may omit moves played before observation began.');
        } else if (snapshot.game.pgn?.mayBePartial) {
            appendText(region, 'p', 'fics-rd4-record-note',
                'This record begins from a captured position and may be partial.');
        }

        const signature = `${gameKey(snapshot.game)}:${moves.length}:${moves.at(-1)?.moveNumber ?? ''}:${moves.at(-1)?.san ?? ''}`;
        const schedule = root.requestAnimationFrame || ((callback) => root.setTimeout(callback, 0));
        schedule(() => {
            if (!scroller.isConnected) return;
            scroller.scrollTop = signature === lastGameMoveSignature ? gameMoveScrollTop : scroller.scrollHeight;
            lastGameMoveSignature = signature;
            gameMoveScrollTop = scroller.scrollTop;
        });
        return region;
    }

    function renderPgnAction(snapshot, actions) {
        if (!snapshot.capabilities.downloadPGN) return;
        const partial = snapshot.game.pgn?.mayBePartial === true;
        const button = appendText(actions, 'button', 'fics-rd4-action', partial ? 'Partial PGN' : 'Download PGN', {
            type: 'button', 'data-fics-game-action': 'pgn', 'data-fics-focus-key': 'game-pgn',
            'aria-label': partial ? 'Download partial PGN' : 'Download PGN'
        });
        button.addEventListener('click', () => {
            const result = root.CaissaFICSClient?.downloadPGN?.() || { ok: false, code: 'PGN_UNAVAILABLE' };
            actionNotice = actionResultNotice(result,
                partial ? 'Partial PGN downloaded.' : 'PGN downloaded.', 'The PGN could not be downloaded');
            render();
        });
    }

    function renderPlayingActions(snapshot, actions) {
        const currentKey = gameKey(snapshot.game);
        if (resignConfirmationKey === currentKey) {
            const confirmation = createElement('div', 'fics-rd4-confirm', {
                role: 'group', 'aria-label': 'Confirm resignation'
            });
            appendText(confirmation, 'span', 'fics-rd4-confirm-copy', 'Resign this game?');
            const confirm = appendText(confirmation, 'button', 'fics-rd4-action is-danger', 'Confirm Resign', {
                type: 'button', 'data-fics-game-action': 'confirm-resign', 'data-fics-focus-key': 'game-confirm-resign'
            });
            confirm.disabled = !snapshot.capabilities.resign;
            confirm.addEventListener('click', () => {
                const result = root.CaissaFICSClient?.resign?.() || { ok: false, code: 'ACTION_UNAVAILABLE' };
                resignConfirmationKey = null;
                actionNotice = actionResultNotice(result,
                    'Resign command delivered to the connection; FICS confirmation is pending.',
                    'The resign command was not delivered');
                render();
            });
            const cancel = appendText(confirmation, 'button', 'fics-rd4-action', 'Cancel', {
                type: 'button', 'data-fics-game-action': 'cancel-resign', 'data-fics-focus-key': 'game-cancel-resign'
            });
            cancel.addEventListener('click', () => {
                resignConfirmationKey = null;
                render();
            });
            actions.append(confirmation);
        } else {
            const resign = appendText(actions, 'button', 'fics-rd4-action is-danger',
                snapshot.game.actions?.resignInFlight ? 'Sending Resign…' : 'Resign', {
                    type: 'button', 'data-fics-game-action': 'resign', 'data-fics-focus-key': 'game-resign'
                });
            resign.disabled = !snapshot.capabilities.resign;
            resign.addEventListener('click', () => {
                resignConfirmationKey = currentKey;
                actionNotice = null;
                render();
            });
        }

        const draw = appendText(actions, 'button', 'fics-rd4-action',
            snapshot.game.actions?.drawInFlight ? 'Sending Draw…' : 'Offer Draw', {
                type: 'button', 'data-fics-game-action': 'draw', 'data-fics-focus-key': 'game-draw'
            });
        draw.disabled = !snapshot.capabilities.offerDraw;
        draw.addEventListener('click', () => {
            const result = root.CaissaFICSClient?.offerDraw?.() || { ok: false, code: 'ACTION_UNAVAILABLE' };
            actionNotice = actionResultNotice(result,
                'Draw offer delivered to the connection; FICS confirmation is pending.',
                'The draw offer was not delivered');
            render();
        });
    }

    function renderGameActions(snapshot) {
        const actions = createElement('div', 'fics-rd4-actions', { 'aria-label': 'Game actions' });
        if (snapshot.game.mode === 'playing') renderPlayingActions(snapshot, actions);
        if (snapshot.game.mode === 'observing') {
            const leave = appendText(actions, 'button', 'fics-rd4-action',
                snapshot.game.actions?.leaveObservationInFlight ? 'Leaving…' : 'Leave Observation', {
                    type: 'button', 'data-fics-game-action': 'leave-observation',
                    'data-fics-focus-key': 'game-leave-observation'
                });
            leave.disabled = !snapshot.capabilities.returnFromObservation;
            leave.addEventListener('click', () => {
                const result = root.CaissaFICSClient?.leaveObservedGame?.(snapshot.game.gameNumber)
                    || { ok: false, code: 'ACTION_UNAVAILABLE' };
                actionNotice = actionResultNotice(result,
                    'Leave Observation was delivered. Returning to the lobby.',
                    'Observation could not be closed');
                render();
            });
        }
        renderPgnAction(snapshot, actions);
        if (snapshot.game.mode === 'ended') {
            const lobby = appendText(actions, 'button', 'fics-rd4-action is-primary', 'Return to Lobby', {
                type: 'button', 'data-fics-game-action': 'return-lobby', 'data-fics-focus-key': 'game-return-lobby'
            });
            lobby.addEventListener('click', () => dismissEndedGame(snapshot.game));
        }
        return actions;
    }

    function renderGame(snapshot) {
        const game = snapshot.game;
        const wrapper = createElement('div', 'fics-rd4-game', { 'data-fics-body-view': 'game' });
        const header = createElement('header', 'fics-rd4-game-header');
        const status = game.mode === 'playing' ? 'Live game' : game.mode === 'observing' ? 'Observing' : 'Game complete';
        appendText(header, 'span', 'fics-rd4-mode', status);
        const white = game.identities?.white?.name || 'White';
        const black = game.identities?.black?.name || 'Black';
        appendText(header, 'h3', 'fics-rd4-game-title', `${white} vs ${black}`);
        const detail = [game.gameNumber === null ? null : `Game #${game.gameNumber}`,
            game.sideToMove && game.mode !== 'ended' ? `${game.sideToMove === 'white' ? 'White' : 'Black'} to move` : null]
            .filter(Boolean).join(' · ');
        if (detail) appendText(header, 'p', 'fics-rd4-game-meta', detail);
        if (game.mode === 'ended') {
            const result = createElement('div', 'fics-rd4-result', { role: 'status' });
            appendText(result, 'strong', 'fics-rd4-result-title', resultHeadline(game.result));
            if (game.result?.summary) appendText(result, 'span', 'fics-rd4-result-detail', game.result.summary);
            header.append(result);
        }
        wrapper.append(header);
        const notice = noticeNode('game');
        if (notice) wrapper.append(notice);
        wrapper.append(renderGameMoves(snapshot), renderGameActions(snapshot));
        return wrapper;
    }

    function renderBody(snapshot, view) {
        const focus = rememberFocus();
        const currentScroller = mounted.dynamic.querySelector('[data-fics-game-moves]');
        if (currentScroller) gameMoveScrollTop = currentScroller.scrollTop;
        const dynamic = mounted.dynamic;
        dynamic.replaceChildren();
        if (view.primaryGameMode) dynamic.append(renderGame(snapshot));
        if (view.activeTab === 'tables') dynamic.append(renderTables(snapshot));
        if (view.activeTab === 'players') dynamic.append(renderPlayers());
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
        const baseSnapshot = root.CaissaFICSPresentation?.getSnapshot?.() || null;
        if (baseView.productState !== 'GAME_OVER') dismissedEndedGameKey = null;
        if (baseView.productState === 'GAME_OVER' && dismissedEndedGameKey
            && gameKey(baseSnapshot?.game) !== dismissedEndedGameKey) dismissedEndedGameKey = null;
        if (GAME_STATES.has(baseView.productState) && lastProductState
            && baseView.productState !== lastProductState) selectedLobbyView = null;
        if (baseView.gameModeAvailable && !lastGameModeAvailable) selectedLobbyView = null;
        lastGameModeAvailable = baseView.gameModeAvailable;
        lastProductState = baseView.productState;
        const snapshot = getProjection();
        const view = { productState: snapshot.productState, ...snapshot.presentation };
        const activeTab = view.primaryGameMode ? null : (view.activeTab || selectedLobbyView || 'tables');
        view.activeTab = activeTab;
        if (!view.primaryGameMode) view.bodyMode = 'LOBBY';
        if (snapshot.connection.authenticated && !lastAuthenticated) setConsoleExpanded(false);
        lastAuthenticated = snapshot.connection.authenticated;
        if (!view.primaryGameMode) resignConfirmationKey = null;

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

        const compactConnectionLabels = {
            disconnected: 'Disconnected', connecting: 'Connecting', connected: 'Connected',
            reconnecting: 'Reconnecting', error: 'Error'
        };
        if (mounted.connectionStatus) {
            mounted.connectionStatus.textContent = compactConnectionLabels[snapshot.connection.state] || 'Disconnected';
        }
        renderBody(snapshot, view);

        mounted.roomPanel.hidden = true;
        mounted.sidePanel.hidden = true;
        scheduleBoardResize();
        return view;
    }

    function selectLobbyView(view) {
        if (!LOBBY_VIEWS.includes(view)) return false;
        if (selectedLobbyView !== view) actionNotice = null;
        selectedLobbyView = view;
        render();
        root.CaissaFICSClient?.announceWorkspaceAvailability?.(view);
        return true;
    }

    function dismissEndedGame(game) {
        if (getBaseViewState().productState !== 'GAME_OVER') return false;
        dismissedEndedGameKey = gameKey(game);
        selectedLobbyView = 'tables';
        actionNotice = null;
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
        const pageHeader = section?.querySelector('.fics-header');
        const connectionHeading = section?.querySelector('.fics-connection-info > h3');
        const gatewayDetails = section?.querySelector('.fics-gateway-details');
        const sessionColumn = section?.querySelector('.fics-session-column');
        const boardSection = section?.querySelector('.fics-board-section');
        const boardContainer = document.getElementById('ficsBoardContainer');
        const roomPanel = section?.querySelector('.fics-room-panel');
        const sidePanel = section?.querySelector('.fics-side-panel');
        const consoleSection = section?.querySelector('.fics-console-section');
        const consoleHeader = consoleSection?.querySelector('.fics-console-header');
        const consoleToggle = document.getElementById('ficsConsoleToggle');
        const connectionStatus = document.getElementById('ficsConnectionStatus');
        if (![section, layout, gameArea, connection, pageHeader, connectionHeading, gatewayDetails,
            sessionColumn, boardSection, boardContainer, roomPanel, sidePanel, consoleSection,
            consoleHeader, consoleToggle, connectionStatus].every(Boolean)) return false;

        const relocations = [connectionHeading, gatewayDetails, sessionColumn].map(rememberRelocation);
        const consoleState = {
            display: document.getElementById('ficsConsoleContainer')?.style.display || '',
            expanded: document.getElementById('ficsConsoleToggle')?.getAttribute('aria-expanded') || 'true',
            label: document.getElementById('ficsConsoleToggle')?.getAttribute('aria-label') || '',
            text: document.getElementById('ficsConsoleToggle')?.textContent || '',
            sectionExpanded: consoleSection.getAttribute('data-console-expanded')
        };

        const shell = createElement('div', 'fics-rd2-shell', { 'data-fics-redesign-shell': 'v2' });
        const boardRegion = createElement('div', 'fics-rd2-board', {
            'data-fics-shell-region': 'board', role: 'group', 'aria-label': 'FICS chessboard'
        });
        const workspace = createElement('aside', 'fics-rd2-workspace', {
            'data-fics-shell-region': 'workspace', 'aria-label': 'FICS workspace'
        });
        const head = createElement('header', 'fics-rd2-workspace-head', {
            'data-fics-workspace-region': 'head', 'data-fics-region-sizing': 'intrinsic'
        });
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
            id: 'ficsRd2Body', role: 'tabpanel', tabindex: '0',
            'data-fics-workspace-region': 'body', 'data-fics-region-sizing': 'flexible'
        });
        const returnToGameButton = createElement('button', 'fics-rd2-return-game', {
            type: 'button', 'aria-label': 'Return to active FICS game'
        });
        returnToGameButton.textContent = '\u2190 Game';
        returnToGameButton.hidden = true;
        returnToGameButton.addEventListener('click', returnToGame);
        const dynamic = createElement('div', 'fics-rd3-dynamic-body', { 'aria-live': 'off' });
        body.append(returnToGameButton, dynamic);

        const foot = createElement('footer', 'fics-rd2-workspace-foot', {
            'data-fics-workspace-region': 'foot', 'data-fics-region-sizing': 'intrinsic'
        });
        const settingsButton = createElement('button', 'fics-rd5-settings-button', {
            type: 'button', 'aria-label': 'Open FICS settings', title: 'Settings',
            'aria-controls': 'ficsRd5SettingsPanel', 'aria-expanded': 'false'
        });
        const settingsIcon = createElement('i', 'fas fa-cog', { 'aria-hidden': 'true' });
        appendText(settingsButton, 'span', '', 'Settings');
        settingsButton.prepend(settingsIcon);
        const settingsLayer = createElement('div', 'fics-rd5-settings-layer', { hidden: '' });
        const settingsPanel = createElement('section', 'fics-rd5-settings-panel', {
            id: 'ficsRd5SettingsPanel', role: 'dialog', 'aria-modal': 'true',
            'aria-labelledby': 'ficsRd5SettingsTitle', tabindex: '-1'
        });
        const settingsHeader = createElement('header', 'fics-rd5-settings-header');
        const settingsTitle = appendText(settingsHeader, 'h2', 'fics-rd5-settings-title', 'Settings', {
            id: 'ficsRd5SettingsTitle'
        });
        const settingsClose = appendText(settingsHeader, 'button', 'fics-rd5-settings-close', '\u00d7', {
            type: 'button', 'aria-label': 'Close FICS settings'
        });
        const settingsContent = createElement('div', 'fics-rd5-settings-content');
        const connectionDiagnostics = createElement('section', 'fics-rd5-settings-group', {
            'aria-labelledby': 'ficsRd5ConnectionTitle'
        });
        connectionHeading.id = 'ficsRd5ConnectionTitle';
        connectionDiagnostics.append(connectionHeading, gatewayDetails);
        sessionColumn.classList.add('fics-rd5-settings-group');
        settingsContent.append(connectionDiagnostics, sessionColumn);
        settingsPanel.append(settingsHeader, settingsContent);
        settingsLayer.append(settingsPanel);
        workspace.append(head, body, foot);
        shell.append(boardRegion, workspace);
        layout.insertBefore(shell, gameArea);
        layout.append(settingsButton);
        document.body.append(settingsLayer);
        boardRegion.append(boardSection);
        foot.append(connection, consoleSection);
        gameArea.hidden = true;
        section.classList.add('fics-rd2-enabled');
        section.dataset.ficsRedesign = 'v2';

        mounted = { section, layout, gameArea, connection, pageHeader, connectionHeading, gatewayDetails,
            sessionColumn, relocations, consoleState, boardSection, boardContainer,
            roomPanel, sidePanel, consoleSection, shell, boardRegion, workspace, head,
            body, foot, tabs, returnToGame: returnToGameButton, dynamic, connectionStatus,
            settingsButton, settingsLayer, settingsPanel, settingsClose, settingsContent,
            backgroundInertRecords: [] };
        settingsButton.addEventListener('click', () => setSettingsOpen(!settingsOpen));
        settingsClose.addEventListener('click', () => setSettingsOpen(false));
        settingsLayer.addEventListener('click', (event) => {
            if (event.target === settingsLayer) setSettingsOpen(false);
        });
        settingsLayer.addEventListener('keydown', handleSettingsKeydown);
        setConsoleExpanded(false);
        if (typeof root.ResizeObserver === 'function') {
            resizeObserver = new root.ResizeObserver(scheduleBoardResize);
            resizeObserver.observe(boardRegion);
        }
        root.addEventListener?.('resize', scheduleBoardResize, { passive: true });
        root.addEventListener?.('orientationchange', scheduleBoardResize, { passive: true });
        bindProductUpdates();
        render();
        root.CaissaFICSClient?.announceWorkspaceAvailability?.('tables');
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
        setSettingsOpen(false, { restoreFocus: false });
        restoreRelocations(current.relocations);
        current.sessionColumn.classList.remove('fics-rd5-settings-group');
        current.connectionHeading.removeAttribute('id');
        const consoleContainer = document.getElementById('ficsConsoleContainer');
        const consoleToggle = document.getElementById('ficsConsoleToggle');
        if (consoleContainer) consoleContainer.style.display = current.consoleState.display;
        if (consoleToggle) {
            consoleToggle.setAttribute('aria-expanded', current.consoleState.expanded);
            consoleToggle.setAttribute('aria-label', current.consoleState.label);
            consoleToggle.textContent = current.consoleState.text;
        }
        if (current.consoleState.sectionExpanded === null) current.consoleSection.removeAttribute('data-console-expanded');
        else current.consoleSection.setAttribute('data-console-expanded', current.consoleState.sectionExpanded);
        current.settingsLayer.remove();
        current.settingsButton.remove();
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
        dismissedEndedGameKey = null;
        lastGameModeAvailable = false;
        lastProductState = null;
        actionNotice = null;
        resignConfirmationKey = null;
        gameMoveScrollTop = 0;
        lastGameMoveSignature = null;
        settingsOpen = false;
        settingsReturnFocus = null;
        lastAuthenticated = false;
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
            dismissedEndedGameKey,
            productState: mounted?.section.dataset.ficsProductState || null,
            settingsOpen,
            consoleExpanded: mounted?.consoleSection.querySelector('#ficsConsoleToggle')?.getAttribute('aria-expanded') === 'true',
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
        setSettingsOpen,
        setEnabled
    });
    root.CaissaFICSShell = api;

    function boot() {
        if (root[FLAG] !== false) mount();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})(typeof window !== 'undefined' ? window : globalThis);
