(function installMentorContextContract(root) {
    'use strict';
    const CAPABILITIES = Object.freeze({ NONE: 'NONE', POSITION: 'POSITION', GAME: 'GAME', LESSON: 'LESSON', LIBRARY_ITEM: 'LIBRARY_ITEM' });
    const CLASS_C = /^(?:\/signin|\/signup|\/auth\/complete|\/premium|\/checkout|\/error)(?:\/|$)/;
    const CLASS_A = /^(?:\/analyze|\/history|\/game-library|\/endgame-(?:trainer|practice|library)|\/academy|\/eco|\/opening-database|\/arena)(?:\/|$)/;
    const PLAY = /^\/play(?:\/(?:games|bots|coach))?$/;
    const EXTERNAL = /^\/play-online\/(?:playchess|fritz)(?:\/|$)|^\/watch\/(?:lichess|live-)/;
    const freeze = value => Object.freeze(value);
    const routePolicy = pathname => {
        const path = typeof pathname === 'string' ? pathname : '';
        if (CLASS_C.test(path)) return freeze({ availability: 'NONE', capability: CAPABILITIES.NONE, reason: 'sensitive-route' });
        if (PLAY.test(path)) return freeze({ availability: 'GENERAL', capability: CAPABILITIES.NONE, reason: 'active-play-fair-play-boundary' });
        if (CLASS_A.test(path)) return freeze({ availability: 'CONTEXT', capability: CAPABILITIES.NONE, reason: 'provider-not-registered' });
        if (EXTERNAL.test(path)) return freeze({ availability: 'GENERAL', capability: CAPABILITIES.NONE, reason: 'cross-origin-context-unavailable' });
        return freeze({ availability: 'NONE', capability: CAPABILITIES.NONE, reason: 'route-not-approved' });
    };
    const resolve = (pathname = root.location?.pathname || '') => {
        const policy = routePolicy(pathname);
        return freeze({ schemaVersion: '1.0.0', surface: pathname || '/', capability: policy.capability,
            contextCapabilities: freeze([]), source: 'route-policy', availability: policy.availability, reason: policy.reason });
    };
    root.CaissaMentorContextContract = freeze({ contractId: 'CaissaMentorContextContract@1.0.0', CAPABILITIES, routePolicy, resolve });
})(typeof window !== 'undefined' ? window : globalThis);
