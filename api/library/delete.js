/**
 * Vercel Serverless Function: POST /api/library/delete
 *
 * Deletes positions or collections from the cloud for the authenticated user.
 * Body: { items: [{ local_id, type: 'position'|'collection' }] }
 * Returns: { deleted }
 */

import { verifyAuth, setCorsHeaders } from '../_lib/auth.js';
import { getSupabase } from '../_lib/supabase.js';
import { logAction, logError } from '../_lib/logger.js';

export default async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const auth = await verifyAuth(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Items array is required' });
    }

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
        let deleted = 0;

        for (const item of items.slice(0, 200)) {
            const table = item.type === 'collection' ? 'library_collections' : 'library_positions';
            const { error } = await supabase
                .from(table)
                .delete()
                .eq('user_id', userId)
                .eq('local_id', item.local_id || item.localId);

            if (!error) deleted++;
        }

        logAction('library_delete', { userId: auth.userId, detail: { deleted } });

        return res.status(200).json({ deleted });

    } catch (err) {
        logError('library_delete', err, { userId: auth.userId });
        return res.status(500).json({ error: 'Failed to delete library items' });
    }
}
