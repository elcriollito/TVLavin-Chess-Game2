const ENDPOINT = '/api/opening-trainer/repertoires';

export class RepertoireCloudSync {
    #fetch;
    #auth;

    constructor({ fetchFn = globalThis.fetch, auth = () => globalThis.CAISSA_AUTH } = {}) {
        this.#fetch = typeof fetchFn === 'function' ? fetchFn.bind(globalThis) : fetchFn;
        this.#auth = auth;
    }

    #matchesUser(userId) {
        const auth = this.#auth?.();
        return Boolean(auth?.isLoaded && auth?.isSignedIn && auth?.userId === userId);
    }

    async #headers(userId) {
        const auth = this.#auth?.();
        if (!userId || !this.#matchesUser(userId) || typeof auth?.getToken !== 'function') return null;
        const token = await auth.getToken();
        if (!token || !this.#matchesUser(userId)) return null;
        return Object.freeze({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
    }

    async pull({ userId, signal } = {}) {
        let headers;
        try { headers = await this.#headers(userId); }
        catch { return Object.freeze({ ok: false, status: 'offline', userId, repertoires: Object.freeze([]) }); }
        if (!headers) return Object.freeze({ ok: false, status: 'identity-changed', userId, repertoires: Object.freeze([]) });
        try {
            const response = await this.#fetch(ENDPOINT, { headers, cache: 'no-store', credentials: 'same-origin', signal });
            if (!this.#matchesUser(userId) || signal?.aborted) {
                return Object.freeze({ ok: false, status: 'identity-changed', userId, repertoires: Object.freeze([]) });
            }
            if (!response.ok) return Object.freeze({ ok: false, status: `http-${response.status}`, userId, repertoires: Object.freeze([]) });
            const payload = await response.json();
            if (!this.#matchesUser(userId) || signal?.aborted) {
                return Object.freeze({ ok: false, status: 'identity-changed', userId, repertoires: Object.freeze([]) });
            }
            const repertoires = Array.isArray(payload?.repertoires) ? payload.repertoires : [];
            return Object.freeze({ ok: true, status: 'synced', userId, repertoires: Object.freeze(repertoires) });
        } catch (error) {
            const status = signal?.aborted || error?.name === 'AbortError' ? 'identity-changed' : 'offline';
            return Object.freeze({ ok: false, status, userId, repertoires: Object.freeze([]) });
        }
    }

    async push(repertoire, { userId, signal } = {}) {
        let headers;
        try { headers = await this.#headers(userId); }
        catch { return Object.freeze({ ok: false, status: 'offline', userId }); }
        if (!headers) return Object.freeze({ ok: false, status: 'identity-changed', userId });
        try {
            const response = await this.#fetch(ENDPOINT, {
                method: 'PUT',
                headers,
                cache: 'no-store',
                credentials: 'same-origin',
                signal,
                body: JSON.stringify(repertoire)
            });
            if (!this.#matchesUser(userId) || signal?.aborted) {
                return Object.freeze({ ok: false, status: 'identity-changed', userId });
            }
            return Object.freeze({ ok: response.ok, status: response.ok ? 'synced' : `http-${response.status}`, userId });
        } catch (error) {
            const status = signal?.aborted || error?.name === 'AbortError' ? 'identity-changed' : 'offline';
            return Object.freeze({ ok: false, status, userId });
        }
    }
}

export default RepertoireCloudSync;
