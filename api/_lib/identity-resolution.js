const MIGRATION_MODE = 'enforced';

export function isIdentityMigrationEnforced(env = process.env) {
    return env.CAISSA_IDENTITY_MIGRATION_MODE === MIGRATION_MODE;
}

export async function resolveIdentityForSync(supabase, externalSubject) {
    const { data, error } = await supabase.rpc('resolve_clerk_identity_for_sync', {
        p_external_subject: externalSubject
    });

    if (error) return { ok: false, code: 'IDENTITY_SERVICE_UNAVAILABLE' };
    const result = data?.[0] || data;
    if (!result?.resolution) return { ok: false, code: 'IDENTITY_SERVICE_UNAVAILABLE' };

    return {
        ok: true,
        resolution: result.resolution,
        userId: result.user_id || null
    };
}

export async function provisionApprovedIdentity(supabase, externalSubject, email) {
    const { data, error } = await supabase.rpc('provision_approved_clerk_identity', {
        p_external_subject: externalSubject,
        p_email: email || null
    });

    if (error) return { ok: false, code: 'IDENTITY_SERVICE_UNAVAILABLE' };
    const result = data?.[0] || data;
    return {
        ok: result?.success === true,
        code: result?.code || 'IDENTITY_SERVICE_UNAVAILABLE',
        userId: result?.user_id || null
    };
}

export async function syncResolvedIdentity({ supabase, externalSubject, email }) {
    const resolution = await resolveIdentityForSync(supabase, externalSubject);
    if (!resolution.ok) return resolution;

    if (resolution.resolution === 'MIGRATION_REQUIRED') {
        return { ok: false, code: 'IDENTITY_MIGRATION_REQUIRED' };
    }
    if (resolution.resolution === 'UNRESOLVED') {
        return { ok: false, code: 'IDENTITY_RESOLUTION_REQUIRED' };
    }

    let userId = resolution.userId;
    if (resolution.resolution === 'APPROVED_NEW') {
        const provision = await provisionApprovedIdentity(supabase, externalSubject, email);
        if (!provision.ok) return provision;
        userId = provision.userId;
    }

    if (!userId) return { ok: false, code: 'IDENTITY_SERVICE_UNAVAILABLE' };

    const { data, error } = await supabase
        .from('users')
        .update({ email: email || null, updated_at: new Date().toISOString() })
        .eq('id', userId)
        .eq('clerk_id', externalSubject)
        .select('clerk_id, email, role, is_premium, credits')
        .single();

    if (error || !data) return { ok: false, code: 'IDENTITY_SERVICE_UNAVAILABLE' };
    return { ok: true, code: 'IDENTITY_SYNCED', user: data };
}
