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
