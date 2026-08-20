(function () {
    'use strict';

    const MAX_ATTEMPTS = 3;
    const RETRY_DELAYS_MS = [0, 500, 1200];
    let running = false;

    function destination() {
        const raw = new URLSearchParams(window.location.search).get('redirect_url');
        return window.CAISSA_REDIRECTS.sanitizeInternalRedirect(raw, '/play');
    }

    function waitForAuth(timeoutMs = 10000) {
        return new Promise((resolve, reject) => {
            const ready = () => window.CAISSA_AUTH?.isLoaded && window.CAISSA_AUTH?.isSignedIn;
            if (ready()) return resolve();
            const timeout = setTimeout(() => {
                window.removeEventListener('caissa-auth-change', onChange);
                reject(new Error('auth unavailable'));
            }, timeoutMs);
            function onChange() {
                if (!ready()) return;
                clearTimeout(timeout);
                window.removeEventListener('caissa-auth-change', onChange);
                resolve();
            }
            window.addEventListener('caissa-auth-change', onChange);
        });
    }

    async function attemptSync() {
        const token = await window.CAISSA_AUTH.getToken();
        if (!token) throw new Error('session unavailable');
        const response = await fetch('/api/user/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: '{}'
        });
        if (!response.ok) throw new Error('sync unavailable');
    }

    async function finish() {
        if (running) return;
        running = true;
        const status = document.getElementById('account-setup-status');
        const retry = document.getElementById('account-setup-retry');
        retry.hidden = true;
        status.textContent = 'This should only take a moment.';
        try {
            await waitForAuth();
            let lastError;
            for (let index = 0; index < MAX_ATTEMPTS; index += 1) {
                if (RETRY_DELAYS_MS[index]) await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[index]));
                try { await attemptSync(); window.location.replace(destination()); return; }
                catch (error) { lastError = error; }
            }
            throw lastError;
        } catch (_) {
            status.textContent = 'We could not finish setting up your account. Check your connection and try again.';
            retry.hidden = false;
            retry.focus();
        } finally {
            running = false;
        }
    }

    document.getElementById('account-setup-retry')?.addEventListener('click', finish);
    finish();
})();
