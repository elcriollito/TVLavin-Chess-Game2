(function installClassicFicsResearchActions(root) {
    'use strict';

    const COMMANDS = Object.freeze({
        WHO: 'who',
        WHO_FREE: 'who f',
        WHO_AVAILABLE: 'who a',
        PENDING: 'pending'
    });
    const STATES = Object.freeze({ OFF: 'OFF', AUTHORIZED: 'AUTHORIZED', CONSUMED: 'CONSUMED', FAILED: 'FAILED' });

    function createClassicFicsResearchActions(options = {}) {
        const getClient = options.getClient || (() => root.CaissaFICSClient);
        const getObserver = options.getObserver || (() => root.ClassicFicsObservability);
        let state = STATES.OFF;
        let authorizedAction = null;
        let failureCode = null;
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
                if (!observer?.requestActivation?.()) return fail('OBSERVER_ACTIVATION_REJECTED');
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
                    client.send(command);
                    return Object.freeze({ ok: true, action, command });
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
                return Object.freeze({ state, authorizedAction, sentActions: Object.freeze([...sent]), failureCode });
            }
        });
    }

    root.createClassicFicsResearchActions = createClassicFicsResearchActions;
    root.ClassicFicsResearchActions = createClassicFicsResearchActions();
})(typeof globalThis !== 'undefined' ? globalThis : window);
