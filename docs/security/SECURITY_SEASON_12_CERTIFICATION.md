# Security Season 12 Local Certification

Date: 2026-08-11
Candidate: `b6336c4d9e9d60c93af3849584ba04a53982a24d`
Production baseline: `0c3c1599ad47aae9477db863146bd3909020355d`
Decision: **LOCALLY CERTIFIED FOR A CONTROLLED CODE-FIRST, FAIL-CLOSED RELEASE**

This is local release-readiness evidence, not production verification or deployment authorization. No production database, Stripe live account, Clerk Production authority, Vercel setting or production secret was accessed or changed.

## Scope and findings

| Finding | Local state | Production state | Release condition |
| --- | --- | --- | --- |
| SEC-001 / SEC-002 | Remediated | Previously verified where recorded | Preserve fixed provider destinations |
| SEC-003 / SEC-004 | Remediated | Historical controls retained | Keep legacy proxy retired and public credit add denied |
| SEC-005 | Remediation in progress | No cutover | Keep migration mode off; defer identity schema operationally |
| SEC-006 | Remediated | Production-verified evidence retained | Preserve atomic credit consumption |
| SEC-007 / SEC-008 / SEC-009 | Remediated locally | Not verified for this release | Install Mentor capacity schema and secret before deploy |
| SEC-010 | Remediated locally | Not released | Code first, then apply Stripe RPC migration immediately |
| SEC-011 / SEC-012 / SEC-013 | Remediated locally | Not verified for this release | Validate redirects, headers and exact build after deploy |
| SEC-014 / SEC-015 / SEC-016 | Remediated locally | Not verified for this release | Browser key lifecycle, taint and exact-origin smoke required |

No active local High/Critical vulnerability was found in the current authoritative suites. Production verification remains required for every unreleased local control.

## Stripe controlled transition

The certified strategy is **CONTROLLED CODE-FIRST FAIL-CLOSED**. It intentionally accepts **BOUNDED FULFILLMENT DELAY** and targets **ZERO INTENTIONAL ECONOMIC DUPLICATION**.

The production baseline webhook cannot safely coexist with the final SEC-010 schema because it performs `SELECT -> economic effect -> INSERT` and treats ledger errors as non-blocking. Therefore the SEC-010 migration must never be applied while that old webhook is serving.

The new handler calls only `fulfill_stripe_webhook_event`. With the RPC absent, a valid synthetic signed event returned HTTP 500 because PostgreSQL reported the function unavailable. Ten concurrent deliveries produced ten non-2xx responses, zero credit change, zero premium change and zero Stripe ledger rows. After applying SEC-010 to the same rehearsal database, retrying the event produced exactly one 25-credit grant. Ten concurrent post-success retries and a distinct event ID for the same Checkout Session produced zero additional value.

Response contract:

| Condition | Result |
| --- | --- |
| Missing RPC / database unavailable | Retryable non-2xx; zero effect |
| Invalid signature | 400 before database access |
| Unique valid economic event | 2xx after atomic commit |
| Completed event/business duplicate | 2xx no-op |
| Unsupported/non-economic signed event | Safe project-defined 2xx ignore/reject |

Stripe retries are recovery, not the primary safety control. After migration, operators must inspect failed/pending deliveries, allow automatic retries, manually retry only through separately authorized Stripe tooling when necessary, and reconcile aggregate outcomes.

## Migration classification and order

| Migration | Classification | Reason |
| --- | --- | --- |
| `20260811_distributed_mentor_capacity.sql` | PRE-DEPLOY | Additive; old code ignores it; new Mentor requires its RPCs |
| `20260811_atomic_stripe_webhook_fulfillment.sql` | POST-CODE IMMEDIATE | New code fails closed until RPC exists; old webhook plus final privileges is prohibited |
| `20260811_clerk_identity_remapping_foundation.sql` | DEFER SEC-005 | Safe when dormant but unnecessary for the general release |
| `20260811_clerk_migration_cutover_tooling.sql` | DEFER SEC-005 | Depends on foundation and is unnecessary without authorized cutover |

The identity migrations were proven additive and default-off and may be pre-provisioned in a separately approved plan. This release chooses to defer them to minimize production change. Their presence must never imply activation.

The SEC-010 unique index on non-null `users.stripe_customer_id` is transactional and has no delete, merge or winner-selection behavior. Before applying it, an authorized read-only aggregate check must report non-null row count, duplicate-group count and maximum duplicate-group size without identifiers. Required result: duplicate groups `0`. Any conflict stops the migration before source deployment begins.

## Environment prerequisites

| Variable/control | Action | Missing or malformed behavior |
| --- | --- | --- |
| `MENTOR_RATE_LIMIT_SECRET` | GENERATE AND SET BEFORE DEPLOY; at least 32 secret characters | Mentor fails closed/unavailable |
| `MENTOR_AI_ENABLED` | SET `false` for initial release; enable only after DB/security smoke | Missing means enabled; explicit false is safer during rollout |
| `MENTOR_SHARED_AI_ENABLED` | SET `false` initially; enable after capacity and provider smoke | Shared mode unavailable when false |
| `CAISSA_BROWSER_ORIGINS` | SET/CONFIRM exact approved origins | Unlisted browser origins denied |
| `CAISSA_APP_ORIGIN` | SET/CONFIRM exact canonical HTTPS origin | Checkout rejects malformed configuration |
| Existing Supabase service configuration | CONFIRM before deploy | APIs fail closed or become unavailable |
| Existing Stripe server/webhook secrets | CONFIRM paired and present; never rotate in this release | Webhook returns non-2xx/not configured |
| Existing Clerk server/publishable configuration | CONFIRM current production-style authority | Authentication unavailable if invalid |
| `CAISSA_IDENTITY_MIGRATION_MODE` | LEAVE UNSET/DISABLED; never set `enforced` | Exact non-`enforced` state keeps feature dormant |
| SEC-005 legacy/production verifier variables | DEFER UNTIL SEC-005 CUTOVER | Challenge/activate remain 404 while mode is off |
| `CAISSA_IDENTITY_MIGRATION_THROTTLE_PEPPER` | DEFER UNTIL SEC-005 CUTOVER | Irrelevant while remote feature is dormant |

No secure checkout-specific kill switch was identified in the current runtime. Operators may pause promotion of new checkout operationally if available, but must not invent an unreviewed control. Renewals can arrive independently, so the immediate SEC-010 step remains mandatory.

## Compatibility and rollback boundary

- Old source plus Mentor capacity schema: compatible; old code ignores additive objects.
- New source plus old Stripe schema: secure fail-closed state with bounded fulfillment delay.
- New source plus SEC-010 schema: normal atomic operation.
- Old source plus SEC-010 schema: prohibited; direct ledger access is revoked and the old error path is non-blocking.

**ROLLBACK BOUNDARY:** successful application of `20260811_atomic_stripe_webhook_fulfillment.sql`.

Before that boundary, the prior source baseline may be restored if no incompatible DB change has occurred. After that boundary, `0c3c1599ad47aae9477db863146bd3909020355d` must not be redeployed. Keep the new webhook or deploy a separately reviewed RPC-compatible forward fix. Normally leave the additive SEC-010 schema and ledger in place; destructive rollback of fulfillment history is prohibited.

If SEC-010 application fails after new code is live, keep the new fail-closed code serving, investigate the transactional migration failure, allow Stripe to retain/retry deliveries, and pause new checkout operationally if an authorized mechanism exists. Do not restore the vulnerable old webhook merely to recover availability.

## Test evidence

| Suite | Result |
| --- | --- |
| Current Node/security suite | 398/398 pass |
| Integrated PostgreSQL rehearsal | 53/53 pass |
| SEC-005 PostgreSQL | 28/28 pass |
| SEC-010 PostgreSQL | 15/15 pass |
| Mentor PostgreSQL | 10/10 pass |
| Stripe code-first transition | 10/10 pre-RPC failures with zero effect; one recovered fulfillment; 10 duplicate retries no-op |
| Current Chromium browser cases | 66/66 pass |
| Current WebKit browser cases | 66/66 pass |
| Supply-chain policy / npm audit | Pass / 0 vulnerabilities |
| Public-release audit | Pass; 891 committed files and 18 required paths |
| CycloneDX SBOM | 1.5; 112 components; canonical output reproducible |

Superseded Play characterization tests that expect an old URL handoff, internal-beta routes or pre-Coach classifications are reported separately and are not current security owners. Current public-beta, Worker, auth, FICS isolation, compatibility, inline Analyze and XSS/BYO suites pass.

## SEC-005 residual status

All remotely reachable identity-migration routes require the exact server-only value `CAISSA_IDENTITY_MIGRATION_MODE=enforced`. Missing, false-like, differently cased, spaced and client-supplied values do not enable migration. Disabled challenge/activate requests open no database connection and mutate no throttle, binding or identity audit state. Existing users continue through legacy sync while mode is off.

SEC-005 remains **REMEDIATION IN PROGRESS**. Clerk Production cutover, real dual-authority verification, production data classification, recovery authorization and isolated Clerk/Stripe end-to-end testing remain separate gates.

## Certification conclusion

The ten-commit source candidate is locally coherent and may enter the controlled release runbook only after all read-only production checks and environment prerequisites pass. Pushing `main` is expected to trigger Vercel production auto-deployment, so no push may occur until the database operator is ready to execute SEC-010 immediately after the new source is verified as serving.
