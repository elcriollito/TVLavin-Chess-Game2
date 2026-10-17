import crypto from 'node:crypto';

const MAX_CHALLENGE_TTL_MS = 15 * 60 * 1000;

function sha256(value) {
    return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

export async function createMigrationHandoff({
    supabase,
    existingAccount,
    verifiedProductionSubject,
    challengeToken,
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

    if (challengeToken !== undefined
        && (typeof challengeToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(challengeToken))) {
        return { ok: false, code: 'INVALID_CHALLENGE_TOKEN' };
    }

    const token = challengeToken || crypto.randomBytes(32).toString('base64url');
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

export async function findPendingMigrationHandoff({
    supabase,
    verifiedProductionSubject,
    userId,
    challengeToken,
    proofMethod = 'SESSION_HANDOFF',
    now = Date.now()
}) {
    if (!supabase || typeof verifiedProductionSubject !== 'string' || !verifiedProductionSubject
        || !Number.isSafeInteger(now)
        || (userId !== undefined && (typeof userId !== 'string' || !userId))
        || (challengeToken !== undefined
            && (typeof challengeToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(challengeToken)))
        || (proofMethod !== undefined && (typeof proofMethod !== 'string' || !proofMethod))) {
        return { ok: false, code: 'INVALID_PENDING_CHALLENGE_LOOKUP' };
    }

    let query = supabase
        .from('identity_migration_challenges')
        .select('id, user_id, token_hash, proof_method, expires_at')
        .eq('expected_new_subject_hash', sha256(verifiedProductionSubject))
        .eq('status', 'PENDING')
        .gt('expires_at', new Date(now).toISOString());
    if (userId !== undefined) query = query.eq('user_id', userId);
    if (challengeToken !== undefined) query = query.eq('token_hash', sha256(challengeToken));
    if (proofMethod !== undefined) query = query.eq('proof_method', proofMethod);
    const { data, error } = await query.order('expires_at', { ascending: false }).limit(challengeToken ? 1 : 2);
    if (error) return { ok: false, code: 'IDENTITY_SERVICE_UNAVAILABLE' };
    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) return { ok: true, found: false };
    const row = rows[0];
    const expiresAt = Date.parse(String(row.expires_at || ''));
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
        return { ok: false, code: 'IDENTITY_SERVICE_UNAVAILABLE' };
    }
    return { ok: true, found: true, expiresAt: new Date(expiresAt).toISOString() };
}

export async function rollbackIdentityBinding({ supabase, trustedUserId, reason, confirmation }) {
    if (!trustedUserId || typeof reason !== 'string' || reason.trim().length < 20
        || confirmation !== `ROLLBACK ${trustedUserId}`) {
        return { ok: false, code: 'ROLLBACK_CONFIRMATION_REQUIRED' };
    }
    const { data, error } = await supabase.rpc('rollback_clerk_identity_binding_confirmed', {
        p_user_id: trustedUserId,
        p_reason: reason.trim(),
        p_confirmation: confirmation
    });
    if (error) return { ok: false, code: 'IDENTITY_SERVICE_UNAVAILABLE' };
    const result = data?.[0] || data;
    return { ok: result?.success === true, code: result?.code || 'ROLLBACK_REJECTED' };
}

export const identityMigrationInternals = Object.freeze({ sha256, maxChallengeTtlMs: MAX_CHALLENGE_TTL_MS });
