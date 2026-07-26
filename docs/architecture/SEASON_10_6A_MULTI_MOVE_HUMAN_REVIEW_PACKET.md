# Season 10.6A — Multi-Move Human Review Packet

## 1. Baseline

Work began on clean `main` at `e1504c669009c15b8f8a3c456a640f452c1a8695`, equal to `origin/main`.

## 2. Season 10.6 block

Runtime implementation correctly stopped because no human had approved a complete multi-move experience.

## 3. Candidate selection

The candidate is `kp-coordinate-support`, FEN `8/2k5/8/4K3/4P3/8/8/8 w - - 0 1`, for a proposed `promote` objective.

## 4. Existing human approval

Season 10.5B approves only `Ke6`, alternative `Kf6`, and the forward escort concept.

## 5. Missing approvals

Later learner moves, opponent replies, policy, terminal definitions, maximum ply, hints, feedback, scoring, and timeout behavior remain unapproved.

## 6. Tablebase-tree method

The private graph contains six reproducible candidate lines: two approved first moves times three candidate policies. Every expanded node retains all provider moves after local rules validation. This bounded-policy graph avoids falsely presenting a combinatorial full game tree.

## 7. Stockfish comparison

Pinned Stockfish 18 evidence is attached as secondary evidence. Tablebase results remain authoritative for theoretical claims within three-piece coverage.

## 8. Opponent-policy candidates

Candidates are WDL/DTZ/UCI, maximum resistance, and a human-authored deterministic tree. None is selected.

## 9. Success-condition candidates

Legal promotion, tablebase-forced promotion, and a human-approved conversion terminal remain separate unresolved options.

## 10. Failure-condition candidates

Loss of theoretical win, pawn loss, impossible promotion, ply limit, concept miss, and technical failure are separated. Technical failure is neutral.

## 11. Maximum-ply candidates

The observed candidate lines require 9 or 11 plies. The packet therefore proposes
minimum 9, recommended 12, and maximum safe 18 plies. No value is approved.

## 12. Hint candidates

Concept, direction, and next-step reveal copy are proposals marked human-review required.

## 13. Feedback candidates

Progress, damage, lost-win, opponent, success, technical, and retry copy are proposals marked human-review required.

## 14. Human-decision boundary

Every review field is null. A human must choose an allowlisted decision and bind position, tree, engine, and packet digests.

## 15. Private storage

Packets live in `endgame-pools/private/multi-move-review-packets/`; normalized state evidence lives in `endgame-pools/private/multi-move-tablebase/`.

## 16. Security

The provider origin is fixed, moves are locally replayed, graph expansion is bounded, digests are canonical, and no runtime network or public artifact exists.

## 17. Tests

Focused tests cover candidate identity, first moves, local legality/resulting FEN, digest stability, empty human fields, proposal labels, and immutable public identities.

## 18. Known limitations

Evidence is remote rather than local Syzygy; the graph is a bounded comparison of policy lines, not every possible game; no policy or learner line is approved.

## 19. Season 10.6B readiness

10.6B remains blocked until a human completes all review fields with exact digest bindings.
