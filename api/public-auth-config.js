import { ownerHandoffOrigins } from './_lib/identity-owner-handoff.js';
import { isIdentityMigrationEnforced } from './_lib/identity-resolution.js';
import { publicRegistrationCandidate } from './_lib/registration-age-gate-service.js';

/**
 * Public auth configuration for the browser.
 *
 * Only returns safe-to-expose values. Secret keys remain server-side.
 */

export default function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const clerkPublishableKeyCandidates = [
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
        process.env.CLERK_PUBLISHABLE_KEY
    ].map(value => String(value || '').trim()).filter(isValidClerkPublishableKey);

    const clerkPublishableKey =
        clerkPublishableKeyCandidates.find((key) => String(key).startsWith('pk_live_')) ||
        clerkPublishableKeyCandidates[0] ||
        '';

    const supabaseUrl =
        process.env.SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL ||
        '';

    return res.status(200).json({
        clerkPublishableKey,
        registrationTracking: Boolean(
            process.env.CLERK_SECRET_KEY &&
            supabaseUrl &&
            process.env.SUPABASE_SERVICE_ROLE_KEY
        ),
        registrationCandidate: publicRegistrationCandidate(process.env),
        identityOwnerHandoff: publicOwnerHandoffMetadata(process.env)
    });
}

export function publicOwnerHandoffMetadata(env = process.env) {
    if (!isIdentityMigrationEnforced(env)) return null;
    try {
        const origins = ownerHandoffOrigins(env);
        return Object.freeze({
            productionOrigin: origins.production,
            legacyOrigin: origins.legacy
        });
    } catch {
        return null;
    }
}

export function isValidClerkPublishableKey(value) {
    if (typeof value !== 'string') return false;
    const key = value.trim();
    if (key.length < 24 || key.length > 512 || !/^pk_(?:test|live)_[A-Za-z0-9_-]+$/.test(key)) return false;
    return !/(?:replace(?:_with)?_your_key|placeholder|change(?:me|_me)|dummy|example)/i.test(key);
}
