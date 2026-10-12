import { ONLINE_PROTOCOL_VERSION } from './online-protocol.js';

export class OnlineApiError extends Error {
    constructor(code, status, payload = null) {
        super(code);
        this.name = 'OnlineApiError';
        this.code = code;
        this.status = status;
        this.payload = payload;
    }
}

export function createOnlineApi(options = {}) {
    const fetchImpl = options.fetchImpl || globalThis.fetch.bind(globalThis);
    const tokenProvider = options.tokenProvider || (async () => globalThis.CAISSA_AUTH?.getToken?.());
    const displayNameProvider = options.displayNameProvider || (() => globalThis.CAISSA_AUTH?.fullName || 'CAISSA Player');

    async function request(url, init = {}, authenticated = true) {
        const headers = new Headers(init.headers || {});
        headers.set('Accept', 'application/json');
        if (init.body) headers.set('Content-Type', 'application/json');
        if (authenticated) {
            const token = await tokenProvider();
            if (!token) throw new OnlineApiError('AUTH_REQUIRED', 401);
            headers.set('Authorization', `Bearer ${token}`);
        }
        const response = await fetchImpl(url, { ...init, headers, credentials: 'same-origin' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new OnlineApiError(payload.code || 'ONLINE_REQUEST_FAILED', response.status, payload);
        return payload;
    }

    return Object.freeze({
        config: () => request('/api/online?action=config', {}, false),
        state: () => request('/api/online?action=state'),
        command(eventType, payload = {}, context = {}) {
            const body = {
                protocolVersion: ONLINE_PROTOCOL_VERSION,
                eventType,
                eventId: context.eventId || createEventId(eventType),
                gameId: context.gameId || null,
                clientSentAt: Date.now(),
                displayName: displayNameProvider(),
                payload
            };
            return request('/api/online', { method: 'POST', body: JSON.stringify(body) });
        }
    });
}

export function createEventId(prefix = 'event') {
    const id = globalThis.crypto?.randomUUID?.()
        || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `${String(prefix).replace(/[^A-Za-z0-9_-]/g, '_')}:${id}`.slice(0, 120);
}
