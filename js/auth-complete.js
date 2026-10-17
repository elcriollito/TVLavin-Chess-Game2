(function () {
    'use strict';

    const MAX_ATTEMPTS = 3;
    const RETRY_DELAYS_MS = [0, 500, 1200];
    const MAX_RECOVERY_WAIT_MS = 10 * 60 * 1000;
    const IDENTITY_RECOVERY_CODES = new Set(['IDENTITY_RESOLUTION_REQUIRED', 'IDENTITY_MIGRATION_REQUIRED']);
    let running = false;

    class SyncFailure extends Error {
        constructor(status, code, transient = false, details = null) {
            super('account sync failed');
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

    async function authenticatedPost(path, body) {
        const token = await window.CAISSA_AUTH.getToken();
        if (!token) throw new SyncFailure(401, 'SESSION_UNAVAILABLE');
        let response;
        try {
            response = await fetch(path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify(body)
            });
        } catch {
            throw new SyncFailure(0, 'NETWORK_UNAVAILABLE', true);
        }
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new SyncFailure(response.status, result.code || 'REQUEST_REJECTED', response.status >= 500, result);
        }
        return result;
    }

    async function attemptSync() {
        return authenticatedPost('/api/user/sync', {});
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

    async function ownerHandoffConfig() {
        await window.CAISSA_AUTH_CONFIG_READY;
        const value = window.CAISSA_AUTH_CONFIG?.IDENTITY_OWNER_HANDOFF;
        const productionOrigin = strictHttpsOrigin(value?.productionOrigin);
        const legacyOrigin = strictHttpsOrigin(value?.legacyOrigin);
        if (!value || typeof value !== 'object' || Array.isArray(value)
            || Object.keys(value).sort().join(',') !== 'legacyOrigin,productionOrigin'
            || !productionOrigin || !legacyOrigin || productionOrigin === legacyOrigin
            || productionOrigin !== value.productionOrigin || legacyOrigin !== value.legacyOrigin
            || window.location.origin !== productionOrigin) {
            throw new SyncFailure(503, 'HANDOFF_CONFIG_INVALID');
        }
        return Object.freeze({ productionOrigin, legacyOrigin });
    }

    async function createProofReceiver(handoffState, expiresAt) {
        const channelApi = window.CAISSA_IDENTITY_RECOVERY_CHANNEL;
        if (!channelApi) throw new SyncFailure(503, 'HANDOFF_CHANNEL_UNAVAILABLE');
        const channelId = await channelApi.deriveChannelId(handoffState)
            .catch(() => { throw new SyncFailure(503, 'HANDOFF_CHANNEL_UNAVAILABLE'); });
        let channel;
        try { channel = new BroadcastChannel(channelApi.channelName(channelId)); }
        catch { throw new SyncFailure(503, 'HANDOFF_CHANNEL_UNAVAILABLE'); }
        const serverExpiry = Date.parse(String(expiresAt || ''));
        const remaining = Number.isFinite(serverExpiry) ? serverExpiry - Date.now() : MAX_RECOVERY_WAIT_MS;
        const timeoutMs = Math.max(1, Math.min(MAX_RECOVERY_WAIT_MS, remaining));
        let dispose = () => false;
        const promise = new Promise((resolve, reject) => {
            let settled = false;
            let timeout;
            dispose = () => {
                if (settled) return false;
                settled = true;
                clearTimeout(timeout);
                try { channel.close(); } catch {}
                return true;
            };
            const finish = (error, receipt) => {
                if (!dispose()) return;
                if (error) reject(error);
                else resolve(receipt);
            };
            channel.onmessage = (event) => {
                const data = event?.data;
                if (!data || typeof data !== 'object' || Array.isArray(data)
                    || data.channelId !== channelId) return;
                if (Object.keys(data).sort().join(',') === 'channelId,type'
                    && data.type === channelApi.TYPES.ready) {
                    channel.postMessage({ type: channelApi.TYPES.request, channelId });
                    return;
                }
                if (Object.keys(data).sort().join(',') !== 'channelId,proofReceipt,type'
                    || data.type !== channelApi.TYPES.proof
                    || !channelApi.validProofReceipt(data.proofReceipt)) return;
                channel.postMessage({ type: channelApi.TYPES.acknowledged, channelId });
                finish(null, data.proofReceipt);
            };
            timeout = setTimeout(
                () => finish(new SyncFailure(408, 'IDENTITY_RECOVERY_EXPIRED')),
                timeoutMs
            );
        });
        return Object.freeze({
            channelId,
            promise,
            dispose
        });
    }

    function closePopup(popup) {
        try { popup?.close(); } catch {}
    }

    function showIdentityRecovery(code) {
        const status = document.getElementById('account-setup-status');
        const recover = document.getElementById('account-setup-recover');
        const note = document.getElementById('account-setup-recovery-note');
        status.textContent = code === 'IDENTITY_MIGRATION_REQUIRED'
            ? 'Your existing CAISSA account needs secure identity verification before it can be used here.'
            : 'We found a Production sign-in that is not yet linked to your existing CAISSA account.';
        recover.hidden = false;
        note.hidden = false;
        recover.focus();
    }

    async function startIdentityRecovery() {
        if (running) return;
        const popup = window.open('', '_blank', 'popup=yes,width=560,height=720');
        const status = document.getElementById('account-setup-status');
        if (!popup) {
            status.textContent = 'Allow the secure verification window, then try again.';
            return;
        }

        running = true;
        const recover = document.getElementById('account-setup-recover');
        const retry = document.getElementById('account-setup-retry');
        recover.disabled = true;
        status.textContent = 'Preparing secure account verification…';
        let proofReceived = false;
        let activationConfirmed = false;
        let receiver = null;
        try {
            const origins = await ownerHandoffConfig();
            const result = await authenticatedPost('/api/user/identity-migration/owner/start', {
                returnTo: destination()
            });
            const target = new URL(String(result.handoffUrl || ''));
            if (target.origin !== origins.legacyOrigin || target.username || target.password
                || target.pathname !== '/identity-recovery' || target.search
                || !target.hash.startsWith('#handoff=v1.')) {
                throw new SyncFailure(503, 'HANDOFF_DESTINATION_INVALID');
            }
            const fragment = new URLSearchParams(target.hash.slice(1));
            const handoffState = fragment.get('handoff') || '';
            if ([...fragment.keys()].join(',') !== 'handoff'
                || !window.CAISSA_IDENTITY_RECOVERY_CHANNEL?.validOpaqueState(handoffState)) {
                throw new SyncFailure(503, 'HANDOFF_DESTINATION_INVALID');
            }

            receiver = await createProofReceiver(handoffState, result.expiresAt);
            popup.location.replace(target.href);
            status.textContent = 'Complete verification in the secure window. Keep this page open.';
            const proofReceipt = await receiver.promise;
            proofReceived = true;
            closePopup(popup);

            status.textContent = 'Finishing the verified account link…';
            const completed = await authenticatedPost(
                '/api/user/identity-migration/owner/complete',
                { proofReceipt }
            );
            if (completed.migrated !== true) {
                throw new SyncFailure(409, 'IDENTITY_RECOVERY_REJECTED');
            }
            activationConfirmed = true;
            await attemptSync();
            window.location.replace(destination());
        } catch (error) {
            receiver?.dispose();
            closePopup(popup);
            if (proofReceived && !activationConfirmed) {
                status.textContent = 'Account recovery could not be confirmed. Do not retry; contact CAISSA support so the account state can be checked safely.';
            } else if (activationConfirmed) {
                status.textContent = 'Your account was recovered, but setup could not finish. It is safe to try setup again.';
                retry.hidden = false;
                retry.focus();
            } else if (error instanceof SyncFailure && error.code === 'IDENTITY_RECOVERY_PENDING') {
                const expiresAt = Date.parse(String(error.details?.expiresAt || ''));
                const until = Number.isFinite(expiresAt)
                    ? ` until ${new Date(expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : '';
                status.textContent = `A previous secure verification is still pending${until}. Continue from its original Production window, or wait for it to expire before restarting.`;
                recover.hidden = true;
            } else {
                status.textContent = error instanceof SyncFailure && error.code === 'IDENTITY_RECOVERY_EXPIRED'
                    ? 'Secure verification expired before it returned. No identity binding was activated.'
                    : 'Secure account verification could not be completed. No identity binding was activated.';
                recover.disabled = error instanceof SyncFailure && error.code === 'HANDOFF_CONFIG_INVALID';
            }
        } finally {
            running = false;
        }
    }

    async function finish() {
        if (running) return;
        running = true;
        const status = document.getElementById('account-setup-status');
        const retry = document.getElementById('account-setup-retry');
        const recover = document.getElementById('account-setup-recover');
        const note = document.getElementById('account-setup-recovery-note');
        retry.hidden = true;
        recover.hidden = true;
        note.hidden = true;
        status.textContent = 'This should only take a moment.';
        try {
            await waitForAuth();
            let lastError;
            for (let index = 0; index < MAX_ATTEMPTS; index += 1) {
                if (RETRY_DELAYS_MS[index]) {
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[index]));
                }
                try {
                    await attemptSync();
                    window.location.replace(destination());
                    return;
                } catch (error) {
                    lastError = error;
                    if (!(error instanceof SyncFailure) || !error.transient) break;
                }
            }
            throw lastError;
        } catch (error) {
            if (error instanceof SyncFailure && IDENTITY_RECOVERY_CODES.has(error.code)) {
                showIdentityRecovery(error.code);
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
    document.getElementById('account-setup-recover')?.addEventListener('click', startIdentityRecovery);
    finish();
})();
