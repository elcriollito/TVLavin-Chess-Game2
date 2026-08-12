# Security Season 12 Controlled Release Runbook

> Execution record (2026-08-12): EXECUTED AND PRODUCTION VERIFIED; SEC-005 DEFERRED. Runtime source `af77bc0ddaeaee780712af1eb87352470c98daf5`; deployment `dpl_CfspDMwDjLSCzQyQda49LMSRkSed`; bootstrap `2026-08-11.1`, SEC-009 and SEC-010 installed. The rollback boundary is crossed. Mentor remains intentionally disabled. See `SECURITY_SEASON_12_PRODUCTION_CLOSEOUT.md`.

Status: **NOT EXECUTED — REQUIRES SEPARATE PRODUCTION AUTHORIZATION**
Candidate: `b6336c4d9e9d60c93af3849584ba04a53982a24d`
Strategy: **STRIPE CUTOVER IS CODE-FIRST / FAIL-CLOSED**

The release accepts a **BOUNDED FULFILLMENT DELAY** to maintain **ZERO INTENTIONAL ECONOMIC DUPLICATION**. SEC-005 remains dormant throughout.

## Phase 0 — Preconditions

1. Obtain named release, database, Vercel and Stripe operational authorization.
2. Confirm candidate commit, clean source, exact 10-commit chain and rollback deployment identity.
3. Confirm backups/PITR, monitoring owners, incident channel and maintenance observation window.
4. Confirm a database operator is ready for the immediate post-code SEC-010 step.
5. Do not push while any prerequisite is incomplete; repository history records that pushing `main` triggers Vercel production auto-deployment.

## Phase 1 — Read-only production checks

Run only after separate authorization and report aggregates without identifiers:

1. Confirm expected base tables/functions and migration history.
2. Report non-null `users.stripe_customer_id` rows, duplicate groups and maximum duplicate group size. Require duplicate groups `0`.
3. Confirm `stripe_events.event_id` uniqueness and current row count.
4. Confirm the Mentor and Stripe migration names are not already partially applied.
5. Confirm current user/account counts and required legacy RPC signatures.

Stop on duplicates, schema drift, partial migration state or unexpected privileges. Do not delete, merge or select a winner.

## Phase 2 — Environment preparation

1. Generate and set `MENTOR_RATE_LIMIT_SECRET` without logging it.
2. Set `MENTOR_AI_ENABLED=false` and `MENTOR_SHARED_AI_ENABLED=false` for initial deployment.
3. Confirm exact `CAISSA_BROWSER_ORIGINS` and canonical HTTPS `CAISSA_APP_ORIGIN`.
4. Confirm existing Supabase, Clerk and Stripe server variables are paired and scoped to Production.
5. Leave `CAISSA_IDENTITY_MIGRATION_MODE` absent or non-`enforced`.
6. Do not install live SEC-005 verifier configuration or activate Clerk Production.

Environment changes that require deployment must be staged before the source release. Never print values into logs or tickets.

## Phase 3 — Pre-deploy database migration

Apply only:

1. `20260811_distributed_mentor_capacity.sql`

Verify transaction success, RLS, fixed-search-path functions, service-role RPC execution and browser-role denial. Old production code ignores these additive objects.

Defer both SEC-005 migrations. Do **not** apply `20260811_atomic_stripe_webhook_fulfillment.sql` yet.

## Phase 4 — Deploy exact new source

1. Prefer an established Vercel workflow that builds the exact commit and reaches `READY` before production alias promotion, if separately authorized and supported by the project.
2. Otherwise, recognize that pushing `main` triggers production deployment; push only with the database operator standing by.
3. Verify the production deployment serves the exact candidate commit and the new webhook artifact.
4. During this short interval, webhook deliveries may receive retryable non-2xx responses because the atomic RPC is absent. This is the intended fail-closed state: zero economic work.
5. Never apply SEC-010 while the old webhook still serves production.

## Phase 5 — Immediate Stripe migration

Immediately after confirming the new source is serving, apply transactionally:

1. `20260811_atomic_stripe_webhook_fulfillment.sql`

Verify the unique indexes, RLS, `fulfill_stripe_webhook_event` signature, fixed `search_path`, grants and service-role execution. The migration must abort on unexpected `stripe_customer_id` duplicates; do not modify data to force success.

**ROLLBACK BOUNDARY:** once this migration commits, the old baseline `0c3c1599ad47aae9477db863146bd3909020355d` is no longer a safe source rollback target.

## Phase 6 — Stripe recovery and verification

1. Confirm a unique synthetic-safe or authorized real delivery through the new RPC path without fabricating a live webhook.
2. Inspect Stripe delivery status using authorized operational tooling.
3. Identify pending/failed deliveries whose timestamps overlap the cutover interval.
4. Allow automatic retries first.
5. Manually retry only when necessary and explicitly authorized.
6. Reconcile aggregate counts: unique business operations, completed ledger rows and resulting entitlement events.
7. Verify retries return completed/no-op and never add a second economic effect.

Do not disclose payloads, customers, identities, signatures or secrets in evidence.

## Phase 7 — Functional and security smoke

- Auth: normal sign-in and invalid-token rejection.
- User sync: legacy/current users work while SEC-005 mode is off.
- Mentor: disabled response initially; after approval, enable and verify limiter before provider use.
- Credits: `/api/credits/add` remains unavailable to clients; consumption remains atomic.
- Stripe: webhook configuration health and RPC-path evidence only; no fake live signature.
- CORS: malicious Origin denied; approved Origin exact.
- CSP/XSS: required headers present and inert marker remains unexecuted.
- Play: board and same-origin Worker health.
- Library/wallet/checkout: authenticated ownership and normal read paths.
- SEC-005: challenge and activation return dormant generic responses while mode is off.

## Phase 8 — Rollback decision and observation

Before the SEC-010 migration commits, source may return to the previous verified deployment if needed. After it commits:

- do not restore `0c3c1599…`;
- keep the new fail-closed webhook or deploy a reviewed RPC-compatible forward fix;
- normally leave additive tables, indexes, ledger history and RPC in place;
- do not drop or truncate fulfillment history;
- retain Mentor kill switches while investigating a Mentor failure;
- monitor authentication, sync, CORS/CSP, webhook 5xx/duplicate outcomes, credits, premium state and Worker errors.

If SEC-010 migration fails after source deployment, keep new code live, preserve retryable failures, investigate the transactional failure and pause new checkout only through an existing authorized operational mechanism. Availability recovery must not reintroduce the old fail-open webhook.

## Phase 9 — SEC-005 remains dormant

1. Confirm `CAISSA_IDENTITY_MIGRATION_MODE` is not exactly `enforced`.
2. Confirm challenge/activate return generic dormant responses.
3. Do not apply identity migrations in this general release unless a separately approved dormant-foundation decision explicitly changes Phase 3.
4. Do not activate Clerk Production, migration authorities, recovery operations or enrollment decisions.
5. Record SEC-005 as **REMEDIATION IN PROGRESS** after release.

## Stop conditions

Stop or hold the current safe state for any migration failure, unexpected duplicate group, wrong deployment SHA, auth outage, Stripe mutation mismatch, CORS/CSP regression, executable taint, Worker failure or SEC-005 activation. Prefer forward repair from the new fail-closed source after the rollback boundary.
