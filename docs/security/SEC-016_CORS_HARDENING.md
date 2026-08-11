# SEC-016 — CORS hardening

Status: **REMEDIATED LOCALLY**. All local CORS and task-wide regression gates pass; production deployment and verification are not part of this change.

Browser CORS is denied by omission unless a route calls the shared helper. The helper accepts exact `https://www.caissa-chess.org` and optional exact development/test origins from server-controlled `CAISSA_BROWSER_ORIGINS`. Client input cannot configure the allowlist. Null, lookalike and unlisted origins fail with a generic 403.

Matched responses set the exact origin and `Vary: Origin`, advertise only the route method plus `OPTIONS`, allow only `Authorization` and `Content-Type`, and never enable credentialed CORS. Requests without Origin keep server-to-server and same-origin behavior without an allow-origin header.

| Routes | Classification | Policy |
| --- | --- | --- |
| Mentor and identity-migration routes | authenticated sensitive POST | exact-origin POST |
| Checkout, credits, polyglot, library push and user sync | authenticated POST | exact-origin POST |
| Library delete | authenticated POST | exact-origin POST |
| Library pull and wallet | authenticated read | exact-origin GET |
| Stripe webhook | server-to-server | no browser CORS |
| Public auth config | public same-origin | no browser CORS |

OPTIONS runs before authentication/provider/database work and performs no mutation, credit consumption or Stripe processing. Tests cover no-Origin, canonical/configured origins, evil/null/lookalike/subdomain origins, permitted and forbidden preflights, unexpected headers, no wildcard/credentials, correct `Vary`, sensitive route guards and webhook omission.

Rollback is a revert of the single local platform-security commit; restoring wildcard CORS is not an acceptable workaround.
