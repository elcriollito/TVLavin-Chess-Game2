# Full-catalog preview operations

## Request path

The browser loads the small bundled collection for categories and as an outage
fallback. Puzzle selection then requests `/api/puzzles/select` with a bounded
theme list, rating range, page, and limit. The Vercel function validates every
parameter, applies the approved quality gate, caps responses at 16 rows, and
queries Supabase with `service_role` only on the server.

The endpoint is public read-only content, uses a 60-request/minute best-effort IP
limit, a three-second upstream timeout, short CDN caching, and a maximum of 51
pages per selection. The in-memory rate limit is basic abuse resistance, not a
distributed global quota; production scale should replace it with a durable
rate-limit service if traffic warrants it.

If configuration, Supabase, or the table is unavailable, the API returns a
structured 503 and the browser continues with the verified 1,404-puzzle curated
collection. No millions-row response path exists.

## Local full-catalog mode

The complete SQLite catalog remains outside Git and Vercel. Local development can
exercise the real 6.1-million-row path with explicit opt-in:

```powershell
$env:CAISSA_PUZZLE_ALLOW_LOCAL_SQLITE = '1'
$env:CAISSA_PUZZLE_SQLITE_PATH = 'C:\Users\ALEXANDER\CAISSA Data\Lichess\Puzzles\2026-09-10\lichess-puzzles.sqlite3'
npx vercel dev --listen 127.0.0.1:8767
```

The server opens SQLite read-only through Node's built-in SQLite module. This mode
is rejected when `VERCEL_ENV=production` and is never configured in Vercel.

## Supabase rehearsal

Do not create a branch until its organization, parent project, size, region, and
usage-based cost have been shown to the owner and explicitly approved. Never use
`CAISSA-PRODUCTION-DO-NOT-DELETE` as the direct test target.

On the approved isolated branch:

1. Apply both puzzle migrations.
2. Load a representative sample with the resume-safe importer and a checkpoint
   outside the repository.
3. Run both rehearsal SQL files plus Security and Performance Advisors.
4. Capture `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` for theme, Equality, and
   opening selections.
5. Interrupt and resume the importer; confirm committed batches are not counted
   twice.
6. For the full import, require count/min/max/sum aggregates to match SQLite.
7. Run rollback in dependency order and verify the table and indexes are gone.

The importer requires a branch ref separate from the database URL and refuses the
known production project ref:

```powershell
$env:CAISSA_PUZZLE_STAGING_DATABASE_URL = '<branch connection string>'
$env:CAISSA_PUZZLE_STAGING_PROJECT_REF = '<branch ref>'
& $catalogPython tools/puzzles/import_postgres.py $catalogDatabase `
  --checkpoint (Join-Path $catalogRoot 'postgres-import-checkpoint.json') `
  --max-batches 1
```

Remove `--max-batches` only after the sample, plans, advisors, and resume test
pass. Production import remains a separate owner-approved release action.
