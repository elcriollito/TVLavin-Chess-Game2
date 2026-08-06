(function (global) {
    'use strict';
    const policy = global.CaissaPlayV2PhysicalIpadAnalyzeDiagnosticPolicy;
    const deny = () => global.location.replace('/play/beta/qa/ipad-analyze-diagnostic/denied');
    if (!policy?.isAuthorizedLocation?.(global.location)) { deny(); return; }
    const guard = method => {
        const original = global.history[method].bind(global.history);
        global.history[method] = function (...args) {
            const candidate = new URL(args[2] ?? global.location.href, global.location.href);
            if (!policy.isAuthorizedLocation(candidate)) { deny(); return; }
            return original(...args);
        };
    };
    guard('pushState'); guard('replaceState');
    global.addEventListener('hashchange', deny);
    global.addEventListener('popstate', () => { if (!policy.isAuthorizedLocation(global.location)) deny(); });
    global.__caissaIpadAnalyzeDiagnosticAuthorized = true;
})(window);
