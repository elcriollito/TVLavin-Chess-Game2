import { setCorsHeaders } from '../_lib/auth.js';
import { checkRateLimit, getClientIP } from '../_lib/rate-limit.js';
import { logAction, logError } from '../_lib/logger.js';
import {
    buildPolyglotBookFromPgn,
    sanitizeBaseFileName,
    validatePgnMetadata
} from '../_lib/polyglot-builder.js';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const BUILD_TIMEOUT_MS = 90000;

export default async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const ip = getClientIP(req);
    const rate = checkRateLimit(ip, {
        prefix: 'polyglot-build',
        windowMs: 10 * 60 * 1000,
        max: 8
    });

    if (!rate.allowed) {
        res.setHeader('Retry-After', String(rate.retryAfter || 60));
        return res.status(429).json({ error: 'Rate limit exceeded. Please try again shortly.' });
    }

    try {
        const payload = await readJsonBody(req, MAX_UPLOAD_BYTES + 64 * 1024);
        const pgnText = typeof payload?.pgnText === 'string' ? payload.pgnText : '';
        const fileName = typeof payload?.fileName === 'string' ? payload.fileName : 'book.pgn';
        const contentType = typeof payload?.contentType === 'string' ? payload.contentType : '';
        const options = payload?.options || {};

        const metaValidation = validatePgnMetadata(fileName, contentType);
        if (!metaValidation.ok) {
            return res.status(400).json({ error: metaValidation.error });
        }

        const pgnByteLength = Buffer.byteLength(pgnText, 'utf8');
        if (pgnByteLength === 0) {
            return res.status(400).json({ error: 'PGN file is empty' });
        }
        if (pgnByteLength > MAX_UPLOAD_BYTES) {
            return res.status(413).json({ error: 'PGN exceeds 25MB upload limit' });
        }

        const { buffer, summary } = buildPolyglotBookFromPgn(pgnText, options, BUILD_TIMEOUT_MS);
        const outputName = `${sanitizeBaseFileName(fileName)}.bin`;

        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${outputName}"`);
        res.setHeader('Content-Length', String(buffer.length));
        res.setHeader('X-CAISSA-BIN-SIZE', String(buffer.length));
        res.setHeader('X-CAISSA-ENTRIES', String(summary.entriesWritten));
        res.setHeader('X-CAISSA-GAMES', String(summary.gamesParsed));
        res.setHeader('Cache-Control', 'no-store');

        logAction('polyglot_build', {
            detail: {
                ip,
                games: summary.gamesParsed,
                entries: summary.entriesWritten,
                outputBytes: buffer.length
            }
        });

        return res.status(200).send(buffer);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Build failed';
        const lowerMessage = message.toLowerCase();

        logError('polyglot_build', message, { detail: { ip } });

        if (lowerMessage.includes('timed out')) {
            return res.status(408).json({ error: 'Build timed out. Try a smaller PGN.' });
        }
        if (lowerMessage.includes('too large')) {
            return res.status(413).json({ error: 'Request payload too large' });
        }
        if (lowerMessage.includes('json')) {
            return res.status(400).json({ error: 'Invalid request payload' });
        }

        return res.status(400).json({ error: message || 'Failed to build Polyglot book' });
    }
}

async function readJsonBody(req, maxBytes) {
    if (req.body && typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') return JSON.parse(req.body);

    const chunks = [];
    let total = 0;

    for await (const chunk of req) {
        total += chunk.length;
        if (total > maxBytes) {
            throw new Error('Request body too large');
        }
        chunks.push(chunk);
    }

    const raw = Buffer.concat(chunks).toString('utf8');
    return JSON.parse(raw);
}
