# OpeningDB v3 Build Report

Date: 2026-02-18

## Preflight

Requested corpus path:

- `C:\Users\ALEXANDER\Downloads\databasePGN\databasePGN`

Actual files found:

- `C:\Users\ALEXANDER\Downloads\databasePGN\databasePGN-local-copy.pgn`
- `C:\Users\ALEXANDER\Downloads\databasePGN\databasePGN.pgn`

Counts:

- `pgn_count`: 2
- `total_bytes`: 6,950,790,856
- `total_gb`: 6.473
- each file size: 3,475,395,428 bytes (~3.24 GiB)

## Smoke Test

Smoke subset extracted from large file:

- `data/pgn_smoke/smoke_5000_games.pgn`
- size: 3,569,095 bytes
- approx games: 5000

Smoke build command:

```bash
node scripts/build-openingdb-index.js \
  --in data/pgn_smoke/smoke_5000_games.pgn \
  --out data/openingdb/shards \
  --version v3-smoke \
  --maxPlies 20 \
  --topN 60 \
  --flushEvery 50000
```

Smoke results:

- `gamesProcessed`: 5001
- `uniquePositions`: 35797
- `startPositionTotalGames`: 4996
- start top moves:
  - `e4`: 3427
  - `d4`: 1297
  - `c4`: 86
  - `Nf3`: 84

London line coverage observed (smoke):

- line: `1.d4 d5 2.Bf4 Nf6 3.e3 e6 4.Nf3 c5 5.c3 Bd6`
- by ply (candidates / totalGames):
  - ply 0: 11 / 4996
  - ply 1: 8 / 1269
  - ply 2: 9 / 1098
  - ply 3: 4 / 28
  - ply 4: 2 / 5
  - ply 5: 2 / 4
  - ply 6: 3 / 5
  - ply 7: 4 / 16
  - ply 8: 2 / 4
  - ply 9: 2 / 3
  - ply 10: 0 / 0

## Full Build Attempt (v3)

Command used:

```bash
node scripts/build-openingdb-index.js \
  --in "C:\Users\ALEXANDER\Downloads\databasePGN\databasePGN-local-copy.pgn" \
  --out data/openingdb/shards_build \
  --version v3 \
  --maxPlies 20 \
  --topN 60 \
  --flushEvery 200000
```

Status:

- Not completed within 4-hour execution window in this session (timeout).
- This corpus likely needs a longer uninterrupted run window.

## Pipeline Improvements Added

`scripts/build-openingdb-index.js` now supports:

- `--maxGames <N>` for controlled smoke/partial runs
- `--progressEvery <N>` periodic progress JSON logs

These are useful to estimate throughput before launching an overnight full build.
