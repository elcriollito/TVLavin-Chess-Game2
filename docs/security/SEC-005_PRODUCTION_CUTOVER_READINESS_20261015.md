# SEC-005 Production identity cutover readiness

Status: **LOCAL CANDIDATE CERTIFIED; DEVELOPMENT OWNER PROOF MATCH; OWNER APPROVAL REQUIRED**

Date: 2026-10-15  
Base commit: `0abf1d311ca95090e73f25b2a75388a4496c488f`  
Production Supabase project: `jczauvkfkweuvdpurpem`  
Public Online rollout: `off`

This document reconciles the historical SEC-005 design with CAISSA Online v1
and Public Identity v1. It does not authorize a Production account, migration,
environment change, deployment, binding, or database write.

## Verified current state

Read-only Production inspection established:

- 14 `public.users` rows and 14 distinct historical Clerk subjects;
- 14 `caissa_public_identities` rows;
- 6 credit events, 0 Stripe events, and 1 entitlement;
- no active Online games, live presence, queued matchmaking ticket, or pending
  challenge at the observation point;
- no SEC-005 tables or SEC-005 ledger entry;
- `CAISSA_IDENTITY_MIGRATION_MODE` is not active;
- Clerk Production has zero users;
- Online remains disabled publicly.

Counts are a point-in-time readiness baseline, not a freeze. Every future write
gate must revalidate them and distinguish legitimate concurrent changes.

## Development owner proof

The owner completed a manual sign-in through the Clerk Development Account
Portal. A fresh session token was obtained once and verified locally against
the exact Development issuer and its official JWKS. The verifier required an
RS256 signature, a matching signing key, the expected issuer, the
`authenticated` role, a nonempty subject, and a currently valid lifetime. The
token, subject, email, cookie, Clerk ID, signing-key ID, and subject digest were
not persisted in this report.

The verified subject was compared with Production only through a SHA-256 digest
inside a strictly read-only aggregate query:

- historical subject proof: **MATCH**;
- candidate count: **1**;
- subject conflict: **no**;
- related economic records: **yes**;
- canonical Public Identity present: **yes**;
- provisional SEC-005 migration eligibility: **yes**.

This proof establishes the historical Development owner identity only. It does
not create or authorize a Clerk Production account, change a Production
binding, apply a migration, activate Online, or replace the future dual-authority
cutover approval.

## Immutable-HEAD security findings

A focused security review of the base commit found three cutover blockers:

1. **High — subject-bearing Online snapshots were not remapped.** Updating only
   `users.clerk_id` would leave profile, presence, queue, game participant,
   draw-offer, rate-limit, history, and private Realtime authorization tied to
   the retired Development subject.
2. **Medium — Production sync was not authority-scoped.** The resolver accepted
   an active binding without requiring `environment = 'production'`.
3. **Medium — a sibling challenge survived emergency rollback.** Two live
   challenges could allow a second activation after restoring the legacy
   binding.

The completed scan is intentionally partial outside the SEC-005 dependency
slice: 6 of the 36 migration files were fully reviewed. The report is stored in
the local Codex Security evidence directory under scan
`a6c0371d-3506-4c85-9d02-2ad15187be58`.

## Minimal local correction

The candidate reuses SEC-005. It does not introduce another migration system.

- `api/user/identity-migration/challenge.js` resolves the verified historical
  subject explicitly in `legacy_development`.
- `20261015220000_sec005_cutover_compatibility_v1.sql`:
  - restricts normal sync to the `production` namespace;
  - rejects reuse of a Clerk subject across either namespace;
  - atomically remaps Online subject snapshots by immutable `users.id`;
  - advances active-game version while preserving frozen names and history;
  - conservatively merges subject-keyed rate limits;
  - records and validates the exact predecessor for rollback;
  - revokes sibling challenges on activation and every pending proof on
    rollback;
  - supplies an expiring, audited, service-role-only `APPROVED_NEW` writer.

No code in the candidate authorizes email, full name, nickname, client metadata,
or a supplied CAISSA UUID as ownership proof.

## Local certification

The exact candidate was applied to PostgreSQL 17.11 on loopback with synthetic
Supabase-owned catalog stubs. The rehearsal exercised activation and rollback
against synthetic users, Public Identity, Online, Realtime, credit, Stripe,
entitlement, rating, event, and library rows.

Observed PASS conditions:

- `users.id` unchanged in both directions;
- credits, premium state, credit events, Stripe event, entitlement, library
  history, rating, Online event history, nickname and fallback alias preserved;
- profile, presence, ticket, game participant, draw offer, rate limit and
  private Realtime authorization moved to the Production subject atomically;
- the retired subject lost private-topic authorization;
- rollback restored the exact predecessor and the symmetric Online state;
- sibling challenge replay and cross-authority subject reuse were rejected;
- forged rollback provenance was rejected;
- browser roles could not read SEC-005 tables or call enrollment approval;
- an approved new identity provisioned once and a consumed decision could not
  be replayed;
- the test transaction ended with `ROLLBACK`.

Test results:

- `test:sec005`: 48/48;
- `test:public-identity`: 23/23;
- `test:online`: 78/78;
- PostgreSQL integration rehearsal: PASS;
- JavaScript syntax and `git diff --check`: PASS.

## `/api/user/sync` cutover contract

With `CAISSA_IDENTITY_MIGRATION_MODE=enforced`, the ordinary upsert path is not
reachable:

- pending historical owner -> `409 IDENTITY_MIGRATION_REQUIRED`;
- unclassified subject -> `409 IDENTITY_RESOLUTION_REQUIRED`;
- bound Production subject -> update only the matching immutable UUID row;
- approved new subject -> one atomic provisioning operation;
- consumed/conflicting approval -> fail closed;
- identity service failure -> `503`, without falling back to upsert.

Synthetic concurrent requests produced one new UUID and one conflict; a later
retry resolved the already-bound UUID without provisioning again. Supplying the
same email does not change these decisions.

The current sync updates the private email from the verified Production Clerk
session after a successful binding. Emergency identity rollback restores the
Clerk subject but does not restore a previous email preimage. Recovery is
therefore exact for binding/authorization and forward-recovery for private
email unless a separately protected preimage is captured. This limitation must
be accepted or closed before the Production gate.

## Managed migration mapping

The historical source files share the broad `20260811` prefix with unrelated
migrations and must not be sent through indiscriminate CLI discovery. The
future gate must use three explicit `apply_migration` calls in this order and
record the returned ledger versions:

| Order | Managed migration name | Source artifact | SHA-256 |
| --- | --- | --- | --- |
| 1 | `sec005_clerk_identity_remapping_foundation_v1` | `20260811_clerk_identity_remapping_foundation.sql` | `f28731f818943dff0b394560e5e79433e4e50a142a1270923bfebf94914377cc` |
| 2 | `sec005_clerk_migration_cutover_tooling_v1` | `20260811_clerk_migration_cutover_tooling.sql` | `e90b81eb7462e6d555b9f4de0ece85e75ecd809eac6a513fc047db52c12b9246` |
| 3 | `sec005_cutover_compatibility_v1` | `20261015220000_sec005_cutover_compatibility_v1.sql` | `3644577e080fca71b70f7fa31e07ab0980d9f8884d861dd6eaa9a02f0fd689f2` |

No migration repair, seed, reset, branch merge, or unrelated pending migration
belongs to this sequence. An ambiguous response stops execution; it is resolved
by read-only ledger/catalog inspection, never by an automatic retry.

## Owner-first Production sequence

1. Reconfirm Online OFF, exact deployments, Clerk Production user count, SEC-005
   absence, locks, active Online state, and protected economic counts.
2. Review and release the compatibility code while migration mode remains off.
3. Install fixed issuer, public verification-key allowlists, audiences and
   authorized parties for both Clerk authorities. Do not reuse Development
   secrets in Production.
4. Set `CAISSA_IDENTITY_MIGRATION_MODE=enforced` and deploy before the first
   Production registration. With SEC-005 still absent, verify `/api/user/sync`
   fails closed with 503 and cannot execute the ordinary upsert.
5. Apply only the three managed migrations above and run the combined-schema
   postflight. Keep migration mode enforced.
6. Reverify the historical Development session proof. The result may establish
   only the historical subject; it does not authorize a future Production
   binding.
7. With a separate human authorization, create the owner's first Clerk
   Production account. Verify a fresh Production session against the fixed
   Production authority.
8. Submit one dual-authority challenge with a maximum 15-minute lifetime and
   activate it once. No email-based merge or manual `users.clerk_id` update.
9. Confirm the same internal UUID, credits, credit events, entitlement, history,
   Public Identity, rating, Online history, and private Realtime authorization.
10. Test logout, new login, `/api/user/sync`, Puzzles authenticated read, and
    account recovery. Do not solve a puzzle or change economic state.
11. Keep Online OFF. New players require a subject-specific, expiring owner
    decision through the service-role-only approval function until a separately
    reviewed operator surface exists.

## Stop and recovery rules

- Before migration commit: restore the previous deployment/environment state.
- After any successful migration commit: do not run destructive SQL rollback
  automatically. Keep sync fail-closed and inspect ledger/catalog evidence.
- Before binding activation: revoke the challenge and leave the legacy binding
  active.
- After activation: use only the exact-provenance rollback function with a
  detailed reason; it revokes all pending proofs. Preserve audit and history.
- Any ambiguous response, subject conflict, economic count change, unknown
  Clerk authority, or active-game divergence is a stop condition.

No new paid infrastructure is required. Expected incremental platform cost is
zero beyond existing Vercel, Clerk, and Supabase usage. Operational time is
estimated at 60–90 minutes plus the owner's two manual sign-ins.

## Future authorization draft

The later owner authorization must explicitly name the Production project,
base/release commit, three managed migration names and hashes above, exact
Vercel project/environment, exact Clerk authority metadata, and the single
owner account. It must authorize, in order:

1. compatibility deployment with Online OFF and migration mode still off;
2. installation of fixed public verifier metadata and a private throttle
   pepper without exposing values;
3. `CAISSA_IDENTITY_MIGRATION_MODE=enforced` plus one deployment;
4. exactly three managed `apply_migration` calls;
5. the read-only postflight;
6. creation of exactly one Clerk Production owner account by the owner;
7. exactly one dual-auth challenge and one activation;
8. read-only/effect-bounded E2E and, only if needed, exact-provenance rollback.

It must continue to prohibit Online activation, arbitrary SQL, migration repair,
credit/economic edits, account import, Development-to-Production copying,
Google OAuth changes, and automatic retries.

The previous Public Identity backup-risk acceptance does not authorize this
sequence.

