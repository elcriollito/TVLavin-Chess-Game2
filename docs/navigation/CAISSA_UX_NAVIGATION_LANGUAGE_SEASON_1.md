# CAISSA UX Navigation & Language — Season 1

Branch: `work/caissa-ux-navigation-language-s1`

Protected baseline: `ae47d59cb69e18c109577674479d3693cfd77775`

Audit checkpoint: `UX-001`

## UX-001 — real navigation audit

This audit describes the checked-in application at the protected baseline. It does
not redefine routes or authorize visual changes. The existing generated public
route inventory remains authoritative for route additions, removals, redirects,
and ordering.

### Documentation and source reviewed

- `README.md`, `PROJECT_ARCHITECTURE.md`, and `docs/CURRENT_PROJECT_STATE.md`
- `docs/architecture/CAISSA_WORKSPACE_GUIDELINES.md`
- `docs/navigation/GLOBAL_SIDEBAR_ARCHITECTURE_AND_SURFACE_AUDIT.md`
- `docs/architecture/CAISSA_PUBLIC_ROUTE_AND_NAVIGATION_INVENTORY.md`
- `docs/architecture/HOTFIX_9_1_3_PERSISTENT_SIDEBAR_AND_NAVIGATION_INTEGRITY.md`
- `docs/ux/UX_DESIGN_STANDARDS.md`
- navigation, routing, shell, Play, Classic, and PGN Reader source and tests

No `AGENTS.md` is present at this baseline. A repository-wide tracked-text and
history search found no authoritative definition for this season's `UX-003`
through `UX-007`. Matches for `POSTGAME-UX-001` belong to a separate Play policy.

### Shell and component ownership

| Concern | Real owner | Notes |
| --- | --- | --- |
| Main application shell | `index.html` | Contains the application sidebar host, header, section panels, mobile toggle, and mobile quick actions. |
| Generated Play documents | `api/_lib/play-v2-public-beta-document.js` and Play build/release tooling | `/play`, `/play/games`, `/play/bots`, and `/play/coach` resolve through the Play route controller while retaining the shared application shell. Checked-in Play HTML documents are protected generated/QA surfaces. |
| Classic shell | `yahoo-classic.html`, generated from the application document by `scripts/build-yahoo-classic.mjs` | Uses the same application navigation host and controller; Classic room and board behavior remain page-owned. |
| Canonical visible navigation | `js/caissa-primary-navigation.js` | Immutable item order, group labels, labels, icons, destinations, renderers, adapters, and the shared drawer controller. |
| Application routing and shell state | `js/caissa-navigation.js` | Section selection, URL/history integration, active state, desktop collapse, mobile drawer, and board repositioning. |
| Standalone shell | `js/caissa-standalone-sidebar.js` | Renders account, premium, primary, connect, and support areas around the canonical inventory. |
| Trainer shell adapter | `js/endgame-trainer/endgame-trainer-page.js` | Uses the canonical trainer adapter and shared drawer controller while keeping its board-first layout. |
| Route contract | `js/play/play-route-controller.js`, `middleware.js`, `server.js`, and `vercel.json` | Own Play descendants, rewrites, redirects, and fail-closed behavior. |
| Generated route inventory | `config/caissa-public-route-inventory.json` and `docs/architecture/CAISSA_PUBLIC_ROUTE_AND_NAVIGATION_INVENTORY.md` | Built by `scripts/build-caissa-public-route-inventory.mjs`; it must be regenerated if destinations or order change. |

Desktop and mobile do not maintain separate destination arrays. Both consume
`CaissaPrimaryNavigation.inventory`. Desktop displays the left sidebar and may
collapse it. At `max-width: 768px`, the same sidebar becomes an off-canvas drawer
controlled by `createDrawerController`; the application, standalone, and trainer
hosts use shell-specific open classes and backdrops. The application also owns a
separate five-button mobile chess-action bar; it is contextual game control, not
global navigation.

### Current navigation map

The canonical visible order is:

1. **Play & Compete:** Play (`/play`), CAISSA Classic (`/yahoo-classic`), FICS
   (`/fics`), Playchess (`/play-online/playchess`), Fritz
   (`/play-online/fritz`).
2. **Learn & Improve:** Tactics (`/puzzles/chessbase-tactics`), Interactive
   Diagrams (`/learn/interactive-diagrams`), Academy (`/academy`), Endgame
   Trainer (`/endgame-trainer`), Endgame Practice (`/endgame-practice`), Endgame
   Library (`/endgame-library`).
3. **Analyze & Watch:** Insights (`/insights`), Analyze (`/analyze`), CAISSA PGN
   Reader (`/pgn-replayer`), Spectator TV (`/spectator-tv`), Lichess TV
   (`/watch/lichess-tv`), Live Blitz (`/watch/live-blitz`), Live Tournaments
   (`/watch/live-tournaments`), Lichess Broadcasts
   (`/watch/lichess-broadcasts`), Game Replayer (`/watch/game-replayer`), Arena
   (`/arena`).
4. **Tools:** Cheater Insight (`/cheater-insight`), Polyglot Tool
   (`/tools/polyglot`), Opening Database (`/opening-database`), ECO Codes
   (`/eco`), Game Library (`/game-library`), History (`/history`), DOS Chess
   (`/dos-chess`), Vault (`/vault`), Blog (`/blog`).
5. **Connect with CAISSA Chess:** Facebook, CAISSA Chess YouTube, CAISSA Discord,
   and the feedback email action.
6. **Support:** Help (`/help`) and About (`/about`).

Visible shell destinations outside the primary inventory include Sign In,
Account/Sign Out when authenticated, Premium, and the Play child routes Games,
Bots, and Coach. The complete current contract contains 30 internal primary
pages, 4 external primary destinations, 14 public canonical routes outside the
primary list, 8 redirects, and 5 protected route families; see the generated
public route inventory for the exhaustive table.

### Labels, icon-only states, and accessibility

- Every canonical navigation destination already has a visible `.nav-label` and
  matching `aria-label` when the sidebar is expanded.
- Group headings, Connect, Support, account, sign-in, premium, and collapse/drawer
  actions already have visible text or accessible names.
- Desktop's explicitly collapsed sidebar hides `.nav-label`, group headings,
  account details, badges, and external indicators, leaving destination icons and
  accessible names. The collapse control itself is icon-only with a changing
  accessible name.
- Mobile initially exposes only the hamburger toggle. Opening the drawer restores
  destination labels, group headings, account details, and badges even if the
  standalone shell had previously been collapsed.
- The five mobile chess quick actions combine icons, visible short labels, and
  `aria-label` values. They are not global destinations.
- No navigation meaning is stored in an icon: item IDs, routes/sections, active
  state, and labels remain explicit data.

### Existing language support

There is no global UI language selector, navigation message catalog, locale
helper, or persisted UI locale at the protected baseline. Application documents
declare English metadata and English visible strings. PGN Reader uses
`localStorage` for reader state but not language. Knowledge-unit localization is
domain content infrastructure and must not be reused as a shell preference
store. Locale-aware string comparison and number formatting elsewhere are not a
UI locale system.

Consequently UX-002 should introduce one small shell-level EN/ES catalog and
preference API, default/fallback to English, and reuse the canonical navigation
render path. It must not translate routes, IDs, chess records, engine commands,
or protected feature logic.

### Protected-surface impact

- **CAISSA Classic:** the shared application sidebar and route activation touch
  Classic superficially. Room tabs, FICS commands, board, lobby, sound, and game
  behavior are independent and out of scope.
- **Play / Games / Bots / Coach:** global navigation and Play route activation
  are shared. Game lifecycle, board adapters, workers, engines, Coach policy,
  entitlement, records, and child-route behavior are out of scope.
- **CAISSA PGN Reader:** its page uses the standalone sidebar. PGN parsing,
  storage, albums, notation, analysis, Mentor, and board behavior are independent
  and out of scope.

### UX-002 candidate files

Minimum safe implementation candidates:

- a new shared locale/catalog module under `js/`;
- `js/caissa-primary-navigation.js` for translated presentation labels and shared
  drawer strings without changing stable item IDs or destinations;
- `js/caissa-standalone-sidebar.js` for shell-only account, premium, support, and
  language-control presentation;
- `index.html` plus its existing deterministic generated derivatives only if a
  common application-shell mount or script include is required;
- navigation/localization unit tests and focused browser tests;
- `package.json` only if focused test/lint commands are added.

Files that should not be changed for UX-002 include board, engine, PGN parser,
Play lifecycle, authentication, economy, backend, Supabase, and API business
logic. The public route inventory must remain byte-for-byte unchanged unless the
work unexpectedly changes a destination, redirect, or order.

### Risks and controls

| Risk | Control |
| --- | --- |
| Translating a label accidentally changes routing or active state | Keep stable item IDs, sections, routes, and `data-nav-key`; translate only catalog-backed presentation. |
| Static fallback and runtime navigation disagree | Keep English as the no-JavaScript fallback and make the runtime renderer authoritative, as today; verify generated fallback guards. |
| Missing storage or a malformed saved preference breaks startup | Wrap persistence access, normalize supported locales, and fall back to English. |
| A locale change requires a reload or duplicates event handlers | Re-render only shared shell hosts and dispatch one bounded locale-change event. |
| Spanish strings overflow the compact sidebar/mobile drawer | Preserve current dimensions and verify desktop expanded/collapsed plus 320–390 px portrait drawer behavior. |
| Re-rendering loses active route or drawer accessibility | Preserve active keys, `aria-current`, focus handling, and controller ownership in tests. |
| Generated Play/Classic artifacts drift | Use existing builders/checks; do not hand-edit protected generated documents without their owner workflow. |

### UX-001 conclusion

No structural code preparation is necessary. The repository already has the
single navigation inventory, three explicit shell adapters, shared desktop/mobile
destination data, and deterministic route validation required for UX-002. UX-001
therefore changes no production behavior. Its only test change updates the
browser assertion from obsolete contract `1.9.0` to the runtime's already
released `1.12.0`; focused tests establish that routing and runtime behavior are
unchanged.

## UX-002 — internationalization foundation

`CaissaI18nFoundation@1.0.0` is a small browser-side presentation service loaded
before the canonical navigation owner. It provides locale normalization,
semantic-key catalogs, per-key English fallback, locale subscriptions, safe DOM
translation attributes, explicit preference persistence, browser-language
detection, and native-language metadata. It does not own routes or business
logic.

### Locale policy

- Supported locale metadata: `en`, `es`, `ru`, `hi`, `de`, `pt`, and `fr`.
- Publicly enabled locales in UX-002: `en` and `es` only.
- Future locale names are stored as Unicode native names. Disabled locales never
  appear in the public selector.
- Locale tags normalize to their base language for current matching (`es-MX` to
  `es`, for example), while the input remains suitable for future variant-aware
  policy.

The implemented precedence is explicit local preference, then browser language,
then English fallback. The current account/profile model has no locale
preference, so no false profile integration or backend migration was added.
There is also no existing safe regional locale signal in the CAISSA client shell;
UX-002 performs no GeoIP request, GPS access, IP storage, fingerprinting, or
regional logging.

Browser detection is advisory on a first visit. English remains the initial UI.
When the best enabled browser language is Spanish, the selector shows a compact
`🌐 Español` suggestion. Accepting it changes the shared shell immediately and
persists `es` under the encapsulated `caissa.locale` key. A later explicit
English choice remains authoritative even under a Spanish browser.

### Presentation boundary

The shared navigation renders translated labels and accessible names while its
English inventory labels, IDs, routes, sections, order, and active-state keys
remain unchanged. The application, standalone, and trainer adapters use the same
catalog and N-language selector. Safe shell strings cover navigation headings,
drawer/collapse controls, sign-in/account actions, Premium, support, and the
mobile section name. Individual page bodies, chess data, Play behavior, PGN
content, engines, authentication, economy, APIs, and backend remain out of scope.

The application is static client-rendered HTML rather than an SSR/hydration
framework. English fallback markup remains immediately usable; the locale module
runs synchronously before navigation rendering, avoiding a translated-navigation
flash for a stored preference without adding fragile boot complexity.

### Extension rule

Adding a locale requires approved catalog coverage and changing its metadata to
enabled. The selector derives options from enabled metadata and displays each
language in its own language; it is not an EN/ES toggle. Missing selected-locale
keys resolve to English, then a caller-supplied safe fallback, then an empty
string—never a technical key or JavaScript sentinel.

### Verification record

Passing UX-002 gates:

- i18n syntax and unit suite: 11/11;
- navigation integrity unit suite: 8/8;
- integrated navigation/i18n/surface browser suite: 23/23;
- focused i18n browser suite after final generation: 5/5;
- Classic SEO and application-preservation suite: 8/8;
- public release audit: PASS (1,122 committed files and 18 required paths);
- deterministic navigation fallback and 61-record route inventory checks: PASS;
- focused Play routing plus PGN core, Worker, opening-library, and commerce
  behavior: 38/40, with the two failures described below;
- focused PGN Reader and Play browser run: 7/10, with the three failures
  described below.

The broader protected-surface runs exposed baseline test debt unrelated to the
i18n diff: a POSIX-only assertion against Windows private PGN paths; PGN browser
assertions that assume a single NAG and an Aug 22 catalog date while the released
surface has two NAGs and an Aug 23 date; and the pre-existing Play Resign-button
contrast violation. A vendored Stockfish text-file hash also differs after Git's
Windows line-ending conversion. The PGN page additionally makes its existing
optional `/api/pgn/opening` request, which returns 404 in the local server; the
i18n console gate permits only that known request and rejects all other console
or page errors. No affected engine, PGN, Play lifecycle, or commercial source was
changed to force these unrelated tests to pass.

## UX-003 and UX-004 continuation audit

UX-003 makes the existing N-language control visually recognizable as
`🌐 Language` / `🌐 Idioma`, preserves native option names, and raises mobile
selector and suggestion targets to 44 px. Focus-visible, accessible naming,
selected-state, keyboard, desktop containment, and mobile behavior have focused
browser coverage.

UX-004 required no second detection service. The UX-002 service already keeps
browser detection advisory, persists explicit selection, suppresses future
suggestions after either English or Spanish is chosen, ignores disabled/unknown
browser locales, and performs no regional request or tracking. Focused tests now
certify the requested Spanish variants and the complete first-visit/reload flow.
There is no account locale field or safe regional signal in the current shell,
so those precedence slots remain intentionally inactive rather than simulated.
