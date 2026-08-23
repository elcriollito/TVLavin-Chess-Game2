import { verifyAuth, respondAuthFailure, setCorsHeaders } from '../_lib/auth.js';
import { getSupabase } from '../_lib/supabase.js';
import { checkRateLimit } from '../_lib/rate-limit.js';
import { isPlayerAlbumCommerceEnabled } from '../_lib/pgn-player-offers.js';

export default async function handler(req, res, dependencies = {}) {
    if (!setCorsHeaders(req, res, ['GET'])) return;
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const auth = await (dependencies.verifyAuth || verifyAuth)(req);
    if (!auth.authenticated) return respondAuthFailure(res, auth);
    const rl = checkRateLimit(auth.userId, { windowMs: 60 * 1000, max: 30, prefix: 'pgn-entitlements' });
    if (!rl.allowed) return res.status(429).json({ error: 'Too many requests.', retryAfter: rl.retryAfter });

    const supabase = (dependencies.getSupabase || getSupabase)();
    const { data: user, error: userError } = await supabase
        .from('users').select('id, credits').eq('clerk_id', auth.userId).single();
    if (userError || !user?.id) return res.status(409).json({ code: 'ACCOUNT_SYNC_REQUIRED', error: 'CAISSA account synchronization is required.' });

    const { data, error } = await supabase
        .from('player_album_entitlements').select('album_id').eq('user_id', user.id);
    if (error) return res.status(503).json({ code: 'ENTITLEMENTS_UNAVAILABLE', error: 'Album ownership is temporarily unavailable.' });

    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(200).json({
        credits: user.credits,
        ownedAlbumIds: (data || []).map(row => row.album_id),
        commerceEnabled: isPlayerAlbumCommerceEnabled()
    });
}
