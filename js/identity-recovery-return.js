(function () {
    'use strict';

    const api = window.CAISSA_IDENTITY_RECOVERY_CHANNEL;
    const status = document.getElementById('identity-recovery-return-status');
    let receipt = '';
    let channel = null;
    let readyTimer = null;
    let expiryTimer = null;
    let completed = false;

    function failClosed() {
        if (completed) return;
        receipt = '';
        if (readyTimer) clearInterval(readyTimer);
        if (expiryTimer) clearTimeout(expiryTimer);
        try { channel?.close(); } catch {}
        channel = null;
        if (status) status.textContent = 'Secure verification could not be returned. Go back to the original CAISSA Production window.';
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
        receipt = fragment.get('proofReceipt') || '';
        if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);

        if (!api || fragmentKeys.join(',') !== 'channel,proofReceipt'
            || fragment.getAll('channel').length !== 1 || fragment.getAll('proofReceipt').length !== 1
            || !api.validChannelId(channelId) || !api.validProofReceipt(receipt)) {
            failClosed();
            return;
        }

        try { channel = new BroadcastChannel(api.channelName(channelId)); }
        catch { failClosed(); return; }

        const announce = () => channel?.postMessage({ type: api.TYPES.ready, channelId });
        channel.onmessage = (event) => {
            if (exactMessage(event.data, 'channelId,type', api.TYPES.request, channelId)) {
                channel.postMessage({ type: api.TYPES.proof, channelId, proofReceipt: receipt });
                return;
            }
            if (exactMessage(event.data, 'channelId,type', api.TYPES.acknowledged, channelId)) {
                completed = true;
                receipt = '';
                clearInterval(readyTimer);
                clearTimeout(expiryTimer);
                channel.close();
                channel = null;
                if (status) status.textContent = 'Verification returned securely. You may close this window.';
                try { window.close(); } catch {}
            }
        };
        readyTimer = setInterval(announce, 250);
        expiryTimer = setTimeout(failClosed, 15_000);
        announce();
    }

    window.addEventListener('pagehide', failClosed, { once: true });
    initialize();
})();
