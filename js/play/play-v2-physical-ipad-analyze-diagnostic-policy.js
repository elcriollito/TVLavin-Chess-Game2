(function (global) {
    'use strict';
    const ROUTE = '/play/beta/qa/ipad-analyze-diagnostic';
    const MODE_ROUTES = Object.freeze({ games: ROUTE, bots: `${ROUTE}/bots`, coach: `${ROUTE}/coach` });
    const resolveMode = location => Object.entries(MODE_ROUTES)
        .find(([, path]) => String(location?.pathname || '') === path)?.[0] || null;
    const exact = location => resolveMode(location) !== null
        && String(location?.search || '') === '' && String(location?.hash || '') === '';
    global.CaissaPlayV2PhysicalIpadAnalyzeDiagnosticPolicy = Object.freeze({
        schemaVersion: '1.1.0', contractId: 'PlayV2PhysicalIpadAnalyzeDiagnosticPolicy@1.1.0',
        canonicalRoute: ROUTE, persistence: 'prohibited', transport: 'prohibited',
        identity: 'prohibited', failureMode: 'fail-closed', capacity: 512,
        requiredEvidenceGenerationCapacity: 16, modeRoutes: MODE_ROUTES,
        resolveMode, isAuthorizedLocation: exact
    });
})(window);
