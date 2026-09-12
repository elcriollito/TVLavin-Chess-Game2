# CAISSA Board Persistent Renderer Foundation

Status: foundation only; no product surface is migrated.

## Ownership boundary

`CaissaBoardAdapter` is the stable feature-facing API. `CaissaPersistentRenderer`
owns only DOM presentation, board-local focus, board-local selection feedback,
animations, and normalized input intent. It does not own chess legality, game
state, move history, PGN, FEN/session policy, clocks, engines, results, or any
network protocol.

A feature supplies every canonical position and decides whether a normalized
move attempt is accepted. A rejected or unanswered drag returns to the last
rendered canonical position.

## Persistent identity

The renderer creates one board root, 64 square buttons, 64 highlight cells,
piece nodes, coordinate labels, and stable overlay layers. Normal moves update
only affected piece nodes and accessibility labels. Identical piece placement
causes no DOM writes.

Initial renderer-local identities are deterministic by piece code and canonical
square order. Arbitrary FEN jumps preserve exact square/code matches first, then
deterministically pair remaining same-code pieces by shortest board distance,
canonical source order, and internal ID. This preserves as much identity as the
two snapshots truthfully permit without claiming missing chess history.

Semantic moves preserve mover identity for quiet moves and captures, preserve
both king and rook for castling, remove the captured pawn for en passant, and
intentionally replace a promoting pawn with a new promoted-piece identity.

## Update and animation model

Piece location uses percentage CSS transforms. Unaffected pieces are not moved
or recreated. A new canonical update cancels stale browser animations before it
applies the latest target. There are no correctness callbacks based on timers.

Optional requestAnimationFrame coalescing is limited to renderer presentation:
the most recent requested FEN wins. It is off by default so move-by-move replay
does not skip visual states. The adapter exposes `flushPending()` for controlled
test and integration boundaries.

Reduced motion is detected through `prefers-reduced-motion` or an explicit
renderer option. It disables transitions while retaining the same incremental
DOM reconciliation and final state.

## Input and accessibility

Pointer input owns tap and drag gestures only within the board. Piece images are
non-draggable, non-selectable, and protected from iOS callouts. The board blocks
pan only on its own surface; the rest of the page remains scrollable.

The root is an accessible grid with a supplied name, orientation and interaction
description. Every square has an orientation-aware label. A single board focus
uses `aria-activedescendant`; arrows navigate, Enter/Space selects or requests a
move, and Escape cancels. Selection is represented by both ARIA state and a
high-contrast outlined overlay, not color alone.

## Pilot boundary

The recommended first integration is a read-only replay/Observe-like simulation
that can compare canonical snapshots and renderer output without risking move
submission. Product migration is deliberately outside BOARD-005.
