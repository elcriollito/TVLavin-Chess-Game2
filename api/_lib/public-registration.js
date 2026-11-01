import { createClerkClient } from '@clerk/backend';
import { isIdentityOwnershipEnforced, clerkAuthorityFromEnvironment } from './identity-ownership.js';
import { getSupabaseServerKey, getSupabaseUrl } from './supabase.js';

const REGISTRATION_MODE = 'open';
const STAGING_REF = 'aqizagaskicotorfpwfn';
const PRODUCTION_REF = 'jczauvkfkweuvdpurpem';
const DEFAULT_CLERK_TIMEOUT_MS = 3_000;
const MISSING_RESOURCE_STATUSES = new Set([400, 404, 410, 422]);

export function publicRegistrationEnvironment(env = process.env) {
    if (String(env.CAISSA_PUBLIC_REGISTRATION_MODE || '').trim() !== REGISTRATION_MODE
        || !isIdentityOwnershipEnforced(env)) return null;

    const authority = clerkAuthorityFromEnvironment(env);
    if (String(env.CAISSA_CLERK_AUTHORITY || '').trim() !== authority) return null;
    const expectedProjectRef = authority === 'production'
        ? PRODUCTION_REF
        : authority === 'legacy_development' ? STAGING_REF : '';
    const projectRef = supabaseProjectRef(getSupabaseUrl(env));
    if (!expectedProjectRef || projectRef !== expectedProjectRef) return null;

    const secretKey = String(env.CLERK_SECRET_KEY || '').trim();
    if (!clerkSecretMatchesAuthority(secretKey, authority)) return null;
    try {
        if (!getSupabaseServerKey(env)) return null;
    } catch {
        return null;
    }
    return Object.freeze({ authority, projectRef });
}

export function isPublicRegistrationOpen(env = process.env) {
    return publicRegistrationEnvironment(env) !== null;
}

export async function enrollPublicRegistration({
    db,
    auth,
    env = process.env,
    createClerkClient: makeClerkClient = createClerkClient,
    clerkTimeoutMs = DEFAULT_CLERK_TIMEOUT_MS,
    log
}) {
    const environment = publicRegistrationEnvironment(env);
    if (!environment || auth?.authority !== environment.authority) {
        return { attempted: false, ok: false, status: 409, code: 'IDENTITY_RESOLUTION_REQUIRED' };
    }
    if (!auth?.authenticated || typeof auth.userId !== 'string' || !auth.userId
        || typeof auth.sessionId !== 'string' || !auth.sessionId) {
        return { attempted: true, ok: false, status: 401, code: 'INVALID_TOKEN' };
    }

    const secretKey = String(env.CLERK_SECRET_KEY || '').trim();
    let clerkUser;
    let clerkSession;
    try {
        const clerk = makeClerkClient({ secretKey });
        if (typeof clerk?.users?.getUser !== 'function'
            || typeof clerk?.sessions?.getSession !== 'function') {
            throw new TypeError('Clerk Backend API client unavailable');
        }
        [clerkUser, clerkSession] = await withTimeout(
            () => Promise.all([
                clerk.users.getUser(auth.userId),
                clerk.sessions.getSession(auth.sessionId)
            ]),
            clerkTimeoutMs
        );
    } catch (error) {
        if (MISSING_RESOURCE_STATUSES.has(Number(error?.status))) {
            return { attempted: true, ok: false, status: 409, code: 'REGISTRATION_REVIEW_REQUIRED' };
        }
        safeWarn(log, 'public_registration_clerk_lookup_unavailable', error);
        return { attempted: true, ok: false, status: 503, code: 'REGISTRATION_SERVICE_UNAVAILABLE' };
    }

    if (!validActiveSession(clerkSession, auth) || !validClerkUser(clerkUser, auth.userId)) {
        return { attempted: true, ok: false, status: 409, code: 'REGISTRATION_REVIEW_REQUIRED' };
    }

    const primaryEmail = verifiedPrimaryEmail(clerkUser);
    if (!primaryEmail) {
        return { attempted: true, ok: false, status: 409, code: 'REGISTRATION_VERIFICATION_REQUIRED' };
    }

    const { data, error } = await db.rpc('register_caissa_clerk_identity', {
        p_external_subject: auth.userId,
        p_email: primaryEmail,
        p_email_key: primaryEmail.toLowerCase(),
        p_environment: environment.authority
    });
    if (error) {
        safeWarn(log, 'public_registration_database_unavailable', error);
        return { attempted: true, ok: false, status: 503, code: 'REGISTRATION_SERVICE_UNAVAILABLE' };
    }

    const result = data?.[0] || data;
    if (result?.success !== true || !result?.user_id || !result?.binding_id) {
        return {
            attempted: true,
            ok: false,
            status: 409,
            code: result?.code === 'REGISTRATION_INPUT_INVALID'
                ? 'REGISTRATION_VERIFICATION_REQUIRED'
                : 'REGISTRATION_REVIEW_REQUIRED'
        };
    }

    return Object.freeze({
        attempted: true,
        ok: true,
        status: 200,
        code: result.code || 'REGISTRATION_COMPLETED',
        userId: result.user_id,
        bindingId: result.binding_id,
        verifiedEmail: primaryEmail
    });
}

export function respondPublicRegistrationFailure(res, result) {
    if (result?.status === 401) {
        return res.status(401).json({ code: 'INVALID_TOKEN', error: 'Authentication required.' });
    }
    if (result?.status === 503) {
        return res.status(503).json({
            code: 'REGISTRATION_SERVICE_UNAVAILABLE',
            error: 'Account setup is temporarily unavailable.',
            recoverable: true
        });
    }
    const verification = result?.code === 'REGISTRATION_VERIFICATION_REQUIRED';
    return res.status(409).json({
        code: verification ? 'REGISTRATION_VERIFICATION_REQUIRED' : 'REGISTRATION_REVIEW_REQUIRED',
        error: verification
            ? 'Verify the primary email address before completing account setup.'
            : 'This account requires secure review before registration can continue.',
        recoverable: true
    });
}

function verifiedPrimaryEmail(user) {
    const primaryId = typeof user?.primaryEmailAddressId === 'string'
        ? user.primaryEmailAddressId : '';
    const addresses = Array.isArray(user?.emailAddresses) ? user.emailAddresses : [];
    const primary = addresses.find(address => address?.id === primaryId);
    const email = String(primary?.emailAddress || '').trim();
    if (!primary || primary?.verification?.status !== 'verified'
        || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) return '';
    return email;
}

function validClerkUser(user, expectedUserId) {
    return Boolean(user && user.id === expectedUserId && user.banned !== true && user.locked !== true);
}

function validActiveSession(session, auth) {
    return Boolean(session && session.id === auth.sessionId
        && session.userId === auth.userId && session.status === 'active');
}

function clerkSecretMatchesAuthority(secretKey, authority) {
    return authority === 'production' ? secretKey.startsWith('sk_live_')
        : authority === 'legacy_development' ? secretKey.startsWith('sk_test_') : false;
}

function supabaseProjectRef(url) {
    try {
        const hostname = new URL(url).hostname;
        return hostname.endsWith('.supabase.co') ? hostname.split('.')[0] : '';
    } catch {
        return '';
    }
}

async function withTimeout(factory, timeoutMs) {
    let timer;
    try {
        return await Promise.race([
            Promise.resolve().then(factory),
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('Clerk Backend API timeout')), timeoutMs);
            })
        ]);
    } finally {
        clearTimeout(timer);
    }
}

function safeWarn(log, event, error) {
    const diagnostic = [error?.name, error?.status || error?.code].filter(Boolean).join(':') || 'unknown';
    if (typeof log === 'function') log(`${event}:${diagnostic}`);
    else if (typeof log?.warn === 'function') log.warn(event, diagnostic);
}
