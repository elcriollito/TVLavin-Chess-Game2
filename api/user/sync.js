/**
 * Vercel Serverless Function: POST /api/user/sync
 *
 * Upserts user in Supabase on sign-in.
 * Called by frontend after Clerk auth state changes.
 */

import { verifyAuth, respondAuthFailure, setCorsHeaders } from '../_lib/auth.js';
import { getSupabase } from '../_lib/supabase.js';
import { logAction, logError } from '../_lib/logger.js';
import {
    isIdentityMigrationEnforced,
    provisionApprovedIdentity,
    resolveIdentityForSync,
    syncResolvedIdentity
} from '../_lib/identity-resolution.js';
import {
    isIdentityOwnershipEnforced,
    resolveVerifiedIdentityOwnership,
    respondIdentityOwnershipFailure
} from '../_lib/identity-ownership.js';

export default async function handler(req, res, dependencies = {}) {
    if (!setCorsHeaders(req, res, ['POST'])) return;

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Verify Clerk token
    const authenticate = dependencies.verifyAuth || verifyAuth;
    const createSupabase = dependencies.getSupabase || getSupabase;
    const auth = await authenticate(req);
    if (!auth.authenticated) return respondAuthFailure(res, auth);

    try {
        const supabase = createSupabase();
        const env = dependencies.env || process.env;

        // Identity attributes come only from the verified Clerk session.
        const emailVal = (auth.email || '').trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const safeEmail = (emailVal && emailRegex.test(emailVal)) ? emailVal : null;

        if (isIdentityOwnershipEnforced(env)) {
            const ownership = await resolveOwnershipForSync({
                supabase,
                auth,
                env,
                email: safeEmail,
                dependencies
            });
            if (!ownership.ok) return respondIdentityOwnershipFailure(res, ownership);

            const { data, error } = await supabase
                .from('users')
                .update({ email: safeEmail, updated_at: new Date().toISOString() })
                .eq('id', ownership.userId)
                .eq('clerk_id', auth.userId)
                .select('clerk_id, email, role, is_premium, credits')
                .single();
            if (error || !data) {
                return res.status(503).json({
                    error: 'User sync is temporarily unavailable',
                    recoverable: true
                });
            }
            logAction('user_identity_ownership_synced');
            return res.status(200).json({ user: formatUser(data) });
        }

        if (isIdentityMigrationEnforced(env)) {
            const identityResult = await syncResolvedIdentity({
                supabase,
                externalSubject: auth.userId,
                email: safeEmail
            });

            if (!identityResult.ok) {
                const resolutionRequired = [
                    'IDENTITY_MIGRATION_REQUIRED',
                    'IDENTITY_RESOLUTION_REQUIRED',
                    'NEW_ACCOUNT_NOT_APPROVED',
                    'SUBJECT_ALREADY_BOUND'
                ].includes(identityResult.code);
                return res.status(resolutionRequired ? 409 : 503).json({
                    error: resolutionRequired
                        ? 'Account identity must be resolved before synchronization.'
                        : 'User sync is temporarily unavailable',
                    code: identityResult.code,
                    recoverable: true
                });
            }

            logAction('user_identity_synced');
            return res.status(200).json({ user: formatUser(identityResult.user) });
        }

        // Normal operation outside an explicitly enabled migration window.
        // Migration mode never reaches this upsert, preventing silent duplicates.
        const upsertData = {
            clerk_id: auth.userId,
            email: safeEmail,
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('users')
            .upsert(
                upsertData,
                { onConflict: 'clerk_id', ignoreDuplicates: false }
            )
            .select('clerk_id, email, role, is_premium, credits')
            .single();

        if (error) {
            logError('user_sync', error);
            return res.status(503).json({
                error: 'User sync is temporarily unavailable',
                recoverable: true
            });
        }

        logAction('user_synced');

        return res.status(200).json({ user: formatUser(data) });

    } catch (err) {
        logError('user_sync', err);
        return res.status(503).json({
            error: 'User sync is temporarily unavailable',
            recoverable: true
        });
    }
}

function formatUser(data) {
    return {
        clerkId: data.clerk_id,
        email: data.email,
        role: data.role,
        isPremium: data.is_premium,
        credits: data.credits
    };
}

async function resolveOwnershipForSync({ supabase, auth, env, email, dependencies }) {
    const resolveOwnership = dependencies.resolveIdentityOwnership || resolveVerifiedIdentityOwnership;
    let ownership = await resolveOwnership({ db: supabase, auth, env });
    if (ownership.ok) return ownership;

    // Ownership enforcement must not bypass the explicit enrollment decision.
    // Only a Production subject in the existing migration window may consume an
    // APPROVED_NEW decision, and the resulting binding is verified again before
    // any user row can be updated.
    const canProvisionApprovedNew = ownership.code === 'IDENTITY_RESOLUTION_REQUIRED'
        && auth.authority === 'production'
        && isIdentityMigrationEnforced(env);
    if (!canProvisionApprovedNew) return ownership;

    const resolveForSync = dependencies.resolveIdentityForSync || resolveIdentityForSync;
    const identity = await resolveForSync(supabase, auth.userId);
    if (!identity.ok) {
        return { ok: false, status: 503, code: 'IDENTITY_SERVICE_UNAVAILABLE' };
    }

    if (identity.resolution === 'APPROVED_NEW') {
        const provision = dependencies.provisionApprovedIdentity || provisionApprovedIdentity;
        const result = await provision(supabase, auth.userId, email);
        if (!result.ok && result.code !== 'SUBJECT_ALREADY_BOUND') {
            return {
                ok: false,
                status: result.code === 'IDENTITY_SERVICE_UNAVAILABLE' ? 503 : 409,
                code: result.code
            };
        }
    } else if (identity.resolution !== 'BOUND') {
        return ownership;
    }

    ownership = await resolveOwnership({ db: supabase, auth, env });
    return ownership;
}
