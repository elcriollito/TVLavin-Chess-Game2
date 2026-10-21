const ENDPOINT = '/api/opening-trainer/repertoires';

export class RepertoireCloudSync {
    #fetch;
    #auth;

    constructor({ fetchFn = globalThis.fetch, auth = () => globalThis.CAISSA_AUTH } = {}) {
        this.#fetch = typeof fetchFn === 'function' ? fetchFn.bind(globalThis) : fetchFn;
        this.#auth = auth;
    }

    async #headers() {
        const auth = this.#auth?.();
        if (!auth?.isSignedIn || typeof auth.getToken !== 'function') return null;
        const token = await auth.getToken();
        if (!token) return null;
        return Object.freeze({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
    }

    async pull() {
        const headers = await this.#headers();
        if (!headers) return Object.freeze({ ok: false, status: 'guest', repertoires: Object.freeze([]) });
        try {
            const response = await this.#fetch(ENDPOINT, { headers, cache: 'no-store', credentials: 'same-origin' });
            if (!response.ok) return Object.freeze({ ok: false, status: `http-${response.status}`, repertoires: Object.freeze([]) });
            const payload = await response.json();
            const repertoires = Array.isArray(payload?.repertoires) ? payload.repertoires : [];
            return Object.freeze({ ok: true, status: 'synced', repertoires: Object.freeze(repertoires) });
        } catch {
            return Object.freeze({ ok: false, status: 'offline', repertoires: Object.freeze([]) });
        }
    }

    async push(repertoire) {
        const headers = await this.#headers();
        if (!headers) return Object.freeze({ ok: false, status: 'guest' });
        try {
            const response = await this.#fetch(ENDPOINT, {
                method: 'PUT',
                headers,
                cache: 'no-store',
                credentials: 'same-origin',
                body: JSON.stringify(repertoire)
            });
            return Object.freeze({ ok: response.ok, status: response.ok ? 'synced' : `http-${response.status}` });
        } catch {
            return Object.freeze({ ok: false, status: 'offline' });
        }
    }
}

export default RepertoireCloudSync;
