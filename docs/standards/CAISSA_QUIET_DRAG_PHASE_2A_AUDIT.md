# CAISSA Quiet Drag Phase 2A — Legacy board audit

Status: FICS Play certified implementation; all other legacy consumers remain audit-only.

Normative interaction contract: [`CAISSA_QUIET_DRAG.md`](./CAISSA_QUIET_DRAG.md).

## Shared legacy pipeline

The site-wide vendor is `assets/vendor/chessboard.js/chessboard-1.0.0.min.js` (Chessboard.js 1.0.0). Its drag path is delegated `mousedown`/`touchstart`, global `mousemove`/`touchmove`, a timer throttle, and repeated jQuery `.css({ left, top })` writes to a body-level floating image. Square geometry is read with jQuery `offset()` when the drag starts. Drop delegates to the consumer callback and then runs the vendor snap animation.

The vendor file remains unchanged. `CaissaLegacyQuietDragAdapter` suppresses only the vendor drag start while enabled, then uses the existing product callbacks for drag permission, drop authority, and snap reconciliation.

## Consumer inventory

| Surface | Board implementation | Existing drag/drop owner | Special behavior | Phase 2A readiness | Notes |
| --- | --- | --- | --- | --- | --- |
| FICS Play (`/fics`) | Chessboard.js 1.0.0 legacy renderer | `CaissaFICSClient.onDragStart/onDrop/onSnapEnd` | Q/R/B/N promotion selector; castling, en passant and captures through existing `Chess` validation; dynamic orientation; pendingMove/Style12 authority | **Certified in Phase 2A** | Adapter active only for `gameActive && !observedGame && relation === 1`. Observe keeps the persistent read-only renderer. |
| Engine Arena live board (`/arena`) | Chessboard.js 1.0.0 | None; `draggable: false` | Engine-only position projection and orientation flip | **Not applicable** | No user drag to migrate. |
| Engine Arena Setup Position | Chessboard.js 1.0.0 | Arena manual-setup callbacks | Arbitrary piece relocation/removal, palette insertion, castling-right/FEN editing | **Needs dedicated certification** | Candidate only for the setup editor; semantics are position editing, not legal chess moves. |
| Yahoo Classic | Chessboard.js 1.0.0 | Yahoo shell delegates to `CaissaFICSClient` callbacks | FICS pending move/promotion behavior, optimistic position and dynamic orientation | **Ready after lifecycle audit** | Closest next consumer, but its independently-created board needs the same explicit listener ownership/cleanup contract before activation. |
| Position Forge | Chessboard.js 1.0.0 | None; `draggable: false` | FEN transformations and board rebuilds | **Not applicable** | Current board is presentation-only. Do not add drag as part of Quiet Drag migration. |
| Opening Database | Chessboard.js 1.0.0 | Local `Chess` state in `opening-database.js` | Captures, castling and en passant; promotion currently hard-coded to queen; orientation flip | **Technically suitable, not yet certified** | Include in Phase 2 only as its own step after promotion and lifecycle expectations are made explicit. No network authority is involved. |

## Phase 2A ownership boundary

- Pointer controller: pointer events, pointer capture, exact grab offset, cached geometry, cancellation and listener lifecycle.
- Drag scheduler: latest coordinate only, one `requestAnimationFrame`, at most one `translate3d` movement write per frame.
- Drop resolver: target square from cached board geometry and current orientation.
- FICS remains the sole owner of legality, promotion, `pendingMove`, `sendMove`, game identity, clocks, Style12 reconciliation and reconnect behavior.

There is no state, networking, clock, parser or reconciliation work in `pointermove`.

## Recommended rollout order

1. FICS Play — Phase 2A certified.
2. Yahoo Classic — shared FICS move semantics, after explicit board/listener lifecycle hardening.
3. Arena Setup Position — separate editor-specific drop contract and off-board removal certification.
4. Opening Database — include in Phase 2 after promotion policy and board lifecycle tests are explicit.
5. Arena live board and Position Forge — no migration while they remain read-only.
