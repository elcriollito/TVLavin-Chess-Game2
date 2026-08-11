import crypto from 'node:crypto';

const MAX_CHALLENGE_TTL_MS = 15 * 60 * 1000;

function sha256(value) {
    return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

export async function createMigrationHandoff({
    supabase,
    existingAccount,
    verifiedProductionSubject,
    proofMethod = 'DUAL_AUTH',
    ttlMs = 10 * 60 * 1000,
    now = Date.now()
}) {
    if (!existingAccount?.userId || !existingAccount?.legacySubject || !verifiedProductionSubject) {
        return { ok: false, code: 'VERIFIED_IDENTITIES_REQUIRED' };
    }
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > MAX_CHALLENGE_TTL_MS) {
        return { ok: false, code: 'INVALID_EXPIRY' };
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = sha256(token);
    const expiresAt = new Date(now + ttlMs).toISOString();
    const { data, error } = await supabase.rpc('create_clerk_migration_challenge', {
        p_user_id: existingAccount.userId,
        p_legacy_subject: existingAccount.legacySubject,
        p_expected_new_subject: verifiedProductionSubject,
        p_token_hash: tokenHash,
        p_expires_at: expiresAt,
        p_proof_method: proofMethod
    });

    if (error) return { ok: false, code: 'IDENTITY_SERVICE_UNAVAILABLE' };
    const result = data?.[0] || data;
    if (!result?.success) return { ok: false, code: result?.code || 'CHALLENGE_REJECTED' };

    return {
        ok: true,
        code: result.code,
        challengeId: result.challenge_id,
        token,
        expiresAt
    };
}

export async function activateMigrationHandoff({ supabase, token, verifiedProductionSubject }) {
    if (!token || !verifiedProductionSubject) {
        return { ok: false, code: 'VERIFIED_IDENTITIES_REQUIRED' };
    }

    const { data, error } = await supabase.rpc('activate_clerk_identity_binding', {
        p_token_hash: sha256(token),
        p_new_external_subject: verifiedProductionSubject
    });
    if (error) return { ok: false, code: 'IDENTITY_SERVICE_UNAVAILABLE' };
    const result = data?.[0] || data;
    return {
        ok: result?.success === true,
        code: result?.code || 'CHALLENGE_REJECTED',
        userId: result?.user_id || null,
        bindingId: result?.binding_id || null
    };
}

export async function rollbackIdentityBinding({ supabase, trustedUserId, reason }) {
    if (!trustedUserId || typeof reason !== 'string' || reason.trim().length < 8) {
        return { ok: false, code: 'ROLLBACK_REASON_REQUIRED' };
    }
    const { data, error } = await supabase.rpc('rollback_clerk_identity_binding', {
        p_user_id: trustedUserId,
        p_reason: reason.trim()
    });
    if (error) return { ok: false, code: 'IDENTITY_SERVICE_UNAVAILABLE' };
    const result = data?.[0] || data;
    return { ok: result?.success === true, code: result?.code || 'ROLLBACK_REJECTED' };
}

export const identityMigrationInternals = Object.freeze({ sha256, maxChallengeTtlMs: MAX_CHALLENGE_TTL_MS });
