# Secure Production Schema Bootstrap

Date: 2026-08-11

Status: **CERTIFIED LOCALLY IN ISOLATED POSTGRESQL; NOT APPLIED TO PRODUCTION**

Authoritative artifact: `supabase/bootstrap/caissa-production-bootstrap.sql`

Bootstrap family/version: `caissa-application` / `2026-08-11.1`

Release compatibility: `security-season-12`

## Purpose and authority

Production project `jczauvfkwueuvdpurpem` was read-only classified as Supabase infrastructure with zero public CAISSA tables, zero public functions, and zero Supabase Auth users. The historical `supabase-schema.sql` and `supabase-schema-v2.sql` explain the earlier data model but are not production authority: they omit explicit RLS/grants, retain default function execution, lack fixed search paths, accept invalid economic inputs, and would activate the old non-atomic Stripe path if installed before the certified code.

The new bootstrap is deliberately outside `supabase/migrations`. An operator must invoke it explicitly and only after the exact certified security code is confirmed serving. It does not rewrite either historical schema.

## Transaction and preflight

The entire bootstrap executes within one explicit transaction. Before creating an object it verifies:

- Supabase roles `postgres`, `service_role`, `anon`, and `authenticated` exist;
- `pg_catalog.gen_random_uuid()` exists (no extension is otherwise required);
- none of the seven CAISSA foundation tables or two credit RPC signatures exists;
- no schema version ledger exists in an unknown state.
- the operator is the intentional Supabase `postgres` owner.

Unexpected objects raise `CAISSA_BOOTSTRAP_PARTIAL_OR_UNKNOWN` and roll back. A second execution after a complete install raises `CAISSA_BOOTSTRAP_ALREADY_APPLIED:2026-08-11.1` and changes nothing. The bootstrap never uses blanket `CREATE TABLE IF NOT EXISTS` to accept drift.

## Object inventory

Tables:

- `caissa_schema_meta` — one non-secret schema marker;
- `users` — immutable UUID account anchor, Clerk subject, optional email and Stripe customer, role, premium and credit state;
- `credit_events` — atomic credit audit rows;
- `stripe_events` — minimal SEC-010-compatible event foundation;
- `library_positions`;
- `library_collections`;
- `library_sync_log`.

RPCs:

- `consume_credits(text, integer, text)`;
- `add_credits(text, integer, text)`.

Indexes preserve current lookup and library uniqueness contracts. There are no triggers, Supabase Auth links, browser policies, user seeds, Stripe seeds, credit seeds, library seeds, or SEC-005 objects.

## RLS and privileges

RLS is enabled explicitly on every application table. There are no browser policies. Every table first revokes all privileges from `PUBLIC`, `anon`, `authenticated`, and `service_role`; the bootstrap then grants only current server API needs:

The bootstrap also revokes `CREATE` on `public` from browser/service roles and grants only schema `USAGE` required to reach explicitly authorized objects.

| Object | `service_role` authority |
|---|---|
| schema metadata | `SELECT` |
| users | `SELECT`, `INSERT`, `UPDATE` |
| credit events | `SELECT` (writes occur through definer RPCs/SEC-010) |
| Stripe events foundation | none before SEC-010 |
| library positions/collections | `SELECT`, `INSERT`, `UPDATE`, `DELETE` |
| library sync log | `SELECT`, `INSERT` |

Both RPCs are owned by `postgres`, are `SECURITY DEFINER`, use `search_path=pg_catalog`, qualify application objects with `public`, contain no dynamic SQL, revoke execution from `PUBLIC`/browser roles, and grant execution only to `service_role`.

## Economic invariants

- `users.credits` and event balances are constrained to `0..2147483647`.
- `consume_credits` accepts only the actual current feature costs `1..2` and the current fixed action allowlist.
- `add_credits` accepts only positive amounts through `200`, matching the largest current package; renewal `50` and packages `25/75/200` fit this contract.
- Zero, negative, null, out-of-contract, and overflow inputs fail before mutation.
- Both RPCs lock the authoritative user row. Consumption never trusts client premium state; premium behavior is decided from the locked database row.
- Balance mutation and `credit_events` insertion share one transaction.
- Public `/api/credits/add` remains disabled; positive validation is not treated as caller authorization.

## Schema and data state

The only bootstrap insert is the schema marker. Immediately after a clean install, all application/economic content counts are zero:

- users `0`;
- credit events `0`;
- Stripe events `0`;
- library positions, collections, and sync logs `0`.

Newly synchronized legitimate users retain the current product default of five credits; bootstrap itself creates no user.

## Isolated PostgreSQL evidence

The authorized disposable PostgreSQL 17 rehearsal was reset to an empty `public` schema. No connection value was printed.

| Test group | Result |
|---|---:|
| Bootstrap/catalog/privilege/economic/integration | 13/13 PASS |
| SEC-009 distributed Mentor | 10/10 PASS |
| SEC-010 atomic Stripe | 15/15 PASS |

Observed clean-bootstrap durations were approximately 58–78 ms. Catalog checks proved seven RLS-enabled foundation tables, zero policies, two fixed-path definer RPCs owned by `postgres`, browser-role denial for direct CRUD/RPC, and service-role success for user/wallet/library/credit operations.

Economic evidence included negative/zero/null/bound rejection, overflow rollback, and two concurrent one-credit consumes from balance one: exactly one success and final balance zero. A second bootstrap failed cleanly without drift. A representative pre-existing `users` table caused the transaction to abort while leaving that sole object unchanged.

After bootstrap, SEC-009 installed cleanly and 10 concurrent requests at limit three produced exactly three allows and seven denials. Before SEC-010, the fulfillment RPC was absent and a synthetic call produced zero credit/ledger effect. SEC-010 then installed cleanly; unique, sequential duplicate, two-way and 10-way duplicate, business-key duplicate, independent event, post-commit retry, renewal, activation, deletion, forged input, cross-user, rollback, RLS, and privilege cases all passed exactly-once requirements.

SEC-005 tables and functions were confirmed absent.

## New-code compatibility and bounded transition

| Database state | Certified new-code behavior |
|---|---|
| Empty public | Stripe fails closed because SEC-010 RPC is absent; Mentor must remain disabled; SEC-005 is dormant; account/wallet/library endpoints are temporarily unavailable |
| Bootstrap | User sync, wallet, library, and hardened credit RPC foundation available; Stripe still fails closed |
| Bootstrap + SEC-009 | Distributed Mentor capacity is available, but Mentor switches remain off until deliberate enablement |
| Bootstrap + SEC-009 + SEC-010 | General-release database architecture complete; Stripe exactly-once enabled; SEC-005 absent |

The interval between new code and bootstrap must be kept short because authenticated account/library features remain unavailable against the empty schema. This is bounded availability, not an economic-integrity exception.

## Mandatory release-order invariant

1. Reconfirm production project/ref and empty CAISSA state read-only.
2. Configure prerequisites without exposing values.
3. Confirm Mentor switches disabled.
4. Confirm `CAISSA_IDENTITY_MIGRATION_MODE` absent/non-`enforced`.
5. Push/deploy the exact certified security HEAD.
6. Confirm that exact new code is serving and its webhook fails closed without SEC-010.
7. Deliberately apply `supabase/bootstrap/caissa-production-bootstrap.sql`.
8. Run aggregate bootstrap verification immediately.
9. Apply `20260811_distributed_mentor_capacity.sql` and verify capacity.
10. Apply `20260811_atomic_stripe_webhook_fulfillment.sql` immediately.
11. Verify Stripe privileges and exactly-once operational evidence without fake live payments.
12. Run safe production smoke checks; enable Mentor only by a separate deliberate decision.
13. Keep all SEC-005 migrations and cutover deferred.

**Never install the bootstrap while the old webhook is the active production authority. Old-code compatibility after bootstrap is explicitly unsupported.**

## Safe operator verification queries

These queries expose only aggregate/schema state and no PII:

```sql
select schema_family, bootstrap_version, release_compatibility, applied_at
from public.caissa_schema_meta;

select count(*)::integer as caissa_table_count
from pg_catalog.pg_tables
where schemaname = 'public'
  and tablename in (
    'caissa_schema_meta','users','credit_events','stripe_events',
    'library_positions','library_collections','library_sync_log'
  );

select tablename, rowsecurity
from pg_catalog.pg_tables
where schemaname = 'public'
  and tablename in (
    'caissa_schema_meta','users','credit_events','stripe_events',
    'library_positions','library_collections','library_sync_log'
  )
order by tablename;

select p.proname, p.prosecdef, p.proconfig, pg_catalog.pg_get_userbyid(p.proowner) as owner
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('consume_credits','add_credits')
order by p.proname;

select
  (select count(*) from public.users) as users,
  (select count(*) from public.credit_events) as credit_events,
  (select count(*) from public.stripe_events) as stripe_events,
  (select count(*) from public.library_positions) as library_positions,
  (select count(*) from public.library_collections) as library_collections,
  (select count(*) from public.library_sync_log) as library_sync_log;
```

Production remains unmodified. This document certifies the local artifact and isolated rehearsal, not production application.
