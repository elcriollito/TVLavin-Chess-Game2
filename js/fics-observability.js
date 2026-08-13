(function installClassicFicsObservability(root) {
    'use strict';

    const STATES = Object.freeze({ OFF: 'OFF', ARMED: 'ARMED', ACTIVE: 'ACTIVE', STOPPED: 'STOPPED', FAILED: 'FAILED' });
    const SCHEMA_VERSION = '1';
    const AUTH_TEXT = /(?:^|\n)\s*(?:login:|password:)|Starting FICS session|Press return to enter the server/i;
    const FORBIDDEN_KEY = /password|credential|secret|raw/i;

    function defaultSanitizer(value, maxPayloadChars) {
        let text = String(value ?? '').replace(/\r/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
        text = text.split('\n').map(line => {
            if (/\b(?:tells you|shouts|c-shouts|kibitzes|whispers)\b/i.test(line)) return '[REMOTE_TEXT_REDACTED]';
            const style12 = line.startsWith('<12>') ? '__STYLE12__' : null;
            const safe = line.replace(/</g, '[').replace(/>/g, ']');
            return style12 ? safe.replace('[12]', '<12>') : safe;
        }).join('\n');
        return text.length > maxPayloadChars ? `${text.slice(0, maxPayloadChars)}[TRUNCATED]` : text;
    }

    function createClassicFicsObservability(options = {}) {
        const clock = options.clock || (() => performance.now());
        const sanitizer = options.sanitizer || defaultSanitizer;
        const stringify = options.stringify || JSON.stringify;
        const limits = Object.freeze({
            maxFrames: Math.max(1, Number(options.maxFrames) || 256),
            maxRecords: Math.max(1, Number(options.maxRecords) || 512),
            maxBytes: Math.max(128, Number(options.maxBytes) || 1024 * 1024),
            maxDurationMs: Math.max(1, Number(options.maxDurationMs) || 90_000),
            maxPayloadChars: Math.max(32, Number(options.maxPayloadChars) || 16_384)
        });
        let state = STATES.OFF;
        let activationRequested = false;
        let captureId = null;
        let startedAtMonotonic = null;
        let records = [];
        let frameIndex = 0;
        let eventIndex = 0;
        let bytes = 0;
        let failureCode = null;

        const failOff = code => { state = STATES.FAILED; activationRequested = false; failureCode = code; };
        const stopAtLimit = () => {
            if (records.length) records[records.length - 1] = Object.freeze({ ...records[records.length - 1], truncated: true });
            state = STATES.STOPPED; activationRequested = false;
        };
        const withinDuration = now => {
            if (startedAtMonotonic !== null && now - startedAtMonotonic > limits.maxDurationMs) { stopAtLimit(); return false; }
            return true;
        };
        const append = record => {
            const encoded = stringify(record);
            const recordBytes = new TextEncoder().encode(encoded).byteLength;
            if (records.length >= limits.maxRecords || bytes + recordBytes > limits.maxBytes) { stopAtLimit(); return false; }
            records.push(Object.freeze(record)); bytes += recordBytes; return true;
        };
        const safeNormalized = value => {
            if (value === null || ['boolean', 'number'].includes(typeof value)) return value;
            if (typeof value === 'string') return sanitizer(value, limits.maxPayloadChars);
            if (Array.isArray(value)) return value.slice(0, 128).map(safeNormalized);
            if (typeof value !== 'object') return null;
            const output = {};
            for (const [key, item] of Object.entries(value)) {
                if (FORBIDDEN_KEY.test(key)) continue;
                output[key] = safeNormalized(item);
            }
            return output;
        };

        return Object.freeze({
            states: STATES,
            get state() { return state; },
            get failureCode() { return failureCode; },
            requestActivation() {
                if (![STATES.OFF, STATES.STOPPED].includes(state)) return false;
                activationRequested = true; state = STATES.OFF; failureCode = null; records = []; bytes = 0;
                frameIndex = 0; eventIndex = 0; captureId = null; startedAtMonotonic = null; return true;
            },
            onAuthenticated() {
                if (!activationRequested || state !== STATES.OFF) return false;
                state = STATES.ARMED; captureId = `classic-fics-${Math.floor(clock())}`; return true;
            },
            observeRawInbound(originalText) {
                try {
                    if (state === STATES.ARMED) { state = STATES.ACTIVE; startedAtMonotonic = clock(); }
                    if (state !== STATES.ACTIVE) return false;
                    const now = clock(); if (!withinDuration(now)) return false;
                    if (frameIndex >= limits.maxFrames) { stopAtLimit(); return false; }
                    const sanitizedPayload = sanitizer(String(originalText), limits.maxPayloadChars);
                    if (AUTH_TEXT.test(sanitizedPayload)) { failOff('AUTH_DATA_REJECTED'); return false; }
                    frameIndex += 1;
                    return append({ kind: 'RAW_INBOUND', monotonicTimestamp: now, frameIndex, sanitizedPayload,
                        truncated: sanitizedPayload.endsWith('[TRUNCATED]') });
                } catch { failOff('CAPTURE_FAILED'); return false; }
            },
            observeNormalizedEvent(eventType, payload = {}) {
                try {
                    if (state !== STATES.ACTIVE) return false;
                    const now = clock(); if (!withinDuration(now)) return false;
                    eventIndex += 1;
                    const appended = append({ kind: 'NORMALIZED_EVENT', monotonicTimestamp: now, eventIndex,
                        eventType: sanitizer(eventType, 80), normalizedPayload: safeNormalized(payload), truncated: false });
                    if (eventType === 'disconnected' || (eventType === 'connection-state' && payload?.state === 'disconnected')) {
                        state = STATES.STOPPED; activationRequested = false;
                    }
                    return appended;
                } catch { failOff('CAPTURE_FAILED'); return false; }
            },
            stop() { if ([STATES.ARMED, STATES.ACTIVE].includes(state)) state = STATES.STOPPED; activationRequested = false; },
            exportCapture() {
                try {
                    if (![STATES.ACTIVE, STATES.STOPPED].includes(state)) return Object.freeze({ ok: false, code: 'EXPORT_REJECTED' });
                    const capture = { schemaVersion: SCHEMA_VERSION, captureId, startedAtMonotonic, limits, records };
                    const json = stringify(capture);
                    if (AUTH_TEXT.test(json) || new TextEncoder().encode(json).byteLength > limits.maxBytes * 2) {
                        return Object.freeze({ ok: false, code: 'EXPORT_REJECTED' });
                    }
                    return Object.freeze({ ok: true, json });
                } catch { failOff('EXPORT_FAILED'); return Object.freeze({ ok: false, code: 'EXPORT_REJECTED' }); }
            },
            snapshot() { return Object.freeze({ state, recordCount: records.length, frameIndex, eventIndex, bytes, failureCode }); }
        });
    }

    root.createClassicFicsObservability = createClassicFicsObservability;
    root.ClassicFicsObservability = createClassicFicsObservability();
})(typeof globalThis !== 'undefined' ? globalThis : window);
