export class PublicIdentityApiError extends Error {
    constructor(code, status, message) {
        super(message || code);
        this.name = 'PublicIdentityApiError';
        this.code = code;
        this.status = status;
    }
}

export function createPublicIdentityApi(options = {}) {
    const fetchImpl = options.fetchImpl || globalThis.fetch.bind(globalThis);
    const tokenProvider = options.tokenProvider || (() => globalThis.CAISSA_AUTH?.getToken?.());

    async function request(method, body) {
        const token = await tokenProvider();
        if (!token) throw new PublicIdentityApiError('AUTH_REQUIRED', 401, 'Sign in to manage your public identity.');
        const response = await fetchImpl('/api/user/public-identity', {
            method,
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${token}`,
                ...(body ? { 'Content-Type': 'application/json' } : {})
            },
            ...(body ? { body: JSON.stringify(body) } : {})
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new PublicIdentityApiError(
                payload.code || 'PUBLIC_IDENTITY_REQUEST_FAILED',
                response.status,
                payload.error || 'Public identity is temporarily unavailable.'
            );
        }
        return payload;
    }

    return Object.freeze({
        load: () => request('GET'),
        check: nickname => request('POST', { action: 'availability', nickname }),
        update: (nickname, expectedVersion) => request('PATCH', { nickname, expectedVersion })
    });
}
