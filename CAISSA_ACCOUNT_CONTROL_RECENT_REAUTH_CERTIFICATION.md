# CAISSA Account Control — Recent Reauthentication Certification

Date: 2026-10-20

Mission: `CAISSA_ACCOUNT_CONTROL_RECENT_REAUTH_RECOVERY`

Result: `CAISSA_ACCOUNT_CONTROL_V1 — REAUTH_REPAIR_PREPARED / STAGING_DEPLOYMENT_APPROVAL_PENDING`

## A. Diagnosis

- Source branch: `fix/account-control-fresh-chain-order-20261019` (PR #92).
- Certified base commit: `23760147e54b8d559c923b6a2b1f6e6b4491b4ac`.
- Base tree: `2e9bc714732f6a7eb0b298f22edc588831cf2006`.
- Repair branch: `fix/account-control-recent-reauth-20261020`.
- Root cause: the backend correctly required signed Clerk `sid`, `jti`, and a first-factor verification age (`fva[0]`) from zero through five minutes, but the browser only signed the user out and redirected to sign-in. That flow did not perform a Clerk Session Verification and could reuse a cached token whose `fva` was still stale.
- A newly issued JWT is not treated as evidence of recent factor verification. The backend remains the authority for signature, issuer, authorized party, session metadata, and `fva` validation.
- The existing Custom Staging deployment `dpl_3WvQt2mTFRXuav8wpXDMPrc3VR9p` is `READY`, but serves commit `f2318cebd4c9bc71eb66e7ca4380742bad2db867`; it therefore does not contain this repair.

## B. Solution

- Added a framework-independent Clerk Session Verification flow using `session.startVerification({ level: 'first_factor' })`.
- Supported verified first factors: email code, phone code, and password. Unsupported or absent factors fail closed.
- After successful factor verification, CAISSA requests a non-cached Clerk JWT and asks the Account Control summary endpoint to certify the signed claims before exposing sensitive controls.
- The certified JWT remains memory-only for 45 seconds to bridge the step-up response. Later requests obtain a current Clerk session JWT; the server-side five-minute `fva` gate remains unchanged.
- The UI binds the operation to the current Clerk user and session, blocks duplicate submissions, ignores late completions after cancellation, and clears ephemeral state on close, authorization failure, session change, or expiry.
- Download, reset, and deletion controls remain hidden until the backend returns `backendReady=true` and `requiresReauthentication=false`.
- No ownership, CSRF, Supabase, migration, or Production contract was weakened or changed.

## C. QA

| Suite | Result |
|---|---|
| Account Control lint | PASS |
| Account Control unit/client/export/reauth | 30/30 PASS |
| Identity Organization | 50/50 PASS |
| Public Identity | 23/23 PASS |
| SEC-005 | 90/90 PASS |
| Account Control browser — Chromium/Firefox/WebKit | 18/18 PASS |
| Public Identity browser — Chromium/Firefox/WebKit | 12/12 PASS |
| RS256 auth contract: valid, expired, issuer, `azp`, tamper | PASS |
| Mobile 390×844 and desktop visual/overflow checks | PASS |
| Supply-chain audit | PASS; 0 npm vulnerabilities |
| `git diff --check` | PASS |

Security cases include valid and stale `fva`, missing/malformed/negative `fva`, missing `sid`/`jti`, expired/tampered JWT, wrong issuer/authorized party, crossed identity/session, revoked session, cancellation, duplicate submission, refreshed token without factor verification, backend refusal, and immediate clean restart after a post-factor token/certification failure.

## D. Staging

- Authorized project: Supabase Staging `aqizagaskicotorfpwfn`, Clerk Development, protected Vercel Custom Staging.
- No hosted fixtures were created for this repair.
- No hosted write, reset, deletion, migration, secret change, deployment, or authenticated export was executed.
- The previously certified `CLEAN_STAGING` state is preserved.
- Hosted reauthentication and A/B export isolation remain pending because the exact repaired commit is not deployed to Custom Staging. Testing the older deployment would not certify this code.

## E. GitHub delivery

- The repair is isolated from PRs #79–#84 and #92.
- The immutable delivery SHA and tree are reported by the PR/checks containing this document.
- Automatic Git integration was checked before push: the affected integrations create protected Preview deployments, not Production or Custom Staging deployments.
- No force push, merge, alias reassignment, Production deployment, or remote migration is part of this delivery.

## F. Release gates

| Gate | State |
|---|---|
| Root cause | PASS |
| Clerk step-up verification | PASS — LOCAL |
| Signed JWT freshness | PASS — LOCAL |
| Five-minute enforcement | PASS — unchanged server gate |
| Frontend reauth UX | PASS — LOCAL/CROSS-BROWSER |
| Security regressions | PASS |
| Local QA | PASS |
| Hosted reauth | PENDING — repaired SHA not on Custom Staging |
| Authenticated export | PENDING — hosted gate |
| A/B isolation | PENDING — hosted gate |
| Cleanup | PASS — no hosted fixtures created |
| Final Staging Certification | HOLD — deployment approval required |
| Owner merge approval | PENDING |
| Supabase Production access | BLOCKED / OUT OF SCOPE |

## Next authorized gate

Deploy the exact PR commit to protected Vercel Custom Staging with Clerk Development and Supabase Staging, then run one controlled recent-reauthentication plus private export/A-B isolation certification. Do not run hosted Reset or Delete.
