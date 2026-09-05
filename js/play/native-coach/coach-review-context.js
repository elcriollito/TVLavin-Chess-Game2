(function installCoachReviewContext(root) {
    'use strict';

    const SCHEMA_VERSION = '1.0.0';
    const CONTEXT_ID = 'coach-review';
    const OWNER = 'post-game-core';
    const freeze = value => Object.freeze(value);

    function isCoachReview(value) {
        return !!value && typeof value === 'object'
            && value.schemaVersion === SCHEMA_VERSION
            && value.contextId === CONTEXT_ID
            && value.owner === OWNER
            && value.sourceMode === 'coach'
            && value.active === true;
    }

    function create(input = {}) {
        if (input.owner !== OWNER || input.sourceMode !== 'coach') {
            return freeze({ ok: false, status: 'inactive', reasonCode: 'NOT_COACH_REVIEW', value: null });
        }
        const value = freeze({
            schemaVersion: SCHEMA_VERSION,
            contextId: CONTEXT_ID,
            owner: OWNER,
            sourceMode: 'coach',
            active: true
        });
        return freeze({ ok: true, status: 'active', reasonCode: 'COACH_REVIEW_CONTEXT_CREATED', value });
    }

    root.CaissaCoachReviewContext = freeze({
        schemaVersion: SCHEMA_VERSION,
        contextId: CONTEXT_ID,
        owner: OWNER,
        create,
        isCoachReview
    });
})(typeof window !== 'undefined' ? window : globalThis);
