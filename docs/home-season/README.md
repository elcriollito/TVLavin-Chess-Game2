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

Live baseline evidence from the existing production session identifies Alexander
Lavin in Puzzles and shows the saved CAISSA training estimate captured there as
1835, with 11 solved and 4 missed. No attempt or rating was changed during
certification. The `caissa-chess` branch preview now loads Clerk and identifies
Alexander Lavin with a real independent Preview session. Its Puzzles UI currently
reports account progress unavailable, which remains a Preview configuration
blocker rather than a Home display regression.

### Preview environment audit — 2026-10-02

The audit compared variable names, scopes and non-secret configuration without
printing or exporting any credential. Vercel Secret values are deliberately
non-readable after creation, so their equality cannot be inferred from their
names or copied out of another branch. Production was not changed.

| Preview project | HOME-001 branch configuration now present | HOME-001 branch secrets still required |
| --- | --- | --- |
| `caissa-chess` | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `SUPABASE_URL`, `CAISSA_PUZZLE_WORKER_URL`, `CAISSA_BROWSER_ORIGINS` | `CLERK_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CAISSA_PUZZLE_WORKER_TOKEN` |
| `tv-lavin-chess-game2` | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `SUPABASE_URL`, `CAISSA_PUZZLE_WORKER_URL`, `CAISSA_BROWSER_ORIGINS` | `SUPABASE_SERVICE_ROLE_KEY`, `CAISSA_PUZZLE_WORKER_TOKEN` |

All variables added during this audit are limited to Preview and to
`feature/caissa-home-season-2026-10-01`. The publishable Clerk key on the CAISSA
branch exactly matches TVLavin's Preview publishable key. The readable Supabase
and worker URLs also match the already-authorized Puzzles Preview configuration.
The Clerk secret/public-key pairing must still be confirmed by a successful
authenticated runtime request after the missing secret is entered through
Vercel's secure project settings; it cannot be proven by reading a Secret value.

The read-only certification path uses `CLERK_SECRET_KEY`, `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`. `CAISSA_PUZZLE_WORKER_URL` and
`CAISSA_PUZZLE_WORKER_TOKEN` are needed only by the existing progress write
contract and were not invoked. The source Puzzles Preview loaded its real catalog
and returned puzzle `eHm3M` with puzzle rating 1805, confirming its worker-side
Preview configuration without solving a puzzle or changing progress. That source
hostname has an independent Clerk session and therefore remained a guest; the
authenticated Alexander session remains active on the target CAISSA Preview.
The target cannot yet produce the required API → Puzzles → Home value comparison
because its authenticated progress request still fails before the Supabase read.

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

No remaining regressions were found in the scoped routing, auth, navigation,
desktop/mobile or console suites.

## Release pendings

- In Vercel project `caissa-chess`, securely add `CLERK_SECRET_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` and `CAISSA_PUZZLE_WORKER_TOKEN` to Preview for
  branch `feature/caissa-home-season-2026-10-01`. The Clerk secret must belong to
  the same instance as the existing `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.
- In Vercel project `tv-lavin-chess-game2`, securely add
  `SUPABASE_SERVICE_ROLE_KEY` and `CAISSA_PUZZLE_WORKER_TOKEN` to Preview for the
  same branch. Use the projects' existing authorized Puzzles Preview credentials;
  do not send them through chat and do not change Production.
- Redeploy both Previews after those secrets are entered, then use the existing
  Alexander session to compare the read-only `/api/puzzles/progress` response
  against Puzzles and Home across reload and Home → Puzzles → Home navigation.
- Exercise the cached-308 recovery note in at least one previously used browser
  profile before production authorization.
- Review the Vercel preview deployment and screenshots.
- Keep PR #40 in draft. Do not merge or promote to production until Alexander gives
  explicit release authorization.

