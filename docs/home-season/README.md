# HOME-001 — CAISSA Home integration certification

Release candidate prepared on 2026-10-02 from the approved design commit
`763613fd9639e0ca5068134d884a562fa2c9aca2`, rebased logically onto
`origin/main@35c467ac072c01a83d0dd6f1d055a73a9f5eb6e8`.

The approved visual direction remains intact: black surface, white knight,
high-contrast copy and distinct tool colors. CAISSA Chat remains a noninteractive
`Coming next` card.

## Routing decision

| Request | Integrated behavior |
| --- | --- |
| `/` | 200 Home through an explicit Vercel middleware rewrite and local-server file mapping |
| `/?section=yahooClassic` | 308 to `/yahoo-classic` for the historical deep link |
| `/?action=help` | 308 to `/help` for the historical help entry |
| `/play` and `/play/*` | Existing Play ownership and fail-closed rules unchanged |
| `/home.html` | Direct Home document remains available as a cache-recovery URL |
| Tool-shell CAISSA brand | Returns to `/`; each tool's menu and board behavior remain unchanged |

The former permanent `/ -> /play` rule was removed. The middleware owns the
root rewrite because Vercel's static filesystem otherwise resolves the physical
`index.html` before the `vercel.json` rewrite. New root responses are
`no-store` so a replacement redirect cannot become sticky. A previously cached
browser 308 cannot be remotely invalidated; functional review should use a fresh
profile first and `/home.html` as the recovery URL for an affected old profile.

`index.html` remains the multi-tool shell. It no longer claims the Home canonical
URL. `LegacyCanonicalSectionRoutePolicy@1.1.0` assigns canonical URLs to the
historical shell routes at runtime.

## Route and destination inventory

The deterministic inventory is generated from the real routing and navigation
owners:

- [Machine-readable inventory](../../config/caissa-public-route-inventory.json)
- [Human-readable inventory](../architecture/CAISSA_PUBLIC_ROUTE_AND_NAVIGATION_INVENTORY.md)

Certified counts:

- 34 visible primary-navigation destinations: 30 internal and 4 external.
- 13 additional public canonical routes, including the new Home at `/`.
- 15 redirects/aliases and 5 protected route families.
- 67 total inventoried records.
- 26 internal tool destinations rendered by Home's “All tools” section directly
  from `CaissaPrimaryNavigation`.
- 30 representative public tool routes returned a status below 400 in Chromium.
- CAISSA Classic remains visible on desktop and is intentionally hidden on mobile.

The root, Play, Puzzles, Analyze, Opening Database, Endgame Tablebase, Arena,
Chess TV, FICS, Game Library, blog, account and institutional links all use
same-origin canonical routes instead of hard-coded production URLs.

## Session and progress contract

Home consumes only existing supported contracts:

- `window.CAISSA_AUTH` for loading, guest, authenticated and unavailable session
  states.
- `loadAccountProgress()` from `js/puzzles/account-progress-api.js` for saved
  Puzzles progress.
- `caissa.home.recent-tools.v1` for Home-owned navigation history.

The journey panel has explicit loading, guest, connected/loading, empty, ready and
error states. It hides the default puzzle rating when the account has zero attempts
and never synthesizes rating, streak, accuracy, games or resume positions.
It reloads saved progress when browser history restores the Home from Puzzles.
Each response is scoped to both a monotonically increasing request number and the
Clerk user ID that started it, so a late response cannot repopulate data after
sign-out or overwrite a newly selected account.

The Home header keeps `Sign in`, `Register` and `Settings` available during
session loading, for guests and when Clerk initialization is unavailable. Auth
links use same-origin relative routes and encode the current Home path, query and
hash in `redirect_url`, so the handoff returns to the same preview deployment.
Authenticated users instead receive a keyboard-operable avatar menu backed by
Clerk's supported profile surface and the existing `signOut()` contract; Settings
remains independently available. Home opts into Clerk's versioned UI bundle before
the shared auth client initializes, which keeps the profile overlay functional
without changing or adding UI dependencies to the other tools.

The Settings dialog exposes only CAISSA's existing global persisted preference:
the `CaissaI18n` interface locale (`caissa.locale`) for English, Español and
Português. Game-specific board and engine options remain in the tools that own
them. No placeholder connections, notifications, themes or account preferences
were introduced.

## Certification evidence

Automated:

- `npm run lint:home`: passed.
- `npm run test:home`: 64/64 passed.
- `npm run test:home:browser`: 8/8 passed in Chromium.
- `npm run test:puzzles`: 48/48 JavaScript and 15/15 Python checks passed.
- `npm run test:puzzles:browser`: 8/8 passed in Chromium, including the
  read-only pending-outcome regression.
- Focused Clerk/API progress contract checks: 21/21 passed.
- `vercel build`: passed for the linked preview project.
- Home plus shared-sidebar browser suite: 14/14 passed.
- Cross-route authentication plus historical canonical-route suite: 7/7 passed.
- API auth, registration sync, Play routing/auth and legacy canonical unit checks:
  36/36 relevant checks passed; the broader batch also exposed the pre-existing
  i18n consumer-order failure below.
- `git diff --check`: passed.

Browser coverage includes desktop 1440×1000 and mobile 390×844, white logo,
distinct tool colors, zero horizontal overflow, skip-link and dialog keyboard
flows, clean console, loading/guest/auth-error/authenticated account rendering,
Clerk profile and sign-out actions, persisted locale Settings, real/empty progress
response shapes, sign-in refresh, reload, history restoration, sign-out/account
switching, stale-response rejection, API failure, 30 route status checks and
tool-to-Home navigation.

Live certification with Alexander Lavin's existing Preview session now completes
the read-only API -> Puzzles -> Home chain. The branch Preview API returned HTTP
200 with `no-store`/cache bypass; Puzzles rendered rating 1835, 11 solved and 4
missed; Home rendered rating 1835, 11 solved and 15 attempted. The same values
remained after a Home reload and a Home -> Puzzles -> Home round trip. No puzzle
was played and no rating, attempt or database record was changed.

The browser contained one previously pending local outcome. Before the final
repair, Puzzles tried to replay that outcome against the incomplete staging
backend and replaced an otherwise successful read with an unavailable message.
Relayed Preview responses are now explicitly marked read-only. Puzzles preserves
the pending outcome in browser storage, does not POST it, and continues to show
the canonical saved values with an accurate read-only notice.

### Preview environment audit — 2026-10-02

The audit compared variable names, scopes and source panels without printing or
exporting credential values. No key was regenerated or rotated and Production was
not changed. Variables added or corrected for this branch are limited to Preview
and `feature/caissa-home-season-2026-10-01`.

| Preview project | Effective HOME-001 configuration (names only) | Still unavailable for this branch |
| --- | --- | --- |
| `caissa-chess` | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CAISSA_PUZZLE_WORKER_URL`, `CAISSA_BROWSER_ORIGINS`, `CAISSA_PUZZLE_PROGRESS_READ_ORIGIN` | `CAISSA_PUZZLE_WORKER_TOKEN` |
| `tv-lavin-chess-game2` | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CAISSA_PUZZLE_WORKER_URL`, `CAISSA_BROWSER_ORIGINS`, `CAISSA_PUZZLE_PROGRESS_READ_ORIGIN` | `CAISSA_PUZZLE_WORKER_TOKEN` |

The Clerk publishable key, secret key and JWT public key were obtained from the
same existing Clerk development instance. A real Preview session was accepted by
local JWT verification and identified the same Alexander Lavin account in both
Home and Puzzles. `CLERK_JWT_KEY` avoids the runtime failure observed while the
server attempted remote JWKS verification; it contains only the instance public
verification key and remains configured as a Vercel Secret.

The configured `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` come from the same
authorized staging project. Read-only inspection found that staging has no
`puzzle_training_progress` or `puzzle_training_attempts` tables, while the
canonical CAISSA backend owns those tables. Instead of copying Production database
credentials into Preview, authenticated GET requests relay to the existing
canonical progress API through `CAISSA_PUZZLE_PROGRESS_READ_ORIGIN`. POST requests
are never relayed. This preserves the production auth/RLS boundary and makes the
certification path read-only.

The only remaining credential gap is `CAISSA_PUZZLE_WORKER_TOKEN` in Preview for
the HOME-001 branch in both Vercel projects. Existing Vercel Secret values cannot
be read back and no separately authorized source value was available, so it was
not copied or regenerated. This does not block saved-progress reads, but remote
puzzle selection and writable Preview progress remain outside this certification.
The current page falls back to the bundled curated catalog when selection is
unavailable. The existing account bootstrap also returns 503 against the staging
schema; it does not alter the successfully relayed read or the displayed values.

Screenshots:

- [Desktop](screenshots/home-desktop.png)
- [Mobile](screenshots/home-mobile.png)
- [Guest header controls](screenshots/home-controls-guest.png)
- [Authenticated header and account menu](screenshots/home-controls-signed-in.png)

## Baseline findings versus regressions

Pre-existing and outside HOME-001:

- `tests/i18n-foundation.test.js` reports that `pgn-replayer.html` loads the
  shared navigation owner before i18n. HOME-001 does not modify that page.
- `npm install` reports the same 6 dependency advisories (3 moderate, 3 high)
  observed before this repair. This repair adds the official
  `@vercel/functions` runtime helper required for the middleware rewrite.
- `tests/play/play-v2-beta-entry.test.js` still reports its pre-existing Mentor
  resource-isolation failure. HOME-001 does not modify Mentor or the Play document.

Regressions found and repaired in this candidate:

- The deployed `/` served the physical `index.html` tool shell even though
  `/home.html` was correct. Root routing now rewrites before filesystem routing.
- A Home restored from the back-forward cache did not re-query Puzzles progress.
  It now refreshes on persisted `pageshow` without accepting stale account data.
- The first authenticated preview exposed Clerk's headless session client but had
  not loaded the separate Clerk UI bundle, so Profile raised "Clerk was not loaded
  with Ui components". Home now requests that bundle explicitly before auth
  initialization; a focused bootstrap test covers the ordering and UI contract.
- Server-side Clerk verification through remote JWKS failed in the Preview
  runtime even with a valid instance secret. The same instance's `CLERK_JWT_KEY`
  now verifies session JWTs locally without weakening identity checks.
- Puzzles overwrote a successful progress read with an error after automatically
  replaying a browser-local pending outcome. The Preview relay now declares
  read-only capability, so Puzzles preserves the pending item without POSTing it
  and keeps the saved progress visible.

No remaining regressions were found in the scoped routing, auth, navigation,
desktop/mobile or console suites.

## Release pendings

- If writable Puzzles Preview or remote catalog selection is required before
  release, add the existing authorized `CAISSA_PUZZLE_WORKER_TOKEN` in both Vercel
  projects, scoped only to Preview and
  `feature/caissa-home-season-2026-10-01`. The exact secure field is Vercel project
  Settings -> Environment Variables -> `CAISSA_PUZZLE_WORKER_TOKEN`. Do not send
  its value through chat, copy it from Production, or rotate it for HOME-001.
- Resolve the separate staging `/api/user/sync` 503 before certifying writable
  account bootstrap. It does not block the completed read-only progress match.
- Exercise the cached-308 recovery note in at least one previously used browser
  profile before production authorization.
- Review the Vercel preview deployment and screenshots.
- Keep PR #40 in draft. Do not merge or promote to production until Alexander gives
  explicit release authorization.

