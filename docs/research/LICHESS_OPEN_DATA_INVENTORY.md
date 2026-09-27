# Lichess open-data inventory — 2026-09-26

Source: `https://database.lichess.org/`. Sizes below are compressed download
sizes. No collection other than puzzles was downloaded.

| Collection | Current published size/version | Potential CAISSA use | Storage decision |
| --- | --- | --- | --- |
| Puzzles | 304,429,328 bytes; 6,100,952 rows; updated 2026-09-10 | Native tactics catalog, theme/rating/opening selection, quality research | Downloaded now. Keep archive plus several GB of SQLite/index headroom. |
| Standard games | 164 monthly files, 2.57 TB, 8,130,696,420 games through 2026-08 | Opening statistics, game search, training-position provenance | Do not download on this workstation. Lichess estimates PGN expands ~7.1×, or roughly 18.2 TB before indexes. Define a month-bounded/object-storage phase first. |
| Evaluations | 22,086,532,809 bytes (~20.6 GiB), 409,710,113 positions; updated 2026-09-10 | Engine labels, position search, puzzle-quality research | Do not download yet. Reserve at least 25 GiB for the archive and well over 100 GiB if materialized/indexed; validate a representative range before sizing the full pipeline. |
| Openings | `lichess-org/chess-openings` snapshot at `c67912be581f0793dbaa776be5ccf111e01f88d9` (61,150-byte source archive) | Resolve `OpeningTags`, normalize ECO/name labels | Commit-pinned reference downloaded with the puzzle source; cheap to retain and refresh. |

The puzzle source remains the priority because it is cumulative, small enough for
this PC, and directly supports the approved Puzzles experience. Games and
evaluations require separate capacity, cost, retention, and query-design reviews.

## Capacity, cost, and utility gate for later collections

No download is authorized by this plan. The first useful unit is an immutable
compressed source object plus a derived, query-oriented partition; the 18.2 TB PGN
expansion must never be treated as workstation capacity.

| Collection | Pilot and capacity envelope | Utility gate | Storage-only cost model (USD/month) |
| --- | --- | --- | --- |
| Standard games | Start with one explicitly selected monthly file. Keep its compressed object, derive partitioned Parquet by month/opening/player/time-control, and cap transient pilot space at 3x that object's published size. A full archive needs 2.57 TB compressed plus up to ~18.2 TB expanded before indexes, so full materialization is out of scope. | Proceed beyond one month only if opening statistics or provenance queries show a measured product benefit and the derived format avoids PGN-wide scans. | At the 2026-09-26 published rates, 2,570 GB costs about **$38.40/month** in R2 Standard after its 10 GB free allowance, **$25.70/month** in R2 Infrequent Access before reads, or **$2.54/month** in S3 Glacier Deep Archive before requests/retrieval. |
| Evaluations | Pilot a bounded shard/range from the 20.6 GiB archive; reserve 25 GiB for the compressed object and cap the first materialized position table at 125 GiB. Keep FEN/hash, depth, nodes and selected PV fields rather than copying every representation. | Continue only if the sample materially improves puzzle-quality classification, search, or engine-label calibration beyond on-demand Stockfish. | 20.6 GB costs about **$0.16/month** in R2 Standard after its 10 GB free allowance, **$0.21/month** in R2 Infrequent Access before reads, or **$0.02/month** in S3 Glacier Deep Archive before requests/retrieval. |

These are comparison estimates, not purchase approvals. R2 Standard is
`$0.015/GB-month` with 10 GB-month free; Infrequent Access is
`$0.01/GB-month` plus `$0.01/GB` retrieved and a 30-day minimum; S3 Glacier Deep
Archive starts at `$0.00099/GB-month` and trades cost for asynchronous restore.
Operations, retrieval, compute, transformed data, taxes, and safety copies are not
included. Recalculate against the exact provider, region, object count, and
published file size immediately before any pilot.

Sources: [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
and [Amazon S3 Glacier storage classes](https://aws.amazon.com/s3/storage-classes/glacier/).
