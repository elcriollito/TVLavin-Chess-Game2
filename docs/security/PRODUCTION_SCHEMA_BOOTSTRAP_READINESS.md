# Production Schema Bootstrap Readiness Audit

Date: 2026-08-11

Audit target: `main` at `2923a72259f26465bc8afc1ee4e711421fda8b4c`

Production code baseline: `0c3c1599ad47aae9477db863146bd3909020355d`
Scope: design and read-only audit only; no production SQL, deployment, environment change, Stripe operation, Clerk cutover, or user migration.

## Executive verdict

**STOP — PRODUCTION SCHEMA BOOTSTRAP IS NOT SAFE YET.**

The repository has recognizable foundational and additive schema sources, but they are not a production-safe bootstrap contract:

1. `supabase-schema.sql` creates `users`, `credit_events`, `consume_credits`, and `add_credits` without RLS, explicit table revocations, function privilege revocations, schema-qualified object references, or a fixed function `search_path`.
2. PostgreSQL grants function execution to `PUBLIC` by default. The base file does not revoke it. The functions are invoker-security functions, but that is not a substitute for a deliberate privilege model, particularly in Supabase where API roles and default privileges must be audited explicitly.
3. `supabase-schema-v2.sql` creates Stripe and library tables without RLS or explicit grants/revocations.
4. Installing V1+V2 while the old webhook is live would make its race-prone, non-atomic fulfillment path operational. The old webhook treats idempotency lookup and ledger insertion failures as non-blocking, and fulfillment is separate from event recording.
5. The base functions accept invalid economic inputs: `add_credits` does not require a positive amount and `consume_credits` does not require a positive cost or bounded action. The latter can add credits if invoked with a negative cost.

These are release blockers under the task's stop conditions. No candidate SQL was applied even to rehearsal after discovering the unsafe source; production was not used as a rehearsal environment.

## Authoritative production facts

The task supplies the following already-established read-only evidence:

| Fact | Value |
|---|---|
| Supabase project | `CAISSA-PRODUCTION-DO-NOT-DELETE` |
| Project ref | `jczauvfkwueuvdpurpem` |
| `public` table count | `0` |
| `public` function count | `0` |
| `auth.users` count | `0` |

No keys, connection strings, customer identifiers, subjects, or other secrets/PII are recorded here. Static repository search found no application code that selects an alternative application schema: CAISSA data access targets unqualified/public objects. The evidence therefore indicates no installed CAISSA application-owned database state. Supabase-managed `auth`, `realtime`, `storage`, and `vault` infrastructure is not an alternative CAISSA schema.

## SQL source inventory and chronology

| Source | Introduced | Classification | Dependencies / purpose |
|---|---:|---|---|
| `supabase-schema.sql` | 2026-01-27 | BASE SCHEMA, unsafe as production bootstrap | Creates account and credit foundation |
| `supabase-schema-v2.sql` | 2026-01-27 | ADDITIVE MIGRATION, unsafe as production bootstrap | Explicitly says run after V1; Stripe ledger and cloud library |
| `20260808_play_v2_invite_only.sql` | 2026-08-08 | ADDITIVE MIGRATION | Independent Play beta tables/RPCs; seeds one disabled configuration row |
| `20260809_play_v2_feedback_sensitive_rejection.sql` | 2026-08-08 | ADDITIVE UPGRADE | Requires Play beta migration; replaces feedback RPC and adds helper |
| `20260810_play_v2_feedback_helper_stable.sql` | 2026-08-08 | ADDITIVE UPGRADE | Requires the feedback helper; changes volatility to `STABLE` |
| `20260811_clerk_identity_remapping_foundation.sql` | 2026-08-11 | ADDITIVE MIGRATION, DEFERRED SEC-005 | Requires `public.users`; identity binding/challenge/enrollment/audit |
| `20260811_clerk_migration_cutover_tooling.sql` | 2026-08-11 | ADDITIVE MIGRATION, DEFERRED SEC-005 | Requires SEC-005 foundation; throttle/manual recovery/immutable audit |
| `20260811_atomic_stripe_webhook_fulfillment.sql` | 2026-08-11 | ADDITIVE/REPLACEMENT SEC-010 | Requires V1+V2 account, credit, and Stripe objects; code-first only |
| `20260811_distributed_mentor_capacity.sql` | 2026-08-11 | ADDITIVE SEC-009 | Independent distributed limiter tables/RPCs |

PostgreSQL test programs under `tests/*postgres*.cjs` contain TEST-ONLY fixture/setup SQL and assertions. They are not authoritative production DDL. No other committed `.sql` files exist.

## Object inventory

### V1 base

- Tables: `users`, `credit_events`.
- Indexes: `idx_users_clerk_id`, `idx_users_stripe_customer`, `idx_credit_events_user_id`, `idx_credit_events_created_at`.
- RPCs: `consume_credits(text, integer, text)`, `add_credits(text, integer, text)`.
- User model: UUID `id`; unique, non-null `clerk_id`; nullable email and Stripe customer; default member role, non-premium state, and five credits.
- Foreign key: `credit_events.user_id -> users.id ON DELETE CASCADE`.
- Extensions: none declared. It assumes `gen_random_uuid()` is available.
- Triggers: none.
- RLS/policies/grants/revocations: none.
- Inserts/seeds: none.

### V2

- Tables: `stripe_events`, `library_positions`, `library_collections`, `library_sync_log`.
- Indexes: Stripe event type and user/library lookup indexes; per-user/local-ID uniqueness for positions and collections.
- Foreign keys: all library ownership points to `users.id ON DELETE CASCADE`.
- Functions/triggers/extensions: none.
- RLS/policies/grants/revocations: none.
- Inserts/seeds: none.

### Historical Play beta chain

- Tables: `beta_program`, `beta_invites`, `beta_sessions`, `beta_feedback`.
- RPCs: public-state read, invite redemption/session/feedback, and privileged admin operations.
- Security: `pgcrypto`; RLS enabled; direct `anon`/`authenticated` access revoked; fixed-search-path SECURITY DEFINER RPCs; service-role-only execution.
- Seed: exactly one non-economic `beta_program` singleton with `enabled=false`, `stage='disabled'`. It creates no user, Clerk, Stripe, credit, invite, session, or feedback row.

### SEC-009

- Tables: `mentor_rate_windows`, `mentor_concurrency_leases`.
- RPCs: `claim_mentor_capacity`, `release_mentor_capacity`, `cleanup_mentor_capacity`.
- Security: RLS enabled; direct access revoked from public/browser/service roles; fixed-search-path SECURITY DEFINER; service-role RPC execution only.

### SEC-010

- Extends `stripe_events` with operation/business/user/status/error/claim/completion fields.
- Adds event and business-operation uniqueness plus status/claim indexes.
- Adds unique non-null `users.stripe_customer_id` index.
- Adds `fulfill_stripe_webhook_event` as the sole atomic economic fulfillment RPC.
- Enables Stripe ledger RLS, revokes direct access (including service role), and grants only service-role RPC execution.

### SEC-005 (deferred)

- Foundation: `identity_bindings`, `identity_migration_challenges`, `identity_enrollment_decisions`, `identity_migration_audit` and five RPCs.
- Tooling: `identity_migration_throttles`, `identity_manual_recovery_previews`, audit mutation-denial trigger, throttle/preview/execute/confirmed-rollback RPCs.
- V1/V2 do not contain these objects. They must remain unapplied and `CAISSA_IDENTITY_MIGRATION_MODE` must remain absent/non-`enforced`.

## V1/V2 relationship

| Question | Answer |
|---|---|
| Is V1 the repository's foundational schema? | **YES, historically**, but **NO as a production-safe authoritative bootstrap** until corrected |
| Is V1 required for V2? | **YES** |
| Can V2 run alone on empty `public`? | **NO**; library foreign keys reference missing `users` |
| Can V1 then V2 parse on an empty schema? | Structurally **YES**, assuming `gen_random_uuid()` exists |
| Would V1+V2 duplicate each other? | **NO object-name duplication**; V2 is additive |
| Are retries fully safe? | **NO**; `IF NOT EXISTS` does not reconcile incompatible partial definitions, and `CREATE OR REPLACE FUNCTION` silently replaces V1 function bodies while preserving surrounding privilege assumptions |

Neither file installs historical Play migrations or any Season 12 migration. There is no direct DDL overlap between V1/V2 and those migrations. SEC-010 intentionally upgrades the V2 Stripe ledger and therefore has semantic overlap, not accidental duplication.

## Dependency graph

```text
users
├─ credit_events
│  ├─ consume_credits
│  └─ add_credits
├─ stripe_customer_id
│  └─ SEC-010 fulfill_stripe_webhook_event
├─ library_positions
├─ library_collections
├─ library_sync_log
└─ SEC-005 identity foundation (deferred)

stripe_events
└─ SEC-010 event/business idempotency + atomic fulfillment

SEC-009 mentor tables
└─ claim/release/cleanup capacity RPCs

Play beta tables
└─ Play beta RPC chain (independent from users/credits/Stripe)
```

## API-to-database map

| Route | Required objects | Missing-object behavior | Old production | General release |
|---|---|---|---|---|
| `/api/mentor/chat` | `consume_credits`; new code also SEC-009 claim/release RPCs | Shared Mentor returns service error; BYO path differs by code generation and flags | Shared unavailable/fail-closed after DB error | Required only if Mentor enabled; switches are initially off |
| `/api/credits/add` | None | Always `403 CREDIT_GRANTS_DISABLED` | Functional fail-closed | Required and already safe |
| `/api/credits/consume` | `consume_credits` | `503`/service error | Unavailable | Requires corrected credit schema |
| `/api/checkout/session` | `users`; Stripe network after authenticated validation | User lookup/update failure prevents a trustworthy checkout flow, though old code does not consistently check every DB error | Unavailable/unsafe to assume | Requires corrected `users` plus controlled Stripe sequencing |
| `/api/stripe/webhook` | Old: `stripe_events`, `users`, `add_credits`; new: `fulfill_stripe_webhook_event` | Old code continues after idempotency lookup failure; individual handler DB failures may be logged without throwing. New code fails closed when RPC is absent | Largely unavailable with empty schema, but not a sound idempotency boundary | SEC-010 only after new code is serving |
| `/api/user/sync` | `users`; new enforced mode can use SEC-005 resolver/provision RPCs | Returns recoverable `503` when base table missing | Unavailable | Base required; SEC-005 remains off and legacy sync path remains active |
| `/api/wallet` | `users` | Service error | Unavailable | Base required |
| `/api/library/pull` | `users`, positions, collections | Service error | Unavailable | V2 required |
| `/api/library/push` | `users`, positions, collections, sync log | Service error/partial-operation risk depends on failing statement | Unavailable | V2 required |
| `/api/library/delete` | `users` plus selected library table | Service error | Unavailable | V2 required |
| SEC-005 challenge/activate | Deferred SEC-005 RPCs | New code returns dormant generic `404` before opening DB unless exact server mode is `enforced` | Routes absent | Not required; must stay dormant |
| Play beta routes/store | Play beta migration chain | RPC error/fail-closed service behavior | Backend state unavailable with empty schema | Separate historical schema prerequisite if product beta remains in scope |

All application database clients use the server-side service-role key. Static search found no application-owned non-public-schema fallback.

## Empty production behavior and activation risk

At `0c3c1599...` with no public application schema:

- User sync, wallet, credits, cloud library, and DB-backed checkout state are unavailable.
- Shared Mentor reaches DB-backed credit authorization and fails closed/unavailable; BYO behavior is independent of the credit debit in old code.
- `/api/credits/add` is deliberately disabled and stays safe regardless of schema.
- Stripe signature verification remains active if live Stripe variables exist, but economic DB operations cannot complete reliably without objects.
- The old webhook's missing-table behavior is not a certified fail-closed design: idempotency errors are explicitly non-blocking and some handler errors are logged rather than propagated.

Installing V1+V2 would materially change runtime behavior immediately:

- Authenticated user sync could create rows with five default credits.
- Wallet, consumption, library, and checkout DB paths could become operational.
- Most importantly, the old Stripe webhook would gain `stripe_events` and `add_credits`, activating a non-atomic check/fulfill/record sequence. Concurrent delivery or ledger insertion failure can duplicate economic fulfillment.

Therefore a complete bootstrap cannot precede deployment of the certified fail-closed webhook. This independently triggers stop condition 4.

## Security review

### Base RPC defects

- No fixed `search_path`; all table names are unqualified.
- No explicit function privilege revocation; `PUBLIC EXECUTE` remains the PostgreSQL default.
- No argument validation for positive/bounded `p_cost` or `p_amount`.
- Negative `p_cost` increases balance and writes a positive delta.
- Negative `p_amount` reduces balance outside the consumption policy.
- `p_action`/`p_reason` is not bounded.
- No explicit owner/role contract.

The functions are not `SECURITY DEFINER`, so there is no definer escalation by declaration; however, their unresolved search path and public execution surface still violate the project's server-only RPC standard.

### RLS and grants

RLS/grants verdict for V1+V2: **FAIL**.

All six tables are created without RLS or explicit role revocations. The files rely on ambient Supabase/database defaults. A production bootstrap must make browser-role denial explicit and verify default privileges; it cannot infer safety from a fresh project's present state.

SEC-009, SEC-010, SEC-005, and the Play beta chain use materially stronger explicit RLS/revoke/service-role RPC patterns, but they do not retroactively harden the V1/V2 account, credit, or library tables.

## Seed and data behavior

V1 and V2 contain no `INSERT`, so applying them alone should create:

- users: `0`
- credit events: `0`
- Stripe events: `0`
- library rows: `0`

The Play beta foundation inserts only its disabled singleton configuration. SEC-005 foundation contains a migration from existing users into bindings; with zero users it inserts zero bindings, but SEC-005 remains deferred regardless. No SQL creates a Clerk identity, Stripe customer, plan, admin user, fake payment, or economic event.

## Extensions

- V1/V2 call `gen_random_uuid()` but declare no extension.
- Play beta and SEC-005 foundation use `CREATE EXTENSION IF NOT EXISTS pgcrypto`.
- Modern PostgreSQL exposes `gen_random_uuid()` in `pg_catalog`, while Supabase also supports `pgcrypto`; the corrected bootstrap must state and verify its exact dependency rather than rely on ambient state.
- No committed application SQL requires `uuid-ossp`.

## Migration overlap matrix

| Migration | V1 overlap | V2 overlap | Retry/dependency note |
|---|---|---|---|
| Play beta foundation | None | None | Seeds disabled singleton; safe object guards but must not be confused with base |
| Play feedback rejection | None | None | Requires beta foundation and replaces one function |
| Play helper stable | None | None | Requires feedback helper |
| SEC-009 Mentor | None | None | Independent; secure privilege pattern |
| SEC-010 Stripe | `users`, `credit_events` dependency | Deliberately alters `stripe_events` | Must be code-first; unique index aborts on customer duplicates |
| SEC-005 foundation | `users` dependency | None | Deferred; initial binding insert reflects existing users |
| SEC-005 tooling | Indirect | None | Requires SEC-005 foundation; deferred |

## Compatibility matrix

This is a static, fail-closed audit result. Dynamic rehearsal was not run after the source failed the mandatory security gate.

| State | Old code | Certified new code | Key outcome |
|---|---|---|---|
| Empty public | Most DB features unavailable; old webhook lacks reliable fail-closed idempotency | SEC-005 dormant; Mentor disabled by planned switches; new webhook fails closed without RPC | No general release functionality |
| V1 only | Account/credit paths activate; V1 security defects exposed | Same defects; library absent; webhook still lacks V2 ledger | Not acceptable |
| V1+V2 | Old non-atomic Stripe fulfillment becomes operational | New webhook still fails closed until SEC-010; library available subject to unsafe base grants | Economically unsafe under old code |
| V1+V2+SEC-009 | Prior risks plus distributed Mentor objects | Mentor prerequisites exist, but unsafe V1/V2 remain | Not acceptable |
| Corrected base+V2+SEC-009, new code, then SEC-010 | Not assessed dynamically | Intended target architecture | Requires a new corrective task and isolated rehearsal |

## Rehearsal and required test disposition

The requested disposable PostgreSQL matrix was intentionally not executed. The base source failed before candidate selection due to unsafe privileges/RLS and economic activation risk. Running it would only show that PostgreSQL accepts unsafe DDL; it would not make the candidate releasable.

The following remain mandatory after correction: empty-schema confirmation; V1/V2 replacement bootstrap; zero seed/economic rows; RLS, grants, RPC privilege and search-path assertions; retry/partial-state behavior; old/new code compatibility; Stripe concurrency/idempotency; SEC-009 and SEC-010 order; and the complete security regression suite.

## Required corrected architecture

A separate corrective task must create a reviewed, authoritative, transactional bootstrap migration (or replace the legacy schema files) that:

1. Schema-qualifies every object and pins safe function `search_path`.
2. Enables RLS and explicitly revokes `anon`/`authenticated` direct access on all account, credit, Stripe, and library tables.
3. Revokes function execution from `PUBLIC`, `anon`, and `authenticated`; grants only the minimum service-role RPC execution.
4. Validates positive bounded credit inputs and action/reason lengths; preserves atomic row locking and audit writes.
5. Specifies extension dependencies and owner assumptions.
6. Is transactional, exactly-once, version-recorded, and fails safely on unexpected pre-existing objects instead of silently accepting incompatible shapes.
7. Creates no users or economic data and verifies counts immediately.
8. Separates Stripe prerequisites so old code never gains an operational race-prone fulfillment path.
9. Keeps all SEC-005 objects and mode deferred.
10. Includes isolated Supabase-equivalent tests for role grants/default privileges, not only generic PostgreSQL execution.

## Proposed release sequencing after correction

Current recommendation: **CERTIFICATION BLOCKED — BASE SCHEMA REQUIRES CORRECTION**.

The likely safe choreography to validate in the corrective task is:

1. Keep Mentor switches off and SEC-005 mode absent.
2. Deploy the certified new code first while the new Stripe webhook remains fail-closed because its RPC is absent.
3. Apply one corrected transactional base bootstrap, including hardened V1/V2 objects and required historical Play objects, but no SEC-005 objects.
4. Apply SEC-009 if it is not included as a separately recorded migration.
5. Apply SEC-010 immediately, validate exactly-once constraints/grants, and cross the documented rollback boundary.
6. Smoke-test without fake live payments; decide Mentor enablement separately.

This is only a design hypothesis, not a certified runbook amendment. It must be proven in the isolated database with both old/new code checkpoints and explicit fail-closed Stripe tests before production authorization resumes.

## Runbook impact and blockers

The existing release runbook must not be used unchanged because it assumes an installed base. Proposed future amendment: introduce a dedicated, gated schema-bootstrap phase and change the early migration/code order to the corrected code-first choreography if rehearsal validates it.

Open blockers:

- Production-safe authoritative base DDL does not exist.
- V1/V2 RLS, grants, RPC input contracts, search paths, and retry/version semantics require correction.
- Old-code Stripe activation makes pre-code full bootstrap unsafe.
- Historical Play schema inclusion/order must be made explicit.
- Corrected bootstrap has not passed isolated Supabase-role rehearsal.
- SEC-005 remains remediation-in-progress and explicitly outside this release.

No production write, environment change, push, deployment, live Stripe action, Clerk cutover, or user migration occurred during this audit.
