import { getSupabase } from '../../_lib/supabase.js';
import { createMigrationHandoff } from '../../_lib/identity-migration.js';
import { verifyDualMigrationTokens } from '../../_lib/clerk-migration-verifiers.js';
import { consumePersistentMigrationThrottle, fixedTokenHeader, prepareSensitiveJsonRoute, rejectSensitiveRoute } from '../../_lib/identity-migration-http.js';
import { setCorsHeaders } from '../../_lib/auth.js';

export function createChallengeHandler(dependencies = {}) {
    const getDatabase = dependencies.getSupabase || getSupabase;
    const verifyDual = dependencies.verifyDualMigrationTokens || verifyDualMigrationTokens;
    const createHandoff = dependencies.createMigrationHandoff || createMigrationHandoff;
    const consumeThrottle = dependencies.consumePersistentMigrationThrottle || consumePersistentMigrationThrottle;
    return async function handler(req, res) {
    if (!setCorsHeaders(req, res, ['POST'])) return;
    if (req.method === 'OPTIONS') return res.status(200).end();
    const guard = prepareSensitiveJsonRoute(req, res);
    if (!guard.ok) return rejectSensitiveRoute(res, guard);
    if (Object.keys(req.body || {}).length !== 0) return res.status(400).json({ error: 'Request rejected' });

    try {
        const supabase = getDatabase();
        const throttle = await consumeThrottle(supabase, req, 'challenge');
        if (throttle.unavailable) return res.status(503).json({ error: 'Identity migration unavailable' });
        if (!throttle.ok) {
            if (throttle.retryAfter) res.setHeader('Retry-After', String(throttle.retryAfter));
            return res.status(429).json({ error: 'Identity migration unavailable' });
        }

        const verified = await verifyDual({
            legacyToken: fixedTokenHeader(req, 'x-caissa-legacy-session'),
            productionToken: fixedTokenHeader(req, 'x-caissa-production-session')
        });
        if (!verified.ok) return res.status(401).json({ error: 'Identity verification failed' });

        const { data, error } = await supabase.rpc('resolve_clerk_identity_for_sync', {
            p_external_subject: verified.legacySubject
        });
        const resolution = data?.[0] || data;
        if (error || resolution?.resolution !== 'BOUND' || !resolution.user_id) {
            return res.status(409).json({ error: 'Identity migration unavailable' });
        }

        const result = await createHandoff({
            supabase,
            existingAccount: { userId: resolution.user_id, legacySubject: verified.legacySubject },
            verifiedProductionSubject: verified.productionSubject,
            proofMethod: 'DUAL_AUTH'
        });
        if (!result.ok) return res.status(409).json({ error: 'Identity migration unavailable' });
        return res.status(201).json({ challengeToken: result.token, expiresAt: result.expiresAt });
    } catch {
        return res.status(503).json({ error: 'Identity migration unavailable' });
    }
    };
}

export default createChallengeHandler();
