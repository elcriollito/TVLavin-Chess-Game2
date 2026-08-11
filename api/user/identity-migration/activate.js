import { getSupabase } from '../../_lib/supabase.js';
import { activateMigrationHandoff } from '../../_lib/identity-migration.js';
import { getFixedMigrationAuthority, verifyMigrationToken } from '../../_lib/clerk-migration-verifiers.js';
import { consumePersistentMigrationThrottle, fixedTokenHeader, prepareSensitiveJsonRoute, rejectSensitiveRoute } from '../../_lib/identity-migration-http.js';
import { setCorsHeaders } from '../../_lib/auth.js';

export function createActivationHandler(dependencies = {}) {
    const getDatabase = dependencies.getSupabase || getSupabase;
    const getAuthority = dependencies.getFixedMigrationAuthority || getFixedMigrationAuthority;
    const verifyToken = dependencies.verifyMigrationToken || verifyMigrationToken;
    const activateHandoff = dependencies.activateMigrationHandoff || activateMigrationHandoff;
    const consumeThrottle = dependencies.consumePersistentMigrationThrottle || consumePersistentMigrationThrottle;
    return async function handler(req, res) {
    if (!setCorsHeaders(req, res, ['POST'])) return;
    if (req.method === 'OPTIONS') return res.status(200).end();
    const guard = prepareSensitiveJsonRoute(req, res);
    if (!guard.ok) return rejectSensitiveRoute(res, guard);
    if (!req.body || Object.keys(req.body).some((key) => key !== 'challengeToken')
        || typeof req.body.challengeToken !== 'string' || req.body.challengeToken.length > 1024) {
        return res.status(400).json({ error: 'Request rejected' });
    }

    try {
        const supabase = getDatabase();
        const throttle = await consumeThrottle(supabase, req, 'activate');
        if (throttle.unavailable) return res.status(503).json({ error: 'Identity migration unavailable' });
        if (!throttle.ok) {
            if (throttle.retryAfter) res.setHeader('Retry-After', String(throttle.retryAfter));
            return res.status(429).json({ error: 'Identity migration unavailable' });
        }

        const authority = getAuthority('production');
        const verified = authority && await verifyToken(
            fixedTokenHeader(req, 'x-caissa-production-session'), authority
        );
        if (!verified?.ok) return res.status(401).json({ error: 'Identity verification failed' });

        const result = await activateHandoff({
            supabase,
            token: req.body.challengeToken,
            verifiedProductionSubject: verified.subject
        });
        if (!result.ok) return res.status(409).json({ error: 'Identity migration unavailable' });
        return res.status(200).json({ migrated: true });
    } catch {
        return res.status(503).json({ error: 'Identity migration unavailable' });
    }
    };
}

export default createActivationHandler();
