/**
 * CAISSA Spectator TV Featured Game MVP
 *
 * First visible Spectator TV surface. It reuses the existing FICS connection,
 * lobby refresh, observe helper, Style12 parser path, state model, and live
 * game catalog. It does not add channels, analysis, opening coach, or engine
 * features.
 */
(function() {
    'use strict';

    const SpectatorTVSection = {
        elements: {},
        state: null,
        catalog: null,
        board: null,
        lastRenderedFen: null,
        pendingFeaturedWatch: false,
        unsubscribeFics: null,
        playerCardSnapshots: Object.create(null),
        visibleChannelIds: Object.freeze(['featured', 'top-rated', 'blitz', 'bullet', 'rapid']),

        init() {
            this.cacheElements();
            this.state = window.CaissaSpectatorTV?.createInitialState?.() || null;
            this.catalog = window.CaissaSpectatorTVCatalog?.createCatalog?.() || null;
            this.bindEvents();
            this.subscribeToFics();
            this.render();
        },

        cacheElements() {
            this.elements = {
                section: document.getElementById('spectatorSection'),
                connectionStatus: document.getElementById('spectatorConnectionStatus'),
                featuredBadge: document.getElementById('spectatorFeaturedBadge'),
                watchBtn: document.getElementById('spectatorWatchFeaturedBtn'),
                refreshBtn: document.getElementById('spectatorRefreshFeaturedBtn'),
                message: document.getElementById('spectatorMessage'),
                board: document.getElementById('spectatorBoard'),
                topPlayer: document.getElementById('spectatorTopPlayer'),
                bottomPlayer: document.getElementById('spectatorBottomPlayer'),
                whiteClock: document.getElementById('spectatorWhiteClock'),
                blackClock: document.getElementById('spectatorBlackClock'),
                gameStatus: document.getElementById('spectatorGameStatus'),
                metadata: document.getElementById('spectatorMetadata'),
                moveList: document.getElementById('spectatorMoveList'),
                whitePlayerCard: document.getElementById('spectatorWhitePlayerCard'),
                blackPlayerCard: document.getElementById('spectatorBlackPlayerCard'),
                channelList: document.getElementById('spectatorChannelList'),
                gameList: document.getElementById('spectatorGameList'),
                gameCount: document.getElementById('spectatorGameCount')
            };
        },

        bindEvents() {
            this.elements.watchBtn?.addEventListener('click', () => this.watchFeaturedGame());
            this.elements.refreshBtn?.addEventListener('click', () => this.refreshCatalog(true));
            this.elements.channelList?.addEventListener('click', (event) => {
                const button = event.target.closest('[data-channel]');
                if (button) this.selectChannel(button.dataset.channel);
            });
            this.elements.gameList?.addEventListener('click', (event) => {
                const button = event.target.closest('[data-game-id]');
                if (button) this.watchGame(button.dataset.gameId);
            });
        },

        subscribeToFics() {
            if (this.unsubscribeFics || !window.CaissaFICSClient?.addSpectatorListener) return;
            this.unsubscribeFics = window.CaissaFICSClient.addSpectatorListener((detail) => this.handleFicsEvent(detail));
        },

        onEnter() {
            this.subscribeToFics();
            this.initBoard();
            this.syncFromFicsClient();
            this.renderChannels();
            this.render();
            requestAnimationFrame(() => this.board?.resize?.());
        },

        onExit() {
            this.pendingFeaturedWatch = false;
        },

        handleFicsEvent(detail) {
            if (!detail || !detail.event) return;

            if (detail.event === 'connection-state') {
                this.handleConnectionState(detail.payload);
            } else if (detail.event === 'authenticated') {
                this.enterLoadingGames();
                if (this.pendingFeaturedWatch) this.refreshCatalog(true);
            } else if (detail.event === 'lobby-updated') {
                const activeTables = detail.payload?.activeTables || [];
                this.updateCatalog(activeTables);
                if (this.pendingFeaturedWatch && activeTables.length) this.observeFeaturedCandidate();
            } else if (detail.event === 'style12') {
                this.renderStyle12(detail.payload);
            } else if (detail.event === 'disconnected') {
                this.handleDisconnected();
            }
        },

        handleConnectionState(payload = {}) {
            const states = window.CaissaSpectatorTV?.STATES;
            if (!states) return;
            if (payload.state === 'connecting' || payload.state === 'reconnecting') {
                this.transition(states.CONNECTING);
            } else if (payload.state === 'connected' && payload.authenticated) {
                this.enterLoadingGames();
            } else if (payload.state === 'error') {
                this.transition(states.ERROR, { error: 'FICS connection issue. Reconnect to continue.' });
            } else if (payload.state === 'disconnected') {
                this.handleDisconnected();
            }
            this.render();
        },

        handleDisconnected() {
            if (window.CaissaSpectatorTV?.cleanupState) {
                this.state = window.CaissaSpectatorTV.cleanupState(this.state);
            }
            if (window.CaissaSpectatorTVCatalog?.clearCatalog) {
                this.catalog = window.CaissaSpectatorTVCatalog.clearCatalog();
            }
            this.pendingFeaturedWatch = false;
            this.lastRenderedFen = null;
            this.playerCardSnapshots = Object.create(null);
            if (this.board) this.board.position('start', false);
            this.renderPlayerCards(null);
            this.render();
        },

        transition(toState, updates = {}) {
            if (!window.CaissaSpectatorTV?.transitionTo) return;
            this.state = window.CaissaSpectatorTV.transitionTo(this.state, toState, updates);
        },

        enterLoadingGames() {
            const states = window.CaissaSpectatorTV?.STATES;
            if (!states) return;
            if (this.state?.status === states.DISCONNECTED) {
                this.transition(states.CONNECTING);
            }
            this.transition(states.LOADING_GAMES);
        },

        enterWatching() {
            const states = window.CaissaSpectatorTV?.STATES;
            if (!states) return;
            if (this.state?.status === states.DISCONNECTED) {
                this.transition(states.CONNECTING);
            }
            if (this.state?.status === states.CONNECTING) {
                this.transition(states.LOADING_GAMES);
            }
            if (this.state?.status === states.LOADING_GAMES || this.state?.status === states.SWITCHING_GAME) {
                this.transition(states.WATCHING);
            }
        },

        initBoard() {
            if (!this.elements.board || this.board || typeof Chessboard === 'undefined') return;
            if (!this.elements.section?.classList.contains('active')) return;
            this.board = Chessboard(this.elements.board, {
                draggable: false,
                position: 'start'
            });
        },

        syncFromFicsClient() {
            const client = window.CaissaFICSClient;
            if (!client) return;
            if (Array.isArray(client.activeTables) && client.activeTables.length) {
                this.updateCatalog(client.activeTables);
            }
            if (client.authenticated && this.state?.status === window.CaissaSpectatorTV?.STATES.DISCONNECTED) {
                this.enterLoadingGames();
            }
            if (client.liveGame?.currentFen) {
                this.renderStyle12({
                    liveGame: { ...client.liveGame },
                    moveHistory: client.moveHistory?.map((move) => ({ ...move })) || []
                });
            }
        },

        watchFeaturedGame() {
            const client = window.CaissaFICSClient;
            if (!client) {
                this.showMessage('FICS client is not available yet.', 'error');
                return;
            }

            this.pendingFeaturedWatch = true;
            if (!client.authenticated) {
                this.transition(window.CaissaSpectatorTV.STATES.CONNECTING);
                this.showMessage('Connecting to FICS...', 'info');
                client.connect?.('guest');
                this.render();
                return;
            }

            this.refreshCatalog(true);
        },

        selectChannel(channelId) {
            const channel = this.visibleChannelIds.includes(channelId) ? channelId : 'featured';
            if (window.CaissaSpectatorTV?.setChannel) {
                this.state = window.CaissaSpectatorTV.setChannel(this.state, channel);
            }
            this.catalog = window.CaissaSpectatorTVCatalog?.createCatalog?.({
                games: this.catalog?.games || [],
                selectedChannelId: channel,
                refreshPolicy: this.catalog?.refreshPolicy,
                lastRefreshAt: this.catalog?.lastRefreshAt
            }) || this.catalog;
            this.renderChannels();
            this.renderGameList();
            this.renderCatalogSummary();
        },

        refreshCatalog(manual = false) {
            const client = window.CaissaFICSClient;
            if (!client?.authenticated) {
                this.showMessage('Connect to FICS to load the featured game.', 'info');
                return;
            }

            this.enterLoadingGames();
            this.showMessage('Loading live games...', 'info');
            window.CaissaUI?.setButtonLoading(this.elements.refreshBtn, true, { label: 'Refreshing...' });
            window.CaissaUI?.setButtonLoading(this.elements.watchBtn, true, { label: 'Loading...' });
            client.refreshLobby?.(manual);
            setTimeout(() => {
                window.CaissaUI?.setButtonLoading(this.elements.refreshBtn, false);
                window.CaissaUI?.setButtonLoading(this.elements.watchBtn, false);
                if (this.pendingFeaturedWatch && !this.catalog?.games?.length) {
                    this.showMessage('No live games found yet. Try refreshing again.', 'warning');
                    this.render();
                }
            }, 3200);
            this.render();
        },

        updateCatalog(activeTables) {
            if (!window.CaissaSpectatorTVCatalog?.updateCatalog) return;
            const entries = (activeTables || [])
                .filter((table) => this.isObservableGameTable(table))
                .map((table) => ({
                    gameId: table.number,
                    whitePlayer: table.white,
                    blackPlayer: table.black,
                    whiteRating: table.whiteRating,
                    blackRating: table.blackRating,
                    timeControl: table.timeControl,
                    observers: table.observers,
                    status: 'active',
                    source: 'fics-active-tables',
                    label: table.label
                }));
            this.catalog = window.CaissaSpectatorTVCatalog.updateCatalog(this.catalog, entries, {
                selectedChannelId: this.state?.selectedChannelId || 'featured'
            });
            this.renderCatalogSummary();
            this.renderGameList();
        },

        isObservableGameTable(table) {
            const label = String(table?.label || '');
            return !!table?.number
                && !!table?.white
                && !!table?.black
                && /\b[WB]:\s*\d+\b/.test(label);
        },

        observeFeaturedCandidate() {
            const client = window.CaissaFICSClient;
            const candidate = window.CaissaSpectatorTVCatalog?.selectFeaturedGame?.(this.catalog?.games || []);

            if (!client?.authenticated) {
                this.showMessage('Connect to FICS before watching.', 'info');
                return;
            }

            if (!candidate) {
                this.showMessage('No featured live game is available right now.', 'warning');
                this.render();
                return;
            }

            this.pendingFeaturedWatch = false;
            this.watchGame(candidate.gameId);
        },

        watchGame(gameId) {
            const client = window.CaissaFICSClient;
            const targetGame = this.catalog?.gameMap?.[String(gameId)] || null;

            if (!client?.authenticated) {
                this.showMessage('Connect to FICS before watching.', 'info');
                return;
            }

            if (!targetGame) {
                this.showMessage('That live game is no longer available. Refresh the list.', 'warning');
                this.renderGameList();
                return;
            }

            this.state = window.CaissaSpectatorTV.setObservedGame(this.state, targetGame.gameId, targetGame);
            this.transition(window.CaissaSpectatorTV.STATES.SWITCHING_GAME);
            this.showMessage(`Opening game #${targetGame.gameId}...`, 'info');
            if (typeof client.switchObservedGame === 'function') {
                client.switchObservedGame(targetGame.gameId);
            } else {
                client.send?.(`observe ${targetGame.gameId}`);
            }
            this.renderGameList();
            this.render();
        },

        renderStyle12(payload = {}) {
            const liveGame = payload.liveGame || {};
            if (!liveGame.currentFen) return;
            const expectedGameId = this.state?.currentObservedGameId;
            if (expectedGameId && liveGame.gameNumber && String(expectedGameId) !== String(liveGame.gameNumber)) {
                return;
            }

            this.initBoard();
            if (this.board && liveGame.currentFen !== this.lastRenderedFen) {
                this.board.position(liveGame.currentFen, false);
                this.lastRenderedFen = liveGame.currentFen;
            }

            if (liveGame.observedGame || liveGame.gameNumber) {
                this.state = window.CaissaSpectatorTV.setObservedGame(this.state, liveGame.gameNumber, {
                    whitePlayer: liveGame.whiteName,
                    blackPlayer: liveGame.blackName
                });
                this.enterWatching();
            }

            this.renderPlayers(liveGame);
            this.renderPlayerCards(liveGame);
            this.renderClocks(liveGame);
            this.renderMoveList(payload.moveHistory || []);
            this.renderGameStatus(liveGame);
            this.render();
        },

        renderPlayers(liveGame) {
            const table = window.CaissaFICSClient?.getActiveTableForGame?.(liveGame.gameNumber);
            this.renderPlayerBar(this.elements.topPlayer, {
                color: 'black',
                name: liveGame.blackName || 'Black',
                rating: table?.blackRating || 'FICS',
                clock: this.formatClock(liveGame.blackClock),
                active: liveGame.sideToMove === 'b'
            });
            this.renderPlayerBar(this.elements.bottomPlayer, {
                color: 'white',
                name: liveGame.whiteName || 'White',
                rating: table?.whiteRating || 'FICS',
                clock: this.formatClock(liveGame.whiteClock),
                active: liveGame.sideToMove === 'w'
            });
        },

        renderPlayerBar(element, player) {
            if (!element) return;
            const ficsClient = window.CaissaFICSClient;
            const displayName = ficsClient?.stripComputerMarker?.(player.name) || player.name;
            const computer = !!ficsClient?.isLikelyComputerPlayer?.(player.name);
            const computerMarker = computer
                ? '<span class="fics-computer-marker" title="Computer / engine account" aria-label="Computer / engine account">(C)</span>'
                : '';
            const titleName = ficsClient?.formatComputerPlayerName?.(player.name) || player.name;
            element.className = `spectator-player-bar ${player.color}${player.active ? ' turn-active' : ''}`;
            element.innerHTML = `
                <span class="spectator-turn-led${player.active ? ' active' : ''}" aria-label="${player.active ? `${player.color} to move` : `${player.color} waiting`}"></span>
                <span class="spectator-color-dot" aria-hidden="true"></span>
                <span class="spectator-player-name" title="${this.escapeHtml(titleName)}">${this.escapeHtml(displayName)}${computerMarker}</span>
                <span class="spectator-player-rating">${this.escapeHtml(player.rating || '')}</span>
                <strong class="spectator-player-clock">${this.escapeHtml(player.clock)}</strong>
            `;
        },

        renderPlayerCards(liveGame) {
            this.renderPlayerCard(this.elements.whitePlayerCard, this.getPlayerCardData(liveGame, 'white'));
            this.renderPlayerCard(this.elements.blackPlayerCard, this.getPlayerCardData(liveGame, 'black'));
        },

        getPlayerCardData(liveGame, color) {
            const table = liveGame?.gameNumber
                ? window.CaissaFICSClient?.getActiveTableForGame?.(liveGame.gameNumber)
                : null;
            const game = liveGame?.gameNumber
                ? this.catalog?.gameMap?.[String(liveGame.gameNumber)]
                : null;
            const isWhite = color === 'white';
            const name = liveGame
                ? (isWhite ? liveGame.whiteName : liveGame.blackName) || (isWhite ? 'White' : 'Black')
                : (isWhite ? 'White' : 'Black');
            const rating = isWhite
                ? table?.whiteRating || game?.whiteRating || null
                : table?.blackRating || game?.blackRating || null;
            const clock = liveGame
                ? this.formatClock(isWhite ? liveGame.whiteClock : liveGame.blackClock)
                : '--:--';
            const active = !!liveGame && liveGame.sideToMove === (isWhite ? 'w' : 'b');
            const timeControl = game?.timeControl || table?.timeControl || 'live';
            const variant = game?.variant || 'standard';
            const rated = game?.rated;

            return {
                color,
                name,
                rating,
                clock,
                active,
                timeControl,
                variant,
                rated,
                hasGame: !!liveGame?.gameNumber
            };
        },

        renderPlayerCard(element, player) {
            if (!element || !player) return;
            const ficsClient = window.CaissaFICSClient;
            const computer = !!ficsClient?.isLikelyComputerPlayer?.(player.name);
            const displayName = ficsClient?.stripComputerMarker?.(player.name) || player.name;
            const titleName = ficsClient?.formatComputerPlayerName?.(player.name) || player.name;
            const identity = this.getPlayerIdentity(player.name, player.hasGame);
            const badgeData = [
                { label: identity, variant: identity === 'Guest' ? 'warning' : 'info' },
                computer ? { label: 'Computer', variant: 'info', title: 'Computer / engine account' } : null,
                player.rated === true ? { label: 'Rated', variant: 'success' } : null,
                player.rated === false ? { label: 'Unrated', variant: 'disabled' } : null,
                player.active ? { label: 'To move', variant: 'playing' } : null
            ].filter(Boolean);
            const details = [
                player.rating ? `Rating ${player.rating}` : 'Rating unavailable',
                player.timeControl || 'live',
                player.variant || 'standard'
            ];
            const snapshot = JSON.stringify({
                ...player,
                computer,
                identity,
                displayName,
                titleName,
                badgeData,
                details
            });

            if (this.playerCardSnapshots[player.color] === snapshot) return;
            this.playerCardSnapshots[player.color] = snapshot;

            element.className = `spectator-player-card ${player.color}${player.active ? ' turn-active' : ''}`;
            element.setAttribute('aria-label', `${player.color} player card: ${titleName}, ${player.active ? 'to move' : 'waiting'}`);
            element.innerHTML = `
                <div class="spectator-player-card__header">
                    <span class="spectator-color-dot" aria-hidden="true"></span>
                    <strong class="spectator-player-card__name" title="${this.escapeHtml(titleName)}">${this.escapeHtml(displayName)}${computer ? '<span class="fics-computer-marker" title="Computer / engine account" aria-label="Computer / engine account">(C)</span>' : ''}</strong>
                    <span class="spectator-player-card__clock">${this.escapeHtml(player.clock)}</span>
                </div>
                <div class="spectator-player-card__details">
                    ${details.map((detail) => `<span>${this.escapeHtml(detail)}</span>`).join('')}
                </div>
                <div class="spectator-player-card__badges" aria-label="Player status">
                    ${badgeData.map((badge) => this.renderBadge(badge)).join('')}
                </div>
            `;
        },

        getPlayerIdentity(name, hasGame) {
            if (!hasGame) return 'Waiting';
            const value = String(name || '');
            return /^guest/i.test(value) ? 'Guest' : 'Registered';
        },

        renderBadge(badge) {
            const title = badge.title ? ` title="${this.escapeHtml(badge.title)}"` : '';
            return `<span class="caissa-ui-badge caissa-ui-badge--${this.escapeHtml(badge.variant)}"${title}>${this.escapeHtml(badge.label)}</span>`;
        },

        renderClocks(liveGame) {
            if (this.elements.whiteClock) this.elements.whiteClock.textContent = this.formatClock(liveGame.whiteClock);
            if (this.elements.blackClock) this.elements.blackClock.textContent = this.formatClock(liveGame.blackClock);
        },

        renderGameStatus(liveGame) {
            if (!this.elements.gameStatus) return;
            const side = liveGame.sideToMove === 'b' ? 'Black' : 'White';
            this.elements.gameStatus.textContent = liveGame.gameNumber
                ? `Game #${liveGame.gameNumber} - ${side} to move`
                : 'No featured game selected';
        },

        renderMoveList(moveHistory) {
            if (!this.elements.moveList) return;
            if (!moveHistory.length) {
                this.renderEmptyState(this.elements.moveList, {
                    icon: 'fa-list-ol',
                    title: 'No live moves yet.',
                    message: 'Moves will appear when the featured game updates.'
                });
                return;
            }

            const rows = [];
            moveHistory.forEach((move) => {
                let row = rows.find((item) => item.moveNumber === move.moveNumber);
                if (!row) {
                    row = { moveNumber: move.moveNumber, white: '', black: '' };
                    rows.push(row);
                }
                row[move.color] = move.san;
            });

            this.elements.moveList.replaceChildren(...rows.map((row) => {
                const item = document.createElement('div');
                item.className = 'spectator-move-row';
                item.innerHTML = `
                    <span class="spectator-move-number">${row.moveNumber}.</span>
                    <span>${this.escapeHtml(row.white || '...')}</span>
                    <span>${this.escapeHtml(row.black || '')}</span>
                `;
                return item;
            }));
        },

        renderCatalogSummary() {
            if (!this.elements.metadata) return;
            const currentGameId = this.state?.currentObservedGameId;
            const current = currentGameId ? this.catalog?.gameMap?.[String(currentGameId)] : null;
            const candidate = current || window.CaissaSpectatorTVCatalog?.selectFeaturedGame?.(this.catalog?.games || []);
            if (!candidate) {
                this.renderEmptyState(this.elements.metadata, {
                    icon: 'fa-tv',
                    title: 'No featured candidate yet.',
                    message: 'Refresh live games to select a featured board.'
                });
                return;
            }

            this.elements.metadata.innerHTML = `
                <div class="spectator-meta-row"><span>Game</span><strong>#${this.escapeHtml(candidate.gameId)}</strong></div>
                <div class="spectator-meta-row"><span>Players</span><strong>${this.escapeHtml(candidate.whitePlayer)} vs ${this.escapeHtml(candidate.blackPlayer)}</strong></div>
                <div class="spectator-meta-row"><span>Time</span><strong>${this.escapeHtml(candidate.timeControl)}</strong></div>
                <div class="spectator-meta-row"><span>Rating</span><strong>${this.escapeHtml(candidate.averageRating || 'FICS')}</strong></div>
            `;
        },

        renderChannels() {
            const selected = this.state?.selectedChannelId || 'featured';
            this.elements.channelList?.querySelectorAll('[data-channel]').forEach((button) => {
                const active = button.dataset.channel === selected;
                button.classList.toggle('active', active);
                button.setAttribute('aria-selected', active ? 'true' : 'false');
            });
        },

        getVisibleGames() {
            return window.CaissaSpectatorTVCatalog?.filterByChannel?.(
                this.catalog?.games || [],
                this.state?.selectedChannelId || 'featured'
            ) || [];
        },

        renderGameList() {
            if (!this.elements.gameList) return;
            const games = this.getVisibleGames();
            if (this.elements.gameCount) this.elements.gameCount.textContent = String(games.length);
            if (!games.length) {
                this.renderEmptyState(this.elements.gameList, {
                    icon: 'fa-search',
                    title: 'No games found.',
                    message: 'Try another channel or refresh live games.'
                });
                return;
            }

            this.elements.gameList.replaceChildren(...games.map((game) => {
                const row = document.createElement('div');
                const current = String(this.state?.currentObservedGameId || '') === String(game.gameId);
                row.className = `spectator-game-row${current ? ' is-current' : ''}`;
                row.innerHTML = `
                    <div class="spectator-game-main">
                        <div class="spectator-game-players" title="${this.escapeHtml(`${game.whitePlayer} vs ${game.blackPlayer}`)}">
                            ${this.escapeHtml(game.whitePlayer)} vs ${this.escapeHtml(game.blackPlayer)}
                        </div>
                        <div class="spectator-game-meta">
                            <span>#${this.escapeHtml(game.gameId)}</span>
                            <span>${this.escapeHtml(game.timeControl)}</span>
                            <span>${this.escapeHtml(game.variant || 'standard')}</span>
                            <span>${this.escapeHtml(game.averageRating || 'FICS')}</span>
                            <span>${game.rated === true ? 'rated' : game.rated === false ? 'unrated' : 'live'}</span>
                            <span>${this.escapeHtml(game.observers || 0)} watching</span>
                        </div>
                    </div>
                `;
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'fics-btn fics-btn-secondary spectator-game-watch';
                button.dataset.gameId = game.gameId;
                button.textContent = current ? 'Watching' : 'Watch';
                button.disabled = current;
                button.setAttribute('aria-label', `${current ? 'Watching' : 'Watch'} game ${game.gameId}: ${game.whitePlayer} vs ${game.blackPlayer}`);
                row.appendChild(button);
                return row;
            }));
        },

        render() {
            const status = this.state?.status || 'disconnected';
            if (this.elements.connectionStatus) {
                this.elements.connectionStatus.textContent = this.labelForStatus(status);
                this.elements.connectionStatus.className = `spectator-status spectator-status-${status}`;
            }
            if (this.elements.featuredBadge) {
                this.elements.featuredBadge.textContent = this.catalog?.featuredGameId
                    ? `Featured #${this.catalog.featuredGameId}`
                    : 'Featured';
            }
            this.renderChannels();
            this.renderGameList();
            this.renderCatalogSummary();
        },

        showMessage(message, type = 'info') {
            if (!this.elements.message) return;
            this.elements.message.textContent = message || '';
            this.elements.message.className = `spectator-message spectator-message-${type}`;
        },

        renderEmptyState(target, options) {
            if (!target) return;
            if (window.CaissaUI?.createEmptyState) {
                const node = window.CaissaUI.createEmptyState(options);
                node.classList.add('caissa-ui-empty-state--compact');
                target.replaceChildren(node);
                return;
            }
            target.textContent = options.message || options.title || '';
        },

        labelForStatus(status) {
            return window.CaissaSpectatorTV?.STATE_LABELS?.[status] || 'Disconnected';
        },

        formatClock(seconds) {
            if (!Number.isFinite(seconds)) return '--:--';
            const safe = Math.max(0, seconds);
            return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
        },

        escapeHtml(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => SpectatorTVSection.init());
    } else {
        SpectatorTVSection.init();
    }

    if (window.CaissaNavigation) {
        window.CaissaNavigation.registerSection('spectator', SpectatorTVSection);
    }

    window.CaissaSpectatorTVSection = SpectatorTVSection;
})();
