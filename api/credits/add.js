/**
 * Vercel Serverless Function: POST /api/credits/add
 *
 * Adds credits to a user's wallet via Supabase RPC.
 * Body: { clerkId?: string, amount: number, reason: string }
 *
 * Called by:
 * - Stripe webhook (with clerkId from metadata)
 * - Admin actions
 * - Self-serve (authenticated user adds to own wallet)
 */

import { verifyAuth, setCorsHeaders } from '../_lib/auth.js';
import { getSupabase } from '../_lib/supabase.js';

export default async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Verify Clerk token
    const auth = await verifyAuth(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const { clerkId, amount, reason } = req.body || {};

    // Determine target user — default to self
    const targetClerkId = clerkId || auth.userId;

    // Only allow adding to other users if caller is admin (future: check role)
    if (clerkId && clerkId !== auth.userId) {
        // For now, only self-serve is allowed. Stripe webhook uses its own path.
        return res.status(403).json({ error: 'Cannot add credits to other users' });
    }

    if (!amount || typeof amount !== 'number' || amount <= 0 || amount > 10000) {
        return res.status(400).json({ error: 'Invalid amount (must be 1-10000)' });
    }

    if (!reason || typeof reason !== 'string') {
        return res.status(400).json({ error: 'Missing reason' });
    }

    try {
        const supabase = getSupabase();

        const { data, error } = await supabase.rpc('add_credits', {
            p_clerk_id: targetClerkId,
            p_amount: amount,
            p_reason: reason
        });

        if (error) {
            console.error('Add credits RPC error:', error);
            return res.status(500).json({ error: 'Failed to add credits' });
        }

        const result = data?.[0] || data;

        if (!result || !result.success) {
            return res.status(404).json({ error: 'User not found' });
        }

        return res.status(200).json({
            success: true,
            credits: result.new_balance,
            added: amount,
            reason: reason
        });

    } catch (err) {
        console.error('Add credits exception:', err);
        return res.status(500).json({ error: err.message });
    }
}
