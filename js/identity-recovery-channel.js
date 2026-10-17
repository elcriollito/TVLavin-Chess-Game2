(function () {
    'use strict';

    const CHANNEL_PREFIX = 'caissa:sec005-owner-proof:v2:';
    const TYPES = Object.freeze({
        ready: 'caissa:sec005-owner-proof-ready:v2',
        request: 'caissa:sec005-owner-proof-request:v2',
        proof: 'caissa:sec005-owner-proof:v2',
        acknowledged: 'caissa:sec005-owner-proof-ack:v2'
    });

    function validOpaqueState(value) {
        return typeof value === 'string' && value.length <= 4096
            && /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
    }

    function validChannelId(value) {
        return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
    }

    function validProofReceipt(value) {
        return typeof value === 'string' && value.length <= 4096
            && /^r1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
    }

    async function deriveChannelId(opaqueState) {
        if (!validOpaqueState(opaqueState)) throw new Error('invalid handoff state');
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(opaqueState));
        let binary = '';
        for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
        return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    }

    function channelName(channelId) {
        if (!validChannelId(channelId)) throw new Error('invalid handoff channel');
        return CHANNEL_PREFIX + channelId;
    }

    window.CAISSA_IDENTITY_RECOVERY_CHANNEL = Object.freeze({
        TYPES,
        deriveChannelId,
        channelName,
        validChannelId,
        validOpaqueState,
        validProofReceipt
    });
})();
