import { getSupabase } from '../../../_lib/supabase.js';
import { activateMigrationHandoff } from '../../../_lib/identity-migration.js';
import { getFixedMigrationAuthority, verifyMigrationToken } from '../../../_lib/clerk-migration-verifiers.js';
import { consumePersistentMigrationThrottle, prepareSensitiveJsonRoute, rejectSensitiveRoute } from '../../../_lib/identity-migration-http.js';
import { isIdentityMigrationEnforced } from '../../../_lib/identity-resolution.js';
import {
    clearOwnerHandoffCookie,
    deriveOwnerChallengeToken,
    fixedBearerToken,
    ownerHandoffOrigins,
    ownerHandoffStateFromCookie,
    sameSubject,
    setOwnerHandoffCors,
    verifyOwnerHandoff,
    verifyOwnerProofReceipt
} from '../../../_lib/identity-owner-handoff.js';

export function createOwnerHandoffCompleteHandler(dependencies = {}) {
    const environment = dependencies.env || process.env;
    const getDatabase = dependencies.getSupabase || getSupabase;
    const getAuthority = dependencies.getFixedMigrationAuthority || getFixedMigrationAuthority;
    const verifyToken = dependencies.verifyMigrationToken || verifyMigrationToken;
    const activateHandoff = dependencies.activateMigrationHandoff || activateMigrationHandoff;
    const consumeThrottle = dependencies.consumePersistentMigrationThrottle || consumePersistentMigrationThrottle;
    const verifyProofReceipt = dependencies.verifyOwnerProofReceipt || verifyOwnerProofReceipt;
    const now = dependencies.now || Date.now;

    return async function handler(req, res) {
        let origins;
        try { origins = ownerHandoffOrigins(environment); }
        catch { return res.status(503).json({ error: 'Identity migration unavailable' }); }
        if (!setOwnerHandoffCors(req, res, ['POST'], origins.production)) return;
        if (req.method === 'OPTIONS') return res.status(200).end();
        const guard = prepareSensitiveJsonRoute(req, res);
        if (!guard.ok) return rejectSensitiveRoute(res, guard);
        if (!isIdentityMigrationEnforced(environment)) return res.status(404).json({ error: 'Not found' });
        if (!req.body || Object.keys(req.body).length !== 1
            || typeof req.body.proofReceipt !== 'string' || req.body.proofReceipt.length > 4096) {
            return res.status(400).json({ error: 'Request rejected' });
        }

        try {
            const opaqueState = ownerHandoffStateFromCookie(req);
            const state = verifyOwnerHandoff(opaqueState, environment, now());
            if (!state.ok) return res.status(409).json({ error: 'Identity migration unavailable' });
            const proof = verifyProofReceipt(req.body.proofReceipt, opaqueState, environment, now());
            if (!proof.ok) return res.status(409).json({ error: 'Identity migration unavailable' });

            const authority = getAuthority('production', environment);
            const verified = authority && await verifyToken(fixedBearerToken(req), authority);
            if (!verified?.ok || !sameSubject(verified.subject, state.productionSubject)) {
                return res.status(401).json({ error: 'Identity verification failed' });
            }

            const supabase = getDatabase();
            const throttle = await consumeThrottle(supabase, req, 'owner-complete', environment);
            if (throttle.unavailable) return res.status(503).json({ error: 'Identity migration unavailable' });
            if (!throttle.ok) {
                if (throttle.retryAfter) res.setHeader('Retry-After', String(throttle.retryAfter));
                return res.status(429).json({ error: 'Identity migration unavailable' });
            }

            const result = await activateHandoff({
                supabase,
                token: deriveOwnerChallengeToken(opaqueState, environment),
                verifiedProductionSubject: verified.subject
            });
            if (!result.ok) {
                const status = result.code === 'IDENTITY_SERVICE_UNAVAILABLE' ? 503 : 409;
                return res.status(status).json({ error: 'Identity migration unavailable' });
            }
            res.setHeader('Set-Cookie', clearOwnerHandoffCookie());
            return res.status(200).json({ migrated: true });
        } catch {
            return res.status(503).json({ error: 'Identity migration unavailable' });
        }
    };
}

export default createOwnerHandoffCompleteHandler();
