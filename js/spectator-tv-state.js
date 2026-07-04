/**
 * CAISSA Spectator TV State Model
 *
 * Foundation-only module for Season 4.2. It defines the future Spectator TV
 * state machine, channel descriptors, and immutable state helpers. It does not
 * connect to FICS, observe games, render UI, or alter existing workflows.
 */
(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CaissaSpectatorTV = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function() {
    'use strict';

    const STATES = Object.freeze({
        DISCONNECTED: 'disconnected',
        CONNECTING: 'connecting',
        LOADING_GAMES: 'loading-games',
        WATCHING: 'watching',
        SWITCHING_GAME: 'switching-game',
        GAME_FINISHED: 'game-finished',
        RECONNECT_REQUIRED: 'reconnect-required',
        ERROR: 'error'
    });

    const STATE_LABELS = Object.freeze({
        [STATES.DISCONNECTED]: 'Disconnected',
        [STATES.CONNECTING]: 'Connecting',
        [STATES.LOADING_GAMES]: 'Loading Games',
        [STATES.WATCHING]: 'Watching',
        [STATES.SWITCHING_GAME]: 'Switching Game',
        [STATES.GAME_FINISHED]: 'Game Finished',
        [STATES.RECONNECT_REQUIRED]: 'Reconnect Required',
        [STATES.ERROR]: 'Error'
    });

    const ALLOWED_TRANSITIONS = Object.freeze({
        [STATES.DISCONNECTED]: Object.freeze([
            STATES.CONNECTING
        ]),
        [STATES.CONNECTING]: Object.freeze([
            STATES.LOADING_GAMES,
            STATES.ERROR,
            STATES.DISCONNECTED
        ]),
        [STATES.LOADING_GAMES]: Object.freeze([
            STATES.SWITCHING_GAME,
            STATES.WATCHING,
            STATES.ERROR,
            STATES.RECONNECT_REQUIRED,
            STATES.DISCONNECTED
        ]),
        [STATES.WATCHING]: Object.freeze([
            STATES.SWITCHING_GAME,
            STATES.GAME_FINISHED,
            STATES.RECONNECT_REQUIRED,
            STATES.ERROR,
            STATES.DISCONNECTED
        ]),
        [STATES.SWITCHING_GAME]: Object.freeze([
            STATES.WATCHING,
            STATES.ERROR,
            STATES.RECONNECT_REQUIRED,
            STATES.DISCONNECTED
        ]),
        [STATES.GAME_FINISHED]: Object.freeze([
            STATES.LOADING_GAMES,
            STATES.SWITCHING_GAME,
            STATES.DISCONNECTED,
            STATES.RECONNECT_REQUIRED
        ]),
        [STATES.RECONNECT_REQUIRED]: Object.freeze([
            STATES.CONNECTING,
            STATES.DISCONNECTED,
            STATES.ERROR
        ]),
        [STATES.ERROR]: Object.freeze([
            STATES.LOADING_GAMES,
            STATES.CONNECTING,
            STATES.DISCONNECTED
        ])
    });

    const CHANNELS = Object.freeze([
        Object.freeze({
            id: 'featured',
            label: 'Featured',
            description: 'Recommended live game selected from available FICS games.',
            filterType: 'recommendation',
            sortStrategy: 'weighted-score',
            enabled: true,
            future: false
        }),
        Object.freeze({
            id: 'top-rated',
            label: 'Top Rated',
            description: 'Games with the highest average player rating.',
            filterType: 'rating',
            sortStrategy: 'average-rating-desc',
            enabled: false,
            future: true
        }),
        Object.freeze({
            id: 'blitz',
            label: 'Blitz',
            description: 'Fast games with blitz-style time controls.',
            filterType: 'time-control',
            sortStrategy: 'recent-first',
            enabled: false,
            future: true
        }),
        Object.freeze({
            id: 'bullet',
            label: 'Bullet',
            description: 'Very fast games with bullet-style time controls.',
            filterType: 'time-control',
            sortStrategy: 'recent-first',
            enabled: false,
            future: true
        }),
        Object.freeze({
            id: 'rapid',
            label: 'Rapid',
            description: 'Games with rapid-style time controls.',
            filterType: 'time-control',
            sortStrategy: 'recent-first',
            enabled: false,
            future: true
        }),
        Object.freeze({
            id: 'classical',
            label: 'Classical',
            description: 'Longer games with classical-style time controls.',
            filterType: 'time-control',
            sortStrategy: 'recent-first',
            enabled: false,
            future: true
        }),
        Object.freeze({
            id: 'variants',
            label: 'Variants',
            description: 'Non-standard chess variants when metadata is available.',
            filterType: 'variant',
            sortStrategy: 'variant-priority',
            enabled: false,
            future: true
        }),
        Object.freeze({
            id: 'new-games',
            label: 'New Games',
            description: 'Recently started live games.',
            filterType: 'game-age',
            sortStrategy: 'started-desc',
            enabled: false,
            future: true
        }),
        Object.freeze({
            id: 'longest-running',
            label: 'Longest Running',
            description: 'Active games that have been running the longest.',
            filterType: 'game-age',
            sortStrategy: 'started-asc',
            enabled: false,
            future: true
        }),
        Object.freeze({
            id: 'most-observed',
            label: 'Most Observed',
            description: 'Games with the highest observer count when available.',
            filterType: 'observers',
            sortStrategy: 'observer-count-desc',
            enabled: false,
            future: true
        }),
        Object.freeze({
            id: 'recently-started',
            label: 'Recently Started',
            description: 'Fresh games suitable for watching from the opening.',
            filterType: 'game-age',
            sortStrategy: 'started-desc',
            enabled: false,
            future: true
        })
    ]);

    const CHANNEL_MAP = Object.freeze(CHANNELS.reduce((map, channel) => {
        map[channel.id] = channel;
        return map;
    }, Object.create(null)));

    const MEANINGFUL_STATES = Object.freeze([
        STATES.WATCHING,
        STATES.GAME_FINISHED,
        STATES.LOADING_GAMES
    ]);

    function nowIso() {
        return new Date().toISOString();
    }

    function normalizeState(value, fallback = STATES.DISCONNECTED) {
        return Object.prototype.hasOwnProperty.call(STATE_LABELS, value) ? value : fallback;
    }

    function getChannel(channelId) {
        return CHANNEL_MAP[String(channelId || '')] || null;
    }

    function normalizeChannelId(channelId) {
        return getChannel(channelId)?.id || 'featured';
    }

    function clonePlainObject(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
        return { ...value };
    }

    function normalizeError(error) {
        if (!error) return null;
        if (typeof error === 'string') {
            return {
                message: error,
                at: nowIso()
            };
        }
        return {
            message: String(error.message || 'Spectator TV error'),
            code: error.code ? String(error.code) : null,
            detail: error.detail ? String(error.detail) : null,
            at: error.at || nowIso()
        };
    }

    function createInitialState(overrides = {}) {
        const status = normalizeState(overrides.status);
        const selectedChannelId = normalizeChannelId(overrides.selectedChannelId);
        return Object.freeze({
            status,
            previousStatus: null,
            lastMeaningfulStatus: MEANINGFUL_STATES.includes(status) ? status : null,
            selectedChannelId,
            currentObservedGameId: overrides.currentObservedGameId || null,
            metadata: clonePlainObject(overrides.metadata),
            error: normalizeError(overrides.error),
            lastStyle12: overrides.lastStyle12 || null,
            lastUpdatedAt: overrides.lastUpdatedAt || nowIso(),
            transitionRejected: null
        });
    }

    function canTransition(fromState, toState) {
        const from = normalizeState(fromState);
        const to = normalizeState(toState, null);
        if (!to) return false;
        if (from === to) return true;
        return (ALLOWED_TRANSITIONS[from] || []).includes(to);
    }

    function transitionTo(state, toState, updates = {}) {
        const currentState = state || createInitialState();
        const from = normalizeState(currentState.status);
        const to = normalizeState(toState, null);
        const at = nowIso();

        if (!to || !canTransition(from, to)) {
            return Object.freeze({
                ...currentState,
                transitionRejected: Object.freeze({
                    from,
                    to: toState,
                    reason: 'invalid-transition',
                    at
                }),
                lastUpdatedAt: at
            });
        }

        return Object.freeze({
            ...currentState,
            ...updates,
            status: to,
            previousStatus: from,
            lastMeaningfulStatus: MEANINGFUL_STATES.includes(to)
                ? to
                : currentState.lastMeaningfulStatus,
            selectedChannelId: normalizeChannelId(updates.selectedChannelId || currentState.selectedChannelId),
            metadata: updates.metadata ? clonePlainObject(updates.metadata) : currentState.metadata,
            error: Object.prototype.hasOwnProperty.call(updates, 'error')
                ? normalizeError(updates.error)
                : currentState.error,
            transitionRejected: null,
            lastUpdatedAt: at
        });
    }

    function setChannel(state, channelId) {
        const currentState = state || createInitialState();
        return Object.freeze({
            ...currentState,
            selectedChannelId: normalizeChannelId(channelId),
            lastUpdatedAt: nowIso()
        });
    }

    function setObservedGame(state, gameId, metadata = null) {
        const currentState = state || createInitialState();
        const normalizedGameId = gameId === undefined || gameId === null || gameId === ''
            ? null
            : String(gameId);
        return Object.freeze({
            ...currentState,
            currentObservedGameId: normalizedGameId,
            metadata: metadata ? clonePlainObject(metadata) : currentState.metadata,
            lastUpdatedAt: nowIso()
        });
    }

    function updateMetadata(state, metadata = {}) {
        const currentState = state || createInitialState();
        return Object.freeze({
            ...currentState,
            metadata: {
                ...currentState.metadata,
                ...clonePlainObject(metadata)
            },
            lastUpdatedAt: nowIso()
        });
    }

    function setError(state, error) {
        const currentState = state || createInitialState();
        return transitionTo(currentState, STATES.ERROR, {
            error: normalizeError(error)
        });
    }

    function clearError(state) {
        const currentState = state || createInitialState();
        return Object.freeze({
            ...currentState,
            error: null,
            transitionRejected: null,
            lastUpdatedAt: nowIso()
        });
    }

    function resetState(overrides = {}) {
        return createInitialState(overrides);
    }

    function cleanupState(state) {
        const currentState = state || createInitialState();
        return Object.freeze({
            ...currentState,
            status: STATES.DISCONNECTED,
            previousStatus: currentState.status,
            currentObservedGameId: null,
            metadata: {},
            error: null,
            lastStyle12: null,
            transitionRejected: null,
            lastUpdatedAt: nowIso()
        });
    }

    return Object.freeze({
        STATES,
        STATE_LABELS,
        ALLOWED_TRANSITIONS,
        CHANNELS,
        getChannel,
        createInitialState,
        canTransition,
        transitionTo,
        setChannel,
        setObservedGame,
        updateMetadata,
        setError,
        clearError,
        resetState,
        cleanupState
    });
});
