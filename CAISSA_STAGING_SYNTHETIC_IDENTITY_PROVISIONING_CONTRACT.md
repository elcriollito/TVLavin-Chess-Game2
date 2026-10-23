# CAISSA Staging Synthetic Identity Provisioning Contract

Result: `IDENTITY_RESOLUTION — STAGING_FIXTURE_PROVISIONING_CONTRACT_READY`

Implementation commits: `b440a6ce9049eec52070e3c33420812a6078feb6`, `efcf9b2dd0fc51da402a658275c837e998a14e70`, `7dbd889b16197e9e8b522c82fd2a1e8abee21046`

## Purpose and boundary

This contract permits exactly two newly created, explicitly authorized Clerk Development fixtures to receive their own new CAISSA identities for one approved Staging certification run. It does not alter ordinary signup, `/api/user/sync`, the 409 ownership response, Production ownership policy, or any historical account.

The contract is intentionally outside `supabase/migrations` and has no public HTTP route. Only the PostgreSQL owner can invoke it. `public`, `anon`, `authenticated`, and `service_role` receive no schema, table, or function access.

## Exact environment guard

- Supabase project reference: `aqizagaskicotorfpwfn`.
- PostgreSQL database: `postgres`.
- Intrinsic cluster `system_identifier`: `7678069749886157684`.
- Authority: `legacy_development` only.
- Provisioning artifact SHA-256: `4f2ea1cea3066c8097a8407b2cb5b2b8edbab3edbbcfb0ab87ac517fc5397353`.
- Teardown artifact SHA-256: `15be03dad01b209c82fa3af5528435c9aad897c78babc5fd4a9f5ad3446eff15`.

Every lifecycle operation checks the cluster and installation guard, then takes advisory transaction lock `767806974988615768`. Teardown takes the same lock before examining residue or dropping anything. A mismatch raises `CAISSA_STAGING_PROJECT_MISMATCH` before effects.

## Authorization manifest

An external private run ledger must approve the exact ordered A/B tuple before hosted use:

- Run ID.
- Fixture slot `A` or `B`.
- Exact Clerk Development subject.
- New exact CAISSA UUID.
- SHA-256 authorization reference.
- Operator reason and expiry, no more than 24 hours.
- External cleanup receipt after each Clerk identity is removed.

The database recomputes the run ID from both ordered subjects, both UUIDs, and both authorization hashes. This immutable two-slot manifest prevents a finalized run from being reused with a third identity while allowing the transient database ledger to be removed at the end.

Raw OTPs, passwords, JWTs, session cookies, or Clerk secret keys must never enter either ledger. Email may be stored as optional profile data, but is never evidence of ownership.

## Lifecycle

1. `authorize_synthetic_identity` validates the exact A/B manifest, slot, expiry, subject format, UUID, hash, collisions, and absence of historical/bound identity state. Exact replay is idempotent; conflicts fail closed.
2. `provision_synthetic_identity` creates one default `public.users` row, one active Clerk binding under `legacy_development` with `NEW_ACCOUNT`, and one explicit `VERIFIED`/`NEW_ACCOUNT` ownership review. Partial or conflicting state requires review.
3. The hosted test may operate only as that exact bound owner. No client-selected UUID is accepted.
4. `cleanup_synthetic_identity` requires the exact run, subject, UUID, hash, and confirmation text. It refuses economic state, unexpected ownership, other bindings, historical-age mismatch, and protected foreign-key dependencies. Exact clean replay is idempotent before finalization.
5. `finalize_synthetic_identity_cleanup` requires zero canonical residue plus a valid external cleanup receipt hash, then removes the transient authorization row.
6. The guarded teardown requires an empty authorization table, no `staging_synthetic` binding residue, and an exact inventory of two relations and six functions. It uses explicit drops without `CASCADE`, all inside one transaction, then removes the private schema.

The external private run ledger is retained as the audit record; the temporary database authorization ledger and private schema are deliberately removed so Staging returns to its exact pre-run schema baseline.

## Identity decision matrix

| Condition | Result |
|---|---|
| New Clerk Development user without an approved fixture binding | 409 `IDENTITY_RESOLUTION_REQUIRED` |
| Exact authorized, newly provisioned, active, verified fixture | Allowed as its own new UUID |
| Missing, revoked, ambiguous, partial, wrong subject, or wrong authority | Rejected |
| Existing user/binding/review or historical/cross-authority collision | Rejected |
| Email or nickname match only | No authority; rejected |
| Reused slot or changed manifest after finalization | `RUN_MANIFEST_MISMATCH` |
| Service/configuration failure | Fail closed; API remains 503 where applicable |

## Local PostgreSQL certification

PostgreSQL 17 tests proved:

- Wrong-cluster rejection.
- RLS/FORCE RLS and role denial.
- Exact A/B bounding and manifest validation.
- Fail-closed `NULL` handling for target, authorization, confirmation, receipt, row, metadata, and review checks.
- Authorize, provision, cleanup, and finalize in one transaction with real `now()` table defaults, proving the explicit `clock_timestamp()` row timestamps remain cleanup-compatible.
- Idempotent authorization/provisioning/cleanup.
- Duplicate/concurrent provisioning convergence.
- Historical/cross-binding rejection.
- Protected dependency refusal and recovery.
- Cleanup/finalization to zero data residue.
- Exact schema teardown.
- A real two-process race in which teardown waits for an in-flight authorization, then rejects the committed row with `CAISSA_STAGING_FIXTURE_AUTHORIZATIONS_NOT_EMPTY`, preserving both row and schema until exact cleanup.

## Authorization required for hosted use

This document does not authorize remote SQL execution, Custom Staging deployment, fixture creation, or Clerk mutation. Those actions require the final human gate and action-time revalidation of the project, cluster, artifact hashes, approved A/B manifest, and cleanup plan.
