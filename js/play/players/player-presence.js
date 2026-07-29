(function installPlayerPresence(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const STATUSES = Object.freeze(['online', 'available', 'seeking', 'playing', 'observing', 'idle', 'away', 'disconnected', 'offline', 'stale', 'unknown']);
    const RATING_TYPES = Object.freeze(['blitz', 'standard', 'lightning', 'rapid', 'classical', 'unrated', 'unknown']);
    const FRIEND_STATES = Object.freeze(['friend', 'not-friend', 'pending', 'blocked', 'unsupported', 'unknown']);
    const CHALLENGE_STATES = Object.freeze(['available', 'provider-only', 'unavailable', 'connection-required', 'sign-in-required', 'unknown']);
    const CONFIDENCE = Object.freeze(['direct', 'derived', 'stale', 'unknown']);
    const PROVIDERS = Object.freeze(['fics', 'local', 'future-caissa-network']);
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const safeText = (value, max) => typeof value === 'string' && value.trim() &&
        value.trim().length <= max && !/[\u0000-\u001f<>]/.test(value) ? value.trim() : null;
    function normalize(input, options = {}) {
        if (!input || typeof input !== 'object' || Array.isArray(input) ||
            input.schemaVersion && input.schemaVersion !== SCHEMA_VERSION) return null;
        const provider = safeText(input.provider, 32)?.toLowerCase();
        if (!PROVIDERS.includes(provider)) return null;
        const rawId = safeText(input.providerPlayerId, 64);
        const displayName = safeText(input.displayName, 64);
        if (!rawId || !displayName || !/^[a-zA-Z0-9_-]+$/.test(rawId) ||
            /@|(?:\d{1,3}\.){3}\d{1,3}/.test(displayName)) return null;
        const providerPlayerId = rawId.toLowerCase();
        const observedAt = Number(input.observedAt);
        const providerTimestamp = Number(input.providerTimestamp);
        const freshness = global.CaissaPresenceFreshnessPolicy?.evaluate?.(
            providerTimestamp, observedAt, options.freshnessPolicy);
        if (!freshness) return null;
        let status = STATUSES.includes(input.status) ? input.status : 'unknown';
        let challengeAvailability = CHALLENGE_STATES.includes(input.challengeAvailability)
            ? input.challengeAvailability : 'unknown';
        let sourceConfidence = CONFIDENCE.includes(input.sourceConfidence) ? input.sourceConfidence : 'unknown';
        if (freshness.status === 'stale' || freshness.status === 'expired') {
            status = 'stale'; challengeAvailability = 'unavailable'; sourceConfidence = 'stale';
        }
        const rating = normalizeRating(input.rating, provider);
        if (input.rating != null && !rating) return null;
        const country = input.country == null ? null : safeText(input.country, 3)?.toUpperCase();
        if (input.country != null && !/^[A-Z]{2,3}$/.test(country || '')) return null;
        const title = input.title == null ? null : safeText(input.title, 16);
        if (input.title != null && !title) return null;
        const controls = normalizeControls(input.preferredTimeControls);
        if (!controls) return null;
        const lastSeenAt = input.lastSeenAt == null ? null : Number(input.lastSeenAt);
        if (lastSeenAt != null && (!Number.isFinite(lastSeenAt) || lastSeenAt <= 0 || lastSeenAt > observedAt)) return null;
        return freeze({
            schemaVersion: SCHEMA_VERSION,
            presenceId: `${provider}:${providerPlayerId}`,
            provider, providerPlayerId, displayName, rating, title, status,
            preferredTimeControls: controls, country,
            friendState: FRIEND_STATES.includes(input.friendState) ? input.friendState : 'unsupported',
            guest: typeof input.guest === 'boolean' ? input.guest : null,
            lastSeenAt, providerTimestamp, observedAt, freshness,
            challengeAvailability,
            capabilities: freeze({
                challengeEntry: input.capabilities?.challengeEntry === true,
                presenceOnly: true
            }),
            sourceConfidence
        });
    }
    function normalizeRating(input, provider) {
        if (input == null) return null;
        const value = Number(input.value);
        const ratingType = RATING_TYPES.includes(input.ratingType) ? input.ratingType : null;
        if (!Number.isInteger(value) || value < 0 || value > 4000 || !ratingType) return null;
        return freeze({ value, ratingType, provisional: input.provisional === true, provider });
    }
    function normalizeControls(input) {
        if (input == null) return freeze([]);
        if (!Array.isArray(input) || input.length > 8) return null;
        const result = [];
        for (const item of input) {
            const baseSeconds = Number(item?.baseSeconds), incrementSeconds = Number(item?.incrementSeconds);
            if (!Number.isInteger(baseSeconds) || baseSeconds < 0 || baseSeconds > 86400 ||
                !Number.isInteger(incrementSeconds) || incrementSeconds < 0 || incrementSeconds > 600) return null;
            result.push(freeze({ baseSeconds, incrementSeconds }));
        }
        return freeze(result);
    }
    function validate(input, options) {
        const value = normalize(input, options);
        return freeze({ ok: !!value, reasonCode: value ? 'PRESENCE_VALID' : 'INVALID_PRESENCE', value });
    }
    global.CaissaPlayerPresence = Object.freeze({
        schemaVersion: SCHEMA_VERSION, statuses: STATUSES, ratingTypes: RATING_TYPES,
        friendStates: FRIEND_STATES, challengeStates: CHALLENGE_STATES,
        sourceConfidence: CONFIDENCE, providers: PROVIDERS, normalize, validate
    });
})(typeof window !== 'undefined' ? window : globalThis);
