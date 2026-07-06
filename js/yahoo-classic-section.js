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
    const ACTIVITY_LIMIT = 8;
    const SOUND_CUES = Object.freeze(['connect', 'disconnect', 'move', 'capture', 'join', 'challenge', 'notify', 'gameover', 'error']);
    const SOUND_STORAGE_KEY = 'caissaClassicSoundEnabled';
    const SOUND_PATTERNS = Object.freeze({
        connect: [{ frequency: 523, duration: 0.06 }, { frequency: 659, duration: 0.08 }],
        disconnect: [{ frequency: 392, duration: 0.08 }, { frequency: 262, duration: 0.10 }],
        move: [{ frequency: 880, duration: 0.045 }],
        capture: [{ frequency: 659, duration: 0.045 }, { frequency: 330, duration: 0.07 }],
        join: [{ frequency: 494, duration: 0.06 }, { frequency: 740, duration: 0.08 }],
        challenge: [{ frequency: 784, duration: 0.055 }, { frequency: 988, duration: 0.055 }],
        notify: [{ frequency: 587, duration: 0.055 }],
        gameover: [{ frequency: 659, duration: 0.08 }, { frequency: 523, duration: 0.08 }, { frequency: 392, duration: 0.12 }],
        error: [{ frequency: 220, duration: 0.12 }]
    });

    const ClassicSoundManager = {
        enabled: false,
        userActivated: false,
        lastCue: null,
        audioContext: null,
        lastPlayedAt: {},
        masterGain: 0.045,

        setEnabled(enabled, userActivated = false) {
            this.enabled = !!enabled;
            this.userActivated = this.userActivated || !!userActivated;
            if (!this.enabled) this.lastCue = null;
        },

        cue(type) {
            if (!SOUND_CUES.includes(type)) return false;
            this.lastCue = type;
            if (!this.enabled || !this.userActivated) return false;
            return this.play(type);
        },

        getContext() {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return null;
            if (!this.audioContext) this.audioContext = new AudioContext();
            return this.audioContext;
        },

        play(type) {
            try {
                const now = performance.now();
                if (now - (this.lastPlayedAt[type] || 0) < 90) return false;
                const context = this.getContext();
                const pattern = SOUND_PATTERNS[type] || SOUND_PATTERNS.notify;
                if (!context || !pattern) return false;
                this.lastPlayedAt[type] = now;
                const startAt = context.currentTime + 0.01;
                if (context.state === 'suspended') {
                    context.resume?.().catch(() => {});
                }
                pattern.forEach((step, index) => this.playStep(context, step, startAt + (index * 0.075)));
                return true;
            } catch (error) {
                return false;
            }
        },

        playStep(context, step, startAt) {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            const duration = Math.max(0.03, step.duration || 0.06);
            oscillator.type = 'square';
            oscillator.frequency.setValueAtTime(step.frequency || 440, startAt);
            gain.gain.setValueAtTime(0.0001, startAt);
            gain.gain.linearRampToValueAtTime(this.masterGain, startAt + 0.008);
            gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start(startAt);
            oscillator.stop(startAt + duration + 0.02);
        }
    };

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
        tableMode: '',
        liveGame: null,
        moveHistory: [],
        board: null,
        lastRenderedFen: null,
        lastMoveSignature: '',
        currentRoom: {
            name: CURRENT_ROOM,
            description: 'Main chess lounge. Live FICS tables.'
        },
        activityEvents: [{
            type: 'ready',
            label: 'Ready',
            message: 'Waiting for lobby events.'
        }],
        pendingSoundCue: null,
        soundEnabled: false,
        soundUserActivated: false,
        systemMessages: ['Connect to FICS to receive lobby status.'],

        init() {
            if (this.initialized) return;
            this.cacheElements();
            this.loadSoundPreference();
            this.bindFicsEvents();
            this.initialized = true;
            this.syncFromFicsClient();
            this.render();
        },

        cacheElements() {
            this.elements = {
                section: document.getElementById('yahooClassicSection'),
                roomSummary: document.getElementById('ycRoomSummary'),
                currentRoomLabel: document.getElementById('ycCurrentRoomLabel'),
                roomCardTitle: document.getElementById('ycRoomCardTitle'),
                roomCardDescription: document.getElementById('ycRoomCardDescription'),
                roomTabs: document.querySelectorAll('#yahooClassicSection .yc-tab[data-room]'),
                tablesTitle: document.getElementById('ycTablesTitle'),
                tableGrid: document.getElementById('ycTableGrid'),
                playerList: document.getElementById('ycPlayerList'),
                activityFeed: document.getElementById('ycActivityFeed'),
                chatBody: document.getElementById('ycChatBody'),
                browserStatus: document.getElementById('ycBrowserStatus'),
                shell: document.querySelector('#yahooClassicSection .yc-shell'),
                gameWindow: document.getElementById('ycGameWindow'),
                classicBoard: document.getElementById('ycClassicBoard'),
                whitePlayerBar: document.getElementById('ycWhitePlayerBar'),
                blackPlayerBar: document.getElementById('ycBlackPlayerBar'),
                moveList: document.getElementById('ycMoveList'),
                boardFeedback: null,
                gameMode: document.getElementById('ycGameMode'),
                gameDetail: document.getElementById('ycGameDetail'),
                gameMeta: document.getElementById('ycGameMeta'),
                gameHeaderTable: document.getElementById('ycGameHeaderTable'),
                gameHeaderType: document.getElementById('ycGameHeaderType'),
                gameHeaderRated: document.getElementById('ycGameHeaderRated'),
                gameHeaderTime: document.getElementById('ycGameHeaderTime'),
                gameHeaderPlayers: document.getElementById('ycGameHeaderPlayers'),
                gameHeaderSpectators: document.getElementById('ycGameHeaderSpectators'),
                gameInfoOpening: document.getElementById('ycGameInfoOpening'),
                gameInfoEco: document.getElementById('ycGameInfoEco'),
                gameInfoMove: document.getElementById('ycGameInfoMove'),
                gameInfoResult: document.getElementById('ycGameInfoResult'),
                gameInfoPhase: document.getElementById('ycGameInfoPhase'),
                gameSystemLog: document.getElementById('ycGameSystemLog'),
                gameTurnState: document.getElementById('ycGameTurnState'),
                gameSpectatorState: document.getElementById('ycGameSpectatorState'),
                soundBtn: document.getElementById('ycSoundBtn'),
                sitBtn: document.getElementById('ycSitBtn'),
                standBtn: document.getElementById('ycStandBtn'),
                createTableToggle: document.getElementById('ycCreateTableToggle'),
                createTablePanel: document.getElementById('ycCreateTablePanel'),
                createTableSubmit: document.getElementById('ycCreateTableSubmit'),
                createRated: document.getElementById('ycCreateRated'),
                createTime: document.getElementById('ycCreateTime'),
                createIncrement: document.getElementById('ycCreateIncrement'),
                createColor: document.getElementById('ycCreateColor'),
                createTableStatus: document.getElementById('ycCreateTableStatus')
            };
        },

        bindFicsEvents() {
            window.addEventListener('caissa:fics:connection-state', (event) => this.handleFicsEvent(event.detail));
            window.addEventListener('caissa:fics:authenticated', (event) => this.handleFicsEvent(event.detail));
            window.addEventListener('caissa:fics:lobby-updated', (event) => this.handleFicsEvent(event.detail));
            window.addEventListener('caissa:fics:style12', (event) => this.handleFicsEvent(event.detail));
            window.addEventListener('caissa:fics:game-ended', (event) => this.handleFicsEvent(event.detail));
            window.addEventListener('caissa:fics:disconnected', (event) => this.handleFicsEvent(event.detail));
            this.elements.roomTabs?.forEach((button) => {
                button.addEventListener('click', () => this.selectRoom(button));
            });
            this.elements.standBtn?.addEventListener('click', () => this.standFromTable());
            this.elements.sitBtn?.addEventListener('click', () => this.addSystemMessage('Choose Join from a waiting table to sit.'));
            this.elements.soundBtn?.addEventListener('click', () => this.toggleClassicSound());
            this.elements.createTableToggle?.addEventListener('click', () => this.toggleCreateTablePanel());
            this.elements.createTablePanel?.addEventListener('submit', (event) => this.handleCreateTable(event));
            const unlockSound = () => {
                this.soundUserActivated = true;
                ClassicSoundManager.setEnabled(this.soundEnabled, true);
            };
            window.addEventListener('pointerdown', unlockSound, { once: true, passive: true });
            window.addEventListener('keydown', unlockSound, { once: true });
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
                    this.addActivity('Connecting to FICS.', 'connect');
                } else if (payload.state === 'connected' && payload.authenticated) {
                    this.addSystemMessage('Connected.');
                    this.addActivity('Connected to FICS.', 'connect');
                } else if (payload.state === 'disconnected') {
                    this.handleDisconnected(false);
                }
            } else if (event === 'authenticated') {
                this.authenticated = true;
                this.addSystemMessage('Connected.');
                this.addSystemMessage(`Loading ${CURRENT_ROOM}...`);
                this.addActivity('Player session connected.', 'connect');
                this.queueSoundCue('connect');
            } else if (event === 'lobby-updated') {
                const previousTables = new Set(this.activeTables.map((table) => String(table.number)));
                const previousPlayers = new Set(this.getPlayers().map((player) => player.name.toLowerCase()));
                const previousSeeks = new Set(this.seekActions.map((seek) => String(seek.number)));
                this.authenticated = true;
                this.activeTables = Array.isArray(payload.activeTables) ? payload.activeTables.map((table) => ({ ...table })) : [];
                this.seekActions = Array.isArray(payload.seekActions) ? payload.seekActions.map((seek) => ({ ...seek })) : [];
                this.updateCatalog();
                this.recordLobbyActivity(previousTables, previousPlayers, previousSeeks);
                this.addSystemMessage('Receiving lobby...');
            } else if (event === 'style12') {
                this.handleStyle12(payload);
            } else if (event === 'game-ended') {
                if (payload.liveGame) this.liveGame = { ...payload.liveGame };
                this.addSystemMessage('Observed game finished.');
                this.addActivity('Game over.', 'gameover');
                this.queueSoundCue('gameover');
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
            this.addActivity('Disconnected from FICS.', 'disconnect');
            this.queueSoundCue('disconnect');
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
            this.renderRoomIdentity();
            this.renderSummary();
            this.renderTables();
            this.renderPlayers();
            this.renderGameExperience();
            this.renderActivityFeed();
            this.renderChat();
            this.renderStatusBar();
            this.renderSoundToggle();
            this.renderCreateTableControls();
        },

        selectRoom(button) {
            if (!button) return;
            this.currentRoom = {
                name: button.dataset.room || CURRENT_ROOM,
                description: button.dataset.description || 'Main chess lounge. Live FICS tables.'
            };
            this.elements.roomTabs?.forEach((tab) => {
                const active = tab === button;
                tab.classList.toggle('active', active);
                tab.setAttribute('aria-selected', active ? 'true' : 'false');
            });
            this.addActivity(`Entered ${this.currentRoom.name}.`, 'room');
            this.render();
        },

        renderRoomIdentity() {
            if (this.elements.currentRoomLabel) this.elements.currentRoomLabel.textContent = this.currentRoom.name;
            if (this.elements.roomCardTitle) this.elements.roomCardTitle.textContent = this.currentRoom.name;
            if (this.elements.roomCardDescription) this.elements.roomCardDescription.textContent = this.currentRoom.description;
            if (this.elements.tablesTitle) {
                this.elements.tablesTitle.textContent = this.isTournamentRoom() ? 'Tournament Hall' : 'Room Tables';
            }
        },

        renderSummary() {
            if (!this.elements.roomSummary) return;
            const players = this.getPlayers();
            const tables = this.activeTables.length + this.seekActions.length;
            if (this.isTournamentRoom()) {
                this.elements.roomSummary.textContent = `Current Room: Tournament Hall - Players Online: ${players.length} - Tournament Feed: Not available`;
                return;
            }
            this.elements.roomSummary.textContent = `Current Room: ${this.currentRoom.name} - Players Online: ${players.length} - Active Tables: ${tables}`;
        },

        renderTables() {
            const tableGrid = this.elements.tableGrid;
            if (!tableGrid) return;

            if (this.isTournamentRoom()) {
                this.renderTournamentHall(tableGrid);
                return;
            }

            tableGrid.setAttribute('role', 'table');
            tableGrid.setAttribute('aria-label', 'Classic room tables');
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

        renderTournamentHall(container) {
            container.setAttribute('role', 'region');
            container.setAttribute('aria-label', 'Classic Tournament Hall');
            container.replaceChildren(
                this.createTournamentHero(),
                this.createTournamentPanel('Event Board', [
                    ['Status', 'No active tournament feed'],
                    ['Source', 'Existing CAISSA/FICS lobby state only'],
                    ['Registration', 'Not open']
                ], 'Tournament events will appear here only when tournament data is available through the existing connection.'),
                this.createTournamentPanel('Pairings', [
                    ['Round', '--'],
                    ['Boards', '0'],
                    ['Clock', '--']
                ], 'No pairings are available. CAISSA Classic is not running a tournament backend in this phase.'),
                this.createTournamentPanel('Standings', [
                    ['Players', '0'],
                    ['Leaders', '--'],
                    ['Tiebreaks', '--']
                ], 'No standings are available from the current lobby data.'),
                this.createTournamentPanel('Room Notes', [
                    ['Format', 'Classic lobby shell'],
                    ['Live Tables', String(this.activeTables.length + this.seekActions.length)],
                    ['Players Online', String(this.getPlayers().length)]
                ], 'Use CAISSA Lobby for live FICS tables. Tournament Hall is prepared for future organized events.')
            );
        },

        createTournamentHero() {
            const hero = document.createElement('div');
            hero.className = 'yc-tournament-hero';
            const title = document.createElement('h4');
            title.textContent = 'Tournament Hall';
            const summary = document.createElement('p');
            summary.textContent = 'Organized play, event boards, pairings, and standings will live here when real tournament data is available.';
            const badge = document.createElement('span');
            badge.className = 'yc-tournament-badge';
            badge.textContent = 'No active tournament data';
            hero.append(title, summary, badge);
            return hero;
        },

        createTournamentPanel(title, rows, emptyText) {
            const panel = document.createElement('section');
            panel.className = 'yc-tournament-panel';
            const heading = document.createElement('h4');
            heading.textContent = title;
            const list = document.createElement('dl');
            list.className = 'yc-tournament-list';
            rows.forEach(([term, value]) => {
                const dt = document.createElement('dt');
                dt.textContent = term;
                const dd = document.createElement('dd');
                dd.textContent = value;
                list.append(dt, dd);
            });
            const empty = document.createElement('p');
            empty.className = 'yc-tournament-empty';
            empty.textContent = emptyText;
            panel.append(heading, list, empty);
            return panel;
        },

        buildTableRows() {
            const waiting = this.seekActions.map((seek) => {
                const details = seek.details || {};
                const player = this.formatPlayer(details.player || 'Open Seat', details.rating);
                const gameLabel = this.formatSeekGameLabel(details);
                return {
                    kind: 'waiting',
                    table: seek.number,
                    white: player,
                    black: 'Open Seat',
                    watching: '0',
                    options: this.buildOptionParts(details.timeControl || 'open', gameLabel),
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
                options: this.buildOptionParts(table.timeControl || 'live', this.formatGameLabel(table), this.isCurrentObservedGame(table.number)),
                status: this.isCurrentObservedGame(table.number) ? 'Watching' : 'Watch',
                action: this.isCurrentObservedGame(table.number) ? 'watching' : 'watch',
                command: `observe ${table.number}`,
                raw: table
            }));

            return [...waiting, ...playing];
        },

        isTournamentRoom() {
            return this.currentRoom.name === 'Tournament Hall';
        },

        createTableHeader() {
            const row = document.createElement('div');
            row.className = 'yc-table-row yc-table-head';
            row.setAttribute('role', 'row');
            ['Table', 'Watch', 'White', 'Black', 'Options', 'Who is Watching'].forEach((label) => {
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
            ].forEach((value) => row.appendChild(this.createCell(value)));

            row.appendChild(this.createActionCell(rowData));

            [
                rowData.white,
                rowData.black
            ].forEach((value) => row.appendChild(this.createCell(value)));

            row.appendChild(this.createOptionsCell(rowData.options));
            row.appendChild(this.createWatchingCell(rowData.watching));
            return row;
        },

        createActionCell(rowData) {
            const actionCell = document.createElement('span');
            actionCell.className = 'yc-watch-action-cell';
            actionCell.setAttribute('role', 'cell');
            if (rowData.action === 'watch' || rowData.action === 'join') {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'yc-row-action';
                button.textContent = rowData.action === 'join' ? 'JOIN' : 'Watch';
                button.title = rowData.action === 'watch'
                    ? `Watch table ${rowData.table}`
                    : `Join table ${rowData.table}`;
                button.addEventListener('click', () => this.handleTableAction(rowData));
                actionCell.appendChild(button);
            } else {
                const label = document.createElement('strong');
                label.textContent = rowData.status || '-';
                actionCell.appendChild(label);
            }
            return actionCell;
        },

        createOptionsCell(options = []) {
            const cell = document.createElement('span');
            cell.className = 'yc-options-cell';
            cell.setAttribute('role', 'cell');
            const parts = Array.isArray(options) && options.length
                ? options
                : [{ label: 'Live', className: 'live' }];
            parts.forEach((option) => {
                const chip = document.createElement('span');
                chip.className = `yc-table-chip ${option.className || ''}`.trim();
                chip.textContent = option.label || '-';
                cell.appendChild(chip);
            });
            cell.title = parts.map((part) => part.label).join(' | ');
            return cell;
        },

        createWatchingCell(watching) {
            const statusCell = document.createElement('span');
            statusCell.className = 'yc-watchers-cell';
            statusCell.setAttribute('role', 'cell');
            const watcherText = document.createElement('span');
            watcherText.className = 'yc-watcher-count';
            const count = this.formatCount(watching);
            watcherText.textContent = count === '1' ? '1 watching' : `${count} watching`;
            statusCell.appendChild(watcherText);
            statusCell.title = watcherText.textContent;
            return statusCell;
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
                this.queueSoundCue('error');
                this.render();
                return;
            }

            if (rowData.action === 'watch') {
                this.addSystemMessage(`Opening table ${rowData.table}...`);
                this.addActivity(`Watching table ${rowData.table}.`, 'watch');
                this.queueSoundCue('notify');
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
                this.addActivity(`Joining table ${rowData.table}.`, 'join');
                this.queueSoundCue('join');
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

        toggleCreateTablePanel() {
            const panel = this.elements.createTablePanel;
            if (!panel) return;
            const expanded = panel.dataset.expanded !== 'true';
            panel.dataset.expanded = expanded ? 'true' : 'false';
            this.elements.createTableToggle?.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            this.renderCreateTableControls();
        },

        handleCreateTable(event) {
            event?.preventDefault();
            const client = window.CaissaFICSClient;
            if (!client?.authenticated) {
                this.setCreateTableStatus('Connect to FICS before creating a table.', true);
                this.addSystemMessage('Connect to FICS before creating a table.');
                this.queueSoundCue('error');
                return;
            }

            const time = this.getBoundedInteger(this.elements.createTime?.value, 1, 180, 5);
            const increment = this.getBoundedInteger(this.elements.createIncrement?.value, 0, 60, 0);
            const rated = this.elements.createRated?.value === 'rated' ? 'rated' : 'unrated';
            const color = ['white', 'black'].includes(this.elements.createColor?.value)
                ? this.elements.createColor.value
                : '';
            if (this.elements.createTime) this.elements.createTime.value = String(time);
            if (this.elements.createIncrement) this.elements.createIncrement.value = String(increment);

            const command = ['seek', time, increment, rated, color].filter((part) => part !== '').join(' ');
            client.send?.(command);
            client.pendingSeek = {
                timeControl: `${time}+${increment}`,
                label: 'Your CAISSA Classic table'
            };
            client.renderRoomTables?.();
            this.setCreateTableStatus(`Posted ${rated === 'rated' ? 'rated' : 'casual'} ${time}+${increment}${color ? ` ${color}` : ''} table.`, false);
            this.addSystemMessage(`Posted table: ${time}+${increment} ${rated}${color ? ` ${color}` : ''}.`);
            this.addActivity(`Table posted: ${time}+${increment} ${rated}.`, 'challenge');
            this.render();
        },

        renderCreateTableControls() {
            const panel = this.elements.createTablePanel;
            if (!panel) return;
            const connected = !!window.CaissaFICSClient?.authenticated;
            panel.classList.toggle('disabled', !connected);
            panel.setAttribute('aria-disabled', connected ? 'false' : 'true');
            this.elements.createTableToggle?.setAttribute('aria-expanded', panel.dataset.expanded === 'true' ? 'true' : 'false');
            this.elements.createTableSubmit?.toggleAttribute('disabled', !connected);
            [this.elements.createRated, this.elements.createTime, this.elements.createIncrement, this.elements.createColor]
                .forEach((control) => control?.toggleAttribute('disabled', !connected));
            if (!connected) {
                this.setCreateTableStatus('Connect to FICS to create a table.', true);
            } else if (!this.elements.createTableStatus?.textContent || this.elements.createTableStatus.dataset.offline === 'true') {
                this.setCreateTableStatus('Ready to post a FICS seek.', false);
            }
        },

        setCreateTableStatus(message, offline = false) {
            if (!this.elements.createTableStatus) return;
            this.elements.createTableStatus.textContent = message;
            this.elements.createTableStatus.dataset.offline = offline ? 'true' : 'false';
        },

        getBoundedInteger(value, min, max, fallback) {
            const parsed = parseInt(value, 10);
            if (!Number.isFinite(parsed)) return fallback;
            return Math.min(max, Math.max(min, parsed));
        },

        openTable(tableId, meta = null, mode = 'watching') {
            this.tableOpen = true;
            this.currentTableId = tableId || this.currentTableId;
            this.currentTableMeta = meta || this.currentTableMeta;
            this.tableMode = mode;
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
                this.addActivity(`Table ${gameNumber} closed.`, 'notify');
            }
            this.tableOpen = false;
            this.currentTableId = null;
            this.currentTableMeta = null;
            this.liveGame = null;
            this.moveHistory = [];
            this.lastRenderedFen = null;
            this.lastMoveSignature = '';
            this.tableMode = '';
            this.renderGameExperience();
        },

        standFromTable() {
            this.closeTable(true);
            this.render();
        },

        handleStyle12(payload = {}, render = true) {
            const liveGame = payload.liveGame || {};
            if (!liveGame.currentFen) return;

            const previousMoveCount = this.moveHistory.length;
            this.liveGame = { ...liveGame };
            this.moveHistory = Array.isArray(payload.moveHistory)
                ? payload.moveHistory.map((move) => ({ ...move }))
                : this.moveHistory;
            this.openTable(liveGame.gameNumber || this.currentTableId, this.currentTableMeta, liveGame.observedGame ? 'watching' : 'playing');
            if (liveGame.gameNumber) this.addSystemMessage(`Watching table ${liveGame.gameNumber}.`);
            if (this.moveHistory.length > previousMoveCount) {
                const latest = this.getLatestMove();
                const capture = this.isCaptureMove(latest);
                this.addActivity(capture ? 'Capture received.' : 'Move received.', capture ? 'capture' : 'move');
                this.queueSoundCue(capture ? 'capture' : 'move');
            }
            if (render) this.render();
        },

        recordLobbyActivity(previousTables, previousPlayers, previousSeeks = new Set()) {
            const nextTables = new Set(this.activeTables.map((table) => String(table.number)));
            const nextPlayers = new Set(this.getPlayers().map((player) => player.name.toLowerCase()));
            let notifyQueued = false;
            let challengeQueued = false;

            this.activeTables.forEach((table) => {
                const key = String(table.number);
                if (!previousTables.has(key)) {
                    this.addActivity(this.formatGameLabel(table) === 'Rated'
                        ? `Rated game started at table ${key}.`
                        : `Table ${key} opened.`, 'notify');
                    notifyQueued = true;
                }
            });

            previousTables.forEach((key) => {
                if (!nextTables.has(key)) {
                    this.addActivity(`Table ${key} closed.`, 'notify');
                    notifyQueued = true;
                }
            });

            this.getPlayers().forEach((player) => {
                const key = player.name.toLowerCase();
                if (!previousPlayers.has(key)) {
                    this.addActivity(`${player.name} joined.`, 'notify');
                    notifyQueued = true;
                }
            });

            previousPlayers.forEach((key) => {
                if (!nextPlayers.has(key)) {
                    this.addActivity('Player disconnected.', 'disconnect');
                    notifyQueued = true;
                }
            });

            this.seekActions.forEach((seek) => {
                const key = String(seek.number);
                if (!previousSeeks.has(key)) {
                    this.addActivity(`Challenge posted at table ${key}.`, 'challenge');
                    challengeQueued = true;
                }
            });

            if (challengeQueued) {
                this.queueSoundCue('challenge');
            } else if (notifyQueued) {
                this.queueSoundCue('notify');
            }
        },

        addActivity(message, type = 'notify') {
            const text = String(message || '').trim();
            if (!text) return;
            const last = this.activityEvents[this.activityEvents.length - 1];
            if (last?.message === text) return;
            const label = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            this.activityEvents = [...this.activityEvents, { type, label, message: text }].slice(-ACTIVITY_LIMIT);
        },

        renderActivityFeed() {
            if (!this.elements.activityFeed) return;
            this.elements.activityFeed.replaceChildren(...this.activityEvents.slice().reverse().map((entry) => {
                const line = document.createElement('div');
                line.className = `yc-activity-line ${entry.type || 'notify'}`;
                const label = document.createElement('span');
                label.textContent = entry.label || 'Now';
                const message = document.createElement('strong');
                message.textContent = entry.message || '';
                message.title = message.textContent;
                line.append(label, message);
                return line;
            }));
        },

        queueSoundCue(type) {
            if (!SOUND_CUES.includes(type)) return;
            this.pendingSoundCue = type;
            ClassicSoundManager.cue(type);
        },

        loadSoundPreference() {
            let enabled = false;
            try {
                enabled = window.localStorage?.getItem(SOUND_STORAGE_KEY) === 'true';
            } catch (error) {
                enabled = false;
            }
            this.soundEnabled = enabled;
            this.soundUserActivated = false;
            ClassicSoundManager.setEnabled(enabled, false);
        },

        toggleClassicSound() {
            this.soundEnabled = !this.soundEnabled;
            this.soundUserActivated = true;
            ClassicSoundManager.setEnabled(this.soundEnabled, true);
            try {
                window.localStorage?.setItem(SOUND_STORAGE_KEY, this.soundEnabled ? 'true' : 'false');
            } catch (error) {
                // localStorage may be unavailable in private or restricted contexts.
            }
            const message = this.soundEnabled ? 'Sound enabled.' : 'Sound disabled.';
            this.addSystemMessage(message);
            this.addActivity(message, this.soundEnabled ? 'notify' : 'disconnect');
            this.queueSoundCue('notify');
            this.render();
        },

        renderSoundToggle() {
            const button = this.elements.soundBtn;
            if (!button) return;
            const label = this.soundEnabled ? '[Sound: On]' : '[Sound: Off]';
            button.textContent = label;
            button.title = this.soundEnabled ? 'Disable CAISSA Classic sound' : 'Enable CAISSA Classic sound';
            button.setAttribute('aria-pressed', this.soundEnabled ? 'true' : 'false');
            button.classList.toggle('active', this.soundEnabled);
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
            ['Color', 'Name', 'Rating', 'Tbl'].forEach((label) => {
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

            const colorCell = document.createElement('span');
            colorCell.className = 'yc-player-color-cell';
            colorCell.setAttribute('role', 'cell');
            const led = document.createElement('i');
            const ratingClass = this.getRatingClass(player.rating);
            led.className = `yc-pixel-led rating-${ratingClass}`;
            led.setAttribute('aria-hidden', 'true');
            colorCell.appendChild(led);
            colorCell.title = this.getRatingLabel(ratingClass);

            const nameCell = document.createElement('span');
            nameCell.setAttribute('role', 'cell');
            nameCell.append(player.name);
            nameCell.appendChild(this.createPlayerBadge(player));
            nameCell.title = player.name;

            row.append(colorCell, nameCell, this.createCell(player.rating || 'Guest'), this.createCell(player.table || '-'));
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
            const status = this.authenticated ? 'Connected to FICS' : 'FICS idle';
            const table = this.getCurrentTableMeta();
            const gameNumber = this.liveGame?.gameNumber || this.currentTableId;
            const side = this.liveGame?.sideToMove === 'b' ? 'Black' : this.liveGame?.sideToMove === 'w' ? 'White' : null;
            const time = table?.timeControl || this.liveGame?.initialTime || 'live';
            const game = table ? this.formatGameLabel(table) : 'Live';
            const gameType = this.getClassicGameType(time, game);
            const rated = game === 'Unrated' || game === 'Casual' ? 'Casual' : 'Rated';
            const spectators = this.formatCount(table?.observers || this.liveGame?.observers || 0);
            const values = this.tableOpen && gameNumber
                ? ['Connected', `${rated} ${gameType}`, `Table ${gameNumber}`, side ? `${side} to Move` : 'Waiting', `Spectators ${spectators}`, `[Sound: ${this.soundEnabled ? 'On' : 'Off'}]`]
                : ['Done', status, this.authenticated ? 'Connected' : 'Not connected', `${players} players online`, `[Sound: ${this.soundEnabled ? 'On' : 'Off'}]`];
            this.elements.browserStatus.replaceChildren(...values.map((value, index) => {
                const cell = document.createElement('span');
                cell.textContent = value;
                return cell;
            }));
        },

        renderGameExperience() {
            this.elements.shell?.classList.toggle('yc-table-open', this.tableOpen);
            if (this.elements.gameWindow) {
                this.elements.gameWindow.dataset.mode = this.tableMode || (this.liveGame?.observedGame ? 'watching' : 'playing');
            }
            this.elements.gameWindow?.setAttribute('aria-hidden', this.tableOpen ? 'false' : 'true');
            this.renderClassicBoard();
            this.renderBoardFeedback();
            this.renderGamePlayers();
            this.renderClassicMoves();
            this.renderGameMeta();
            this.renderGameSystemLog();
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

        ensureBoardFeedback() {
            if (this.elements.boardFeedback || !this.elements.classicBoard) return;
            const feedback = document.createElement('div');
            feedback.id = 'ycBoardFeedback';
            feedback.className = 'yc-board-feedback';
            feedback.setAttribute('aria-live', 'polite');
            this.elements.classicBoard.insertAdjacentElement('afterend', feedback);
            this.elements.boardFeedback = feedback;
        },

        renderBoardFeedback() {
            if (!this.tableOpen || !this.elements.classicBoard) return;
            this.ensureBoardFeedback();
            const latest = this.getLatestMove();
            const hasMove = Boolean(latest);
            const isCapture = this.isCaptureMove(latest);
            const feedback = this.elements.boardFeedback;
            this.elements.classicBoard.classList.toggle('yc-board-has-move', hasMove);
            this.elements.classicBoard.classList.toggle('yc-board-has-capture', isCapture);
            if (feedback) {
                feedback.className = `yc-board-feedback${hasMove ? ' has-move' : ''}${isCapture ? ' capture' : ''}`;
                feedback.textContent = hasMove
                    ? `Last move: ${this.formatMoveLabel(latest)}${isCapture ? ' - Capture' : ''}`
                    : 'Board ready. Waiting for first move.';
            }
            const signature = hasMove
                ? `${latest.moveNumber}:${latest.color}:${latest.san}:${this.liveGame?.currentFen || ''}`
                : '';
            if (signature && signature !== this.lastMoveSignature) {
                this.elements.classicBoard.classList.remove('yc-board-update');
                void this.elements.classicBoard.offsetWidth;
                this.elements.classicBoard.classList.add('yc-board-update');
            }
            this.lastMoveSignature = signature;
        },

        renderGamePlayers() {
            const table = this.getCurrentTableMeta();
            this.renderGamePlayerBar(this.elements.blackPlayerBar, {
                color: 'black',
                name: this.liveGame?.blackName || table?.black || 'Black',
                rating: table?.blackRating || 'FICS',
                clock: this.formatClock(this.liveGame?.blackClock),
                clockSeconds: this.liveGame?.blackClock,
                active: this.liveGame?.sideToMove === 'b',
                state: this.liveGame?.sideToMove === 'b' ? 'To move' : 'Waiting'
            });
            this.renderGamePlayerBar(this.elements.whitePlayerBar, {
                color: 'white',
                name: this.liveGame?.whiteName || table?.white || 'White',
                rating: table?.whiteRating || 'FICS',
                clock: this.formatClock(this.liveGame?.whiteClock),
                clockSeconds: this.liveGame?.whiteClock,
                active: this.liveGame?.sideToMove === 'w',
                state: this.liveGame?.sideToMove === 'w' ? 'To move' : 'Waiting'
            });
        },

        renderGamePlayerBar(element, player) {
            if (!element) return;
            const identity = player.rating && player.rating !== 'FICS' ? 'registered' : 'guest';
            const lowClock = Number.isFinite(player.clockSeconds) && player.clockSeconds <= 30;
            element.className = `yc-game-player ${player.color}${player.active ? ' turn-active' : ''}${lowClock ? ' clock-low' : ''}`;
            element.dataset.identity = identity;
            element.setAttribute('aria-label', `${player.color} player ${player.name || player.color}, ${player.state || 'Waiting'}, clock ${player.clock || '--:--'}`);
            const name = element.querySelector('.yc-player-name');
            const rating = element.querySelector('.yc-player-rating');
            const state = element.querySelector('.yc-player-state');
            const clock = element.querySelector('.yc-player-clock');
            if (name) {
                name.textContent = player.name || player.color;
                name.title = name.textContent;
            }
            if (rating) {
                const status = identity === 'registered' ? 'Registered' : 'Guest';
                rating.textContent = `${player.rating || 'FICS'} - ${status}`;
                rating.title = status;
            }
            if (state) state.textContent = player.state || 'Waiting';
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

            this.elements.moveList.replaceChildren(...rows.map((row, index) => {
                const hasCapture = this.isCaptureSan(row.white) || this.isCaptureSan(row.black);
                const item = document.createElement('div');
                item.className = `yc-move-row${index === rows.length - 1 ? ' latest' : ''}${hasCapture ? ' capture' : ''}`;
                if (hasCapture) item.title = 'Capture in this move pair';
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

        getLatestMove() {
            return this.moveHistory.length ? this.moveHistory[this.moveHistory.length - 1] : null;
        },

        isCaptureMove(move) {
            return this.isCaptureSan(move?.san);
        },

        isCaptureSan(san) {
            return /x/.test(String(san || ''));
        },

        formatMoveLabel(move) {
            if (!move) return '';
            const number = move.moveNumber || this.getCurrentMoveNumber();
            const separator = move.color === 'black' ? '...' : '.';
            return `${number}${separator} ${move.san || ''}`.trim();
        },

        renderGameMeta() {
            const table = this.getCurrentTableMeta();
            const gameNumber = this.liveGame?.gameNumber || this.currentTableId;
            const side = this.liveGame?.sideToMove === 'b' ? 'Black' : this.liveGame?.sideToMove === 'w' ? 'White' : null;
            const time = table?.timeControl || this.liveGame?.initialTime || 'live';
            const game = table ? this.formatGameLabel(table) : 'Live';
            const gameType = this.getClassicGameType(time, game);
            const rated = game === 'Unrated' || game === 'Casual' ? 'Casual' : 'Rated';
            const spectators = this.formatCount(table?.observers || this.liveGame?.observers || 0);
            const white = this.liveGame?.whiteName || table?.white || 'White';
            const black = this.liveGame?.blackName || table?.black || 'Black';
            const moveNumber = this.getCurrentMoveNumber();
            const phase = this.getGamePhase(moveNumber);
            const result = this.liveGame?.result || table?.result || '--';
            const opening = this.liveGame?.openingName || this.liveGame?.opening || table?.opening || 'Unknown Opening';
            const eco = this.liveGame?.eco || table?.eco || '--';
            const turnText = side ? `${side} to Move` : 'Waiting for board';
            const spectatorText = `Spectators ${spectators}`;

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
            this.setText(this.elements.gameHeaderTable, gameNumber ? `Table ${gameNumber}` : 'Table --');
            this.setText(this.elements.gameHeaderType, gameType);
            this.setText(this.elements.gameHeaderRated, rated);
            this.setText(this.elements.gameHeaderTime, this.formatClassicTime(time));
            this.setText(this.elements.gameHeaderPlayers, `${white} vs ${black}`);
            this.setText(this.elements.gameHeaderSpectators, `${spectators} spectators`);
            this.setText(this.elements.gameInfoOpening, opening);
            this.setText(this.elements.gameInfoEco, eco);
            this.setText(this.elements.gameInfoMove, String(moveNumber));
            this.setText(this.elements.gameInfoResult, result);
            this.setText(this.elements.gameInfoPhase, phase);
            this.setText(this.elements.gameTurnState, turnText);
            this.setText(this.elements.gameSpectatorState, spectatorText);
            this.elements.standBtn?.toggleAttribute('disabled', !this.tableOpen);
            this.elements.sitBtn?.toggleAttribute('disabled', !this.authenticated);
        },

        renderGameSystemLog() {
            if (!this.elements.gameSystemLog) return;
            const messages = this.systemMessages.slice(-4);
            if (!messages.length) {
                const empty = document.createElement('p');
                empty.textContent = this.tableOpen ? 'Waiting for table updates.' : 'Open a table to receive system messages.';
                this.elements.gameSystemLog.replaceChildren(empty);
                return;
            }
            this.elements.gameSystemLog.replaceChildren(...messages.map((message) => {
                const line = document.createElement('p');
                line.textContent = message;
                return line;
            }));
            this.elements.gameSystemLog.scrollTop = this.elements.gameSystemLog.scrollHeight;
        },

        setText(element, value) {
            if (!element) return;
            const text = String(value ?? '--');
            if (element.textContent !== text) element.textContent = text;
            element.title = text;
        },

        getCurrentMoveNumber() {
            if (!this.moveHistory.length) return 0;
            const last = this.moveHistory[this.moveHistory.length - 1];
            const parsed = Number.parseInt(last?.moveNumber, 10);
            return Number.isFinite(parsed) ? parsed : Math.ceil(this.moveHistory.length / 2);
        },

        getGamePhase(moveNumber) {
            if (moveNumber >= 30) return 'Endgame';
            if (moveNumber >= 12) return 'Middlegame';
            return 'Opening';
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

        buildOptionParts(timeControl, label, observed = false) {
            const timeLabel = this.formatClassicTime(timeControl);
            const gameType = this.getClassicGameType(timeControl, label);
            const statusLabel = label === 'Unrated' ? 'Casual' : label || 'Live';
            return [
                { label: timeLabel, className: this.getTableChipClass(timeLabel, timeControl, observed) },
                { label: gameType, className: this.getTableChipClass(gameType, timeControl, observed) },
                { label: statusLabel, className: this.getTableChipClass(statusLabel, timeControl, observed) }
            ];
        },

        formatClassicTime(timeControl) {
            const text = String(timeControl || '').trim();
            const match = text.match(/^(\d+)\+(\d+)$/);
            if (match) {
                return `${match[1]}m ${match[2]}s`;
            }
            const spaced = text.match(/^(\d+)\s+(\d+)$/);
            if (spaced) {
                return `${spaced[1]}m ${spaced[2]}s`;
            }
            return text && text !== 'live' && text !== 'open' ? text : 'Live';
        },

        getClassicGameType(timeControl, label) {
            const text = `${timeControl || ''} ${label || ''}`.toLowerCase();
            const minutes = Number.parseInt(String(timeControl || '').match(/\d+/)?.[0] || '', 10);
            if (text.includes('bullet') || minutes === 1) return 'Bullet';
            if (text.includes('rapid') || (Number.isFinite(minutes) && minutes >= 10 && minutes < 25)) return 'Rapid';
            if (text.includes('classical') || (Number.isFinite(minutes) && minutes >= 25)) return 'Classical';
            return 'Blitz';
        },

        getTableChipClass(label, timeControl, observed = false) {
            if (observed) return 'observed';
            const text = `${label || ''} ${timeControl || ''}`.toLowerCase();
            if (text.includes('private')) return 'private';
            if (text.includes('bullet')) return 'blitz';
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

        getRatingClass(rating) {
            const value = Number.parseInt(String(rating || '').replace(/[^\d]/g, ''), 10);
            if (!Number.isFinite(value)) return 'provisional';
            if (value >= 2400) return 'master';
            if (value >= 2100) return 'elite';
            if (value >= 1800) return 'expert';
            if (value >= 1500) return 'club';
            if (value >= 1200) return 'casual';
            return 'new';
        },

        getRatingLabel(ratingClass) {
            const labels = {
                master: '2400+',
                elite: '2100-2399',
                expert: '1800-2099',
                club: '1500-1799',
                casual: '1200-1499',
                new: '0-1199',
                provisional: 'Provisional'
            };
            return labels[ratingClass] || labels.provisional;
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
