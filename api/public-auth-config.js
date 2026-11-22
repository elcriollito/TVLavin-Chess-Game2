import { ownerHandoffOrigins } from './_lib/identity-owner-handoff.js';
import { isIdentityMigrationEnforced } from './_lib/identity-resolution.js';
import { isPublicRegistrationOpen } from './_lib/public-registration.js';

/**
 * Public auth configuration for the browser.
 *
 * Only returns safe-to-expose values. Secret keys remain server-side.
 */

export default function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const clerkPublishableKeyCandidates = [
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
        process.env.CLERK_PUBLISHABLE_KEY
    ].map(value => String(value || '').trim()).filter(isValidClerkPublishableKey);

    const clerkPublishableKey =
        clerkPublishableKeyCandidates.find((key) => String(key).startsWith('pk_live_')) ||
        clerkPublishableKeyCandidates[0] ||
        '';

    const clerkProxyUrl = publicClerkProxyUrl(req, process.env);
    if (!isClerkRequestOriginCompatible(req, clerkPublishableKey, clerkProxyUrl)) {
        return res.status(503).json({ error: 'AUTH_ORIGIN_INCOMPATIBLE' });
    }

    const supabaseUrl =
        process.env.SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL ||
        '';

    return res.status(200).json({
        clerkPublishableKey,
        clerkProxyUrl,
        authDefaultDestination: publicAuthDefaultDestination(process.env),
        registrationTracking: Boolean(
            process.env.CLERK_SECRET_KEY &&
            supabaseUrl &&
            (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
        ),
        registrationOpen: isPublicRegistrationOpen(process.env),
        identityOwnerHandoff: publicOwnerHandoffMetadata(process.env)
    });
}

export function publicClerkProxyUrl(req, env = process.env) {
    const candidate = String(env.CAISSA_CLERK_PROXY_URL || '').trim();
    if (!candidate) return '';

    const requestHost = requestHostname(req);
    if (!requestHost) return '';
    if (/^\/(?![\\/])/.test(candidate) && isSafeClerkProxyPath(candidate)) {
        try {
            const parsed = new URL(candidate, `https://${requestHost}`);
            if (parsed.origin !== `https://${requestHost}` || parsed.search || parsed.hash) return '';
            return parsed.pathname.replace(/\/$/, '');
        } catch {
            return '';
        }
    }

    try {
        const parsed = new URL(candidate);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port
            || parsed.hostname.toLowerCase() !== requestHost || parsed.search || parsed.hash
            || !isSafeClerkProxyPath(parsed.pathname)) return '';
        return parsed.href.replace(/\/$/, '');
    } catch {
        return '';
    }
}

function isSafeClerkProxyPath(value) {
    const path = String(value || '');
    if (path.length < 2 || path.length > 256 || !/^\/[A-Za-z0-9._~/-]+$/.test(path)) return false;
    return !path.split('/').some(segment => segment === '.' || segment === '..');
}

export function isClerkRequestOriginCompatible(req, publishableKey, proxyUrl = '') {
    if (!String(publishableKey || '').startsWith('pk_live_')) return true;
    if (proxyUrl) return true;

    const requestHost = requestHostname(req);
    if (!requestHost) return true;
    const frontendHost = clerkPublishableKeyFrontendHost(publishableKey);
    if (!frontendHost) return false;

    const applicationRoot = frontendHost.startsWith('clerk.')
        ? frontendHost.slice('clerk.'.length)
        : frontendHost;
    return requestHost === applicationRoot || requestHost.endsWith(`.${applicationRoot}`);
}

export function clerkPublishableKeyFrontendHost(value) {
    if (!isValidClerkPublishableKey(value)) return '';
    try {
        const encoded = String(value).trim().replace(/^pk_(?:test|live)_/, '');
        const decoded = Buffer.from(encoded, 'base64url').toString('utf8').replace(/\$$/, '');
        return /^[a-z0-9.-]+$/i.test(decoded) ? decoded.toLowerCase() : '';
    } catch {
        return '';
    }
}

function requestHostname(req) {
    const raw = String(req?.headers?.host || req?.headers?.['x-forwarded-host'] || '')
        .split(',')[0]
        .trim()
        .toLowerCase();
    if (!raw || /[\u0000-\u001f\u007f\\/]/.test(raw)) return '';
    try {
        return new URL(`https://${raw}`).hostname.toLowerCase();
    } catch {
        return '';
    }
}

const BLOCKED_AUTH_REDIRECT_PATHS = Object.freeze(['/api', '/internal', '/debug', '/qa', '/admin', '/auth']);

export function publicAuthDefaultDestination(env = process.env) {
    const candidate = String(env.CAISSA_AUTH_DEFAULT_DESTINATION || '').trim();
    if (!candidate || candidate.length > 2048 || !/^\/(?![\\/])/.test(candidate)
        || candidate.includes('\\') || /[\u0000-\u001f\u007f]/.test(candidate)
        || /%(?:0[0-9a-f]|1[0-9a-f]|7f|2f|5c|25)/i.test(candidate)) return '/';
    try {
        const parsed = new URL(candidate, 'https://caissa.invalid');
        const path = parsed.pathname.toLowerCase();
        if (parsed.origin !== 'https://caissa.invalid'
            || BLOCKED_AUTH_REDIRECT_PATHS.some(prefix => path === prefix || path.startsWith(`${prefix}/`))) return '/';
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
        return '/';
    }
}

export function publicOwnerHandoffMetadata(env = process.env) {
    if (!isIdentityMigrationEnforced(env)) return null;
    try {
        const origins = ownerHandoffOrigins(env);
        return Object.freeze({
            productionOrigin: origins.production,
            legacyOrigin: origins.legacy
        });
    } catch {
        return null;
    }
}

export function isValidClerkPublishableKey(value) {
    if (typeof value !== 'string') return false;
    const key = value.trim();
    if (key.length < 24 || key.length > 512 || !/^pk_(?:test|live)_[A-Za-z0-9_-]+$/.test(key)) return false;
    return !/(?:replace(?:_with)?_your_key|placeholder|change(?:me|_me)|dummy|example)/i.test(key);
}
