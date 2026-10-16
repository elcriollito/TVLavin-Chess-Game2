import { getSupabase } from '../../../_lib/supabase.js';
import { getFixedMigrationAuthority, verifyMigrationToken } from '../../../_lib/clerk-migration-verifiers.js';
import { consumePersistentMigrationThrottle, prepareSensitiveJsonRoute, rejectSensitiveRoute } from '../../../_lib/identity-migration-http.js';
import { isIdentityMigrationEnforced, resolveIdentityForSync } from '../../../_lib/identity-resolution.js';
import { findPendingMigrationHandoff } from '../../../_lib/identity-migration.js';
import {
    fixedBearerToken,
    issueOwnerHandoff,
    ownerHandoffCookie,
    ownerHandoffOrigins,
    ownerHandoffStateFromCookie,
    sameSubject,
    verifyOwnerHandoff,
    setOwnerHandoffCors
} from '../../../_lib/identity-owner-handoff.js';

export function createOwnerHandoffStartHandler(dependencies = {}) {
    const environment = dependencies.env || process.env;
    const getDatabase = dependencies.getSupabase || getSupabase;
    const getAuthority = dependencies.getFixedMigrationAuthority || getFixedMigrationAuthority;
    const verifyToken = dependencies.verifyMigrationToken || verifyMigrationToken;
    const resolveIdentity = dependencies.resolveIdentityForSync || resolveIdentityForSync;
    const consumeThrottle = dependencies.consumePersistentMigrationThrottle || consumePersistentMigrationThrottle;
    const issueHandoff = dependencies.issueOwnerHandoff || issueOwnerHandoff;
    const findPendingHandoff = dependencies.findPendingMigrationHandoff || findPendingMigrationHandoff;
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
        if (!req.body || Object.keys(req.body).some((key) => key !== 'returnTo')
            || (req.body.returnTo !== undefined && typeof req.body.returnTo !== 'string')) {
            return res.status(400).json({ error: 'Request rejected' });
        }

        try {
            const authority = getAuthority('production', environment);
            const verified = authority && await verifyToken(fixedBearerToken(req), authority);
            if (!verified?.ok) return res.status(401).json({ error: 'Identity verification failed' });

            const supabase = getDatabase();
            const throttle = await consumeThrottle(supabase, req, 'owner-start', environment);
            if (throttle.unavailable) return res.status(503).json({ error: 'Identity migration unavailable' });
            if (!throttle.ok) {
                if (throttle.retryAfter) res.setHeader('Retry-After', String(throttle.retryAfter));
                return res.status(429).json({ error: 'Identity migration unavailable' });
            }

            const timestamp = now();
            const resolution = await resolveIdentity(supabase, verified.subject);
            if (!resolution.ok) {
                return res.status(503).json({ error: 'Identity migration unavailable' });
            }
            if (!['UNRESOLVED', 'MIGRATION_REQUIRED'].includes(resolution.resolution)) {
                return res.status(409).json({ error: 'Identity migration unavailable' });
            }

            const priorOpaqueState = ownerHandoffStateFromCookie(req);
            const priorState = verifyOwnerHandoff(priorOpaqueState, environment, timestamp);
            if (priorState.ok && sameSubject(priorState.productionSubject, verified.subject)) {
                const remainingSeconds = Math.max(1, Math.ceil((priorState.expiresAt - timestamp) / 1000));
                res.setHeader('Set-Cookie', ownerHandoffCookie(priorOpaqueState, remainingSeconds));
                const handoffUrl = `${origins.legacy}/identity-recovery#handoff=${encodeURIComponent(priorOpaqueState)}`;
                return res.status(201).json({
                    handoffUrl,
                    expiresAt: new Date(priorState.expiresAt).toISOString(),
                    resumed: true
                });
            }

            if (resolution.resolution === 'MIGRATION_REQUIRED') {
                const pending = await findPendingHandoff({
                    supabase,
                    verifiedProductionSubject: verified.subject,
                    now: timestamp
                });
                if (!pending.ok) return res.status(503).json({ error: 'Identity migration unavailable' });
                if (pending.found) {
                    const retryAfter = Math.max(1, Math.ceil((Date.parse(pending.expiresAt) - timestamp) / 1000));
                    res.setHeader('Retry-After', String(retryAfter));
                    return res.status(409).json({
                        code: 'IDENTITY_RECOVERY_PENDING',
                        expiresAt: pending.expiresAt
                    });
                }
                return res.status(409).json({ error: 'Identity migration unavailable' });
            }

            const issued = issueHandoff(verified.subject, environment, timestamp, undefined, req.body.returnTo);
            res.setHeader('Set-Cookie', ownerHandoffCookie(issued.state));
            const handoffUrl = `${origins.legacy}/identity-recovery#handoff=${encodeURIComponent(issued.state)}`;
            return res.status(201).json({ handoffUrl, expiresAt: issued.expiresAt, resumed: false });
        } catch {
            return res.status(503).json({ error: 'Identity migration unavailable' });
        }
    };
}

export default createOwnerHandoffStartHandler();
