# Season 10.6B — Verified Multi-Move Promote Technical Pilot

## Baseline and approval

Work began on clean `main` at `c1c835787f0a9a1608c1a7bfb785284a07f870fa`.
The private approval registers `approve-promote-pilot`, the exact supplied
rationale, reviewer reference and revision, and all four reviewed digests.
Registration fails closed if any binding or rationale is missing or changed.

## Objective and tree

The sole objective is `promote@1.0.0`: White must promote the designated e4
pawn to a queen within 12 plies. The approved branches are:

- `Ke6 Kb6 e5 Ka5 Kd5 Ka4 e6 Ka3 e7 Ka2 e8=Q`;
- `Kf6 Kb6 e5 Ka5 e6 Ka4 e7 Ka3 e8=Q`.

The opponent uses `authored-deterministic-tree@1.0.0`. Runtime never substitutes
a reply and never calls a tablebase, engine, or backend.

## Controller and semantics

The subordinate controller owns configured, loading, learner validation,
opponent evaluation/movement, objective evaluation, success, failure, technical,
abandoned, and error phases. Generation ownership, submission locking, terminal
guards, and retry invalidation reject duplicates and stale callbacks.

Bounded evidence classifies a non-winning deviation as objective failure. A
winning deviation outside the tree is a truthful concept miss and leaves the
approved node displayed. Missing bounded data is neutral technical-unavailable.

## Artifact, flag, and flow

The immutable public artifact is `kp-coordinate-support-promote@1.0.0`, pinned
by FNV-1a fingerprint and canonical SHA-256. It contains only approved branches,
bounded classifications, objective, hints, feedback, provenance, and safe
verification metadata. There is no `latest`.

The strict hidden route is
`/endgame-trainer?trainerV2=1&multiMovePilot=1`. Guided Study takes precedence.
Without the pilot flag Quick Challenge is unchanged, and V1 remains default.
There is one Start action, Hint, Retry, Exit, concise feedback, and summary.
No public navigation entry exists.

## Lifecycle and persistence

One Board API instance is reused across learner moves, replies, and retry. No
Stockfish Worker is created. Reduced motion removes the short opponent delay.
The third hint removes independent-success eligibility. There is no timer,
persistent score, Personal Best, leaderboard, Knowledge evidence, Training
Memory, Mastery, Recommendation mutation, account, or cloud persistence.

## Accessibility, responsive behavior, and security

Automated coverage checks title/objective discovery, live feedback, shared
keyboard board behavior, focusable 44px controls, reduced motion, Axe, and
widths 320–1440px. No manual screen-reader claim is made.

Route, artifact identity, FEN, policy, and versions are allowlisted. Canonical
integrity fails closed. Malformed branches, missing replies, stale operations,
and unknown deviations cannot become learner failure. Private adjudication,
rationale, reviewer, packet, full graph, evidence, scripts, tests, and this
document remain excluded.

## Rollback, limitations, and readiness

Rollback removes the strict pilot branch and descriptor without touching V1,
Guided Study, Quick Challenge, pools 1.0.0/1.1.0, or session schema 2.0.0.
This remains one unsigned technical item backed by archived remote rather than
local Syzygy evidence, with no competitive timer or persistence.

Classification after verification: `technical-pilot-ready`, not production-ready
Endgame Run. Visual redesign can now study the hidden pilot without changing its
contracts. Next: human accessibility review and a second independently approved
multi-move objective.
