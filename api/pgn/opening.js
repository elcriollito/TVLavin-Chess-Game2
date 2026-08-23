import AdmZip from 'adm-zip';
import { PGN_MENTOR_OPENING_FILES } from './pgnmentor-allowlist.js';

const SOURCE_BASE_URL = 'https://www.pgnmentor.com/openings/';
const SOURCE_UPDATED = 'January 2026';
const PAGE_SIZE = 100;
const MAX_ZIP_BYTES = 32 * 1024 * 1024;
const MAX_PGN_BYTES = 96 * 1024 * 1024;
const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9._()\-]{0,119}\.zip$/;

function first(value) {
    return Array.isArray(value) ? value[0] : value;
}

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
        .map(file => ({ id: `opening-${file.replace(/\.zip$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, title: openingTitle(file), file }))
        .sort((left, right) => left.title.localeCompare(right.title, 'en', { sensitivity: 'base' }));
    return { schemaVersion: 1, access: 'free', sourceUpdated: SOURCE_UPDATED, pageSize: PAGE_SIZE, count: openings.length, openings };
}

function sourceUnavailable(res, status = 502) {
    return res.status(status).json({ error: 'Opening source unavailable' });
}

export default async function handler(req, res, dependencies = {}) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const file = first(req.query?.file);
    if (!file) {
        res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
        res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
        return res.status(200).json(catalogResponse());
    }
    if (!validOpeningFile(file)) return res.status(404).json({ error: 'Unknown opening collection' });

    const requestedPage = Number.parseInt(first(req.query?.page) || '1', 10);
    if (!Number.isInteger(requestedPage) || requestedPage < 1 || requestedPage > 10000) {
        return res.status(400).json({ error: 'Invalid opening page' });
    }

    try {
        const fetcher = dependencies.fetch || globalThis.fetch;
        const upstream = await fetcher(`${SOURCE_BASE_URL}${encodeURIComponent(file)}`, {
            redirect: 'follow',
            headers: {
                'User-Agent': 'CAISSA-Chess-Opening-Library/1.0 (+https://www.caissa-chess.org/)',
                Accept: 'application/zip, application/octet-stream;q=0.9, */*;q=0.1'
            }
        });
        if (!upstream.ok) return sourceUnavailable(res, upstream.status === 404 ? 404 : 502);

        const declaredLength = Number(upstream.headers.get('content-length') || 0);
        if (declaredLength > MAX_ZIP_BYTES) return res.status(413).json({ error: 'Opening archive exceeds safety limit' });
        const zipBytes = Buffer.from(await upstream.arrayBuffer());
        if (zipBytes.byteLength > MAX_ZIP_BYTES) return res.status(413).json({ error: 'Opening archive exceeds safety limit' });
        if (zipBytes.byteLength < 4 || zipBytes[0] !== 0x50 || zipBytes[1] !== 0x4b) return sourceUnavailable(res);

        const archive = new AdmZip(zipBytes);
        const entries = archive.getEntries().filter(entry => !entry.isDirectory && /\.pgn$/i.test(entry.entryName));
        if (entries.length !== 1) return sourceUnavailable(res);
        const entry = entries[0];
        if (Number(entry.header?.size || 0) > MAX_PGN_BYTES) return res.status(413).json({ error: 'Opening PGN exceeds safety limit' });
        const pgnBytes = entry.getData();
        if (pgnBytes.byteLength > MAX_PGN_BYTES) return res.status(413).json({ error: 'Opening PGN exceeds safety limit' });

        const games = splitPgnGames(pgnBytes.toString('utf8'));
        if (!games.length) return sourceUnavailable(res);
        const pageCount = Math.ceil(games.length / PAGE_SIZE);
        if (requestedPage > pageCount) return res.status(404).json({ error: 'Opening page not found' });
        const start = (requestedPage - 1) * PAGE_SIZE;
        const pageGames = games.slice(start, start + PAGE_SIZE);
        const body = Buffer.from(`${pageGames.join('\n\n')}\n`, 'utf8');

        res.setHeader('Content-Type', 'application/x-chess-pgn; charset=utf-8');
        res.setHeader('Content-Length', String(body.byteLength));
        res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
        res.setHeader('X-CAISSA-PGN-Source', 'pgnmentor-opening-paged');
        res.setHeader('X-CAISSA-Opening-Page', String(requestedPage));
        res.setHeader('X-CAISSA-Opening-Pages', String(pageCount));
        res.setHeader('X-CAISSA-Opening-Games', String(games.length));
        res.setHeader('X-CAISSA-Opening-Page-Games', String(pageGames.length));
        res.setHeader('Content-Disposition', `inline; filename="${file.replace(/\.zip$/i, '')}-page-${requestedPage}.pgn"`);
        return res.status(200).send(body);
    } catch (_) {
        return sourceUnavailable(res);
    }
}
