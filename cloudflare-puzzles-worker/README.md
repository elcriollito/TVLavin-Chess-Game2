# CAISSA puzzle catalog Worker candidate

This directory records the local, non-deployed D1 design selected by the
September 27, 2026 infrastructure review. It does not contain a remote database
identifier, deploy configuration, secret, or production binding.

The catalog is immutable and versioned. `puzzles` keeps all 6,100,952 source
rows, including `game_url`. `puzzle_pool_entries` replaces runtime full scans
with exact pool lookups by official theme/opening, quality tier, and 100-point
rating bucket. A Worker will merge the bounded pool results, deduplicate puzzle
IDs, fetch canonical rows, and return the existing Puzzles API contract.

Pagination must use a signed opaque cursor containing the catalog version,
filter digest, random starting key, last `(shuffle_key, puzzle_id)`, wrap flag,
and expiry. The Worker must reject a cursor whose filter digest or catalog
version does not match. The current in-browser `seen` set remains a second
guard against repeats across overlapping theme pools.

Before any remote import, a rehearsal must prove:

- final D1 size below 8 GB, leaving at least 20% below the fixed 10 GB limit;
- SQL import file below 5 GB;
- `rows_read` p95 at most 500 and Worker CPU p95 at most 10 ms for every filter;
- no temporary sort or full scan for theme, opening, or Equality selection;
- global read replication is enabled and queried through `withSession()`;
- blue/green cutover and rollback to the previous catalog version;
- the R2 source/SQL backup uses a new puzzle bucket, never `caissa-openingdb`.

Run the disposable local structural trial with:

```powershell
py -3 tools/puzzles/benchmark_d1_candidate.py `
  "C:\Users\ALEXANDER\CAISSA Data\Lichess\Puzzles\2026-09-10\lichess-puzzles.sqlite3"
```

No user rating, streak, or progress belongs in this database. Those future
transactional records remain a separate Supabase/RLS concern after their data
contract and identity rehearsal are approved.
