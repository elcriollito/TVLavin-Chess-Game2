# CAISSA Puzzles 1.0 — working brief

**Status:** native training preview in `feature/caissa-puzzles-1-0`; no production release.
**Approved layout:** horizontal categories above a large left board and one right workspace with Engine, Themes, and Level tabs.

## Preview shipped in this branch

- `/puzzles` is separate from the existing ChessBase gateway at `/puzzles/chessbase-tactics`.
- A 1,361-position CC0 subset of the [Lichess puzzle export](https://database.lichess.org/#puzzles) is bundled at `public/data/puzzles/lichess-curated-preview.json` (about 393 KiB), served through the existing `/data/:path*` rewrite.
- Source compressed export downloaded September 26, 2026: SHA-256 `95fd454bec9efe8f940d5863d5db4c57474f281a865834997bd8cb5d6a149bb9`. Rebuild with `zstd -dc lichess_db_puzzle.csv.zst | python3 scripts/build-puzzle-preview.py` from the repository root.
- Selection: rating 1200–2400, deviation at most 100, popularity at least 80, 500 or more plays; eight highest quality records per theme and rating band. This is a discovery filter, not a claim that Stockfish has individually certified every puzzle.
- The trainer applies the opponent's first UCI move before showing the position, then validates user moves with the existing chess.js library. The board uses CAISSA's existing persistent board adapter. SAN move history, hints, solution reveal, session count, and source game link are present.
- Stockfish 19 Lite starts only on demand after a puzzle is solved or revealed. The same page owns the single engine worker; continuation starts a fresh worker to isolate stale analysis messages. Turning the engine off or leaving the page terminates it.
- The Level tab controls a practice target and relative difficulty. It does not claim an account rating, send results to a server, or persist progress.

## Next gates before production

1. Review a sampled set with chess experts and measure puzzle quality at the proposed 1700–2100 sweet spot. Revise quality thresholds from actual solve feedback.
2. Establish a versioned PostgreSQL import and indexed theme/rating query for a substantially larger pool; keep the 6.1 million row source file out of the web bundle.
3. Add account progress and an actual rating calculation only after its data contract, privacy, and game rules are approved.
4. Complete cross-browser and touch/drag QA, engine lifecycle stress checks, accessibility review, and review of routes/SEO before linking the page in primary navigation.
5. Compare the finished Puzzles surface with older training pages before any consolidation or redirect.

## Verification so far

- All 1,361 source sequences were solved through the actual puzzle model without an illegal move.
- Local Chromium checked desktop and 390 px mobile layout, eight categories, theme switching, no page errors, full solve, Stockfish evaluation, and continued play.
- `tests/puzzles-preview.test.js` passes. The unchanged legacy `tests/tactics-gateway.test.js` currently has one mainline failure because it assumes the CSP is the first header entry in `vercel.json`.
