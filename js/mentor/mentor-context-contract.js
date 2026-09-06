(function installMentorContextContract(root) {
    'use strict';
    const CAPABILITIES = Object.freeze({ NONE: 'NONE', POSITION: 'POSITION', GAME: 'GAME', LESSON: 'LESSON', LIBRARY_ITEM: 'LIBRARY_ITEM' });
    const CLASS_C = /^(?:\/signin|\/signup|\/auth\/complete|\/premium|\/checkout|\/error)(?:\/|$)/;
    const CLASS_A = /^(?:\/analyze|\/history|\/game-library|\/endgame-(?:trainer|practice|library)|\/academy|\/eco|\/opening-database|\/arena)(?:\/|$)/;
    const PLAY = /^\/play(?:\/(?:games|bots|coach))?$/;
    const EXTERNAL = /^\/play-online\/(?:playchess|fritz)(?:\/|$)|^\/watch\/(?:lichess|live-)/;
    const freeze = value => Object.freeze(value);
    const createPositionSnapshot = input => {
        const fen = typeof input?.fen === 'string' ? input.fen.trim() : '';
        if (input?.source !== 'bots-analysis-study' || fen.split(/\s+/).length !== 6) return null;
        const pv = Array.isArray(input.pv) ? input.pv.filter(value => typeof value === 'string').slice(0, 8) : [];
        return freeze({ capability: CAPABILITIES.POSITION, source: 'bots-analysis-study', fen,
            mode: input.mode === 'temporary' ? 'temporary' : 'source', san: typeof input.san === 'string' ? input.san : null,
            evaluation: Number.isFinite(input.evaluation) ? input.evaluation : null,
            mate: Number.isFinite(input.mate) ? input.mate : null, classification: typeof input.classification === 'string' ? input.classification : null,
            sideToMove: fen.split(/\s+/)[1] === 'b' ? 'black' : 'white', pv: freeze(pv) });
    };
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
    root.CaissaMentorContextContract = freeze({ contractId: 'CaissaMentorContextContract@1.1.0', CAPABILITIES,
        routePolicy, resolve, createPositionSnapshot });
})(typeof window !== 'undefined' ? window : globalThis);
