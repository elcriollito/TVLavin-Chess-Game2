# SEC-011 — Open Redirect Hardening

## Status and confirmed flow

SEC-011 is remediated locally at Medium severity. Production has not been changed or verified.

Before remediation, `/signin?redirect_url=https://evil.example` and the equivalent signup URL flowed from `URLSearchParams` directly to Clerk's `afterSignInUrl` / `afterSignUpUrl`; an already authenticated visitor was sent through `window.location.href`. `CAISSA_AUTH.redirectToSignIn/redirectToSignUp` also serialized an arbitrary caller value.

This enabled external phishing navigation after CAISSA authentication. Static review found no Clerk JWT, OAuth code, password-reset or verification token, SEC-005 migration challenge, API key, or Stripe secret appended to redirect state. The High-severity stop condition was not met.

## Central validation contract

`sanitizeInternalRedirect(candidate, fallback)` in `js/auth-config.js` accepts one normalized root-relative application path, including ordinary query and fragment, and returns only `pathname + search + hash`. Invalid input returns `/` (or a validated fallback) without throwing or reflecting the candidate.

It rejects absolute URLs, schemes, protocol-relative and multiple-slash paths, every backslash, controls, surrounding whitespace, encoded slash/backslash/control/percent separators, double-encoded separators, userinfo URLs, lookalike hosts, oversized values, and `/api`, `/internal`, `/debug`, `/qa`, `/admin`, or `/auth`. It never repeatedly decodes input.

## Redirect inventory

| Surface | Source | Sink | Trust/result |
| --- | --- | --- | --- |
| Sign-in/signup return | `redirect_url` query | Clerk callback and `location.href` | User-controlled before; validated internal path now |
| Auth-required entry | explicit app value/current path | auth-page navigation | Path/query/hash only, centrally validated |
| Logout | no destination | Clerk `signOut()` | No redirect input or navigation sink |
| Premium auth return | static `/premium` | auth helper | Trusted static and validated |
| Stripe checkout launch | authenticated API response | `location.href` | Intentional Stripe navigation from server-created Session |
| Stripe success/cancel | server configuration | Checkout Session fields | Canonical or server-controlled origin; request headers removed |
| SEC-005 challenge/activate | authenticated JSON | no navigation sink | No redirect parameter; challenge remains in JSON |
| Middleware/Vercel redirects | static maps | HTTP redirect | Trusted static destinations |
| Opening search | constructed `/search?...` | `window.open(..., noopener)` | Internal constructed destination |
| Endgame/Play navigation | fixed registry/DOM route data | assign/replace/anchor | Application-controlled internal routes |
| Static external links | repository content | anchor/navigation | Intentional external-link contract, outside SEC-011 |

No server endpoint accepts redirect/return/callback input for an HTTP Location response. `/api/user/sync` and the SEC-005 migration endpoints return JSON only.

## Clerk, Stripe, and SEC-005

Clerk sign-in and signup receive only the sanitized result. Valid internal returns, including Premium → registration → `/premium`, remain intact; malicious values fall back to `/`.

Checkout `success_url` and `cancel_url` no longer depend on `Host` or forwarded headers. Production defaults to `https://www.caissa-chess.org`; local/rehearsal may use server-only `CAISSA_APP_ORIGIN`, restricted to an HTTP(S) origin without credentials, path, query, or fragment. SEC-010 fulfillment, economic allowlists, and idempotency are unchanged.

SEC-005 challenge/activation has no redirect input or response. Migration proofs cannot enter external navigation through these routes.

## Tests and residual risk

`tests/open-redirect-hardening.test.js` covers accepted paths; external schemes; protocol-relative, backslash, encoded and double-encoded separators; userinfo/lookalike hosts; controls; sensitive paths; Clerk options; authenticated navigation; auth helpers; logout; checkout origin; and static guards.

Production deployment and real Clerk/Stripe test-authority validation remain separate release work. Redirect validation does not replace SEC-012 CSP/referrer hardening. SEC-005, SEC-007, SEC-008, SEC-009, and SEC-012 through SEC-016 remain open.
