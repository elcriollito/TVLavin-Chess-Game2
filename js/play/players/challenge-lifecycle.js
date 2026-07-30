(function installChallengeLifecycle(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const TRANSITIONS = Object.freeze({
        created: Object.freeze({ CHALLENGE_SUBMITTED: 'pending', PROVIDER_PENDING: 'pending', CHALLENGE_CANCELED: 'canceled', CHALLENGE_EXPIRED: 'expired' }),
        pending: Object.freeze({ PROVIDER_ACCEPTED: 'accepted', PROVIDER_DECLINED: 'declined', CHALLENGE_CANCELED: 'canceled', CHALLENGE_EXPIRED: 'expired', PROVIDER_DISCONNECTED: 'disconnected' }),
        accepted: Object.freeze({ PROVIDER_CONNECTING: 'connecting', PROVIDER_ACTIVE: 'active', CHALLENGE_CANCELED: 'canceled', PROVIDER_DISCONNECTED: 'disconnected' }),
        connecting: Object.freeze({ PROVIDER_ACTIVE: 'active', PROVIDER_DISCONNECTED: 'disconnected', CHALLENGE_EXPIRED: 'expired' }),
        active: Object.freeze({ PROVIDER_COMPLETED: 'completed', PROVIDER_DISCONNECTED: 'disconnected' }),
        disconnected: Object.freeze({ PROVIDER_RECONNECTED: 'connecting', PROVIDER_ACTIVE: 'active', PROVIDER_COMPLETED: 'completed', CHALLENGE_EXPIRED: 'expired' }),
        declined: Object.freeze({}), canceled: Object.freeze({}), expired: Object.freeze({}), completed: Object.freeze({})
    });
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const result = (ok, reasonCode, value = null) => freeze({ ok, reasonCode, value });
    function actionsFor(record) {
        if (!record || global.CaissaChallengeRecord.terminalStates.includes(record.state) ||
            record.sourceConfidence === 'stale') return freeze([]);
        const actions = [];
        if (record.state === 'created' && record.direction === 'outgoing' && record.capabilities.submit) actions.push('submit');
        if (record.state === 'pending' && record.direction === 'incoming') {
            if (record.capabilities.accept) actions.push('accept');
            if (record.capabilities.decline) actions.push('decline');
        }
        if (['created', 'pending', 'accepted'].includes(record.state) &&
            record.direction === 'outgoing' && record.capabilities.cancel) actions.push('cancel');
        if (record.state === 'disconnected' && record.capabilities.reconnect) actions.push('reconnect');
        if (record.state === 'active' && record.capabilities.activeGame) actions.push('open-provider');
        return freeze(actions);
    }
    function createChallenge(input) {
        const request = global.CaissaChallengeRequest?.normalize?.(input);
        if (!request) return result(false, 'INVALID_REQUEST');
        const challengeId = `${request.provider}:${request.providerReference || request.requestId}`;
        const record = global.CaissaChallengeRecord.normalize({
            ...request, challengeId, providerChallengeId: request.providerReference,
            challengerName: input.challengerName, challengedName: input.challengedName,
            state: 'created', updatedAt: request.createdAt,
            acceptedAt: null, connectedAt: null, activeAt: null, completedAt: null,
            terminalReason: null, availableActions: [], sourceConfidence: 'local-observed',
            lastEventType: 'CHALLENGE_CREATED'
        });
        if (!record) return result(false, 'INVALID_REQUEST');
        return result(true, 'CHALLENGE_CREATED', withActions(record));
    }
    function transition(recordInput, eventInput) {
        const record = global.CaissaChallengeRecord?.normalize?.(recordInput);
        const event = global.CaissaChallengeEvent?.normalize?.(eventInput);
        if (!record || !event || record.challengeId !== event.challengeId || record.provider !== event.provider)
            return result(false, 'INVALID_TRANSITION');
        if (event.observedAt < record.updatedAt) return result(false, 'STALE_EVENT', record);
        const target = TRANSITIONS[record.state]?.[event.eventType];
        if (!target) {
            if (record.lastEventType === event.eventType || record.state === target)
                return result(true, 'DUPLICATE_SUPPRESSED', record);
            return result(false, global.CaissaChallengeRecord.terminalStates.includes(record.state)
                ? 'TERMINAL_STATE' : 'INVALID_TRANSITION', record);
        }
        const providerEvent = event.eventType.startsWith('PROVIDER_');
        if (providerEvent && event.sourceConfidence !== 'provider') return result(false, 'PROVIDER_EVIDENCE_REQUIRED', record);
        const timestamps = {
            acceptedAt: target === 'accepted' ? event.observedAt : record.acceptedAt,
            connectedAt: target === 'connecting' ? event.observedAt : record.connectedAt,
            activeAt: target === 'active' ? event.observedAt : record.activeAt,
            completedAt: target === 'completed' ? event.observedAt : record.completedAt
        };
        const next = global.CaissaChallengeRecord.normalize({
            ...record, state: target, updatedAt: event.observedAt, ...timestamps,
            terminalReason: global.CaissaChallengeRecord.terminalStates.includes(target) ? event.reasonCode : null,
            sourceConfidence: event.sourceConfidence, lastEventType: event.eventType,
            availableActions: []
        });
        return next ? result(true, 'TRANSITION_ACCEPTED', withActions(next))
            : result(false, 'INVALID_TRANSITION', record);
    }
    function withActions(record) {
        return global.CaissaChallengeRecord.normalize({ ...record, availableActions: actionsFor(record) });
    }
    function expireRecord(recordInput, now, options = {}) {
        const record = global.CaissaChallengeRecord?.normalize?.(recordInput);
        if (!record || !Number.isFinite(now) || now <= 0) return result(false, 'INVALID_EXPIRY');
        if (global.CaissaChallengeRecord.terminalStates.includes(record.state) || record.state === 'active')
            return result(true, 'UNCHANGED', record);
        if (record.expiresAt == null || now <= record.expiresAt) return result(true, 'UNCHANGED', record);
        if (now < record.updatedAt - (options.maxClockSkewMs ?? 5000)) return result(false, 'CLOCK_SKEW', record);
        if (!['created', 'pending'].includes(record.state))
            return result(true, 'UNCHANGED', record);
        return transition(record, {
            challengeId: record.challengeId, provider: record.provider,
            eventType: 'CHALLENGE_EXPIRED', observedAt: now, providerTimestamp: null,
            sourceConfidence: 'derived', reasonCode: 'EXPIRY_POLICY', correlationId: null
        });
    }
    global.CaissaChallengeLifecycle = Object.freeze({
        schemaVersion: SCHEMA_VERSION, transitionTable: TRANSITIONS,
        createChallenge, transition, actionsFor, expireRecord
    });
})(typeof window !== 'undefined' ? window : globalThis);
