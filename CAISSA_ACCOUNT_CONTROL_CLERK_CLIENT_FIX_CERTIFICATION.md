# CAISSA Account Control — Clerk Client Fix Certification

Result: `REAUTH_CLIENT — CORRECTED / REAL_SDK_CONTRACT_VERIFIED`

Implementation: `b440a6ce9049eec52070e3c33420812a6078feb6`

Exact browser SDK: `@clerk/clerk-js@6.28.1`

## Certified SDK contract

The repaired client follows the actual SDK ownership model:

1. `session.startVerification({ level: 'first_factor' })` creates/loads the `SessionVerification` state.
2. The client chooses an allowlisted first factor from `supportedFirstFactors`.
3. Email and phone challenges call `session.prepareFirstFactorVerification(...)` with the exact identifier ID.
4. Email, phone, and password completion call `session.attemptFirstFactorVerification(...)`.
5. The returned verification state must be exactly `complete`.
6. The same session supplies `getToken({ skipCache: true })`.
7. The backend must certify recent authentication before Account Control unlocks.

`SessionVerification` is treated only as state. The regression mocks deliberately omit prepare/attempt methods from it, and the suite fails if the client calls the old object.

## Security invariants preserved

- Supported factor allowlist: `email_code`, `phone_code`, `password`.
- Passwords, OTPs, JWTs, and cookies are never logged or returned by the flow.
- Input lengths are bounded.
- A second submission cannot start while one is active.
- Generation checks invalidate late results after cancellation.
- User ID and Session ID are re-read and compared before/after every asynchronous boundary.
- A factor result other than `complete` cannot reach token certification.
- The refreshed token bypasses cache.
- Backend refusal keeps sensitive controls locked.
- A post-factor token/certification failure requires a clean restart.
- The backend five-minute freshness limit is unchanged.

Clerk requests are not browser-abortable. Cancellation therefore invalidates their results rather than terminating the provider request. A rapid cancel/restart can overlap provider work, but stale completion cannot certify because generation and identity checks fail closed.

## Current verification evidence

- Account Control unit/integration: 44/44 passed.
- Identity Organization: 60/60 passed.
- Public Identity: 23/23 passed.
- SEC-005 compatibility: 90/90 passed.
- Account Control browser suite: 18/18 passed on Chromium, Firefox, and WebKit, including the 390×844 mobile case.
- `npm run lint:account-control`: passed.
- Independent security review: GO, no blocker.
- Final Codex Security diff scan `7bd2d40b-27ed-4098-81f8-5fff5ed45429`: complete, zero findings on the exact implementation range through `7dbd889b16197e9e8b522c82fd2a1e8abee21046`.

## Boundary of this certification

This is a local contract and regression certification. It is not evidence of a successful hosted Clerk step-up. The real hosted session flow remains behind the final human-authorized Custom Staging gate.
