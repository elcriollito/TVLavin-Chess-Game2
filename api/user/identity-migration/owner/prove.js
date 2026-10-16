import { getSupabase } from '../../../_lib/supabase.js';
import { createMigrationHandoff } from '../../../_lib/identity-migration.js';
import { getFixedMigrationAuthority, verifyMigrationToken } from '../../../_lib/clerk-migration-verifiers.js';
import { consumePersistentMigrationThrottle, prepareSensitiveJsonRoute, rejectSensitiveRoute } from '../../../_lib/identity-migration-http.js';
import { isIdentityMigrationEnforced } from '../../../_lib/identity-resolution.js';
import {
    deriveOwnerChallengeToken,
    fixedBearerToken,
    issueOwnerProofReceipt,
    ownerHandoffOrigins,
    sameSubject,
    setOwnerHandoffCors,
    verifyOwnerHandoff
} from '../../../_lib/identity-owner-handoff.js';

export function createOwnerHandoffProofHandler(dependencies = {}) {
    const environment = dependencies.env || process.env;
    const getDatabase = dependencies.getSupabase || getSupabase;
    const getAuthority = dependencies.getFixedMigrationAuthority || getFixedMigrationAuthority;
    const verifyToken = dependencies.verifyMigrationToken || verifyMigrationToken;
    const createHandoff = dependencies.createMigrationHandoff || createMigrationHandoff;
    const consumeThrottle = dependencies.consumePersistentMigrationThrottle || consumePersistentMigrationThrottle;
    const issueProofReceipt = dependencies.issueOwnerProofReceipt || issueOwnerProofReceipt;
    const now = dependencies.now || Date.now;

    return async function handler(req, res) {
        let origins;
        try { origins = ownerHandoffOrigins(environment); }
        catch { return res.status(503).json({ error: 'Identity migration unavailable' }); }
        if (!setOwnerHandoffCors(req, res, ['POST'], origins.legacy)) return;
        if (req.method === 'OPTIONS') return res.status(200).end();
        const guard = prepareSensitiveJsonRoute(req, res);
        if (!guard.ok) return rejectSensitiveRoute(res, guard);
        if (!isIdentityMigrationEnforced(environment)) return res.status(404).json({ error: 'Not found' });
        if (!req.body || Object.keys(req.body).some((key) => key !== 'handoffState')
            || typeof req.body.handoffState !== 'string' || req.body.handoffState.length > 4096) {
            return res.status(400).json({ error: 'Request rejected' });
        }

        try {
            const timestamp = now();
            const state = verifyOwnerHandoff(req.body.handoffState, environment, timestamp);
            if (!state.ok) return res.status(409).json({ error: 'Identity migration unavailable' });

            const authority = getAuthority('legacy', environment);
            const verified = authority && await verifyToken(fixedBearerToken(req), authority);
            if (!verified?.ok || sameSubject(verified.subject, state.productionSubject)) {
                return res.status(401).json({ error: 'Identity verification failed' });
            }

            const supabase = getDatabase();
            const throttle = await consumeThrottle(supabase, req, 'owner-prove', environment);
            if (throttle.unavailable) return res.status(503).json({ error: 'Identity migration unavailable' });
            if (!throttle.ok) {
                if (throttle.retryAfter) res.setHeader('Retry-After', String(throttle.retryAfter));
                return res.status(429).json({ error: 'Identity migration unavailable' });
            }

            const { data, error } = await supabase.rpc('resolve_clerk_identity_binding', {
                p_external_subject: verified.subject,
                p_environment: 'legacy_development'
            });
            const resolution = data?.[0] || data;
            if (error || resolution?.resolution !== 'BOUND' || !resolution.user_id) {
                return res.status(409).json({ error: 'Identity migration unavailable' });
            }

            const ttlMs = state.expiresAt - timestamp;
            const proofReceipt = issueProofReceipt(req.body.handoffState, verified.subject, environment, timestamp);
            const result = await createHandoff({
                supabase,
                existingAccount: { userId: resolution.user_id, legacySubject: verified.subject },
                verifiedProductionSubject: state.productionSubject,
                challengeToken: deriveOwnerChallengeToken(req.body.handoffState, environment),
                proofMethod: 'SESSION_HANDOFF',
                ttlMs,
                now: timestamp
            });
            if (!result.ok) return res.status(409).json({ error: 'Identity migration unavailable' });
            return res.status(201).json({ verified: true, expiresAt: result.expiresAt, proofReceipt });
        } catch {
            return res.status(503).json({ error: 'Identity migration unavailable' });
        }
    };
}

export default createOwnerHandoffProofHandler();
