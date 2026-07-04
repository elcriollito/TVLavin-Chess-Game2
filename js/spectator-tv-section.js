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
                moveList: document.getElementById('spectatorMoveList')
            };
        },

        bindEvents() {
            this.elements.watchBtn?.addEventListener('click', () => this.watchFeaturedGame());
            this.elements.refreshBtn?.addEventListener('click', () => this.refreshCatalog(true));
        },

        subscribeToFics() {
            if (this.unsubscribeFics || !window.CaissaFICSClient?.addSpectatorListener) return;
            this.unsubscribeFics = window.CaissaFICSClient.addSpectatorListener((detail) => this.handleFicsEvent(detail));
        },

        onEnter() {
            this.subscribeToFics();
            this.initBoard();
            this.syncFromFicsClient();
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
                this.updateCatalog(detail.payload?.activeTables || []);
                if (this.pendingFeaturedWatch) this.observeFeaturedCandidate();
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
            if (this.board) this.board.position('start', false);
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
            const entries = (activeTables || []).map((table) => ({
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
                selectedChannelId: 'featured'
            });
            this.renderCatalogSummary();
        },

        observeFeaturedCandidate() {
            const client = window.CaissaFICSClient;
            const candidate = window.CaissaSpectatorTVCatalog?.selectFeaturedGame?.(this.catalog?.games || []);
            this.pendingFeaturedWatch = false;

            if (!client?.authenticated) {
                this.showMessage('Connect to FICS before watching.', 'info');
                return;
            }

            if (!candidate) {
                this.showMessage('No featured live game is available right now.', 'warning');
                this.render();
                return;
            }

            this.state = window.CaissaSpectatorTV.setObservedGame(this.state, candidate.gameId, candidate);
            this.transition(window.CaissaSpectatorTV.STATES.SWITCHING_GAME);
            this.showMessage(`Opening featured game #${candidate.gameId}...`, 'info');
            if (typeof client.switchObservedGame === 'function') {
                client.switchObservedGame(candidate.gameId);
            } else {
                client.send?.(`observe ${candidate.gameId}`);
            }
            this.render();
        },

        renderStyle12(payload = {}) {
            const liveGame = payload.liveGame || {};
            if (!liveGame.currentFen) return;

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
            element.className = `spectator-player-bar ${player.color}${player.active ? ' turn-active' : ''}`;
            element.innerHTML = `
                <span class="spectator-turn-led${player.active ? ' active' : ''}" aria-label="${player.active ? `${player.color} to move` : `${player.color} waiting`}"></span>
                <span class="spectator-color-dot" aria-hidden="true"></span>
                <span class="spectator-player-name" title="${this.escapeHtml(player.name)}">${this.escapeHtml(player.name)}</span>
                <span class="spectator-player-rating">${this.escapeHtml(player.rating || '')}</span>
                <strong class="spectator-player-clock">${this.escapeHtml(player.clock)}</strong>
            `;
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
            const candidate = window.CaissaSpectatorTVCatalog?.selectFeaturedGame?.(this.catalog?.games || []);
            if (!candidate) {
                this.renderEmptyState(this.elements.metadata, {
                    icon: 'fa-tv',
                    title: 'No featured candidate yet.',
                    message: 'Refresh live games to select a featured board.'
                });
                return;
            }

            this.elements.metadata.innerHTML = `
                <div class="spectator-meta-row"><span>Featured</span><strong>#${this.escapeHtml(candidate.gameId)}</strong></div>
                <div class="spectator-meta-row"><span>Players</span><strong>${this.escapeHtml(candidate.whitePlayer)} vs ${this.escapeHtml(candidate.blackPlayer)}</strong></div>
                <div class="spectator-meta-row"><span>Time</span><strong>${this.escapeHtml(candidate.timeControl)}</strong></div>
                <div class="spectator-meta-row"><span>Rating</span><strong>${this.escapeHtml(candidate.averageRating || 'FICS')}</strong></div>
            `;
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
