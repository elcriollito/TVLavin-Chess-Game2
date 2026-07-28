/**
 * CAISSA Play engine request isolation boundary 1.0.0.
 *
 * This passive registry identifies and validates work routed through the
 * existing legacy engine. It does not create, configure, stop, or own workers.
 */
(function installEngineRequestIsolation(global) {
    'use strict';

    const SCHEMA_VERSION = '1.0.0';
    if (global.CaissaEngineRequestIsolation?.schemaVersion === SCHEMA_VERSION) return;

    const PURPOSES = Object.freeze([
        'opponent-move', 'live-evaluation', 'post-game-analysis',
        'coach-assistance', 'mentor-analysis', 'unknown'
    ]);
    const OPERATIONAL_PURPOSES = Object.freeze(['opponent-move', 'live-evaluation']);
    const STATUSES = Object.freeze([
        'created', 'queued', 'sent', 'active', 'completed', 'canceled',
        'stale', 'timed-out', 'failed', 'unsupported'
    ]);
    const RESPONSE_STATUSES = Object.freeze([
        'accepted', 'stale-request', 'stale-session', 'stale-position',
        'canceled', 'timed-out', 'unknown-request', 'malformed', 'failed'
    ]);
    const TERMINAL = new Set(['completed', 'canceled', 'stale', 'timed-out', 'failed', 'unsupported']);
    const TRANSITIONS = Object.freeze({
        created: Object.freeze(['queued', 'sent', 'active', 'canceled', 'unsupported', 'failed']),
        queued: Object.freeze(['sent', 'active', 'canceled', 'stale', 'timed-out', 'failed']),
        sent: Object.freeze(['active', 'completed', 'canceled', 'stale', 'timed-out', 'failed']),
        active: Object.freeze(['completed', 'canceled', 'stale', 'timed-out', 'failed']),
        completed: Object.freeze([]),
        canceled: Object.freeze([]),
        stale: Object.freeze([]),
        'timed-out': Object.freeze([]),
        failed: Object.freeze([]),
        unsupported: Object.freeze([])
    });
    const ID = /^[a-z0-9][a-z0-9:._-]{0,159}$/i;
    const MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/i;
    const MAX_FEN = 200;
    const MAX_MOVES = 512;
    const MAX_REQUESTS = 200;
    const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
    const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
    const iso = value => {
        const parsed = value instanceof Date ? value : new Date(value);
        return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
    };

    function deepFreeze(value, seen = new WeakSet()) {
        if (!value || typeof value !== 'object' || seen.has(value)) return value;
        seen.add(value);
        Object.values(value).forEach(item => deepFreeze(item, seen));
        return Object.freeze(value);
    }

    function hasDangerousKeys(value, seen = new WeakSet()) {
        if (!value || typeof value !== 'object' || seen.has(value)) return false;
        seen.add(value);
        if (Object.keys(value).some(key => FORBIDDEN_KEYS.has(key))) return true;
        return Object.values(value).some(item => hasDangerousKeys(item, seen));
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function stable(value) {
        if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
        if (isObject(value))
            return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
        return JSON.stringify(value);
    }

    function fingerprint(value) {
        let hash = 2166136261;
        for (const character of stable(value))
            hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
        return `position:fnv1a32-${(hash >>> 0).toString(16).padStart(8, '0')}`;
    }

    function operation(ok, status, name, request = null, response = null, reason = null, diagnostics = []) {
        return deepFreeze({ ok, status, operation: name, request, response, reason, diagnostics: [...diagnostics] });
    }

    function sanitizeMetadata(value) {
        if (!isObject(value) || hasDangerousKeys(value)) return {};
        const metadata = {};
        for (const [key, item] of Object.entries(value).slice(0, 16)) {
            if (!/^[a-z][a-z0-9._-]{0,39}$/i.test(key)) continue;
            if (item === null || ['string', 'number', 'boolean'].includes(typeof item))
                metadata[key] = typeof item === 'string' ? item.slice(0, 160) : item;
        }
        return metadata;
    }

    function createPositionToken({ sessionId, fen, moveCount = null, turn = null } = {}) {
        if (!ID.test(sessionId ?? '') || typeof fen !== 'string' || !fen || fen.length > MAX_FEN)
            return null;
        const normalizedMoveCount = Number.isSafeInteger(moveCount) && moveCount >= 0 ? moveCount : null;
        const normalizedTurn = turn === 'white' || turn === 'black' || turn === 'w' || turn === 'b' ? turn : null;
        return fingerprint({ sessionId, fen, moveCount: normalizedMoveCount, turn: normalizedTurn });
    }

    function createBoundary({
        now = Date.now,
        requestIdFactory,
        sessionIdFactory,
        requirePolicy = false,
        policyValidator = null
    } = {}) {
        let requestSequence = 0;
        let sessionSequence = 0;
        let currentSession = null;
        let disposed = false;
        const requests = new Map();
        const active = new Map();
        const counters = {
            sessions: 0, created: 0, submitted: 0, completed: 0, canceled: 0,
            staleResponses: 0, timedOut: 0, malformed: 0, failed: 0
        };
        let lastRequestId = null;
        let lastRejectionReason = null;

        const makeRequestId = () => {
            const generated = requestIdFactory?.();
            return ID.test(generated ?? '') ? generated : `engine-request:${++requestSequence}`;
        };
        const makeSessionId = () => {
            const generated = sessionIdFactory?.();
            return ID.test(generated ?? '') ? generated : `play-session:${++sessionSequence}`;
        };
        const activeKey = (sessionId, purpose) => `${sessionId}\u0000${purpose}`;
        const snapshot = state => state ? deepFreeze({ ...clone(state.request), status: state.status }) : null;
        const trim = () => {
            if (requests.size <= MAX_REQUESTS) return;
            for (const [id, state] of requests) {
                if (TERMINAL.has(state.status)) requests.delete(id);
                if (requests.size <= MAX_REQUESTS) break;
            }
        };
        const transition = (state, next) => {
            if (!state || !TRANSITIONS[state.status]?.includes(next)) return false;
            state.status = next;
            if (TERMINAL.has(next) && active.get(activeKey(state.request.sessionId, state.request.purpose)) === state.request.requestId)
                active.delete(activeKey(state.request.sessionId, state.request.purpose));
            return true;
        };

        function cancelState(state, status = 'canceled') {
            if (!state || TERMINAL.has(state.status)) return false;
            if (!transition(state, status)) return false;
            if (status === 'canceled') counters.canceled += 1;
            return true;
        }

        function createSession(options = {}) {
            if (disposed) return operation(false, 'failed', 'create-session', null, null, 'disposed');
            for (const state of requests.values()) cancelState(state, 'stale');
            const sessionId = ID.test(options.sessionId ?? '') ? options.sessionId : makeSessionId();
            if (!ID.test(sessionId) || [...requests.values()].some(state => state.request.sessionId === sessionId))
                return operation(false, 'malformed', 'create-session', null, null, 'invalid-or-reused-session-id');
            const createdAt = iso(options.createdAt ?? now());
            if (!createdAt) return operation(false, 'malformed', 'create-session', null, null, 'invalid-clock');
            currentSession = deepFreeze({ schemaVersion: SCHEMA_VERSION, sessionId, createdAt });
            counters.sessions += 1;
            return operation(true, 'created', 'create-session', null, currentSession);
        }

        function getCurrentSession() {
            return currentSession ? deepFreeze(clone(currentSession)) : null;
        }

        function createRequest(input = {}) {
            if (disposed) return operation(false, 'failed', 'create-request', null, null, 'disposed');
            if (!currentSession) {
                const session = createSession();
                if (!session.ok) return session;
            }
            if (!isObject(input) || hasDangerousKeys(input))
                return operation(false, 'malformed', 'create-request', null, null, 'invalid-input');
            const purpose = PURPOSES.includes(input.purpose) ? input.purpose : 'unknown';
            const sessionId = input.sessionId ?? currentSession.sessionId;
            const fen = typeof input.fen === 'string' ? input.fen : '';
            const moves = Array.isArray(input.moves) ? input.moves : [];
            if (!ID.test(sessionId) || sessionId !== currentSession.sessionId
                || !fen || fen.length > MAX_FEN || moves.length > MAX_MOVES
                || moves.some(move => typeof move !== 'string' || !MOVE.test(move)))
                return operation(false, 'malformed', 'create-request', null, null, 'invalid-request-input');
            const requestId = input.requestId ?? makeRequestId();
            if (!ID.test(requestId) || requests.has(requestId))
                return operation(false, 'malformed', 'create-request', null, null, 'invalid-or-duplicate-request-id');
            const createdAt = iso(input.createdAt ?? now());
            const deadlineAt = input.deadlineAt === null || input.deadlineAt === undefined ? null : iso(input.deadlineAt);
            if (!createdAt || input.deadlineAt !== undefined && input.deadlineAt !== null && !deadlineAt
                || deadlineAt !== null && deadlineAt <= createdAt)
                return operation(false, 'malformed', 'create-request', null, null, 'invalid-request-time');
            const positionToken = input.positionToken ?? createPositionToken({
                sessionId, fen, moveCount: input.moveCount, turn: input.turn
            });
            if (typeof positionToken !== 'string')
                return operation(false, 'malformed', 'create-request', null, null, 'invalid-position-token');
            const parameters = isObject(input.parameters) && !hasDangerousKeys(input.parameters)
                ? {
                    depth: Number.isSafeInteger(input.parameters.depth) ? input.parameters.depth : null,
                    moveTimeMs: Number.isSafeInteger(input.parameters.moveTimeMs) ? input.parameters.moveTimeMs : null,
                    skillLevel: Number.isSafeInteger(input.parameters.skillLevel) ? input.parameters.skillLevel : null,
                    multiPv: Number.isSafeInteger(input.parameters.multiPv) ? input.parameters.multiPv : null
                } : { depth: null, moveTimeMs: null, skillLevel: null, multiPv: null };
            const request = deepFreeze({
                schemaVersion: SCHEMA_VERSION,
                requestId,
                sessionId,
                purpose,
                positionToken,
                fen,
                moves: [...moves],
                createdAt,
                deadlineAt,
                status: 'created',
                parameters,
                metadata: sanitizeMetadata(input.metadata)
            });
            requests.set(requestId, { request, status: 'created' });
            counters.created += 1;
            lastRequestId = requestId;
            trim();
            return operation(true, 'created', 'create-request', request);
        }

        function submit(requestOrId, policyDecision = null) {
            if (disposed) return operation(false, 'failed', 'submit', null, null, 'disposed');
            const requestId = typeof requestOrId === 'string' ? requestOrId : requestOrId?.requestId;
            const state = requests.get(requestId);
            if (!state) return operation(false, 'unknown-request', 'submit', null, null, 'unknown-request');
            if (!OPERATIONAL_PURPOSES.includes(state.request.purpose)) {
                transition(state, 'unsupported');
                return operation(false, 'unsupported', 'submit', snapshot(state), null, 'unsupported-purpose');
            }
            if (requirePolicy && (typeof policyValidator !== 'function'
                || !policyValidator(policyDecision, state.request.purpose)))
                return operation(false, 'unsupported', 'submit', snapshot(state), null, 'policy-authorization-required');
            if (state.status !== 'created')
                return operation(false, TERMINAL.has(state.status) ? state.status : 'failed',
                    'submit', snapshot(state), null, 'invalid-status');
            const key = activeKey(state.request.sessionId, state.request.purpose);
            const previous = requests.get(active.get(key));
            if (previous && previous !== state) cancelState(previous, 'stale');
            transition(state, 'active');
            active.set(key, state.request.requestId);
            counters.submitted += 1;
            return operation(true, 'submitted', 'submit', snapshot(state),
                null, previous ? 'superseded-prior-request' : null);
        }

        function cancel(requestId) {
            const state = requests.get(requestId);
            if (!state) return operation(true, 'canceled', 'cancel', null, null, 'unknown-request-noop');
            if (state.status === 'canceled')
                return operation(true, 'canceled', 'cancel', snapshot(state), null, 'already-canceled');
            if (!cancelState(state))
                return operation(false, state.status, 'cancel', snapshot(state), null, 'terminal-request');
            return operation(true, 'canceled', 'cancel', snapshot(state));
        }

        function cancelPurpose(purpose, sessionId = currentSession?.sessionId) {
            if (!PURPOSES.includes(purpose) || !ID.test(sessionId ?? ''))
                return operation(false, 'malformed', 'cancel-purpose', null, null, 'invalid-purpose-or-session');
            let count = 0;
            for (const state of requests.values())
                if (state.request.sessionId === sessionId && state.request.purpose === purpose && cancelState(state)) count += 1;
            return operation(true, 'canceled', 'cancel-purpose', null, null, count ? null : 'no-active-request',
                [{ code: 'canceled-count', value: count }]);
        }

        function cancelSession(sessionId = currentSession?.sessionId) {
            if (!ID.test(sessionId ?? ''))
                return operation(false, 'malformed', 'cancel-session', null, null, 'invalid-session');
            let count = 0;
            for (const state of requests.values())
                if (state.request.sessionId === sessionId && cancelState(state)) count += 1;
            return operation(true, 'canceled', 'cancel-session', null, null, count ? null : 'no-active-request',
                [{ code: 'canceled-count', value: count }]);
        }

        function normalizeMessage(message) {
            const data = {
                bestMove: null, ponder: null, scoreCp: null, mate: null,
                depth: null, pv: [], rawType: 'unknown'
            };
            if (typeof message === 'string') {
                if (!message || message.length > 8_192 || message.includes('\0')) return null;
                const best = message.match(/^bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)(?:\s+ponder\s+([a-h][1-8][a-h][1-8][qrbn]?))?/i);
                if (best) {
                    data.bestMove = best[1].toLowerCase();
                    data.ponder = best[2]?.toLowerCase() ?? null;
                    data.rawType = 'bestmove';
                    return data;
                }
                if (/^info\b/.test(message)) {
                    const cp = message.match(/\bscore cp (-?\d+)/);
                    const mate = message.match(/\bscore mate (-?\d+)/);
                    const depth = message.match(/\bdepth (\d+)/);
                    const pv = message.match(/\bpv\s+(.+)$/);
                    data.scoreCp = cp ? Number(cp[1]) : null;
                    data.mate = mate ? Number(mate[1]) : null;
                    data.depth = depth ? Number(depth[1]) : null;
                    data.pv = pv ? pv[1].trim().split(/\s+/).filter(move => MOVE.test(move)).slice(0, 64) : [];
                    data.rawType = 'info';
                    return data;
                }
                if (/^(?:error|Error)\b/.test(message)) {
                    data.rawType = 'error';
                    return data;
                }
                return data;
            }
            if (!isObject(message) || hasDangerousKeys(message)) return null;
            if (message.type === 'bestmove' && MOVE.test(message.bestMove ?? '')) {
                data.bestMove = message.bestMove.toLowerCase();
                data.ponder = MOVE.test(message.ponder ?? '') ? message.ponder.toLowerCase() : null;
                data.rawType = 'bestmove';
                return data;
            }
            if (message.type === 'info' || Object.prototype.hasOwnProperty.call(message, 'score')) {
                data.scoreCp = Number.isFinite(message.scoreCp) ? message.scoreCp
                    : Number.isFinite(message.score) ? Math.round(message.score * 100) : null;
                data.mate = Number.isFinite(message.mate) ? message.mate : null;
                data.depth = Number.isSafeInteger(message.depth) ? message.depth : null;
                data.pv = Array.isArray(message.pv) ? message.pv.filter(move => typeof move === 'string' && MOVE.test(move)).slice(0, 64) : [];
                data.rawType = 'info';
                return data;
            }
            if (message.type === 'error') {
                data.rawType = 'error';
                return data;
            }
            return data;
        }

        function reject(state, status, reason) {
            lastRejectionReason = reason;
            if (status === 'timed-out') {
                if (state && !TERMINAL.has(state.status)) transition(state, 'timed-out');
                counters.timedOut += 1;
            } else if (status === 'malformed') counters.malformed += 1;
            else if (status === 'failed') counters.failed += 1;
            else counters.staleResponses += 1;
            return operation(false, status, 'accept-response', snapshot(state), null, reason);
        }

        function acceptResponse(input = {}, context = {}) {
            if (disposed) return reject(null, 'failed', 'disposed');
            if (!isObject(input) || !isObject(context) || hasDangerousKeys(input) || hasDangerousKeys(context))
                return reject(null, 'malformed', 'invalid-response-input');
            const state = requests.get(input.requestId);
            if (!state) return reject(null, 'unknown-request', 'unknown-request');
            if (input.sessionId !== state.request.sessionId || context.sessionId !== state.request.sessionId)
                return reject(state, 'stale-session', 'session-mismatch');
            if (input.purpose !== state.request.purpose || context.purpose !== state.request.purpose)
                return reject(state, 'stale-request', 'purpose-mismatch');
            if (input.positionToken !== state.request.positionToken || context.positionToken !== state.request.positionToken)
                return reject(state, 'stale-position', 'position-mismatch');
            if (state.request.deadlineAt && iso(now()) > state.request.deadlineAt)
                return reject(state, 'timed-out', 'deadline-exceeded');
            if (state.status === 'canceled') return reject(state, 'canceled', 'request-canceled');
            if (state.status === 'timed-out') return reject(state, 'timed-out', 'request-timed-out');
            if (state.status === 'stale' || active.get(activeKey(state.request.sessionId, state.request.purpose)) !== state.request.requestId)
                return reject(state, 'stale-request', 'request-not-active');
            if (state.status === 'completed') return reject(state, 'stale-request', 'duplicate-completion');
            if (!['active', 'sent'].includes(state.status))
                return reject(state, 'stale-request', 'request-not-submitted');
            const data = normalizeMessage(input.message);
            if (!data) return reject(state, 'malformed', 'malformed-message');
            if (data.rawType === 'unknown') return reject(state, 'malformed', 'unsupported-message');
            if (data.rawType === 'error') {
                transition(state, 'failed');
                return reject(state, 'failed', 'engine-error');
            }
            if (state.request.purpose === 'opponent-move' && data.rawType !== 'bestmove'
                || state.request.purpose === 'live-evaluation' && data.rawType !== 'info')
                return reject(state, 'stale-request', 'response-type-mismatch');
            if (data.rawType === 'bestmove') {
                transition(state, 'completed');
                counters.completed += 1;
            }
            const response = deepFreeze({
                schemaVersion: SCHEMA_VERSION,
                requestId: state.request.requestId,
                sessionId: state.request.sessionId,
                purpose: state.request.purpose,
                positionToken: state.request.positionToken,
                receivedAt: iso(now()),
                status: 'accepted',
                data,
                diagnostics: []
            });
            return operation(true, 'accepted', 'accept-response', snapshot(state), response);
        }

        function getRequest(requestId) {
            return snapshot(requests.get(requestId));
        }

        function getActiveRequest(purpose, sessionId = currentSession?.sessionId) {
            return snapshot(requests.get(active.get(activeKey(sessionId, purpose))));
        }

        function inspect() {
            const activeRequests = {};
            for (const [key, requestId] of active)
                activeRequests[key.replace('\u0000', ':')] = requestId;
            return deepFreeze({
                schemaVersion: SCHEMA_VERSION,
                currentSession: getCurrentSession(),
                requestCount: requests.size,
                activeRequests,
                counters: { ...counters },
                lastRequestId,
                lastRejectionReason,
                disposed
            });
        }

        function resetDiagnostics() {
            Object.keys(counters).forEach(key => { counters[key] = key === 'sessions' ? counters.sessions : 0; });
            lastRejectionReason = null;
            return operation(true, 'accepted', 'reset-diagnostics');
        }

        function dispose() {
            if (disposed) return operation(true, 'canceled', 'dispose', null, null, 'already-disposed');
            for (const state of requests.values()) cancelState(state);
            active.clear();
            requests.clear();
            currentSession = null;
            disposed = true;
            return operation(true, 'canceled', 'dispose');
        }

        return deepFreeze({
            createSession, getCurrentSession, createRequest, submit, cancel,
            cancelPurpose, cancelSession, acceptWorkerMessage: acceptResponse,
            acceptResponse, getRequest, getActiveRequest, inspect, resetDiagnostics, dispose
        });
    }

    const boundary = createBoundary({
        requirePolicy: true,
        policyValidator: (decision, purpose) =>
            global.CaissaFairPlayPolicy?.validateDecision(decision, purpose) === true
    });
    const api = Object.freeze({
        schemaVersion: SCHEMA_VERSION,
        purposes: PURPOSES,
        operationalPurposes: OPERATIONAL_PURPOSES,
        statuses: STATUSES,
        responseStatuses: RESPONSE_STATUSES,
        transitions: TRANSITIONS,
        createPositionToken,
        createBoundary,
        createSession: (...args) => boundary.createSession(...args),
        getCurrentSession: (...args) => boundary.getCurrentSession(...args),
        createRequest: (...args) => boundary.createRequest(...args),
        submit: (...args) => boundary.submit(...args),
        cancel: (...args) => boundary.cancel(...args),
        cancelPurpose: (...args) => boundary.cancelPurpose(...args),
        cancelSession: (...args) => boundary.cancelSession(...args),
        acceptWorkerMessage: (...args) => boundary.acceptWorkerMessage(...args),
        acceptResponse: (...args) => boundary.acceptResponse(...args),
        getRequest: (...args) => boundary.getRequest(...args),
        getActiveRequest: (...args) => boundary.getActiveRequest(...args),
        inspect: (...args) => boundary.inspect(...args),
        resetDiagnostics: (...args) => boundary.resetDiagnostics(...args),
        dispose: (...args) => boundary.dispose(...args)
    });
    global.CaissaEngineRequestIsolation = api;
})(window);
