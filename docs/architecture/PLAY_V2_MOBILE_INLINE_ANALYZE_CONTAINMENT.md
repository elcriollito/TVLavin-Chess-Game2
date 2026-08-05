# Play v2 Mobile Inline Analyze Containment

Status: implemented locally; physical retest required

Issue: `IPH-11.8.1-008`

Observed baseline: `ac2eff4c737b0a614ef97fa34c1626d571441e3e`

## Physical finding

On an iPhone 17 Pro running iOS 26.6, opening **Analyze This Game** after a completed Play v2 game exposed the Analyze review board and substantial portions of the preserved gameplay board and PostGame surface at the same time. The Analyze surface exceeded the mobile viewport and placed **Back to game result** against or beyond the right boundary.

The supplied screenshot remains external evidence and is not copied into the repository. No unmeasured CSS dimensions are inferred from it.

## Root cause

Inline Analyze is a sibling of `#playSection` and correctly owns a separate analysis board. The completed Play game intentionally remains mounted for lossless return. The inline owner previously locked document scrolling but did not suppress or make the underlying Play owner inert, and its fixed overlay relied on layout-viewport geometry. Mobile landscape rules belonging to the standalone Analyze route also did not govern the inline owner.

## Containment contract

While inline Analyze is open:

- `#analyzeSection` is the sole visible and interactive board owner;
- the mounted `#playSection` is visually suppressed, `inert`, and `aria-hidden`;
- the overlay is sized and positioned from `visualViewport` when available;
- every grid owner may shrink to the available inline size without horizontal document overflow;
- the close action remains inside the visible viewport and the dialog retains Escape and Tab containment;
- Play game state, PostGame state, scroll position, and prior accessibility attributes remain restorable.

On close, Analyze lifecycle teardown runs before the exact prior Play accessibility state and scroll position are restored. No FICS, Players, educational-product, analytics, routing, or public-beta boundary changes are introduced.

## Acceptance

Automated acceptance covers narrow portrait, landscape, toolbar-shortened height, text zoom, and reduced-motion/forced-color conditions in Chromium and WebKit. It proves one visible board, no horizontal overflow, bounded controls, underlying-owner exclusion from focus and accessibility, stable Worker ownership, and exact return to PostGame.

Physical iPhone certification remains blocked until the same completed-game continuation is retested on the affected device.

## Independent WebKit contrast blocker

The containment regression matrix exposed an independent Games setup-summary defect. During a `system` theme transition to light colors combined with 200% zoom, WebKit retained the inherited dark-theme foreground `#f4f7fb` after the owning context had changed to the light panel `#e6ddcd`. The transparent summary therefore measured 1.25:1 instead of the required 4.5:1. No opacity, filter, blend mode, native appearance, or Analyze containment rule caused the mismatch.

The Games disclosure summary now owns an opaque theme card surface and explicit theme text color. Its value inherits no stale foreground, long summaries may wrap within the existing geometry, and forced-colors mode maps the surface, text, and border to `Canvas`, `CanvasText`, and `ButtonText`. This correction is isolated from Inline Analyze and does not change its board, viewport, focus, lifecycle, or restoration contract.
