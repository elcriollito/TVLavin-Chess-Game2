import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createChallengeHandler } from '../api/user/identity-migration/challenge.js';
import syncHandler from '../api/user/sync.js';

const migration = fs.readFileSync(new URL(
    '../supabase/migrations/20261015220000_sec005_cutover_compatibility_v1.sql',
    import.meta.url
), 'utf8');

function responseHarness() {
    return {
        headers: {}, statusCode: 0, body: null,
        setHeader(name, value) { this.headers[name] = value; },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
}

test('production sync resolution is explicitly namespaced away from legacy subjects', () => {
    assert.match(migration, /create or replace function public\.resolve_clerk_identity_binding\([\s\S]*p_environment text/i);
    assert.match(migration, /environment = p_environment/i);
    assert.match(migration, /create or replace function public\.resolve_clerk_identity_for_sync\(p_external_subject text\)[\s\S]*environment = 'production'/i);
    assert.doesNotMatch(migration, /resolve_clerk_identity_for_sync[\s\S]*where b\.provider = 'clerk' and b\.external_subject = p_external_subject and b\.status = 'ACTIVE'[\s\S]*limit 1/i);
});

test('challenge route resolves the verified legacy subject only in the legacy authority', async () => {
    let observed;
    const userId = '00000000-0000-4000-8000-00000000000a';
    const supabase = {
        rpc: async (name, args) => {
            observed = { name, args };
            return { data: [{ resolution: 'BOUND', user_id: userId }], error: null };
        }
    };
    const handler = createChallengeHandler({
        env: { CAISSA_IDENTITY_MIGRATION_MODE: 'enforced' },
        getSupabase: () => supabase,
        consumePersistentMigrationThrottle: async () => ({ ok: true }),
        verifyDualMigrationTokens: async () => ({
            ok: true, legacySubject: 'LEGACY_VERIFIED', productionSubject: 'PROD_VERIFIED'
        }),
        createMigrationHandoff: async () => ({
            ok: true, token: 'opaque', expiresAt: '2030-01-01T00:00:00.000Z'
        })
    });
    const res = responseHarness();
    await handler({
        method: 'POST', body: {},
        headers: {
            'content-type': 'application/json',
            'x-caissa-legacy-session': 'legacy-token',
            'x-caissa-production-session': 'production-token'
        }
    }, res);
    assert.equal(res.statusCode, 201);
    assert.deepEqual(observed, {
        name: 'resolve_clerk_identity_binding',
        args: { p_external_subject: 'LEGACY_VERIFIED', p_environment: 'legacy_development' }
    });
});

test('subject remap atomically follows UUID-owned Online authorization caches', () => {
    assert.match(migration, /create trigger users_cascade_clerk_subject_remap[\s\S]*after update of clerk_id on public\.users/i);
    for (const table of [
        'caissa_online_profiles',
        'caissa_online_presence',
        'caissa_online_matchmaking_tickets',
        'caissa_online_games',
        'caissa_online_rate_limits'
    ]) {
        assert.match(migration, new RegExp(`public\\.${table}`, 'i'));
    }
    assert.match(migration, /white_user_id = new\.id[\s\S]*white_clerk_id = old\.clerk_id/i);
    assert.match(migration, /black_user_id = new\.id[\s\S]*black_clerk_id = old\.clerk_id/i);
    assert.match(migration, /draw_offer_by = old\.clerk_id/i);
    assert.match(migration, /version = g\.version \+ case when g\.status = 'active' then 1 else 0 end/i);
});

test('remap leaves UUID-owned economic, rating, event, and public nickname data untouched', () => {
    for (const protectedTable of [
        'credit_events', 'stripe_events', 'player_album_entitlements',
        'caissa_online_ratings', 'caissa_online_game_events', 'caissa_public_identities'
    ]) {
        assert.doesNotMatch(migration, new RegExp(`(?:update|delete\\s+from)\\s+public\\.${protectedTable}`, 'i'));
    }
    assert.doesNotMatch(migration, /set\s+(?:credits|is_premium|stripe_customer_id|public_nickname|fallback_alias)\s*=/i);
});

test('activation rejects subject reuse across environments and records exact predecessor', () => {
    assert.match(migration, /where b\.provider = 'clerk'[\s\S]*b\.external_subject = p_new_external_subject/i);
    assert.match(migration, /'previous_binding_id', v_legacy\.id/i);
    assert.match(migration, /TARGET_SUBJECT_ALREADY_BOUND/i);
});

test('rollback requires exact transition provenance before restoring a legacy binding', () => {
    assert.match(migration, /ROLLBACK_PROVENANCE_REQUIRED/i);
    assert.match(migration, /v_previous_binding_id := \(v_production\.metadata ->> 'previous_binding_id'\)::uuid/i);
    assert.match(migration, /c\.legacy_binding_id = v_legacy\.id[\s\S]*c\.status = 'USED'/i);
    assert.match(migration, /p\.current_binding_id = v_legacy\.id[\s\S]*p\.status = 'EXECUTED'/i);
});

test('activation and rollback fail closed against sibling proof replay', () => {
    assert.match(migration, /create or replace function public\._cascade_clerk_subject_remap\(\)[\s\S]*identity_migration_challenges[\s\S]*identity_manual_recovery_previews/i);
    assert.match(migration, /c\.user_id = v_challenge\.user_id[\s\S]*c\.id <> v_challenge\.id[\s\S]*c\.status = 'PENDING'/i);
    assert.match(migration, /update public\.identity_migration_challenges c[\s\S]*c\.user_id = p_user_id[\s\S]*c\.status = 'PENDING'/i);
    assert.match(migration, /update public\.identity_manual_recovery_previews p[\s\S]*p\.user_id = p_user_id[\s\S]*p\.status = 'PENDING'/i);
});

test('new-user approval is bounded, auditable, and service-role only', () => {
    assert.match(migration, /create or replace function public\.approve_clerk_identity_enrollment/i);
    assert.match(migration, /p_expires_at > pg_catalog\.clock_timestamp\(\) \+ interval '24 hours'/i);
    assert.match(migration, /subject_hash/i);
    assert.match(migration, /revoke all on function public\.approve_clerk_identity_enrollment\(text, text, timestamptz\)[\s\S]*from public, anon, authenticated/i);
    assert.match(migration, /grant execute on function public\.approve_clerk_identity_enrollment\(text, text, timestamptz\)[\s\S]*to service_role/i);
});

test('compatibility migration is transactional and contains no email ownership shortcut', () => {
    assert.match(migration.trim(), /^--[\s\S]*\nbegin;/i);
    assert.match(migration.trim(), /commit;$/i);
    assert.doesNotMatch(migration, /where\s+email\s*=|lower\s*\(\s*email\s*\)/i);
});

function syncRequest(subject, email = 'same-owner@example.invalid') {
    return { method: 'POST', headers: {}, body: {}, syntheticSubject: subject, syntheticEmail: email };
}

function syncDependencies(store) {
    return {
        verifyAuth: async (req) => ({
            authenticated: true,
            userId: req.syntheticSubject,
            email: req.syntheticEmail
        }),
        getSupabase: () => store
    };
}

test('enforced user sync blocks historical-pending and unclassified subjects before any upsert', async () => {
    const previousMode = process.env.CAISSA_IDENTITY_MIGRATION_MODE;
    process.env.CAISSA_IDENTITY_MIGRATION_MODE = 'enforced';
    try {
        for (const [resolution, expectedCode] of [
            ['MIGRATION_REQUIRED', 'IDENTITY_MIGRATION_REQUIRED'],
            ['UNRESOLVED', 'IDENTITY_RESOLUTION_REQUIRED']
        ]) {
            let tableAccesses = 0;
            const store = {
                rpc: async (name, args) => {
                    assert.equal(name, 'resolve_clerk_identity_for_sync');
                    assert.deepEqual(args, { p_external_subject: 'production-subject' });
                    return { data: [{ resolution, user_id: null }], error: null };
                },
                from: () => { tableAccesses += 1; throw new Error('ordinary upsert reached'); }
            };
            const res = responseHarness();
            await syncHandler(syncRequest('production-subject'), res, syncDependencies(store));
            assert.equal(res.statusCode, 409);
            assert.equal(res.body.code, expectedCode);
            assert.equal(tableAccesses, 0);
        }
    } finally {
        if (previousMode === undefined) delete process.env.CAISSA_IDENTITY_MIGRATION_MODE;
        else process.env.CAISSA_IDENTITY_MIGRATION_MODE = previousMode;
    }
});

test('approved-new concurrency provisions one UUID, rejects the conflict, and retries as bound', async () => {
    const previousMode = process.env.CAISSA_IDENTITY_MIGRATION_MODE;
    process.env.CAISSA_IDENTITY_MIGRATION_MODE = 'enforced';
    let provisioned = false;
    let provisionCalls = 0;
    let updates = 0;
    const userId = '70000000-0000-4000-8000-00000000000a';
    const store = {
        async rpc(name) {
            if (name === 'resolve_clerk_identity_for_sync') {
                return { data: [{ resolution: provisioned ? 'BOUND' : 'APPROVED_NEW', user_id: provisioned ? userId : null }], error: null };
            }
            if (name === 'provision_approved_clerk_identity') {
                provisionCalls += 1;
                if (provisioned) return { data: [{ success: false, code: 'SUBJECT_ALREADY_BOUND', user_id: null }], error: null };
                provisioned = true;
                return { data: [{ success: true, code: 'NEW_ACCOUNT_PROVISIONED', user_id: userId }], error: null };
            }
            throw new Error(`unexpected rpc ${name}`);
        },
        from(name) {
            assert.equal(name, 'users');
            return {
                update() { updates += 1; return this; },
                eq() { return this; },
                select() { return this; },
                async single() {
                    return { data: { clerk_id: 'new-production-subject', email: null, role: 'member', is_premium: false, credits: 5 }, error: null };
                }
            };
        }
    };
    try {
        const first = responseHarness();
        const second = responseHarness();
        await Promise.all([
            syncHandler(syncRequest('new-production-subject'), first, syncDependencies(store)),
            syncHandler(syncRequest('new-production-subject'), second, syncDependencies(store))
        ]);
        assert.deepEqual([first.statusCode, second.statusCode].sort(), [200, 409]);
        assert.equal(provisionCalls, 2);
        assert.equal(updates, 1);

        const retry = responseHarness();
        await syncHandler(syncRequest('new-production-subject'), retry, syncDependencies(store));
        assert.equal(retry.statusCode, 200);
        assert.equal(provisionCalls, 2);
        assert.equal(updates, 2);
    } finally {
        if (previousMode === undefined) delete process.env.CAISSA_IDENTITY_MIGRATION_MODE;
        else process.env.CAISSA_IDENTITY_MIGRATION_MODE = previousMode;
    }
});

test('enforced user sync fails closed when the identity dependency is unavailable', async () => {
    const previousMode = process.env.CAISSA_IDENTITY_MIGRATION_MODE;
    process.env.CAISSA_IDENTITY_MIGRATION_MODE = 'enforced';
    try {
        const store = {
            rpc: async () => ({ data: null, error: new Error('synthetic dependency failure') }),
            from: () => { throw new Error('table path must stay unreachable'); }
        };
        const res = responseHarness();
        await syncHandler(syncRequest('production-subject'), res, syncDependencies(store));
        assert.equal(res.statusCode, 503);
        assert.equal(res.body.code, 'IDENTITY_SERVICE_UNAVAILABLE');
    } finally {
        if (previousMode === undefined) delete process.env.CAISSA_IDENTITY_MIGRATION_MODE;
        else process.env.CAISSA_IDENTITY_MIGRATION_MODE = previousMode;
    }
});
