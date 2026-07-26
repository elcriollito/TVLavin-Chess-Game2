# Season 10.14.2 — Endgame Practice Sidebar Visual Polish

## Baseline and observed defect

The work began from clean `main` at
`60a5273dd3c5a54e84892c810ca4bd6c7a3b7821`, equal to `origin/main`.

Human production review showed that the Endgame Practice sidebar contained the
correct links but rendered their labels as compressed, visually concatenated
text. This was treated as a high visual-usability defect affecting orientation,
cognitive accessibility, and release quality even though structural overflow
and Axe tests had passed.

## Root cause and comparison

Endgame Practice was compared with the Endgame Library, Blog, and Polyglot
standalone shells. Those mature pages load `/styles.css` before the standalone
sidebar adapter. Endgame Practice loaded only the layout adapter and its
page-specific stylesheet.

The missing shared stylesheet owns the visual contract for
`.main-navigation`, `.nav-items`, `.nav-item`, authentication and premium
controls, padding, gaps, typography, hover, and active states. Without it, the
canonical renderer produced mostly inline, undecorated links. A second shared
interaction was found during responsive review: the application shell hides
`.nav-label` below 1200 px for its icon-only mode. The standalone adapter did
not override that application-specific rule consistently, so drawer labels
could disappear even after the base stylesheet was restored.

No initialization race or font failure caused the original defect. The
renderer and inventory were present and executed in the correct order.

## Solution

- Endgame Practice now loads the existing canonical `/styles.css` before the
  standalone adapter.
- The standalone adapter uses a 240 px desktop width, within the approved
  practical range, and keeps independent viewport-height scrolling.
- Standalone-only responsive rules preserve labels and left alignment below
  the application shell's 1200 px collapse breakpoint.
- Canonical group headings are opt-in and enabled only by the standalone
  renderer: Learning, Play & Watch, Tools & Databases, Community, and Support.
  The primary application renderer remains unchanged.
- Every navigation item is a flex row with at least a 44 px target, controlled
  wrapping, readable line height, and explicit active-state weight.
- Endgame Practice remains the only `aria-current="page"` item.
- Menu/close and collapse/expand controls use local CSS glyphs and do not
  require a new font or external asset.
- A small initial-HTML fallback offers separated core navigation links when
  JavaScript is delayed or disabled. The canonical renderer replaces it during
  normal initialization.
- The mobile drawer adds a backdrop, background scroll lock, Escape handling,
  focus return, bounded Tab traversal, and close-on-navigation behavior.

The approved Endgame Practice content, metadata, five exercises, release
boundary, endpoint, runtime, hints, feedback, and artifacts were not changed.
The two preview-limitation statements were retained because both originated in
the approved Season 10.14 copy contract; no speculative clarity edit was made.

## Visual and accessibility verification

Automated browser measurements confirmed that desktop navigation links occupy
distinct rows, use flex layout, have distinct vertical positions, and do not
overlap the main content. The sidebar measured 240 px and the main content
began after its right edge.

Local visual captures at 1440×900, 390×844 with the drawer open, and 200% zoom
were inspected. Desktop showed separated labels, visible group hierarchy, an
orange active indicator, and centered main content. Mobile showed a 280 px
overlay drawer, separated labels, visible active state, dimmed backdrop, and
full-width content behind it. Long labels wrap within their row rather than
merging with adjacent items.

The responsive matrix covered 320×568, 360×800, 390×844, 412×915, 768×1024,
820×1180, 1024×768, 1280×720, 1366×768, 1440×900, and 1920×1080. It found no
horizontal overflow or permanent mobile sidebar. System-font fallback,
reduced-motion, text-spacing, keyboard, no-JavaScript, focus, and 200% zoom
checks passed. Axe reported zero critical and zero serious violations.

Asset request and console monitoring found no local CSS or navigation-script
404, MIME mismatch, uncaught error, or navigation initialization error.

## Privacy, integrity, and release boundaries

The exercise transition remains full-page. Runtime Clarity suppression,
zero exercise analytics and telemetry, and zero exercise persistence remain
covered by the existing browser and regression suites. The operational kill
switch and `limited-preview` release boundary were not modified.

Versioned integrity tests retained the five-item run, historical run, source
artifacts, approvals, pools, Knowledge, packets, graphs, evidence, and manifest
identities. The public-release audit continued to exclude protected sources.
No IndexNow submission is required for this visual-only correction.

## Tests

- Focused shell, release, and navigation tests: 14 passed.
- Sidebar browser matrix: 15 passed across Chromium, Firefox, and WebKit.
- Combined shell, sidebar, and private runtime matrix: 45 passed.
- Canonical self-contained regression: 1,063 passed, zero failures.
- External WORKER_URL, local FICS, and opt-in live tablebase checks remained
  explicit separate skips.
- Curated pools, Knowledge reproducibility, public-release audit, syntax,
  navigation lint, Clarity lint, repository build, and Vercel build passed.

## Residual risk and deferred work

The sidebar adapter still depends on the broader historical `styles.css`
navigation contract; focused computed-style tests now guard the relevant
invariants. Visual review was point-in-time and does not claim perfection on
every device or operating-system font renderer.

The public canonical migration of Endgame Trainer to V2 is explicitly deferred
to:

**Season 10.15 — Endgame Trainer V2 Public Canonical Migration**
