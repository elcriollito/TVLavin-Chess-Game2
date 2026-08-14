(function installClassicComputerChallenge(root) {
    'use strict';

    const HANDLE = /^[A-Za-z][A-Za-z0-9]{0,16}$/;
    const STATES = Object.freeze({ IDLE: 'IDLE', VALIDATING: 'VALIDATING', SENDING: 'SENDING', ISSUED: 'ISSUED', ACCEPTED: 'ACCEPTED', GAME_STARTED: 'GAME_STARTED', FAILED: 'FAILED' });
    const DIRECTORY_STATES = Object.freeze({ EMPTY: 'EMPTY', LOADING: 'LOADING', READY: 'READY', FAILED: 'FAILED' });
    const TIME_PRESETS = Object.freeze([
        Object.freeze({ key: '1+0', label: '1 + 0', minutes: 1, increment: 0 }),
        Object.freeze({ key: '2+1', label: '2 + 1', minutes: 2, increment: 1 }),
        Object.freeze({ key: '3+0', label: '3 + 0', minutes: 3, increment: 0 }),
        Object.freeze({ key: '3+2', label: '3 + 2', minutes: 3, increment: 2 }),
        Object.freeze({ key: '5+0', label: '5 + 0', minutes: 5, increment: 0 }),
        Object.freeze({ key: '5+3', label: '5 + 3', minutes: 5, increment: 3 }),
        Object.freeze({ key: '10+0', label: '10 + 0', minutes: 10, increment: 0 }),
        Object.freeze({ key: '15+10', label: '15 + 10', minutes: 15, increment: 10 })
    ]);
    const PRESETS_BY_KEY = new Map(TIME_PRESETS.map(preset => [preset.key, preset]));

    const freezeComputer = computer => Object.freeze({ handle: computer.handle, rating: computer.rating,
        titles: Object.freeze([...computer.titles]), status: 'Available', online: true, available: true,
        sessionGeneration: computer.sessionGeneration });

    function parseAvailableComputers(text, sessionGeneration) {
        const computers = new Map();
        const entry = /(?:^|\s)([+\-\d]{4})([ .:^&#~])?([A-Za-z][A-Za-z0-9]{0,16})((?:\([A-Za-z*]+\))+)/gm;
        let match;
        while ((match = entry.exec(String(text || ''))) !== null) {
            const titles = [...match[4].matchAll(/\(([A-Za-z*]+)\)/g)].map(item => item[1]);
            if (!titles.includes('C')) continue;
            const handle = match[3];
            if (!HANDLE.test(handle)) continue;
            computers.set(handle.toLowerCase(), freezeComputer({ handle,
                rating: /^\d{4}$/.test(match[1]) ? Number(match[1]) : null, titles, sessionGeneration }));
        }
        return Object.freeze([...computers.values()].sort((a, b) => (b.rating || -1) - (a.rating || -1) || a.handle.localeCompare(b.handle)));
    }

    function buildGuestMatchCommand(input, eligibleComputers) {
        const targetHandle = input?.targetHandle;
        const preset = PRESETS_BY_KEY.get(input?.timeControl);
        if (!HANDLE.test(targetHandle || '') || /[\r\n\x00-\x1f\x7f]/.test(targetHandle || '')) throw new Error('INVALID_TARGET_HANDLE');
        if (!preset) throw new Error('TIME_CONTROL_NOT_ALLOWED');
        if (!Number.isSafeInteger(input?.sessionGeneration) || input.sessionGeneration < 1) throw new Error('INVALID_SESSION_GENERATION');
        const target = eligibleComputers.find(computer => computer.handle === targetHandle && computer.sessionGeneration === input.sessionGeneration);
        if (!target || target.available !== true || !target.titles.includes('C')) throw new Error('TARGET_NOT_ELIGIBLE');
        return Object.freeze({ command: `match ${target.handle} ${preset.minutes} ${preset.increment} unrated`,
            intent: Object.freeze({ targetHandle: target.handle, minutes: preset.minutes, increment: preset.increment,
                rated: false, sessionGeneration: input.sessionGeneration }) });
    }

    function createClassicComputerChallenge(options = {}) {
        const getClient = options.getClient || (() => root.CaissaFICSClient);
        const emit = options.emit || (detail => {
            if (typeof root.dispatchEvent === 'function' && typeof root.CustomEvent === 'function')
                root.dispatchEvent(new root.CustomEvent('caissa:fics:computer-hall-updated', { detail }));
        });
        const scheduleTimeout = options.setTimeout || root.setTimeout?.bind(root);
        const cancelTimeout = options.clearTimeout || root.clearTimeout?.bind(root);
        const validationTimeoutMs = Math.max(250, Number(options.validationTimeoutMs) || 4000);
        let state = STATES.IDLE;
        let directoryState = DIRECTORY_STATES.EMPTY;
        let computers = Object.freeze([]);
        let directoryGeneration = null;
        let requestedGeneration = null;
        let responseBuffer = '';
        let pending = null;
        let validation = null;
        let failureCode = null;
        let api;

        const publish = () => { const value = api.snapshot(); emit(value); return value; };
        const fail = code => { state = STATES.FAILED; failureCode = code; publish(); return Object.freeze({ ok: false, code }); };
        const finishValidation = result => {
            const current = validation;
            if (!current) return result;
            if (current.timer !== null && cancelTimeout) cancelTimeout(current.timer);
            validation = null;
            current.resolve(result);
            return result;
        };
        const failValidation = code => {
            state = STATES.FAILED; failureCode = code; pending = null;
            if (code === 'AVAILABILITY_CONFIRMATION_TIMEOUT') directoryState = DIRECTORY_STATES.FAILED;
            publish();
            return finishValidation(Object.freeze({ ok: false, code }));
        };
        const clearForSession = () => {
            if (validation) finishValidation(Object.freeze({ ok: false, code: 'SESSION_OR_DIRECTORY_STALE' }));
            state = STATES.IDLE; directoryState = DIRECTORY_STATES.EMPTY; computers = Object.freeze([]);
            directoryGeneration = null; requestedGeneration = null; responseBuffer = ''; pending = null; failureCode = null;
        };
        const targetIsPlaying = (client, handle) => (client?.activeTables || []).some(table =>
            [table.white, table.black].some(name => String(name || '').toLowerCase() === String(handle || '').toLowerCase()));
        const targetHasSeek = (client, handle) => (client?.seekActions || []).some(seek =>
            String(seek?.details?.player || '').toLowerCase() === String(handle || '').toLowerCase());
        const beginDirectoryRefresh = client => {
            requestedGeneration = client.sessionGeneration; directoryGeneration = client.sessionGeneration;
            directoryState = DIRECTORY_STATES.LOADING; computers = Object.freeze([]); responseBuffer = '';
            const delivery = client.send('who a');
            if (delivery?.ok !== true || delivery.code !== 'SENT' || delivery.webSocketSendInvoked !== true) {
                directoryState = DIRECTORY_STATES.FAILED;
                return Object.freeze({ ok: false, code: 'AVAILABILITY_DELIVERY_FAILED' });
            }
            return Object.freeze({ ok: true, action: 'WHO_AVAILABLE', deliveryCode: delivery.code });
        };
        const authorizeValidatedMatch = () => {
            const client = getClient();
            if (!validation || client?.sessionGeneration !== validation.sessionGeneration || directoryGeneration !== validation.sessionGeneration)
                return failValidation('SESSION_OR_DIRECTORY_STALE');
            if (targetIsPlaying(client, validation.targetHandle)) return failValidation('TARGET_PLAYING');
            if (targetHasSeek(client, validation.targetHandle)) return failValidation('TARGET_HAS_SEEK');
            let built;
            try {
                built = buildGuestMatchCommand({ targetHandle: validation.targetHandle, timeControl: validation.timeControl,
                    sessionGeneration: validation.sessionGeneration }, computers);
            } catch (error) {
                return failValidation(error.message === 'TARGET_NOT_ELIGIBLE' ? 'TARGET_NO_LONGER_AVAILABLE' : error.message || 'INVALID_CHALLENGE');
            }
            state = STATES.SENDING; pending = built.intent; failureCode = null; publish();
            const delivery = client.send(built.command);
            if (delivery?.ok !== true || delivery.code !== 'SENT' || delivery.webSocketSendInvoked !== true) {
                pending = null; return failValidation('MATCH_DELIVERY_FAILED');
            }
            state = STATES.ISSUED; publish();
            return finishValidation(Object.freeze({ ok: true, state, deliveryCode: delivery.code, intent: built.intent }));
        };

        api = Object.freeze({
            states: STATES, directoryStates: DIRECTORY_STATES, timePresets: TIME_PRESETS,
            parseAvailableComputers, buildGuestMatchCommand,
            requestAvailableComputers() {
                const client = getClient();
                if (!client?.authenticated || client?.ws?.readyState !== 1 || !Number.isSafeInteger(client.sessionGeneration) || client.sessionGeneration < 1)
                    return fail('AUTHENTICATED_SESSION_REQUIRED');
                if (requestedGeneration === client.sessionGeneration) return Object.freeze({ ok: false, code: 'AVAILABILITY_ALREADY_REQUESTED' });
                if (pending) return Object.freeze({ ok: false, code: 'CHALLENGE_ACTIVE' });
                const delivery = beginDirectoryRefresh(client);
                if (!delivery.ok) return fail(delivery.code);
                publish();
                return delivery;
            },
            observeRawInbound(text) {
                if (directoryState === DIRECTORY_STATES.LOADING && typeof text === 'string') {
                    if (responseBuffer.length + text.length > 32768) { directoryState = DIRECTORY_STATES.FAILED; return fail('AVAILABILITY_RESPONSE_LIMIT'); }
                    responseBuffer += text.replace(/\r/g, '');
                    if (/\d+\s+players displayed(?:\s*\(of\s+\d+\))?\.?[\s\S]*fics%\s*$/i.test(responseBuffer)) {
                        computers = parseAvailableComputers(responseBuffer, directoryGeneration);
                        directoryState = DIRECTORY_STATES.READY; responseBuffer = ''; publish();
                        if (validation) authorizeValidatedMatch();
                    }
                }
                if (!pending || typeof text !== 'string') return false;
                const escaped = pending.targetHandle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                if (new RegExp(`${escaped} accepts the match offer`, 'i').test(text)) { state = STATES.ACCEPTED; publish(); return true; }
                if (new RegExp(`Issuing:[^\n]*\\b${escaped}\\b`, 'i').test(text)) { state = STATES.ISSUED; publish(); return true; }
                if (new RegExp(`(?:declines|cannot|not available|not logged in|formula)[^\n]*${escaped}|${escaped}[^\n]*(?:declines|cannot|not available|not logged in|formula)`, 'i').test(text)) {
                    pending = null; state = STATES.FAILED; failureCode = 'REMOTE_CHALLENGE_UNAVAILABLE';
                    const client = getClient();
                    if (client?.authenticated && client?.ws?.readyState === 1) beginDirectoryRefresh(client);
                    publish(); return true;
                }
                return false;
            },
            challenge(targetHandle, timeControl) {
                const client = getClient();
                if (validation) return Promise.resolve(Object.freeze({ ok: false, code: 'VALIDATION_IN_PROGRESS' }));
                if (pending || ![STATES.IDLE, STATES.FAILED].includes(state)) return Promise.resolve(Object.freeze({ ok: false, code: 'CHALLENGE_ALREADY_ACTIVE' }));
                if (!client?.authenticated || client?.ws?.readyState !== 1 || directoryGeneration !== client.sessionGeneration || directoryState !== DIRECTORY_STATES.READY)
                    return Promise.resolve(fail('SESSION_OR_DIRECTORY_STALE'));
                if (!HANDLE.test(targetHandle || '') || !PRESETS_BY_KEY.has(timeControl))
                    return Promise.resolve(fail(!HANDLE.test(targetHandle || '') ? 'INVALID_TARGET_HANDLE' : 'TIME_CONTROL_NOT_ALLOWED'));
                state = STATES.VALIDATING; failureCode = null;
                const result = new Promise(resolve => {
                    validation = { targetHandle, timeControl, sessionGeneration: client.sessionGeneration, resolve, timer: null };
                    if (scheduleTimeout) validation.timer = scheduleTimeout(() => failValidation('AVAILABILITY_CONFIRMATION_TIMEOUT'), validationTimeoutMs);
                });
                const refresh = beginDirectoryRefresh(client);
                if (!refresh.ok) failValidation(refresh.code);
                else publish();
                return result;
            },
            handleClientEvent(detail) {
                const client = getClient();
                if (detail?.event === 'disconnected' || (detail?.event === 'connection-state' && detail.payload?.state === 'disconnected')) {
                    clearForSession(); publish(); return true;
                }
                if (detail?.event === 'game-ended' && state === STATES.GAME_STARTED) {
                    clearForSession(); publish(); return true;
                }
                if (directoryGeneration !== null && client?.sessionGeneration !== directoryGeneration) { clearForSession(); publish(); return true; }
                if (detail?.event === 'style12' && pending) {
                    const style = detail.payload?.style12;
                    const names = [style?.whiteName, style?.blackName].map(value => String(value || '').toLowerCase());
                    if ((style?.relation === 1 || style?.relation === -1) && names.includes(pending.targetHandle.toLowerCase())) {
                        state = STATES.GAME_STARTED; pending = null; publish(); return true;
                    }
                }
                return false;
            },
            snapshot() { return Object.freeze({ state, directoryState, directoryGeneration, requestedGeneration,
                computers, pending, failureCode, validatingTarget: validation?.targetHandle || null }); }
        });
        return api;
    }

    root.createClassicComputerChallenge = createClassicComputerChallenge;
    root.ClassicComputerChallenge = createClassicComputerChallenge();
})(typeof globalThis !== 'undefined' ? globalThis : window);
