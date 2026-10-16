(function () {
    'use strict';

    const PRODUCTION_ORIGIN = 'https://www.caissa-chess.org';
    const LEGACY_HANDOFF_ORIGIN = 'https://caissa-online-native-v1-validation-26a830.vercel.app';
    const RECOVERY_MESSAGE_TYPE = 'caissa:sec005-owner-proof:v1';
    const STATE_KEY = 'caissa.sec005.owner-handoff.v1';
    let running = false;

    function captureOpaqueState() {
        const fragment = new URLSearchParams(window.location.hash.slice(1));
        const incoming = fragment.get('handoff');
        if (fragment.has('handoff')) {
            sessionStorage.removeItem(STATE_KEY);
            if (incoming && incoming.length <= 4096 && /^v1\.[A-Za-z0-9_.-]+$/.test(incoming)) {
                sessionStorage.setItem(STATE_KEY, incoming);
            }
        }
        if (window.location.hash) {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        const state = sessionStorage.getItem(STATE_KEY) || '';
        return state.length <= 4096 ? state : '';
    }

    function waitForAuth(timeoutMs = 10000) {
        return new Promise((resolve, reject) => {
            const settled = () => window.CAISSA_AUTH?.isLoaded === true;
            if (settled()) return resolve(window.CAISSA_AUTH);
            const timeout = setTimeout(() => {
                window.removeEventListener('caissa-auth-change', onChange);
                reject(new Error('auth unavailable'));
            }, timeoutMs);
            function onChange() {
                if (!settled()) return;
                clearTimeout(timeout);
                window.removeEventListener('caissa-auth-change', onChange);
                resolve(window.CAISSA_AUTH);
            }
            window.addEventListener('caissa-auth-change', onChange);
        });
    }

    function hasProductionOpener() {
        try {
            return Boolean(window.opener) && window.opener.closed === false;
        } catch {
            return false;
        }
    }

    function validProofReceipt(value) {
        return typeof value === 'string' && value.length <= 4096
            && /^r1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
    }

    function unavailableWithoutOpener(status, button) {
        status.textContent = 'This verification window was not opened by CAISSA Production. Restart account recovery there.';
        button.hidden = true;
    }

    async function continueRecovery() {
        if (running) return;
        const button = document.getElementById('identity-recovery-continue');
        const status = document.getElementById('identity-recovery-status');
        const opaqueState = captureOpaqueState();
        if (window.location.origin !== LEGACY_HANDOFF_ORIGIN) {
            status.textContent = 'Account recovery is unavailable on this deployment.';
            button.hidden = true;
            return;
        }
        if (!hasProductionOpener()) {
            unavailableWithoutOpener(status, button);
            return;
        }
        if (!opaqueState) {
            status.textContent = 'This secure handoff is missing or no longer available. Restart account recovery from CAISSA Production.';
            button.hidden = true;
            return;
        }

        running = true;
        button.disabled = true;
        status.textContent = 'Checking your existing CAISSA sign-in…';
        try {
            const auth = await waitForAuth();
            if (!auth?.isSignedIn) {
                status.textContent = 'Sign in to your existing CAISSA account, then continue here.';
                if (typeof auth?.redirectToSignIn !== 'function') throw new Error('sign in unavailable');
                auth.redirectToSignIn('/identity-recovery');
                return;
            }
            if (!hasProductionOpener()) {
                unavailableWithoutOpener(status, button);
                return;
            }
            const token = await auth.getToken?.();
            if (!token) throw new Error('session unavailable');

            sessionStorage.removeItem(STATE_KEY);
            const response = await fetch(PRODUCTION_ORIGIN + '/api/user/identity-migration/owner/prove', {
                method: 'POST',
                mode: 'cors',
                credentials: 'omit',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ handoffState: opaqueState })
            });
            const body = await response.json().catch(() => ({}));
            if (response.status !== 201 || body.verified !== true || !validProofReceipt(body.proofReceipt)) {
                throw new Error('verification rejected');
            }
            if (!hasProductionOpener()) throw new Error('production window unavailable');

            status.textContent = 'Existing account verified. Finishing securely in CAISSA Production…';
            window.opener.postMessage({
                type: RECOVERY_MESSAGE_TYPE,
                proofReceipt: body.proofReceipt
            }, PRODUCTION_ORIGIN);
            window.close();
        } catch {
            status.textContent = 'We could not verify this handoff. Do not retry this page; return to CAISSA Production for a safe restart.';
            button.hidden = true;
        } finally {
            running = false;
        }
    }

    const button = document.getElementById('identity-recovery-continue');
    button?.addEventListener('click', continueRecovery);
    if (window.location.origin !== LEGACY_HANDOFF_ORIGIN) {
        document.getElementById('identity-recovery-status').textContent =
            'Account recovery is unavailable on this deployment.';
        if (button) button.hidden = true;
    } else if (!hasProductionOpener()) {
        unavailableWithoutOpener(document.getElementById('identity-recovery-status'), button);
    } else if (!captureOpaqueState()) {
        document.getElementById('identity-recovery-status').textContent =
            'This secure handoff is missing or no longer available. Restart account recovery from CAISSA Production.';
        if (button) button.hidden = true;
    }
})();
