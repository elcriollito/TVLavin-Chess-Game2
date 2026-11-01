import { createClient } from '@supabase/supabase-js';
import { authenticateRequest } from './auth.js';
import { getSupabasePublishableKey, getSupabaseUrl } from './supabase.js';

const UUID_SUBJECT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const failure = (status, code) => ({
    authenticated: false,
    ok: false,
    status,
    code,
    error: status === 503 ? 'Authentication service unavailable.' : 'Authentication required.'
});

export function createOnlineAuthenticator(options = {}) {
    const env = options.env || process.env;
    const authenticateMember = options.authenticateMember || authenticateRequest;
    const authenticateGuest = options.authenticateGuest || createSupabaseGuestAuthenticator({ env });
    const expectedIssuer = supabaseIssuer(env);

    return async function authenticateOnlineRequest(req) {
        const token = bearerToken(req);
        if (guestPlayEnabled(env) && token && unverifiedIssuer(token) === expectedIssuer) {
            return authenticateGuest(req);
        }
        const auth = await authenticateMember(req);
        return auth?.authenticated ? { ...auth, guest: false, identityType: 'member' } : auth;
    };
}

export function createSupabaseGuestAuthenticator(options = {}) {
    const env = options.env || process.env;
    const url = getSupabaseUrl(env);
    const key = getSupabasePublishableKey(env);
    const client = options.client || (url && key ? createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    }) : null);
    const expectedIssuer = supabaseIssuer(env);

    return async function authenticateGuest(req) {
        const token = bearerToken(req);
        if (!token) return failure(401, 'AUTH_REQUIRED');
        if (!guestPlayEnabled(env) || !client || !expectedIssuer) return failure(503, 'AUTH_SERVICE_UNAVAILABLE');
        try {
            const { data, error } = await client.auth.getClaims(token);
            const claims = data?.claims;
            const audience = Array.isArray(claims?.aud) ? claims.aud : [claims?.aud];
            if (error || !claims
                || claims.iss !== expectedIssuer
                || claims.role !== 'authenticated'
                || claims.is_anonymous !== true
                || !audience.includes('authenticated')
                || !UUID_SUBJECT.test(String(claims.sub || ''))) {
                return failure(401, 'INVALID_TOKEN');
            }
            return {
                authenticated: true,
                ok: true,
                userId: claims.sub,
                email: null,
                guest: true,
                identityType: 'guest'
            };
        } catch (_) {
            return failure(503, 'AUTH_SERVICE_UNAVAILABLE');
        }
    };
}

export function isOnlineGuestSubject(value) {
    return UUID_SUBJECT.test(String(value || ''));
}

function bearerToken(req) {
    const header = req?.headers?.authorization || req?.headers?.Authorization;
    return typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function unverifiedIssuer(token) {
    try {
        const segment = token.split('.')[1];
        if (!segment) return '';
        const payload = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
        return typeof payload?.iss === 'string' ? payload.iss : '';
    } catch (_) {
        return '';
    }
}

function guestPlayEnabled(env) {
    return env.CAISSA_ONLINE_GUESTS === '1';
}

function supabaseIssuer(env) {
    const url = getSupabaseUrl(env);
    return url ? `${url}/auth/v1` : '';
}
