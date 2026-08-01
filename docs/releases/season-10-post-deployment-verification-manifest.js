const freeze = value => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
};

export const season10PostDeploymentVerification = freeze({
    schemaVersion: 'Season10PostDeploymentVerification@1.0.0',
    releaseVersion: '10.0.0',
    stage: 'stage-0',
    status: 'verified-with-external-gates',
    verifiedCommit: '7cec9ea60289d32435849ffde736041f739126d6',
    deployment: {
        id: 'dpl_7V8f2vKBhjHbub5hAz5kQ7yeK8Pt',
        environment: 'production',
        state: 'READY',
        immutableUrl: 'tv-lavin-chess-game2-5svmjada3-elcriollitos-projects.vercel.app',
        publicUrl: 'https://www.caissa-chess.org',
        branch: 'main'
    },
    aliases: ['www.caissa-chess.org', 'caissa-chess.org', 'tv-lavin-chess-game2.vercel.app'],
    defaults: { homepage: 'classic', normalPlay: 'legacy', simplifiedPlay: 'qa-only' },
    featureGates: {
        games: 'qa-accessible', bots: 'qa-worker-dependent', coach: 'qa-foundation',
        mentor: 'qa-foundation', players: 'blocked', themes: 'qa-only',
        analyticsDiagnostics: 'local-bounded', analyticsTransport: 'disabled'
    },
    verifiedRoutes: ['/', '/yahoo-classic', '/play', '/play/games', '/about', '/help'],
    evidence: {
        http: 'pass', legacyCompatibility: 'pass', simplifiedCriticalPath: 'pass',
        singleBoardOwnership: 'pass', accessibilityAutomated: 'pass', responsiveEmulation: 'pass',
        playersBlocked: 'pass', analyticsTransportAbsent: 'pass', console: 'pass'
    },
    rollback: {
        state: 'ready-with-authorization',
        previousDeploymentId: 'dpl_2izmq53NpdJ4hneQoLfwPgrRfaUG',
        previousDeploymentUrl: 'tv-lavin-chess-game2-b6uu9n4uz-elcriollitos-projects.vercel.app',
        previousDeploymentState: 'READY',
        actionTaken: false
    },
    findings: { P0: [], P1DeploymentRegressions: [] },
    externalGates: ['physical-device-qa', 'screen-reader-qa', 'worker-production-certification'],
    warnings: ['immutable-deployment-url-requires-vercel-sso'],
    mutations: { deployment: false, aliases: false, defaults: false, runtime: false, analyticsTransport: false }
});
