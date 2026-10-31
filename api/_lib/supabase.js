/**
 * Shared Supabase client for Vercel serverless functions.
 * Uses service role key — server-side only, never exposed to client.
 */

import { createClient } from '@supabase/supabase-js';

let supabase = null;

export function getSupabase() {
    if (!supabase) {
        const url = getSupabaseUrl(process.env);
        const key = getSupabaseServerKey(process.env);

        if (!url || !key) {
            throw new Error('Missing Supabase server URL or secret key env vars');
        }

        supabase = createClient(url, key, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
        });
    }
    return supabase;
}

export function getSupabaseUrl(env = process.env) {
    return String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
}

export function getSupabaseServerKey(env = process.env) {
    const modern = String(env.SUPABASE_SECRET_KEY || '').trim();
    if (modern) {
        if (!modern.startsWith('sb_secret_')) throw new Error('SUPABASE_SECRET_KEY_INVALID_CLASS');
        return modern;
    }

    const legacy = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!legacy) return '';
    if (legacyJwtRole(legacy) !== 'service_role') {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY_INVALID_CLASS');
    }
    return legacy;
}

export function getSupabasePublishableKey(env = process.env) {
    const key = String(
        env.SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
        || env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    ).trim();
    if (!key) return '';
    if (key.startsWith('sb_publishable_') || legacyJwtRole(key) === 'anon') return key;
    return '';
}

function legacyJwtRole(value) {
    try {
        const parts = String(value).split('.');
        if (parts.length !== 3) return '';
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        return typeof payload?.role === 'string' ? payload.role : '';
    } catch (_) {
        return '';
    }
}
