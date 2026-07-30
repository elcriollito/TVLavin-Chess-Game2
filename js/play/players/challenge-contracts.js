(function installChallengeContracts(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const PROVIDERS = Object.freeze(['fics', 'local', 'future-caissa-network']);
    const DIRECTIONS = Object.freeze(['incoming', 'outgoing']);
    const STATES = Object.freeze([
        'created', 'pending', 'accepted', 'declined', 'canceled',
        'expired', 'connecting', 'active', 'disconnected', 'completed'
    ]);
    const TERMINAL_STATES = Object.freeze(['declined', 'canceled', 'expired', 'completed']);
    const ACTIONS = Object.freeze(['submit', 'accept', 'decline', 'cancel', 'reconnect', 'open-provider', 'dismiss']);
    const EVENTS = Object.freeze([
        'CHALLENGE_CREATED', 'CHALLENGE_SUBMITTED', 'PROVIDER_PENDING',
        'PROVIDER_ACCEPTED', 'PROVIDER_DECLINED', 'CHALLENGE_CANCELED',
        'CHALLENGE_EXPIRED', 'PROVIDER_CONNECTING', 'PROVIDER_ACTIVE',
        'PROVIDER_DISCONNECTED', 'PROVIDER_RECONNECTED', 'PROVIDER_COMPLETED',
        'PROVIDER_FAILED', 'DISMISSED'
    ]);
    const RATINGS = Object.freeze(['rated', 'casual', 'unknown']);
    const COLORS = Object.freeze(['white', 'black', 'random', 'provider-assigned', 'unknown']);
    const VARIANTS = Object.freeze(['standard', 'unknown']);
    const CONFIDENCE = Object.freeze(['provider', 'local-observed', 'derived', 'stale']);
    const ID = /^[a-z0-9][a-z0-9:_-]{0,95}$/;
    const PROVIDER_REF = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,63}$/;
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const safeObject = value => value && typeof value === 'object' && !Array.isArray(value)
        && !['__proto__', 'prototype', 'constructor'].some(key => Object.prototype.hasOwnProperty.call(value, key));
    const text = (value, max) => typeof value === 'string' && value.trim().length > 0
        && value.trim().length <= max && !/[\u0000-\u001f<>]/.test(value) ? value.trim() : null;
    const time = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Math.floor(Number(value)) : null;
    function identity(value, provider) {
        const normalized = text(value, 96)?.toLowerCase();
        return normalized && ID.test(normalized) && normalized.startsWith(`${provider}:`) ? normalized : null;
    }
    function timeControl(value, imported = false) {
        if (value == null && imported) return null;
        if (!safeObject(value)) return null;
        const initialSeconds = Number(value.initialSeconds);
        const incrementSeconds = Number(value.incrementSeconds);
        if (!Number.isInteger(initialSeconds) || initialSeconds < 0 || initialSeconds > 86400 ||
            !Number.isInteger(incrementSeconds) || incrementSeconds < 0 || incrementSeconds > 600) return null;
        const category = ['bullet', 'blitz', 'rapid', 'classical', 'untimed', 'unknown'].includes(value.category)
            ? value.category : null;
        const providerRepresentation = value.providerRepresentation == null
            ? null : text(value.providerRepresentation, 32);
        if (!category || value.providerRepresentation != null && !providerRepresentation) return null;
        return freeze({ initialSeconds, incrementSeconds, category, providerRepresentation });
    }
    function capabilities(value = {}) {
        if (!safeObject(value)) return null;
        return freeze({
            submit: value.submit === true, accept: value.accept === true,
            decline: value.decline === true, cancel: value.cancel === true,
            reconnect: value.reconnect === true, activeGame: value.activeGame === true
        });
    }
    function normalizeRequest(input, options = {}) {
        if (!safeObject(input) || input.schemaVersion && input.schemaVersion !== SCHEMA_VERSION) return null;
        const provider = text(input.provider, 32)?.toLowerCase();
        const requestId = text(input.requestId, 64)?.toLowerCase();
        const direction = DIRECTIONS.includes(input.direction) ? input.direction : null;
        const challengerId = identity(input.challengerId, provider);
        const challengedId = identity(input.challengedId, provider);
        const createdAt = time(input.createdAt);
        const expiresAt = input.expiresAt == null ? null : time(input.expiresAt);
        const providerReference = input.providerReference == null ? null : text(input.providerReference, 64);
        const control = timeControl(input.timeControl, options.imported === true);
        const caps = capabilities(input.capabilities);
        if (!PROVIDERS.includes(provider) || !requestId || !ID.test(requestId) || !direction ||
            !challengerId || !challengedId || challengerId === challengedId || !createdAt ||
            expiresAt != null && expiresAt <= createdAt || providerReference != null && !PROVIDER_REF.test(providerReference) ||
            !control && !(options.imported === true && input.timeControl == null) || !caps) return null;
        const rated = RATINGS.includes(input.rated) ? input.rated : 'unknown';
        const colorPreference = COLORS.includes(input.colorPreference) ? input.colorPreference : 'unknown';
        const variant = VARIANTS.includes(input.variant) ? input.variant : null;
        if (!variant || variant === 'unknown' && options.imported !== true) return null;
        return freeze({
            schemaVersion: SCHEMA_VERSION, requestId, provider, direction,
            challengerId, challengedId, timeControl: control, rated,
            colorPreference, variant, createdAt, expiresAt, providerReference,
            capabilities: caps
        });
    }
    function normalizeEvent(input) {
        if (!safeObject(input) || input.schemaVersion && input.schemaVersion !== SCHEMA_VERSION) return null;
        const challengeId = text(input.challengeId, 96)?.toLowerCase();
        const provider = text(input.provider, 32)?.toLowerCase();
        const eventType = EVENTS.includes(input.eventType) ? input.eventType : null;
        const observedAt = time(input.observedAt);
        const providerTimestamp = input.providerTimestamp == null ? null : time(input.providerTimestamp);
        const sourceConfidence = CONFIDENCE.includes(input.sourceConfidence) ? input.sourceConfidence : null;
        const reasonCode = input.reasonCode == null ? null : text(input.reasonCode, 48);
        const correlationId = input.correlationId == null ? null : text(input.correlationId, 64);
        if (!challengeId || !ID.test(challengeId) || !PROVIDERS.includes(provider) ||
            !challengeId.startsWith(`${provider}:`) || !eventType || !observedAt || !sourceConfidence ||
            input.providerTimestamp != null && !providerTimestamp ||
            input.reasonCode != null && !reasonCode || input.correlationId != null && !correlationId) return null;
        return freeze({
            schemaVersion: SCHEMA_VERSION, challengeId, provider, eventType,
            observedAt, providerTimestamp, sourceConfidence, reasonCode, correlationId
        });
    }
    function normalizeRecord(input) {
        if (!safeObject(input) || input.schemaVersion && input.schemaVersion !== SCHEMA_VERSION) return null;
        const provider = text(input.provider, 32)?.toLowerCase();
        const challengeId = text(input.challengeId, 96)?.toLowerCase();
        const providerChallengeId = input.providerChallengeId == null ? null : text(input.providerChallengeId, 64);
        const direction = DIRECTIONS.includes(input.direction) ? input.direction : null;
        const challengerId = identity(input.challengerId, provider);
        const challengedId = identity(input.challengedId, provider);
        const challengerName = text(input.challengerName, 64);
        const challengedName = text(input.challengedName, 64);
        const state = STATES.includes(input.state) ? input.state : null;
        const control = timeControl(input.timeControl, true);
        const createdAt = time(input.createdAt), updatedAt = time(input.updatedAt);
        const optionalTimes = {};
        for (const key of ['expiresAt', 'acceptedAt', 'connectedAt', 'activeAt', 'completedAt']) {
            optionalTimes[key] = input[key] == null ? null : time(input[key]);
            if (input[key] != null && !optionalTimes[key]) return null;
        }
        const availableActions = Array.isArray(input.availableActions) && input.availableActions.length <= ACTIONS.length
            && input.availableActions.every((action, index, all) => ACTIONS.includes(action) && all.indexOf(action) === index)
            ? freeze([...input.availableActions]) : null;
        const caps = capabilities(input.capabilities);
        const sourceConfidence = CONFIDENCE.includes(input.sourceConfidence) ? input.sourceConfidence : null;
        const terminalReason = input.terminalReason == null ? null : text(input.terminalReason, 48);
        if (!PROVIDERS.includes(provider) || !challengeId || !ID.test(challengeId) ||
            !challengeId.startsWith(`${provider}:`) || providerChallengeId != null && !PROVIDER_REF.test(providerChallengeId) ||
            !direction || !challengerId || !challengedId || !challengerName || !challengedName ||
            /@|(?:\d{1,3}\.){3}\d{1,3}/.test(`${challengerName} ${challengedName}`) ||
            !state || !createdAt || !updatedAt || updatedAt < createdAt || !availableActions || !caps || !sourceConfidence ||
            input.terminalReason != null && !terminalReason ||
            (TERMINAL_STATES.includes(state) || sourceConfidence === 'stale' || input.variant === 'unknown') && availableActions.length ||
            direction === 'outgoing' && availableActions.some(action => action === 'accept' || action === 'decline') ||
            direction === 'incoming' && availableActions.includes('cancel'))
            return null;
        return freeze({
            schemaVersion: SCHEMA_VERSION, challengeId, provider, providerChallengeId,
            direction, challengerId, challengedId, challengerName, challengedName,
            state, timeControl: control,
            rated: RATINGS.includes(input.rated) ? input.rated : 'unknown',
            colorPreference: COLORS.includes(input.colorPreference) ? input.colorPreference : 'unknown',
            variant: VARIANTS.includes(input.variant) ? input.variant : 'unknown',
            createdAt, updatedAt, ...optionalTimes,
            terminalReason,
            availableActions, capabilities: caps, sourceConfidence,
            lastEventType: EVENTS.includes(input.lastEventType) ? input.lastEventType : null
        });
    }
    const shared = freeze({
        schemaVersion: SCHEMA_VERSION, providers: PROVIDERS, directions: DIRECTIONS,
        states: STATES, terminalStates: TERMINAL_STATES, actions: ACTIONS,
        events: EVENTS, ratings: RATINGS, colors: COLORS, variants: VARIANTS,
        sourceConfidence: CONFIDENCE
    });
    global.CaissaChallengeRequest = Object.freeze({ ...shared, normalize: normalizeRequest });
    global.CaissaChallengeEvent = Object.freeze({ ...shared, normalize: normalizeEvent });
    global.CaissaChallengeRecord = Object.freeze({ ...shared, normalize: normalizeRecord });
})(typeof window !== 'undefined' ? window : globalThis);
