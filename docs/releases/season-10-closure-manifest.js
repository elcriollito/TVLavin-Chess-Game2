const freeze = value => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(freeze); Object.freeze(value);
    }
    return value;
};

export const season10Closure = freeze({
    schemaVersion: 'Season10Closure@1.0.0',
    season: '10',
    releaseVersion: '10.0.0',
    releaseId: 'rel-season-10-cb911f49e9fc8070',
    packageChecksum: 'cb911f49e9fc80701bf22a68cc92433d2d8e13ca3a82afe12d7a3fdae00d1ed5',
    productionCommit: '7cec9ea60289d32435849ffde736041f739126d6',
    productionDeploymentId: 'dpl_7V8f2vKBhjHbub5hAz5kQ7yeK8Pt',
    rollbackDeploymentId: 'dpl_2izmq53NpdJ4hneQoLfwPgrRfaUG',
    localVerificationCommit: '543f4691e3624d8093153e35292f49a9fbba29e3',
    closureCommitPolicy: { message: 'docs(play): close season 10', localOnly: true, expectedAhead: 2, expectedBehind: 0 },
    defaults: { homepage: 'classic', normalPlay: 'legacy', simplifiedPlay: 'qa-only' },
    featureStates: {
        games: 'qa-accessible', bots: 'qa-worker-dependent', coach: 'qa-foundation', mentor: 'qa-foundation',
        players: 'production-blocked', themes: 'qa-only', analyticsDiagnostics: 'local-bounded',
        analyticsTransport: 'disabled', nativeMultiplayer: 'deferred', ficsForPlayV2: 'prohibited'
    },
    definitionOfDone: {
        boardDominatesPlay: 'complete', sharedShell: 'complete-with-gate', evaluationRail: 'complete',
        centralizedHumanFairPlay: 'complete', sharedLifecycle: 'complete', postGameAnalysis: 'complete',
        mentorReview: 'complete-with-gate', mobileUsable: 'complete-with-gate', compatibilityPreserved: 'complete',
        resourceOwnership: 'complete', automatedTests: 'complete', productionDeployment: 'complete'
    },
    risks: {
        P1: ['beta-authorization','production-worker','physical-device-qa','screen-reader-qa'],
        P2: ['native-multiplayer','analytics-consent-and-sink','fics-separate-experience-certification','tablebase-certification','field-performance','repetition-fifty-move-ui'],
        P3: ['field-play-analytics']
    },
    deferredWork: ['public-beta-readiness','caissa-native-multiplayer','governed-analytics-transport','external-integration-certification','content-and-rule-ui-maturity'],
    frozenDecisions: ['board-first-shell','single-board-and-lifecycle','central-fair-play','postgame-analysis-mentor-bridge','mentor-observational','analytics-transport-disabled','play-v2-caissa-native','no-fics-provider-or-fallback','players-runtime-deferred','no-fictitious-player-network'],
    nextSeason: { id: '11', name: 'SIMPLIFIED PLAY PUBLIC BETA READINESS', firstTask: 'SEASON 11.0.1 — PUBLIC BETA READINESS AUDIT' },
    laterSeasons: [{ id: '12', name: 'CAISSA NATIVE COMMUNITY AND MULTIPLAYER', ficsProvider: false }],
    status: 'closed-stage-0-verified'
});
