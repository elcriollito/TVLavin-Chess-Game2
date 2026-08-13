(function installClassicFicsMatchResearch(root) {
    'use strict';

    const STATES = Object.freeze({ OFF: 'OFF', TARGET_VALIDATED: 'TARGET_VALIDATED', BASELINE_READY: 'BASELINE_READY', MATCH_AUTHORIZED: 'MATCH_AUTHORIZED',
        MATCH_SENT: 'MATCH_SENT', GAME_STARTED: 'GAME_STARTED', WITHDRAW_AUTHORIZED: 'WITHDRAW_AUTHORIZED',
        REJECTED: 'REJECTED', DECLINED: 'DECLINED', WITHDRAWN: 'WITHDRAWN', COMPLETED: 'COMPLETED', FAILED: 'FAILED' });
    const HANDLE = /^[A-Za-z][A-Za-z0-9]{0,16}$/;
    const WITHDRAW_MODES = Object.freeze({ NONE: 'NONE', OFFER_ID: 'OFFER_ID', TARGET: 'TARGET' });
    const sentTruth = delivery => delivery?.ok === true && delivery.code === 'SENT' &&
        delivery.socketState === 'OPEN' && delivery.webSocketSendInvoked === true;

    function createClassicFicsMatchResearch(options = {}) {
        const getClient = options.getClient || (() => root.CaissaFICSClient);
        const getObserver = options.getObserver || (() => root.ClassicFicsObservability);
        const extractObservedOffer = options.extractObservedOffer || null;
        let state = STATES.OFF;
        let request = null;
        let offerId = null;
        let failureCode = null;
        let unsubscribe = null;
        let matchDelivered = false;
        let withdrawMode = WITHDRAW_MODES.NONE;
        const baselineEvidence = { complete: false, outgoingEmpty: false, incomingKnown: false };
        const pendingBlocks = { BASELINE: '', POST_MATCH: '' };
        const used = { baselinePending: false, match: false, postMatchPending: false, withdraw: false };

        const fail = code => { state = STATES.FAILED; failureCode = code; return Object.freeze({ ok: false, code }); };
        const current = () => getClient();
        const sameSession = () => current()?.authenticated === true && current()?.sessionGeneration === request?.sessionGeneration;
        const activate = action => {
            const observer = getObserver();
            if (observer?.state === 'ACTIVE') return true;
            return observer?.requestActivation?.(action) === true && observer?.onAuthenticated?.() === true;
        };
        const sendTyped = (action, commandClass, command, metadata) => {
            if (!sameSession() || current()?.ws?.readyState !== 1 || typeof current()?.send !== 'function') return fail('SESSION_OR_SOCKET_INVALID');
            if (!activate(action)) return fail('OBSERVER_ACTIVATION_REJECTED');
            let delivery;
            try { delivery = current().send(command); } catch { return fail('SEND_FAILED'); }
            if (!getObserver()?.observeMatchResearchOutbound?.(action, commandClass, metadata, delivery)) return fail('OUTBOUND_EVIDENCE_REJECTED');
            if (!sentTruth(delivery)) return fail(delivery?.code === 'SOCKET_NOT_OPEN' ? 'DELIVERY_SOCKET_NOT_OPEN' : 'DELIVERY_SEND_FAILED');
            return Object.freeze({ ok: true, action, deliveryCode: delivery.code });
        };
        const invalidate = code => { offerId = null; request = null; withdrawMode = WITHDRAW_MODES.NONE;
            state = STATES.FAILED; failureCode = code; };
        const onClientEvent = detail => {
            if (!request) return false;
            if (detail?.event === 'disconnected' || (detail?.event === 'connection-state' && detail.payload?.state === 'disconnected')) {
                invalidate('SESSION_DISCONNECTED'); return true;
            }
            if (detail?.event === 'style12' && sameSession()) {
                const style = detail.payload?.style12;
                if ((style?.relation === 1 || style?.relation === -1) &&
                    [style?.whiteName, style?.blackName].includes(request.targetHandle)) {
                    offerId = null; withdrawMode = WITHDRAW_MODES.NONE; state = STATES.GAME_STARTED; return true;
                }
            }
            return false;
        };

        return Object.freeze({
            states: STATES,
            begin(targetEvidence, currentUser) {
                if (state !== STATES.OFF) return fail('EXPERIMENT_ALREADY_STARTED');
                const client = current();
                const handle = targetEvidence?.handle;
                if (!client?.authenticated || client?.ws?.readyState !== 1 || !Number.isSafeInteger(client.sessionGeneration) || client.sessionGeneration < 1)
                    return fail('AUTHENTICATED_SESSION_REQUIRED');
                if (!HANDLE.test(handle || '') || !HANDLE.test(currentUser || '') || handle.toLowerCase() === currentUser.toLowerCase()) return fail('TARGET_HANDLE_INVALID');
                if (targetEvidence.isComputer !== true || targetEvidence.online !== true || targetEvidence.available !== true ||
                    targetEvidence.playing !== false || targetEvidence.hasSuitableSeek !== false ||
                    targetEvidence.snapshotGeneration !== client.sessionGeneration) return fail('TARGET_EVIDENCE_REJECTED');
                request = Object.freeze({ targetHandle: handle, minutes: 5, increment: 0, rated: 'UNRATED',
                    color: 'SERVER_ASSIGNED', variant: 'STANDARD', sessionGeneration: client.sessionGeneration });
                state = STATES.TARGET_VALIDATED; failureCode = null;
                if (typeof client.addSpectatorListener === 'function') unsubscribe = client.addSpectatorListener(onClientEvent);
                return Object.freeze({ ok: true, request });
            },
            sendBaselinePending() {
                if (used.baselinePending || state !== STATES.TARGET_VALIDATED) return fail('BASELINE_PENDING_NOT_ALLOWED');
                used.baselinePending = true;
                return sendTyped('PENDING_BASELINE', 'PENDING', 'pending', { sessionGeneration: request.sessionGeneration });
            },
            observePendingInbound(phase, text) {
                if (!['BASELINE', 'POST_MATCH'].includes(phase) || typeof text !== 'string') return fail('PENDING_FRAME_REJECTED');
                if ((phase === 'BASELINE' && (!used.baselinePending || state !== STATES.TARGET_VALIDATED)) ||
                    (phase === 'POST_MATCH' && (!used.postMatchPending || state !== STATES.MATCH_SENT))) return fail('PENDING_PHASE_NOT_ACTIVE');
                if (pendingBlocks[phase].length + text.length > 16_384) return fail('PENDING_BLOCK_LIMIT');
                pendingBlocks[phase] += text.replace(/\r/g, '');
                const complete = /(?:^|\n)fics%\s*$/i.test(pendingBlocks[phase]);
                if (!complete) return Object.freeze({ ok: true, complete: false });
                const lines = pendingBlocks[phase].split('\n').map(line => line.trim()).filter(Boolean);
                const empty = lines.length === 3 &&
                    lines[0] === 'There are no offers pending to other players.' &&
                    lines[1] === 'There are no offers pending from other players.' && /^fics%$/i.test(lines[2]);
                if (phase === 'BASELINE') {
                    baselineEvidence.complete = true;
                    baselineEvidence.outgoingEmpty = empty;
                    baselineEvidence.incomingKnown = empty;
                    if (!empty) return fail('BASELINE_NOT_CLEAN');
                    state = STATES.BASELINE_READY;
                }
                if (phase === 'POST_MATCH' && typeof extractObservedOffer === 'function') {
                    const observed = extractObservedOffer(pendingBlocks[phase], request.targetHandle);
                    if (Number.isSafeInteger(observed) && observed > 0) offerId = observed;
                }
                return Object.freeze({ ok: true, complete: true, empty, offerObserved: offerId !== null });
            },
            observeRawInbound(text) {
                const phase = used.postMatchPending && state === STATES.MATCH_SENT ? 'POST_MATCH'
                    : used.baselinePending && state === STATES.TARGET_VALIDATED ? 'BASELINE' : null;
                if (!phase) return false;
                return this.observePendingInbound(phase, text);
            },
            authorizeMatch() {
                if (used.match || state !== STATES.BASELINE_READY || !sameSession()) return fail('MATCH_NOT_AUTHORIZABLE');
                state = STATES.MATCH_AUTHORIZED; return Object.freeze({ ok: true });
            },
            sendMatch() {
                if (state !== STATES.MATCH_AUTHORIZED || used.match) return fail('EXACT_MATCH_AUTHORIZATION_REQUIRED');
                used.match = true;
                const result = sendTyped('MATCH', 'MATCH', `match ${request.targetHandle} 5 0 unrated`, request);
                if (result.ok) { matchDelivered = true; state = STATES.MATCH_SENT; }
                return result;
            },
            sendPostMatchPending() {
                if (state !== STATES.MATCH_SENT || used.postMatchPending || offerId !== null) return fail('POST_MATCH_PENDING_NOT_ALLOWED');
                used.postMatchPending = true;
                const result = sendTyped('PENDING_POST_MATCH', 'PENDING', 'pending', { sessionGeneration: request.sessionGeneration });
                return result;
            },
            recordExplicitTerminal(kind) {
                if (state !== STATES.MATCH_SENT || !['REJECTED', 'DECLINED'].includes(kind) || !sameSession())
                    return fail('TERMINAL_RESPONSE_REJECTED');
                offerId = null; withdrawMode = WITHDRAW_MODES.NONE; state = STATES[kind]; return Object.freeze({ ok: true, kind });
            },
            authorizeWithdraw() {
                if (state !== STATES.MATCH_SENT || used.withdraw || !matchDelivered || !sameSession()) return fail('WITHDRAW_NOT_AUTHORIZABLE');
                if (Number.isSafeInteger(offerId) && offerId > 0) withdrawMode = WITHDRAW_MODES.OFFER_ID;
                else if (baselineEvidence.complete && baselineEvidence.outgoingEmpty && baselineEvidence.incomingKnown)
                    withdrawMode = WITHDRAW_MODES.TARGET;
                else return fail('WITHDRAW_NOT_AUTHORIZABLE');
                state = STATES.WITHDRAW_AUTHORIZED;
                return Object.freeze({ ok: true, mode: withdrawMode });
            },
            sendWithdraw() {
                if (state !== STATES.WITHDRAW_AUTHORIZED || used.withdraw || !sameSession()) return fail('EXACT_WITHDRAW_AUTHORIZATION_REQUIRED');
                used.withdraw = true;
                let result;
                if (withdrawMode === WITHDRAW_MODES.OFFER_ID && Number.isSafeInteger(offerId) && offerId > 0) {
                    result = sendTyped('WITHDRAW_MATCH', 'WITHDRAW', `withdraw ${offerId}`,
                        { offerId, sessionGeneration: request.sessionGeneration });
                } else if (withdrawMode === WITHDRAW_MODES.TARGET && HANDLE.test(request.targetHandle)) {
                    result = sendTyped('WITHDRAW_MATCH_TARGET', 'WITHDRAW', `withdraw ${request.targetHandle}`,
                        { targetHandle: request.targetHandle, sessionGeneration: request.sessionGeneration });
                } else return fail('EXACT_WITHDRAW_AUTHORIZATION_REQUIRED');
                if (result.ok) { state = STATES.WITHDRAWN; offerId = null; }
                return result;
            },
            handleClientEvent: onClientEvent,
            complete() { if (![STATES.GAME_STARTED, STATES.WITHDRAWN].includes(state)) return fail('NOT_COMPLETABLE'); state = STATES.COMPLETED; return true; },
            cleanup() { if (unsubscribe) { unsubscribe(); unsubscribe = null; } offerId = null; withdrawMode = WITHDRAW_MODES.NONE; return true; },
            snapshot() { return Object.freeze({ state, request, offerId, failureCode, used: Object.freeze({ ...used }),
                withdrawMode, withdrawTarget: withdrawMode === WITHDRAW_MODES.TARGET ? request?.targetHandle || null : null,
                matchDelivered, baseline: Object.freeze({ ...baselineEvidence }),
                pending: Object.freeze({ baselineComplete: /(?:^|\n)fics%\s*$/i.test(pendingBlocks.BASELINE),
                    postMatchComplete: /(?:^|\n)fics%\s*$/i.test(pendingBlocks.POST_MATCH) }) }); }
        });
    }

    root.createClassicFicsMatchResearch = createClassicFicsMatchResearch;
    root.ClassicFicsMatchResearch = createClassicFicsMatchResearch();
})(typeof globalThis !== 'undefined' ? globalThis : window);
