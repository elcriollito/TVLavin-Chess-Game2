import fs from 'node:fs';
import { setCorsHeaders } from '../_lib/auth.js';
import { checkRateLimit } from '../_lib/rate-limit.js';
import { getPgnPlayerOffer } from '../_lib/pgn-player-offers.js';

function requestKey(req) {
    const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    return forwarded || String(req.socket?.remoteAddress || 'anonymous-player-library');
}

export default async function handler(req, res) {
    if (!setCorsHeaders(req, res, ['GET'])) return;
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const rl = checkRateLimit(requestKey(req), { windowMs: 60 * 1000, max: 30, prefix: 'pgn-player-free' });
    if (!rl.allowed) return res.status(429).json({ error: 'Too many album requests.', retryAfter: rl.retryAfter });

    const albumId = Array.isArray(req.query?.album) ? '' : String(req.query?.album || '');
    const offer = getPgnPlayerOffer(albumId);
    if (!offer) return res.status(404).json({ code: 'UNKNOWN_PLAYER_ALBUM', error: 'Player album not found.' });
    let stat;
    try { stat = fs.statSync(offer.filePath); }
    catch (_) { return res.status(503).json({ error: 'The collection is temporarily unavailable.' }); }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/x-chess-pgn; charset=utf-8');
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('Content-Disposition', `inline; filename="${offer.fileName.replace(/["\\]/g, '')}"`);
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('X-CAISSA-PGN-Access', 'free-player-library');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return fs.createReadStream(offer.filePath).pipe(res);
}
