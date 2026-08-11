/**
 * Vercel Serverless Function: GET /api/wallet
 *
 * Returns wallet state for the authenticated user.
 */

import { verifyAuth, setCorsHeaders } from './_lib/auth.js';
import { getSupabase } from './_lib/supabase.js';
import { logError } from './_lib/logger.js';

export default async function handler(req, res) {
    if (!setCorsHeaders(req, res, ['GET'])) return;

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    // Verify Clerk token
    const auth = await verifyAuth(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    try {
        const supabase = getSupabase();

        const { data, error } = await supabase
            .from('users')
            .select('credits, is_premium, role')
            .eq('clerk_id', auth.userId)
            .single();

        if (error || !data) {
            // User not synced yet — return defaults
            return res.status(200).json({
                credits: 0,
                isPremium: false,
                role: 'member'
            });
        }

        return res.status(200).json({
            credits: data.credits,
            isPremium: data.is_premium,
            role: data.role
        });

    } catch (err) {
        logError('wallet_fetch', err, { userId: auth.userId });
        return res.status(500).json({ error: 'Failed to fetch wallet' });
    }
}
