export class AccountControlApiError extends Error {
    constructor(code, status, message, details = {}) {
        super(message || code);
        this.name = 'AccountControlApiError';
        this.code = code;
        this.status = status;
        this.details = details;
    }
}

export function createAccountControlApi(options = {}) {
    const fetchImpl = options.fetchImpl || globalThis.fetch.bind(globalThis);
    const tokenProvider = options.tokenProvider || (() => globalThis.CAISSA_AUTH?.getToken?.());
    const recentTokenLifetimeMs = Number.isFinite(options.recentTokenLifetimeMs)
        ? Math.max(0, options.recentTokenLifetimeMs)
        // Clerk session JWTs are short-lived. Keep the certified token only long
        // enough to bridge the step-up response; later requests obtain a fresh
        // JWT whose server-verified fva claim still governs the five-minute gate.
        : 45 * 1000;
    let recentToken = null;
    let recentTokenExpiresAt = 0;

    async function request(path, { method = 'GET', body, idempotencyKey, accessToken } = {}) {
        const token = accessToken || activeRecentToken() || await tokenProvider();
        if (!token) throw new AccountControlApiError('AUTH_REQUIRED', 401, 'Sign in to manage your data.');
        const response = await fetchImpl(path, {
            method,
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${token}`,
                ...(body ? { 'Content-Type': 'application/json' } : {}),
                ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
            },
            ...(body ? { body: JSON.stringify(body) } : {})
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            if (response.status === 401 || response.status === 403) clearRecentSession();
            throw new AccountControlApiError(
                payload.code || 'ACCOUNT_CONTROL_REQUEST_FAILED',
                response.status,
                payload.error || 'Account controls are temporarily unavailable.',
                payload
            );
        }
        return payload;
    }

    async function certifyRecentSession(accessToken) {
        if (typeof accessToken !== 'string' || !accessToken) {
            throw new AccountControlApiError('AUTH_REQUIRED', 401, 'Sign in to manage your data.');
        }
        const payload = await request('/api/account/privacy/summary', { accessToken });
        if (!payload?.backendReady || payload.requiresReauthentication !== false) {
            clearRecentSession();
            throw new AccountControlApiError(
                'REVERIFICATION_REQUIRED', 403, 'The server did not confirm a recent verification.'
            );
        }
        recentToken = accessToken;
        recentTokenExpiresAt = Date.now() + recentTokenLifetimeMs;
        return payload;
    }

    function activeRecentToken() {
        if (!recentToken || Date.now() >= recentTokenExpiresAt) {
            clearRecentSession();
            return null;
        }
        return recentToken;
    }

    function clearRecentSession() {
        recentToken = null;
        recentTokenExpiresAt = 0;
    }

    async function download(path, { body, idempotencyKey } = {}) {
        const token = activeRecentToken() || await tokenProvider();
        if (!token) throw new AccountControlApiError('AUTH_REQUIRED', 401, 'Sign in to manage your data.');
        const response = await fetchImpl(path, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Idempotency-Key': idempotencyKey
            },
            body: JSON.stringify(body || {})
        });
        if (!response.ok) {
            if (response.status === 401 || response.status === 403) clearRecentSession();
            const payload = await response.json().catch(() => ({}));
            throw new AccountControlApiError(
                payload.code || 'ACCOUNT_CONTROL_REQUEST_FAILED',
                response.status,
                payload.error || 'Account controls are temporarily unavailable.',
                payload
            );
        }
        return response.blob();
    }

    async function prepare(kind, confirmation) {
        const idempotencyKey = crypto.randomUUID();
        const result = await request(`/api/account/${kind}/prepare`, {
            method: 'POST', body: { confirmation }, idempotencyKey
        });
        return { ...result, idempotencyKey };
    }

    async function confirm(kind, prepared) {
        if (!prepared?.operationId || !prepared?.confirmationToken || !prepared?.idempotencyKey) {
            throw new AccountControlApiError('INVALID_CONFIRMATION', 400, 'Start the confirmation again.');
        }
        return request(`/api/account/${kind}/confirm`, {
            method: 'POST',
            body: { operationId: prepared.operationId, confirmationToken: prepared.confirmationToken },
            idempotencyKey: prepared.idempotencyKey
        });
    }

    return Object.freeze({
        summary: () => request('/api/account/privacy/summary'),
        certifyRecentSession,
        clearRecentSession,
        exportData: async () => {
            const idempotencyKey = crypto.randomUUID();
            const blob = await download('/api/account/privacy/export', { body: {}, idempotencyKey });
            const url = URL.createObjectURL(blob);
            try {
                const link = document.createElement('a');
                link.href = url;
                link.download = `caissa-account-data-${new Date().toISOString().slice(0, 10)}.json`;
                link.rel = 'noopener';
                link.click();
            } finally {
                setTimeout(() => URL.revokeObjectURL(url), 0);
            }
            return { downloaded: true, bytes: blob.size };
        },
        prepareReset: confirmation => prepare('progress-reset', confirmation),
        confirmReset: prepared => confirm('progress-reset', prepared),
        prepareDeletion: confirmation => prepare('deletion', confirmation),
        confirmDeletion: prepared => confirm('deletion', prepared),
        status: () => request('/api/account/deletion/status')
    });
}
