import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
    activateMigrationHandoff,
    createMigrationHandoff,
    identityMigrationInternals,
    rollbackIdentityBinding
} from '../api/_lib/identity-migration.js';
import {
    isIdentityMigrationEnforced,
    syncResolvedIdentity
} from '../api/_lib/identity-resolution.js';
import { summarizeIdentityReadiness } from '../scripts/audit-identity-migration-readiness.mjs';

function migrationStore({ expiresAt = Date.now() + 60_000 } = {}) {
    const state = {
        users: new Map([
            ['U1', { id: 'U1', clerk_id: 'OLD1', credits: 50, is_premium: true, role: 'member', stripe_customer_id: 'CUS1' }],
            ['U2', { id: 'U2', clerk_id: 'OLD2', credits: 2, is_premium: false, role: 'member', stripe_customer_id: 'CUS2' }]
        ]),
        bindings: new Map([
            ['legacy:OLD1', { userId: 'U1', subject: 'OLD1', environment: 'legacy_development', status: 'ACTIVE' }],
            ['legacy:OLD2', { userId: 'U2', subject: 'OLD2', environment: 'legacy_development', status: 'ACTIVE' }]
        ]),
        challenges: new Map(),
        children: [{ type: 'credit_event', userId: 'U1' }, { type: 'library_position', userId: 'U1' }]
    };

    return {
        state,
        async rpc(name, params) {
            if (name === 'create_clerk_migration_challenge') {
                const binding = state.bindings.get(`legacy:${params.p_legacy_subject}`);
                if (!binding || binding.userId !== params.p_user_id || binding.status !== 'ACTIVE') {
                    return { data: [{ success: false, code: 'LEGACY_BINDING_NOT_ACTIVE' }], error: null };
                }
                const id = `challenge-${state.challenges.size + 1}`;
                state.challenges.set(params.p_token_hash, {
                    id,
                    userId: binding.userId,
                    legacySubject: binding.subject,
                    expectedHash: identityMigrationInternals.sha256(params.p_expected_new_subject),
                    status: 'PENDING',
                    expiresAt: Math.min(new Date(params.p_expires_at).getTime(), expiresAt)
                });
                return { data: [{ success: true, code: 'CHALLENGE_CREATED', challenge_id: id }], error: null };
            }

            if (name === 'activate_clerk_identity_binding') {
                const challenge = state.challenges.get(params.p_token_hash);
                if (!challenge || challenge.status !== 'PENDING') {
                    return { data: [{ success: false, code: 'CHALLENGE_INVALID_OR_USED' }], error: null };
                }
                if (challenge.expiresAt <= Date.now()) {
                    challenge.status = 'EXPIRED';
                    return { data: [{ success: false, code: 'CHALLENGE_EXPIRED' }], error: null };
                }
                if (challenge.expectedHash !== identityMigrationInternals.sha256(params.p_new_external_subject)) {
                    return { data: [{ success: false, code: 'NEW_SUBJECT_MISMATCH' }], error: null };
                }
                if (state.bindings.has(`production:${params.p_new_external_subject}`)) {
                    challenge.status = 'CONFLICT';
                    return { data: [{ success: false, code: 'TARGET_SUBJECT_ALREADY_BOUND' }], error: null };
                }
                const user = state.users.get(challenge.userId);
                state.bindings.get(`legacy:${challenge.legacySubject}`).status = 'RETIRED';
                state.bindings.set(`production:${params.p_new_external_subject}`, {
                    userId: user.id,
                    subject: params.p_new_external_subject,
                    environment: 'production',
                    status: 'ACTIVE'
                });
                user.clerk_id = params.p_new_external_subject;
                challenge.status = 'USED';
                return { data: [{ success: true, code: 'BINDING_ACTIVATED', user_id: user.id, binding_id: 'BNEW' }], error: null };
            }

            if (name === 'rollback_clerk_identity_binding') {
                const user = state.users.get(params.p_user_id);
                const legacy = [...state.bindings.values()].find((item) => item.userId === params.p_user_id && item.environment === 'legacy_development');
                const production = [...state.bindings.values()].find((item) => item.userId === params.p_user_id && item.environment === 'production' && item.status === 'ACTIVE');
                if (!user || !legacy || !production) return { data: [{ success: false, code: 'ROLLBACK_BINDING_NOT_FOUND' }], error: null };
                production.status = 'REVOKED';
                legacy.status = 'ACTIVE';
                user.clerk_id = legacy.subject;
                return { data: [{ success: true, code: 'BINDING_ROLLED_BACK' }], error: null };
            }

            throw new Error(`unexpected rpc ${name}`);
        }
    };
}

async function createAndActivate(store, subject = 'NEW1') {
    const handoff = await createMigrationHandoff({
        supabase: store,
        existingAccount: { userId: 'U1', legacySubject: 'OLD1' },
        verifiedProductionSubject: subject
    });
    assert.equal(handoff.ok, true);
    return { handoff, result: await activateMigrationHandoff({ supabase: store, token: handoff.token, verifiedProductionSubject: subject }) };
}

test('migration SQL is transactional, constrained, RLS-enabled, and service-role-only', () => {
    const sql = fs.readFileSync(new URL('../supabase/migrations/20260811_clerk_identity_remapping_foundation.sql', import.meta.url), 'utf8');
    assert.match(sql, /references public\.users\(id\)/);
    assert.match(sql, /unique \(provider, environment, external_subject\)/);
    assert.match(sql, /where status = 'ACTIVE'/);
    assert.match(sql, /for update/g);
    assert.match(sql, /status = 'USED'/);
    assert.match(sql, /enable row level security/g);
    assert.match(sql, /revoke execute[\s\S]+from public, anon, authenticated/);
    assert.match(sql, /grant execute[\s\S]+to service_role/);
    assert.doesNotMatch(sql, /email\s*=.*external_subject|where email/i);
});

test('existing account remaps without changing economic or Stripe state', async () => {
    const store = migrationStore();
    const before = { ...store.state.users.get('U1') };
    const { result } = await createAndActivate(store);
    const after = store.state.users.get('U1');
    assert.equal(result.ok, true);
    assert.equal(after.id, before.id);
    assert.equal(after.credits, before.credits);
    assert.equal(after.is_premium, before.is_premium);
    assert.equal(after.role, before.role);
    assert.equal(after.stripe_customer_id, before.stripe_customer_id);
    assert.equal(after.clerk_id, 'NEW1');
    assert.equal(store.state.users.size, 2);
});

test('child ownership remains attached to the immutable internal UUID', async () => {
    const store = migrationStore();
    await createAndActivate(store);
    assert.deepEqual(store.state.children.map((item) => item.userId), ['U1', 'U1']);
});

test('duplicate production target subject is rejected', async () => {
    const store = migrationStore();
    store.state.bindings.set('production:NEW1', { userId: 'U2', subject: 'NEW1', environment: 'production', status: 'ACTIVE' });
    const { result } = await createAndActivate(store);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'TARGET_SUBJECT_ALREADY_BOUND');
    assert.equal(store.state.users.get('U1').clerk_id, 'OLD1');
});

test('migration challenge is single-use and rejects replay', async () => {
    const store = migrationStore();
    const { handoff, result } = await createAndActivate(store);
    assert.equal(result.ok, true);
    const replay = await activateMigrationHandoff({ supabase: store, token: handoff.token, verifiedProductionSubject: 'NEW1' });
    assert.equal(replay.ok, false);
    assert.equal(replay.code, 'CHALLENGE_INVALID_OR_USED');
});

test('expired migration challenge is rejected', async () => {
    const store = migrationStore({ expiresAt: Date.now() - 1 });
    const handoff = await createMigrationHandoff({
        supabase: store,
        existingAccount: { userId: 'U1', legacySubject: 'OLD1' },
        verifiedProductionSubject: 'NEW1'
    });
    const result = await activateMigrationHandoff({ supabase: store, token: handoff.token, verifiedProductionSubject: 'NEW1' });
    assert.equal(result.code, 'CHALLENGE_EXPIRED');
});

test('wrong new Clerk identity is rejected', async () => {
    const store = migrationStore();
    const handoff = await createMigrationHandoff({
        supabase: store,
        existingAccount: { userId: 'U1', legacySubject: 'OLD1' },
        verifiedProductionSubject: 'NEW1'
    });
    const result = await activateMigrationHandoff({ supabase: store, token: handoff.token, verifiedProductionSubject: 'ATTACKER' });
    assert.equal(result.code, 'NEW_SUBJECT_MISMATCH');
    assert.equal(store.state.users.get('U1').clerk_id, 'OLD1');
});

test('forged account fields and email-only claims carry no authority', async () => {
    const store = migrationStore();
    const result = await activateMigrationHandoff({
        supabase: store,
        token: 'email@example.test',
        verifiedProductionSubject: 'NEW1',
        userId: 'U2',
        credits: 999999,
        isPremium: true
    });
    assert.equal(result.ok, false);
    assert.equal(store.state.users.get('U1').credits, 50);
    assert.equal(store.state.users.get('U2').credits, 2);
});

test('unknown legacy account fails closed', async () => {
    const store = migrationStore();
    const result = await createMigrationHandoff({
        supabase: store,
        existingAccount: { userId: 'missing', legacySubject: 'UNKNOWN' },
        verifiedProductionSubject: 'NEW1'
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'LEGACY_BINDING_NOT_ACTIVE');
});

test('rollback restores retired legacy subject without changing the account row', async () => {
    const store = migrationStore();
    await createAndActivate(store);
    const result = await rollbackIdentityBinding({ supabase: store, trustedUserId: 'U1', reason: 'verified rollback test' });
    assert.equal(result.ok, true);
    assert.equal(store.state.users.get('U1').clerk_id, 'OLD1');
    assert.equal(store.state.users.get('U1').stripe_customer_id, 'CUS1');
    assert.equal(store.state.users.get('U1').credits, 50);
});

function syncStore(resolution, { provisionSuccess = true } = {}) {
    let updates = 0;
    let provisions = 0;
    return {
        metrics: () => ({ updates, provisions }),
        async rpc(name) {
            if (name === 'resolve_clerk_identity_for_sync') return { data: [{ resolution, user_id: resolution === 'BOUND' ? 'U1' : null }], error: null };
            if (name === 'provision_approved_clerk_identity') {
                provisions += 1;
                return { data: [{ success: provisionSuccess, code: provisionSuccess ? 'NEW_ACCOUNT_PROVISIONED' : 'NEW_ACCOUNT_NOT_APPROVED', user_id: provisionSuccess ? 'U3' : null }], error: null };
            }
            throw new Error(`unexpected rpc ${name}`);
        },
        from() {
            return {
                update() { updates += 1; return this; },
                eq() { return this; },
                select() { return this; },
                async single() {
                    return { data: { clerk_id: resolution === 'APPROVED_NEW' ? 'NEW3' : 'NEW1', email: null, role: 'member', is_premium: false, credits: 5 }, error: null };
                }
            };
        }
    };
}

test('migration-aware sync blocks pending migration and unknown subjects without creating rows', async () => {
    for (const [resolution, code] of [['MIGRATION_REQUIRED', 'IDENTITY_MIGRATION_REQUIRED'], ['UNRESOLVED', 'IDENTITY_RESOLUTION_REQUIRED']]) {
        const store = syncStore(resolution);
        const result = await syncResolvedIdentity({ supabase: store, externalSubject: 'NEW1', email: 'supporting@example.test' });
        assert.equal(result.code, code);
        assert.deepEqual(store.metrics(), { updates: 0, provisions: 0 });
    }
});

test('migration-aware sync provisions only an explicitly approved new subject', async () => {
    const store = syncStore('APPROVED_NEW');
    const result = await syncResolvedIdentity({ supabase: store, externalSubject: 'NEW3', email: 'new@example.test' });
    assert.equal(result.ok, true);
    assert.deepEqual(store.metrics(), { updates: 1, provisions: 1 });
});

test('migration mode is explicit and server-controlled', () => {
    assert.equal(isIdentityMigrationEnforced({}), false);
    assert.equal(isIdentityMigrationEnforced({ CAISSA_IDENTITY_MIGRATION_MODE: 'enforced' }), true);
    assert.equal(isIdentityMigrationEnforced({ CAISSA_IDENTITY_MIGRATION_MODE: 'true' }), false);
});

test('read-only readiness utility reports counts without emitting identifiers', () => {
    const report = summarizeIdentityReadiness([
        { clerk_id: 'A', email: 'same@example.test', stripe_customer_id: 'CUS1', is_premium: true, credits: 5 },
        { clerk_id: 'B', email: 'same@example.test', stripe_customer_id: 'CUS2', is_premium: false, credits: 0 },
        { clerk_id: 'B', email: null, stripe_customer_id: 'CUS2', is_premium: false, credits: 1 }
    ]);
    assert.deepEqual(report, {
        totalUsers: 3,
        usersWithClerkId: 3,
        usersWithoutClerkId: 0,
        duplicateClerkIdGroups: 1,
        usersWithEmail: 2,
        usersWithoutEmail: 1,
        duplicateEmailGroups: 1,
        usersWithStripeCustomerId: 3,
        duplicateStripeCustomerIdGroups: 1,
        premiumUsers: 1,
        usersWithPositiveCredits: 2
    });
    const serialized = JSON.stringify(report);
    assert.doesNotMatch(serialized, /same@example|CUS1|CUS2|"A"|"B"/);
});
