/**
 * Vercel Serverless Function: POST /api/user/sync
 *
 * Upserts user in Supabase on sign-in.
 * Called by frontend after Clerk auth state changes.
 */

import { verifyAuth, setCorsHeaders } from '../_lib/auth.js';
import { getSupabase } from '../_lib/supabase.js';
import { logAction, logError } from '../_lib/logger.js';

export default async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Verify Clerk token
    const auth = await verifyAuth(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    try {
        const supabase = getSupabase();
        const { email, fullName } = req.body || {};

        // Validate email format (non-critical — Clerk is source of truth)
        const emailVal = (email || auth.email || '').trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const safeEmail = (emailVal && emailRegex.test(emailVal)) ? emailVal : auth.email || null;

        // Sanitize fullName: strip HTML tags, limit to 100 chars
        const safeName = fullName
            ? String(fullName).replace(/<[^>]*>/g, '').trim().slice(0, 100)
            : null;

        // Upsert user by clerk_id
        const upsertData = {
            clerk_id: auth.userId,
            email: safeEmail,
            updated_at: new Date().toISOString()
        };
        if (safeName) upsertData.full_name = safeName;

        const { data, error } = await supabase
            .from('users')
            .upsert(
                upsertData,
                { onConflict: 'clerk_id', ignoreDuplicates: false }
            )
            .select('clerk_id, email, role, is_premium, credits')
            .single();

        if (error) {
            logError('user_sync', error, { userId: auth.userId });
            return res.status(500).json({ error: 'Failed to sync user' });
        }

        logAction('user_synced', { userId: auth.userId });

        return res.status(200).json({
            user: {
                clerkId: data.clerk_id,
                email: data.email,
                role: data.role,
                isPremium: data.is_premium,
                credits: data.credits
            }
        });

    } catch (err) {
        logError('user_sync', err, { userId: auth.userId });
        return res.status(500).json({ error: 'Failed to sync user' });
    }
}
