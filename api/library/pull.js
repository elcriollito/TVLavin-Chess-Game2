/**
 * Vercel Serverless Function: GET /api/library/pull
 *
 * Returns positions and collections modified after a given timestamp.
 * Query: ?since=ISO_TIMESTAMP (or 0 for full pull)
 * Returns: { positions, collections, serverTime }
 */

import { verifyAuth, setCorsHeaders } from '../_lib/auth.js';
import { getSupabase } from '../_lib/supabase.js';
import { logAction, logError } from '../_lib/logger.js';

export default async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const auth = await verifyAuth(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const since = req.query?.since || '1970-01-01T00:00:00Z';

    try {
        const supabase = getSupabase();

        // Resolve user UUID
        const { data: user, error: userErr } = await supabase
            .from('users')
            .select('id')
            .eq('clerk_id', auth.userId)
            .single();

        if (userErr || !user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userId = user.id;

        // Fetch positions modified after 'since'
        const { data: positions, error: posErr } = await supabase
            .from('library_positions')
            .select('*')
            .eq('user_id', userId)
            .gte('synced_at', since)
            .order('synced_at', { ascending: true })
            .limit(500);

        if (posErr) {
            logError('library_pull_positions', posErr, { userId: auth.userId });
        }

        // Fetch collections modified after 'since'
        const { data: collections, error: colErr } = await supabase
            .from('library_collections')
            .select('*')
            .eq('user_id', userId)
            .gte('synced_at', since)
            .order('synced_at', { ascending: true })
            .limit(200);

        if (colErr) {
            logError('library_pull_collections', colErr, { userId: auth.userId });
        }

        logAction('library_pull', {
            userId: auth.userId,
            detail: { positions: (positions || []).length, collections: (collections || []).length, since }
        });

        return res.status(200).json({
            positions: positions || [],
            collections: collections || [],
            serverTime: new Date().toISOString()
        });

    } catch (err) {
        logError('library_pull', err, { userId: auth.userId });
        return res.status(500).json({ error: 'Failed to fetch library data' });
    }
}
