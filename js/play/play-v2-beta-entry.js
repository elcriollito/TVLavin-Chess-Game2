(function installPlayV2BetaEntry(root) {
    'use strict';

    const VERSION = '1.0.0';
    const CONTRACT_ID = `PlayV2BetaEntry@${VERSION}`;
    if (root.CaissaPlayV2BetaEntry?.contractId === CONTRACT_ID) return;

    const contract = {
        schemaVersion: VERSION,
        contractId: CONTRACT_ID,
        canonicalRoute: '/play/beta',
        entryDocument: 'play-v2.html',
        currentStage: 'internal',
        publicNavigation: 'prohibited',
        publicEnrollment: 'prohibited',
        defaultPlayReplacement: 'prohibited',
        homepageReplacement: 'prohibited',
        legacyPlayFallback: 'prohibited',
        ficsFallback: 'prohibited',
        playersRuntime: 'blocked',
        coachRuntime: 'allowed-internal-assistance-pending',
        mentorRuntime: 'blocked',
        gamesRuntime: 'allowed-internal',
        botsRuntime: 'allowed-internal-uncertified',
        analyticsTransport: 'disabled',
        failureMode: 'fail-closed',
        rollbackOwner: 'beta-entry-gate'
    };
    root.CaissaPlayV2BetaEntry = Object.freeze(contract);
})(typeof window !== 'undefined' ? window : globalThis);
