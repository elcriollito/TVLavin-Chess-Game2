# Opening Database V2 — Phase 0 Baseline

Date: 2026-11-07 (America/New_York)

Repository: `elcriollito/TVLavin-Chess-Game2`

Branch: `feature/opening-database-v2-modernization`

Audited base: `ce9a5198a8d0618d32fa9c34c500267ad89efc85`

Base tree: `8e80b1cc806ba6b4249534f1c2b3cafd3a6da868`

## Isolation and protected state

- The pre-existing primary checkout was dirty on `feature/arena-redesign`; it was not modified.
- This season uses a dedicated worktree created from the live GitHub `main` ref.
- The current board owner is the single Chessboard.js instance created by `initBoard()`.
- The current rules/game owner is the single Chess.js instance at `state.game`.
- Board artwork remains `/img/chesspieces/wikipedia/{piece}.png`.
- Board colors remain owned by the existing Chessboard.js/CAISSA styles.
- Quiet Drag remains owned by `/js/board/caissa-legacy-quiet-drag-adapter.js`, delegating one drop commit to `applyBoardDrop()`.
- No board assets, board palette, vendor chess libraries, or Quiet Drag implementation are in scope for replacement.

## Baseline architecture

- Opening statistics are exact-position lookups keyed by a normalized FEN hash. The client tries exact, no-en-passant, no-castling, and board-only variants and validates returned moves against the authoritative Chess.js legal move list.
- The canonical live opening manifest is `v3_p60`, generated 2026-03-08, with 256 shards, a 60-ply limit, and `games/w/d/l/lastYear/avgElo` fields.
- Production uses the same-origin `/openingdb` proxy; localhost resolves the canonical downloads manifest directly.
- Shard fetches are deduplicated, abort/order guarded, time limited, and capped to two in-memory shards. Full-dataset preload is not used.
- Opening identification uses the existing ECO prefix catalog and game history.
- The page owns one primary Stockfish client plus one serialized candidate-evaluation client. Neither is started merely by loading the page.
- Game Search currently uses a UCI `lineKey` prefix index (`v1`, maximum 10 plies, top 100 metadata records), not an exact-position index.
- The dormant exact-position games/PGN client cannot be activated because the authoritative `/openingdb/games/manifest.json` currently returns `Games manifest not found` and no bundled replacement exists.

## Reproducible functional baseline

- `node --test tests/opening-database-quiet-drag.test.js tests/opening-database-data-parity.test.js`: **8/8 PASS**.
- Local page loaded from the real repository server at `/opening-database`.
- The original board rendered with the existing piece set and palette.
- The canonical live database version displayed as `v3_p60`.
- Baseline UI is a long page: board and move explorer above an independent engine dashboard, visible DEBUG block, Search Games dock, and move-list panel.
- Browser human acceptance has not been performed; this is an automated/engineering baseline only.

## Audit hypotheses

1. **CONFIRMED — Game Search actions unavailable.** `runGamesSearch()` maps every result to `pgnUrl: ''`, so View PGN and Download do not render.
2. **CONFIRMED — ZIP is a placeholder.** `triggerGamesZipDownload()` only reports `Download Games ZIP: coming soon.`
3. **CONFIRMED — unsafe result rendering.** Player, event/site, result, year, rating, URL, and identifiers are interpolated into `innerHTML` without consistent escaping or URL validation.
4. **CONFIRMED — tier elevation is URL-controlled.** `getTierFromUrl()` accepts `?tier=premium`; it is not a trusted entitlement boundary.
5. **CONFIRMED — mixed denominators.** `Games: N` uses the indexed total while W/D/L, average Elo, and years use the returned/filtered sample without saying so.
6. **CONFIRMED — move rows are pointer-only.** Explorer rows are clickable `<tr>` elements without button semantics or keyboard activation.
7. **CONFIRMED — diagnostics dominate normal UI.** Worker URL, handshake, last message time, and last engine line are always visible.
8. **CONFIRMED — SEO metadata is incomplete.** The page has a title and description but no canonical, Open Graph, social card, or structured-data metadata.

## Risks and implementation decisions

- Game discovery will be labeled line-based and not transposition-aware. Exact-position PGN/ZIP functionality will remain unavailable until the authoritative games dataset exists.
- URL-controlled premium presentation will be removed from the page. No billing, authentication, or entitlement architecture will be changed in this season.
- Game metadata will be rendered through safe DOM/text or escaped, validated values.
- The default workspace will be Explore, with Analysis and Games as peer tabs in one HEAD/BODY/FOOT shell.
- Diagnostics will remain available only through an explicit development/advanced disclosure.
- Analyzer and Opening Trainer integrations will reuse their established handoff/state contracts or remain deferred if those contracts do not safely accept Opening Database context.

## Baseline acceptance blockers

- The current layout does not meet the requested singular workspace architecture.
- Game result rendering has an injection risk.
- Keyboard operation is incomplete for explorer moves.
- PGN/ZIP controls imply capabilities that the live dataset cannot support.
- Debug implementation details are exposed by default.
- Responsive and accessibility verification must be repeated after modernization.
