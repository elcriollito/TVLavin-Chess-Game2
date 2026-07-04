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

    const YahooClassicSection = {
        elements: {},
        initialized: false,
        active: false,
        authenticated: false,
        activeTables: [],
        seekActions: [],
        catalog: null,
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
                browserStatus: document.getElementById('ycBrowserStatus')
            };
        },

        bindFicsEvents() {
            window.addEventListener('caissa:fics:connection-state', (event) => this.handleFicsEvent(event.detail));
            window.addEventListener('caissa:fics:authenticated', (event) => this.handleFicsEvent(event.detail));
            window.addEventListener('caissa:fics:lobby-updated', (event) => this.handleFicsEvent(event.detail));
            window.addEventListener('caissa:fics:style12', (event) => this.handleFicsEvent(event.detail));
            window.addEventListener('caissa:fics:game-ended', (event) => this.handleFicsEvent(event.detail));
            window.addEventListener('caissa:fics:disconnected', (event) => this.handleFicsEvent(event.detail));
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
                this.addSystemMessage('Loading room...');
            } else if (event === 'lobby-updated') {
                this.authenticated = true;
                this.activeTables = Array.isArray(payload.activeTables) ? payload.activeTables.map((table) => ({ ...table })) : [];
                this.seekActions = Array.isArray(payload.seekActions) ? payload.seekActions.map((seek) => ({ ...seek })) : [];
                this.updateCatalog();
                this.addSystemMessage('Receiving lobby...');
            } else if (event === 'style12') {
                const gameNumber = payload.liveGame?.gameNumber;
                if (gameNumber) this.addSystemMessage(`Watching table ${gameNumber}.`);
            } else if (event === 'game-ended') {
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
            this.renderChat();
            this.renderStatusBar();
        },

        renderSummary() {
            if (!this.elements.roomSummary) return;
            const players = this.getPlayers();
            const tables = this.activeTables.length + this.seekActions.length;
            this.elements.roomSummary.textContent = `Players Online: ${players.length} - Tables Available: ${tables}`;
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
                    game: details.rated || 'unrated',
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
                rowData.game,
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
                if (typeof client.switchObservedGame === 'function') {
                    client.switchObservedGame(rowData.table);
                } else {
                    client.send?.(`observe ${rowData.table}`);
                }
                return;
            }

            if (rowData.action === 'join') {
                this.addSystemMessage(`Joining table ${rowData.table}...`);
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
            const lobby = this.authenticated ? 'Receiving lobby...' : 'Not connected';
            const values = ['Done', status, `Watching ${tables} tables`, `${players} players online`];
            this.elements.browserStatus.replaceChildren(...values.map((value, index) => {
                const cell = document.createElement('span');
                cell.textContent = index === 2 && !this.authenticated ? lobby : value;
                return cell;
            }));
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
