# Full-catalog preview operations

## Production boundary

The website remains on Vercel. The immutable public puzzle catalog lives in a
versioned Cloudflare D1 database behind `caissa-puzzles-catalog`; the browser
never receives a D1 credential or Worker token. Future account rating, streak,
and progress belong in separate Supabase tables protected by RLS. Engine
analysis and Engine vs Engine never write either store.

The only server-to-server path is:

`browser -> /api/puzzles/select (Vercel) -> authenticated Worker -> D1`

The Vercel endpoint validates all filters, caps responses at 16 rows, applies a
three-second upstream timeout and a best-effort 60-request/minute/IP limit. The
Worker revalidates the request, queries indexed immutable pools, and returns an
opaque HMAC-signed cursor. No request uses `OFFSET` or `ORDER BY random()`.
`WORKER_TOKEN` and `CURSOR_SECRET` are secrets; never commit or expose them to
client code.

If the Worker, D1, or configuration is unavailable, the API returns a structured
503 and the browser continues with the verified 1,404-puzzle curated collection.
Keep that fallback in every deployment.

## API contract

Public Vercel route: `GET /api/puzzles/select`.

- Provide exactly one of `themes` or `openings` as 1–12 comma-separated official
  identifiers.
- Optional: `minRating`/`maxRating` (400–3500, ordered, span at most 600),
  `quality=standard|relaxed|all`, `limit=1..16`, and the opaque `cursor` returned
  by the preceding response.
- Success: `{ source: "full-catalog", sourceVersion, filters, limit, cursor,
  hasMore, estimatedTotal, puzzles }`. Each puzzle preserves `id`, FEN, UCI
  moves, Lichess rating/deviation/popularity/play count, themes, opening tags,
  and `gameUrl`.
- Invalid input returns `400 INVALID_SELECTION`; throttling returns 429;
  unavailable Worker/D1/config returns `503 PUZZLE_CATALOG_UNAVAILABLE` with
  fallback `/data/puzzles/lichess-curated-preview.json`.
- Responses are `private, no-store`. Worker metrics, bearer credentials, D1 IDs,
  and cursor signing material never appear in the public response.

The internal Worker route is `GET /v1/select` with the same bounded filters and
`Authorization: Bearer`. It returns D1 metrics only to Vercel. Missing/wrong
authentication and unknown routes return 404; `/health` is authenticated too.

## Build gate

Build the complete artifact before creating or billing any remote resource:

```powershell
$catalogRoot = 'C:\Users\ALEXANDER\CAISSA Data\Lichess\Puzzles\2026-09-10'
$artifactRoot = '.puzzle-catalog\full-d1-2026-09-10'
py -3 tools/puzzles/build_d1_catalog.py `
  (Join-Path $catalogRoot 'lichess-puzzles.sqlite3') $artifactRoot
py -3 tools/puzzles/build_d1_catalog.py `
  (Join-Path $catalogRoot 'lichess-puzzles.sqlite3') $artifactRoot --verify
```

`manifest.json` is authoritative. Stop if SQL exceeds 5,000,000,000 bytes, the
candidate database exceeds the 8,000,000,000-byte planning limit, any statement
exceeds 100 KB, integrity is not `ok`, any `GameUrl` is absent/invalid, coverage
does not equal 73 themes and 1,589 opening tags, or estimated writes materially
exceed the 50-million monthly allowance. The builder is checkpointed after each
fragment and may be rerun after interruption.

## Versioned remote import

Current preview resources (2026-09-27):

- D1 `caissa-puzzles-2026-09-10`, ID
  `cb4a3a0c-f6ef-42a8-ae38-3af88b7aed10`, 2,832,064,512 bytes,
  read replication `auto`.
- Worker `caissa-puzzles-catalog` at
  `https://caissa-puzzles-catalog.tvlavingames.workers.dev`.
- R2 `caissa-puzzles`, prefix `catalogs/2026-09-10`, 248 objects and
  3,315,638,737 bytes.

Create only a database named `caissa-puzzles-YYYY-MM-DD`. Add its ID to
`cloudflare-puzzles-worker/wrangler.toml`; do not reuse or edit
`caissa-openingdb`. Import with a checkpoint outside Git:

```powershell
py -3 tools/puzzles/import_d1_catalog.py `
  .puzzle-catalog\full-d1-2026-09-10\manifest.json `
  --database caissa-puzzles-2026-09-10 `
  --config cloudflare-puzzles-worker\wrangler.toml `
  --checkpoint .puzzle-catalog\full-d1-2026-09-10\remote-import-checkpoint.json
```

Every SQL fragment is idempotent and hash-checked before upload. The importer
records completed fragments only after Wrangler reports success, accumulates
`rows_read`, `rows_written`, D1 duration and wall time, and finally verifies
canonical rows, pool rows, pool counters, all `GameUrl` values, and the source
version. Rerun the same command to resume.

After import, enable D1 read replication and keep the Worker on Sessions API.
Set `WORKER_TOKEN` and `CURSOR_SECRET` with `wrangler secret put`, deploy the
Worker, and verify that unauthenticated requests return 404. Upload the original
Zstandard source, final manifest, and a rebuildable backup under a versioned
prefix in the dedicated `caissa-puzzles` R2 bucket. Never place these objects in
`caissa-openingdb`.

The completed import checkpoint records 36,221,325 writes, zero import reads,
and exact remote counts. Cloudflare's account counter contains 11 additional
schema writes from the first successful schema execution. The R2 checkpoint and
remote readback evidence are committed under `docs/research/evidence/` without
credentials or machine-specific paths.

## Vercel preview cutover

Configure only Preview (not Production) with:

- `CAISSA_PUZZLE_WORKER_URL`
- `CAISSA_PUZZLE_WORKER_TOKEN`

Both variables are currently branch-scoped to
`feature/puzzles-full-catalog-preview` in `tv-lavin-chess-game2` and
`caissa-chess`. The URL is Config; the token is Secret. Rotate the Worker bearer
and update both branch-scoped values together.

Create a fresh preview deployment from PR #21. Test a health request directly
with the secret, then `/api/puzzles/select` through Vercel for rating, theme,
opening, Equality/quality and two cursor pages with zero overlap. Confirm the
public API omits Worker internal metrics and credentials.

Do not promote the deployment, merge PR #21, change `main`, or modify production
environment variables before Alex's visual approval.

## Measurement and acceptance

For at least 15 cold/warm requests per representative filter, record HTTP p50
and p95, Worker wall/CPU, D1 duration, `rows_read`, `rows_written`, query count,
region, and returned puzzle count. User selection must write zero rows. Compare
Cloudflare usage counters with the import checkpoint and update the cost model
from the observed values.

Final measurement passed: Fork/Sicilian read 48 rows p50/p95, Equality 55,
D1 p95 was 5.944 ms, HTTP p95 was 239.839 ms, Worker CPU observed by Tail was
0–6 ms, and every selection wrote zero rows. Two consecutive cursor pages had
zero overlap. See `puzzle-d1-full-benchmark-2026-09-27.json`.

Run:

```powershell
npm run lint:puzzles
npm run test:puzzles
npm run test:puzzles:browser
```

Browser QA covers desktop and touch-mobile solve/fail paths, all four visual
promotions, `4TN7E` and black/white en passant, preparatory last-move highlighting,
Stockfish locked until completion, analysis stop/restart and position changes,
Engine vs Engine pause/stop/no-rating-write, change-puzzle worker cleanup, and
the antijitter assertion introduced by commits `22deb6d` and `9516597`.

## Blue/green rollback

Never mutate the active 6.1-million-row catalog in place. Build and import the
next date into a new D1, validate it, then change the Worker binding in a reviewed
commit. Preserve the previous database through the rollback window and keep the
R2 source/manifest/backup. Rollback is a binding/deployment reversal, not a mass
rewrite. D1 Time Travel is additional recovery, not the only backup.

## Local full-catalog mode

The verified SQLite remains outside Git and Vercel. Explicit local development
may query it read-only:

```powershell
$env:CAISSA_PUZZLE_ALLOW_LOCAL_SQLITE = '1'
$env:CAISSA_PUZZLE_SQLITE_PATH = 'C:\Users\ALEXANDER\CAISSA Data\Lichess\Puzzles\2026-09-10\lichess-puzzles.sqlite3'
npx vercel dev --listen 127.0.0.1:8767
```

This mode is rejected when `VERCEL_ENV=production`.
