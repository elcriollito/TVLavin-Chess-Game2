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

## PostgreSQL staging path

`supabase/migrations/20260927010607_caissa_puzzle_catalog_v1.sql` defines the
future server catalog. It intentionally has no account-progress table and exposes
no client role. Apply it first to an isolated Supabase branch or local Docker
database, load a small sample, run the matching rehearsal SQL and database
advisors, then benchmark theme/rating/opening queries. Only after those gates pass
should a separately reviewed bulk-import procedure target production.

Install `tools/puzzles/requirements.txt` and run
`python tools/puzzles/validate_postgres_sql.py` for grammar validation before the
database rehearsal. Grammar validation does not replace applying the migration and
rollback to an isolated PostgreSQL/Supabase database.

After validating the destination schema, use the resumable importer. It stages one
bounded batch at a time, commits `INSERT ... ON CONFLICT DO NOTHING`, and writes an
atomic checkpoint outside the repository only after the database commit succeeds:

```powershell
& (Join-Path $catalogRoot '.venv\Scripts\python.exe') tools/puzzles/import_postgres.py `
  (Join-Path $catalogRoot 'lichess-puzzles.sqlite3') `
  --checkpoint (Join-Path $catalogRoot 'postgres-import-checkpoint.json') `
  --max-batches 1
```

Set `CAISSA_PUZZLE_STAGING_DATABASE_URL` and
`CAISSA_PUZZLE_STAGING_PROJECT_REF` to the approved isolated branch first. The
importer refuses the known production ref and requires the branch ref to be present
in the connection identity. Interrupt and resume the one-batch rehearsal before
removing `--max-batches`. It finishes by comparing count, minimum/maximum ID, and
rating/play sums with SQLite. The production database import remains a separate
release gate.

`20260927032035_caissa_puzzle_selection_indexes_v1.sql` adds partial indexes for
the standard and Equality quality gates. Its matching rehearsal captures actual
plans for theme/rating, Equality, and opening queries. See
`CAISSA_PUZZLE_FULL_CATALOG_PREVIEW.md` for the web request path and rehearsal
checklist.

The current `/puzzles` beta and `/puzzles/chessbase-tactics` routes remain
independent of this staged schema.
