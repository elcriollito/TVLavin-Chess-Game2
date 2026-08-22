# CAISSA Player PGN Archive

This import job vendors the curated player collections listed in `data/pgn/smallchess-player-import.json` into `public/data/pgn/players/`.

Runtime rule: once the import succeeds, CAISSA PGN Replayer must load these collections from CAISSA-local `/data/pgn/players/*.pgn` paths, not from SmallChess.

Safety/provenance: every PGN is capped at 10 MiB, checked for basic PGN tags and NUL bytes, counted, hashed with SHA-256, and recorded in the generated manifest. The public source directory is used only for the archival import. Source/reuse rights must be reviewed separately before any monetization of these archived collections.
