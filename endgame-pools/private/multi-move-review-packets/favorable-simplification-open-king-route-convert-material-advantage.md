# convert-material-advantage candidate review packet

> Every objective, route, policy, terminal, hint, feedback item, and ply bound is **UNAPPROVED — HUMAN REVIEW REQUIRED**.

## Candidate comparison

| Position | FEN | Category | DTZ | Score | Disposition |
|---|---|---:|---:|---:|---|
| favorable-simplification-open-king-route | `8/8/5k2/3p4/2P1P3/3K4/8/8 w - - 0 1` | win | 1 | 94 | recommended-unapproved |
| king-support-central-pawn | `8/4k3/8/3K4/4P3/8/8/8 w - - 0 1` | win | 5 | 82 | not-recommended-duplicates-promote-semantics |
| king-support-offset-defender | `8/2k5/8/4K3/4P3/8/8/8 w - - 0 1` | win | 3 | 78 | not-recommended-three-piece-promote-overlap |

## Recommendation (not approval)

- Position: `favorable-simplification-open-king-route`
- FEN: `8/8/5k2/3p4/2P1P3/3K4/8/8 w - - 0 1`
- Graph digest: `sha256-9550b394b9b804dc935c6748d25676f2f1775f559c35a2006d00b3fd79512454`
- Engine digest: `sha256-72411f7c2425c17cabb8aa2cd69102d13fe54e5d2e458f7d4fe9cd6477fa5533`
- Position digest: `sha256-58c212529abfe98326f32b40de0ed1737302514b5bda04f47b567fc0ef19a8aa`

Recommended because a five-piece favorable simplification is distinct from the existing pure promotion pilot and retains exact coverage.

## Bounded candidate lines

- **wdl-dtz-uci**: cxd5 Ke5 Kc4 Kd6 Kd4 Kc7 — candidate-success-terminal-unapproved
- **maximum-resistance**: exd5 Ke5 Kc2 Kd6 Kb1 Kc5 — candidate-success-terminal-unapproved
- **authored-deterministic-tree**: cxd5 Ke7 Kc4 Kd6 Kd4 Kc7 — candidate-success-terminal-unapproved

All fields in `reviewTemplate` must be supplied by a human reviewer and bound to the displayed digests.

Packet digest: `sha256-fdc77958dd1f4adfb8fc531ab132ccc4cb66959e1fe892b90e508c36ef39589b`
