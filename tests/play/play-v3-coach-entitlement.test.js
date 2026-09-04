import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import handler from '../../api/play/coach/entitlement.js';

const root = process.cwd();
const read = file => fs.readFileSync(`${root}/${file}`, 'utf8');
const operationId = '00000000-0000-4000-8000-000000000042';
const auth = async () => ({ authenticated: true, userId: 'user_clerk_1' });
const rate = () => ({ allowed: true, remaining: 9 });
function response() {
    return { statusCode: 200, headers: {}, payload: null,
        setHeader(key, value) { this.headers[key] = value; },
        status(code) { this.statusCode = code; return this; },
        json(value) { this.payload = value; return this; }, end() { return this; } };
}
const getDb = user => ({ from(name) { assert.equal(name, 'users'); return {
    select(columns) { assert.equal(columns, 'is_premium, coach_trial_consumed_at'); return this; },
    eq(column, value) { assert.equal(column, 'clerk_id'); assert.equal(value, 'user_clerk_1'); return this; },
    async single() { return { data: user, error: user ? null : { code: 'missing' } }; }
}; } });

test('temporary Play v3 feedback window is open and never consumes the free trial', async () => {
    let authCalls = 0; let dbCalls = 0;
    for (const method of ['GET', 'POST']) {
        const res = response();
        await handler({ method, headers: {} }, res, {
            verifyAuth: async () => { authCalls += 1; return { authenticated: false }; },
            getSupabase: () => { dbCalls += 1; return {}; }
        });
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.payload, { allowed: true, code: 'OPEN_PREVIEW_ACCESS', coachAccess: 'preview',
            coachTrialGamesRemaining: 0, coachGameConsumed: false });
    }
    assert.equal(authCalls, 0); assert.equal(dbCalls, 0);
});

test('GET returns server-authoritative Premium, free-trial, and used states when preview closes', async () => {
    for (const [user, expected] of [
        [{ is_premium: true, coach_trial_consumed_at: null }, ['PREMIUM_ACCESS', true, 0]],
        [{ is_premium: false, coach_trial_consumed_at: null }, ['TRIAL_AVAILABLE', true, 1]],
        [{ is_premium: false, coach_trial_consumed_at: '2026-09-02T00:00:00Z' }, ['COACH_TRIAL_USED', false, 0]]
    ]) {
        const res = response();
        await handler({ method: 'GET', headers: {} }, res, { openPreview: false, verifyAuth: auth, checkRateLimit: rate, getSupabase: () => getDb(user) });
        assert.deepEqual([res.payload.code, res.payload.allowed, res.payload.coachTrialGamesRemaining], expected);
        assert.equal(res.headers['Cache-Control'], 'private, no-store, max-age=0');
    }
});

test('POST requires idempotency and maps the atomic RPC without trusting client claims when preview closes', async () => {
    const calls = [];
    const db = { async rpc(name, params) { calls.push([name, params]); return { data: [{ allowed: true,
        code: 'TRIAL_CONSUMED', coach_access: 'trial', coach_trial_games_remaining: 0, coach_game_consumed: true }], error: null }; } };
    const missing = response();
    await handler({ method: 'POST', headers: {} }, missing, { openPreview: false, verifyAuth: auth, checkRateLimit: rate, getSupabase: () => db });
    assert.equal(missing.statusCode, 400); assert.equal(calls.length, 0);
    const accepted = response();
    await handler({ method: 'POST', headers: { 'idempotency-key': operationId }, body: { isPremium: true, remaining: 99 } },
        accepted, { openPreview: false, verifyAuth: auth, checkRateLimit: rate, getSupabase: () => db });
    assert.equal(accepted.statusCode, 200);
    assert.deepEqual(calls[0], ['consume_coach_game_access', { p_clerk_id: 'user_clerk_1', p_operation_id: operationId }]);
    assert.equal(accepted.payload.coachGameConsumed, true);
});

test('used trial is denied and database failure is fail-closed when preview closes', async () => {
    const denied = response();
    await handler({ method: 'POST', headers: { 'idempotency-key': operationId } }, denied, { openPreview: false, verifyAuth: auth, checkRateLimit: rate,
        getSupabase: () => ({ rpc: async () => ({ data: [{ allowed: false, code: 'COACH_TRIAL_USED', coach_access: 'locked',
            coach_trial_games_remaining: 0, coach_game_consumed: false }], error: null }) }) });
    assert.equal(denied.statusCode, 403); assert.equal(denied.payload.allowed, false);
    const unavailable = response();
    await handler({ method: 'POST', headers: { 'idempotency-key': operationId } }, unavailable, { openPreview: false, verifyAuth: auth, checkRateLimit: rate,
        getSupabase: () => ({ rpc: async () => ({ data: null, error: new Error('down') }) }) });
    assert.equal(unavailable.statusCode, 503); assert.equal(unavailable.payload.code, 'COACH_ACCESS_UNAVAILABLE');
});

test('migration makes one free game atomic, idempotent, and server-only', () => {
    const sql = read('supabase/migrations/20260902000000_coach_game_entitlements.sql');
    assert.match(sql, /coach_trial_consumed_at timestamptz/i);
    assert.match(sql, /coach_trial_operation_id uuid/i);
    assert.match(sql, /for update;/i);
    assert.match(sql, /v_user\.is_premium/i);
    assert.match(sql, /v_user\.coach_trial_operation_id = p_operation_id/i);
    assert.match(sql, /security definer\s+set search_path = ''/i);
    assert.match(sql, /revoke execute[\s\S]*from public, anon, authenticated, service_role/i);
    assert.match(sql, /grant execute[\s\S]*to service_role/i);
    assert.doesNotMatch(sql, /user_metadata|raw_user_meta_data|auth\.jwt/i);
});

test('browser entitlement client uses Clerk bearer auth and keeps no local entitlement', async () => {
    const calls = [];
    const window = { CAISSA_AUTH: { isSignedIn: true, whenReady: async () => {}, getToken: async () => 'token' },
        crypto: { randomUUID: () => operationId }, fetch: async (url, options) => { calls.push([url, options]); return {
            status: 200, json: async () => ({ allowed: true, code: options.method === 'GET' ? 'TRIAL_AVAILABLE' : 'TRIAL_CONSUMED',
                coachAccess: 'trial', coachTrialGamesRemaining: options.method === 'GET' ? 1 : 0, coachGameConsumed: options.method === 'POST' })
        }; } };
    vm.runInNewContext(read('js/play/native-coach/coach-entitlement-client.js'), { window, globalThis: window, Object, Set });
    const preview = window.CaissaCoachEntitlementClient.create();
    assert.deepEqual(JSON.parse(JSON.stringify(await preview.refresh())), { verified: true, allowed: true,
        code: 'OPEN_PREVIEW_ACCESS', coachAccess: 'preview', coachTrialGamesRemaining: 0, coachGameConsumed: false });
    assert.equal(calls.length, 0);
    const client = window.CaissaCoachEntitlementClient.create({ openPreview: false });
    assert.equal((await client.refresh()).code, 'TRIAL_AVAILABLE');
    assert.equal((await client.consume()).code, 'TRIAL_CONSUMED');
    assert.equal(calls[1][1].headers.Authorization, 'Bearer token');
    assert.equal(calls[1][1].headers['Idempotency-Key'], operationId);
    const source = read('js/play/native-coach/coach-entitlement-client.js');
    assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|document\.cookie/i);
});

test('Coach remains visible when locked and only server admission can enable Play', () => {
    const panel = read('js/play/native-coach/coach-panel.js');
    const registry = read('js/play/performance/play-load-registry.js');
    assert.match(panel, /Your complimentary Coach game has been used/);
    assert.match(panel, /Explore Premium/);
    assert.match(panel, /await this\.#entitlement\.consume\(\)/);
    assert.match(panel, /action\.disabled = access\?\.allowed !== true/);
    assert.match(panel, /this\.#submitting/);
    assert.match(panel, /Sign in to play/);
    assert.match(panel, /currentAccess\?\.code === 'AUTH_REQUIRED'/);
    assert.match(panel, /setAttribute\('aria-busy', 'true'\)/);
    const shell = read('js/play/simplified-play-shell.js');
    assert.match(shell, /getAttribute\('aria-busy'\) === 'true'/);
    assert.ok(registry.indexOf('coach-entitlement-client.js?v=1.1.0') < registry.indexOf('coach-panel.js?v=2.6.0'));
});
