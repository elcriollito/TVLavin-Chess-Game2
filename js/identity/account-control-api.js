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

    async function request(path, { method = 'GET', body, idempotencyKey } = {}) {
        const token = await tokenProvider();
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
            throw new AccountControlApiError(
                payload.code || 'ACCOUNT_CONTROL_REQUEST_FAILED',
                response.status,
                payload.error || 'Account controls are temporarily unavailable.',
                payload
            );
        }
        return payload;
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
        exportData: async () => {
            const idempotencyKey = crypto.randomUUID();
            const payload = await request('/api/account/privacy/export', { method: 'POST', body: {}, idempotencyKey });
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
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
            return payload;
        },
        prepareReset: confirmation => prepare('progress-reset', confirmation),
        confirmReset: prepared => confirm('progress-reset', prepared),
        prepareDeletion: confirmation => prepare('deletion', confirmation),
        confirmDeletion: prepared => confirm('deletion', prepared),
        status: () => request('/api/account/deletion/status')
    });
}
