# OpeningDB v2 Build Notes

Build command executed:

```bash
node scripts/build-openingdb-index.js --in pgn --out data/openingdb/shards --version v2 --maxPlies 20 --topN 60 --flushEvery 50000
```

Observed input in this workspace:

- `pgn/` only (19 PGN files, ~50 KB total)
- `data/pgn_db` not present
- `data/pgn_big` not present

Build output summary:

- `gamesProcessed`: 71
- `uniquePositions`: 375
- `startPositionTotalGames`: 71
- Top start moves: `e4=43`, `d4=26`, `c4=1`, `Nf3=1`

London line coverage check:

- Line: `1.d4 d5 2.Bf4 Nf6 3.e3 e6 4.Nf3 c5 5.c3 Bd6`
- Coverage drops to zero after ply 2 with this local corpus.

Conclusion:

- v2 pipeline and reporting are working.
- Full-production coverage still requires running the same v2 build command against the real large PGN corpus (not available in this workspace snapshot).
