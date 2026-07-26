# activate-king candidate review packet

> Every objective, route, policy, terminal, hint, feedback item, and ply bound is **UNAPPROVED — HUMAN REVIEW REQUIRED**.

## Candidate comparison

| Position | FEN | Category | DTZ | Score | Disposition |
|---|---|---:|---:|---:|---|
| king-activation-support-region | `8/7k/8/8/8/3P4/2K5/8 w - - 0 1` | win | 1 | 89 | recommended-unapproved |
| king-activation-mirrored-region | `k7/8/8/8/8/4P3/5K2/8 w - - 0 1` | win | 1 | 81 | not-recommended-mirrored-duplicate |
| second-target-king-entry | `8/8/4k3/8/P2K3P/8/8/8 w - - 0 1` | win | 1 | 73 | not-recommended-target-region-needs-more-authoring |

## Recommendation (not approval)

- Position: `king-activation-support-region`
- FEN: `8/7k/8/8/8/3P4/2K5/8 w - - 0 1`
- Graph digest: `sha256-949cd346baac5804d90abf79bd338cd80bbaa05865766eeab3cedc0978913b6e`
- Engine digest: `sha256-47cc1a45fcf3b57ed69bfe06f86df0d6123f0bea83275beb8fa1175b3ba93008`
- Position digest: `sha256-6b694d3f4c3abdb822b6789b8f0d60afb7547bb4283f11c40b722b2cf1a7c297`

Recommended because the proposed b3/c3 region makes king activation objectively observable while exact winning evidence remains available.

## Bounded candidate lines

- **wdl-dtz-uci**: Kb2 Kg6 Ka3 Kf5 Kb4 Ke6 Kc5 Kd7 Kd5 Kc7 Ke6 Kb6 d4 Ka5 — maximum-ply-boundary
- **maximum-resistance**: Kb1 Kg6 Ka2 Kf5 Kb3 — candidate-success-terminal-unapproved
- **authored-deterministic-tree**: Kb3 — candidate-success-terminal-unapproved

All fields in `reviewTemplate` must be supplied by a human reviewer and bound to the displayed digests.

Packet digest: `sha256-0c2535abc7b9c1fff10faf980473a4377fa6eb33e02c6f815177f604f6e9930f`
