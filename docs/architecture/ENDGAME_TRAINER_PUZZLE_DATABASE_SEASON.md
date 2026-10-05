# CAISSA Endgame Trainer — Puzzle Database Season

Status: implementation working map  
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
3. The committed Worker README still contains pre-provisioning wording while
   `wrangler.toml` identifies the versioned D1 database. Documentation should
   be reconciled separately from runtime behavior.
4. Physical-device drag feel remains a human acceptance item even after the
   automated Quiet Drag contract and browser performance checks pass.

## Data and security contract

- Browser requests use the existing same-origin `/api/puzzles/select` route.
- `themeMode=all` is valid only for theme selection and means every supplied
  official theme identifier is required.
- Vercel retains the Worker bearer token; no D1 binding or secret reaches the
  browser.
- Theme count presentation reads generated catalog metadata; UI source does
  not contain numeric totals.
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

Production deployment, Worker publication, D1 mutation and merge to `main`
remain outside this branch's authority.
