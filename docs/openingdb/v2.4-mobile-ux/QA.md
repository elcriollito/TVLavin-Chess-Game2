# Opening Database V2.4 mobile UX recovery

Date: 2026-11-07

Branch: `hotfix/opening-database-v24-mobile-ux-20261107`

Production lock: no merge and no production deployment

## Baseline and parity

- GitHub `main`: commit `3197b5b3ccedeb3062e5d19827e99bdc9c5e5ef0`, tree `9d0833e03364038e3662faf6c3e805f14973e00a`.
- Authoritative production deployment: `dpl_9SsDLm35n5xsadWtWUUMzNoHtLmu`, built from the same baseline commit.
- Canonical start-position data, row ordering, totals, result percentages, and `v3_p60` version match production in Chromium and WebKit. The Firefox runner's localhost page cannot reliably reach the cross-origin download host; production uses the same-origin proxy, and Firefox functional tests use deterministic fixtures.
- No Opening Database data, API contract, engine ownership, notation, Games, Moves, or Analyzer behavior was replaced.

## Root causes

1. The shared pointer controller and adapter already exposed a tap callback, but Opening Database never supplied the product-level tap handler. A rejected drag start also discarded an occupied-square tap before the threshold decision.
2. Pickup read both board and piece geometry synchronously even though the piece rectangle is derivable from the cached board geometry.
3. Drop committed the canonical position and started Opening Database presentation/data work in the same paint opportunity, so a fast device could still show a post-drop hitch.
4. The sub-640px Explorer turned each continuation into a tall two-row card. The short-landscape override also forced fixed two-column minima after the shared sidebar had reduced available content width.

## Implementation

- Added tap selection, switch, deselect, legal-destination, capture, and single-commit behavior through the existing `applyBoardDrop` authority. Drag and tap share Chess.js state, promotion, notation, history, and lookup paths.
- Preserved short-tap eligibility when drag start rejects the touched piece; real drags still fail the existing threshold gate.
- Derived the piece rectangle from one cached board rectangle, reducing pickup geometry reads from two to one.
- Kept move-list and turn presentation synchronous, then deferred one position-view request through two animation frames so the canonical board can paint first. No chess or lookup work occurs during pointer movement.
- Replaced mobile cards with one compact semantic row per continuation in `Move → Games → W/D/L → Engine` order, with local table scrolling and 44px move controls.
- Kept short landscape in one bounded column when the shared sidebar reduces usable width.
- Added selected-square and legal-target cues without changing board colors, piece art, typography, or global branding.

## Performance evidence

Synthetic 24-pointer-event drag, Chromium, final branch:

| Metric | Legacy | Quiet V2.4 |
| --- | ---: | ---: |
| Pickup geometry reads | 66 | 1 |
| Move-path geometry reads | 0 | 0 |
| `left/top` writes | 24 | 0 |
| Layouts during movement | 23 | 0 |
| Movement CPU | 4.526 ms | 2.260 ms |
| Cursor lag | 10.976 px | 0 px |
| Pointer-to-piece visual | n/a | 0.800 ms |
| Drop-to-visible board | n/a | 1.400 ms |
| Drop-to-position request | n/a | 41.400 ms |
| Long tasks | 0 | 0 |
| Moves/lookups after drop | 1 / 1 | 1 / 1 |

The lookup delay is intentional paint separation, not duplicate work. Frame p95 was 16.8 ms.

## Verification

- Full Opening Database Playwright matrix: 131 passed, 7 intentional skips across Chromium, Firefox, and WebKit. Intentional skips are engine-specific mobile-device profiles, non-Chromium instrumentation, and Firefox's localhost cross-origin live-data probe.
- Focused Node integration/unit suite: 22 passed.
- Explicit device profiles: iPhone 13/WebKit and Pixel 7/Chromium passed portrait tap-to-move and compact-table acceptance; iPhone short landscape also passed.
- Viewports covered: 320, 360, 375, 390, 414, 640, 768, 1024, 1366, 1440, and 1920 widths, plus 844×390 landscape.
- Special moves covered through tap and drag: capture, castling, en passant, queen promotion, rejection, flip, takeback, FEN, and review isolation.
- Ten reset/recreate cycles retain stable handlers, animation frames, and references.
- Default surface reports no serious or critical axe violations; keyboard tab and move activation remain covered.

## Visual evidence

- [Before: stacked mobile cards](before-mobile-stacked-390.png)
- [After: compact 390px layout](after-mobile-compact-390.png)
- [Tap selection and legal destinations](tap-selection-390.png)
- [Completed tap move](tap-complete-390.png)
- [Short-landscape workspace](after-landscape-844x390.png)
- [Desktop 1440px sanity](after-desktop-1440.png)

## Human QA checklist

1. On a physical iPhone Safari and Android Chrome, tap `e2`, confirm `e3/e4` cues, then tap `e4`; repeat for Black.
2. Confirm drag, capture, castling, en passant, promotion, flip, takeback, FEN, and Moves review still commit exactly once.
3. At 320–414px, scan several rows and confirm Move, Games, W/D/L, and Engine remain associated and horizontally contained.
4. In short landscape, scroll from the board to the workspace and verify no clipped controls.
5. Exercise Popularity/Engine sorting, Fast/Pro evaluation, Games, Moves, and Analyzer handoff on the protected preview.
6. Confirm reduced-motion and high-contrast preferences remain usable.

Residual risk: browser device profiles cannot replace final physical iPhone and Android validation. Production remains unchanged until owner approval and merge.
