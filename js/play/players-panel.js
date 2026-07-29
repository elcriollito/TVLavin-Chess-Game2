(function installPlayersPanel(global) {
    'use strict';

    const SCHEMA_VERSION = '1.0.0';
    const SNAPSHOT_SCHEMA_VERSION = '1.0.0';
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
                message: 'FICS seeks remain inside FICS. A CAISSA challenge lifecycle has not been implemented.'
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

        refresh() {
            if (this.#disposed) return result(false, 'disposed', 'DISPOSED');
            this.#diagnostics.refreshes += 1;
            return result(true, 'unchanged', 'NO_REAL_DATA', this.getSnapshot());
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
                    playerItemCount: 0
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
            if (actionId) this.executeAction(actionId);
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
