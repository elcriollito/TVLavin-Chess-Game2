(function installNativePlayersPolicy(root) {
    'use strict';
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
        return value;
    };
    const names = [
        ['authentication-identity', 'native-identity-authority'], ['profile-boundaries', 'native-profile-authority'],
        ['presence', 'native-presence-authority'], ['challenges', 'native-challenge-authority'],
        ['matchmaking', 'native-matchmaking-authority'], ['game-session', 'native-game-session-authority'],
        ['server-clocks', 'native-clock-authority'], ['reconnection', 'native-reconnection-authority'],
        ['ratings-provenance', 'native-rating-authority'], ['moderation-reporting', 'native-moderation-authority'],
        ['blocking-safety', 'native-safety-authority'], ['privacy-consent', 'native-privacy-authority'],
        ['retention-deletion', 'native-data-governance-authority'], ['observability', 'native-operations-authority'],
        ['operational-rollback', 'native-release-authority'], ['availability-recovery', 'native-reliability-authority']
    ];
    const capabilities = freeze(names.map(([capabilityId, requiredOwner]) => ({
        capabilityId, requiredOwner, currentStatus: 'missing', securityGate: 'required-not-certified',
        privacyGate: 'required-not-certified', reliabilityGate: 'required-not-certified',
        testingGate: 'required-not-certified', publicActivationDependency: true
    })));
    const threats = freeze(['account-enumeration', 'impersonation', 'presence-leakage', 'challenge-spam',
        'matchmaking-abuse', 'rating-manipulation', 'clock-tampering', 'reconnect-hijacking', 'moderation-evasion',
        'personal-data-overexposure', 'cross-product-identity-confusion', 'fics-fallback-reintroduction']);
    const identityBoundaries = freeze({ authenticationIdentity: 'separate', publicChessProfile: 'separate',
        displayName: 'separate', ratingIdentity: 'separate', presence: 'separate', privateAccountData: 'separate' });
    const ratingGates = freeze(['defined-rating-system', 'game-eligibility', 'provisional-status', 'anti-abuse',
        'result-authority', 'auditability', 'uncertainty-policy', 'rollback-correction', 'product-approval']);
    const contract = {
        schemaVersion: '1.0.0', contractId: 'PlayV2NativePlayersPolicy@1.0.0', provider: 'caissa-native',
        currentRuntime: 'blocked', publicReady: false, routeAvailability: 'blocked', tabAvailability: 'omitted',
        runtimeResources: 'prohibited', fictionalUsers: 'prohibited', simulatedPresence: 'prohibited',
        fabricatedRatings: 'prohibited', simulatedChallenges: 'prohibited', fakeMatchmaking: 'prohibited',
        ficsProvider: 'prohibited', ficsFallback: 'prohibited', ficsIdentity: 'prohibited', ficsProfiles: 'prohibited',
        ficsPresence: 'prohibited', ficsRatings: 'prohibited', ficsLobby: 'prohibited', ficsSeeks: 'prohibited',
        ficsChallenges: 'prohibited', ficsMatchmaking: 'prohibited', ficsGameServer: 'prohibited',
        ficsClocks: 'prohibited', ficsReconnect: 'prohibited', ficsModeration: 'prohibited',
        analyticsTransport: 'disabled', activationRequiresNativeInfrastructureCertification: true,
        capabilities, identityBoundaries, ratingGates, threats
    };
    function normalized(value) {
        let text = String(value || '').slice(0, 2048);
        try { text = decodeURIComponent(text); } catch (_) { return null; }
        return text.replace(/\\/g, '/').replace(/\/{2,}/g, '/').toLowerCase();
    }
    function authorize(input = {}) {
        const type = String(input.type || ''); const value = normalized(input.value);
        if (!value || !['route', 'mode', 'resource', 'provider', 'state'].includes(type))
            return freeze({ allowed: false, reasonCode: 'INVALID_NATIVE_PLAYERS_REQUEST' });
        const playersRequest = /(?:^|[\/?#&=_-])players?(?:$|[\/?#&=_-])/.test(value);
        const ficsRequest = /(?:^|[\/?#&=_-])fics(?:$|[\/?#&=_-])/.test(value);
        if (playersRequest) return freeze({ allowed: false, reasonCode: 'PLAYERS_RUNTIME_BLOCKED' });
        if (ficsRequest) return freeze({ allowed: false, reasonCode: 'FICS_ROLE_PROHIBITED' });
        if (type === 'provider') return freeze({ allowed: false, reasonCode: 'NATIVE_INFRASTRUCTURE_MISSING' });
        return freeze({ allowed: true, reasonCode: 'NON_PLAYERS_REQUEST' });
    }
    function evaluateActivation(evidence = {}) {
        const certified = capabilities.every(item => evidence[item.capabilityId]?.owner === item.requiredOwner
            && evidence[item.capabilityId]?.status === 'certified');
        return freeze({ allowed: false, reasonCode: certified ? 'POLICY_VERSION_REQUIRES_EXPLICIT_ACTIVATION'
            : 'NATIVE_CAPABILITIES_MISSING', missingCapabilities: capabilities.filter(item =>
                evidence[item.capabilityId]?.owner !== item.requiredOwner || evidence[item.capabilityId]?.status !== 'certified')
                .map(item => item.capabilityId) });
    }
    root.CaissaPlayV2NativePlayersPolicy = freeze({ ...contract, authorize, evaluateActivation });
})(typeof window !== 'undefined' ? window : globalThis);
