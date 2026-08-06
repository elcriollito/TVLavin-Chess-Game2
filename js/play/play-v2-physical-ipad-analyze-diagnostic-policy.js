(function (global) {
    'use strict';
    const ROUTE = '/play/beta/qa/ipad-analyze-diagnostic';
    const exact = location => String(location?.pathname || '') === ROUTE
        && String(location?.search || '') === '' && String(location?.hash || '') === '';
    global.CaissaPlayV2PhysicalIpadAnalyzeDiagnosticPolicy = Object.freeze({
        schemaVersion: '1.0.0', contractId: 'PlayV2PhysicalIpadAnalyzeDiagnosticPolicy@1.0.0',
        canonicalRoute: ROUTE, persistence: 'prohibited', transport: 'prohibited',
        identity: 'prohibited', failureMode: 'fail-closed', capacity: 512,
        isAuthorizedLocation: exact
    });
})(window);
