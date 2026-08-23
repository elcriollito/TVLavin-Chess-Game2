# Capablanca PGN intake validation

The repository owner supplied `Capablanca.pgn` for GPR-0.2 and authorized its use in the CAISSA Game Replayer. The original attachment was not modified or committed.

| Field | Result |
| --- | --- |
| Original SHA-256 | `fb5d46cd1ce78665b2d2ea3df03b5bbea72b6ddb643a0c930f66a686a8723a8a` |
| Original size/encoding | 385,341 bytes; UTF-8 with CRLF |
| Protected derivative | `api/_private/pgn/capablanca-games-1901-1941.pgn` (served only after entitlement verification) |
| Derivative SHA-256 | `33cbbea9421f14f51bf55dbd772fed3031e855235fedf05d9247886a9d96f71f` |
| Games | 597, stable original order |
| Subject/date range | José Raúl Capablanca games, 1901–1941 |
| Players/events/sites | 184 / 42 / 27 distinct values |
| Results | 196 White wins; 149 Black wins; 251 draws; 1 unfinished (`*`) |
| Metadata gaps | 247 unknown rounds; no Elo values; ECO present in all 597 games |
| Parser/legal validation | 0 parser errors; 0 illegal mainline sequences; 0 malformed games |
| Duplicates | 0 identical mainline-score groups |
| Annotations | 0 comments; 0 variations; 0 NAGs |
| Safety scan | 0 markup/script, URL, control-character, oversized-comment, or contact-data findings |

The derivative changes only line endings from CRLF to LF. It does not repair, exclude, reorder, annotate, or otherwise change a chess score. The incomplete result and unknown metadata remain visible rather than being guessed.

The provider runtime requires dynamic code evaluation (`new Function`). The corresponding `'unsafe-eval'` capability is restricted to the wrapper CSP and is absent from the parent and global production CSP. Runtime certification also proved that ChessBase does not initialize under an opaque-origin sandbox: it never requests the PGN. The iframe therefore uses the minimum functional `sandbox="allow-scripts allow-same-origin"`. This weakens DOM isolation relative to an opaque sandbox, so the wrapper is compensated with a route-specific CSP, exact SRI pins, no CAISSA auth/account/analytics state, exact-origin/source message validation, and no forms, popups, top navigation, downloads, workers, account, or authentication capabilities.
