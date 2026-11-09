import { createHash } from 'node:crypto';
import { checkRateLimit } from '../_lib/rate-limit.js';
import { trustedOnlineSourceKey } from '../_lib/online-request-source.js';
import { PGN_MENTOR_EVENT_FILES } from './pgnmentor-allowlist.js';

const SOURCES = Object.freeze({
    event: Object.freeze({
        baseUrl: 'https://www.pgnmentor.com/events/',
        extension: '.pgn',
        maxBytes: 12 * 1024 * 1024,
        contentType: 'application/x-chess-pgn; charset=utf-8',
        allowlist: PGN_MENTOR_EVENT_FILES
    })
});

const SAFE_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._()\-]{0,119}$/;
const UPSTREAM_TIMEOUT_MS = 10_000;
const MAX_CONCURRENT_DOWNLOADS = 2;
let activeDownloads = 0;

function validFileName(file, source) {
    return typeof file === 'string'
        && file.endsWith(source.extension)
        && !file.includes('..')
        && !file.includes('/')
        && !file.includes('\\')
        && SAFE_FILE_RE.test(file)
        && source.allowlist.has(file);
}

function sourceUnavailable(res, status = 502) {
    return res.status(status).json({ error: 'PGN source unavailable' });
}

function requestKey(req, env = process.env) {
    const vercelSource = trustedOnlineSourceKey(req, env);
    if (vercelSource) return vercelSource.replace('online-source:', 'pgnmentor-source:');
    if (env.VERCEL === '1') return 'pgnmentor-source:unverified';
    const localSource = String(req.socket?.remoteAddress || 'anonymous-pgnmentor-library');
    return `pgnmentor-source:${createHash('sha256').update(`caissa-pgnmentor-local-v1:${localSource}`).digest('hex')}`;
}

async function readExactResponseBody(response, expectedBytes) {
    if (!response.body?.getReader) {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.byteLength !== expectedBytes) throw new Error('PGN_SIZE_INVALID');
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
                await reader.cancel('PGN collection exceeded declared size');
                throw new Error('PGN_SIZE_INVALID');
            }
            Buffer.from(value.buffer, value.byteOffset, value.byteLength).copy(bytes, offset);
            offset += value.byteLength;
        }
    } finally {
        reader.releaseLock();
    }
    if (offset !== expectedBytes) throw new Error('PGN_SIZE_INVALID');
    return bytes;
}

export default async function handler(req, res, dependencies = {}) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const queryKeys = Object.keys(req.query || {});
    if (queryKeys.some(key => key !== 'kind' && key !== 'file')) {
        return res.status(400).json({ error: 'Invalid PGN query' });
    }
    const kindValue = req.query?.kind;
    const fileValue = req.query?.file;
    const kind = typeof kindValue === 'string' ? kindValue : '';
    const file = typeof fileValue === 'string' ? fileValue : '';
    const source = SOURCES[kind];

    // Deliberately no `player` source: CAISSA player albums are physically archived.
    // Event filenames must also exist in the generated PGN Mentor snapshot,
    // so the gateway cannot be turned into an arbitrary upstream fetcher.
    if (!source || !validFileName(file, source)) {
        return res.status(404).json({ error: 'Unknown PGN collection' });
    }

    const upstreamUrl = `${source.baseUrl}${encodeURIComponent(file)}`;

    const limiter = dependencies.rateLimiter || checkRateLimit;
    const allowance = limiter(requestKey(req, dependencies.env || process.env), { windowMs: 60_000, max: 20, prefix: 'pgnmentor-event-free' });
    if (!allowance.allowed) {
        if (allowance.retryAfter) res.setHeader('Retry-After', String(allowance.retryAfter));
        return res.status(429).json({ error: 'Too many PGN requests.', retryAfter: allowance.retryAfter });
    }
    if (req.method === 'GET' && activeDownloads >= MAX_CONCURRENT_DOWNLOADS) {
        res.setHeader('Retry-After', '2');
        return res.status(503).json({ error: 'PGN gateway is busy' });
    }

    if (req.method === 'GET') activeDownloads += 1;
    try {
        const fetcher = dependencies.fetch || globalThis.fetch;
        const upstream = await fetcher(upstreamUrl, {
            method: req.method === 'HEAD' ? 'HEAD' : 'GET',
            redirect: 'follow',
            signal: dependencies.signal || AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
            headers: {
                'User-Agent': 'CAISSA-Chess-PGN-Gateway/1.0 (+https://www.caissa-chess.org/)',
                Accept: 'application/x-chess-pgn, text/plain;q=0.9, */*;q=0.1'
            }
        });

        if (!upstream.ok) {
            return sourceUnavailable(res, upstream.status === 404 ? 404 : 502);
        }

        const declaredLength = Number(upstream.headers.get('content-length') || 0);
        if (!Number.isSafeInteger(declaredLength) || declaredLength <= 0) {
            return sourceUnavailable(res);
        }
        if (declaredLength > source.maxBytes) {
            return res.status(413).json({ error: 'PGN collection exceeds safety limit' });
        }

        res.setHeader('Content-Type', source.contentType);
        res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
        res.setHeader('X-CAISSA-PGN-Source', `pgnmentor-${kind}`);
        res.setHeader('Content-Disposition', `inline; filename="${file.replace(/[^A-Za-z0-9._()-]/g, '_')}"`);

        if (req.method === 'HEAD') return res.status(200).end();

        const body = await readExactResponseBody(upstream, declaredLength);

        if (kind === 'event') {
            if (!body.includes(Buffer.from('[Event ')) || !body.includes(Buffer.from('[White ')) || !body.includes(Buffer.from('[Black '))) {
                return sourceUnavailable(res);
            }
        }
        return res.status(200).send(body);
    } catch (_) {
        return sourceUnavailable(res);
    } finally {
        if (req.method === 'GET') activeDownloads -= 1;
    }
}
