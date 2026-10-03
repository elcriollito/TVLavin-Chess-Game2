# CAISSA Quiet Drag Phase 2B — Yahoo Classic Audit

## Scope and baseline

This audit covers only `/yahoo-classic`, specifically the CAISSA Lobby and Tournament Hall views. The canonical contract is `docs/standards/CAISSA_QUIET_DRAG.md`; the approved implementation reference is FICS Play PR #37 at `08dfb3bd113ee58ed117996f02cbb591e4d69a1a`. The rejected `24dc9c4` candidate was not used.

## YAHOO DRAG PIPELINE

- `YahooClassicSection.initClassicBoard()` creates one Yahoo-owned Chessboard.js instance in `#ycClassicBoard` with `draggable: true`.
- Before Phase 2B, Chessboard.js owned mouse/touch pickup, movement, clone rendering, `left`/`top` writes, and animated drop. Yahoo supplied `handleClassicDragStart`, `handleClassicDrop`, and `handleClassicSnapEnd` callbacks.
- Yahoo does not own chess legality or protocol semantics. Its callbacks delegate to `window.CaissaFICSClient.onDragStart`, `.onDrop`, and `.onSnapEnd`.
- Before Phase 2B, Yahoo mirrored `pendingMove.optimisticFen` with `board.position(optimisticFen, true)`, which enabled the vendor animation path.
- FICS owns the promotion intent and Q/R/B/N completion methods. Yahoo previously invoked that flow indirectly, but the FICS selector lived in the hidden FICS surface and was not a reliable visible Yahoo control.
- The FICS client already owns tap-to-move semantics through `handleBoardTap`; Yahoo had no board-local pointer/tap bridge to it.

## DROP OWNER

`CaissaFICSClient.onDrop` remains the sole drop/gameplay owner. It validates against the current authoritative FEN, creates `pendingMove`, sends one move on success, or opens the existing promotion state. Yahoo only projects the optimistic FEN into its own board. Phase 2B passes the adapter's `{ caissaQuietDrag: true }` marker through unchanged and uses a non-animated Yahoo projection.

No networking, clocks, pending-move state, game state, FEN parsing, legality checks, or command submission belongs to the pointer-movement path.

## BOARD LIFECYCLE

- Creation: lazy, when a table is open and the Yahoo section is active.
- Updates: the same board instance receives orientation and non-animated FEN updates while the table remains open.
- Table close/disconnect: Phase 2B destroys the Yahoo board, adapter, pending rAF, and the Chessboard.js handlers owned by that instance.
- Section exit: Phase 2B performs the same teardown; re-entry recreates from current FICS state.
- Room switching while a table is open does not recreate the board. The same board and adapter remain mounted.
- Adapter loading is asynchronous and teardown-safe: a destroyed board cannot receive a late adapter instance.

## ROOM DIFFERENCES

- CAISSA Lobby renders live FICS tables/seeks and permits watch/join actions through the existing client.
- Tournament Hall is a presentation-only shell over the same lobby/session state; it has no separate tournament backend, board, game state, or drag implementation.
- Switching between the two rooms changes room presentation only. An already open game window, board instance, FICS game ID, relation, ownership, clocks, and orientation remain unchanged.

## Orientation, input, promotion, and cleanup

- Orientation is derived from `CaissaFICSClient.myColor`, falling back to Yahoo's mirrored `liveGame.userColor`; Chessboard.js normalizes `w`/`b` aliases.
- Quiet Drag uses the approved shared `CaissaLegacyQuietDragAdapter`. Yahoo's wrapper only captures the Chessboard.js handlers created by its own instance, detaches/restores them for the localhost A/B lab, and delegates callbacks.
- Pointer/touch drag and click-to-move use the shared pointer controller. Tap semantics delegate to `CaissaFICSClient.handleBoardTap`.
- Promotion state and move submission remain FICS-owned. Yahoo supplies a visible selector bound to the existing Q/R/B/N completion and cancel methods.
- Listener ownership is instance-scoped. Destroy removes the five adapter pointer listeners, blockers, pending rAF, adapter presentation state, and all captured vendor bindings.
