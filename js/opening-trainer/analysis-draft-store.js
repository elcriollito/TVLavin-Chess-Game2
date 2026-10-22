export const ANALYSIS_DRAFT_SESSION_PREFIX = 'caissa.opening-trainer.session.analysis-draft.v1';

const CLERK_USER_ID = /^user_[A-Za-z0-9]{1,128}$/;
const clone = value => JSON.parse(JSON.stringify(value));
const sessionStorageCapability = () => {
    try { return globalThis.sessionStorage || null; } catch { return null; }
};

function identitySuffix(identity) {
    if (identity?.kind === 'guest') return 'guest';
    const id = String(identity?.id || '');
    if (identity?.kind === 'user' && CLERK_USER_ID.test(id)) return `clerk:${id}`;
    return null;
}

export class AnalysisDraftStore {
    #storage;
    #memory = new Map();
    #volatileKeys = new Set();

    constructor({ storage = sessionStorageCapability() } = {}) {
        this.#storage = storage || null;
    }

    storageKey(identity) {
        const suffix = identitySuffix(identity);
        return suffix ? `${ANALYSIS_DRAFT_SESSION_PREFIX}:${suffix}` : null;
    }

    get(identity) {
        const key = this.storageKey(identity);
        if (!key) return null;
        if (this.#volatileKeys.has(key)) return clone(this.#memory.get(key) || null);
        try {
            const raw = this.#storage?.getItem?.(key);
            const parsed = raw ? JSON.parse(raw) : (this.#memory.get(key) || null);
            return parsed && typeof parsed === 'object' ? clone(parsed) : null;
        } catch {
            return clone(this.#memory.get(key) || null);
        }
    }

    set(identity, draft) {
        const key = this.storageKey(identity);
        if (!key) return false;
        const next = clone(draft);
        this.#memory.set(key, next);
        try {
            this.#storage?.setItem?.(key, JSON.stringify(next));
            this.#volatileKeys.delete(key);
        } catch {
            this.#volatileKeys.add(key);
        }
        return true;
    }

    remove(identity) {
        const key = this.storageKey(identity);
        if (!key) return false;
        this.#memory.delete(key);
        this.#volatileKeys.delete(key);
        try { this.#storage?.removeItem?.(key); } catch { /* in-memory state is already cleared */ }
        return true;
    }
}

export default AnalysisDraftStore;
