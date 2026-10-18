const OWNERSHIP_MODE = 'enforced';
const AUTHORITY_ENVIRONMENTS = new Set(['legacy_development', 'production']);

export function isIdentityOwnershipEnforced(env = process.env) {
    return env.CAISSA_IDENTITY_OWNERSHIP_MODE === OWNERSHIP_MODE;
}

export function clerkAuthorityFromEnvironment(env = process.env) {
    const configured = String(env.CAISSA_CLERK_AUTHORITY || '').trim();
    const publishable = String(
        env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || env.CLERK_PUBLISHABLE_KEY || ''
    ).trim();
    const secret = String(env.CLERK_SECRET_KEY || '').trim();
    const inferred = [
        publishable.startsWith('pk_live_') ? 'production'
            : publishable.startsWith('pk_test_') ? 'legacy_development' : null,
        secret.startsWith('sk_live_') ? 'production'
            : secret.startsWith('sk_test_') ? 'legacy_development' : null
    ].filter(Boolean);
    if (new Set(inferred).size > 1) return null;
    const keyAuthority = inferred[0] || null;
    if (configured) {
        if (!AUTHORITY_ENVIRONMENTS.has(configured)) return null;
        if (keyAuthority && configured !== keyAuthority) return null;
        return configured;
    }
    return keyAuthority;
}

export async function resolveVerifiedIdentityOwnership({
    db,
    auth,
    env = process.env
}) {
    const externalSubject = String(auth?.userId || '').trim();
    const authority = auth?.authority || clerkAuthorityFromEnvironment(env);
    if (!externalSubject || !AUTHORITY_ENVIRONMENTS.has(authority)) {
        return { ok: false, status: 503, code: 'IDENTITY_AUTHORITY_UNAVAILABLE' };
    }

    const { data, error } = await db.rpc('resolve_caissa_identity_ownership', {
        p_external_subject: externalSubject,
        p_environment: authority
    });
    if (error) return { ok: false, status: 503, code: 'IDENTITY_SERVICE_UNAVAILABLE' };

    const result = data?.[0] || data;
    if (!result || typeof result.ownership_state !== 'string') {
        return { ok: false, status: 503, code: 'IDENTITY_SERVICE_UNAVAILABLE' };
    }
    if (result.ownership_state === 'VERIFIED' && result.user_id) {
        return Object.freeze({
            ok: true,
            status: 200,
            code: 'IDENTITY_OWNERSHIP_VERIFIED',
            userId: result.user_id,
            bindingId: result.binding_id || null,
            authority
        });
    }
    if (['REVIEW_REQUIRED', 'QUARANTINED'].includes(result.ownership_state)) {
        return {
            ok: false,
            status: 409,
            code: 'OWNERSHIP_REVIEW_REQUIRED',
            reviewState: result.ownership_state
        };
    }
    return { ok: false, status: 409, code: 'IDENTITY_RESOLUTION_REQUIRED' };
}

export function respondIdentityOwnershipFailure(res, result) {
    const status = [409, 503].includes(result?.status) ? result.status : 409;
    const unavailable = status === 503;
    return res.status(status).json({
        code: unavailable ? 'IDENTITY_SERVICE_UNAVAILABLE' : result?.code || 'OWNERSHIP_REVIEW_REQUIRED',
        error: unavailable
            ? 'Account identity verification is temporarily unavailable.'
            : 'Account ownership must be reviewed before this operation.',
        recoverable: true
    });
}
