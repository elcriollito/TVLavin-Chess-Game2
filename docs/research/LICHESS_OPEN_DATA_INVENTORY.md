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
