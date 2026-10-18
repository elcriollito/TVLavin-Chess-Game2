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
3. Record the migration ledger and compare it with the four approved migration
   artifacts below. Never repair the ledger automatically.
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

## Approved migration artifacts and order

Apply through Supabase managed `apply_migration`, once each, in this order:

| Order | File | SHA-256 |
|---:|---|---|
| 1 | `20261018171912_caissa_identity_ownership_v1.sql` | `db2d75b54b5c64eb36488beae27e10e2ad2266bd5adf54f3841183757f4acda5` |
| 2 | `20261018194500_caissa_account_control_v1.sql` | `3d0dfdadc9f89fe12be40a086bc491d4971fca40901a4ee7544bb7965a940950` |
| 3 | `20261018180000_caissa_account_control_v1_fk_indexes.sql` | `9d7e4b69e691c57dc2a81408d74fd988055375c7d7424a4305133fc4f87d786c` |
| 4 | `20261018203000_caissa_account_control_v1_security_followup.sql` | `dccd0cebfd56a434337ea960c7ff426001b5e37eee589d8172f4d1a5dc4d402b` |

The file timestamps are source identifiers; the managed ledger version may
differ when an operator supplied an explicit migration name. Compare content,
name, hash, and effects. Do not execute unrelated pending migrations, seeds,
`db reset`, or `migration repair`.

For an ambiguous `apply_migration` response, stop and inspect the ledger and
catalog read-only. Never retry blindly and never run an automatic destructive
rollback. A successful commit is recovered using the certified backup and an
owner-approved forward or restore plan.

## Postflight

Require all of the following before code deployment:

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

## Deployment and smoke

Only after database postflight and separate merge/deploy authorization:

1. Merge the stack in the approved order, including the repair PR.
2. Certify both automatic Vercel deployments against their exact commits.
3. Keep Clerk Production restricted and public registration paused.
4. Enable ownership/account-control flags only in the explicitly approved
   Production environment. Never activate by changing a Preview.
5. Run non-destructive smoke checks: anonymous denial, authenticated owner
   summary, private export headers/first bounded page, UI keyboard/error states,
   and existing Home/Play/Puzzles/Analyzer routes.
6. Do not reset progress, delete an account, create a recovery binding, or test
   re-registration with a real user during release smoke.

Rollback for a code/config failure is the previous deployment plus disabling
the new runtime flags. Preserve additive database evidence; do not drop tables,
broaden grants, or restore insecure permissions. A database integrity failure
stops rollout and invokes the separately approved recovery procedure.

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
