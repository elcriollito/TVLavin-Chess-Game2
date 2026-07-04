/**
 * CAISSA Spectator TV Live Game Catalog
 *
 * Data-only foundation for Season 4.2C. The catalog normalizes active game
 * metadata for future Spectator TV views. It does not render UI, connect to
 * FICS, observe games, or alter existing FICS protocol behavior.
 */
(function(root, factory) {
    const api = factory(root.CaissaSpectatorTV);
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CaissaSpectatorTVCatalog = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function(SpectatorTV) {
    'use strict';

    const DEFAULT_CHANNEL_ID = 'featured';
    const DEFAULT_REFRESH_POLICY = Object.freeze({
        // Style12 remains event-driven. This interval applies only to game list
        // discovery once a future caller wires catalog refresh to FICS `games`.
        catalogIntervalMs: 60000,
        minManualRefreshMs: 5000,
        metadataMode: 'changed-only',
        observedGameMode: 'style12-event-driven'
    });

    const SCORE_WEIGHTS = Object.freeze({
        averageRating: 1,
        observer: 15,
        rated: 60,
        standardVariant: 35,
        rapidOrBlitz: 25,
        freshGame: 20,
        stalePenalty: 30
    });

    const FALLBACK_CHANNELS = Object.freeze([
        Object.freeze({ id: 'featured', filterType: 'recommendation', sortStrategy: 'weighted-score', enabled: true }),
        Object.freeze({ id: 'top-rated', filterType: 'rating', sortStrategy: 'average-rating-desc', enabled: false }),
        Object.freeze({ id: 'blitz', filterType: 'time-control', sortStrategy: 'recent-first', enabled: false }),
        Object.freeze({ id: 'bullet', filterType: 'time-control', sortStrategy: 'recent-first', enabled: false }),
        Object.freeze({ id: 'rapid', filterType: 'time-control', sortStrategy: 'recent-first', enabled: false }),
        Object.freeze({ id: 'classical', filterType: 'time-control', sortStrategy: 'recent-first', enabled: false }),
        Object.freeze({ id: 'variants', filterType: 'variant', sortStrategy: 'variant-priority', enabled: false }),
        Object.freeze({ id: 'new-games', filterType: 'game-age', sortStrategy: 'started-desc', enabled: false }),
        Object.freeze({ id: 'longest-running', filterType: 'game-age', sortStrategy: 'started-asc', enabled: false }),
        Object.freeze({ id: 'most-observed', filterType: 'observers', sortStrategy: 'observer-count-desc', enabled: false }),
        Object.freeze({ id: 'recently-started', filterType: 'game-age', sortStrategy: 'started-desc', enabled: false })
    ]);

    const CHANNELS = Object.freeze(Array.isArray(SpectatorTV?.CHANNELS) && SpectatorTV.CHANNELS.length
        ? SpectatorTV.CHANNELS
        : FALLBACK_CHANNELS);

    function nowIso() {
        return new Date().toISOString();
    }

    function toNumber(value, fallback = 0) {
        if (value === null || value === undefined || value === '') return fallback;
        const parsed = Number.parseInt(String(value).replace(/[^\d-]/g, ''), 10);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function normalizeText(value, fallback = '') {
        const text = String(value || '').replace(/\s+/g, ' ').trim();
        return text || fallback;
    }

    function normalizePlayer(value, fallback) {
        return normalizeText(value, fallback);
    }

    function normalizeRating(value) {
        const parsed = toNumber(value, 0);
        return parsed > 0 ? parsed : null;
    }

    function averageRating(whiteRating, blackRating) {
        const ratings = [whiteRating, blackRating].filter((rating) => Number.isFinite(rating) && rating > 0);
        if (!ratings.length) return null;
        return Math.round(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length);
    }

    function normalizeTimeControl(value) {
        const text = normalizeText(value, 'live').toLowerCase();
        const compact = text.match(/\b(\d{1,3})\s*[+ ]\s*(\d{1,3})\b/);
        if (compact) return `${compact[1]}+${compact[2]}`;
        return text || 'live';
    }

    function getBaseMinutes(timeControl) {
        const match = String(timeControl || '').match(/^(\d{1,3})\+/);
        return match ? toNumber(match[1], null) : null;
    }

    function classifyTimeControl(timeControl) {
        const minutes = getBaseMinutes(timeControl);
        if (minutes === null) return 'unknown';
        if (minutes <= 2) return 'bullet';
        if (minutes <= 5) return 'blitz';
        if (minutes <= 15) return 'rapid';
        return 'classical';
    }

    function normalizeVariant(value) {
        const text = normalizeText(value, 'standard').toLowerCase();
        if (['std', 'normal', 'chess'].includes(text)) return 'standard';
        return text;
    }

    function normalizeRated(value) {
        if (typeof value === 'boolean') return value;
        const text = normalizeText(value).toLowerCase();
        if (!text) return null;
        if (text.includes('unrated')) return false;
        if (text.includes('rated')) return true;
        return null;
    }

    function normalizeGameAge(input) {
        if (Number.isFinite(input.gameAge)) return Math.max(0, input.gameAge);
        if (Number.isFinite(input.ageSeconds)) return Math.max(0, input.ageSeconds);
        if (input.startedAt) {
            const started = Date.parse(input.startedAt);
            if (Number.isFinite(started)) return Math.max(0, Math.floor((Date.now() - started) / 1000));
        }
        return null;
    }

    function deriveChannelHints(entry) {
        const hints = new Set(['featured']);
        const tcClass = classifyTimeControl(entry.timeControl);
        if (tcClass !== 'unknown') hints.add(tcClass);
        if (entry.variant && entry.variant !== 'standard') hints.add('variants');
        if (Number.isFinite(entry.averageRating)) hints.add('top-rated');
        if (Number.isFinite(entry.observers) && entry.observers > 0) hints.add('most-observed');
        if (Number.isFinite(entry.gameAge)) {
            hints.add('new-games');
            hints.add('recently-started');
            hints.add('longest-running');
        }
        return Object.freeze(Array.from(hints));
    }

    function computeFeaturedScore(entry, weights = SCORE_WEIGHTS) {
        let score = 0;
        if (Number.isFinite(entry.averageRating)) score += entry.averageRating * weights.averageRating;
        if (Number.isFinite(entry.observers)) score += entry.observers * weights.observer;
        if (entry.rated === true) score += weights.rated;
        if (entry.variant === 'standard') score += weights.standardVariant;

        const tcClass = classifyTimeControl(entry.timeControl);
        if (tcClass === 'blitz' || tcClass === 'rapid') score += weights.rapidOrBlitz;
        if (Number.isFinite(entry.gameAge)) {
            if (entry.gameAge <= 600) score += weights.freshGame;
            if (entry.gameAge >= 7200) score -= weights.stalePenalty;
        }

        return Math.round(score);
    }

    function normalizeRawReference(input) {
        return Object.freeze({
            source: normalizeText(input.source, 'fics'),
            id: String(input.gameId || input.gameNumber || input.number || ''),
            label: normalizeText(input.label || input.rawReference?.label || '')
        });
    }

    function normalizeGame(input = {}, options = {}) {
        const gameId = normalizeText(input.gameId || input.gameNumber || input.number);
        if (!gameId) return null;

        const whiteRating = normalizeRating(input.whiteRating);
        const blackRating = normalizeRating(input.blackRating);
        const timeControl = normalizeTimeControl(input.timeControl || input.tc);
        const baseEntry = {
            gameId,
            whitePlayer: normalizePlayer(input.whitePlayer || input.white, 'White'),
            blackPlayer: normalizePlayer(input.blackPlayer || input.black, 'Black'),
            whiteRating,
            blackRating,
            averageRating: averageRating(whiteRating, blackRating),
            timeControl,
            variant: normalizeVariant(input.variant),
            rated: normalizeRated(input.rated),
            observers: normalizeRating(input.observers) || 0,
            gameAge: normalizeGameAge(input),
            status: normalizeText(input.status, 'active'),
            channelHints: Object.freeze([]),
            featuredScore: 0,
            rawReference: normalizeRawReference(input)
        };

        const withHints = {
            ...baseEntry,
            channelHints: deriveChannelHints(baseEntry)
        };

        return Object.freeze({
            ...withHints,
            featuredScore: computeFeaturedScore(withHints, options.scoreWeights)
        });
    }

    function normalizeGames(inputs = [], options = {}) {
        const seen = new Set();
        return Object.freeze(inputs
            .map((input) => normalizeGame(input, options))
            .filter((entry) => {
                if (!entry || seen.has(entry.gameId)) return false;
                seen.add(entry.gameId);
                return true;
            }));
    }

    function buildGameMap(games) {
        return Object.freeze(games.reduce((map, game) => {
            map[game.gameId] = game;
            return map;
        }, Object.create(null)));
    }

    function sortGames(games, sortStrategy = 'weighted-score') {
        const sorted = [...games];
        if (sortStrategy === 'average-rating-desc') {
            sorted.sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0));
        } else if (sortStrategy === 'observer-count-desc') {
            sorted.sort((a, b) => (b.observers || 0) - (a.observers || 0));
        } else if (sortStrategy === 'started-asc') {
            sorted.sort((a, b) => (b.gameAge || 0) - (a.gameAge || 0));
        } else if (sortStrategy === 'started-desc' || sortStrategy === 'recent-first') {
            sorted.sort((a, b) => (a.gameAge ?? Number.MAX_SAFE_INTEGER) - (b.gameAge ?? Number.MAX_SAFE_INTEGER));
        } else {
            sorted.sort((a, b) => b.featuredScore - a.featuredScore);
        }
        return Object.freeze(sorted);
    }

    function getChannel(channelId) {
        return CHANNELS.find((channel) => channel.id === channelId) || CHANNELS[0];
    }

    function gameMatchesChannel(game, channel) {
        if (!game || !channel) return false;
        if (channel.id === 'featured') return true;
        if (channel.id === 'top-rated') return Number.isFinite(game.averageRating);
        if (channel.id === 'variants') return game.variant !== 'standard';
        if (channel.id === 'most-observed') return Number.isFinite(game.observers) && game.observers > 0;
        if (channel.id === 'new-games' || channel.id === 'recently-started') {
            return game.gameAge === null || game.gameAge <= 900;
        }
        if (channel.id === 'longest-running') return Number.isFinite(game.gameAge);
        return game.channelHints.includes(channel.id);
    }

    function filterByChannel(games, channelId = DEFAULT_CHANNEL_ID) {
        const channel = getChannel(channelId);
        const matches = games.filter((game) => gameMatchesChannel(game, channel));
        return sortGames(matches, channel.sortStrategy);
    }

    function selectFeaturedGame(games, options = {}) {
        const candidates = filterByChannel(games, options.channelId || DEFAULT_CHANNEL_ID);
        if (!candidates.length) return null;
        return candidates[0];
    }

    function createCatalog(options = {}) {
        const games = normalizeGames(options.games || [], options);
        const featured = selectFeaturedGame(games, options);
        const selectedChannelId = getChannel(options.selectedChannelId || DEFAULT_CHANNEL_ID).id;
        return Object.freeze({
            games,
            gameMap: buildGameMap(games),
            selectedChannelId,
            featuredGameId: featured?.gameId || null,
            lastRefreshAt: options.lastRefreshAt || null,
            refreshPolicy: Object.freeze({
                ...DEFAULT_REFRESH_POLICY,
                ...(options.refreshPolicy || {})
            }),
            lastUpdatedAt: options.lastUpdatedAt || nowIso()
        });
    }

    function updateCatalog(catalog, inputs = [], options = {}) {
        const current = catalog || createCatalog();
        return createCatalog({
            ...options,
            games: inputs,
            selectedChannelId: options.selectedChannelId || current.selectedChannelId,
            refreshPolicy: options.refreshPolicy || current.refreshPolicy,
            lastRefreshAt: options.lastRefreshAt || nowIso()
        });
    }

    function mergeCatalog(catalog, inputs = [], options = {}) {
        const current = catalog || createCatalog();
        const existing = current.games.reduce((map, game) => {
            map[game.gameId] = game;
            return map;
        }, Object.create(null));

        normalizeGames(inputs, options).forEach((game) => {
            existing[game.gameId] = game;
        });

        return createCatalog({
            ...options,
            games: Object.values(existing),
            selectedChannelId: options.selectedChannelId || current.selectedChannelId,
            refreshPolicy: options.refreshPolicy || current.refreshPolicy,
            lastRefreshAt: options.lastRefreshAt || nowIso()
        });
    }

    function clearCatalog(options = {}) {
        return createCatalog({
            selectedChannelId: options.selectedChannelId || DEFAULT_CHANNEL_ID,
            refreshPolicy: options.refreshPolicy,
            lastRefreshAt: null
        });
    }

    function shouldRefreshCatalog(catalog, now = Date.now()) {
        if (!catalog?.lastRefreshAt) return true;
        const last = Date.parse(catalog.lastRefreshAt);
        if (!Number.isFinite(last)) return true;
        return now - last >= catalog.refreshPolicy.catalogIntervalMs;
    }

    function createRefreshRequest(catalog, options = {}) {
        const current = catalog || createCatalog();
        const manual = !!options.manual;
        const now = Date.now();
        const last = current.lastRefreshAt ? Date.parse(current.lastRefreshAt) : 0;
        const minManual = current.refreshPolicy.minManualRefreshMs;
        const due = manual
            ? !Number.isFinite(last) || now - last >= minManual
            : shouldRefreshCatalog(current, now);

        return Object.freeze({
            due,
            manual,
            command: 'games',
            requestedAt: nowIso(),
            reason: due ? 'catalog-refresh-due' : 'refresh-throttled'
        });
    }

    return Object.freeze({
        DEFAULT_REFRESH_POLICY,
        SCORE_WEIGHTS,
        normalizeGame,
        normalizeGames,
        createCatalog,
        updateCatalog,
        mergeCatalog,
        clearCatalog,
        filterByChannel,
        selectFeaturedGame,
        shouldRefreshCatalog,
        createRefreshRequest,
        computeFeaturedScore,
        classifyTimeControl
    });
});
