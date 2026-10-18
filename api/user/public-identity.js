import { respondAuthFailure, setCorsHeaders, verifyAuth } from '../_lib/auth.js';
import { getSupabase } from '../_lib/supabase.js';
import {
    isIdentityOwnershipEnforced,
    resolveVerifiedIdentityOwnership,
    respondIdentityOwnershipFailure
} from '../_lib/identity-ownership.js';
import {
    createPublicIdentityStore,
    sanitizeIdentity,
    validateNicknameRequest
} from '../_lib/public-identity.js';

const MAX_BODY_BYTES = 4 * 1024;

export default async function handler(req, res, dependencies = {}) {
    if (!setCorsHeaders(req, res, ['GET', 'POST', 'PATCH'])) return;
    if (req.method === 'OPTIONS') return res.status(200).end();
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    if (!['GET', 'POST', 'PATCH'].includes(req.method)) {
        return res.status(405).json({ code: 'METHOD_NOT_ALLOWED' });
    }
    if (bodyBytes(req.body) > MAX_BODY_BYTES) {
        return res.status(413).json({ code: 'PAYLOAD_TOO_LARGE' });
    }

    const authenticate = dependencies.verifyAuth || verifyAuth;
    const auth = await authenticate(req);
    if (!auth.authenticated) return respondAuthFailure(res, auth);

    try {
        const env = dependencies.env || process.env;
        let store = dependencies.store;
        if (isIdentityOwnershipEnforced(env)) {
            const db = (dependencies.getSupabase || getSupabase)();
            const ownership = await (dependencies.resolveIdentityOwnership || resolveVerifiedIdentityOwnership)({
                db,
                auth,
                env
            });
            if (!ownership.ok) return respondIdentityOwnershipFailure(res, ownership);
            store ||= createPublicIdentityStore({ ...dependencies, db });
        }
        store ||= createPublicIdentityStore(dependencies);

        if (req.method === 'GET') {
            return res.status(200).json({ identity: sanitizeIdentity(await store.getOrCreate(auth.userId)) });
        }

        if (req.method === 'POST') {
            if (req.body?.action !== 'availability') {
                return res.status(400).json({ code: 'INVALID_ACTION' });
            }
            const checked = validateNicknameRequest(req.body?.nickname);
            if (!checked.ok) return res.status(422).json({ code: checked.code, error: checked.message });
            const result = await store.checkNickname(auth.userId, checked);
            return res.status(200).json({
                available: result?.available === true,
                normalizedNickname: String(result?.normalizedNickname || checked.value)
            });
        }

        if (Object.hasOwn(req.body || {}, 'userId') || Object.hasOwn(req.body || {}, 'clerkId')) {
            return res.status(400).json({ code: 'OWNER_FIELD_FORBIDDEN' });
        }
        const checked = validateNicknameRequest(req.body?.nickname, { allowEmpty: true });
        if (!checked.ok) return res.status(422).json({ code: checked.code, error: checked.message });
        const expectedVersion = Number(req.body?.expectedVersion);
        if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
            return res.status(400).json({ code: 'EXPECTED_VERSION_REQUIRED' });
        }
        const identity = await store.update(auth.userId, checked, expectedVersion);
        return res.status(200).json({ identity: sanitizeIdentity(identity) });
    } catch (error) {
        const mapped = mapIdentityError(error?.code || error?.message);
        return res.status(mapped.status).json({ code: mapped.code, error: mapped.message });
    }
}

function mapIdentityError(code) {
    if (code === 'CAISSA_IDENTITY_NICKNAME_TAKEN') {
        return { status: 409, code: 'NICKNAME_TAKEN', message: 'That nickname is unavailable.' };
    }
    if (code === 'CAISSA_IDENTITY_STALE_VERSION') {
        return { status: 409, code: 'STALE_IDENTITY', message: 'Your public identity changed. Reload and try again.' };
    }
    if (code === 'CAISSA_IDENTITY_USER_NOT_FOUND') {
        return { status: 409, code: 'ACCOUNT_SYNC_REQUIRED', message: 'Finish account setup before choosing a nickname.' };
    }
    if (String(code).startsWith('CAISSA_IDENTITY_')) {
        return { status: 422, code: 'INVALID_NICKNAME', message: 'That nickname does not meet the public identity rules.' };
    }
    return { status: 503, code: 'PUBLIC_IDENTITY_UNAVAILABLE', message: 'Public identity is temporarily unavailable.' };
}

function bodyBytes(body) {
    try { return Buffer.byteLength(JSON.stringify(body || {})); }
    catch (_) { return MAX_BODY_BYTES + 1; }
}
