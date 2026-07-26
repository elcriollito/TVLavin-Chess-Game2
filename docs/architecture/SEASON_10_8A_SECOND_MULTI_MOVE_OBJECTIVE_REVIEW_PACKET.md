# Season 10.8A — Second Multi-Move Objective Review Packet

Status: private candidate evidence complete; human decision pending

## 1. Baseline

Work began on clean `main` at `dbbd2d5da92b4eee6584b7717b30aee41c8410ec`,
equal to `origin/main` with divergence 0/0.

## 2. Season 10.7 state

The board-first V2 visual experience is released. Season 10.8A makes no HTML,
CSS, navigation, responsive, accessibility, or browser-runtime change.

## 3. Existing promote pilot

`kp-coordinate-support-promote@1.0.0` remains the only public multi-move pilot.
Its artifact, controller, flag, two branches, fingerprint
`epilot-fnv1a32-f5f5df1f`, and digest
`sha256-076a58b2983d66d7f8035ebfb2b52946cb88e92c444cb59bafc9c140455117c6`
are unchanged.

## 4. Objective-genericity audit

The private eligibility matrix already models `stop-promotion` as a tablebase-
required multi-move objective with no runtime support. The public controller is
intentionally specialized to the approved promote artifact. That specialization
does not block private discovery, but it must not be generalized before a human
approves an objective, tree, policy, terminals, and copy. The evidence pipeline,
ChessRulesFacade, canonical hashing, remote adapter, Stockfish runner, packet
boundary, and public exclusions are reusable without production mutation.

## 5. Candidate search method

The search audited both pool versions, Knowledge Units and releases, Endgame
Library positions, authoring sources, private review/evidence fixtures, Trainer
fixtures, and tests. The existing rule-of-the-square example has the right
concept but is deliberately outside the pawn square and cannot satisfy the
objective. Three private three-piece variants were therefore queried against
the approved remote provider and locally replayed.

## 6. Candidates considered

| Candidate | Family | FEN | Result | DTZ/DTM | Score |
|---|---|---|---|---|---:|
| `rule-square-a-pawn-catch-stop-promotion` | king catches pawn | `k7/8/8/8/p7/8/8/3K4 w - - 0 1` | draw | 0/0 | 92 |
| `central-opposition-blockade-stop-promotion` | opposition blockade | `8/8/8/4k3/4p3/8/4K3/8 w - - 0 1` | draw | 0/0 | 61 |
| `rook-pawn-corner-fortress-stop-promotion` | rook-pawn exception | `8/8/8/8/8/pk6/8/1K6 w - - 0 1` | draw | 0/0 | 68 |

Every recommendation and score is machine-authored and unapproved.

## 7. Recommended candidate

The recommended candidate is `rule-square-a-pawn-catch-stop-promotion`. White
moves and must stop the black a4 pawn. `Kc1` and `Kc2` lead through clear
seven-ply capture lines under all three candidate policies. `Kd2` preserves
the theoretical draw but permits `a1=B+`, exposing the essential distinction
between WDL preservation and objective completion.

## 8. Rejected candidates

The central blockade has many drawing first moves and no crisp early success
boundary. The rook-pawn fortress has only `Ka1` as a drawing first move and is
too close to a disguised one-move selection. Neither is rejected as chess
content; each is rejected only for this candidate packet.

## 9. Position verification

The recommended FEN is legal standard chess, White to move, three pieces, no
castling or en-passant state, and complete remote tablebase coverage. The
designated pawn identity is black pawn a4 with promotion square a1.

## 10. Tablebase evidence

The authoring-only provider is `lichess-syzygy-remote@1.0.0`. Fourteen normalized
states bind exact request, response, and evidence digests. Every returned move,
SAN, and resulting FEN is replayed through ChessRulesFacade. This is remote
evidence; local Syzygy verification remains false.

## 11. State graph

The deterministic graph expands the three initial WDL-preserving moves across
WDL/DTZ/UCI, maximum-resistance, and authored-tree candidate policies. Each
expanded node retains and classifies every validated provider move. Expansion
stops on designated-pawn capture, promotion, repetition, missing policy move,
or 14 plies. It contains 14 states and nine policy lines.

## 12. Opponent-policy candidates

- WDL → DTZ → UCI is exact and compact but may select unnatural distance play.
- Maximum resistance uses greatest absolute DTZ and may increase repetition.
- Authored deterministic tree permits the clearest validated pawn advances but
  requires explicit human selection at every node.

All three are unapproved and require no runtime network after publication.

## 13. Success candidates

Pawn capture is clearest and uses board state alone. Promotion-impossible can
finish earlier but requires exact approved offline classifications. An approved
defensive terminal is deterministic after review but risks a less transparent
exercise boundary. No success condition is approved.

## 14. Failure candidates

Legal promotion and a proven draw-to-loss transition are objective-failure
candidates. An exact unstoppable state could permit earlier failure only after
review. A holding off-route move is a concept miss, not a loss. Repetition and
maximum ply are unresolved boundaries. Technical unavailability is always
neutral.

## 15. Promotion semantics

Queen, rook, bishop, and knight promotions all violate the proposed stop
objective. The observed `Kd2` policy line ends in bishop promotion while the
chess position remains tablebase-drawn. This proves that promotion semantics
cannot be inferred from WDL. Whether failure occurs at exact forced promotion
or only when promotion legally occurs is a human decision.

## 16. Maximum-ply candidates

Shortest and longest captured-pawn candidate lines are both seven plies.
Candidate values are minimum 7, recommended 10, and maximum safe 14. A repeated
canonical FEN should stop or retry neutrally. The fifty-move rule is irrelevant.
No ply value is approved.

## 17. Hint proposals

Concept, direction, and current-node reveal hints are included. Every hint is
marked `unapproved-human-review-required`.

## 18. Feedback proposals

The packet proposes copy for progress, capture, exact prevention, off-route
holding moves, proven loss, pawn advance, technical failure, retry, and summary.
Every message is marked `unapproved-human-review-required`.

## 19. Stockfish comparison

Pinned Stockfish 18 ran at depth 18, MultiPV 3, Threads 1, Hash 64 MB, Ponder
false, with the 30-second policy. Its best move is `Kd2`. Tablebase confirms
that move holds the draw, but candidate policies demonstrate that it permits
promotion. Stockfish is therefore useful secondary evidence and cannot approve
this objective.

## 20. Human-review boundary

All 24 required human fields are null. No policy, learner route, opponent reply,
terminal, promotion rule, ply limit, hint, or feedback is approved. A reviewer
must choose an allowlisted decision and bind the position, graph, engine, and
packet digests.

## 21. Private storage

The packet and handoff are under `endgame-pools/private/multi-move-review-packets/`.
The graph is under `endgame-pools/private/multi-move-tablebase/`, and Stockfish
evidence is under `endgame-pools/private/evidence/`. No public artifact exists.

## 22. Security

The provider origin is fixed HTTPS, responses are schema-checked, every move is
locally replayed, breadth is bounded, canonical hashes bind all evidence, and
the generated files remain protected by both release mechanisms.

## 23. Tests

Focused tests verify identity, legality, side, pawn, coverage, comparisons,
every graph move/FEN, determinism, bounds, policy candidates, promotion
completeness, Stockfish identity/policy, digests, null review fields, private
exclusion, and byte-level integrity of public/runtime Season 10.6B/10.7 files.

## 24. Existing pilot integrity

The public promote artifact and both runtime modules are byte-identical to the
Season 10.7 baseline. No flag, policy, route, navigation entry, or public
objective was added.

## 25. Visual integrity

`endgame-trainer.html` and `css/endgame-trainer.css` remain byte-identical.
The desktop 60/40 layout, tablet stack, mobile order, feedback hierarchy, CTA
rules, Modes menu, and hidden-pilot presentation are untouched.

## 26. Known limitations

Evidence is remote rather than local Syzygy. The graph is a bounded policy
comparison, not the complete game tree. DTM availability is provider-dependent.
The generated variant has not been human-approved for naturalness. Machine
suitability scores are comparative notes, not chess judgments.

## 27. Season 10.8B readiness

Season 10.8B is blocked on a completed human review with exact digest bindings.
Runtime design must then decide whether to add a generic controller or a second
allowlisted specialized adapter without weakening the promote pilot.

## 28. Endgame Run readiness

This packet demonstrates objective-level architectural reuse but does not
authorize Endgame Run. Timer trust, recovery, Personal Best, leaderboard,
signing, broader accessibility evidence, and multiple approved objective
artifacts remain unresolved.
