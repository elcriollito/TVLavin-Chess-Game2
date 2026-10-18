import crypto from 'node:crypto';
import { createClerkClient } from '@clerk/backend';
import { verifyAuth, respondAuthFailure, setCorsHeaders } from './auth.js';
import { getSupabase } from './supabase.js';
import { streamAccountExport } from './account-export-stream.js';
import {
    isIdentityOwnershipEnforced,
    resolveVerifiedIdentityOwnership,
    respondIdentityOwnershipFailure
} from './identity-ownership.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_BODY_BYTES = 8 * 1024;
const FRESH_MINUTES = 5;
const STAGING_REF = 'aqizagaskicotorfpwfn';
const PRODUCTION_REF = 'jczauvkfkweuvdpurpem';
const RATE_LIMITS = Object.freeze({
    summary: [60, 60],
    status: [30, 60],
    export: [3, 3600],
    prepare: [5, 900],
    confirm: [5, 900]
});

export function accountControlEnvironment(env = process.env) {
    const mode = String(env.CAISSA_ACCOUNT_CONTROL_MODE || '').trim();
    const expected = mode === 'staging'
        ? { authority: 'legacy_development', projectRef: STAGING_REF }
        : mode === 'production'
            ? { authority: 'production', projectRef: PRODUCTION_REF }
            : null;
    if (!expected || !isIdentityOwnershipEnforced(env)) return null;
    const url = String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '');
    let projectRef = '';
    try {
        const hostname = new URL(url).hostname;
        projectRef = hostname.endsWith('.supabase.co') ? hostname.split('.')[0] : '';
    } catch { return null; }
    if (projectRef !== expected.projectRef) return null;
    return Object.freeze({ mode, projectRef, authority: expected.authority });
}

export function freshReverification(auth) {
    const firstFactorAge = auth?.factorVerificationAge?.[0];
    return Boolean(auth?.sessionId && auth?.tokenId
        && Number.isInteger(firstFactorAge) && firstFactorAge >= 0 && firstFactorAge <= FRESH_MINUTES);
}

export function createAccountControlHandlers(dependencies = {}) {
    const authenticate = dependencies.verifyAuth || verifyAuth;
    const getDb = dependencies.getSupabase || getSupabase;
    const env = dependencies.env || process.env;

    async function context(req, res, { fresh = false, effect = false, rateLimit = 'summary' } = {}) {
        const environment = accountControlEnvironment(env);
        if (!environment) {
            res.status(503).json({ code: 'ACCOUNT_CONTROL_UNAVAILABLE', error: 'Account controls are not enabled.' });
            return null;
        }
        if (effect && !exactBrowserOrigin(req, env)) {
            res.status(403).json({ code: 'REQUEST_ORIGIN_REJECTED', error: 'Request rejected.' });
            return null;
        }
        if (effect && !String(req.headers?.['content-type'] || '').toLowerCase().startsWith('application/json')) {
            res.status(415).json({ code: 'JSON_REQUIRED', error: 'JSON request required.' });
            return null;
        }
        const auth = await authenticate(req);
        if (!auth.authenticated) {
            respondAuthFailure(res, auth);
            return null;
        }
        if (auth.authority !== environment.authority) {
            res.status(403).json({ code: 'IDENTITY_AUTHORITY_REJECTED', error: 'This identity authority is not permitted.' });
            return null;
        }
        if (fresh && !freshReverification(auth)) {
            res.status(403).json({
                code: 'REVERIFICATION_REQUIRED',
                error: 'Sign in again before performing this sensitive action.',
                level: 'first_factor',
                maxAgeMinutes: FRESH_MINUTES
            });
            return null;
        }
        const db = getDb();
        const rateSecret = String(env.SUPABASE_SERVICE_ROLE_KEY || env.CLERK_SECRET_KEY || '');
        if (!rateSecret) {
            res.status(503).json({ code: 'ACCOUNT_CONTROL_UNAVAILABLE', error: 'Account controls are not enabled.' });
            return null;
        }
        const [maxAttempts, windowSeconds] = RATE_LIMITS[rateLimit] || RATE_LIMITS.summary;
        const scopeHash = crypto.createHmac('sha256', rateSecret)
            .update(`account-control:${auth.userId}`, 'utf8').digest('hex');
        const allowed = dependencies.consumeAccountRateLimit
            ? await dependencies.consumeAccountRateLimit({ db, scopeHash, bucket: rateLimit, maxAttempts, windowSeconds })
            : await rpc(db, 'consume_caissa_account_control_rate_limit', {
                p_scope_hash: scopeHash,
                p_bucket: rateLimit,
                p_max_attempts: maxAttempts,
                p_window_seconds: windowSeconds
            });
        if (allowed !== true) {
            res.status(429).json({ code: 'RATE_LIMITED', error: 'Too many requests. Try again later.' });
            return null;
        }
        const ownership = await (dependencies.resolveIdentityOwnership || resolveVerifiedIdentityOwnership)({ db, auth, env });
        if (!ownership.ok) {
            respondIdentityOwnershipFailure(res, ownership);
            return null;
        }
        return { auth, db, ownership, environment };
    }

    return Object.freeze({
        summary: async (req, res) => {
            if (!routePrelude(req, res, ['GET'])) return;
            const ctx = await context(req, res, { rateLimit: 'summary' });
            if (!ctx) return;
            const result = await rpc(ctx.db, 'caissa_account_control_summary', {
                p_user_id: ctx.ownership.userId,
                p_binding_id: ctx.ownership.bindingId
            });
            return res.status(200).json({
                summary: result,
                backendReady: true,
                requiresReauthentication: !freshReverification(ctx.auth),
                retention: {
                    backups: 'Deleted profile data can remain in encrypted backups until scheduled expiry.',
                    economy: 'Billing and entitlement evidence is retained when legally or operationally required.'
                }
            });
        },

        exportData: async (req, res) => {
            if (!routePrelude(req, res, ['POST'])) return;
            const ctx = await context(req, res, { fresh: true, effect: true, rateLimit: 'export' });
            if (!ctx || !validEffectRequest(req, res)) return;
            rejectOwnerFields(req.body);
            const exporter = dependencies.streamAccountExport || streamAccountExport;
            await exporter({
                res,
                db: ctx.db,
                userId: ctx.ownership.userId,
                bindingId: ctx.ownership.bindingId,
                now: dependencies.now
            });
            return res;
        },

        prepareReset: (req, res) => prepare(req, res, 'PROGRESS_RESET'),
        prepareDeletion: (req, res) => prepare(req, res, 'ACCOUNT_DELETION'),

        confirmReset: async (req, res) => {
            if (!routePrelude(req, res, ['POST'])) return;
            const ctx = await context(req, res, { fresh: true, effect: true, rateLimit: 'confirm' });
            if (!ctx || !validEffectRequest(req, res)) return;
            const body = safeBody(req.body);
            if (!UUID.test(body.operationId || '') || !validConfirmation(body.confirmationToken)) {
                return res.status(400).json({ code: 'INVALID_CONFIRMATION' });
            }
            const result = await rpc(ctx.db, 'confirm_caissa_progress_reset', {
                p_operation_id: body.operationId,
                p_user_id: ctx.ownership.userId,
                p_binding_id: ctx.ownership.bindingId,
                p_confirmation_hash: digest(body.confirmationToken),
                p_reverification_hash: reverifyHash(ctx.auth),
                p_idempotency_key_hash: digest(req.headers['idempotency-key']),
                p_external_subject_hash: digest(ctx.auth.userId)
            });
            return res.status(200).json({ status: 'COMPLETED', result });
        },

        confirmDeletion: async (req, res) => {
            if (!routePrelude(req, res, ['POST'])) return;
            const ctx = await context(req, res, { fresh: true, effect: true, rateLimit: 'confirm' });
            if (!ctx || !validEffectRequest(req, res)) return;
            const body = safeBody(req.body);
            if (!UUID.test(body.operationId || '') || !validConfirmation(body.confirmationToken)) {
                return res.status(400).json({ code: 'INVALID_CONFIRMATION' });
            }
            const secretKey = String(env.CLERK_SECRET_KEY || '');
            const validKey = ctx.environment.authority === 'production'
                ? secretKey.startsWith('sk_live_') : secretKey.startsWith('sk_test_');
            if (!validKey) {
                return res.status(503).json({
                    code: 'ACCOUNT_CONTROL_UNAVAILABLE',
                    error: 'Account controls are temporarily unavailable.'
                });
            }
            const clerk = (dependencies.createClerkClient || createClerkClient)({ secretKey });
            const locked = await rpc(ctx.db, 'lock_caissa_account_deletion', {
                p_operation_id: body.operationId,
                p_user_id: ctx.ownership.userId,
                p_binding_id: ctx.ownership.bindingId,
                p_confirmation_hash: digest(body.confirmationToken),
                p_reverification_hash: reverifyHash(ctx.auth),
                p_idempotency_key_hash: digest(req.headers['idempotency-key']),
                p_external_subject_hash: digest(ctx.auth.userId)
            });
            if (locked?.status !== 'LOCKED') {
                return res.status(409).json({
                    code: 'ACCOUNT_REVIEW_REQUIRED',
                    error: 'This request requires secure manual review.',
                    status: 'REVIEW_REQUIRED'
                });
            }

            let erased;
            try {
                erased = await rpc(ctx.db, 'erase_caissa_account_data', {
                    p_operation_id: body.operationId,
                    p_user_id: ctx.ownership.userId,
                    p_binding_id: ctx.ownership.bindingId,
                    p_external_subject_hash: digest(ctx.auth.userId)
                });
            } catch (error) {
                try {
                    await rpc(ctx.db, 'mark_caissa_data_deletion_failed', {
                        p_operation_id: body.operationId,
                        p_user_id: ctx.ownership.userId
                    });
                } catch { /* The durable LOCKED state remains fail-closed. */ }
                dependencies.log?.warn?.('account_deletion_data_erasure_failed', error?.name || 'Error');
                return res.status(503).json({
                    code: 'DELETION_REVIEW_REQUIRED',
                    error: 'Account deletion was stopped safely and requires review.',
                    status: 'REVIEW_REQUIRED'
                });
            }
            if (erased?.status !== 'AUTH_DELETION_PENDING') {
                return res.status(409).json({
                    code: 'ACCOUNT_REVIEW_REQUIRED',
                    error: 'This request requires secure manual review.',
                    status: 'REVIEW_REQUIRED'
                });
            }

            try {
                await clerk.users.deleteUser(ctx.auth.userId);
            } catch (error) {
                await rpc(ctx.db, 'mark_caissa_auth_deletion_failed', {
                    p_operation_id: body.operationId,
                    p_user_id: ctx.ownership.userId
                });
                dependencies.log?.warn?.('account_deletion_auth_provider_failed', error?.name || 'Error');
                return res.status(503).json({
                    code: 'DELETION_REVIEW_REQUIRED',
                    error: 'Account deletion was stopped safely and requires review.',
                    status: 'REVIEW_REQUIRED'
                });
            }

            const result = await rpc(ctx.db, 'complete_caissa_account_deletion', {
                p_operation_id: body.operationId,
                p_user_id: ctx.ownership.userId,
                p_binding_id: ctx.ownership.bindingId
            });
            return res.status(200).json({ status: 'COMPLETED', result });
        },

        status: async (req, res) => {
            if (!routePrelude(req, res, ['GET'])) return;
            const ctx = await context(req, res, { rateLimit: 'status' });
            if (!ctx) return;
            const { data, error } = await ctx.db.from('caissa_account_control_operations')
                .select('id,kind,status,created_at,updated_at,completed_at,result')
                .eq('user_id', ctx.ownership.userId).order('created_at', { ascending: false }).limit(10);
            if (error) return res.status(503).json({ code: 'ACCOUNT_CONTROL_UNAVAILABLE' });
            return res.status(200).json({ operations: data || [] });
        }
    });

    async function prepare(req, res, kind) {
        if (!routePrelude(req, res, ['POST'])) return;
        const ctx = await context(req, res, { fresh: true, effect: true, rateLimit: 'prepare' });
        if (!ctx || !validEffectRequest(req, res)) return;
        const body = safeBody(req.body);
        const requiredPhrase = kind === 'ACCOUNT_DELETION' ? 'DELETE' : 'RESET';
        if (body.confirmation !== requiredPhrase) {
            return res.status(422).json({ code: 'CONFIRMATION_PHRASE_REQUIRED', expected: requiredPhrase });
        }
        const idempotencyKey = String(req.headers['idempotency-key']);
        const confirmationToken = deterministicConfirmationToken({
            secret: String(env.SUPABASE_SERVICE_ROLE_KEY || env.CLERK_SECRET_KEY),
            subject: ctx.auth.userId,
            kind,
            idempotencyKey
        });
        const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
        const rows = await rpc(ctx.db, 'prepare_caissa_account_control', {
            p_user_id: ctx.ownership.userId,
            p_binding_id: ctx.ownership.bindingId,
            p_kind: kind,
            p_idempotency_key_hash: digest(idempotencyKey),
            p_confirmation_hash: digest(confirmationToken),
            p_reverification_hash: reverifyHash(ctx.auth),
            p_expires_at: expiresAt
        });
        const operation = Array.isArray(rows) ? rows[0] : rows;
        return res.status(201).json({
            operationId: operation.operation_id,
            status: operation.operation_status,
            expiresAt: operation.operation_expires_at,
            confirmationToken
        });
    }
}

export function createRouteHandler(name, dependencies = {}) {
    return async function route(req, res) {
        try {
            return await createAccountControlHandlers(dependencies)[name](req, res);
        } catch (error) {
            if (res.headersSent) {
                if (typeof res.destroy === 'function') res.destroy(error);
                return;
            }
            const mapped = mapError(error);
            dependencies.log?.warn?.('account_control_request_failed', mapped.code);
            return res.status(mapped.status).json({ code: mapped.code, error: mapped.message });
        }
    };
}

function routePrelude(req, res, methods) {
    if (!setCorsHeaders(req, res, methods)) return false;
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'OPTIONS') { res.status(200).end(); return false; }
    if (!methods.includes(req.method)) { res.status(405).json({ code: 'METHOD_NOT_ALLOWED' }); return false; }
    if (bodyBytes(req.body) > MAX_BODY_BYTES) { res.status(413).json({ code: 'PAYLOAD_TOO_LARGE' }); return false; }
    return true;
}

function exactBrowserOrigin(req, env) {
    const origin = String(req.headers?.origin || '');
    const allowed = new Set(['https://www.caissa-chess.org', ...String(env.CAISSA_BROWSER_ORIGINS || '')
        .split(',').map(value => value.trim()).filter(Boolean)]);
    const fetchSite = String(req.headers?.['sec-fetch-site'] || 'same-origin');
    return allowed.has(origin) && ['same-origin', 'same-site'].includes(fetchSite);
}

function validEffectRequest(req, res) {
    const key = String(req.headers?.['idempotency-key'] || '');
    if (!UUID.test(key)) {
        res.status(400).json({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
        return false;
    }
    return true;
}

function rejectOwnerFields(body) {
    const value = safeBody(body);
    if (['userId', 'user_id', 'clerkId', 'clerk_id', 'subject', 'email'].some(key => Object.hasOwn(value, key))) {
        const error = new Error('CAISSA_ACCOUNT_OWNER_FIELD_FORBIDDEN');
        error.code = 'CAISSA_ACCOUNT_OWNER_FIELD_FORBIDDEN';
        throw error;
    }
}

function safeBody(body) {
    rejectBodyOwnerFields(body);
    return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

function rejectBodyOwnerFields(body) {
    const value = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    if (['userId', 'user_id', 'clerkId', 'clerk_id', 'subject', 'email'].some(key => Object.hasOwn(value, key))) {
        const error = new Error('CAISSA_ACCOUNT_OWNER_FIELD_FORBIDDEN');
        error.code = 'CAISSA_ACCOUNT_OWNER_FIELD_FORBIDDEN';
        throw error;
    }
}

async function rpc(db, name, args) {
    const { data, error } = await db.rpc(name, args);
    if (error) throw error;
    return data;
}

function validConfirmation(value) {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{40,64}$/u.test(value);
}

function digest(value) {
    return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function reverifyHash(auth) {
    return digest(`session:${auth.sessionId}`);
}

function deterministicConfirmationToken({ secret, subject, kind, idempotencyKey }) {
    return crypto.createHmac('sha256', secret)
        .update(`account-control-confirmation:${subject}:${kind}:${idempotencyKey}`, 'utf8')
        .digest('base64url');
}

function bodyBytes(body) {
    try { return Buffer.byteLength(JSON.stringify(body || {})); }
    catch { return MAX_BODY_BYTES + 1; }
}

function mapError(error) {
    const value = String(error?.code || error?.message || '');
    if (value.includes('OWNER_FIELD_FORBIDDEN')) return response(400, 'OWNER_FIELD_FORBIDDEN', 'Account targets are resolved from the verified session.');
    if (value.includes('OWNERSHIP_REQUIRED')) return response(409, 'OWNERSHIP_REVIEW_REQUIRED', 'Account ownership must be reviewed before this operation.');
    if (value.includes('REVIEW_REQUIRED')) return response(409, 'ACCOUNT_REVIEW_REQUIRED', 'This request requires secure manual review.');
    if (value.includes('EXPIRED')) return response(409, 'OPERATION_EXPIRED', 'The confirmation expired. Start again.');
    if (value.includes('CONFIRMATION_INVALID')) return response(403, 'INVALID_CONFIRMATION', 'The confirmation is invalid.');
    if (value.includes('OPERATION_NOT_FOUND')) return response(404, 'OPERATION_NOT_FOUND', 'The account operation was not found.');
    if (value.includes('OPERATION_IN_PROGRESS')) return response(409, 'OPERATION_IN_PROGRESS', 'Another account operation is already in progress.');
    if (value.includes('INVALID_STATE')) return response(409, 'OPERATION_STATE_CONFLICT', 'The account operation is no longer available.');
    return response(503, 'ACCOUNT_CONTROL_UNAVAILABLE', 'Account controls are temporarily unavailable.');
}

function response(status, code, message) { return { status, code, message }; }

