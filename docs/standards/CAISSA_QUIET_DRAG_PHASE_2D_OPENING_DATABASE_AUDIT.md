# CAISSA Quiet Drag Phase 2D — Opening Database

## Status

Technical implementation and automated gates: PASS.

Quiet Drag human QA: PASS. The interaction was confirmed silent, light, jitter-free, immediate on drop, naturally refreshing, and correct for special moves at `/opening-database?quiet-drag-lab=1` on localhost.

Opening Database data-source parity: PASS after the local development manifest correction documented below.

Release gate: PASS. Do not merge, push, publish, or deploy as part of this audit.

## Opening Database data parity audit

Starting FEN: `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1`.

Mode: Popular. Match level: exact. Source: `openingdb_shard_exact`.

| Move | Local before | Production | Local after | W/D/L after |
| --- | ---: | ---: | ---: | --- |
| `1.e4` | 43 | 2,350,205 | 2,350,205 | 37.3% / 32.0% / 30.6% |
| `1.d4` | 26 | 1,752,999 | 1,752,999 | 37.8% / 34.1% / 28.1% |
| `1.c4` | 1 | 367,340 | 367,340 | 37.8% / 35.2% / 27.0% |
| `1.Nf3` | 1 | 488,010 | 488,010 | 37.7% / 36.4% / 25.9% |

Before the correction, localhost requested `/openingdb/manifest.json` from the repository's static `public` tree. That legacy fixture selected `v2`, generated 2026-02-18, and directed the browser to `https://downloads.caissa-chess.org/openingdb/shards/v2`. The exact start-position request was `v2/66.json`: HTTP 200, 745 decoded bytes, four rows, and 71 games total. This was a successful lookup against a reduced legacy corpus, not an HTTP, CORS, timeout, or rendering failure.

Production requests `https://www.caissa-chess.org/openingdb/manifest.json`. The Vercel rewrite proxies that route to `https://downloads.caissa-chess.org/openingdb/manifest.json`, whose active version is `v3_p60`. Production then requests same-origin shard `/openingdb/shards/v3_p60/66.json`, also proxied to the download worker. The response is HTTP 200, 67,316,946 decoded bytes, 20 start-position rows, and 5,072,955 games total. The download worker reads `openingdb/manifest.json` and shard objects from its `OPENINGDB_BUCKET` R2 binding, falling back to `VAULT_BUCKET` only if the preferred binding is unavailable.

The local Node static server does not implement the Vercel external rewrites. The correction therefore makes localhost request the canonical download-host manifest directly; its CORS response allows `*`. The manifest-selected shard URL remains remote and versioned. Production retains the same-origin proxy path. The session cache key now includes the manifest source URL, so an already-open local tab cannot reuse the old unqualified `v2` manifest cache entry.

Fallback behavior remains the preexisting default-version path only when the selected manifest request fails. No fallback activated in before or after captures. Default Node API mode is off; `useNodeApi`, `strictNodeApi`, `nodeApiBase`, and `openingdbVersion` were absent from both audited URLs. No `.env` file or environment variable selected the reduced corpus.

Commit `e43987b494094197fea2e5231eec346b47030db5` did not change manifest URLs, shard URLs, feature flags, query parameters, match levels, dataset versions, fallback rules, or statistics normalization. Its Opening Database changes were confined to input/drag ownership, lifecycle, metrics, and removal of a redundant move-list write. The small local corpus predates that commit and is classified as a local development-source configuration issue, not a Quiet Drag regression.

After the correction, normal localhost, the Quiet Drag lab, and production all use `v3_p60`, render 20 start rows in identical order, total 5,072,955 games, and have identical W/D/L percentages. After `1.e4`, both environments show `King's Pawn Game (B00)`, match level `no_ep`, and identical continuation ordering/counts/percentages.

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

The panel exposes `Legacy Drag | Quiet Drag` only for `localhost`, `127.0.0.1`, or `::1`. Human acceptance confirmed silent feel, no heavy drag, no jitter, immediate drop, a natural explorer refresh, and correct special moves.

## Remaining risks

- Canonical data QA requires network access to `downloads.caissa-chess.org`; an unavailable canonical manifest still activates the preexisting fallback status rather than silently substituting the reduced `v2` fixture.
- The page's existing mobile information architecture is outside this phase; no mobile redesign was attempted.
- Browser console may show the preexisting local unauthenticated auth-runtime warning when Clerk is unavailable. It does not affect the board or explorer.
