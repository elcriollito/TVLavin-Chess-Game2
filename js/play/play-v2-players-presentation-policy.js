(function installPlayersPresentationPolicy(root) {
    'use strict';
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const contract = {
        schemaVersion: '1.0.0', contractId: 'PlayV2PlayersPresentationPolicy@1.0.0',
        currentPresentation: 'omitted', publicTab: 'prohibited', disabledTab: 'prohibited',
        comingSoonCard: 'prohibited-until-separate-approval', publicRoute: 'prohibited',
        informationalRoute: 'prohibited', playersPanel: 'prohibited', lobbyPresentation: 'prohibited',
        fictionalUsers: 'prohibited', simulatedPresence: 'prohibited', fabricatedRatings: 'prohibited',
        simulatedChallenges: 'prohibited', fakeMatchmaking: 'prohibited', ficsHandoff: 'prohibited',
        legacyPlayHandoff: 'prohibited', publicReady: false,
        activationRequiresNativeInfrastructureCertification: true, futurePresentationRequiresProductApproval: true,
        analyticsTransport: 'disabled'
    };
    function authorize(input = {}) {
        const type = String(input.type || '').toLowerCase();
        let value = String(input.value || '').slice(0, 2048);
        try { value = decodeURIComponent(value); } catch (_) {
            return freeze({ allowed: false, reasonCode: 'MALFORMED_PRESENTATION_REQUEST' });
        }
        value = value.replace(/\\/g, '/').replace(/\/{2,}/g, '/').toLowerCase();
        if (!['route', 'tab', 'panel', 'resource', 'copy', 'metadata', 'state', 'handoff'].includes(type))
            return freeze({ allowed: false, reasonCode: 'UNKNOWN_PRESENTATION_CHANNEL' });
        if (/(?:^|[\s\/?#&=_-])players?(?:$|[\s\/?#&=_-])/.test(value))
            return freeze({ allowed: false, reasonCode: 'PLAYERS_PRESENTATION_OMITTED' });
        if (/coming[\s_-]*soon|\bfics\b|legacy[\s_-]*play|lobby|matchmaking|presence|rating|challenge/.test(value))
            return freeze({ allowed: false, reasonCode: 'MULTIPLAYER_PRESENTATION_PROHIBITED' });
        return freeze({ allowed: true, reasonCode: 'NON_PLAYERS_PRESENTATION' });
    }
    function evaluateFuturePresentation(evidence = {}) {
        const nativeCertified = evidence.nativeInfrastructureCertification === 'certified';
        const productApproved = evidence.productApproval === 'approved';
        return freeze({ allowed: false, reasonCode: !nativeCertified ? 'NATIVE_INFRASTRUCTURE_UNCERTIFIED'
            : (!productApproved ? 'PRODUCT_APPROVAL_MISSING' : 'POLICY_VERSION_REQUIRES_EXPLICIT_ACTIVATION') });
    }
    root.CaissaPlayV2PlayersPresentationPolicy = freeze({ ...contract, authorize, evaluateFuturePresentation });
})(typeof window !== 'undefined' ? window : globalThis);
