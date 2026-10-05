# CAISSA puzzle catalog Worker

This Worker is the authenticated, read-only query layer for the versioned
6,100,952-row Lichess puzzle catalog. D1 stores canonical puzzle rows (including
`game_url`) and precomputed theme/opening/quality/rating pools. R2 is backup
storage only; it does not execute SQL.

`/v1/select` accepts exactly one of `themes` or `openings`, a rating interval of
at most 600 points, `quality=standard|relaxed|all`, an optional signed cursor,
and `limit<=16`. Theme requests may use `themeMode=all` to require every supplied
theme; opening requests and existing theme requests retain the default OR
behavior. It uses D1 Sessions, bounded indexed lookups, stable shuffle keys and
an HMAC cursor. It does not use offset pagination, random sorting, or writes.
`/health` verifies the bound catalog version. Both routes require
`Authorization: Bearer <WORKER_TOKEN>`; missing or wrong authentication returns
404.

Required secrets:

- `WORKER_TOKEN`: random server-to-server bearer token.
- `CURSOR_SECRET`: independent random secret of at least 32 characters.

The Vercel function holds `WORKER_TOKEN`; neither secret is available in the
browser. Internal D1 metrics are consumed for deployment measurement and are
removed by Vercel before its public response.

The database is immutable and exclusive to puzzles. Never bind
`caissa-openingdb`, Opening Database PGNs, or account data. Future rating,
streak, and progress remain a separate Supabase/RLS concern.

See `docs/operations/CAISSA_PUZZLE_FULL_CATALOG_PREVIEW.md` for build, import,
deployment, measurement and rollback steps.
