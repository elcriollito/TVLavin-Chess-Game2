# HOME-001 — CAISSA Home integration certification

Release candidate prepared on 2026-10-01 from the approved design commit
`763613fd9639e0ca5068134d884a562fa2c9aca2`, rebased logically onto
`origin/main@35c467ac072c01a83d0dd6f1d055a73a9f5eb6e8`.

The approved visual direction remains intact: black surface, white knight,
high-contrast copy and distinct tool colors. CAISSA Chat remains a noninteractive
`Coming next` card.

## Routing decision

| Request | Integrated behavior |
| --- | --- |
| `/` | 200 Home through Vercel rewrite and local-server file mapping |
| `/?section=yahooClassic` | 308 to `/yahoo-classic` for the historical deep link |
| `/?action=help` | 308 to `/help` for the historical help entry |
| `/play` and `/play/*` | Existing Play ownership and fail-closed rules unchanged |
| `/home.html` | Direct Home document remains available as a cache-recovery URL |
| Tool-shell CAISSA brand | Returns to `/`; each tool's menu and board behavior remain unchanged |

The former permanent `/ -> /play` rule was removed. New root responses are
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

Sign-in and sign-up use `redirect_url=%2F`, which is accepted by the existing
internal-redirect sanitizer and returns the user to Home.

## Certification evidence

Automated:

- `npm run lint:home`: passed.
- `npm run test:home`: 63/63 passed.
- `npm run test:home:browser`: 4/4 passed in Chromium.
- Home plus shared-sidebar browser suite: 14/14 passed.
- Cross-route authentication plus historical canonical-route suite: 7/7 passed.
- API auth, registration sync, Play routing/auth and legacy canonical unit checks:
  36/36 relevant checks passed; the broader batch also exposed the pre-existing
  i18n consumer-order failure below.
- `git diff --check`: passed.

Browser coverage includes desktop 1440×1000 and mobile 390×844, white logo,
distinct tool colors, zero horizontal overflow, skip-link keyboard flow, clean
console, guest and authenticated account rendering, real/empty progress response
shapes, 30 route status checks and tool-to-Home navigation.

Screenshots:

- [Desktop](screenshots/home-desktop.png)
- [Mobile](screenshots/home-mobile.png)

## Baseline findings versus regressions

Pre-existing and outside HOME-001:

- `tests/i18n-foundation.test.js` reports that `pgn-replayer.html` loads the
  shared navigation owner before i18n. HOME-001 does not modify that page.
- `npm ci` reports 6 dependency advisories (3 moderate, 3 high). HOME-001 changes
  no dependency or lockfile.

Introduced regressions found: none in the scoped routing, auth, navigation,
desktop/mobile or console suites.

## Release pendings

- Validate a real signed-in Clerk session and its live Puzzles API response on the
  protected Vercel preview; automated certification used the production contracts
  with deterministic browser mocks.
- Exercise the cached-308 recovery note in at least one previously used browser
  profile before production authorization.
- Review the Vercel preview deployment and screenshots.
- Keep PR #40 in draft. Do not merge or promote to production until Alexander gives
  explicit release authorization.

