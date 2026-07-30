(function installHumanMoveAuthority(global) {
    'use strict';
    const VERSION = '1.0.0';
    const frozen = value => Object.freeze(value);
    function create(input = {}) {
        let pendingIntentId = null; let confirmations = 0; let rejectedDuplicates = 0;
        return frozen({
            schemaVersion: VERSION, authority: input.authority === 'provider' ? 'provider' : 'unavailable',
            submitIntent(intentId) {
                if (typeof intentId !== 'string' || !intentId || pendingIntentId) {
                    rejectedDuplicates += 1; return frozen({ ok: false, reasonCode: 'MOVE_INTENT_PENDING' });
                }
                pendingIntentId = intentId.slice(0, 120);
                return frozen({ ok: true, reasonCode: 'PROVIDER_CONFIRMATION_REQUIRED', intentId: pendingIntentId });
            },
            confirm(intentId) {
                if (intentId !== pendingIntentId) return frozen({ ok: false, reasonCode: 'STALE_PROVIDER_ACKNOWLEDGMENT' });
                pendingIntentId = null; confirmations += 1;
                return frozen({ ok: true, reasonCode: 'PROVIDER_MOVE_CONFIRMED' });
            },
            reconnect() { pendingIntentId = null; return frozen({ ok: true, reasonCode: 'RESYNCHRONIZATION_REQUIRED' }); },
            inspect() { return frozen({ pendingIntentId, confirmations, rejectedDuplicates }); }
        });
    }
    global.CaissaHumanMoveAuthority = frozen({ schemaVersion: VERSION, create });
})(typeof window !== 'undefined' ? window : globalThis);
