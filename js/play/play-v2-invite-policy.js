(function installPlayV2InvitePolicy(root) {
    'use strict';
    const VERSION = '1.0.0';
    root.CaissaPlayV2InvitePolicy = Object.freeze({
        schemaVersion: VERSION,
        contractId: `PlayV2InviteOnlyPolicy@${VERSION}`,
        stage: 'invite-only',
        cohortSize: 5,
        inviteTtlSeconds: 7 * 24 * 60 * 60,
        inviteMaximumRedemptions: 3,
        sessionIdleTtlSeconds: 24 * 60 * 60,
        sessionAbsoluteTtlSeconds: 7 * 24 * 60 * 60,
        feedbackRetentionDays: 90,
        modes: Object.freeze(['games', 'bots', 'coach-capability']),
        players: 'prohibited',
        fics: 'prohibited',
        education: 'prohibited',
        clarity: 'disabled',
        analyticsTransport: 'disabled',
        publicBeta: 'disabled',
        failureMode: 'fail-closed'
    });
})(typeof window !== 'undefined' ? window : globalThis);
