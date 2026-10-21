const API_URL = 'https://en.wikibooks.org/w/api.php';
export const WIKIBOOK_LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';

export function wikibookTitleForMoves(moves = []) {
    const segments = moves.map((move, index) => {
        const number = Math.floor(index / 2) + 1;
        return index % 2 === 0 ? `${number}. ${move}` : `${number}...${move}`;
    });
    return ['Chess Opening Theory', ...segments].join('/');
}

export function wikibookPageUrl(title) {
    return `https://en.wikibooks.org/wiki/${String(title || '').split('/').map(encodeURIComponent).join('/')}`;
}

export class WikiBookClient {
    #fetch;
    #cache = new Map();

    constructor({ fetchFn = globalThis.fetch } = {}) {
        this.#fetch = typeof fetchFn === 'function' ? fetchFn.bind(globalThis) : fetchFn;
    }

    async load(moves, { signal } = {}) {
        const normalized = (Array.isArray(moves) ? moves : []).map(String).filter(Boolean).slice(0, 20);
        const candidates = [];
        for (let depth = normalized.length; depth >= 0; depth -= 1) {
            candidates.push(wikibookTitleForMoves(normalized.slice(0, depth)));
        }
        for (const title of candidates) {
            if (this.#cache.has(title)) return this.#cache.get(title);
            const url = new URL(API_URL);
            url.searchParams.set('action', 'query');
            url.searchParams.set('prop', 'extracts|info');
            url.searchParams.set('explaintext', '1');
            url.searchParams.set('redirects', '1');
            url.searchParams.set('inprop', 'url');
            url.searchParams.set('titles', title);
            url.searchParams.set('format', 'json');
            url.searchParams.set('origin', '*');
            try {
                const response = await this.#fetch(url, { signal, credentials: 'omit', headers: { Accept: 'application/json' } });
                if (!response.ok) continue;
                const payload = await response.json();
                const page = Object.values(payload?.query?.pages || {})[0];
                if (!page || page.missing !== undefined || !String(page.extract || '').trim()) continue;
                const pageUrl = wikibookPageUrl(page.title || title);
                const result = Object.freeze({
                    title: String(page.title || title),
                    extract: String(page.extract).trim(),
                    pageUrl,
                    historyUrl: `${pageUrl}?action=history`,
                    license: 'CC BY-SA 4.0',
                    licenseUrl: WIKIBOOK_LICENSE_URL,
                    source: 'Wikibooks Chess Opening Theory',
                    matchedPlies: Math.max(0, title.split('/').length - 1)
                });
                this.#cache.set(title, result);
                return result;
            } catch (error) {
                if (signal?.aborted) throw error;
            }
        }
        return null;
    }
}

export default WikiBookClient;
