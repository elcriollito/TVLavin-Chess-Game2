(function installClassicFicsResearchActions(root) {
    'use strict';

    const COMMANDS = Object.freeze({
        WHO: 'who',
        WHO_FREE: 'who f',
        WHO_AVAILABLE: 'who a',
        PENDING: 'pending'
    });
    const STATES = Object.freeze({ OFF: 'OFF', AUTHORIZED: 'AUTHORIZED', CONSUMED: 'CONSUMED', FAILED: 'FAILED' });
    const COMMAND_CLASSES = Object.freeze({ WHO: 'WHO', WHO_FREE: 'WHO', WHO_AVAILABLE: 'WHO', PENDING: 'PENDING' });

    function createClassicFicsResearchActions(options = {}) {
        const getClient = options.getClient || (() => root.CaissaFICSClient);
        const getObserver = options.getObserver || (() => root.ClassicFicsObservability);
        let state = STATES.OFF;
        let authorizedAction = null;
        let failureCode = null;
        let lastDelivery = null;
        const sent = new Set();

        const fail = code => {
            state = STATES.FAILED;
            authorizedAction = null;
            failureCode = code;
            try { getObserver()?.stop?.(); } catch {}
            return Object.freeze({ ok: false, code });
        };

        return Object.freeze({
            commands: COMMANDS,
            states: STATES,
            get state() { return state; },
            authorize(action) {
                if (!Object.hasOwn(COMMANDS, action)) return fail('ACTION_NOT_ALLOWED');
                if (state === STATES.AUTHORIZED) return fail('AUTHORIZATION_ALREADY_ACTIVE');
                if (sent.has(action)) return fail('ACTION_ALREADY_SENT');
                const client = getClient();
                if (!client?.authenticated) return fail('AUTHENTICATED_CLASSIC_SESSION_REQUIRED');
                const observer = getObserver();
                if (!observer?.requestActivation?.(action)) return fail('OBSERVER_ACTIVATION_REJECTED');
                if (!observer.onAuthenticated?.()) return fail('OBSERVER_ARM_REJECTED');
                authorizedAction = action;
                failureCode = null;
                state = STATES.AUTHORIZED;
                return Object.freeze({ ok: true, action });
            },
            execute(action) {
                if (state !== STATES.AUTHORIZED || action !== authorizedAction) return fail('EXACT_AUTHORIZATION_REQUIRED');
                const client = getClient();
                if (!client?.authenticated || client?.ws?.readyState !== 1 || typeof client.send !== 'function') {
                    return fail('AUTHENTICATED_CLASSIC_SESSION_REQUIRED');
                }
                const command = COMMANDS[action];
                authorizedAction = null;
                state = STATES.CONSUMED;
                sent.add(action);
                try {
                    const delivery = client.send(command);
                    lastDelivery = delivery && typeof delivery === 'object' ? Object.freeze({
                        code: delivery.code, socketState: delivery.socketState,
                        webSocketSendInvoked: delivery.webSocketSendInvoked,
                        monotonicTimestamp: delivery.monotonicTimestamp
                    }) : null;
                    const observed = getObserver()?.observeTypedOutbound?.(action, COMMAND_CLASSES[action], delivery);
                    if (!observed) return fail('OUTBOUND_EVIDENCE_REJECTED');
                    if (!delivery?.ok || delivery.code !== 'SENT' || delivery.webSocketSendInvoked !== true) {
                        return fail(delivery?.code === 'SOCKET_NOT_OPEN' ? 'DELIVERY_SOCKET_NOT_OPEN' : 'DELIVERY_SEND_FAILED');
                    }
                    return Object.freeze({ ok: true, action, command, deliveryCode: delivery.code });
                } catch {
                    return fail('SEND_FAILED');
                }
            },
            cancel() {
                authorizedAction = null;
                if (state === STATES.AUTHORIZED) state = STATES.OFF;
                getObserver()?.stop?.();
                return true;
            },
            snapshot() {
                return Object.freeze({ state, authorizedAction, sentActions: Object.freeze([...sent]), failureCode, lastDelivery });
            }
        });
    }

    root.createClassicFicsResearchActions = createClassicFicsResearchActions;
    root.ClassicFicsResearchActions = createClassicFicsResearchActions();
})(typeof globalThis !== 'undefined' ? globalThis : window);
