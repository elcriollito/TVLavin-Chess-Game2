# Opening Trainer — CAISSA PGN Reader proxy integration

## Reused provider and boundary

The established CAISSA PGN Reader opening library uses PGN Mentor's opening archive at `https://www.pgnmentor.com/openings/`. Browser code does not call that host. Both PGN Reader and Opening Trainer now use `PgnOpeningProxyClient` in `js/pgn-replayer/pgn-opening-proxy-client.js`, which is restricted to the same-origin CAISSA route `GET /api/pgn/opening`.

`api/pgn/opening.js` is the existing serverless proxy. `server.js` adapts that exact handler for local development instead of duplicating its provider logic.

## HTTP contracts

- `GET /api/pgn/opening` returns the validated free catalog: schema version, source date, fixed page size `100`, count `233`, and allowlisted `{ id, title, file }` entries.
- `GET /api/pgn/opening?file=<allowlisted.zip>&page=<1-based page>` returns `application/x-chess-pgn`.
- Response headers provide `X-CAISSA-Opening-Page`, `X-CAISSA-Opening-Pages`, `X-CAISSA-Opening-Games`, `X-CAISSA-Opening-Page-Games`, and `X-CAISSA-PGN-Source: pgnmentor-opening-paged`.
- Methods other than GET return 405. Unknown files/traversal return 404. Invalid pages return 400. Oversized archives or PGNs return 413. Provider/format failures return 502.

## Search and pagination

Opening Trainer searches the proxy catalog by normalized opening name or variation. ECO input is expanded through CAISSA's existing ECO data before catalog ranking. No invented game metadata is used.

The server proxy pages collections in groups of 100. Opening Trainer exposes a separate ten-game UI page and maps it to the correct proxy page and offset. Previous/Next never wrap. Selecting a result parses its source PGN, preserves the full notation, and builds a legal board timeline; malformed continuations are reported and navigation stops at the legal prefix.

## Security, cache, and access conditions

- The server accepts only the generated PGN Mentor allowlist and rejects paths, slashes, unknown names, and multi-PGN ZIPs.
- ZIP size is capped at 32 MiB and extracted PGN size at 96 MiB server-side. Browser pages are capped at 10 MiB.
- Proxy/catalog responses use CDN caching for one day with one week stale-while-revalidate; clients request `force-cache`.
- Provider redirects are followed server-side with a CAISSA user agent. No credentials are required by the current provider contract.
- Opening Trainer sends no user repertoire, local PGN, FEN, account data, or secrets to PGN Mentor.
- Abort controllers plus the workspace generation prevent late searches or game loads from restoring state after NEW.
