# Play v2 Identity and PostGame Mode Transitions

Status: implemented locally; manual product acceptance and physical retest required. Public readiness remains false.

Contracts: `PlayV2IdentityPolicy@1.0.0` and `PlayV2ModeTransitionPolicy@1.0.0`.

## Identity decision

New Games sessions in the CAISSA Native Play Experience present the opponent as `CAISSA`. The former `CAISSA Engine` wording could be confused with an unrelated chess-engine product, so Play v2 no longer uses it as a user-facing identity. This is a product identity decision, not an engine-provider claim: Stockfish attribution, bundled-engine provenance, licenses and internal technical labels remain unchanged.

The policy does not rename Beginner, Casual, Tactical or Solid Bots, the Coach-assisted identity, Classic, Legacy Play, Legacy FICS, or external Analyze. New Play v2 records use `CAISSA` in the active label, normalized opponent field, Quick Play PGN headers, PostGame and the explicit completed-game Analyze continuation. Previously persisted records are never rewritten. If an already-loaded historical Play v2 record contains `CAISSA Engine`, only its Play v2 PostGame/Analyze presentation is normalized; its stored PGN and record bytes remain immutable.

## PostGame cross-mode transition ownership

The simplified shell is the single transition orchestrator. A different mode tab selected from completed PostGame performs bounded cleanup before routing to the target setup:

1. stop the clock, cancel engine requests and terminate any Bots Worker;
2. reset the authoritative legacy board to the standard legal initial position without starting a game;
3. clear promotion, retry, result, assistance and completed-record presentation state;
4. rotate lifecycle and request attribution;
5. route through the canonical Play router;
6. load and reset only the target setup owner;
7. focus the target setup heading.

The result is exactly one board, zero running clocks, zero active gameplay requests, zero Workers and no automatic start. Target-mode configuration remains owned by that target; no Bot or Coach configuration is shared across modes. No FICS, external provider, Legacy Play fallback, persistence, telemetry or educational write is admitted.

Setup-to-setup navigation remains normal. Active-game protection is unchanged. The selected same-mode tab during PostGame is inert and does not replace New Game. Inline Analyze and Mentor remain exclusive workspaces with their existing Back-to-PostGame controls. Browser history must re-enter only router-owned clean states and must not revive a completed lifecycle or Worker.

## Acceptance boundary

Automated Chromium and WebKit ownership must cover all six different-mode PostGame transitions, identity propagation, board/reset/resource invariants, keyboard focus, responsive accessibility, Classic/Legacy isolation, FICS isolation and deterministic generation. Physical iPhone certification remains blocked until the accepted local changes receive a new private-device retest.
