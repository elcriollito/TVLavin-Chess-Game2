(function installPlayersPanel(global) {
    'use strict';

    const SCHEMA_VERSION = '1.2.0';
    const SNAPSHOT_SCHEMA_VERSION = '1.2.0';
    const STATUSES = Object.freeze([
        'available', 'loading', 'empty', 'coming-later', 'unavailable',
        'disconnected', 'error', 'disabled'
    ]);
    const REASON_CODES = Object.freeze([
        'PROVIDER_AVAILABLE', 'NO_ACTIVE_CONNECTION', 'NO_REAL_DATA',
        'FEATURE_NOT_IMPLEMENTED', 'MATCHMAKING_BACKEND_UNAVAILABLE',
        'FRIEND_SYSTEM_UNAVAILABLE', 'HISTORY_UNAVAILABLE', 'PRESENCE_UNAVAILABLE',
        'CHALLENGE_PROVIDER_UNAVAILABLE', 'FICS_AVAILABLE', 'CLASSIC_AVAILABLE',
        'SIGN_IN_REQUIRED', 'CONNECTION_REQUIRED', 'INVALID_PROVIDER', 'DISPOSED'
    ]);
    const SECTION_IDS = Object.freeze([
        'friendsOnline', 'availablePlayers', 'challenges',
        'recentOpponents', 'suggestedPlayers'
    ]);
    const ACTION_IDS = Object.freeze([
        'open-fics', 'connect-fics', 'open-classic', 'return-to-games'
    ]);
    const PROVIDERS = deepFreeze([
        {
            id: 'fics',
            name: 'Free Internet Chess Server',
            ownership: 'external-fics',
            connectionStatus: 'not-inspected',
            qaAvailability: 'available',
            capabilities: {
                connectionEntry: true, playerList: true, seeks: true,
                challenges: true, games: true, serverClocks: true
            },
            actionId: 'open-fics',
            route: 'fics',
            limitations: [
                'External service with independent login, connection, game, and fair-play ownership.',
                'PlayersPanel has no read-only FICS player snapshot and does not display FICS players.'
            ]
        },
        {
            id: 'caissa-classic',
            name: 'CAISSA Classic',
            ownership: 'classic-presentation-fics-runtime',
            connectionStatus: 'not-inspected',
            qaAvailability: 'available',
            capabilities: {
                connectionEntry: true, playerList: true, tables: true,
                watch: true, localHumanGame: false, proprietaryMatchmaking: false
            },
            actionId: 'open-classic',
            route: 'yahooClassic',
            limitations: [
                'Classic consumes the existing FICS client and is not a separate player network.',
                'PlayersPanel does not create or join Classic tables.'
            ]
        },
        {
            id: 'local',
            name: 'Local human play',
            ownership: 'unassigned',
            connectionStatus: 'unavailable',
            qaAvailability: 'unavailable',
            capabilities: {
                connectionEntry: false, playerList: false, localHumanGame: false
            },
            actionId: null,
            route: null,
            limitations: ['No supported local human-versus-human lifecycle is available in Simplified Play.']
        },
        {
            id: 'future-caissa-network',
            name: 'CAISSA player network',
            ownership: 'future',
            connectionStatus: 'unavailable',
            qaAvailability: 'coming-later',
            capabilities: {
                presence: false, friends: false, challenges: false,
                matchmaking: false, ratings: false
            },
            actionId: null,
            route: null,
            limitations: ['No proprietary CAISSA presence or matchmaking backend exists.']
        }
    ]);
    const SECTION_DEFINITIONS = deepFreeze({
        friendsOnline: {
            label: 'Friends Online',
            status: 'coming-later',
            source: 'future-caissa-network',
            available: false,
            itemCount: 0,
            reasonCode: 'FRIEND_SYSTEM_UNAVAILABLE',
            emptyState: {
                title: 'Friends are coming later',
                message: 'CAISSA does not have a friend relationship or presence service yet.'
            },
            actions: []
        },
        availablePlayers: {
            label: 'Available Players',
            status: 'unavailable',
            source: 'fics',
            available: false,
            itemCount: 0,
            reasonCode: 'NO_REAL_DATA',
            emptyState: {
                title: 'Open the real FICS lobby',
                message: 'Live players are shown only inside the existing FICS experience after you connect. No player data is copied here.'
            },
            actions: ['open-fics', 'open-classic']
        },
        challenges: {
            label: 'Challenges',
            status: 'unavailable',
            source: 'provider-specific',
            available: false,
            itemCount: 0,
            reasonCode: 'CHALLENGE_PROVIDER_UNAVAILABLE',
            emptyState: {
                title: 'No CAISSA challenge service',
                message: 'FICS challenges remain inside provider-owned flows. No safe normalized challenge source is available here.'
            },
            actions: ['open-fics']
        },
        recentOpponents: {
            label: 'Recent Opponents',
            status: 'empty',
            source: 'completed-human-game-records',
            available: false,
            itemCount: 0,
            reasonCode: 'HISTORY_UNAVAILABLE',
            emptyState: {
                title: 'No human game history available',
                message: 'Recent opponents will appear only when real completed human GameRecords support this view.'
            },
            actions: []
        },
        suggestedPlayers: {
            label: 'Suggested Players',
            status: 'coming-later',
            source: 'future-caissa-network',
            available: false,
            itemCount: 0,
            reasonCode: 'PRESENCE_UNAVAILABLE',
            emptyState: {
                title: 'Suggestions need real presence',
                message: 'CAISSA will not suggest players until a real, current presence source exists.'
            },
            actions: []
        }
    });
    let sequence = 0;

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.values(value).forEach(deepFreeze);
        return Object.freeze(value);
    }

    function detached(value) {
        if (Array.isArray(value)) return value.map(detached);
        if (!value || typeof value !== 'object') return value;
        const copy = {};
        for (const [key, item] of Object.entries(value)) {
            if (key === '__proto__' || key === 'prototype' || key === 'constructor') continue;
            copy[key] = detached(item);
        }
        return copy;
    }

    function result(ok, status, reasonCode, value = null) {
        return deepFreeze({ ok, status, reasonCode, value: detached(value) });
    }

    function element(tag, className, attributes = {}) {
        const node = global.document.createElement(tag);
        node.className = className;
        Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
        return node;
    }

    class PlayersPanel {
        #id = `players-panel-${++sequence}`;
        #root = null;
        #host = null;
        #mounted = false;
        #disposed = false;
        #status = 'available';
        #activeSection = 'availablePlayers';
        #listeners = [];
        #actionInFlight = false;
        #presenceRegistry;
        #presenceRecords = [];
        #presenceState = null;
        #challengeRegistry;
        #challengeRecords = [];
        #challengeAdapters;
        #challengeActionsInFlight = new Set();
        #handlers;
        #diagnostics = {
            refreshes: 0, sectionSelections: 0, actionsAttempted: 0,
            actionsCompleted: 0, actionsRejected: 0, displayedPlayerRows: 0,
            storageWrites: 0, humanGamesStarted: 0, providerConnectionsCreated: 0
        };

        constructor(options = {}) {
            const supplied = options && typeof options === 'object' ? options.actions : null;
            this.#handlers = {
                'open-fics': supplied?.openFics || (() => global.CaissaNavigation?.navigateToSection?.('fics')),
                'connect-fics': supplied?.connectFics || (() => global.CaissaNavigation?.navigateToSection?.('fics')),
                'open-classic': supplied?.openClassic || (() => global.CaissaNavigation?.navigateToSection?.('yahooClassic')),
                'return-to-games': supplied?.returnToGames ||
                    (() => global.CaissaPlayRouteController?.navigate?.('/play/games?simplified=1'))
            };
            this.#presenceRegistry = options?.presenceRegistry || global.CaissaPresenceRegistryInstance || null;
            this.#challengeRegistry = options?.challengeRegistry || global.CaissaChallengeRegistryInstance || null;
            this.#challengeAdapters = options?.challengeAdapters || {
                fics: global.CaissaFicsChallengeAdapter?.create?.(),
                'future-caissa-network': global.CaissaChallengeAdapter?.create?.()
            };
        }

        mount(options = {}) {
            if (this.#disposed) return result(false, 'disposed', 'DISPOSED');
            if (this.#mounted) return result(true, 'unchanged', 'PROVIDER_AVAILABLE', this.getSnapshot());
            const host = options.host || options;
            if (!host?.appendChild) return result(false, 'rejected', 'INVALID_PROVIDER');
            this.#host = host;
            this.#root = element('section', 'caissa-players-panel', {
                'data-players-panel': '',
                'aria-labelledby': `${this.#id}-title`
            });
            const header = element('header', 'caissa-players-panel__header');
            const title = element('h2', '', { id: `${this.#id}-title` });
            title.textContent = 'Play People';
            const truth = element('p', 'caissa-players-panel__truth');
            truth.textContent = 'CAISSA has no proprietary player network. Use the existing FICS service for real online play.';
            header.append(title, truth);

            const tabs = element('div', 'caissa-players-panel__tabs', {
                role: 'tablist', 'aria-label': 'Player sections'
            });
            for (const id of SECTION_IDS) {
                const definition = SECTION_DEFINITIONS[id];
                const tab = element('button', 'caissa-players-panel__tab', {
                    type: 'button', role: 'tab', 'data-players-section': id,
                    id: `${this.#id}-tab-${id}`,
                    'aria-controls': `${this.#id}-section-${id}`,
                    'aria-selected': String(id === this.#activeSection)
                });
                tab.textContent = definition.label;
                tabs.appendChild(tab);
            }

            const sections = element('div', 'caissa-players-panel__sections');
            for (const id of SECTION_IDS) sections.appendChild(this.#createSection(id));
            const footer = element('footer', 'caissa-players-panel__footer');
            footer.append(
                this.#createAction('open-fics', 'Open FICS Lobby', true),
                this.#createAction('open-classic', 'Open CAISSA Classic', false),
                this.#createAction('return-to-games', 'Return to Games', false)
            );
            const status = element('p', 'caissa-players-panel__status', {
                role: 'status', 'aria-live': 'polite', 'data-players-status': ''
            });
            status.textContent = 'No player data loaded. No connections were created.';
            this.#root.append(header, tabs, sections, footer, status);
            host.appendChild(this.#root);
            this.#listen(this.#root, 'click', event => this.#handleClick(event));
            this.#listen(this.#root, 'keydown', event => this.#handleKeydown(event));
            this.#mounted = true;
            this.#renderSelection();
            return result(true, 'accepted', 'PROVIDER_AVAILABLE', this.getSnapshot());
        }

        unmount() {
            this.#removeListeners();
            this.#root?.remove();
            this.#root = null;
            this.#host = null;
            this.#mounted = false;
            return result(true, 'accepted', 'PROVIDER_AVAILABLE');
        }

        refresh(options = {}) {
            if (this.#disposed) return result(false, 'disposed', 'DISPOSED');
            this.#diagnostics.refreshes += 1;
            if (Number.isFinite(options.observedAt)) this.#presenceRegistry?.expire?.(options.observedAt);
            if (Number.isFinite(options.observedAt)) this.#challengeRegistry?.expire?.(options.observedAt);
            const provider = this.#presenceRegistry?.getProvider?.('fics') || null;
            this.#presenceState = provider;
            this.#presenceRecords = this.#presenceRegistry?.list?.() || [];
            this.#diagnostics.displayedPlayerRows = this.#presenceRecords.length;
            this.#challengeRecords = this.#challengeRegistry?.list?.() || [];
            this.#renderAvailablePlayers();
            this.#renderChallenges();
            const hasData = this.#presenceRecords.length || this.#challengeRecords.length;
            return result(true, hasData ? 'accepted' : 'unchanged',
                this.#challengeRecords.length ? 'PROVIDER_AVAILABLE'
                    : this.#presenceRecords.length ? 'PROVIDER_AVAILABLE' : 'NO_REAL_DATA', this.getSnapshot());
        }

        selectSection(sectionId) {
            if (this.#disposed) return result(false, 'disposed', 'DISPOSED');
            if (!SECTION_IDS.includes(sectionId)) return result(false, 'rejected', 'INVALID_PROVIDER');
            this.#activeSection = sectionId;
            this.#diagnostics.sectionSelections += 1;
            this.#renderSelection();
            return result(true, 'accepted', SECTION_DEFINITIONS[sectionId].reasonCode, this.getSnapshot());
        }

        executeAction(actionId, options = {}) {
            if (this.#disposed) return result(false, 'disposed', 'DISPOSED');
            if (!ACTION_IDS.includes(actionId) || typeof this.#handlers[actionId] !== 'function')
                return result(false, 'rejected', 'INVALID_PROVIDER');
            if (this.#actionInFlight) return result(false, 'rejected', 'INVALID_PROVIDER');
            this.#actionInFlight = true;
            this.#diagnostics.actionsAttempted += 1;
            try {
                this.#handlers[actionId](detached(options));
                this.#diagnostics.actionsCompleted += 1;
                const reasonCode = actionId === 'open-classic' ? 'CLASSIC_AVAILABLE'
                    : actionId === 'return-to-games' ? 'PROVIDER_AVAILABLE' : 'FICS_AVAILABLE';
                return result(true, 'accepted', reasonCode, { actionId });
            } catch (_) {
                this.#diagnostics.actionsRejected += 1;
                return result(false, 'error', 'INVALID_PROVIDER');
            } finally {
                this.#actionInFlight = false;
            }
        }

        async executeChallengeAction(challengeId, action) {
            if (this.#disposed) return result(false, 'disposed', 'DISPOSED');
            const record = this.#challengeRegistry?.get?.(challengeId);
            if (!record || !record.availableActions?.includes?.(action))
                return result(false, 'rejected', 'CHALLENGE_PROVIDER_UNAVAILABLE');
            const key = `${challengeId}:${action}`;
            if (this.#challengeActionsInFlight.has(key))
                return result(false, 'rejected', 'CHALLENGE_PROVIDER_UNAVAILABLE');
            const adapter = this.#challengeAdapters?.[record.provider];
            const method = {
                submit: 'createChallenge', accept: 'acceptChallenge',
                decline: 'declineChallenge', cancel: 'cancelChallenge',
                reconnect: 'reconnectChallenge', 'open-provider': 'openProvider'
            }[action];
            const capability = action === 'submit' ? 'create'
                : action === 'open-provider' ? 'activeGame' : action;
            if (!adapter?.isSupported?.() || adapter.getCapabilities?.()?.[capability] !== true ||
                !method || typeof adapter[method] !== 'function')
                return result(false, 'rejected', 'CHALLENGE_PROVIDER_UNAVAILABLE');
            this.#challengeActionsInFlight.add(key);
            this.#diagnostics.actionsAttempted += 1;
            try {
                const response = await adapter[method](record.challengeId);
                this.#challengeRegistry?.noteAction?.(response?.ok === true);
                if (!response?.ok || !response.providerUpdate ||
                    response.providerUpdate.challengeId !== record.challengeId ||
                    response.providerUpdate.provider !== record.provider ||
                    response.providerUpdate.updatedAt < record.updatedAt) {
                    this.#diagnostics.actionsRejected += 1;
                    return result(false, 'error', 'CHALLENGE_PROVIDER_UNAVAILABLE');
                }
                const ingested = this.#challengeRegistry.ingest(response.providerUpdate);
                if (!ingested.ok) {
                    this.#diagnostics.actionsRejected += 1;
                    return result(false, 'rejected', 'CHALLENGE_PROVIDER_UNAVAILABLE');
                }
                this.#diagnostics.actionsCompleted += 1;
                this.refresh({ observedAt: response.providerUpdate.updatedAt });
                return result(true, 'accepted', 'PROVIDER_AVAILABLE', ingested.value);
            } catch (_) {
                this.#challengeRegistry?.noteAction?.(false);
                this.#diagnostics.actionsRejected += 1;
                return result(false, 'error', 'CHALLENGE_PROVIDER_UNAVAILABLE');
            } finally {
                this.#challengeActionsInFlight.delete(key);
            }
        }

        show() {
            if (this.#root) this.#root.hidden = false;
            return result(true, 'accepted', 'PROVIDER_AVAILABLE');
        }

        hide() {
            if (this.#root) this.#root.hidden = true;
            return result(true, 'accepted', 'PROVIDER_AVAILABLE');
        }

        getSnapshot() {
            const sections = {};
            for (const id of SECTION_IDS) sections[id] = detached(SECTION_DEFINITIONS[id]);
            if (this.#presenceRecords.length) {
                sections.availablePlayers = {
                    ...sections.availablePlayers,
                    status: 'available', available: true,
                    itemCount: this.#presenceRecords.length,
                    reasonCode: 'PROVIDER_AVAILABLE',
                    emptyState: null
                };
            } else if (this.#presenceState?.status === 'disconnected') {
                sections.availablePlayers = {
                    ...sections.availablePlayers,
                    status: 'disconnected', reasonCode: 'CONNECTION_REQUIRED',
                    emptyState: {
                        title: 'FICS is disconnected',
                        message: 'Open FICS to connect before requesting real player presence.'
                    }
                };
            } else if (this.#presenceState?.status === 'stale') {
                sections.availablePlayers = {
                    ...sections.availablePlayers,
                    status: 'unavailable', reasonCode: 'NO_REAL_DATA',
                    emptyState: {
                        title: 'Presence data is stale',
                        message: 'No player is shown as available until FICS supplies a fresh snapshot.'
                    }
                };
            }
            if (this.#challengeRecords.length) {
                sections.challenges = {
                    ...sections.challenges,
                    status: 'available', available: true,
                    itemCount: this.#challengeRecords.length,
                    reasonCode: 'PROVIDER_AVAILABLE', emptyState: null
                };
            }
            return deepFreeze({
                schemaVersion: SNAPSHOT_SCHEMA_VERSION,
                panelId: this.#id,
                mounted: this.#mounted,
                disposed: this.#disposed,
                status: this.#disposed ? 'disabled' : this.#status,
                activeSection: this.#activeSection,
                sections,
                providers: detached(PROVIDERS),
                primaryAction: {
                    actionId: 'open-fics', label: 'Open FICS Lobby',
                    available: !this.#disposed, source: 'fics'
                },
                secondaryActions: [
                    { actionId: 'open-classic', label: 'Open CAISSA Classic', available: !this.#disposed },
                    { actionId: 'return-to-games', label: 'Return to Games', available: !this.#disposed }
                ],
                notices: [
                    'No proprietary CAISSA player network is available.',
                    'FICS and CAISSA Classic retain independent runtime ownership.'
                ],
                diagnostics: detached({
                    ...this.#diagnostics,
                    listenerCount: this.#listeners.length,
                    timerCount: 0,
                    socketCount: 0,
                    workerCount: 0,
                    playerItemCount: this.#presenceRecords.length,
                    challengeItemCount: this.#challengeRecords.length,
                    challengeActionInFlightCount: this.#challengeActionsInFlight.size
                })
            });
        }

        inspect() {
            return this.getSnapshot();
        }

        dispose() {
            if (this.#disposed) return result(true, 'unchanged', 'DISPOSED');
            this.unmount();
            this.#disposed = true;
            this.#status = 'disabled';
            return result(true, 'accepted', 'DISPOSED');
        }

        #createSection(id) {
            const definition = SECTION_DEFINITIONS[id];
            const panel = element('section', 'caissa-players-panel__section', {
                role: 'tabpanel', id: `${this.#id}-section-${id}`,
                'data-players-panel-section': id,
                'aria-labelledby': `${this.#id}-tab-${id}`,
                tabindex: '0'
            });
            const heading = element('h3', ''); heading.textContent = definition.label;
            const state = element('p', 'caissa-players-panel__state');
            state.textContent = definition.emptyState.title;
            const message = element('p', 'caissa-players-panel__message');
            message.textContent = definition.emptyState.message;
            const source = element('p', 'caissa-players-panel__source');
            source.textContent = `Source: ${definition.source}. Status: ${definition.status}.`;
            panel.append(heading, state, message, source);
            if (id === 'availablePlayers') {
                const list = element('div', 'caissa-players-panel__presence-list', {
                    role: 'list', 'aria-label': 'Available players from real providers',
                    'data-presence-list': ''
                });
                panel.appendChild(list);
            }
            if (id === 'challenges') {
                const list = element('div', 'caissa-players-panel__challenge-list', {
                    role: 'list', 'aria-label': 'Provider-owned challenges',
                    'data-challenge-list': ''
                });
                panel.appendChild(list);
            }
            for (const actionId of definition.actions) {
                const label = actionId === 'open-classic' ? 'Open CAISSA Classic' : 'Open FICS Lobby';
                panel.appendChild(this.#createAction(actionId, label, actionId === 'open-fics'));
            }
            return panel;
        }

        #createAction(actionId, label, primary) {
            const button = element('button',
                primary ? 'caissa-players-panel__action caissa-players-panel__action--primary'
                    : 'caissa-players-panel__action',
                { type: 'button', 'data-players-action': actionId }
            );
            button.textContent = label;
            return button;
        }

        #handleClick(event) {
            const sectionId = event.target?.closest?.('[data-players-section]')?.dataset?.playersSection;
            if (sectionId) {
                this.selectSection(sectionId);
                return;
            }
            const actionId = event.target?.closest?.('[data-players-action]')?.dataset?.playersAction;
            if (actionId) {
                this.executeAction(actionId);
                return;
            }
            const challengeButton = event.target?.closest?.('[data-challenge-action]');
            if (challengeButton) {
                const record = this.#challengeRecords[Number(challengeButton.dataset.challengeIndex)];
                if (record) void this.executeChallengeAction(record.challengeId, challengeButton.dataset.challengeAction);
            }
        }

        #handleKeydown(event) {
            const tab = event.target?.closest?.('[data-players-section]');
            if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const current = SECTION_IDS.indexOf(tab.dataset.playersSection);
            const next = event.key === 'Home' ? 0
                : event.key === 'End' ? SECTION_IDS.length - 1
                    : (current + (event.key === 'ArrowRight' ? 1 : -1) + SECTION_IDS.length) % SECTION_IDS.length;
            this.selectSection(SECTION_IDS[next]);
            this.#root.querySelector(`[data-players-section="${SECTION_IDS[next]}"]`)?.focus?.();
        }

        #renderSelection() {
            if (!this.#root) return;
            this.#root.querySelectorAll('[data-players-section]').forEach(tab => {
                const selected = tab.dataset.playersSection === this.#activeSection;
                tab.setAttribute('aria-selected', String(selected));
                tab.tabIndex = selected ? 0 : -1;
            });
            this.#root.querySelectorAll('[data-players-panel-section]').forEach(panel => {
                panel.hidden = panel.dataset.playersPanelSection !== this.#activeSection;
            });
        }

        #renderAvailablePlayers() {
            const panel = this.#root?.querySelector?.('[data-players-panel-section="availablePlayers"]');
            const list = panel?.querySelector?.('[data-presence-list]');
            if (!panel || !list) return;
            list.replaceChildren();
            const state = panel.querySelector('.caissa-players-panel__state');
            const message = panel.querySelector('.caissa-players-panel__message');
            const source = panel.querySelector('.caissa-players-panel__source');
            if (!this.#presenceRecords.length) {
                const snapshot = this.getSnapshot().sections.availablePlayers;
                state.textContent = snapshot.emptyState.title;
                message.textContent = snapshot.emptyState.message;
                source.textContent = `Source: ${snapshot.source}. Status: ${snapshot.status}.`;
                return;
            }
            state.textContent = `${this.#presenceRecords.length} provider-reported player${this.#presenceRecords.length === 1 ? '' : 's'}`;
            message.textContent = 'Only fresh, provider-qualified presence is shown.';
            source.textContent = 'Source: validated provider registry. Status: available.';
            for (const record of this.#presenceRecords) {
                const row = element('article', 'caissa-players-panel__presence-row', {
                    role: 'listitem', tabindex: '0', 'data-presence-row': '',
                    'data-presence-id': record.presenceId,
                    'aria-label': this.#presenceLabel(record)
                });
                const name = element('strong', 'caissa-players-panel__presence-name');
                name.textContent = record.displayName;
                const provider = element('span', 'caissa-players-panel__presence-provider');
                provider.textContent = record.provider.toUpperCase();
                const status = element('span', 'caissa-players-panel__presence-status');
                status.textContent = record.status;
                row.append(name, provider, status);
                if (record.rating) {
                    const rating = element('span', 'caissa-players-panel__presence-rating');
                    rating.textContent = `${record.rating.value} ${record.rating.ratingType}${record.rating.provisional ? ' provisional' : ''}`;
                    row.appendChild(rating);
                }
                list.appendChild(row);
            }
        }

        #presenceLabel(record) {
            const parts = [record.displayName, `provider ${record.provider}`, `status ${record.status}`];
            if (record.rating) parts.push(`${record.rating.ratingType} rating ${record.rating.value}${record.rating.provisional ? ', provisional' : ''}`);
            if (record.status === 'stale') parts.push('presence is stale and challenges are unavailable');
            return parts.join(', ');
        }

        #renderChallenges() {
            const panel = this.#root?.querySelector?.('[data-players-panel-section="challenges"]');
            const list = panel?.querySelector?.('[data-challenge-list]');
            if (!panel || !list) return;
            const focused = global.document?.activeElement?.dataset;
            const focusKey = focused?.challengeAction && focused?.challengeIndex
                ? `${focused.challengeIndex}:${focused.challengeAction}` : null;
            list.replaceChildren();
            const state = panel.querySelector('.caissa-players-panel__state');
            const message = panel.querySelector('.caissa-players-panel__message');
            const source = panel.querySelector('.caissa-players-panel__source');
            if (!this.#challengeRecords.length) {
                const snapshot = this.getSnapshot().sections.challenges;
                state.textContent = snapshot.emptyState.title;
                message.textContent = snapshot.emptyState.message;
                source.textContent = `Source: ${snapshot.source}. Status: ${snapshot.status}.`;
                return;
            }
            state.textContent = `${this.#challengeRecords.length} provider-owned challenge${this.#challengeRecords.length === 1 ? '' : 's'}`;
            message.textContent = 'Challenge state does not start or modify a Simplified Play game.';
            source.textContent = 'Source: validated provider challenge registry. Status: available.';
            this.#challengeRecords.forEach((record, index) => {
                const opponent = record.direction === 'incoming' ? record.challengerName : record.challengedName;
                const row = element('article', 'caissa-players-panel__challenge-row', {
                    role: 'listitem', tabindex: '0', 'data-challenge-row': '',
                    'aria-label': `${record.direction} challenge from provider ${record.provider}, opponent ${opponent}, state ${record.state}, ${record.rated}`
                });
                const name = element('strong', 'caissa-players-panel__challenge-name');
                name.textContent = opponent;
                const provider = element('span', 'caissa-players-panel__challenge-provider');
                provider.textContent = record.provider.toUpperCase();
                const direction = element('span', 'caissa-players-panel__challenge-direction');
                direction.textContent = record.direction;
                const status = element('span', 'caissa-players-panel__challenge-state');
                status.textContent = record.state;
                const details = element('span', 'caissa-players-panel__challenge-details');
                details.textContent = record.timeControl
                    ? `${record.timeControl.initialSeconds / 60}+${record.timeControl.incrementSeconds} · ${record.rated} · ${record.colorPreference}`
                    : `Unknown time control · ${record.rated} · ${record.colorPreference}`;
                row.append(name, provider, direction, status, details);
                for (const action of record.availableActions) {
                    const button = element('button', 'caissa-players-panel__challenge-action', {
                        type: 'button', 'data-challenge-action': action,
                        'data-challenge-index': String(index),
                        'aria-label': `${this.#challengeActionLabel(action)} ${opponent} on ${record.provider}`
                    });
                    button.textContent = this.#challengeActionLabel(action);
                    button.disabled = this.#challengeActionsInFlight.has(`${record.challengeId}:${action}`);
                    row.appendChild(button);
                }
                list.appendChild(row);
            });
            if (focusKey) {
                const [index, action] = focusKey.split(':');
                list.querySelector(`[data-challenge-index="${index}"][data-challenge-action="${action}"]`)?.focus?.();
            }
        }

        #challengeActionLabel(action) {
            return {
                submit: 'Submit', accept: 'Accept', decline: 'Decline',
                cancel: 'Cancel', reconnect: 'Reconnect',
                'open-provider': 'Open Provider', dismiss: 'Dismiss'
            }[action] || 'Unavailable';
        }

        #listen(target, type, handler) {
            target.addEventListener(type, handler);
            this.#listeners.push({ target, type, handler });
        }

        #removeListeners() {
            this.#listeners.splice(0).forEach(({ target, type, handler }) =>
                target.removeEventListener(type, handler));
        }
    }

    global.CaissaPlayersPanel = Object.freeze({
        schemaVersion: SCHEMA_VERSION,
        snapshotSchemaVersion: SNAPSHOT_SCHEMA_VERSION,
        statuses: STATUSES,
        reasonCodes: REASON_CODES,
        sectionIds: SECTION_IDS,
        actionIds: ACTION_IDS,
        providers: PROVIDERS,
        create: options => new PlayersPanel(options),
        mount(options = {}) {
            const panel = new PlayersPanel(options);
            const mounted = panel.mount(options);
            return mounted.ok ? panel : mounted;
        }
    });
})(typeof window !== 'undefined' ? window : globalThis);
