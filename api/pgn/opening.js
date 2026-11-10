import AdmZip from 'adm-zip';
import { createHash } from 'node:crypto';
import { checkRateLimit } from '../_lib/rate-limit.js';
import { trustedOnlineSourceKey } from '../_lib/online-request-source.js';
import { PGN_MENTOR_OPENING_FILES } from './pgnmentor-allowlist.js';
import { PGN_MENTOR_OPENING_METADATA } from './pgnmentor-opening-metadata.js';

const SOURCE_BASE_URL = 'https://www.pgnmentor.com/openings/';
const SOURCE_UPDATED = 'January 2026';
const PAGE_SIZE = 100;
const MAX_ZIP_BYTES = 32 * 1024 * 1024;
const MAX_PGN_BYTES = 96 * 1024 * 1024;
const ARCHIVE_CACHE_TTL_MS = 10 * 60 * 1000;
const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9._()\-]{0,119}\.zip$/;
const SAFE_PAGE = /^[1-9]\d{0,3}$/;

export function createOpeningWorkState() {
    return { cache: new Map(), loads: new Map(), activeKey: null };
}

const openingWorkState = createOpeningWorkState();

export function openingTitle(file) {
    return String(file || '')
        .replace(/\.zip$/i, '')
        .replace(/Caro-Kann/g, 'Caro–Kann')
        .replace(/Pan-Bot/g, 'Panov–Botvinnik')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Za-z)])(\d)/g, '$1 · $2')
        .replace(/(\d)([A-Z])/g, '$1.$2')
        .replace(/-/g, ' · ')
        .replace(/\bAdv\b/g, 'Advance')
        .replace(/\bEx\b/g, 'Exchange')
        .replace(/\bNf\b/g, 'Nf')
        .replace(/\s+/g, ' ')
        .trim();
}

function validOpeningFile(file) {
    return typeof file === 'string'
        && SAFE_FILE.test(file)
        && !file.includes('..')
        && !file.includes('/')
        && !file.includes('\\')
        && PGN_MENTOR_OPENING_FILES.has(file);
}

export function splitPgnGames(text) {
    return String(text || '')
        .replace(/^\uFEFF/, '')
        .replace(/\r\n?/g, '\n')
        .split(/(?=^\[Event\s+")/m)
        .map(game => game.trim())
        .filter(game => game.startsWith('[Event ') && game.includes('[White ') && game.includes('[Black '));
}

function catalogResponse() {
    const openings = [...PGN_MENTOR_OPENING_FILES]
        .map(file => ({
            id: `opening-${file.replace(/\.zip$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            title: openingTitle(file),
            file,
            games: PGN_MENTOR_OPENING_METADATA[file]?.games,
            pages: PGN_MENTOR_OPENING_METADATA[file]?.pages
        }))
        .sort((left, right) => left.title.localeCompare(right.title, 'en', { sensitivity: 'base' }));
    return { schemaVersion: 1, access: 'free', sourceUpdated: SOURCE_UPDATED, pageSize: PAGE_SIZE, count: openings.length, openings };
}

function sourceUnavailable(res, status = 502) {
    return res.status(status).json({ error: 'Opening source unavailable' });
}

function requestKey(req, env = process.env) {
    const vercelSource = trustedOnlineSourceKey(req, env);
    if (vercelSource) return vercelSource.replace('online-source:', 'opening-source:');
    if (env.VERCEL === '1') return 'opening-source:unverified';
    const localSource = String(req.socket?.remoteAddress || 'anonymous-opening-library');
    const digest = createHash('sha256').update(`caissa-opening-local-v1:${localSource}`).digest('hex');
    return `opening-source:${digest}`;
}

async function readExactResponseBody(response, expectedBytes) {
    if (!response.body?.getReader) {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.byteLength !== expectedBytes) throw new Error('Unexpected opening archive size');
        return bytes;
    }

    const reader = response.body.getReader();
    const bytes = Buffer.allocUnsafe(expectedBytes);
    let offset = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value || offset + value.byteLength > expectedBytes) {
                await reader.cancel('Opening archive exceeded trusted size');
                throw new Error('Unexpected opening archive size');
            }
            Buffer.from(value.buffer, value.byteOffset, value.byteLength).copy(bytes, offset);
            offset += value.byteLength;
        }
    } finally {
        reader.releaseLock();
    }
    if (offset !== expectedBytes) throw new Error('Unexpected opening archive size');
    return bytes;
}

function archiveCacheKey(file, metadata) {
    return [file, metadata.zipSha256, metadata.zipBytes, metadata.pgnBytes, metadata.games, metadata.pages].join(':');
}

async function buildOpeningPages(file, metadata, dependencies) {
    const fetcher = dependencies.fetch || globalThis.fetch;
    const upstream = await fetcher(`${SOURCE_BASE_URL}${encodeURIComponent(file)}`, {
        redirect: 'follow',
        signal: dependencies.signal || AbortSignal.timeout(12_000),
        headers: {
            'User-Agent': 'CAISSA-Chess-Opening-Library/1.0 (+https://www.caissa-chess.org/)',
            Accept: 'application/zip, application/octet-stream;q=0.9, */*;q=0.1'
        }
    });
    if (!upstream.ok) {
        const error = new Error('Opening source unavailable');
        error.status = upstream.status === 404 ? 404 : 502;
        throw error;
    }

    const declaredLength = Number(upstream.headers.get('content-length') || 0);
    if (declaredLength > MAX_ZIP_BYTES) {
        const error = new Error('Opening archive exceeds safety limit');
        error.status = 413;
        throw error;
    }
    if (declaredLength && declaredLength !== metadata.zipBytes) throw new Error('Opening source unavailable');
    const zipBytes = await readExactResponseBody(upstream, metadata.zipBytes);
    if (zipBytes.byteLength > MAX_ZIP_BYTES) {
        const error = new Error('Opening archive exceeds safety limit');
        error.status = 413;
        throw error;
    }
    if (zipBytes.byteLength < 4 || zipBytes[0] !== 0x50 || zipBytes[1] !== 0x4b) throw new Error('Opening source unavailable');
    if (createHash('sha256').update(zipBytes).digest('hex') !== metadata.zipSha256) throw new Error('Opening source unavailable');

    const archive = new AdmZip(zipBytes);
    const entries = archive.getEntries().filter(entry => !entry.isDirectory && /\.pgn$/i.test(entry.entryName));
    if (entries.length !== 1) throw new Error('Opening source unavailable');
    const entry = entries[0];
    if (Number(entry.header?.size || 0) > MAX_PGN_BYTES) {
        const error = new Error('Opening PGN exceeds safety limit');
        error.status = 413;
        throw error;
    }
    if (Number(entry.header?.size || 0) !== metadata.pgnBytes) throw new Error('Opening source unavailable');
    const pgnBytes = entry.getData();
    if (pgnBytes.byteLength > MAX_PGN_BYTES) {
        const error = new Error('Opening PGN exceeds safety limit');
        error.status = 413;
        throw error;
    }
    if (pgnBytes.byteLength !== metadata.pgnBytes) throw new Error('Opening source unavailable');

    const games = splitPgnGames(pgnBytes.toString('utf8'));
    if (!games.length || games.length !== metadata.games) throw new Error('Opening source unavailable');
    if (Math.ceil(games.length / PAGE_SIZE) !== metadata.pages) throw new Error('Opening source unavailable');
    return Object.freeze(Array.from({ length: metadata.pages }, (_, index) =>
        Buffer.from(`${games.slice(index * PAGE_SIZE, (index + 1) * PAGE_SIZE).join('\n\n')}\n`, 'utf8')
    ));
}

async function loadOpeningPages(file, metadata, dependencies) {
    const state = dependencies.openingWorkState
        || (dependencies.fetch || dependencies.openingMetadata ? createOpeningWorkState() : openingWorkState);
    const key = archiveCacheKey(file, metadata);
    const now = Date.now();
    for (const [cachedKey, cached] of state.cache) {
        if (cached.expiresAt <= now || cachedKey !== key) state.cache.delete(cachedKey);
    }
    const cached = state.cache.get(key);
    if (cached) return cached.pages;
    if (state.loads.has(key)) return state.loads.get(key);
    if (state.activeKey && state.activeKey !== key) {
        const error = new Error('Opening gateway is busy');
        error.status = 503;
        error.retryAfter = 2;
        throw error;
    }

    state.activeKey = key;
    const load = buildOpeningPages(file, metadata, dependencies)
        .then(pages => {
            state.cache.clear();
            state.cache.set(key, { pages, expiresAt: Date.now() + ARCHIVE_CACHE_TTL_MS });
            return pages;
        })
        .finally(() => {
            state.loads.delete(key);
            if (state.activeKey === key) state.activeKey = null;
        });
    state.loads.set(key, load);
    return load;
}

export default async function handler(req, res, dependencies = {}) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const queryKeys = Object.keys(req.query || {});
    if (queryKeys.some(key => key !== 'file' && key !== 'page')) {
        return res.status(400).json({ error: 'Invalid opening query' });
    }

    const fileValue = req.query?.file;
    if (fileValue === undefined || fileValue === null || fileValue === '') {
        res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
        res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
        return res.status(200).json(catalogResponse());
    }
    const file = typeof fileValue === 'string' ? fileValue : '';
    if (!validOpeningFile(file)) return res.status(404).json({ error: 'Unknown opening collection' });

    const pageValue = req.query?.page === undefined ? '1' : req.query.page;
    if (typeof pageValue !== 'string' || !SAFE_PAGE.test(pageValue)) {
        return res.status(400).json({ error: 'Invalid opening page' });
    }
    const requestedPage = Number(pageValue);
    const openingMetadata = dependencies.openingMetadata || PGN_MENTOR_OPENING_METADATA;
    const metadata = openingMetadata[file];
    if (!metadata) return sourceUnavailable(res, 503);
    if (requestedPage > metadata.pages) {
        res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
        return res.status(404).json({ error: 'Opening page not found' });
    }

    const limiter = dependencies.rateLimiter || checkRateLimit;
    const rateLimit = limiter(requestKey(req, dependencies.env || process.env), { windowMs: 60 * 1000, max: 20, prefix: 'pgn-opening-free' });
    if (!rateLimit.allowed) {
        if (rateLimit.retryAfter) res.setHeader('Retry-After', String(rateLimit.retryAfter));
        return res.status(429).json({ error: 'Too many opening requests.', retryAfter: rateLimit.retryAfter });
    }

    try {
        const pages = await loadOpeningPages(file, metadata, dependencies);
        const start = (requestedPage - 1) * PAGE_SIZE;
        const pageGameCount = Math.min(PAGE_SIZE, metadata.games - start);
        const body = pages[requestedPage - 1];

        res.setHeader('Content-Type', 'application/x-chess-pgn; charset=utf-8');
        res.setHeader('Content-Length', String(body.byteLength));
        res.setHeader('Cache-Control', 'public, s-maxage=604800, stale-while-revalidate=2592000');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
        res.setHeader('X-CAISSA-PGN-Source', 'pgnmentor-opening-paged');
        res.setHeader('X-CAISSA-Opening-Page', String(requestedPage));
        res.setHeader('X-CAISSA-Opening-Pages', String(metadata.pages));
        res.setHeader('X-CAISSA-Opening-Games', String(metadata.games));
        res.setHeader('X-CAISSA-Opening-Page-Games', String(pageGameCount));
        res.setHeader('Content-Disposition', `inline; filename="${file.replace(/\.zip$/i, '')}-page-${requestedPage}.pgn"`);
        return res.status(200).send(body);
    } catch (error) {
        if (error?.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
        if (error?.status === 413) return res.status(413).json({ error: error.message });
        if (error?.status === 503) return res.status(503).json({ error: 'Opening gateway is busy' });
        return sourceUnavailable(res, error?.status === 404 ? 404 : 502);
    }
}
