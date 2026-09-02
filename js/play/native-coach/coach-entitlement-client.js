(function installCoachEntitlementClient(root) {
    'use strict';
    const SCHEMA_VERSION = '1.1.0';
    // Temporary Play v3 feedback window. The server preserves the same explicit switch.
    const TEMPORARY_OPEN_PREVIEW = true;
    const ALLOWED_ACCESS = new Set(['none', 'trial', 'premium', 'locked', 'preview']);
    const freeze = value => Object.freeze(value);
    const openPreview = () => freeze({ verified: true, allowed: true, code: 'OPEN_PREVIEW_ACCESS',
        coachAccess: 'preview', coachTrialGamesRemaining: 0, coachGameConsumed: false });
    const initial = () => freeze({ verified: false, allowed: false, code: 'UNVERIFIED', coachAccess: 'none',
        coachTrialGamesRemaining: 0, coachGameConsumed: false });
    const normalize = (value, fallbackCode = 'COACH_ACCESS_UNAVAILABLE') => {
        if (!value || typeof value !== 'object' || !ALLOWED_ACCESS.has(value.coachAccess)
            || typeof value.code !== 'string' || value.code.length > 64) {
            return freeze({ ...initial(), verified: true, code: fallbackCode });
        }
        return freeze({ verified: true, allowed: value.allowed === true, code: value.code,
            coachAccess: value.coachAccess, coachTrialGamesRemaining: value.coachTrialGamesRemaining === 1 ? 1 : 0,
            coachGameConsumed: value.coachGameConsumed === true });
    };
    function create(options = {}) {
        const request = options.fetch || root.fetch?.bind(root);
        const previewOpen = options.openPreview ?? TEMPORARY_OPEN_PREVIEW;
        let current = initial(); let operationId = null; let disposed = false;
        const auth = async () => {
            const owner = root.CAISSA_AUTH;
            if (!owner) return null;
            await owner.whenReady?.();
            if (owner.isSignedIn !== true) return null;
            return owner.getToken?.() || null;
        };
        const call = async (method, id = null) => {
            if (previewOpen) { current = openPreview(); return current; }
            if (disposed || typeof request !== 'function') return normalize(null);
            const token = await auth();
            if (!token) { current = freeze({ ...initial(), verified: true, code: 'AUTH_REQUIRED' }); return current; }
            try {
                const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };
                if (id) headers['Idempotency-Key'] = id;
                const response = await request('/api/play/coach/entitlement', { method, headers,
                    credentials: 'same-origin', cache: 'no-store' });
                const payload = await response.json().catch(() => null);
                current = normalize(payload, response.status === 401 ? 'AUTH_REQUIRED' : 'COACH_ACCESS_UNAVAILABLE');
                return current;
            } catch (_) { current = normalize(null); return current; }
        };
        return freeze({
            refresh: () => call('GET'),
            consume: async () => {
                if (!operationId) operationId = root.crypto?.randomUUID?.() || null;
                if (!operationId) { current = normalize(null); return current; }
                return call('POST', operationId);
            },
            inspect: () => current,
            dispose() { disposed = true; operationId = null; return true; }
        });
    }
    root.CaissaCoachEntitlementClient = freeze({ schemaVersion: SCHEMA_VERSION, create, normalize });
})(typeof window !== 'undefined' ? window : globalThis);
