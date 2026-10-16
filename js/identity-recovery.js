(function () {
    'use strict';

    const RECOVERY_MESSAGE_TYPE = 'caissa:sec005-owner-proof:v1';
    const STATE_KEY = 'caissa.sec005.owner-handoff.v1';
    let running = false;
    let trustedOrigins = null;
    let opaqueState = '';

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

    function strictHttpsOrigin(value) {
        try {
            const parsed = new URL(String(value || ''));
            if (parsed.protocol !== 'https:' || parsed.username || parsed.password
                || parsed.pathname !== '/' || parsed.search || parsed.hash) return '';
            return parsed.origin;
        } catch {
            return '';
        }
    }

    async function loadTrustedOrigins() {
        await window.CAISSA_AUTH_CONFIG_READY;
        const value = window.CAISSA_AUTH_CONFIG?.IDENTITY_OWNER_HANDOFF;
        const productionOrigin = strictHttpsOrigin(value?.productionOrigin);
        const legacyOrigin = strictHttpsOrigin(value?.legacyOrigin);
        if (!value || typeof value !== 'object' || Array.isArray(value)
            || Object.keys(value).sort().join(',') !== 'legacyOrigin,productionOrigin'
            || !productionOrigin || !legacyOrigin || productionOrigin === legacyOrigin
            || productionOrigin !== value.productionOrigin || legacyOrigin !== value.legacyOrigin
            || window.location.origin !== legacyOrigin) return null;
        return Object.freeze({ productionOrigin, legacyOrigin });
    }

    function unavailableWithoutOpener(status, button) {
        status.textContent = 'This verification window was not opened by CAISSA Production. Restart account recovery there.';
        button.hidden = true;
    }

    async function continueRecovery() {
        if (running) return;
        const button = document.getElementById('identity-recovery-continue');
        const status = document.getElementById('identity-recovery-status');
        if (!trustedOrigins || window.location.origin !== trustedOrigins.legacyOrigin) {
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
            const response = await fetch(trustedOrigins.productionOrigin + '/api/user/identity-migration/owner/prove', {
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
            }, trustedOrigins.productionOrigin);
            window.close();
        } catch {
            status.textContent = 'We could not verify this handoff. Do not retry this page; return to CAISSA Production for a safe restart.';
            button.hidden = true;
        } finally {
            running = false;
        }
    }

    async function initialize() {
        const button = document.getElementById('identity-recovery-continue');
        const status = document.getElementById('identity-recovery-status');
        if (button) button.disabled = true;
        opaqueState = captureOpaqueState();
        try { trustedOrigins = await loadTrustedOrigins(); } catch { trustedOrigins = null; }
        if (!trustedOrigins) {
            status.textContent = 'Account recovery is unavailable on this deployment.';
            if (button) button.hidden = true;
            return;
        }
        if (!hasProductionOpener()) {
            unavailableWithoutOpener(status, button);
            return;
        }
        if (!opaqueState) {
            status.textContent = 'This secure handoff is missing or no longer available. Restart account recovery from CAISSA Production.';
            if (button) button.hidden = true;
            return;
        }
        if (button) {
            button.disabled = false;
            button.addEventListener('click', continueRecovery);
        }
    }

    initialize();
})();
