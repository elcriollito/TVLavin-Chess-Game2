(function () {
    'use strict';

    const MAX_ATTEMPTS = 3;
    const RETRY_DELAYS_MS = [0, 500, 1200];
    let running = false;
    let identity = null;

    class SetupFailure extends Error {
        constructor(status, code, transient = false, details = null) {
            super('account setup failed');
            this.status = status;
            this.code = code;
            this.transient = transient;
            this.details = details;
        }
    }

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
                reject(new SetupFailure(401, 'SESSION_UNAVAILABLE'));
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

    async function authenticatedRequest(path, method = 'GET', body) {
        const token = await window.CAISSA_AUTH.getToken();
        if (!token) throw new SetupFailure(401, 'SESSION_UNAVAILABLE');
        let response;
        try {
            response = await fetch(path, {
                method,
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${token}`,
                    ...(body ? { 'Content-Type': 'application/json' } : {})
                },
                ...(body ? { body: JSON.stringify(body) } : {})
            });
        } catch {
            throw new SetupFailure(0, 'NETWORK_UNAVAILABLE', true);
        }
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new SetupFailure(
                response.status,
                result.code || 'REQUEST_REJECTED',
                response.status >= 500 && result.code !== 'ACCOUNT_SYSTEM_MAINTENANCE',
                result
            );
        }
        return result;
    }

    function syncAccount() {
        return authenticatedRequest('/api/user/sync', 'POST', {});
    }

    async function loadIdentity() {
        const payload = await authenticatedRequest('/api/user/public-identity');
        if (!payload.identity || typeof payload.identity !== 'object') {
            throw new SetupFailure(503, 'PUBLIC_IDENTITY_UNAVAILABLE', true);
        }
        return payload.identity;
    }

    function redirectToDestination() {
        window.location.replace(destination());
    }

    async function restartAfterReset() {
        try { await window.CAISSA_AUTH.signOut?.(); } catch {}
        window.location.replace('/signin?redirect_url=' + encodeURIComponent(destination()));
    }

    function showNicknameStep(value) {
        identity = value;
        const title = document.getElementById('account-setup-title');
        const status = document.getElementById('account-setup-status');
        const spinner = document.querySelector('.auth-setup-spinner');
        const form = document.getElementById('account-nickname-form');
        const input = document.getElementById('account-nickname');
        title.textContent = 'How should other players see you?';
        status.textContent = 'Choose a unique public name. Your private name and email stay private.';
        spinner.hidden = true;
        form.hidden = false;
        input.focus();
    }

    function nicknameStatus(message, state = 'neutral') {
        const status = document.getElementById('account-nickname-status');
        status.textContent = message;
        status.dataset.state = state;
    }

    async function saveNickname(event) {
        event.preventDefault();
        if (running || !identity) return;
        running = true;
        const input = document.getElementById('account-nickname');
        const button = document.getElementById('account-nickname-save');
        const nickname = input.value.trim().replace(/\s+/gu, ' ').normalize('NFC');
        input.disabled = true;
        button.disabled = true;
        nicknameStatus('Checking availability…');
        try {
            const checked = await authenticatedRequest('/api/user/public-identity', 'POST', {
                action: 'availability',
                nickname
            });
            if (checked.available !== true) {
                nicknameStatus('That nickname is unavailable. Choose another one.', 'error');
                return;
            }
            nicknameStatus('Saving your public identity…');
            const updated = await authenticatedRequest('/api/user/public-identity', 'PATCH', {
                nickname,
                expectedVersion: identity.version
            });
            if (!updated.identity?.hasCustomNickname) {
                throw new SetupFailure(503, 'PUBLIC_IDENTITY_UNAVAILABLE');
            }
            nicknameStatus('Your public chess name is ready.', 'success');
            redirectToDestination();
        } catch (error) {
            if (error instanceof SetupFailure && error.code === 'NICKNAME_TAKEN') {
                nicknameStatus('That nickname is unavailable. Choose another one.', 'error');
            } else if (error instanceof SetupFailure && error.code === 'INVALID_NICKNAME') {
                nicknameStatus(error.details?.error || 'That nickname does not meet the public identity rules.', 'error');
            } else if (error instanceof SetupFailure && error.code === 'SESSION_RESET_REQUIRED') {
                await restartAfterReset();
            } else {
                nicknameStatus('We could not save that nickname. No change was made; try again.', 'error');
            }
        } finally {
            running = false;
            input.disabled = false;
            button.disabled = false;
            if (document.body.contains(input)) input.focus();
        }
    }

    function skipNickname() {
        if (running || !identity) return;
        redirectToDestination();
    }

    async function finish() {
        if (running) return;
        running = true;
        const status = document.getElementById('account-setup-status');
        const retry = document.getElementById('account-setup-retry');
        const form = document.getElementById('account-nickname-form');
        retry.hidden = true;
        form.hidden = true;
        status.textContent = 'This should only take a moment.';
        try {
            await waitForAuth();
            let lastError;
            for (let index = 0; index < MAX_ATTEMPTS; index += 1) {
                if (RETRY_DELAYS_MS[index]) {
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[index]));
                }
                try {
                    await syncAccount();
                    lastError = null;
                    break;
                } catch (error) {
                    lastError = error;
                    if (!(error instanceof SetupFailure) || !error.transient) break;
                }
            }
            if (lastError) throw lastError;

            const currentIdentity = await loadIdentity();
            if (currentIdentity.hasCustomNickname === true) {
                redirectToDestination();
                return;
            }
            showNicknameStep(currentIdentity);
        } catch (error) {
            if (error instanceof SetupFailure && error.code === 'SESSION_RESET_REQUIRED') {
                status.textContent = 'Your earlier session has expired. Returning you to a fresh sign-in…';
                await restartAfterReset();
            } else if (error instanceof SetupFailure && error.code === 'ACCOUNT_SYSTEM_MAINTENANCE') {
                status.textContent = 'Account access is temporarily paused while CAISSA completes the secure reset. Please return shortly.';
            } else {
                status.textContent = 'We could not finish setting up your account. No account changes were made; try again.';
                retry.hidden = false;
                retry.focus();
            }
        } finally {
            running = false;
        }
    }

    document.getElementById('account-setup-retry')?.addEventListener('click', finish);
    document.getElementById('account-nickname-form')?.addEventListener('submit', saveNickname);
    document.getElementById('account-nickname-skip')?.addEventListener('click', skipNickname);
    finish();
})();
