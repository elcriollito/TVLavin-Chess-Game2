(function installBotsReviewContext(root) {
    'use strict';

    const SCHEMA_VERSION = '1.0.0';
    const CONTEXT_ID = 'bots-review-summary';
    const OWNER = 'post-game-core';
    const freeze = value => Object.freeze(value);

    function isBotsReview(value) {
        return !!value && typeof value === 'object'
            && value.schemaVersion === SCHEMA_VERSION
            && value.contextId === CONTEXT_ID
            && value.owner === OWNER
            && value.sourceMode === 'bots'
            && value.active === true;
    }

    function create(input = {}) {
        if (input.owner !== OWNER || input.sourceMode !== 'bots') {
            return freeze({ ok: false, status: 'inactive', reasonCode: 'NOT_BOTS_REVIEW', value: null });
        }
        return freeze({ ok: true, status: 'active', reasonCode: 'BOTS_REVIEW_CONTEXT_CREATED', value: freeze({
            schemaVersion: SCHEMA_VERSION,
            contextId: CONTEXT_ID,
            owner: OWNER,
            sourceMode: 'bots',
            active: true
        }) });
    }

    root.CaissaBotsReviewContext = freeze({
        schemaVersion: SCHEMA_VERSION,
        contextId: CONTEXT_ID,
        owner: OWNER,
        create,
        isBotsReview
    });
})(typeof window !== 'undefined' ? window : globalThis);
