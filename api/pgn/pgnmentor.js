import { PGN_MENTOR_EVENT_FILES, PGN_MENTOR_OPENING_FILES } from './pgnmentor-allowlist.js';

const SOURCES = Object.freeze({
    event: Object.freeze({
        baseUrl: 'https://www.pgnmentor.com/events/',
        extension: '.pgn',
        maxBytes: 12 * 1024 * 1024,
        contentType: 'application/x-chess-pgn; charset=utf-8',
        allowlist: PGN_MENTOR_EVENT_FILES
    }),
    opening: Object.freeze({
        baseUrl: 'https://www.pgnmentor.com/openings/',
        extension: '.zip',
        maxBytes: 32 * 1024 * 1024,
        contentType: 'application/zip',
        allowlist: PGN_MENTOR_OPENING_FILES
    })
});

const SAFE_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._()\-]{0,119}$/;

function firstQueryValue(value) {
    return Array.isArray(value) ? value[0] : value;
}

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

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const kind = firstQueryValue(req.query?.kind);
    const file = firstQueryValue(req.query?.file);
    const source = SOURCES[kind];

    // Deliberately no `player` source: CAISSA player albums are physically archived.
    // Event/opening filenames must also exist in the generated PGN Mentor snapshot,
    // so the gateway cannot be turned into an arbitrary upstream fetcher.
    if (!source || !validFileName(file, source)) {
        return res.status(404).json({ error: 'Unknown PGN collection' });
    }

    const upstreamUrl = `${source.baseUrl}${encodeURIComponent(file)}`;

    try {
        const upstream = await fetch(upstreamUrl, {
            method: req.method === 'HEAD' ? 'HEAD' : 'GET',
            redirect: 'follow',
            headers: {
                'User-Agent': 'CAISSA-Chess-PGN-Gateway/1.0 (+https://www.caissa-chess.org/)',
                Accept: kind === 'event'
                    ? 'application/x-chess-pgn, text/plain;q=0.9, */*;q=0.1'
                    : 'application/zip, application/octet-stream;q=0.9, */*;q=0.1'
            }
        });

        if (!upstream.ok) {
            return sourceUnavailable(res, upstream.status === 404 ? 404 : 502);
        }

        const declaredLength = Number(upstream.headers.get('content-length') || 0);
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

        const body = Buffer.from(await upstream.arrayBuffer());
        if (body.byteLength > source.maxBytes) {
            return res.status(413).json({ error: 'PGN collection exceeds safety limit' });
        }

        if (kind === 'event') {
            if (!body.includes(Buffer.from('[Event ')) || !body.includes(Buffer.from('[White ')) || !body.includes(Buffer.from('[Black '))) {
                return sourceUnavailable(res);
            }
        } else if (body.byteLength < 4 || body[0] !== 0x50 || body[1] !== 0x4b) {
            return sourceUnavailable(res);
        }

        return res.status(200).send(body);
    } catch (_) {
        return sourceUnavailable(res);
    }
}
