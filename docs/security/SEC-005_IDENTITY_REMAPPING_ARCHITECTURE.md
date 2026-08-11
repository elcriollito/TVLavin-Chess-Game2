# SEC-005 Identity Remapping Architecture

Baseline: `0c3c1599ad47aae9477db863146bd3909020355d`

## Security invariant

Clerk authenticates the human; `users.id` owns the CAISSA account. Remapping changes the external subject on the same internal UUID. It does not recreate the user, credits, premium state, role, Stripe customer, credit history or library ownership.

## Implemented foundation

| Component | Purpose |
| --- | --- |
| `identity_bindings` | Auditable legacy/production Clerk subjects tied to `users.id`; constrained states and unique external subjects. |
| `identity_migration_challenges` | Short-lived, hashed, single-use handoffs bound to an existing account and the hash of a server-verified production subject. |
| `identity_enrollment_decisions` | Service-side classification of an unknown production subject as approved new, denied or review. |
| `identity_migration_audit` | Append-only operational evidence for challenge, activation, provisioning and rollback actions. |
| `create_clerk_migration_challenge` | Verifies the active legacy binding and records a challenge with a maximum 15-minute expiry. |
| `activate_clerk_identity_binding` | Atomically locks proof/account/bindings, rejects replay/expiry/conflicts, activates production subject, retires legacy subject and updates `users.clerk_id`. |
| `rollback_clerk_identity_binding` | Restores the retired legacy subject on the same internal UUID and revokes the production binding. |
| `resolve_clerk_identity_for_sync` | Classifies subjects as bound, migration-required, approved-new or unresolved. |
| `provision_approved_clerk_identity` | Atomically creates a genuinely new account only after a server-side approval decision. |

All tables use RLS without browser policies. Table access and function execution are revoked from `anon` and `authenticated`; RPC execution is granted only to `service_role`. The migration is additive and has not been applied to production.

## PostgreSQL rehearsal evidence

Task 12.2.2A applied the authoritative base and library schemas plus the SEC-005 migration to an explicitly isolated, empty Supabase PostgreSQL 17.6 database. Real RPC execution found two PostgreSQL compatibility defects, both corrected without weakening authorization or constraints:

- Supabase installs `pgcrypto.digest` in `extensions`, which is intentionally absent from fixed `search_path=public`; hashing now uses schema-qualified built-in `pg_catalog.sha256(pg_catalog.convert_to(...))`.
- The activation function's unqualified legacy-binding `user_id` conflicted with its `RETURNS TABLE` output parameter; the table reference is now explicitly aliased.

After reapplication, 15/15 real-database checks passed. The corrected migration also reapplied successfully. PostgreSQL catalogs confirmed four identity tables with RLS enabled and zero policies, and five `SECURITY DEFINER` functions owned by `postgres`, fixed to `search_path=public`, denied to PUBLIC/`anon`/`authenticated`, and executable only by `service_role`.

The rehearsal proved one-success/one-safe-failure concurrent activation, single-use challenge consumption, expiry/token/subject rejection, target collision atomicity, audit-failure rollback, UUID/economic/Stripe/child preservation, authorized rollback, unauthorized rollback denial, and migration-aware sync against real RPCs. Full evidence is in `SEC-005_MIGRATION_REHEARSAL_REPORT.md`.

## Binding states

Bindings use `PENDING`, `VERIFIED`, `ACTIVE`, `RETIRED`, `CONFLICT` and `REVOKED`. A partial unique index permits at most one active Clerk binding per user/environment. The provider/environment/subject tuple is globally unique.

Normal transition:

```text
legacy development = ACTIVE
production = absent
→ verified handoff
legacy development = RETIRED
production = ACTIVE
```

Rollback:

```text
production = ACTIVE → REVOKED
legacy development = RETIRED → ACTIVE
users.clerk_id restored
```

Old identity history is retired, never deleted.

## Proof hierarchy

1. **DUAL_AUTH** — preferred: independently verify the active legacy session and production session using fixed server-side authorities.
2. **SESSION_HANDOFF** — old verified account creates a high-entropy handoff already bound to the separately verified production subject.
3. **STRIPE_ASSISTED** — supporting recovery evidence only; requires verified Stripe customer ownership and another approval signal.
4. **MANUAL_RECOVERY** — controlled backend/script workflow with privileged authorization, reason, confirmation and audit evidence.
5. Email — supporting signal only and never an authority.

The current helper accepts only server-derived `existingAccount` and `verifiedProductionSubject` values. A future route must implement explicit `verifyLegacyClerkToken()` and `verifyProductionClerkToken()` with separate fixed server secrets/issuers. No generic or client-selected verifier is permitted.

## Token lifecycle

- 256-bit random bearer value from `crypto.randomBytes(32)`;
- only SHA-256 hash persisted;
- maximum 15-minute database-enforced TTL;
- expected production subject stored only as a hash;
- atomic `PENDING → USED` transition;
- replay, expiry, wrong subject and duplicate target fail closed;
- no Clerk secret, account UUID, premium, role, credits or Stripe customer is embedded in the token.

## Atomicity

`activate_clerk_identity_binding` is one PostgreSQL transaction:

```text
lock challenge
→ verify pending/TTL/subject hash
→ lock users row
→ lock active legacy binding
→ confirm production subject unbound
→ insert production binding
→ retire legacy binding
→ update users.clerk_id
→ consume challenge
→ write audit event
→ commit
```

Any error rolls back all writes. Browser sequencing and process-local locks are irrelevant.

## Duplicate prevention and sync

`/api/user/sync` retains existing behavior unless the server-only variable is exactly:

```text
CAISSA_IDENTITY_MIGRATION_MODE=enforced
```

When enforced:

- active binding → update that existing internal row;
- pending migration → `409 IDENTITY_MIGRATION_REQUIRED`;
- unresolved subject → `409 IDENTITY_RESOLUTION_REQUIRED`;
- approved-new subject → atomic provisioning RPC;
- client `existingUser`, email, user ID, credits, premium or role cannot authorize binding/provisioning.

This prevents the current upsert from silently creating a default duplicate for a migrating human while allowing explicitly classified new users.

## Stripe and owned-data preservation

Only `users.clerk_id` changes. The following stay on the same row:

- `users.id`;
- `stripe_customer_id`;
- credits, premium and role;
- credit events referencing `users.id`;
- library records referencing `users.id`.

New checkout must remain disabled until binding resolution succeeds. Pre-cutover Checkout Sessions should be expired/drained before cutover; this is preferred over a temporary dual-subject fulfillment path. Renewal/deletion flows continue resolving by the unchanged Stripe customer ID. After mapping, Stripe metadata should record internal CAISSA UUID as durable identity and production Clerk subject as secondary context.

## Conflict and manual recovery

Duplicate target subjects, inactive/missing legacy bindings, mismatched production subjects, used/expired challenges, existing ambiguous accounts and unapproved new subjects fail closed. Email collisions never merge rows. Manual recovery is not exposed publicly and remains an operational prerequisite; use a controlled service-role tool with privileged operator authentication, reason, dry-run, explicit confirmation and audit output.

## Data-quality utility

`scripts/audit-identity-migration-readiness.mjs` accepts an approved redacted JSON export and reports counts only:

- total/present/missing Clerk subjects;
- duplicate Clerk-subject groups;
- present/missing/duplicate email groups;
- present/duplicate Stripe-customer groups;
- premium users;
- positive-credit users.

It does not connect to production or print raw identifiers. No production data audit was run in this task.

## Remaining prerequisites

- review production count report and resolve constraint conflicts;
- apply the corrected migration to production only through an approved DB release;
- implement independently configured legacy/production Clerk token verification endpoints;
- implement privileged recovery tooling;
- create production enrollment decisions from a trusted lifecycle process;
- rehearse Clerk verifier and Stripe test-mode network behavior after isolated credentials exist;
- resolve SEC-011 redirect validation before live auth cutover;
- install environment-specific live keys only in the later cutover release.
