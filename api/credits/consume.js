/**
 * Vercel Serverless Function: POST /api/credits/consume
 *
 * Atomically deducts credits for a feature via Supabase RPC.
 * Body: { feature: string }
 */

import { verifyAuth, setCorsHeaders } from '../_lib/auth.js';
import { getSupabase } from '../_lib/supabase.js';
import { checkRateLimit } from '../_lib/rate-limit.js';
import { logAction, logError } from '../_lib/logger.js';

// Feature cost mapping (must match FEATURE_RULES in caissa-access.js)
const FEATURE_COSTS = {
    mentor_chat: 1,
    insight: 2,
    batch_analysis: 1,
    game_review: 2
};

export default async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Verify Clerk token
    const auth = await verifyAuth(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    // Rate limit: 20 requests per 5 minutes per user
    const rl = checkRateLimit(auth.userId, { windowMs: 5 * 60 * 1000, max: 20, prefix: 'consume' });
    if (!rl.allowed) {
        return res.status(429).json({ error: 'Too many requests. Please try again later.', retryAfter: rl.retryAfter });
    }

    const { feature } = req.body || {};

    if (!feature || !FEATURE_COSTS[feature]) {
        return res.status(400).json({ error: 'Invalid or missing feature name' });
    }

    const cost = FEATURE_COSTS[feature];

    try {
        const supabase = getSupabase();

        // Call atomic RPC
        const { data, error } = await supabase.rpc('consume_credits', {
            p_clerk_id: auth.userId,
            p_cost: cost,
            p_action: feature
        });

        if (error) {
            logError('credits_consume', error, { userId: auth.userId });
            return res.status(500).json({ error: 'Failed to consume credits' });
        }

        const result = data?.[0] || data;

        if (!result || !result.success) {
            return res.status(402).json({
                error: 'Insufficient credits',
                credits: result?.new_balance ?? 0,
                message: result?.message || 'Not enough credits'
            });
        }

        logAction('credits_consumed', { userId: auth.userId, detail: { feature, cost, balance: result.new_balance } });

        return res.status(200).json({
            success: true,
            credits: result.new_balance,
            consumed: cost,
            feature: feature
        });

    } catch (err) {
        logError('credits_consume', err, { userId: auth.userId });
        return res.status(500).json({ error: 'Failed to consume credits' });
    }
}
