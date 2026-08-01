const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
export const season10ReleasePackage = freeze({
    schemaVersion: 'Season10ReleasePackage@1.0.0', releaseName: 'CAISSA Simplified Play Season 10', releaseVersion: '10.0.0', season: '10',
    status: 'prepared-not-deployed', recommendedStage: 'stage-0-package',
    originBaseline: 'eb0511043dd397ac6ff50f05b4e67a84144b5d78', sourceHead: '5132b34010339acf715e9359dfc239d861778755',
    packagingCommit: 'manifest-owner-commit', commitRange: 'eb0511043dd397ac6ff50f05b4e67a84144b5d78..5132b34010339acf715e9359dfc239d861778755', commitCount: 57,
    readinessClassification: 'READY WITH BLOCKERS',
    defaults: { homepage: 'classic', normalPlay: 'legacy', simplifiedPlay: 'qa-only' },
    featureGates: { games: 'qa-accessible', bots: 'qa-worker-dependent', coach: 'qa-foundation', mentor: 'qa-foundation', players: 'blocked', themes: 'qa-only', analyticsDiagnostics: 'local-bounded', analyticsTransport: 'disabled' },
    includedSubsystems: ['board-first-shell','games','evaluation-rail','fair-play','lifecycle','clocks','game-record','persistence','postgame','analyze-handoff','bots-foundation','coach-foundation','mentor-foundation','guided-replay','knowledge-mapping','mentor-summary','players-blocked-scaffolding','visual-components','themes','accessibility','worker-lifecycle','lazy-loading','event-lifecycle','performance-budgets','tests','local-analytics','analytics-governance','release-readiness'],
    excludedActivations: ['players-runtime','analytics-transport','production-consent','default-migration','public-beta','uncertified-external-integrations','field-analytics','physical-device-certification-claims','screen-reader-certification-claims'],
    blockers: { P0: [], P1: ['simplified-play-public-beta','worker-production-configuration','physical-device-qa','screen-reader-qa'], P2: ['players-production-eligibility','analytics-consent-and-sink','fics-gateway-certification','tablebase-network-certification','unsupported-performance-field-metrics','repetition-fifty-move-ui-characterization'], P3: ['field-analytics'] },
    rollback: { productionBaseline: 'eb0511043dd397ac6ff50f05b4e67a84144b5d78', readinessBaseline: '5132b34010339acf715e9359dfc239d861778755', previousDeploymentId: 'unknown', preference: 'restore-prior-verified-alias' },
    verification: ['git-identity','deployment-ready','alias-commit','classic-default','legacy-play-default','simplified-qa-only','players-blocked','analytics-network-absent','board-single-owner','worker-health','console-clean','rollback-ready'],
    integrity: { algorithm: 'sha256', canonicalization: 'utf8-json-stable-key-order', timestampPolicy: 'none', checksum: 'cb911f49e9fc80701bf22a68cc92433d2d8e13ca3a82afe12d7a3fdae00d1ed5', releaseId: 'rel-season-10-cb911f49e9fc8070' }
});
