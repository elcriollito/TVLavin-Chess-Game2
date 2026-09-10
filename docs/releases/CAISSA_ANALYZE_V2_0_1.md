# CAISSA Analyze V2.0.1 release record

Date: 2026-09-09

Route: `/analyze`

Status: CERTIFIED RELEASE CANDIDATE — publish only through the Vercel Git integration

## Release identity

- Certified Analyze V2 base: `ac8ea70b41c704a8ad8307648a1ea699dbacba00`
- Preserved immutable base tag: `analyze-v2-certified`
- Approved product candidate: `f4f8f20acae4e957399e1c1f4a65736d5f0285c3`
- V2.0.1 immutable tag after verified publication: `analyze-v2.0.1-certified`
- Exact final main SHA and Vercel deployment identity are recorded by the
  immutable tag and external Recovery Vault manifest. They are intentionally
  not embedded in the commit whose identity they describe.

## Certified scope

V2.0.1 adds direct public Chess.com game URL resolution through the official
PubAPI archive data, retains the official Lichess export flow, renders only the
approved move symbols in Review notation, and fixes Review search attribution
without introducing another chess, board, PGN, cursor, or engine owner.

The Review lifecycle is serialized on `AnalyzeSection.analysisEngine`:

1. stop Live and cross the `bestmove` / `readyok` barrier;
2. switch from Live `MultiPV=4` to Review `MultiPV=1`;
3. search sequentially at depth 12, retrying at depth 8 within the bounded
   10-second attempt timeout;
4. restore the authoritative FEN, `MultiPV=4`, and `go infinite`.

The engine remains Stockfish 18 Lite WASM with its embedded
`nn-9067e33176e8.nnue` network and one Analyze worker.

## Authority boundary

- Chess: `AnalyzeSection.loadedGame.game`
- Session and FEN: `CaissaAnalyzeSession`
- Board: `AnalyzeSection.board`
- PGN: `AnalyzeSection.loadGameFromPgn()`
- Engine: `AnalyzeSection.analysisEngine`
- Review cursor: `AnalyzeSection.currentMoveIndex`
- Setup draft: `CaissaAnalyzeSetupDraft`

No parallel Live/Review search and no second ownership pipeline are permitted.

## Certification evidence

- Analyze unit/contracts: 70 passed.
- Analyze browser matrix: 88 passed and 3 intentionally skipped in the main
  Chromium/WebKit run; the sole transient WebKit drag-geometry miss passed on
  immediate isolated rerun.
- Real golden Chess.com PubAPI resolution: passed in Chromium and WebKit.
- Real 54-ply SF18 Review: completed in both browsers with one worker, zero
  timeouts, zero retries, visible symbols, and Live restored.
- Protected unit/contracts: Play Bots 22 passed; Play Coach 25 passed; PGN
  Reader 137 passed.
- Protected browser matrix: 99 passed in the combined run. The two production
  comparison cases were rerun with the required clean base/feature servers and
  passed in Chromium and WebKit. A pre-existing WebKit exact-subpixel equality
  assertion remains a non-blocking historical harness warning; containment,
  reachability, and zero horizontal overflow all passed.
- Tested viewports include 1600×1000, 1366×768, and 390×844 plus the existing
  zoom-equivalent coverage.

## Protected and frozen surface

The shell, session, setup draft, URL resolver, engine attribution adapter,
Stockfish 18 provider, Review pipeline, and annotation rendering contracts are
the certified Analyze V2.0.1 surface. The exact protected paths live in the
external Recovery Vault alongside checksums and recovery instructions.

Future modifications to that surface require a new explicit Analyze version or
milestone, new focused certification, a new immutable tag, and a new Recovery
Vault entry. Neither `analyze-v2-certified` nor the prior Analyze V2 Vault may
be moved, rewritten, or replaced.
