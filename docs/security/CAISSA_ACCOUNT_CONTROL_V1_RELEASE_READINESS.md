# CAISSA Account Control v1.0 — production release readiness

**Status:** release package prepared; Production execution blocked

**Prepared:** 2026-10-18

**Production project:** `jczauvkfkweuvdpurpem`

**Staging project:** `aqizagaskicotorfpwfn`

This runbook prepares Identity Organization and Account Control v1.0. It does
not authorize a merge, Production connection, database mutation, Vercel
configuration change, real account operation, or public-registration change.

## Immutable source chain

The intended stack is PR #79, then PR #82, then PR #83, followed by the
release-readiness repair PR. Before any merge, re-read every head SHA, tree,
review thread, required check, and diff. A mergeable label is not a security
approval. The repair must be included because it preserves approved-new
enrollment under ownership enforcement, contains ownership resolver failures,
and disambiguates the two Account status regions in the browser.

Stop if any reviewed SHA, migration hash, base branch, or environment differs.

## Production preflight

All checks are read-only until the database owner separately authorizes the
release:

1. Verify the Supabase reference exactly equals `jczauvkfkweuvdpurpem` and the
   connection is Direct PostgreSQL with TLS `verify-full`.
2. Confirm the Production database credential is accepted. Do not continue
   after `28P01`; do not retry or rotate it as part of this runbook.
3. Record the migration ledger and compare it with the seven approved migration
   artifacts below, including the three SEC-005 prerequisites. Never repair the
   ledger automatically.
4. Record aggregate users, identity bindings/reviews, account-control rows,
   active games, active entitlements, unresolved storage references, economic
   work, waiting locks, and foreign keys to `public.users`. Do not export PII.
5. Confirm all historical subjects have a documented ownership disposition.
   Email and nickname are not ownership proofs.
6. Verify Clerk Production is the configured authority, the issuer/key family
   agrees with `CAISSA_CLERK_AUTHORITY=production`, and registration remains
   restricted. Development keys are forbidden.
7. Verify the Vercel Production project, domain, environment, Deployment
   Protection policy, and all server-only variables. Do not copy Preview values.
8. Confirm no active destructive Account Control operation, recovery challenge,
   or migration ceremony exists.

Any mismatch, ambiguous result, waiting lock, active destructive operation, or
ownership conflict is a stop condition.

## Backup and recovery gate

Before the first Production migration:

1. Create a consistent encrypted backup through the approved remote runner.
2. Store the encrypted artifact and its recovery key under separate custody.
3. Record a cryptographic digest, project identity, creation time, retention,
   encryption recipient, object versioning/soft-delete state, and access policy.
4. Restore into an isolated temporary PostgreSQL destination.
5. Verify schema, ledger, aggregate protected-data counts, representative
   constraints/functions, and restore logs without exposing personal data.
6. Delete the temporary restore environment only after recovery evidence is
   complete. Preserve the encrypted backup for the documented retention.

An upload or checksum alone is not a recovery certificate. Production remains
blocked until restore verification passes.

## Pre-migration fail-closed code gate

The repaired sync code must be deployed before the first SEC-005 migration so
the legacy ordinary upsert cannot create an unapproved profile during the
migration window. This step requires separate merge, configuration, and
Production deployment authorization; this runbook does not grant it.

1. Configure the *next* Production deployment with
   `CAISSA_IDENTITY_MIGRATION_MODE=enforced`,
   `CAISSA_IDENTITY_OWNERSHIP_MODE=off`, and
   `CAISSA_ACCOUNT_CONTROL_MODE=off`. Verify the current deployment is
   unaffected; Vercel must not activate these values on existing traffic.
2. Only then merge and deploy the exact reviewed stack, including the
   release-readiness repair. The automatic Git deployment must inherit those
   exact values before it can receive traffic. Public registration remains
   paused and Clerk Production stays restricted.
3. Verify a controlled authenticated `/api/user/sync` cannot reach the ordinary
   upsert. Before SEC-005 exists, the expected result is a fail-closed 503 from
   the missing identity dependency, with no new `users` row or binding.
4. Verify Account Control endpoints remain unavailable, existing unrelated
   routes stay healthy, and the previous deployment is available for code
   rollback without changing the database.
5. Keep migration mode exactly `enforced` throughout all seven migrations and
   postflight. Stop if sync returns success by provisioning a new identity
   before the SEC-005 prerequisites are complete, or if any write occurs.

## Approved migration artifacts and order

Identity Ownership has foreign keys and `%rowtype` dependencies on
`public.identity_bindings`. The repaired `/api/user/sync` enrollment path also
requires `resolve_clerk_identity_for_sync` and
`provision_approved_clerk_identity`. Those objects are created by the SEC-005
foundation, tooling, and compatibility migrations. Their verified presence is
therefore a hard prerequisite, not an optional historical cutover.

Apply through Supabase managed `apply_migration`, once each, in this order:

| Order | Managed migration name | File | SHA-256 |
|---:|---|---|---|
| 1 | `sec005_clerk_identity_remapping_foundation_v1` | `20260811_clerk_identity_remapping_foundation.sql` | `8aa39c19e3d6a41d319cf9738a1b50a2b0d68365204912ab49287e10e6c9484b` |
| 2 | `sec005_clerk_migration_cutover_tooling_v1` | `20260811_clerk_migration_cutover_tooling.sql` | `2d53b7345b7dcee5fdb204ec568bb97475e2931ae75fa35a7a1d595f324ee6ee` |
| 3 | `sec005_cutover_compatibility_v1` | `20261015220000_sec005_cutover_compatibility_v1.sql` | `3644577e080fca71b70f7fa31e07ab0980d9f8884d861dd6eaa9a02f0fd689f2` |
| 4 | `caissa_identity_ownership_v1` | `20261018171912_caissa_identity_ownership_v1.sql` | `db2d75b54b5c64eb36488beae27e10e2ad2266bd5adf54f3841183757f4acda5` |
| 5 | `caissa_account_control_v1` | `20261018194500_caissa_account_control_v1.sql` | `3d0dfdadc9f89fe12be40a086bc491d4971fca40901a4ee7544bb7965a940950` |
| 6 | `caissa_account_control_v1_fk_indexes` | `20261018180000_caissa_account_control_v1_fk_indexes.sql` | `9d7e4b69e691c57dc2a81408d74fd988055375c7d7424a4305133fc4f87d786c` |
| 7 | `caissa_account_control_v1_security_followup` | `20261018203000_caissa_account_control_v1_security_followup.sql` | `dccd0cebfd56a434337ea960c7ff426001b5e37eee589d8172f4d1a5dc4d402b` |

If the ledger already contains any SEC-005 prerequisite, verify its managed
name, source hash, catalog effects, and dependency order read-only; do not
reapply it. If any prerequisite is absent, stop until the owner explicitly
authorizes that exact migration as part of the Production release. Never start
Identity Ownership against a schema without all three prerequisites.

The table hashes the committed SQL payload with LF line endings. Earlier
Windows evidence recorded raw CRLF hashes `f28731f...` and `e90b81e...` for the
first two files; normalized comparison proves those artifacts are textually
identical to the canonical LF payloads above. A future operator must normalize
line endings before hashing and must stop on any semantic difference.

The file timestamps are source identifiers; the managed ledger version may
differ when an operator supplied an explicit migration name. Compare content,
name, hash, and effects. Do not execute unrelated pending migrations, seeds,
`db reset`, or `migration repair`.

For an ambiguous `apply_migration` response, stop and inspect the ledger and
catalog read-only. Never retry blindly and never run an automatic destructive
rollback. A successful commit is recovered using the certified backup and an
owner-approved forward or restore plan.

## Postflight

Require all of the following before final ownership and Account Control
activation:

- the ledger contains exactly the expected new entries;
- aggregate protected-data counts are preserved, allowing only identified
  legitimate concurrent changes;
- ownership resolver and all Account Control RPCs are executable only by
  `service_role`;
- account-control tables have RLS enabled and forced; browser roles have no
  direct table access;
- every direct `users` foreign-key relation is covered by the same-transaction
  write barrier and the raw subject rate-limit table has its equivalent barrier;
- `SECURITY DEFINER` functions have fixed safe search paths and explicit grants;
- no waiting locks, active synthetic operations, orphaned operation states, or
  ownership conflicts remain;
- credits, entitlements, shared games, economic evidence, and historical
  tombstone/audit contracts are unchanged;
- the private export remains owner-scoped, bounded, paginated, and streamed.

## Final activation and smoke

Only after database postflight and separate configuration authorization:

1. Reconfirm the pre-migration deployment serves the exact reviewed commit and
   that migration mode remained `enforced` without interruption.
2. Keep Clerk Production restricted and public registration paused.
3. Enable `CAISSA_IDENTITY_OWNERSHIP_MODE=enforced` only after ownership
   reviews and resolver postflight pass. Verify a known bound identity and an
   unresolved identity before proceeding.
4. Enable Account Control only in the explicitly approved Production
   environment after all four Account Control migrations pass postflight.
   Never activate by changing a Preview.
5. Run non-destructive smoke checks: anonymous denial, authenticated owner
   summary, private export headers/first bounded page, UI keyboard/error states,
   and existing Home/Play/Puzzles/Analyzer routes.
6. Do not reset progress, delete an account, create a recovery binding, or test
   re-registration with a real user during release smoke.

## Rollback contract

Before the first migration, the rollback candidate must be proven to honor
`CAISSA_IDENTITY_MIGRATION_MODE=enforced` and fail closed when the SEC-005 RPCs
are absent. During and after any committed migration, keep migration mode
exactly `enforced` across every rollback deployment. Ownership and Account
Control may remain `off`, but identity migration enforcement must not be
disabled while the database contains any part of the new identity chain.

Never route traffic to an older artifact that ignores migration mode or reaches
the ordinary `users.upsert` path. If no compatible previous deployment exists,
use an owner-approved forward fix or the certified restore procedure; do not
weaken identity enforcement to recover availability. Preserve additive database
evidence, and do not drop tables, broaden grants, or restore insecure
permissions. A database integrity failure stops rollout and invokes the
separately approved recovery procedure.

## Clean Start and registration gate

PR #75 is not part of this release stack and must be reconciled with current
`main` before reconsideration. PR #76's registration-pause notice remains in
Production. PR #77 and Issue #78 remain the documentation/owner gate for a
future change from restricted to public registration.

Before reopening registration, certify a new account receives a new Clerk
subject and new CAISSA UUID, and does not inherit an old UUID, credits, rating,
binding, progress, or nickname by email/nickname coincidence. Remove the
temporary notice only in the same separately authorized release.

## Mandatory stop conditions

- PostgreSQL authentication is not certified.
- No restorable Production backup exists.
- Project, authority, issuer, SHA, tree, migration hash, or ledger is ambiguous.
- A required review/check is unresolved or failing.
- Any Production key appears in Preview, or a Development key in Production.
- An ownership conflict, active account operation, waiting lock, data-count
  discrepancy, unprotected user relation, or unexpected economic mutation is
  observed.

Current stop reason: Production PostgreSQL rejects the certified memory-only
Direct authentication path with `SQLSTATE 28P01`; backup/restore and every
Production database phase therefore remain prohibited.
