# Lichess puzzle catalog operations

## Safety boundary

The complete Lichess export, partial downloads, SQLite catalog, validation samples,
and virtual environment live outside Git and outside the Vercel project. The
repository contains only reproducible tooling, schema, tests, documentation, and
the existing 1,404-puzzle browser-safe beta subset.

Never place the complete archive under `public/`, `data/`, or another repository
directory. The repository and Vercel ignore rules are defense in depth, not a
substitute for this separation.

## Restore the source archive

PowerShell:

```powershell
./tools/puzzles/download.ps1
```

The downloader uses `curl --continue-at -` and keeps the `.part` file after a
failed transfer. It promotes the partial name only after `curl` exits successfully.
It also captures the official theme XML and a commit-pinned archive of the opening
tag reference linked by Lichess.

## Build and verify the local catalog

Create a disposable environment in the durable data folder, then run:

```powershell
$catalogRoot = Join-Path $env:USERPROFILE 'CAISSA Data\Lichess\Puzzles\2026-09-10'
py -3 -m venv (Join-Path $catalogRoot '.venv')
& (Join-Path $catalogRoot '.venv\Scripts\python.exe') -m pip install -r tools/puzzles/requirements.txt
& (Join-Path $catalogRoot '.venv\Scripts\python.exe') tools/puzzles/build_catalog.py `
  (Join-Path $catalogRoot 'lichess_db_puzzle.csv.zst') `
  (Join-Path $catalogRoot 'lichess-puzzles.sqlite3') `
  --manifest (Join-Path $catalogRoot 'manifest.json') `
  --sample (Join-Path $catalogRoot 'validation-sample.json')
node tools/puzzles/validate_sample.mjs (Join-Path $catalogRoot 'validation-sample.json')
```

The build is lossless at the CSV-column level: all 11 published fields are stored
for every row. It rejects schema drift, malformed numeric/FEN/UCI fields, duplicate
IDs, an unexpected record count, truncated Zstandard input, or a failed SQLite
integrity check. The `.sqlite3.part` file is never promoted on failure.

Example local queries:

```sql
select p.* from puzzle_themes t
join puzzles p on p.puzzle_id = t.puzzle_id
where t.theme = 'fork' and p.rating between 1700 and 1900
order by p.popularity desc, p.nb_plays desc limit 20;

select p.* from puzzle_openings o
join puzzles p on p.puzzle_id = o.puzzle_id
where o.opening_tag = 'Sicilian_Defense'
order by p.rating limit 20;
```

## Selected D1 publication path

The immutable catalog is published to the versioned Cloudflare D1 database
`caissa-puzzles-2026-09-10`. Build and independently verify the resumable SQL
artifacts before any remote write:

```powershell
$artifactRoot = '.puzzle-catalog\full-d1-2026-09-10'
py -3 tools/puzzles/build_d1_catalog.py `
  (Join-Path $catalogRoot 'lichess-puzzles.sqlite3') $artifactRoot
py -3 tools/puzzles/build_d1_catalog.py `
  (Join-Path $catalogRoot 'lichess-puzzles.sqlite3') $artifactRoot --verify
```

Then use `tools/puzzles/import_d1_catalog.py` with its external checkpoint. It
hash-checks every fragment, refuses destinations outside the versioned
`caissa-puzzles-*` namespace, records D1 read/write/duration metrics, and verifies
all canonical rows, pools, counters, `GameUrl` values, and source version. Rerun
the same command after an interruption; completed fragments are idempotently
skipped.

The deployed Worker uses indexed, pre-shuffled 100-point rating pools, D1
Sessions API, global read replication, and HMAC-signed keyset cursors. R2 stores
the original source, manifest, and SQL backup only; it is not queried as a
database. The browser calls Vercel `/api/puzzles/select`, never D1 directly, and
falls back to the committed 1,404-puzzle collection during incidents.

The earlier PostgreSQL/Supabase migration and importer remain an unexecuted
fallback, not the selected catalog destination. Supabase is reserved for future
transactional account rating/progress under RLS. See
`CAISSA_PUZZLE_FULL_CATALOG_PREVIEW.md` for exact resources, metrics, preview
configuration, rollback, and acceptance evidence.

The `/puzzles` and `/puzzles/chessbase-tactics` routes remain independent.
