(function () {
    'use strict';

    const api = window.CAISSA_IDENTITY_RECOVERY_CHANNEL;
    const MAX_HANDOFF_TTL_MS = 10 * 60 * 1000;
    const status = document.getElementById('identity-recovery-return-status');
    let receipt = '';
    let channel = null;
    let readyTimer = null;
    let expiryTimer = null;
    let completed = false;

    function dispose() {
        if (completed) return false;
        completed = true;
        receipt = '';
        if (readyTimer) clearInterval(readyTimer);
        if (expiryTimer) clearTimeout(expiryTimer);
        readyTimer = null;
        expiryTimer = null;
        if (channel) channel.onmessage = null;
        try { channel?.close(); } catch {}
        channel = null;
        return true;
    }

    function failClosed() {
        if (!dispose()) return;
        if (status) status.textContent = 'Secure verification could not be returned. Go back to the original CAISSA Production window.';
    }

    function validExpiry(value) {
        const parsed = Date.parse(String(value || ''));
        const now = Date.now();
        if (!Number.isFinite(parsed) || parsed <= now || parsed - now > MAX_HANDOFF_TTL_MS) return 0;
        return new Date(parsed).toISOString() === value ? parsed : 0;
    }

    function exactMessage(data, keys, type, channelId) {
        return data && typeof data === 'object' && !Array.isArray(data)
            && Object.keys(data).sort().join(',') === keys
            && data.type === type && data.channelId === channelId;
    }

    function initialize() {
        const fragment = new URLSearchParams(window.location.hash.slice(1));
        const fragmentKeys = [...fragment.keys()].sort();
        const channelId = fragment.get('channel');
        const expiresAt = validExpiry(fragment.get('expiresAt'));
        receipt = fragment.get('proofReceipt') || '';
        if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);

        if (!api || fragmentKeys.join(',') !== 'channel,expiresAt,proofReceipt'
            || fragment.getAll('channel').length !== 1
            || fragment.getAll('expiresAt').length !== 1
            || fragment.getAll('proofReceipt').length !== 1
            || !api.validChannelId(channelId) || !api.validProofReceipt(receipt) || !expiresAt) {
            failClosed();
            return;
        }

        try { channel = new BroadcastChannel(api.channelName(channelId)); }
        catch { failClosed(); return; }

        const isExpired = () => Date.now() >= expiresAt;
        const announce = () => {
            if (isExpired()) {
                failClosed();
                return;
            }
            channel?.postMessage({ type: api.TYPES.ready, channelId });
        };
        channel.onmessage = (event) => {
            if (completed) return;
            if (exactMessage(event.data, 'channelId,type', api.TYPES.request, channelId)) {
                if (isExpired()) {
                    failClosed();
                    return;
                }
                channel.postMessage({ type: api.TYPES.proof, channelId, proofReceipt: receipt });
                return;
            }
            if (exactMessage(event.data, 'channelId,type', api.TYPES.acknowledged, channelId)) {
                if (!dispose()) return;
                if (status) status.textContent = 'Verification returned securely. You may close this window.';
                try { window.close(); } catch {}
            }
        };
        readyTimer = setInterval(announce, 250);
        expiryTimer = setTimeout(failClosed, Math.max(1, expiresAt - Date.now()));
        announce();
    }

    window.addEventListener('pagehide', failClosed, { once: true });
    initialize();
})();
