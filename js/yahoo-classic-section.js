/**
 * CAISSA Classic Section
 *
 * Season 4.3C live lobby integration. This module is a view over the existing
 * FICS client events and Spectator TV catalog helpers. It does not open a
 * second WebSocket, poll FICS, parse protocol text, or duplicate gateway logic.
 */
(function() {
    'use strict';

    const MAX_SYSTEM_MESSAGES = 5;
    const CURRENT_ROOM = 'CAISSA Lobby';

    const YahooClassicSection = {
        elements: {},
        initialized: false,
        active: false,
        authenticated: false,
        activeTables: [],
        seekActions: [],
        catalog: null,
        tableOpen: false,
        currentTableId: null,
        currentTableMeta: null,
        liveGame: null,
        moveHistory: [],
        board: null,
        lastRenderedFen: null,
        systemMessages: ['Connect to FICS to receive lobby status.'],

        init() {
            if (this.initialized) return;
            this.cacheElements();
            this.bindFicsEvents();
            this.initialized = true;
            this.syncFromFicsClient();
            this.render();
        },

        cacheElements() {
            this.elements = {
                section: document.getElementById('yahooClassicSection'),
                roomSummary: document.getElementById('ycRoomSummary'),
                tableGrid: document.getElementById('ycTableGrid'),
                playerList: document.getElementById('ycPlayerList'),
                chatBody: document.getElementById('ycChatBody'),
                browserStatus: document.getElementById('ycBrowserStatus'),
                shell: document.querySelector('#yahooClassicSection .yc-shell'),
                gameWindow: document.getElementById('ycGameWindow'),
                classicBoard: document.getElementById('ycClassicBoard'),
                whitePlayerBar: document.getElementById('ycWhitePlayerBar'),
                blackPlayerBar: document.getElementById('ycBlackPlayerBar'),
                moveList: document.getElementById('ycMoveList'),
                gameMode: document.getElementById('ycGameMode'),
                gameDetail: document.getElementById('ycGameDetail'),
                gameMeta: document.getElementById('ycGameMeta'),
                sitBtn: document.getElementById('ycSitBtn'),
                standBtn: document.getElementById('ycStandBtn')
            };
        },

        bindFicsEvents() {
            window.addEventListener('caissa:fics:connection-state', (event) => this.handleFicsEvent(event.detail));
            window.addEventListener('caissa:fics:authenticated', (event) => this.handleFicsEvent(event.detail));
            window.addEventListener('caissa:fics:lobby-updated', (event) => this.handleFicsEvent(event.detail));
            window.addEventListener('caissa:fics:style12', (event) => this.handleFicsEvent(event.detail));
            window.addEventListener('caissa:fics:game-ended', (event) => this.handleFicsEvent(event.detail));
            window.addEventListener('caissa:fics:disconnected', (event) => this.handleFicsEvent(event.detail));
            this.elements.standBtn?.addEventListener('click', () => this.standFromTable());
            this.elements.sitBtn?.addEventListener('click', () => this.addSystemMessage('Choose Join from a waiting table to sit.'));
        },

        onEnter() {
            this.init();
            this.active = true;
            const section = this.elements.section || document.getElementById('yahooClassicSection');
            if (section) section.dataset.ready = 'true';
            this.syncFromFicsClient();
            this.render();
        },

        onExit() {
            this.active = false;
        },

        handleFicsEvent(detail = {}) {
            const event = detail.event || '';
            const payload = detail.payload || {};

            if (event === 'connection-state') {
                this.authenticated = !!payload.authenticated;
                if (payload.state === 'connecting' || payload.state === 'reconnecting') {
                    this.addSystemMessage('Connecting to FICS...');
                } else if (payload.state === 'connected' && payload.authenticated) {
                    this.addSystemMessage('Connected.');
                } else if (payload.state === 'disconnected') {
                    this.handleDisconnected(false);
                }
            } else if (event === 'authenticated') {
                this.authenticated = true;
                this.addSystemMessage('Connected.');
                this.addSystemMessage(`Loading ${CURRENT_ROOM}...`);
            } else if (event === 'lobby-updated') {
                this.authenticated = true;
                this.activeTables = Array.isArray(payload.activeTables) ? payload.activeTables.map((table) => ({ ...table })) : [];
                this.seekActions = Array.isArray(payload.seekActions) ? payload.seekActions.map((seek) => ({ ...seek })) : [];
                this.updateCatalog();
                this.addSystemMessage('Receiving lobby...');
            } else if (event === 'style12') {
                this.handleStyle12(payload);
            } else if (event === 'game-ended') {
                if (payload.liveGame) this.liveGame = { ...payload.liveGame };
                this.addSystemMessage('Observed game finished.');
            } else if (event === 'disconnected') {
                this.handleDisconnected(false);
            }

            this.render();
        },

        handleDisconnected(render = true) {
            this.authenticated = false;
            this.activeTables = [];
            this.seekActions = [];
            this.catalog = window.CaissaSpectatorTVCatalog?.clearCatalog?.() || null;
            this.closeTable(false);
            this.addSystemMessage('Disconnected.');
            if (render) this.render();
        },

        syncFromFicsClient() {
            const client = window.CaissaFICSClient;
            if (!client) return;

            this.authenticated = !!client.authenticated;
            this.activeTables = Array.isArray(client.activeTables) ? client.activeTables.map((table) => ({ ...table })) : [];
            this.seekActions = Array.isArray(client.seekActions) ? client.seekActions.map((seek) => ({ ...seek })) : [];
            this.updateCatalog();
            if (client.liveGame?.currentFen) {
                this.handleStyle12({
                    liveGame: { ...client.liveGame },
                    moveHistory: client.moveHistory?.map((move) => ({ ...move })) || []
                }, false);
            }

            if (this.authenticated) {
                this.addSystemMessage(this.activeTables.length || this.seekActions.length
                    ? 'Receiving lobby...'
                    : 'Connected. Waiting for lobby data...');
            }
        },

        updateCatalog() {
            if (!window.CaissaSpectatorTVCatalog?.updateCatalog) return;
            const entries = this.activeTables.map((table) => ({
                gameId: table.number,
                whitePlayer: table.white,
                blackPlayer: table.black,
                whiteRating: table.whiteRating,
                blackRating: table.blackRating,
                timeControl: table.timeControl,
                variant: table.variant,
                rated: table.rated || table.label,
                observers: table.observers,
                status: 'active',
                source: 'fics-active-tables',
                label: table.label
            }));
            this.catalog = window.CaissaSpectatorTVCatalog.updateCatalog(this.catalog, entries);
        },

        addSystemMessage(message) {
            const text = String(message || '').trim();
            if (!text || this.systemMessages[this.systemMessages.length - 1] === text) return;
            this.systemMessages = [...this.systemMessages, text].slice(-MAX_SYSTEM_MESSAGES);
        },

        render() {
            this.renderSummary();
            this.renderTables();
            this.renderPlayers();
            this.renderGameExperience();
            this.renderChat();
            this.renderStatusBar();
        },

        renderSummary() {
            if (!this.elements.roomSummary) return;
            const players = this.getPlayers();
            const tables = this.activeTables.length + this.seekActions.length;
            this.elements.roomSummary.textContent = `Current Room: ${CURRENT_ROOM} - Players Online: ${players.length} - Active Tables: ${tables}`;
        },

        renderTables() {
            const tableGrid = this.elements.tableGrid;
            if (!tableGrid) return;

            const header = tableGrid.querySelector('.yc-table-head')?.cloneNode(true) || this.createTableHeader();
            const rows = this.buildTableRows();

            if (!this.authenticated) {
                tableGrid.replaceChildren(header, this.createEmptyTableRow('Connect to FICS to receive live room tables.'));
                return;
            }

            if (!rows.length) {
                tableGrid.replaceChildren(header, this.createEmptyTableRow('Receiving lobby. No live tables yet.'));
                return;
            }

            tableGrid.replaceChildren(header, ...rows.map((row) => this.createTableRow(row)));
        },

        buildTableRows() {
            const waiting = this.seekActions.map((seek) => {
                const details = seek.details || {};
                const player = this.formatPlayer(details.player || 'Open Seat', details.rating);
                return {
                    kind: 'waiting',
                    table: seek.number,
                    white: player,
                    black: 'Open Seat',
                watching: '0',
                game: this.formatSeekGameLabel(details),
                gameClass: this.getTableChipClass(this.formatSeekGameLabel(details), details.timeControl),
                time: details.timeControl || 'open',
                status: 'Join',
                    action: 'join',
                    command: `play ${seek.number}`,
                    raw: seek
                };
            });

            const playing = this.activeTables.map((table) => ({
                kind: 'playing',
                table: table.number,
                white: this.formatPlayer(table.white || 'White', table.whiteRating),
                black: this.formatPlayer(table.black || 'Black', table.blackRating),
                watching: this.formatCount(table.observers),
                game: this.formatGameLabel(table),
                gameClass: this.getTableChipClass(this.formatGameLabel(table), table.timeControl, this.isCurrentObservedGame(table.number)),
                time: table.timeControl || 'live',
                status: this.isCurrentObservedGame(table.number) ? 'Watching' : 'Watch',
                action: this.isCurrentObservedGame(table.number) ? 'watching' : 'watch',
                command: `observe ${table.number}`,
                raw: table
            }));

            return [...waiting, ...playing];
        },

        createTableHeader() {
            const row = document.createElement('div');
            row.className = 'yc-table-row yc-table-head';
            row.setAttribute('role', 'row');
            ['Table', 'White', 'Black', 'Watching', 'Game', 'Time', 'Status'].forEach((label) => {
                const cell = document.createElement('span');
                cell.setAttribute('role', 'columnheader');
                cell.textContent = label;
                row.appendChild(cell);
            });
            return row;
        },

        createEmptyTableRow(message) {
            const row = document.createElement('div');
            row.className = 'yc-table-row yc-row-empty';
            row.setAttribute('role', 'row');
            const cell = document.createElement('span');
            cell.setAttribute('role', 'cell');
            cell.textContent = message;
            row.appendChild(cell);
            return row;
        },

        createTableRow(rowData) {
            const row = document.createElement('div');
            row.className = `yc-table-row${rowData.kind === 'waiting' ? ' waiting' : ''}`;
            row.setAttribute('role', 'row');

            [
                `#${rowData.table || '-'}`,
                rowData.white,
                rowData.black,
                rowData.watching,
                { label: rowData.game, className: rowData.gameClass },
                rowData.time
            ].forEach((value) => row.appendChild(this.createCell(value)));

            const statusCell = this.createCell('');
            if (rowData.action === 'watch' || rowData.action === 'join') {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'yc-row-action';
                button.textContent = rowData.status;
                button.title = rowData.action === 'watch'
                    ? `Watch table ${rowData.table}`
                    : `Join table ${rowData.table}`;
                button.addEventListener('click', () => this.handleTableAction(rowData));
                statusCell.replaceChildren(button);
            } else {
                statusCell.textContent = rowData.status;
            }
            row.appendChild(statusCell);
            return row;
        },

        createCell(value) {
            const cell = document.createElement('span');
            cell.setAttribute('role', 'cell');
            if (value && typeof value === 'object') {
                const chip = document.createElement('span');
                chip.className = `yc-table-chip ${value.className || ''}`.trim();
                chip.textContent = value.label || '-';
                cell.appendChild(chip);
                cell.title = chip.textContent;
                return cell;
            }
            cell.textContent = value || '-';
            cell.title = cell.textContent;
            return cell;
        },

        handleTableAction(rowData) {
            const client = window.CaissaFICSClient;
            if (!client?.authenticated) {
                this.addSystemMessage('Connect to FICS before using room actions.');
                this.render();
                return;
            }

            if (rowData.action === 'watch') {
                this.addSystemMessage(`Opening table ${rowData.table}...`);
                this.openTable(rowData.table, rowData.raw, 'watching');
                if (typeof client.switchObservedGame === 'function') {
                    client.switchObservedGame(rowData.table);
                } else {
                    client.send?.(`observe ${rowData.table}`);
                }
                return;
            }

            if (rowData.action === 'join') {
                this.addSystemMessage(`Joining table ${rowData.table}...`);
                this.openTable(rowData.table, rowData.raw, 'joining');
                const lobbyRow = {
                    command: rowData.command,
                    commandType: 'play',
                    table: rowData.table,
                    players: rowData.white,
                    action: 'Join'
                };
                if (typeof client.handleLobbyAction === 'function') {
                    client.handleLobbyAction(lobbyRow);
                } else {
                    client.send?.(rowData.command);
                }
            }
        },

        openTable(tableId, meta = null, mode = 'watching') {
            this.tableOpen = true;
            this.currentTableId = tableId || this.currentTableId;
            this.currentTableMeta = meta || this.currentTableMeta;
            if (this.elements.gameMode) {
                this.elements.gameMode.textContent = mode === 'joining' ? 'Joining Table' : 'Watching Table';
            }
            if (this.elements.gameDetail) {
                this.elements.gameDetail.textContent = this.currentTableId
                    ? `Table ${this.currentTableId} is opening through the existing FICS session.`
                    : 'Opening table through the existing FICS session.';
            }
            this.renderGameExperience();
        },

        closeTable(sendUnobserve = true) {
            const client = window.CaissaFICSClient;
            const gameNumber = this.liveGame?.gameNumber || this.currentTableId;
            if (sendUnobserve && client?.authenticated && gameNumber && this.liveGame?.observedGame) {
                client.send?.(`unobserve ${gameNumber}`);
                this.addSystemMessage(`Standing from table ${gameNumber}.`);
            }
            this.tableOpen = false;
            this.currentTableId = null;
            this.currentTableMeta = null;
            this.liveGame = null;
            this.moveHistory = [];
            this.lastRenderedFen = null;
            this.renderGameExperience();
        },

        standFromTable() {
            this.closeTable(true);
            this.render();
        },

        handleStyle12(payload = {}, render = true) {
            const liveGame = payload.liveGame || {};
            if (!liveGame.currentFen) return;

            this.liveGame = { ...liveGame };
            this.moveHistory = Array.isArray(payload.moveHistory)
                ? payload.moveHistory.map((move) => ({ ...move }))
                : this.moveHistory;
            this.openTable(liveGame.gameNumber || this.currentTableId, this.currentTableMeta, liveGame.observedGame ? 'watching' : 'playing');
            if (liveGame.gameNumber) this.addSystemMessage(`Watching table ${liveGame.gameNumber}.`);
            if (render) this.render();
        },

        renderPlayers() {
            const playerList = this.elements.playerList;
            if (!playerList) return;

            const header = playerList.querySelector('.yc-player-head')?.cloneNode(true) || this.createPlayerHeader();
            const players = this.getPlayers();

            if (!this.authenticated) {
                playerList.replaceChildren(header, this.createEmptyPlayerRow('No live players yet.'));
                return;
            }

            if (!players.length) {
                playerList.replaceChildren(header, this.createEmptyPlayerRow('Receiving lobby players...'));
                return;
            }

            playerList.replaceChildren(header, ...players.map((player) => this.createPlayerRow(player)));
        },

        createPlayerHeader() {
            const row = document.createElement('div');
            row.className = 'yc-player-row yc-player-head';
            row.setAttribute('role', 'row');
            ['Name', 'Rating', 'Tbl'].forEach((label) => {
                const cell = document.createElement('span');
                cell.setAttribute('role', 'columnheader');
                cell.textContent = label;
                row.appendChild(cell);
            });
            return row;
        },

        createEmptyPlayerRow(message) {
            const row = document.createElement('div');
            row.className = 'yc-player-row yc-row-empty';
            row.setAttribute('role', 'row');
            const cell = document.createElement('span');
            cell.setAttribute('role', 'cell');
            cell.textContent = message;
            row.appendChild(cell);
            return row;
        },

        createPlayerRow(player) {
            const row = document.createElement('div');
            row.className = 'yc-player-row';
            row.setAttribute('role', 'row');

            const nameCell = document.createElement('span');
            nameCell.setAttribute('role', 'cell');
            const led = document.createElement('i');
            led.className = `yc-pixel-led ${player.rating ? 'online' : 'guest'}`;
            led.setAttribute('aria-hidden', 'true');
            nameCell.append(led, player.name);
            nameCell.appendChild(this.createPlayerBadge(player));
            nameCell.title = player.name;

            row.append(nameCell, this.createCell(player.rating || 'Guest'), this.createCell(player.table || '-'));
            return row;
        },

        getPlayers() {
            const players = new Map();
            const add = (name, rating, table) => {
                const cleanName = String(name || '').trim();
                if (!cleanName || /^open seat$/i.test(cleanName)) return;
                const key = cleanName.toLowerCase();
                if (!players.has(key)) {
                    players.set(key, {
                        name: cleanName,
                        rating: String(rating || '').trim(),
                        table: table || ''
                    });
                }
            };

            this.activeTables.forEach((table) => {
                add(table.white, table.whiteRating, table.number);
                add(table.black, table.blackRating, table.number);
            });

            this.seekActions.forEach((seek) => {
                add(seek.details?.player, seek.details?.rating, seek.number);
            });

            return Array.from(players.values()).sort((a, b) => a.name.localeCompare(b.name));
        },

        renderChat() {
            if (!this.elements.chatBody) return;
            const fragment = document.createDocumentFragment();
            this.systemMessages.forEach((message) => {
                const line = document.createElement('p');
                const label = document.createElement('strong');
                label.textContent = 'System:';
                line.append(label, ` ${message}`);
                fragment.appendChild(line);
            });
            this.elements.chatBody.replaceChildren(fragment);
            this.elements.chatBody.scrollTop = this.elements.chatBody.scrollHeight;
        },

        renderStatusBar() {
            if (!this.elements.browserStatus) return;
            const players = this.getPlayers().length;
            const tables = this.activeTables.length + this.seekActions.length;
            const status = this.authenticated ? 'Connected to FICS' : 'FICS idle';
            const tableLabel = this.tableOpen && (this.liveGame?.gameNumber || this.currentTableId)
                ? `Watching Table ${this.liveGame?.gameNumber || this.currentTableId}`
                : this.authenticated ? `Inside ${CURRENT_ROOM}` : 'Not connected';
            const turnLabel = this.liveGame?.sideToMove
                ? `${this.liveGame.sideToMove === 'b' ? 'Black' : 'White'} to Move`
                : `${tables} Active Tables - ${players} Players`;
            const values = ['Ready', status, tableLabel, turnLabel];
            this.elements.browserStatus.replaceChildren(...values.map((value, index) => {
                const cell = document.createElement('span');
                cell.textContent = value;
                return cell;
            }));
        },

        renderGameExperience() {
            this.elements.shell?.classList.toggle('yc-table-open', this.tableOpen);
            this.elements.gameWindow?.setAttribute('aria-hidden', this.tableOpen ? 'false' : 'true');
            this.renderClassicBoard();
            this.renderGamePlayers();
            this.renderClassicMoves();
            this.renderGameMeta();
        },

        initClassicBoard() {
            if (this.board || !this.elements.classicBoard || typeof Chessboard === 'undefined') return;
            if (!this.elements.section?.classList.contains('active')) return;
            this.board = Chessboard(this.elements.classicBoard, {
                draggable: false,
                position: 'start'
            });
        },

        renderClassicBoard() {
            if (!this.tableOpen) return;
            this.initClassicBoard();
            const fen = this.liveGame?.currentFen || 'start';
            if (this.board && fen !== this.lastRenderedFen) {
                this.board.position(fen, false);
                this.lastRenderedFen = fen;
            }
            requestAnimationFrame(() => this.board?.resize?.());
        },

        renderGamePlayers() {
            const table = this.getCurrentTableMeta();
            this.renderGamePlayerBar(this.elements.blackPlayerBar, {
                color: 'black',
                name: this.liveGame?.blackName || table?.black || 'Black',
                rating: table?.blackRating || 'FICS',
                clock: this.formatClock(this.liveGame?.blackClock),
                active: this.liveGame?.sideToMove === 'b'
            });
            this.renderGamePlayerBar(this.elements.whitePlayerBar, {
                color: 'white',
                name: this.liveGame?.whiteName || table?.white || 'White',
                rating: table?.whiteRating || 'FICS',
                clock: this.formatClock(this.liveGame?.whiteClock),
                active: this.liveGame?.sideToMove === 'w'
            });
        },

        renderGamePlayerBar(element, player) {
            if (!element) return;
            element.className = `yc-game-player ${player.color}${player.active ? ' turn-active' : ''}`;
            const name = element.querySelector('.yc-player-name');
            const rating = element.querySelector('.yc-player-rating');
            const clock = element.querySelector('.yc-player-clock');
            if (name) {
                name.textContent = player.name || player.color;
                name.title = name.textContent;
            }
            if (rating) rating.textContent = player.rating || 'FICS';
            if (clock) clock.textContent = player.clock || '--:--';
        },

        renderClassicMoves() {
            if (!this.elements.moveList) return;
            if (!this.moveHistory.length) {
                const empty = document.createElement('div');
                empty.className = 'yc-move-empty';
                empty.textContent = this.tableOpen
                    ? 'Moves will appear when the table updates.'
                    : 'Watch or join a table to see moves.';
                this.elements.moveList.replaceChildren(empty);
                return;
            }

            const rows = [];
            this.moveHistory.forEach((move) => {
                let row = rows.find((item) => item.moveNumber === move.moveNumber);
                if (!row) {
                    row = { moveNumber: move.moveNumber, white: '', black: '' };
                    rows.push(row);
                }
                row[move.color] = move.san;
            });

            this.elements.moveList.replaceChildren(...rows.map((row) => {
                const item = document.createElement('div');
                item.className = 'yc-move-row';
                item.append(
                    this.createMoveCell(`${row.moveNumber}.`, 'yc-move-number'),
                    this.createMoveCell(row.white || '...'),
                    this.createMoveCell(row.black || '')
                );
                return item;
            }));
            this.elements.moveList.scrollTop = this.elements.moveList.scrollHeight;
        },

        createMoveCell(value, className = '') {
            const cell = document.createElement('span');
            if (className) cell.className = className;
            cell.textContent = value || '';
            cell.title = cell.textContent;
            return cell;
        },

        renderGameMeta() {
            const table = this.getCurrentTableMeta();
            const gameNumber = this.liveGame?.gameNumber || this.currentTableId;
            const side = this.liveGame?.sideToMove === 'b' ? 'Black' : this.liveGame?.sideToMove === 'w' ? 'White' : null;
            const time = table?.timeControl || this.liveGame?.initialTime || 'live';
            const game = table ? this.formatGameLabel(table) : 'Live';

            if (this.elements.gameMode) {
                this.elements.gameMode.textContent = gameNumber ? `Table ${gameNumber}` : 'No Table';
            }
            if (this.elements.gameDetail) {
                this.elements.gameDetail.textContent = gameNumber
                    ? `${game} ${time} - ${side ? `${side} to move` : 'waiting for board'}`
                    : 'Watch or join a room table to open the classic board.';
            }
            if (this.elements.gameMeta) {
                this.elements.gameMeta.textContent = gameNumber ? `#${gameNumber} - ${game} - ${time}` : 'No table';
            }
            this.elements.standBtn?.toggleAttribute('disabled', !this.tableOpen);
            this.elements.sitBtn?.toggleAttribute('disabled', !this.authenticated);
        },

        getCurrentTableMeta() {
            const gameNumber = this.liveGame?.gameNumber || this.currentTableId;
            if (!gameNumber) return this.currentTableMeta;
            return this.activeTables.find((table) => String(table.number) === String(gameNumber))
                || this.currentTableMeta
                || null;
        },

        formatClock(seconds) {
            if (window.CaissaFICSClient?.formatClock) {
                return window.CaissaFICSClient.formatClock(seconds);
            }
            if (!Number.isFinite(seconds)) return '--:--';
            const safeSeconds = Math.max(0, seconds);
            return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`;
        },

        isCurrentObservedGame(gameNumber) {
            const liveGame = window.CaissaFICSClient?.liveGame;
            return !!liveGame?.observedGame && String(liveGame.gameNumber) === String(gameNumber);
        },

        formatPlayer(name, rating) {
            const cleanName = String(name || '').trim() || 'Player';
            const cleanRating = String(rating || '').trim();
            return cleanRating ? `${cleanName} (${cleanRating})` : cleanName;
        },

        formatGameLabel(table) {
            const label = String(table?.label || '').toLowerCase();
            if (label.includes('unrated')) return 'Unrated';
            if (label.includes('rated')) return 'Rated';
            return table?.variant || 'Live';
        },

        formatSeekGameLabel(details = {}) {
            const rated = String(details.rated || '').toLowerCase();
            if (rated.includes('rated') && !rated.includes('unrated')) return 'Rated';
            if (rated.includes('unrated')) return 'Casual';
            return 'Casual';
        },

        getTableChipClass(label, timeControl, observed = false) {
            if (observed) return 'observed';
            const text = `${label || ''} ${timeControl || ''}`.toLowerCase();
            if (text.includes('private')) return 'private';
            if (text.includes('bullet') || /\b1\+/.test(text)) return 'blitz';
            if (text.includes('blitz') || /\b[2-5]\+/.test(text)) return 'blitz';
            if (text.includes('rapid') || /\b(?:10|15)\+/.test(text)) return 'rapid';
            if (text.includes('rated') && !text.includes('unrated')) return 'rated';
            return 'casual';
        },

        createPlayerBadge(player) {
            const badge = document.createElement('span');
            const name = String(player?.name || '');
            const isComputer = /(stockfish|lc0|leela|komodo|crafty|gnuchess|bot|engine|comp)/i.test(name);
            const isObserving = this.liveGame && String(player?.table || '') === String(this.liveGame.gameNumber || '');
            const label = isComputer ? 'Computer' : player?.rating ? 'Registered' : 'Guest';
            badge.className = `yc-player-badge${isComputer ? ' computer' : ''}${isObserving ? ' observing' : ''}`;
            badge.textContent = isObserving && !isComputer ? 'Observing' : label;
            return badge;
        },

        formatCount(value) {
            const parsed = Number.parseInt(String(value || '').replace(/[^\d]/g, ''), 10);
            return Number.isFinite(parsed) ? String(parsed) : '0';
        }
    };

    if (window.CaissaNavigation?.registerSection) {
        window.CaissaNavigation.registerSection('yahooClassic', YahooClassicSection);
    } else {
        window.addEventListener('DOMContentLoaded', () => {
            window.CaissaNavigation?.registerSection?.('yahooClassic', YahooClassicSection);
        });
    }

    window.CaissaYahooClassic = YahooClassicSection;
})();
