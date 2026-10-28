# AUTH-004H security certificate

Audit date: October 27, 2026

Status: **TECHNICALLY CERTIFIED; RESIDUAL RELEASE RISK REQUIRES ORDERED SMOKE TESTS**

## Scope

Security-sensitive runtime candidate: `2e4e23b5c96e1724ae87735851ac9a7b77332b02`

Production baseline: `6e912be5c314080be8944efde261b8dc133452a6`

AUTH-004H changes only release/governance Markdown. It does not alter authentication, authorization, JWT, database, Scanner, Beta, dependency, or browser runtime paths.

## Certified controls

- Strict Clerk JWT verification and issuer/authorized-party enforcement.
- Invalid, expired, malformed, and bad-signature token rejection.
- Bounded JWKS refresh for legitimate key rotation without bypassing verification.
- Guest Scanner distinguishes absent credentials from invalid/stale credentials and fails closed on invalid credentials.
- Existing-account sign-in remains separate from restricted sign-up.
- 16+ eligibility is server-gated, neutral, month/year only, and discarded after the decision.
- Signed short-lived eligibility state, one-way nonce storage, single use, origin/CSRF checks, HMAC identifiers, durable atomic quotas, and fail-closed prerequisites.
- Clerk invitation recipient binding and non-transferable sign-in/sign-up behavior.
- Supabase RLS/service-role-only migration design with fixed `SECURITY DEFINER` search path.
- Beta Program and owner-review authorization preserved.
- Scanner feedback remains account-gated, raw-unverified, and separated from model training.

## Scan and test evidence

| Evidence | Result |
| --- | --- |
| AUTH-004H targeted auth/age/redirect/Scanner policy rerun | 97/97 pass |
| Codex Security diff scan ID `d450eca1-25c2-4318-949a-7e424fb17257` | 28/28 surfaces; 0 validated findings |
| Targeted auth/age/redirect suite | 77/77 pass |
| Auth/security regression | 75/75 pass |
| Browser registration/Clerk/legal suite | 29 pass, 1 intended skip, 0 fail |
| Legal unit/browser | 12/12 and 5/5 pass |
| Scanner exact-SHA regression | 63/63 pass |
| Beta exact-SHA regression | 22/22 pass |
| npm dependency audit | 0 vulnerabilities at certification |
| Supply-chain policy | Pass |
| Migration concurrency/RLS/service-role | Pass |

Scan report: `C:\Users\ALEXANDER\.codex\state\plugins\codex-security\scans\TVLavin-Chess-Game2-auth004c-rc\2e4e23b5c96e1724ae87735851ac9a7b77332b02_20261027T235115Z_qaj1llho\report.md`

## Current production safety state

- Production registration remains disabled because `CAISSA_REGISTRATION_RELEASE`, `CAISSA_CLERK_RESTRICTED_INVITATIONS`, `CAISSA_REGISTRATION_DURABLE_LIMITER`, and `CAISSA_REGISTRATION_GATE_SECRET` are absent.
- Supabase production age-gate objects are absent.
- Clerk Production remains restricted.
- Google credentials are not configured in Clerk Production.

## Residual risk

Zero scanner findings do not establish zero risk. The largest remaining risks are configuration drift during multi-provider release, inaccurate legal publication, incorrect secret installation, migration to the wrong database, and registration activation before all gates are verified. The dependency map and rollback plan reduce but do not eliminate these risks.

## Mandatory final security smoke

Run after each separately approved production action: valid/expired/invalid JWT, unknown key ID and recovery, anonymous versus stale-token Scanner, existing login/logout/session refresh, direct-signup denial, invitation replay/transfer denial, CSRF/origin rejection, durable quota concurrency, Beta owner authorization, and Scanner feedback/review authorization.
