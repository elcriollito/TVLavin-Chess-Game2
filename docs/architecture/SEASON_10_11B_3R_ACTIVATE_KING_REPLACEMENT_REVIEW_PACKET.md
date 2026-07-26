# Season 10.11B-3R — Activate-king replacement review packet

## Baseline and binding decision

Work began from clean `main` at `1b52d94d0ff287a8b7e3841d78895bf4defd05a9`, equal to `origin/main`. Human review revision 1 issued `requires-new-position` for `king-activation-support-region` because Kb3 or Kc3 completed its proposed multi-move mission immediately. The original packet and its four digests remain immutable. The decision is recorded separately under private human adjudications and grants no approval to a replacement.

The other objective states remain unchanged: convert-material-advantage is human approved, hold-draw is human approved with objective correction, and activate-king awaits a replacement review.

## Repository search and candidate discovery

Knowledge Units, Trainer positions, pools, fixtures, existing packets, king support, key squares, opposition, favorable simplification, conversion, and reserve-tempo sources were inspected first. Existing positions did not provide a sufficiently distant deterministic activation event, so three controlled three-piece variants were evaluated:

1. White king c1, pawn d3, Black king h7; target c4.
2. White king c1, pawn d3, Black king h6; target c4.
3. White king f1, pawn e3, Black king a8; target f4.

All three are exact tablebase wins, have no legal immediate target completion, and expose a premature pawn push that draws. The first is recommended—not approved—because it stays closest to the repository’s activate-the-king teaching geometry while requiring a genuine route.

## Proposed objective and line

The concrete mission is: **Bring the king to c4 before advancing the d-pawn while preserving the win.**

The proposed deterministic line is `Kb2 Kg6 Kb3 Kf5 Kc4`, five plies and three learner decisions. The success event requires all of the following: White king on c4, White pawn still on d3, exact win preserved, and an approved authored node. No legal initial move satisfies it. The natural `d4?` changes the exact result from win to draw, making the importance of king activation observable without inventing a chess error.

## Evidence and graph

`lichess-syzygy-remote@1.0.0` supplies authoring-only exact evidence. Every provider move is replayed through `ChessRulesFacade`; normalized FEN, SAN, resulting FEN, WDL, DTZ, DTM, position-content, request, response, and evidence digests are retained. Raw responses are not stored, local Syzygy verification is not claimed, and runtime network access is prohibited.

Stockfish 18 at the pinned `caissa-engine-review-standard@1.0.0` policy is secondary evidence only. The tablebase remains theoretical authority.

The private graph retains every legal move at each expanded state and expands one deterministic continuation per opponent-policy comparison. It is bounded at 12 plies and terminates on the proposed event, repetition, evidence failure, uncovered state, or the ply boundary.

## Policies and semantics

The packet compares WDL→DTZ→UCI, maximum resistance, and an authored deterministic tree. The authored tree is proposed as clearest but remains `unapproved-human-review-required`.

Exactly three success models are presented: `approved-king-activation-board-event`, `exact-theoretical-result-terminal`, and `human-authored-terminal`. The first is recommended for review because it binds a concrete square, unchanged pawn structure, preserved win, and reviewed node.

Failure semantics distinguish objective failure, chess-result failure, result-preserving objective miss, recoverable authored-concept miss, and neutral technical unavailability. Promotion, stalemate, repetition, fifty-move, maximum-ply, and outside-graph behavior remain explicit review questions. No nonprincipal winning move is falsely classified as chess failure.

## Hints, feedback, and human boundary

The three position-specific hint stages explain king-before-pawn, identify the c1–c4 route, then reveal the current proposed move. Only stage 3 removes independent-success eligibility. Eleven required feedback cases distinguish “still winning but off concept” from an actual win-to-draw error.

All 26 human fields are null. The strict nine-value decision allowlist is unchanged. Nothing in the generator, graph, tablebase evidence, engine output, recommendation, hints, or feedback constitutes human approval.

## Integrity and publication boundary

No runtime, run, navigation, Modes, feature flag, visual, pool, manifest, Knowledge release, persistence, scoring, telemetry, or public artifact changes are authorized. Promote, stop-promotion, the two-item run, both pools, conversion and hold-draw packets, and the rejected activation packet remain byte-identical.

The new packet, graph, evidence, adjudication, generator, test, and this document reside exclusively in protected private paths. Production must return 404 for each.

## Human handoff and next phase

Human review must select or correct the exact position, route, opponent policy, terminal, failure/miss semantics, ply bound, hints, and feedback, then bind the position, graph, engine, and packet digests. Only a later explicitly authorized registration phase may record that decision. Runtime implementation and five-item activation remain out of scope.
