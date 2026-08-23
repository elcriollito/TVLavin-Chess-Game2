# CAISSA Player PGN Archive

This import job vendors the curated player collections listed in `data/pgn/smallchess-player-import.json` into the server-only `api/_private/pgn/players/` archive.

Runtime rule: CAISSA PGN Replayer must load these collections only through the authenticated `/api/pgn/player?album=...` endpoint after checking permanent ownership. There is no public player-PGN path.

Safety/provenance: every PGN is capped at 10 MiB, checked for basic PGN tags and NUL bytes, counted, hashed with SHA-256, and recorded in the generated manifest. The upstream source directory is used only for archival import. Source/reuse and commercial rights must be certified before enabling album commerce.
