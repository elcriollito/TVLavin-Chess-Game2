# CAISSA Puzzles 1.0 — working brief

**Status:** visual layout approved by Alexander on September 26, 2026. The 1,404-puzzle build is a limited beta for the existing `/puzzles` route; general release remains gated.
**Approved layout:** horizontal categories above a large left board and one right workspace with Engine, Themes, and Level tabs.

## Preview shipped in this branch

- `/puzzles` is separate from the existing ChessBase gateway at `/puzzles/chessbase-tactics`.
- A 1,404-position CC0 subset of the [Lichess puzzle export](https://database.lichess.org/#puzzles) is bundled at `public/data/puzzles/lichess-curated-preview.json`, served through the existing `/data/:path*` rewrite. The nine top categories include Goals between Special moves and Lengths, with Equality, Advantage, Crushing, and Checkmate in its Themes panel.
- Source compressed export downloaded September 26, 2026: SHA-256 `95fd454bec9efe8f940d5863d5db4c57474f281a865834997bd8cb5d6a149bb9`. Rebuild with `zstd -dc lichess_db_puzzle.csv.zst | python3 scripts/build-puzzle-preview.py` from the repository root.
- Selection: rating 1200–2400, deviation at most 100, popularity at least 80, 500 or more plays (100 or more for the uncommon Equality theme); eight highest quality records per theme and rating band. The relaxed play threshold applies only to Equality selection. This is a discovery filter, not a claim that Stockfish has individually certified every puzzle.
- The trainer applies the opponent's first UCI move before showing the position, then validates user moves with the existing chess.js library. The board uses CAISSA's existing persistent board adapter. SAN move history, hints, solution reveal, session count, and source game link are present.
- A completed checkmate disables analysis and continuation because no legal move remains. Nonterminal positions may still be analyzed or continued against Stockfish.
- Stockfish 19 Lite starts only on demand after a puzzle is solved or revealed. The same page owns the single engine worker; continuation starts a fresh worker to isolate stale analysis messages. Turning the engine off or leaving the page terminates it.
- The Level tab controls a practice target and relative difficulty. It does not claim an account rating, send results to a server, or persist progress.

## Next gates before general release

1. Review a sampled set with chess experts and measure puzzle quality at the proposed 1700–2100 sweet spot. Revise quality thresholds from actual solve feedback.
2. Validate the staged PostgreSQL catalog migration on an isolated Supabase branch, benchmark its theme/rating/opening queries, and approve a production bulk-import runbook. The complete 6,100,952-row source and a reproducible local SQLite index now exist outside the repository; neither is part of the web bundle.
3. Add account progress and an actual rating calculation only after its data contract, privacy, and game rules are approved.
4. Complete cross-browser and broader device QA, engine lifecycle stress checks, accessibility review, and review of routes/SEO before linking the page in primary navigation. Chromium desktop/mobile touch and drag checks cover this beta only.
5. Compare the finished Puzzles surface with older training pages before any consolidation or redirect.

## Verification so far

- All 1,404 source sequences were solved through the actual puzzle model without an illegal move.
- Local Chromium checked desktop and 390 px touch mobile layout, theme switching, tap-to-move, no page errors or horizontal overflow, full solve, Stockfish evaluation, and continued play. Goals contains all four objectives at the initial rating target.
- The post-solution state was checked for terminal mate and nonterminal Equality positions. The curated set contains 604 terminal mates, all of which must prevent continuation.
- `tests/puzzles-preview.test.js` and `tests/tactics-gateway.test.js` pass. The Tactics test now locates the global CSP by route rather than assuming it is the first header rule.

## Full-catalog foundation completed locally

- Official Lichess version: 2026-09-10, 6,100,952 puzzles, 304,429,328 compressed bytes, SHA-256 `95fd454bec9efe8f940d5863d5db4c57474f281a865834997bd8cb5d6a149bb9`.
- The entire Zstandard stream decoded successfully; the exact 11-column schema and row count matched the official publication.
- The local SQLite catalog preserves every source row and column and is indexed by ID, rating/quality, theme, opening tag, and daily date. SQLite integrity and quick checks returned `ok`.
- A deterministic 512-puzzle sample completed every UCI sequence legally. For every sample, the first move changed the FEN into the position presented to the solver.
- The versioned PostgreSQL migration is private-by-default, reversible, and deliberately not applied to production. It models puzzle difficulty only; it adds no account rating or persistent progress.

## Full-catalog preview cycle

- The browser now requests bounded batches from `/api/puzzles/select` and falls
  back to the verified 1,404-puzzle collection when the server catalog is absent.
  The server caps themes, rating span, page, and response size; credentials remain
  server-only.
- Local opt-in mode serves the real 6,100,952-row SQLite catalog without copying
  it into Git or Vercel. Production rejects this filesystem provider.
- Quality analysis for 1700–2100, selection rules, duplicate counts, and measured
  SQLite plans are recorded in
  `docs/research/LICHESS_PUZZLE_QUALITY_1700_2100.md`.
- Training estimate, source difficulty, and future account progress are explicitly
  separate. No account result is persisted until the existing Clerk-to-database
  identity path is rehearsed with server-side authorization in an isolated branch.
- The isolated Supabase rehearsal and full import remain blocked on the owner's
  explicit cost confirmation. Production has not been used or changed.
