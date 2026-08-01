const deepFreeze = value => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(deepFreeze); Object.freeze(value);
    }
    return value;
};

export const season10ReleaseReadiness = deepFreeze({
    schemaVersion: 'Season10ReleaseReadiness@1.0.0',
    baseline: '1442b88562199fa23faf9f22884b9aa025216cf0',
    originBaseline: 'eb0511043dd397ac6ff50f05b4e67a84144b5d78',
    commitCount: 56,
    automatedStatus: 'passed', securityStatus: 'passed-local', privacyStatus: 'passed-local',
    performanceStatus: 'passed-local', accessibilityStatus: 'manual-certification-pending',
    externalStatus: 'pending', manualStatus: 'pending', productionEligibility: 'blocked',
    recommendedStage: 'stage-0', classification: 'READY WITH BLOCKERS',
    defaults: { homepage: 'classic', play: 'legacy', simplifiedPlay: 'qa-only', players: 'blocked', analyticsTransport: 'disabled' },
    commitIds: ['32a1487','4255936','d7ee0f4','d16e21f','6b0c479','de18901','d90dd2c','b21477d','cf6a18f','f059945','9bb30b9','2b2e1a0','ba8b420','617cef7','c88395f','ca50e09','a583cbc','8cdee55','a3f824c','8392c34','25bb006','7653463','6de7c6f','5b8b698','d9d51e1','548e8ce','2491221','727e2ca','806a3ef','6872a58','6b2f19d','b880468','e529798','d2a60a8','a15dfb9','8185e9d','50a7f83','b9f800f','0f4e749','d675c4e','80474ed','031c79e','87d5b01','4cf42a9','67f3e78','5e0692b','3eeaf3e','3cd56a5','f94d689','db85284','88223cb','5a655ed','4c678dc','9d67e64','f798810','1442b88'],
    blockers: [
        { priority: 'P1', id: 'simplified-play-public-beta', status: 'open' },
        { priority: 'P1', id: 'worker-production-configuration', status: 'open' },
        { priority: 'P1', id: 'physical-device-qa', status: 'open' },
        { priority: 'P1', id: 'screen-reader-qa', status: 'open' },
        { priority: 'P2', id: 'players-production-eligibility', status: 'open' },
        { priority: 'P2', id: 'analytics-consent-and-sink', status: 'open' },
        { priority: 'P2', id: 'fics-gateway-certification', status: 'open' },
        { priority: 'P2', id: 'tablebase-network-certification', status: 'open' },
        { priority: 'P2', id: 'unsupported-performance-field-metrics', status: 'open' },
        { priority: 'P2', id: 'repetition-fifty-move-ui-characterization', status: 'open' },
        { priority: 'P3', id: 'field-analytics', status: 'accepted' }
    ],
    warnings: ['local-evidence-is-not-production-certification','external-and-manual-gates-remain-open']
});
