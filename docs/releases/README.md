# CAISSA certified releases

## CAISSA Production Snapshot — 2026-09-05

The exact production commit is the immutable commit referenced by annotated tag
`caissa-production-2026-09-05`. The external Vault manifest records that full SHA
after publication; this avoids embedding a commit's own changing SHA in its tree.

### CAISSA Play Coach v3.1

- Status: CERTIFIED / PRODUCTION
- Route: `/play/coach`
- Architecture: permanent Head / Body / Foot Coach shell
- Production identity: `caissa-production-2026-09-05`
- Surface tag: `play-v3.1-coach-certified`
- Vault: `CAISSA-PRODUCTION-2026-09-05/surfaces/play-coach-v3.1`

### CAISSA PGN Reader Web Mirror V2

- Status: RECOVERED / CERTIFIED / PRODUCTION
- Route: `/pgn-replayer`
- Recovery commits: `9c40387`, `60a9004`
- Production identity: `caissa-production-2026-09-05`
- Surface tag: `pgn-reader-web-v2-recovered-certified`
- Vault: `CAISSA-PRODUCTION-2026-09-05/surfaces/pgn-reader-web-v2`

Future certified releases append to this index. They do not delete or rewrite
older release records or Vault snapshots.
