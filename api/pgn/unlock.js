import { verifyAuth, respondAuthFailure, setCorsHeaders } from '../_lib/auth.js';
import { getSupabase } from '../_lib/supabase.js';
import { checkRateLimit } from '../_lib/rate-limit.js';
import { getPgnPlayerOffer, isPlayerAlbumCommerceEnabled } from '../_lib/pgn-player-offers.js';
import { logAction, logError } from '../_lib/logger.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req, res, dependencies = {}) {
    if (!setCorsHeaders(req, res, ['POST'])) return;
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const auth = await (dependencies.verifyAuth || verifyAuth)(req);
    if (!auth.authenticated) return respondAuthFailure(res, auth);
    if (!isPlayerAlbumCommerceEnabled()) {
        return res.status(503).json({ code: 'PLAYER_ALBUM_COMMERCE_NOT_ENABLED', error: 'Player album unlocks are not enabled yet.' });
    }
    const rl = checkRateLimit(auth.userId, { windowMs: 10 * 60 * 1000, max: 20, prefix: 'pgn-unlock' });
    if (!rl.allowed) return res.status(429).json({ error: 'Too many unlock attempts.', retryAfter: rl.retryAfter });

    const offer = getPgnPlayerOffer(req.body?.albumId);
    if (!offer) return res.status(400).json({ code: 'UNKNOWN_PLAYER_ALBUM', error: 'Unknown player album.' });
    const operationId = String(req.headers['idempotency-key'] || '');
    if (!UUID.test(operationId)) return res.status(400).json({ code: 'IDEMPOTENCY_KEY_REQUIRED', error: 'A valid idempotency key is required.' });

    try {
        const supabase = (dependencies.getSupabase || getSupabase)();
        const { data, error } = await supabase.rpc('unlock_player_album', {
            p_clerk_id: auth.userId,
            p_album_id: offer.id,
            p_operation_id: operationId
        });
        if (error) throw error;
        const result = data?.[0] || data;
        if (!result?.success) {
            const insufficient = result?.code === 'INSUFFICIENT_CREDITS';
            return res.status(insufficient ? 402 : 409).json({
                code: result?.code || 'UNLOCK_REJECTED',
                error: insufficient ? 'Insufficient credits.' : 'The album could not be unlocked.',
                credits: result?.credits ?? 0
            });
        }
        logAction('player_album_unlocked', { userId: auth.userId, detail: { albumId: offer.id, cost: offer.credits } });
        return res.status(200).json({ success: true, albumId: offer.id, owned: true, credits: result.credits });
    } catch (error) {
        logError('player_album_unlock', error, { userId: auth.userId, detail: { albumId: offer.id } });
        return res.status(503).json({ code: 'UNLOCK_UNAVAILABLE', error: 'Album unlock is temporarily unavailable.' });
    }
}
