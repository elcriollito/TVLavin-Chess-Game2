# CAISSA Engine Arena Match Lab v1.0 release

## Release scope

Match Lab v1.0 publishes the already-certified Engine Arena Match experience:

- Advanced Match Options and stable player-bar clocks.
- One-to-100-game series with alternating colors, immutable configuration snapshots,
  per-game generations, score tracking, stale-event guards, and Stop Series.
- Bullet, Blitz, Rapid, Long Game, and Fixed Depth controls with authoritative clocks,
  increments, pause/resume, deterministic flag fall, and correct UCI time/depth commands.
- Standard Position, ECO Opening, Custom FEN, and deterministic Balanced Opening Sets.
- Current-game and full-series PGN export, bounded session history, isolated historical
  review, and an opaque one-time handoff to CAISSA PGN Reader 2.1.0.

No new product feature was added during release integration.

## Architecture

Match Lab remains an Arena orchestration layer. `arena-match-series.js` owns the immutable
series schedule and score, `arena-match-clock.js` owns authoritative time state,
`arena-opening-snapshots.js` owns detached starting-position snapshots, and
`arena-match-pgn.js` owns deterministic PGN serialization. `caissa-arena.js` coordinates
those modules through the existing provider registry and runtime manager.

PGN Reader handoff stores raw PGN only in `sessionStorage`, addresses it with an opaque
same-origin token, consumes it once, and removes the token from browser history. Historical
review reconstructs positions in an isolated Chess instance and cannot mutate a live game.

## Certified source and safety references

- Public baseline: `2f95ae45ea160e675aabf51d41936523941ec7e6`.
- Certified Match Lab source: `b2671b6030df23a36ea2a91ad06997cdfc163dfb`.
- Certified archive ref: `archive/engine-arena-match-lab-certified`.
- Pre-release rollback ref: `backup/main-pre-match-lab-production`.
- Final production main: the commit referenced by annotated tag
  `engine-arena-match-lab-v1.0`; its exact SHA is also recorded in the final release report.

## Certification results

- Node unit and contract matrix: 313 passed, 0 failed.
- Consolidated Arena Chromium matrix: 102 passed, 0 failed.
- Direct SF18/SF19 UCI readiness: 1 passed, 0 failed.
- Match Lab A-J PGN/history scenarios are included in the Chromium matrix.
- Mobile portrait/landscape, accessibility, anti-jitter, Tournament, Game tab, and
  Stockfish provider coverage are included in the Chromium matrix.
- Vercel preview CSP and production smoke evidence are recorded in the final release report.

## Integration and deployment record

- Integration branch: `integration/engine-arena-match-lab-v1-release`.
- Pull request: `Engine Arena Match Lab v1.0` (number recorded after creation).
- Production deployment: promoted/deployed only after the PR merge and recorded in the
  final release report and annotated release tag evidence.
- Pre-release production deployment: `dpl_2gHpUb3aqTv13FQJ8w6qxta5Etsv`.
- Rollback source ref: `backup/main-pre-match-lab-production` at
  `2f95ae45ea160e675aabf51d41936523941ec7e6`.

The document cannot embed the hash of the commit that contains itself. The immutable
annotated tag and final release report are therefore the authority for the final main SHA,
PR merge SHA, and production deployment ID.

## Scope guards

- No Stockfish binary or WASM artifact changed.
- No runtime identity, engine strength, or Runtime Manager ownership semantic changed.
- The certified command builders only suppress the legacy default depth when a real UCI
  clock command is present; Fixed Depth remains explicit.
- No Lc0 runtime, relay, rollout state, or allowlist changed.
- No Clerk code, environment variable, SDK behavior, or authentication flow changed.
- Tournament configuration and behavior remain unchanged and are regression-covered.

## Deferred work

- Cloud PGN/game-library persistence.
- Annotated PGN with engine evaluation or principal variation.
- Per-move `%clk` annotations.
- Tournament time-control and opening expansion.
- Arbitrary custom time controls.
- Match Lab integration with a future general Lc0 rollout.
- Broader advanced adjudication.
