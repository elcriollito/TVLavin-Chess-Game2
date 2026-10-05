# CAISSA Endgame Trainer — Puzzle Database Season

Status: feature implementation and local QA complete; production publication not authorized
Branch: `season/endgame-trainer-puzzle-database`  
Baseline: `origin/main` at `9d3924dd4c377cdf716084b2511190e204929dbd` (2026-10-04)

## Product contract

The canonical public `/endgame-trainer` experience is a specialized client of
the existing CAISSA Lichess puzzle catalog. Every selectable exercise must
match the official `endgame` theme. A material category adds another required
theme; it never replaces the root filter.

```text
root                    themes=endgame
Rook Endgame            themes=endgame,rookEndgame&themeMode=all
Pawn Endgame            themes=endgame,pawnEndgame&themeMode=all
Bishop Endgame          themes=endgame,bishopEndgame&themeMode=all
Knight Endgame          themes=endgame,knightEndgame&themeMode=all
Queen Endgame           themes=endgame,queenEndgame&themeMode=all
```

The catalog, Worker, fallback data and progress service remain shared with
`/puzzles`. No puzzle row is copied into an Endgame Trainer store.

## Architecture map

### KEEP

| Area | Owner | Reason |
| --- | --- | --- |
| Route and canonical URL | `endgame-trainer.html`, `vercel.json`, `server.js` | Existing public route, metadata, sidebar and historical redirect remain authoritative. |
| Board boundary | `js/board/caissa-board-adapter.js`, persistent renderer and Quiet Drag modules | One board owner with Pointer Events, pointer capture, RAF scheduling, cached geometry and `translate3d`. |
| Lichess position semantics | `js/puzzles/model.js` | `PuzzleSession` applies the first UCI move before presenting the position and owns legal move/SAN/special-move validation through chess.js. |
| Engine runtime | `js/puzzles/engine.js` | Current Stockfish 19 single-threaded Worker, bounded role lifecycle, stale-worker guards and Engine-vs-Engine controller. |
| Navigation/auth shell | existing standalone sidebar and CAISSA auth scripts | Avoids a parallel shell or identity system. |
| Historical compatibility routes | current legacy/guided/private selector branches | Kept isolated for old links and release evidence; not a source for the new public trainer. |

### REUSE FROM PUZZLES

| Capability | Source |
| --- | --- |
| Catalog selection, cursor queues and curated incident fallback | `js/puzzles/catalog-source.js` |
| Rating bands and difficulty behavior | `ratingBounds` / `poolFor` (to be shared rather than reimplemented) |
| Puzzle reconstruction, validation, promotion and SAN | `PuzzleSession` |
| Full-catalog API validation, timeout and server-only token boundary | `api/_lib/puzzle-catalog.js`, `api/puzzles/select.js` |
| D1 indexed pool selection and signed cursor | `cloudflare-puzzles-worker/src/index.js` |
| Generated counts | `public/data/puzzles/lichess-full-counts.json` and its builder |
| Analysis and Engine-vs-Engine lifecycle | `PuzzleEngine`, `EngineMatch` |
| Source links, retry/next behavior and responsive board/workspace conventions | `/puzzles` UI, adapted to Endgame Trainer's three-tab product model |

### REMOVE / RETIRE FROM THE PUBLIC PATH

| Legacy content owner | Disposition |
| --- | --- |
| Five-position Quick Challenge and fixture pool | Disconnect from canonical public route. Keep temporarily for historical/private selectors and tests. |
| Curated pool registry/consumer and endgame-run artifacts | No longer load for canonical public training. Preserve until compatibility routes are intentionally retired. |
| Generated KQK/KRK/KPK/KPKP/KRPvKR positions | No longer provide public exercises. |
| Curriculum and Guided Study positions | No longer provide canonical public exercises. Preserve explicit historical Guided links. |
| Legacy local endgame progress/training-memory dashboard | Hidden from the new public runtime; no migration or deletion in this season. |
| Legacy Stockfish trainer adapter | Not instantiated by the canonical public runtime. |

### REPLACE

| Existing behavior | Replacement |
| --- | --- |
| Public V2 Quick Challenge mount | Continuous endgame-puzzle session sourced through `PuzzleCatalogSource`. |
| Five-position scoring shell | Session solved, failed and streak counters with Next/Retry. |
| Setup/category controls | Catalog-discovered Endgame material themes plus shared rating/difficulty filters. |
| Mixed multi-panel layout | Board-dominant `BOARD | WORKSPACE` shell with Themes, Training and Analysis tabs. |
| Analysis embedded in Training | Fairness-gated Analysis tab with Engine On/Off and Engine-vs-Engine modes. |

### UNKNOWN / INVESTIGATE

1. `queenRookEndgame` is present in the curated source rows but has no entry in
   the current full-count manifest. It must not be exposed with an invented
   count. Add it only after the catalog aggregation artifact includes it.
2. Account semantics need a product decision: share general puzzle rating,
   write a separate endgame profile, or share history only. The reversible
   implementation keeps new Endgame Trainer counters session-local and makes
   no account progress mutation. Analysis and engine play never write progress.
3. Physical-device drag feel remains a human acceptance item even after the
   automated Quiet Drag contract and browser performance checks pass.

## Data and security contract

- Browser requests use the existing same-origin `/api/puzzles/select` route.
- `themeMode=all` is valid only for theme selection and means every supplied
  official theme identifier is required.
- Vercel retains the Worker bearer token; no D1 binding or secret reaches the
  browser.
- Theme count presentation reads generated catalog metadata; UI source does
  not contain numeric totals.
- The generated manifest includes explicit `endgame + materialEndgame`
  intersection keys. This matters because one canonical `bishopEndgame` puzzle
  (`lYevr`) is a middlegame puzzle and must not be counted in this trainer.
- Rating, result count and cursor bounds remain enforced on both the Vercel
  API and Worker.
- The Worker keeps indexed shuffle-key pagination and never uses
  `ORDER BY random()` or unbounded offsets.
- The curated fallback applies the same `endgame` intersection locally. It is
  incident recovery, not a separate trainer database.

## Runtime ownership

```text
PuzzleCatalogSource -> one PuzzleSession -> one CaissaBoardAdapter
                                      |
                                      +-> PuzzleEngine (only after unlock)
                                      +-> EngineMatch (separate exploration)
```

The puzzle session is the only owner of chess state during scoring. Board drag
is transient presentation only. Analysis and Engine-vs-Engine start from a FEN
snapshot after the scored attempt is solved, missed, revealed or abandoned;
they never mutate the scored `PuzzleSession` or account progress.

## Verification plan

- Data: root and material intersections, strict returned-theme verification,
  rating bounds, cursor isolation, empty and fallback behavior.
- Chess: setup-move reconstruction, side to move, SAN, normal lines,
  promotion/underpromotion, en passant, mate and stalemate.
- UI: tabs, category selection, loading/error/empty, retry/next, solved/failed,
  fairness lock and source link safety.
- Engine: analysis start/stop, stale result rejection, Engine-vs-Engine
  start/pause/stop and pagehide cleanup.
- Responsive: 1600×1000, 1366×768, 885×611, 390×844 and narrow 320 px checks,
  with no horizontal overflow or board-resize feedback loop.
- Regression: `/puzzles`, `/endgame-tablebase`, `/play`, shared board unit tests,
  navigation and public-route contracts.

## Implemented runtime

- Canonical `/endgame-trainer` mounts the catalog-backed runtime. Historical,
  Guided Study and private selectors retain their previous isolated owners.
- Themes exposes All, Rook, Bishop, Pawn, Knight and Queen Endgame from the
  canonical Phase taxonomy. Root requests use `endgame`; material requests use
  `themeMode=all` with `endgame` plus the selected material theme.
- Training uses `PuzzleSession`, including Lichess setup-ply semantics, chess.js
  legality, SAN, promotion and en-passant state. Attempts continue indefinitely
  through Next puzzle rather than ending after five fixtures.
- Analysis remains locked during an unresolved attempt. A recorded solve, miss
  or reveal unlocks bounded Stockfish analysis and an isolated Engine-vs-Engine
  continuation. Leaving Analysis, choosing the other mode, loading the next
  puzzle or unloading the page stops the owned Worker roles.
- The shared persistent board and Quiet Drag controller remain the only board
  interaction implementation on the canonical route.
- The canonical bootstrap dynamically imports only this runtime. Legacy
  trainer modules, jQuery, Chessboard.js and its stylesheet are loaded only for
  explicit compatibility/private routes.

## Verification evidence

- Full-catalog aggregation checked all 6,100,952 local rows. Exact material
  intersection totals are Rook 328,823; Bishop 83,603; Pawn 226,117; Knight
  50,679; and Queen 71,270.
- API and Worker tests cover validation, server-only bearer authentication,
  bounded ranges/limits, signed-cursor filter isolation, indexed pool choice,
  strict returned-theme filtering and unchanged OR behavior.
- Shared puzzle tests cover setup-ply reconstruction, both sides of en passant,
  all four promotion choices including underpromotion, legal wrong moves, SAN,
  reveal and difficulty bands.
- Browser coverage exercises tabs, selection, exact generated counts,
  loading/error/empty states, solve/miss/retry/next, underpromotion, source-link
  safety, the analysis fairness lock, Stockfish start/stop, Engine-vs-Engine
  play/pause/resume/stop and Worker cleanup.
- Responsive checks cover 1600x1000, 1366x768, 885x611, 390x844 and 320x700.
  They assert board priority, stable sizing and no horizontal overflow. Visual
  review confirmed the board remains the desktop and mobile protagonist.
- A local Chromium measurement at 1366x768 reported a 598x598 board with 74.5
  px squares and CLS 0. Lazy legacy loading reduced decoded startup resources
  from about 1.75 MB to 1.22 MB (about 526 KB / 30%). DOMContentLoaded in the
  same local run changed from about 403 ms to 91 ms. These are comparative local
  measurements, not production latency commitments.

## Progress decision retained for product approval

This branch deliberately keeps Endgame Trainer outcomes session-local. It
reuses the authenticated shell but sends no account progress mutation and does
not change the general puzzle rating. Analysis and Engine-vs-Engine never count
as attempts. A later product decision may choose shared history, a specialized
endgame profile, or selected shared metrics; the current boundary prevents
silent double-counting and is reversible.

## Deferred cleanup

Legacy exercise providers remain available only to historical, Guided Study
and private routes. They are disconnected from the canonical public path but
are not physically deleted in this season, because compatibility ownership is
still live. `queenRookEndgame` remains excluded until it is present in the
canonical Phase taxonomy and generated intersection counts.

Production deployment, Worker publication, D1 mutation and merge to `main`
remain outside this branch's authority.
