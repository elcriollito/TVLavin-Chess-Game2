(function installGamesReviewContext(root) {
    'use strict';

    const SCHEMA_VERSION = '1.0.0';
    const CONTEXT_ID = 'games-review-summary';
    const OWNER = 'post-game-core';
    const freeze = value => Object.freeze(value);

    function isGamesReview(value) {
        return !!value && typeof value === 'object'
            && value.schemaVersion === SCHEMA_VERSION
            && value.contextId === CONTEXT_ID
            && value.owner === OWNER
            && value.sourceMode === 'games'
            && value.active === true;
    }

    function create(input = {}) {
        if (input.owner !== OWNER || input.sourceMode !== 'games') {
            return freeze({ ok: false, status: 'inactive', reasonCode: 'NOT_GAMES_REVIEW', value: null });
        }
        return freeze({ ok: true, status: 'active', reasonCode: 'GAMES_REVIEW_CONTEXT_CREATED', value: freeze({
            schemaVersion: SCHEMA_VERSION, contextId: CONTEXT_ID, owner: OWNER, sourceMode: 'games', active: true
        }) });
    }

    root.CaissaGamesReviewContext = freeze({
        schemaVersion: SCHEMA_VERSION, contextId: CONTEXT_ID, owner: OWNER, create, isGamesReview
    });
})(typeof window !== 'undefined' ? window : globalThis);
