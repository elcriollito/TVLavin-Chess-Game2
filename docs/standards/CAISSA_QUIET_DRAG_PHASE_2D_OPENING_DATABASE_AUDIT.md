# CAISSA Quiet Drag Phase 2D — Opening Database

## Status

Technical implementation and automated gates: PASS.

Release gate: PENDING HUMAN QA. The canonical standard requires a person to confirm the interaction feels silent, light, jitter-free, and immediate at `/opening-database?quiet-drag-lab=1` on localhost.

## Phase 1 audit

BOARD IMPLEMENTATION:

- Exact route: `/opening-database` and `/opening-database/`, served from `opening-database.html` by both `server.js` and `vercel.json`.
- Renderer: Chessboard.js 1.0.0 from `assets/vendor/chessboard.js/chessboard-1.0.0.min.js`.
- Page controller: classic-script IIFE in `js/opening-database.js`.
- Board creation: `Chessboard('openingDbBoard', config)`.
- Board destruction before this phase: only browser document teardown; no explicit board destruction.
- Board destruction after this phase: adapter destroy, owned global Chessboard.js input-handler removal, native `board.destroy()`, and state-reference clearing on page lifecycle or explicit local-lab recreation.

DRAG OWNER:

- Before: Chessboard.js `mousedown`/`mousemove` and touch handlers, hidden source piece, body-level drag image, repeated jQuery `left`/`top` writes, and animated vendor drop.
- Callbacks: `onDragStart` checked game-over/depth/turn ownership; `onDrop` called the local Chess.js move path; `onSnapEnd` reconciled the board to Chess.js FEN.
- After: `CaissaLegacyQuietDragAdapter` is the default input and visual owner. The integration captures the global handlers created by this board and detaches them while Quiet Drag is enabled. The handlers are restored only when the localhost lab selects Legacy Drag.
- Click-to-move: not implemented by the preexisting Opening Database board. This phase preserves that behavior and does not add a new interaction contract.

CHESS STATE OWNER:

- One local Chess.js 0.10.3 instance at `state.game`.
- `state.game` owns turn, legality, SAN history, castling rights, en-passant state, halfmove/fullmove data, and canonical FEN.
- Chessboard.js is a view projection updated from `state.game.fen()` with animation disabled.
- The move-list textarea is derived from `state.game.history()`.

OPENING QUERY OWNER:

- `updatePositionView(fen)` owns opening-name/ECO resolution, legal continuation merging, shard or Node API lookup, row rendering, status, and turn/ply projection.
- `state.positionRequestId` owns ordering. A completed older request cannot overwrite a newer position.
- Node API mode additionally aborts the prior request through `state.nodeApiController`.
- `state.lastResolvedFenKey` prevents duplicate same-FEN lookups unless a forced dataset refresh is requested.

PROMOTION CURRENT BEHAVIOR:

- Board drops unconditionally pass `promotion: 'q'` to Chess.js.
- There was no promotion modal.
- Phase 2D preserves automatic queen promotion for White and Black.
- Automated browser coverage confirms SAN contains `=Q`, the promoted piece is the correct-color queen, the resulting FEN is correct, and one opening refresh is requested.

LIFECYCLE:

- Before: one page-lifetime board; no explicit adapter or board cleanup.
- After: `destroyBoard()` cancels Quiet Drag, removes its five pointer listeners, cancels pending animation-frame work, removes owned Chessboard.js global input handlers, destroys the board, and clears references.
- The localhost lab exposes recreation only for QA. Ten reset/destroy/recreate cycles passed with zero listeners on old adapters, no pending frames, one QA panel, no visible body drag pieces, and five listeners on the current adapter.

## Adapter integration

The page imports `/js/board/caissa-legacy-quiet-drag-adapter.js`; it does not define or fork another drag engine. The adapter continues to use the shared `CaissaPointerController`, cached geometry, exact grab offset, pointer capture, latest-coordinate scheduling, one `translate3d` write per animation frame, original-piece rendering, and immediate cleanup.

The integration layer is limited to:

- delegating `onDragStart` and `onDrop` to the existing Opening Database chess callbacks;
- detaching/restoring only the Chessboard.js global handlers created by this board;
- projecting the accepted Chess.js FEN to Chessboard.js once without animation;
- lifecycle ownership; and
- local-lab metrics/snapshot access.

## State and query isolation proof

During pointer movement:

- Chess.js move applications: 0.
- FEN/history changes: 0.
- move-list writes: 0.
- opening-view requests: 0.
- geometry reads by the movement pipeline: 0.
- `left`/`top` writes: 0.
- jQuery animation calls: 0.

On a successful Quiet drop:

- Chess.js move applications: 1.
- Chessboard position writes: 1.
- move-list writes: 1, owned synchronously by `updatePositionView`.
- opening-view requests: 1.

The prior redundant direct move-list write before `updatePositionView` was removed. Request ordering and abort behavior remain owned by the existing explorer architecture.

## Special moves and navigation

Automated Chromium and WebKit coverage passes for:

- normal move and illegal-move rejection;
- capture;
- kingside castling, including rook projection;
- en passant, including captured-pawn removal;
- White and Black automatic queen promotion with SAN/FEN checks;
- Black board orientation;
- touch-style Pointer Events;
- start-position reset;
- takeback and FEN projection contracts;
- explorer-row move entry through the unchanged shared update path; and
- four desktop/tablet viewports: 1920×1080, 1440×900, 1366×768, and 1024×768.

There is no existing forward control. Explorer continuation-row clicks remain supported by `applyMoveFromRow`. Navigation, reset, FEN apply, row moves, and board flip cancel any active Quiet Drag before changing the canonical presentation, so no stale transform survives.

## Chromium benchmark

Representative 24-event `e2–e4` gesture, same board and run:

| Measure | Legacy | Quiet |
| --- | ---: | ---: |
| Input movement events | 24 | 24 |
| Visual writes | 25 | 24 |
| Geometry reads during movement | 0 | 0 |
| Forced synchronous layouts | 0 | 0 |
| `left`/`top` writes | 25 | 0 |
| jQuery animations on drop | 1 | 0 |
| Browser layout-count delta | 25 | 1 |
| Paint count delta | 0 | 0 |
| Style recalculation delta | 32 | 30 |
| Movement-handler script CPU | 5.676 ms | 5.691 ms |
| Frame p95 | 16.8 ms | 16.7 ms |
| Cursor/piece grab-offset lag | 12.207 px | ~0 px |
| Long tasks | 0 | 0 |
| Chess moves during pointer movement | 0 | 0 |
| Opening refreshes during pointer movement | 0 | 0 |
| Chess moves after successful drop | 1 | 1 |
| Opening refreshes after successful drop | 1 | 1 |

The instrumented wall-clock gesture duration includes Playwright pacing and is not treated as a product latency measurement. CPU, frame, visual-write, layout, grab-offset, and state/query counters are the relevant contract measures.

## Human QA

Local-only URL:

`http://127.0.0.1:8000/opening-database?quiet-drag-lab=1`

The panel exposes `Legacy Drag | Quiet Drag` only for `localhost`, `127.0.0.1`, or `::1`. Human acceptance must confirm silent feel, no heavy drag, no jitter, immediate drop, and a natural explorer refresh.

## Remaining risks

- Human feel cannot be certified by automation and remains the only open release gate.
- The page's existing mobile information architecture is outside this phase; no mobile redesign was attempted.
- Browser console may show the preexisting local unauthenticated auth-runtime warning when Clerk is unavailable. It does not affect the board or explorer.
