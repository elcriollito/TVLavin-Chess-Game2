export const PGN_OPENING_PROXY_CATALOG_URL = '/api/pgn/opening';
export const PGN_OPENING_PROXY_PAGE_SIZE = 100;
export const PGN_OPENING_PROXY_MAX_PAGE_BYTES = 10 * 1024 * 1024;

const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9._()\-]{0,119}\.zip$/;

export function isSafeOpeningFile(value) {
    const file = String(value || '');
    return SAFE_FILE.test(file) && !file.includes('..') && !file.includes('/') && !file.includes('\\');
}

export function validateOpeningCatalog(catalog) {
    if (catalog?.access !== 'free'
        || catalog?.pageSize !== PGN_OPENING_PROXY_PAGE_SIZE
        || !Array.isArray(catalog.openings)
        || catalog.openings.length !== 233) {
        throw new Error('The CAISSA Opening Library catalog is invalid.');
    }
    const openings = catalog.openings.map(item => {
        if (!item || typeof item.id !== 'string' || typeof item.title !== 'string' || !isSafeOpeningFile(item.file)) {
            throw new Error('The CAISSA Opening Library catalog contains an invalid collection.');
        }
        return Object.freeze({ id: item.id, title: item.title, file: item.file });
    });
    return Object.freeze({
        schemaVersion: Number(catalog.schemaVersion) || 1,
        access: 'free',
        sourceUpdated: String(catalog.sourceUpdated || ''),
        pageSize: PGN_OPENING_PROXY_PAGE_SIZE,
        count: openings.length,
        openings: Object.freeze(openings)
    });
}

function positiveHeader(response, name, fallback = 0) {
    const value = Number(response.headers?.get?.(name) || fallback);
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('The CAISSA PGN proxy returned invalid pagination metadata.');
    return value;
}

export class PgnOpeningProxyClient {
    #fetch;
    #catalogPromise = null;

    constructor({ fetchFn = globalThis.fetch } = {}) {
        if (typeof fetchFn !== 'function') throw new TypeError('A fetch implementation is required.');
        this.#fetch = fetchFn.bind(globalThis);
    }

    async loadCatalog({ signal } = {}) {
        if (!this.#catalogPromise) {
            this.#catalogPromise = this.#fetch(PGN_OPENING_PROXY_CATALOG_URL, {
                signal,
                credentials: 'same-origin',
                cache: 'force-cache',
                headers: { Accept: 'application/json' }
            }).then(async response => {
                if (!response.ok) throw new Error(`CAISSA Opening Library unavailable (HTTP ${response.status}).`);
                return validateOpeningCatalog(await response.json());
            }).catch(error => {
                this.#catalogPromise = null;
                throw error;
            });
        }
        return this.#catalogPromise;
    }

    async loadPage(file, page = 1, { signal } = {}) {
        if (!isSafeOpeningFile(file)) throw new TypeError('Invalid CAISSA opening collection.');
        if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new TypeError('Invalid CAISSA opening page.');
        const response = await this.#fetch(`${PGN_OPENING_PROXY_CATALOG_URL}?file=${encodeURIComponent(file)}&page=${page}`, {
            signal,
            credentials: 'same-origin',
            cache: 'force-cache',
            headers: { Accept: 'application/x-chess-pgn, text/plain;q=0.9' }
        });
        if (!response.ok) throw new Error(`CAISSA opening collection unavailable (HTTP ${response.status}).`);
        const declared = Number(response.headers?.get?.('content-length') || 0);
        if (declared > PGN_OPENING_PROXY_MAX_PAGE_BYTES) throw new Error('This opening page exceeds the PGN Reader safety limit.');
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > PGN_OPENING_PROXY_MAX_PAGE_BYTES) throw new Error('This opening page exceeds the PGN Reader safety limit.');
        const text = new TextDecoder().decode(bytes);
        if (!text.includes('[Event ') || !text.includes('[White ') || !text.includes('[Black ')) {
            throw new Error('The CAISSA PGN proxy returned an invalid opening page.');
        }
        const resolvedPage = positiveHeader(response, 'X-CAISSA-Opening-Page', page);
        const pages = positiveHeader(response, 'X-CAISSA-Opening-Pages', 1);
        const totalGames = positiveHeader(response, 'X-CAISSA-Opening-Games');
        const pageGames = positiveHeader(response, 'X-CAISSA-Opening-Page-Games');
        if (!resolvedPage || !pages || resolvedPage > pages || pageGames > PGN_OPENING_PROXY_PAGE_SIZE) {
            throw new Error('The CAISSA PGN proxy returned inconsistent pagination metadata.');
        }
        return Object.freeze({
            text,
            page: resolvedPage,
            pages,
            totalGames,
            pageGames,
            source: String(response.headers?.get?.('X-CAISSA-PGN-Source') || '')
        });
    }
}

export default PgnOpeningProxyClient;
