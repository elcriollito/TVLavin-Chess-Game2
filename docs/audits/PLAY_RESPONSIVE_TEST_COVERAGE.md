# Simplified Play Responsive Test Coverage

Manifest version: 1.0.0

Audit date: 2026-07-30
Scope: QA-only Simplified Play and its connected test workflows

## Ownership and decision

The Simplified Play shell owns responsive layout through
`CaissaSimplifiedPlayShell.selectLayoutMode` and `calculateGeometry`. Its seven
layout states are `phone-compact`, `phone-standard`, `phone-landscape`,
`tablet-portrait-stacked`, `tablet-landscape-split`, `desktop-split`, and
`constrained-height`. Browser tests own rendered geometry, reachability,
orientation transitions, accessibility, and cross-engine behavior. Unit tests
own the immutable profile schema and geometry-predicate boundaries. Physical
devices own safe areas, browser chrome, keyboards, touch latency, and real
orientation performance.

No production CSS was changed. The audit found duplicated viewport arrays and
fragmented workflow checks, but no reproducible overflow or clipping defect.
The consolidation therefore adds shared test contracts and evidence rather
than changing product layout.

## Existing coverage audit

| Surface | Viewport/layout coverage before consolidation | Classification | Overflow risk | Focus risk | Final owner |
|---|---|---|---|---|---|
| Shell/board/rail/clocks | Nine required sizes in `play-responsive.spec.js` and `play-simplified-shell.spec.js` | duplicated, partial cross-browser | Medium at short landscape | Medium at document/panel scroll handoff | consolidated profile matrix |
| Mobile shell/drawer/modals/promotion | 320–1024 in `play-simplified-shell-mobile.spec.js` | complete Chromium, physical-device pending | Medium | Medium for drawer restoration | existing exhaustive spec plus transition gate |
| Games | scattered shell and Games specs | duplicated | Low | Low | consolidated workflow gate |
| Bots | eight-size feature spec | partial | Medium after lazy mount | Low | feature spec plus consolidated lazy-mode gate |
| Coach | eight-size feature spec | partial | Medium after lazy mount | Low | feature spec plus consolidated lazy-mode gate |
| Players | eight-size feature spec and accessibility checks | partial, QA-only | Medium for long rows | Medium for row actions | feature spec plus consolidated blocked-state gate |
| PostGame | eight-size feature matrix | complete Chromium, representative cross-browser missing | Medium for action grid | Medium | consolidated cross-browser workflow gate |
| Mentor Summary / Guided Replay | eight-size bounds inside `play-guided-replay.spec.js` | complete Chromium, manual instructional review | Medium for long explanation text | Medium for modal/view restoration | existing semantic/geometry spec |
| Promotion | mobile-shell behavior, no representative cross-browser geometry | partial | High in short landscape | Medium dialog focus | consolidated cross-browser fit check |
| Themes/accessibility | nine-size theme/identity/component specs and Axe | duplicated, visual plus semantic | Low | Medium in forced colors | existing exhaustive specs plus consolidated Axe |
| Lazy loading/layout stability | feature loading specs and performance observers | partial responsive coupling | Medium on panel replacement | Low | consolidated mode-load geometry plus performance spec |
| Help/Settings/About/mobile drawer | mobile-shell and accessibility specs | partial/manual browser chrome | Medium at 320px | Medium | existing exhaustive spec; physical-device pending |

## Responsive CSS boundary audit

Simplified Play-specific boundaries are scoped under
`body.caissa-simplified-play-active` in `css/play-simplified-shell.css`,
`css/play-visual-components.css`, and `css/play-visual-tokens.css`. The shell
mostly uses `data-layout` rather than media-query ownership. Relevant media
queries are 359px compact adjustments, 600px panel adjustments, 42rem visual
component stacking, reduced motion, and forced colors. Legacy `styles.css`
contains overlapping 480/768/900/950/1024/1050/1180/1200 boundaries, but the
QA shell scopes and relocates its authoritative board stage.

Risks audited:

- Breakpoint adjacency at 359/360, 600/601, 768/769, 900/901, 932/933,
  1180/1181, and height 620/621 is deterministic in the shell classifier.
- Short landscape is panel-owned scrolling; portrait is document-owned
  scrolling. The new tests reject horizontal overflow and unexpected board
  clipping without applying blanket clipping.
- Lazy panels can increase document or context height but do not alter board
  identity or width.
- The inactive shell footer is intentionally hidden; the active panel CTA is
  the reachability authority.
- No CSS conflict justified a production change in this task.

## Profile manifest

All automated profiles use device scale 1. `reflow-640x720` represents the CSS
viewport produced by a 1280px-wide surface at 200% browser zoom; it is a reflow
test, not a claim that Playwright emulates every browser zoom implementation.

| Profile ID | Dimensions | Orientation | Zoom/reflow | Expected layout | Surfaces | Scroll/focus expectation | Browsers | Test references | Device dependency | Status |
|---|---:|---|---|---|---|---|---|---|---|---|
| mobile-320x568 | 320×568 | portrait | normal | phone-compact | shell, Games | document scroll; board then tabs/panel/CTA | C/F/W representative policy: C full | consolidation, mobile shell | real phone/safe area | complete |
| mobile-375x667 | 375×667 | portrait | normal | phone-standard | shell, Games, PostGame, promotion | document scroll; focused CTA visible | C/F/W | consolidation, workflows | real phone/safe area | complete |
| mobile-390x844 | 390×844 | portrait | normal | phone-standard | all modes, Mentor/Replay | document scroll; lazy panel bounded | C/F/W | consolidation, workflows, Guided Replay | real phone/safe area | complete |
| mobile-412x915 | 412×915 | portrait | normal | phone-standard | shell, Games | document scroll | C full | consolidation, mobile shell | real Android/iOS | complete |
| tablet-768x1024 | 768×1024 | portrait | normal | tablet-portrait-stacked | shell, PostGame, Mentor/Replay | document scroll; board-first | C/F/W | consolidation, workflows | real tablet | complete |
| tablet-1024x768 | 1024×768 | landscape | normal | tablet-landscape-split | shell, PostGame, promotion | panel scroll; CTA visible | C/F/W | consolidation, workflows, transitions | real tablet | complete |
| desktop-1366x768 | 1366×768 | landscape | normal | desktop-split | shell, Games | panel scroll; bounded board | C full | consolidation | none | complete |
| desktop-1440x900 | 1440×900 | landscape | normal | desktop-split | shell, PostGame, Mentor/Replay | panel scroll; readable action region | C/F/W | consolidation, workflows | none | complete |
| desktop-1920x1080 | 1920×1080 | landscape | normal | desktop-split | shell, Games | board max bounded; panel readable | C full | consolidation | none | complete |
| reflow-640x720 | 640×720 | portrait | 200% equivalent | tablet-portrait-stacked | shell, Games, PostGame, promotion | document reflow; no horizontal scroll | C full; transition on C/F/W | consolidation, transitions | real browser zoom/text scale | complete |
| phone-landscape-667x375 | 667×375 | landscape | normal | phone-landscape | shell, Games, promotion | panel scroll; board nonzero | C full | consolidation | real phone chrome | complete |
| phone-landscape-844x390 | 844×390 | landscape | normal | phone-landscape | shell, Games, PostGame | panel scroll; no double-scroll assertion | C full; transition on C/F/W | consolidation, transitions | real orientation performance | complete |
| phone-landscape-915x412 | 915×412 | landscape | normal | phone-landscape | shell, Games | panel scroll | C full | consolidation | real phone chrome | complete |
| constrained-1366x600 | 1366×600 | landscape | normal | constrained-height | shell, Games, PostGame | panel scroll; CTA reachable | C full | consolidation | none | complete |
| split-1200x800 | 1200×800 | landscape | normal | desktop-split | shell, Games, Players | panel scroll; Players remains blocked | C full | consolidation, workflows | OS window snapping manual | complete |

`C/F/W` means Chromium, Firefox, and WebKit. Chromium owns the complete catalog.
Firefox and WebKit own 375×667, 390×844, 768×1024, 1024×768, and 1440×900.

## Test architecture

- `tests/browser/fixtures/play-responsive-profiles.js` is a frozen, versioned,
  test-only catalog with unique IDs, fixed dimensions, expected shell modes,
  and surface ownership.
- `tests/browser/helpers/play-responsive-geometry.js` provides narrow
  predicates and one DOM collector for nonzero size, viewport/parent bounds,
  board aspect, overflow, rail overlap, CTA/focus visibility, and scroll
  ownership.
- Horizontal and aspect tolerances are two CSS pixels. The only accepted helper
  tolerance range is zero through four CSS pixels, accommodating subpixel
  rounding without concealing meaningful clipping.
- `responsive-profile-contract.test.js` tests schema, IDs, dimensions,
  immutability, browser selection, helper behavior, tolerance rejection, and
  production-entry leakage.
- Screenshots are not used. Geometry and semantic assertions are authoritative,
  so screenshot overhead is zero.

## Workflow and invariant ownership

The consolidated workflow spec proves Games, Bots, Coach, and production-blocked
Players remain reachable after lazy loading at the five cross-browser profiles.
It proves PostGame and promotion dialog geometry at the same profiles. Existing
feature specs remain authoritative for terminal variants, Mentor request and
Summary, Guided Replay, modal/drawer behavior, themes, forced colors, reduced
motion, and loading/error states.

Across profile changes the gate asserts one primary board, one Play Worker, two
live regions, no scoped timers or observers, stable listener count, stable
board adapter and lifecycle identity, unchanged FEN/history/clocks, retained
focus, and retained active mode. FairPlay and active-game ownership are not
modified by responsive code.

## Manual and physical-device boundary

Automated status does not certify real iPhone Safari, Android Chrome, iPad,
notches, home indicators, dynamic browser bars, OS safe areas, pinch zoom,
virtual keyboards, hardware touch latency, physical orientation performance,
screen readers, or user text-scaling preferences. Those remain
`physical-device` or `manual-only` gates for Season 10.12.5. Simplified Play
remains QA-only and Players remains production-blocked.
