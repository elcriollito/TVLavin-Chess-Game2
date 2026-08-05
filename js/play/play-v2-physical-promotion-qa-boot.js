(function (global) {
    'use strict';
    const policy = global.CaissaPlayV2PhysicalPromotionQAPolicy;
    const deny = () => global.location.replace('/play/beta/qa/promotion/denied');
    if (!policy?.isAuthorizedLocation?.(global.location)) { deny(); return; }
    const installHistoryGuards = () => {
        const guard = method => {
            const original = global.history[method].bind(global.history);
            global.history[method] = function (...args) {
                const candidate = new URL(args[2] ?? global.location.href, global.location.href);
                if (!policy.isAuthorizedLocation(candidate)) { deny(); return; }
                return original(...args);
            };
        };
        guard('pushState'); guard('replaceState');
    };
    global.addEventListener('load', installHistoryGuards, { once: true });
    global.addEventListener('hashchange', deny);
    global.addEventListener('popstate', () => {
        if (!policy.isAuthorizedLocation(global.location)) deny();
    });
    global.__caissaPhysicalPromotionQaBootAuthorized = true;
})(window);
