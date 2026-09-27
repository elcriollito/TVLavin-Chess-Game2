# Puzzles: exact full-catalog counts

The 1,404-puzzle fallback cannot supply the numbers shown beside the Themes
buttons. Build `public/data/puzzles/lichess-full-counts.json` from the verified
6,100,952-row SQLite source before deploying this change:

```powershell
py -3 tools/puzzles/build_count_manifest.py `
  --sqlite 'C:\Users\ALEXANDER\CAISSA Data\Lichess\Puzzles\2026-09-10\lichess-puzzles.sqlite3' `
  --output public/data/puzzles/lichess-full-counts.json
```

The manifest contains exact category unions (one puzzle counted once even if
it has multiple themes), individual theme totals across all ratings, and
counts for the current rating/difficulty and quality selection. The latter
matches the D1 pool selection, including its complete 100-point band rule.
It is derived metadata and contains no FEN, moves, game URLs, or private data.

Before merging, verify the script prints 6,100,952 puzzles, inspect several
categories against independent SQLite queries, run the Node/Python puzzle
tests, and verify the production preview displays full totals rather than the
curated beta numbers. Deploy the manifest with the page, in both Vercel
projects. If the manifest is missing or invalid, the UI shows an unavailable
count instead of a misleading curated count. Future source updates must
regenerate this file with the same version as D1.

## Verified 2026-09-10 artifact

- Source SQLite: 2,166,308,864 bytes; kept outside Git and Vercel.
- Generated manifest: 141,201 bytes; SHA-256
  `b04838a1cd3d9cdc732b772623397b19961c21f5e1b6756e6cb6608aa663f121`.
- Coverage: 6,100,952 puzzles, nine visible folders, 52 visible
  subcategories, and 61 count records in total.
- Generation time on the release workstation: 213.215 seconds. The builder
  performs one read-only pass over canonical puzzle rows and keeps only small
  per-rating histograms in memory.

Independent SQLite checks using `puzzle_themes` and `puzzles` confirmed, among
other samples: Phases 6,100,952; Motifs 2,145,051; Goals 6,047,066; Special
moves 157,729; fork 781,805; en passant 8,580; promotion 146,748; and equality
12,875. D1-compatible complete-band checks also matched: Motifs at target 1800
normal/standard 265,849 (ratings 1600–1999), the same range relaxed 359,394,
equality relaxed 53, and Special moves at target 2200 easier/standard 12,771
(ratings 1800–2099).
