(function installHumanPlayProviderMatrix(global) {
    'use strict';
    const VERSION = '1.0.0';
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const none = freeze({
        presence: 'unsupported', challenges: 'unsupported', games: 'unsupported',
        clock: 'unavailable', move: 'unavailable', result: 'unavailable',
        reconnect: 'unavailable', rated: 'unsupported', casual: 'unsupported',
        spectator: 'unsupported', postGame: 'contract-ready'
    });
    const records = freeze([
        {
            provider: 'fics', providerType: 'external-provider',
            runtimeOwner: 'fics', connectionOwner: 'fics', identityOwner: 'fics',
            support: {
                presence: 'unavailable', challenges: 'unavailable', games: 'provider-owned',
                clock: 'provider-owned', move: 'provider-owned', result: 'provider-owned',
                reconnect: 'provider-owned', rated: 'provider-owned', casual: 'provider-owned',
                spectator: 'provider-owned', postGame: 'provider-owned'
            },
            simplifiedPlayHandoff: 'blocked', productionReadiness: 'provider-entry',
            relationship: 'real external provider; normalized Players streams unavailable'
        },
        {
            provider: 'caissa-classic', providerType: 'presentation',
            runtimeOwner: 'fics', connectionOwner: 'fics', identityOwner: 'fics',
            support: {
                presence: 'presentation-only', challenges: 'presentation-only',
                games: 'presentation-only', clock: 'presentation-only', move: 'presentation-only',
                result: 'presentation-only', reconnect: 'presentation-only',
                rated: 'presentation-only', casual: 'presentation-only',
                spectator: 'presentation-only', postGame: 'presentation-only'
            },
            simplifiedPlayHandoff: 'blocked', productionReadiness: 'provider-entry',
            relationship: 'CAISSA presentation over the existing FICS runtime'
        },
        {
            provider: 'local', providerType: 'local-unavailable',
            runtimeOwner: 'unassigned', connectionOwner: 'none', identityOwner: 'none',
            support: none, simplifiedPlayHandoff: 'unsupported',
            productionReadiness: 'unsupported', relationship: 'no approved local human runtime'
        },
        {
            provider: 'future-caissa-network', providerType: 'future-contract',
            runtimeOwner: 'none', connectionOwner: 'none', identityOwner: 'none',
            support: { ...none, presence: 'coming-later', challenges: 'coming-later',
                rated: 'coming-later', casual: 'coming-later' },
            simplifiedPlayHandoff: 'blocked', productionReadiness: 'contract-ready',
            relationship: 'contracts only; no backend, authority, or matchmaking'
        }
    ]);
    global.CaissaHumanPlayProviderMatrix = freeze({
        schemaVersion: VERSION, records,
        get: provider => records.find(record => record.provider === provider) || null
    });
})(typeof window !== 'undefined' ? window : globalThis);
