# CAISSA Account Control — Reauthentication & Ownership Root Cause

Date: 2026-10-23

Mission: `CAISSA_ACCOUNT_CONTROL_REAUTH_OWNERSHIP_CLOSURE_20261023`

Base: `db1728fa12d573613a03250d06d98234a12a8e33` (tree `edce75d11b41b251ba9070f4c8979dd555408245`)

Implementation commits: `b440a6ce9049eec52070e3c33420812a6078feb6`, `efcf9b2dd0fc51da402a658275c837e998a14e70`

## Root-cause matrix

| Symptom | Confirmed cause | Evidence | Expected contract | Minimal correction | Required regressions |
|---|---|---|---|---|---|
| Hosted email/phone/password step-up failed before Account Control could unlock. | The client invoked `prepareFirstFactorVerification` and `attemptFirstFactorVerification` on the `SessionVerification` state object. In the exact browser SDK, both methods belong to the active `Session`. The local mocks repeated the incorrect shape, hiding the integration defect. | The site pins `@clerk/clerk-js@6.28.1` in `js/caissa-auth.js`. Its runtime/types place `startVerification`, `prepareFirstFactorVerification`, and `attemptFirstFactorVerification` on `Session`; `SessionVerification` carries state/results. Hosted failure occurred at the wrong-object factor call, before token refresh or backend certification. | Start verification on `Session`; select a supported factor from the returned verification state; prepare/attempt on that same `Session`; accept only `status=complete`; fetch a skip-cache token; require backend `sid`/`jti`/`fva` certification while subject and session remain unchanged. | Move prepare/attempt calls to `context.session`; keep all existing completion, freshness, identity, duplicate, cancellation, and restart gates. Correct the mocks so the verification object exposes no factor methods. | Email, phone, password, already complete, missing methods, invalid input/retry, absent/refused token, session/user swap, cancellation, duplicate submit, mobile browser behavior, and an explicit wrong-object regression. |
| New Clerk Development fixtures reached `409 IDENTITY_RESOLUTION_REQUIRED`. | This is the intended fail-closed ownership result. A new Development subject has no active exact `legacy_development` binding or verified ownership decision. Ordinary sync is forbidden from inventing one. | `api/user/sync.js` resolves the signed subject under the server-owned authority. The SQL resolver returns `UNRESOLVED` without an exact active binding, and `api/_lib/identity-ownership.js` maps it to 409. The enforced sync path may provision only an explicitly approved Production identity; tests require Development auto-provisioning to remain disabled. | Authentication proves control of a Clerk session, not ownership of an existing CAISSA UUID. A synthetic Staging identity must be explicitly authorized, new, exact, auditable, bounded to its run, and rejected if historical, ambiguous, revoked, crossed, or partially provisioned. | Add a separate owner-only SQL contract outside ordinary migrations and public HTTP routes, fixed to the exact Staging cluster and `legacy_development`, with an immutable two-fixture manifest, exact cleanup, and guarded teardown. Do not change the 409 behavior. | New-unprovisioned 409, verified binding success, missing/revoked/ambiguous/wrong-subject/wrong-authority rejection, historical collision rejection, idempotence, concurrency, protected dependencies, cleanup, schema teardown, and teardown/write race. |

## Confirmed separation of failures

The browser reauthentication defect and the later ownership 409 are independent boundaries:

1. The first defect prevented the real Clerk factor operation from completing.
2. Even with a valid recent Clerk session, an unprovisioned Development subject must still receive 409.
3. The client repair does not create ownership, and the fixture contract does not weaken reverification.

## Files changed

- `js/identity/recent-reauthentication.js`
- `tests/recent-reauthentication.test.js`
- `tests/browser/account-control.spec.js`
- `package.json`
- `supabase/staging-only/20261023211619_caissa_staging_synthetic_identity_provisioning.sql`
- `supabase/staging-only/20261023211620_caissa_staging_synthetic_identity_teardown.sql`
- `tests/staging-synthetic-identity.test.js`
- `tests/staging-synthetic-identity-postgres.sql`
- `tests/run-staging-synthetic-identity-postgres.mjs`

No hosted Clerk user, Supabase object, Vercel deployment environment, credential, or Production resource was changed during root-cause confirmation or local certification. The historical cleaned-run ledger was not modified.
