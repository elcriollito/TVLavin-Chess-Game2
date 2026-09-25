# CAISSA Engine Arena Match Lab ML001E — PGN, History, and Reader Handoff

## Scope and invariants

ML001E adds local PGN export, bounded session history, historical review, and a handoff to the existing CAISSA PGN Reader. It does not change engine selection, engine binaries, search limits, Match Series scheduling, clock ownership, opening scheduling, Tournament, Lc0 rollout, authentication, or server persistence.

The authoritative record remains the Match Series controller. A PGN is derived only from:

- the immutable per-game starting FEN and opening snapshot;
- accepted legal moves already recorded in canonical SAN;
- scheduled White and Black engine identities;
- the controller result, termination reason, round, and time-control snapshot.

Opening-book or ECO moves used to create a starting snapshot are metadata, not played moves. They are never prepended to exported movetext.

## PGN serializer

`js/arena-match-pgn.js` is a side-effect-free serializer exposed as `CaissaArenaMatchPgn`.

- `serializeGamePgn(game, options)` emits one complete game.
- `serializeSeriesPgn(series)` emits up to 100 games separated by one blank line.
- `sanitizeFilename(value)` creates deterministic `.pgn` download names.

Every game includes Event, Site, Date, Round, White, Black, Result, and TimeControl. Fixed-depth games use `TimeControl "-"` and `CaissaDepth`. ECO snapshots add ECO, Opening, and Variation. Every nonstandard starting position adds `SetUp "1"` and its exact six-field FEN. Match Lab termination reasons are preserved in `CaissaTermination`.

Move numbering is derived from the FEN side-to-move and fullmove fields. A Black-to-move snapshot at fullmove 9 therefore starts `9...`. The header Result and final movetext result token share the same normalized value.

## Save PGN behavior

The existing Save PGN toggle still defaults on.

- On: completed records remain in the bounded in-memory session archive and are available for review/export.
- Off: the current series record stays in memory so immediate manual export remains possible. It is removed when a new Match is prepared and is never stored as account history.

No database, account persistence, cookie, local-storage PGN cache, or server upload was added. The session archive holds plain serializable records only and is bounded to 100 games.

## Historical review isolation

The Game tab renders a compact list of recorded games. Selecting one reconstructs positions in a new isolated `Chess` instance from the record's starting FEN and accepted moves. It never calls a mutation API on the authoritative live `CaissaArena.game`.

Live workers, clocks, score, scheduler state, generation, and current-game moves continue independently while an older game is displayed. **Live** clears the historical selection and projects the authoritative current position again.

## Downloads and Reader handoff

Current-game and full-series downloads use a UTF-8 browser `Blob`; no PGN reaches a CAISSA server.

`js/pgn-replayer/pgn-handoff.js` implements a same-origin, session-only handoff:

1. Engine Arena serializes the selected series.
2. The PGN is stored in `sessionStorage` under a random opaque token for at most ten minutes.
3. The browser navigates to `/pgn-replayer?handoff=<token>`; raw PGN is never placed in the URL.
4. The existing Reader consumes and deletes the record exactly once, removes the token from browser history, and submits the PGN through its existing local parser/worker path.

The handoff shares the Reader's 10 MiB limit. Invalid, stale, reused, or malformed tokens fail closed. No second PGN reader or parser was created.

## Security and privacy

- UI metadata is inserted with `textContent`; no exported metadata is interpreted as HTML.
- PGN headers escape quotes, backslashes, and line breaks.
- Handoff tokens accept only a bounded alphanumeric/hyphen format.
- Raw PGN is absent from URLs, logs, analytics, local storage, and server requests.
- Downloads and the handoff are explicit user actions.

## Certification coverage

Unit coverage includes required headers, all approved clock mappings, fixed depth, ECO and custom FEN metadata, Black-to-move numbering, stopped/time-forfeit/move-limit results, escaping, filenames, series association, balanced sets, and round-trip parsing through `CaissaPgnCore`.

Chromium coverage includes the ML001E A–J matrix: standard export, B90, custom Black-to-move FEN, two-game multi-PGN, six-game balanced set, time forfeit, stopped game with Save PGN off, live/review isolation, existing Reader handoff, and mobile board-first layout.
