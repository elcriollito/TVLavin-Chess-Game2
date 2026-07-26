# Multi-Move Human Review Packet — Coordinate Support / Promote

> Every proposal after the first learner move is **UNAPPROVED — HUMAN REVIEW REQUIRED**.

## Candidate

- FEN: `8/2k5/8/4K3/4P3/8/8/8 w - - 0 1`
- Learner: White
- Existing approval: Ke6 or Kf6 as the first move only
- Remote provider: lichess-syzygy-remote@1.0.0
- Local tablebase verified: no
- Explored states: 19
- Graph digest: `sha256-db8beb46b80d68fa9858211e4a33e969d826f4da6a4f9b17c57bd2f477d8ef85`

## Candidate lines

- **e5e6-wdl-dtz-uci** (legal-promotion): Ke6 [previously-human-approved-first-move] Kb6 [unapproved-human-review-required] e5 [unapproved-human-review-required] Ka5 [unapproved-human-review-required] Kd5 [unapproved-human-review-required] Ka4 [unapproved-human-review-required] e6 [unapproved-human-review-required] Ka3 [unapproved-human-review-required] e7 [unapproved-human-review-required] Ka2 [unapproved-human-review-required] e8=Q [unapproved-human-review-required]
- **e5e6-maximum-resistance** (legal-promotion): Ke6 [previously-human-approved-first-move] Kb6 [unapproved-human-review-required] e5 [unapproved-human-review-required] Ka5 [unapproved-human-review-required] Kd5 [unapproved-human-review-required] Ka4 [unapproved-human-review-required] e6 [unapproved-human-review-required] Ka3 [unapproved-human-review-required] e7 [unapproved-human-review-required] Ka2 [unapproved-human-review-required] e8=Q [unapproved-human-review-required]
- **e5e6-authored-deterministic-tree** (legal-promotion): Ke6 [previously-human-approved-first-move] Kb6 [unapproved-human-review-required] e5 [unapproved-human-review-required] Ka5 [unapproved-human-review-required] Kd5 [unapproved-human-review-required] Ka4 [unapproved-human-review-required] e6 [unapproved-human-review-required] Ka3 [unapproved-human-review-required] e7 [unapproved-human-review-required] Ka2 [unapproved-human-review-required] e8=Q [unapproved-human-review-required]
- **e5f6-wdl-dtz-uci** (legal-promotion): Kf6 [previously-human-approved-first-move] Kb6 [unapproved-human-review-required] e5 [unapproved-human-review-required] Ka5 [unapproved-human-review-required] e6 [unapproved-human-review-required] Ka4 [unapproved-human-review-required] e7 [unapproved-human-review-required] Ka3 [unapproved-human-review-required] e8=Q [unapproved-human-review-required]
- **e5f6-maximum-resistance** (legal-promotion): Kf6 [previously-human-approved-first-move] Kb6 [unapproved-human-review-required] e5 [unapproved-human-review-required] Ka5 [unapproved-human-review-required] e6 [unapproved-human-review-required] Ka4 [unapproved-human-review-required] e7 [unapproved-human-review-required] Ka3 [unapproved-human-review-required] e8=Q [unapproved-human-review-required]
- **e5f6-authored-deterministic-tree** (legal-promotion): Kf6 [previously-human-approved-first-move] Kb6 [unapproved-human-review-required] e5 [unapproved-human-review-required] Ka5 [unapproved-human-review-required] e6 [unapproved-human-review-required] Ka4 [unapproved-human-review-required] e7 [unapproved-human-review-required] Ka3 [unapproved-human-review-required] e8=Q [unapproved-human-review-required]

## Policy candidates

- **Candidate A — WDL then DTZ then UCI** — Exact and compact. Risk: DTZ play may look unnatural. **UNAPPROVED**
- **Candidate B — Maximum resistance** — Tests conversion technique longer. Risk: Can produce repetitive king movement. **UNAPPROVED**
- **Candidate C — Authored deterministic tree** — Human can choose the clearest defense. Risk: Requires explicit human selection of every reply. **UNAPPROVED**

## Success candidates

- legal-promotion: clarity high; complexity low. **UNAPPROVED**
- forced-promotion: clarity medium; complexity high. **UNAPPROVED**
- approved-conversion-position: clarity medium; complexity medium. **UNAPPROVED**

## Failure candidates

- tablebase result changes from win to draw or loss. **UNAPPROVED**
- designated pawn is lost. **UNAPPROVED**
- promotion becomes impossible. **UNAPPROVED**
- approved maximum ply is reached. **UNAPPROVED**
- authored-concept miss (not automatically learner failure). **UNAPPROVED**
- technical evaluator failure (always neutral). **UNAPPROVED**

## Ply recommendation

Minimum 9; recommended 12; maximum safe 18. **UNAPPROVED**.

## Human handoff

Complete every null field in `reviewTemplate`, bind the four reviewed digests, and choose one allowlisted decision. Machine evidence is not approval.

Packet digest: `sha256-c7b361fe87f990990974c606e3a1029b54e395f57a2873f1539dabaf00cf8a10`
