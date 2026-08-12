/**
 * Vercel Serverless Function: GET /api/wallet
 *
 * Returns wallet state for the authenticated user.
 */

import { verifyAuth, respondAuthFailure, setCorsHeaders } from './_lib/auth.js';
import { getSupabase } from './_lib/supabase.js';
import { logError } from './_lib/logger.js';

export default async function handler(req, res, dependencies = {}) {
    if (!setCorsHeaders(req, res, ['GET'])) return;

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    // Verify Clerk token
    const auth = await (dependencies.verifyAuth || verifyAuth)(req);
    if (!auth.authenticated) return respondAuthFailure(res, auth);

    try {
        const supabase = (dependencies.getSupabase || getSupabase)();

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
