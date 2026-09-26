# CAISSA Engine Arena Season Close v1

## Scope

This release closes the Engine Arena season with three certified product changes:

- participant type selectors for White and Black;
- a resilient New Match reset action;
- retirement of Lc0 from Engine Arena into a dormant Analyzer reserve.

No bot runtime, bot personality, Analyzer integration, engine binary, authentication, authorization, or database change is part of this release.

## Certified inputs

- Production baseline: `39e36036fd66166d875d36cd96e82cdd492f1a44`
- EAP-001 Participant Type Selector: `12ad0f25c04959408910e800d6efb8f0dc230da8`
- EAP-002 New Match Reset: `9e1a2eabac0f69146dc8be77d866dc5ca355869a`
- EAE-020 Lc0 Arena Retirement: `9f5fb0855f718509567a05f63fabaa8efd75ded5`

The release integration branch is `integration/engine-arena-season-close`. The release PR title is `Engine Arena Season Close — Participant Types, New Match, Lc0 Dormant`. The exact PR, merge SHA, production deployment, and annotated release tag are the authoritative publication record.

## Participant type architecture

Each Match participant owns a complete configuration containing its participant type and provider. `engine` is the only active type in v1. `bot` is rendered as `Bots — Coming Soon`, remains disabled and cannot enter MatchConfig or runtime acquisition.

Swap Colors exchanges the complete White and Black participant configuration, not only the provider identifier. Match and Tournament continue to use the standard Engine Registry provider truth and runtime identity contracts.

## New Match reset contract

New Match is a Match-only reset boundary. If a Match or series is running, the user confirms interruption before cleanup. The reset then:

- invalidates outstanding search generations and timers;
- stops or destroys live engine ownership safely;
- tolerates a missing remote cleanup acknowledgement after a stale or `SESSION_GONE` runtime;
- clears the live game, series score, game index, clocks, move list and transient error state;
- restores the configured opening or FEN and the `Ready` state;
- preserves participant selections, participant types, title, game count, move limit, time control, opening configuration, Save PGN and board orientation;
- retains committed PGN/history and removes only the established non-archived `Save PGN = off` live record.

The action does not mutate an active Tournament and does not require a page reload to recover from a failed runtime.

## Lc0 dormant Analyzer reserve

Engine Arena contains no Experimental Engines control and does not register or request Lc0 during normal Match or Tournament use. The product state is:

- `releaseStage=DISABLED`
- `mode=DISABLED`
- `productStatus=LC0_ARENA_RETIRED_DORMANT`

Lc0 runtime artifacts, relay, ONNX Runtime, Maia 1100, Supabase relay schema, cleanup cron, source releases, compliance materials, manifests and historical tags remain preserved. Reactivation requires a separately designed Analyzer product boundary and fresh certification; Arena must not import the dormant provider implicitly.

See `CAISSA_ENGINE_ARENA_LC0_DORMANT_ANALYZER_RESERVE.md` for the immutable runtime provenance and reactivation prerequisites.

## Deferred Bots season

The selectors establish only the UI and MatchConfig foundation. Bot personalities, Elo, emulation, provider runtimes, style testing and Bot tournaments are deliberately deferred to a future season.

## Release and rollback

The safety reference `backup/main-pre-engine-arena-season-close` points to the exact pre-release production main SHA `39e36036fd66166d875d36cd96e82cdd492f1a44`.

Publication procedure:

1. certify the integration branch on an isolated Vercel preview;
2. merge the single release PR normally, without force push;
3. deploy the exact merged `main` SHA to production;
4. run the production Arena smoke matrix;
5. create annotated tag `engine-arena-season-close-v1` at the certified production SHA.

For a severe production regression, restore the prior production deployment using Vercel rollback or promote the deployment built from the safety reference, then verify `/arena`, Stockfish Match, Tournament, PGN/history and mobile before reopening traffic. No database rollback is required because this release has no schema or data mutation.
