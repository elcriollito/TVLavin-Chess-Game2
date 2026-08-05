# Play v2 Auth Bootstrap Boundary

Status: implemented locally; clean laptop retest required

Issue: `PLAYV2-11.8.1D-BOOT-001`

## Decision

Play v2 does not require account authentication for Games, Bots, native Coach, completed-game PostGame, consent-controlled local PGN save, Analyze, optional post-game Mentor review, feedback, or internal beta admission. The dedicated Play v2 document therefore excludes the shared account-authentication resources instead of requesting configuration that has no authorized Play consumer.

The deterministic builder removes `css/caissa-auth.css`, `js/auth-config.js`, `js/caissa-auth.js`, `js/caissa-access.js`, and `js/caissa-ui-auth.js` only from `play-v2.html`. CAISSA Classic, Legacy Play, Sign In, Sign Up, account, and premium ownership remain unchanged.

## Request ownership and root cause

`js/auth-config.js` installs `window.CAISSA_AUTH_CONFIG` and immediately starts `window.CAISSA_AUTH_CONFIG_READY`. Its top-level asynchronous bootstrap requests `GET /api/public-auth-config` with `cache: no-store`. `js/caissa-auth.js` awaits that promise during `DOMContentLoaded` initialization and consumes a configured Clerk publishable key when account authentication is present.

The production Vercel function `api/public-auth-config.js` owns the endpoint. The loopback production-equivalent server does not implement that route, so the inherited but unused Play v2 auth bootstrap received HTTP 404. Its JavaScript fallback handled the response, but a handled fetch response does not prevent the browser from recording the failed resource status.

Adding a loopback-only fake response would duplicate production ownership and conceal the unnecessary request. Adding a shared server route is also outside Play v2's need. Resource exclusion is the smallest truthful correction.

## Public configuration and secret boundary

The retained account endpoint allowlists two response fields:

- `clerkPublishableKey`: public identifier, safe for browser delivery;
- `registrationTracking`: boolean feature-state metadata derived server-side.

The following remain prohibited from every response, client bundle, generated entry, fixture, log, and document:

- Clerk secret keys and signing secrets;
- Supabase service-role keys;
- database credentials;
- private tokens and passwords;
- unrestricted backend credentials;
- private service endpoints.

The presence of server credentials may contribute only to the boolean `registrationTracking`; credential values are never returned. Play v2 establishes no account identity, loads no remote authentication provider, writes no auth storage, and sets no auth cookie during bootstrap.

## Environment parity

Vercel retains the authoritative account endpoint for account-owned surfaces. `server.js` remains unchanged because Play v2 no longer calls the endpoint and a local duplicate would create divergent business logic. The generated Play v2 entry is the parity boundary: every environment receives the same auth-free document.

The internal beta gate, `/play` default, homepage, FICS isolation, Players exclusion, educational isolation, analytics transport prohibition, CSP, and public-release state are unchanged.

The shared engine bootstrap previously materialized default `caissa.engineId` and `caissa.chess960` preferences during passive load. Native Play v2 now avoids those two default writes while retaining reads of an existing user preference and writes caused by an explicit settings action. Classic and Legacy initialization behavior is unchanged.

## Acceptance boundary

Automated Chromium and WebKit owners must prove fresh Games, Bots, and Coach documents produce no auth-config request, external auth-provider request, console/page error, request failure, cookie, auth storage, or guest identity. Players must remain runtime-free and unavailable. Physical iPhone retesting remains separate and pending.
