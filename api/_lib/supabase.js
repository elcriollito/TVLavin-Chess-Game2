/**
 * Shared Supabase client for Vercel serverless functions.
 * Uses service role key — server-side only, never exposed to client.
 */

import { createClient } from '@supabase/supabase-js';

let supabase = null;

export function getSupabase() {
    if (!supabase) {
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!url || !key) {
            throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
        }

        supabase = createClient(url, key);
    }
    return supabase;
}
