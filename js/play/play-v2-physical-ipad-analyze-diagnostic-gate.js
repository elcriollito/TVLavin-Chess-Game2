export const PLAY_V2_PHYSICAL_IPAD_ANALYZE_DIAGNOSTIC = Object.freeze({
    contractId: 'PlayV2PhysicalIpadAnalyzeDiagnosticPolicy@1.1.0',
    canonicalRoute: '/play/beta/qa/ipad-analyze-diagnostic',
    modeRoutes: Object.freeze({
        games: '/play/beta/qa/ipad-analyze-diagnostic',
        bots: '/play/beta/qa/ipad-analyze-diagnostic/bots',
        coach: '/play/beta/qa/ipad-analyze-diagnostic/coach'
    }),
    entryDocument: 'play-v2-ipad-analyze-diagnostic.html',
    requiredStage: 'internal',
    requiredCapability: 'ipad-analyze-diagnostic',
    failureMode: 'fail-closed'
});

export function resolvePlayV2PhysicalIpadAnalyzeDiagnostic(pathname, search, environment = {}) {
    const policy = PLAY_V2_PHYSICAL_IPAD_ANALYZE_DIAGNOSTIC;
    const value = String(pathname || '');
    const mode = Object.entries(policy.modeRoutes).find(([, route]) => value === route)?.[0] || null;
    const exact = mode !== null;
    const direct = value === `/${policy.entryDocument}`;
    const requested = exact || direct || value.startsWith(`${policy.canonicalRoute}/`);
    if (!requested) return Object.freeze({ requested: false, authorized: false, document: null });
    const authorized = exact && !direct && String(search || '') === ''
        && environment.CAISSA_PLAY_V2_BETA_STAGE === policy.requiredStage
        && environment.CAISSA_PLAY_V2_PHYSICAL_QA === policy.requiredCapability;
    return Object.freeze({ requested: true, authorized, mode,
        document: authorized ? policy.entryDocument : 'play-v2-unavailable.html',
        reasonCode: authorized ? 'IPAD_ANALYZE_DIAGNOSTIC_ALLOWED' : 'IPAD_ANALYZE_DIAGNOSTIC_PROHIBITED' });
}
