# CAISSA Account Control — Security Hold Closure

Date: 2026-10-23

Mission: `CAISSA_ACCOUNT_CONTROL_REAUTH_OWNERSHIP_CLOSURE_20261023`

## Final local state

`CAISSA_ACCOUNT_CONTROL_V1 — REAUTH_AND_IDENTITY_LOCAL_CERTIFIED / HOSTED_RETEST_APPROVAL_PENDING`

Both targeted blockers are resolved locally:

- Clerk reauthentication now uses the exact `@clerk/clerk-js@6.28.1` Session contract and remains backend-certified.
- New Development subjects still fail closed at 409 unless the separate owner-only, exact-Staging fixture contract explicitly provisions their own new verified identity.

This is not a Hosted PASS and not a Production Ready declaration.

## Git and integration record

- Branch: `fix/account-control-reauth-ownership-20261023`.
- Parent/base branch: `fix/account-control-session-security-p2-20261021`.
- Base commit: `db1728fa12d573613a03250d06d98234a12a8e33`.
- Base tree: `edce75d11b41b251ba9070f4c8979dd555408245`.
- Client/contract commit: `b440a6ce9049eec52070e3c33420812a6078feb6`.
- Client/contract tree: `c13a57ff683655f657cd543ca2f51e8e51690250`.
- Race-safe teardown commit: `efcf9b2dd0fc51da402a658275c837e998a14e70`.
- Race-safe implementation tree: `725132647f11d79e0df6e5523267e8d341e01357`.
- P2 review closure commit: `7dbd889b16197e9e8b522c82fd2a1e8abee21046`.
- P2 review closure tree: `30201915ed7bb20dcc6fe6fc0c360f09de479b01`.
- Stacked PR: [#101](https://github.com/elcriollito/TVLavin-Chess-Game2/pull/101), open against the #97 branch; no merge performed.
- Parent PR [#97](https://github.com/elcriollito/TVLavin-Chess-Game2/pull/97): open, head `db1728fa12d573613a03250d06d98234a12a8e33`, merge state CLEAN at final review, three Vercel checks successful, no submitted GitHub review.
- PR [#93](https://github.com/elcriollito/TVLavin-Chess-Game2/pull/93): open and CLEAN at final review.

Normal branch publication was reviewed before execution. Its automatic effects are Vercel Preview builds for `account-control-release-readiness`, `caissa-chess`, and `tv-lavin-chess-game2`; it does not promote Production or Custom Staging.

GitHub review raised two P2 findings on `efcf9b2d`: SQL three-valued logic could allow `NULL` to bypass destructive/authorization checks, and transaction-stable `now()` defaults could make same-transaction cleanup reject newly created fixtures. Both remain visible in the PR audit trail and are resolved by `7dbd889b`, with explicit negative and full same-transaction PostgreSQL tests.

## Verification record

| Check | Result |
|---|---|
| Account Control | 44/44 passed |
| Identity Organization | 60/60 passed |
| Public Identity | 23/23 passed |
| SEC-005 | 90/90 passed |
| Account Control browsers | 18/18 passed on Chromium, Firefox, WebKit, including 390×844 mobile |
| PostgreSQL 17 fixture lifecycle | Passed |
| PostgreSQL 17 NULL/same-transaction regressions | Passed |
| PostgreSQL 17 exact cleanup/schema teardown | Passed |
| PostgreSQL 17 real teardown/write race | Passed: wait, exact residue rejection, preservation, clean retry |
| Account Control lint | Passed |
| Supply-chain policy | Passed: 482 runtime files, 177 locked entries |
| `git diff --check` | Passed |
| Secret scan | Zero findings in the final implementation review |
| Independent bypass/TOCTOU review | GO, no blocker |
| Final Codex Security scan | `7bd2d40b-27ed-4098-81f8-5fff5ed45429`, exact range through `7dbd889b`, complete coverage, zero findings |

## Residual and non-blocking risks

- `npm audit` and `npm audit --omit=dev` report four high-severity paths to Zod `<4.6.6` through the current/latest `@vercel/functions` → `@vercel/oidc` → `@vercel/cli-config` chain. The offered `npm audit fix --force` installs a breaking older `@vercel/functions`; no safe targeted upstream update exists in the tested dependency line. This was not force-fixed in the authentication/ownership patch.
- The broad repository regression command is not green because of unrelated pre-existing failures and optional worker/FICS/live-tablebase conditions outside this diff. Targeted security and compatibility suites are green.
- Browser cancellation cannot abort an already-issued Clerk request. Generation and identity checks prevent stale certification, but a rapid restart may still create harmless overlapping provider work.
- Hosted environment values, real factor delivery, Custom Staging behavior, and the remote fixture lifecycle remain unexecuted pending explicit authorization.

## Explicitly not executed

- No main merge, force push, destructive rebase, or worktree deletion.
- No Production or Custom Staging deployment/promotion.
- No remote Supabase migration or SQL installation.
- No Clerk settings, credentials, Production users, or real identities changed.
- No new hosted fixture users created.
- No hosted Reset or Delete Account.
- No historical cleaned-run ledger modification.

## Final human gate

The next authorized decision must name the exact deployment SHA and approve the bounded Custom Staging run, Supabase Staging contract installation/teardown, and two exact Clerk Development fixtures. Execution must follow `CAISSA_ACCOUNT_CONTROL_FINAL_HOSTED_RETEST_PLAN.md` and stop on any mismatch or unexpected resource.
