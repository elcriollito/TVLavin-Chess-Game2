# Polyglot Online Architecture

## Candidate scope

This document describes the unshipped candidate on branch `feature/caissa-downloads-polyglot-expansion`, based on commit `ce9a5198a8d0618d32fa9c34c500267ad89efc85`. Production remains unchanged.

## Previous flow

The previous page read the complete file with `File.text()`, serialized it into a JSON request, and posted it to `/api/polyglot/build`. The serverless handler retained the JSON/PGN, aggregate map, sorted entries and final buffer in one invocation. Its rate limiter was process-local and reset on cold starts. That made private PGN upload and metered server compute part of normal use.

## Candidate flow

```text
File.stream()
  -> transferable byte chunks with one-chunk backpressure
  -> dedicated module Web Worker
  -> streaming TextDecoder
  -> incremental PGN game splitter
  -> chess.js legal main-line validation
  -> canonical Polyglot key/move aggregation
  -> deterministic key/move sort
  -> 16-byte big-endian records
  -> transferred ArrayBuffer
  -> local Blob download
```

`js/polyglot-tool.js` never calls the legacy build API. The user can cancel at any time; cancellation stops the file reader, terminates the worker, rejects pending requests and creates no output. Blob URLs and workers are cleaned up on replacement and page unload.

## Parsing policy

- Multiple games and arbitrary valid tag ordering are supported.
- UTF-8 is decoded incrementally without splitting multibyte sequences.
- CRLF, CR and LF line endings and a missing final newline are supported.
- Comments, semicolon comments and NAGs are accepted by the PGN parser.
- Only the main line is counted; recursive annotation variations are deliberately excluded and the UI states this policy.
- `SetUp`/`FEN` starts are replayed from their actual initial board.
- A malformed/illegal game is skipped with bounded error samples; valid neighboring games continue.
- Individual game text is limited to 8 MiB to prevent an unterminated game from growing without bound.

## Polyglot compatibility

- Authentic 781-entry random table.
- Canonical piece, castling, en-passant and side-to-move hashing.
- Castling is encoded as king-to-rook-square, per Polyglot.
- Promotion codes are knight `1`, bishop `2`, rook `3`, queen `4`.
- Records are `>QHHI`: 64-bit key, 16-bit move, 16-bit weight, 32-bit learn.
- Weight is occurrence count capped at 65,535.
- Records sort by key, then move, producing deterministic bytes.

Independent `python-chess` 1.11.2 validation passed for the public portable sample. Browser and portable outputs were byte-for-byte identical with SHA-256 `10519c9389a1d9f84a475b4f9a2b1de2dfaed74f26ada1c4ea929774c58e5db4`.

## Limits and resource controls

- UI/file gate: 25 MiB.
- Worker aggregate budget: 128 MiB estimated record memory.
- Option bounds: 1–1,024 plies; minimum count 1–1,000.
- Final output and the aggregate map still require memory; the page therefore does not claim unlimited size.
- The 25 MiB repeated-game stress corpus passed but required 430.1 seconds on the audit machine. It is a stability ceiling, not a latency guarantee.
- A 50 MiB selection is rejected before worker creation.

## Legacy endpoint

`/api/polyglot/build` is an explicit `410 Gone` tombstone in the candidate. It accepts no body, performs no conversion and points clients to `/tools/polyglot`. Deploying this retirement remains a separately reviewed production change.

## Reproduction

```powershell
npm ci
npm run test:caissa-downloads-polyglot
node scripts/benchmark-polyglot.mjs --output-dir="C:\temp\caissa-polyglot" --sizes=1,5,10,25
python scripts/validate-polyglot.py --pgn .\sample.pgn --bin .\sample.bin --max-ply 160
```
