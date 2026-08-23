import fs from 'node:fs';
import { verifyAuth, respondAuthFailure, setCorsHeaders } from '../_lib/auth.js';
import { getSupabase } from '../_lib/supabase.js';
import { checkRateLimit } from '../_lib/rate-limit.js';
import { getPgnPlayerOffer } from '../_lib/pgn-player-offers.js';

export default async function handler(req, res, dependencies = {}) {
    if (!setCorsHeaders(req, res, ['GET'])) return;
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const auth = await (dependencies.verifyAuth || verifyAuth)(req);
    if (!auth.authenticated) return respondAuthFailure(res, auth);
    const rl = checkRateLimit(auth.userId, { windowMs: 60 * 1000, max: 30, prefix: 'pgn-player' });
    if (!rl.allowed) return res.status(429).json({ error: 'Too many album requests.', retryAfter: rl.retryAfter });

    const albumId = Array.isArray(req.query?.album) ? '' : String(req.query?.album || '');
    const offer = getPgnPlayerOffer(albumId);
    if (!offer) return res.status(404).json({ code: 'UNKNOWN_PLAYER_ALBUM', error: 'Player album not found.' });

    const supabase = (dependencies.getSupabase || getSupabase)();
    const { data: user, error: userError } = await supabase
        .from('users').select('id').eq('clerk_id', auth.userId).single();
    if (userError || !user?.id) return res.status(403).json({ code: 'ALBUM_NOT_OWNED', error: 'Album ownership required.' });
    const { data: entitlement, error } = await supabase
        .from('player_album_entitlements').select('album_id')
        .eq('user_id', user.id).eq('album_id', offer.id).maybeSingle();
    if (error || !entitlement) return res.status(403).json({ code: 'ALBUM_NOT_OWNED', error: 'Album ownership required.' });

    let stat;
    try { stat = fs.statSync(offer.filePath); }
    catch (_) { return res.status(503).json({ error: 'The collection is temporarily unavailable.' }); }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/x-chess-pgn; charset=utf-8');
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('Content-Disposition', `inline; filename="${offer.fileName.replace(/["\\]/g, '')}"`);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return fs.createReadStream(offer.filePath).pipe(res);
}
