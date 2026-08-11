# SEC-005 Migration Rehearsal Report

Date: 2026-08-11

Status: **CORE DATABASE REHEARSAL PASSED; LIVE CUTOVER TOOLING INCOMPLETE**

## Environment and production safety

The target was explicitly authorized as `CAISSA IDENTITY MIGRATION REHEARSAL`: an isolated, disposable, non-production Supabase PostgreSQL database. Metadata-only inspection occurred before writes. It reported PostgreSQL 17.6, database `postgres`, standard empty Supabase schemas, no `public` application tables and zero `auth.users`. No production credential, production database, real identity, real Stripe customer, Vercel configuration or live network transaction was used.

The authoritative `supabase-schema.sql` and `supabase-schema-v2.sql` files were applied before `supabase/migrations/20260811_clerk_identity_remapping_foundation.sql`.

## Migration corrections and deploy behavior

Initial table/function creation succeeded, but real RPC execution exposed:

1. SQLSTATE `42883`: `digest(text, unknown)` was unavailable under fixed `search_path=public` because Supabase installs `pgcrypto` in `extensions`. The migration now uses built-in, schema-qualified `pg_catalog.sha256(pg_catalog.convert_to(...))` and `pg_catalog.encode`.
2. SQLSTATE `42702`: bare `user_id` in the activation legacy-binding query was ambiguous with the function output parameter. The binding table is now explicitly aliased.

After correction, the migration applied and reapplied successfully. Tables/indexes use `if not exists`, functions use `create or replace`, and backfill uses conflict handling. Retry after transactional failure is recoverable because PostgreSQL rolls back the failed transaction. Repository deployment conventions may still record the migration once.

## Synthetic preservation evidence

User A began with UUID `00000000-0000-4000-8000-00000000000a`, subject `LEGACY_A`, 50 credits, premium true, role `member`, and a synthetic Stripe customer. A credit event, library collection, library position and sync-log entry referenced that UUID.

Activation proved:

```text
LEGACY_A -> same users.id -> PROD_A
```

There remained exactly one user row. UUID, credits, premium, role, Stripe customer and every child `user_id` were unchanged. Rollback restored `LEGACY_A` on the same row and revoked the production binding without child updates. Lookup by the synthetic Stripe customer continued to resolve the same UUID, demonstrating renewal/deletion continuity without creating a customer.

## Challenge, collision, concurrency and atomicity

- Database storage contained the token SHA-256 hash, expected-subject hash, proof method and short expiry, never challenge plaintext.
- Modified token, expired challenge, wrong production subject, forged user/legacy association and replay were denied without account mutation.
- A target production subject already bound to User C could not be claimed by User B; both users and children remained unchanged.
- Two simultaneous PostgreSQL activation requests against the same challenge produced exactly one success and one safe failure.
- An injected audit trigger failure aborted activation: user subject, bindings and challenge consumption all rolled back.
- Pending challenges are valid recoverable state and can expire/revoke without changing account ownership. No stranded retired-legacy/no-active-production state was produced by the RPC.

## RLS and privilege evidence

Catalog inspection found RLS enabled on all four identity tables with zero policies. Direct table operations are denied; service operations occur through explicitly granted `SECURITY DEFINER` RPCs.

| Operation | anon | authenticated | service_role |
| --- | --- | --- | --- |
| Enumerate bindings | DENY | DENY | RPC/owner controlled |
| Read challenge hashes | DENY | DENY | RPC/owner controlled |
| Create privileged binding/challenge | DENY | DENY | ALLOW through granted RPC |
| Activate migration | DENY | DENY | ALLOW through granted RPC |
| Rollback | DENY | DENY | ALLOW through granted RPC |
| Manual recovery | DENY | DENY | Not implemented |

All five SEC-005 functions are owned by `postgres`, use `SECURITY DEFINER`, set fixed `search_path=public`, contain no dynamic SQL, qualify application objects, and are non-executable by PUBLIC, `anon` and `authenticated`. PUBLIC, `anon`, `authenticated` and `service_role` also lack `CREATE` on schema `public`, preventing search-path object shadowing. Only `service_role` has function EXECUTE. Verdict: **PASS**.

## Sync, enrollment and Stripe

The migration-aware sync helper was exercised against real database RPCs and rows. A mapped legacy subject and mapped production subject resolved existing accounts. A pending production subject was denied as migration-required. Unknown and forged-email-matching subjects were denied. Resolver failure failed closed. User count remained four.

Approved-new provisioning requires an unconsumed server-side enrollment decision, but the authority that creates those decisions is not configured. This remains a live-cutover blocker. There is no dual-Clerk verifier route and no controlled manual-recovery CLI; both remain tooling blockers. No email-only or client-controlled enrollment substitute is acceptable.

The selected legacy checkout policy is to pause new checkout, identify and drain/expire all pre-cutover Checkout Sessions, then activate production identities and resume checkout only for mapped users. Renewal and deletion remain keyed by unchanged `stripe_customer_id`. No Stripe network call occurred.

## Data-quality utility

The aggregate-only CLI ran against four matching synthetic fixture records. It correctly reported four subjects, three emails, one missing email, one Stripe customer, one premium user, four positive-credit users and zero duplicate groups. Automated forbidden-value checks found zero raw synthetic email, Clerk-subject or Stripe identifiers in output.

## Remaining blockers

- authorize and run the separate production read-only aggregate data-quality audit;
- implement and test fixed, cryptographically distinct legacy and production Clerk verifiers plus the dual-proof route;
- implement a privileged non-public recovery CLI with dry-run, explicit UUID/subject/reason, confirmation, collision check and audit;
- define the trusted authority that creates new-user enrollment decisions;
- perform isolated Clerk and Stripe test-mode end-to-end rehearsal;
- complete domain, OAuth, redirect/SEC-011, session and operational cutover gates;
- apply the migration to production only in a separately approved task.

SEC-005 remains **REMEDIATION IN PROGRESS**.
