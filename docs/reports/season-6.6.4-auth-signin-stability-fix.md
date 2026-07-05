# Season 6.6.4 - Auth Sign-In Stability Fix

## Objective

Season 6.6.4 stabilizes the Sign In and Account UX before publishing the personalized Academy work from Season 6.6.3.

The goal is to prevent a signed-in user from briefly seeing a signed-out Sign In state, clicking it, and being bounced through `/signin` while Clerk already has an active session.

## Root Cause

The sidebar Sign In link was visible before Clerk finished loading and before CAISSA auth state settled.

For returning signed-in users, this could create a race:

1. The page initially showed Sign In.
2. The user clicked it.
3. `/signin` loaded Clerk.
4. Clerk detected the existing session and redirected back.

That looked like the login opened and immediately closed.

## Fix

- The sidebar Sign In control is hidden until auth has finished loading.
- The auth UI now has a pending state instead of rendering signed-out before Clerk resolves.
- If a signed-in user somehow activates the Sign In link, the click is intercepted and the account menu opens instead.
- CAISSA auth now emits deduplicated auth-change events so duplicate Clerk listener updates do not cause repeated sync attempts.
- The initial Clerk session check marks auth as loaded before notifying UI listeners.

## User Sync Status

Production `/api/user/sync` returns 401 when auth is missing, which is expected.

The reported authenticated 503 is a controlled recoverable backend state. Public auth config reports registration tracking as available, so the issue is most likely in the Supabase persistence path such as schema, permissions, upsert conflict support, or deployed database configuration.

This phase does not reopen `/api/user/sync` because Season 6.6.2 already made it return controlled 503 responses instead of generic 500 errors.

The frontend now treats sync unavailability as local-session fallback, not a login failure.

## Clerk Production Key Status

Production `/api/public-auth-config` currently serves a `pk_test_` Clerk publishable key.

Code already prefers `pk_live_` when it exists, so this indicates Vercel needs a production Clerk publishable key configured through:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`

No keys were hardcoded.

## Academy Compatibility

Season 6.6.3 remains intact:

- Guest Student when signed out
- Signed in as display name when signed in
- FREE DURING BETA
- No credits required
- No wallet required

## What Was Not Modified

- FICS
- Gateway
- Style12
- PGN
- Replay
- CAISSA Classic
- Spectator TV
- Academy content/layout beyond the existing 6.6.3 identity surface
- `/api/user/sync`
- Wallet architecture

## Validation Plan

- `node --check js/caissa-auth.js`
- `node --check js/caissa-access.js`
- `node --check js/academy-section.js`
- `node --check api/user/sync.js`
- `git diff --check`
- signed-out UI smoke
- signed-in mocked UI smoke
- Academy smoke
- full Production Validation Suite
