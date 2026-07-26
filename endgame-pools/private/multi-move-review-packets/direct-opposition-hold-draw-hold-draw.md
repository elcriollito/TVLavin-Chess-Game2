# hold-draw candidate review packet

> Every objective, route, policy, terminal, hint, feedback item, and ply bound is **UNAPPROVED — HUMAN REVIEW REQUIRED**.

## Candidate comparison

| Position | FEN | Category | DTZ | Score | Disposition |
|---|---|---:|---:|---:|---|
| direct-opposition-hold-draw | `8/8/4k3/8/4K3/8/P7/8 w - - 0 1` | draw | 0 | 91 | recommended-unapproved |
| key-square-denial-hold-draw | `8/3k4/8/8/3P4/3K4/8/8 w - - 0 1` | draw | 0 | 75 | not-recommended-attacker-side-to-move |
| rook-pawn-corner-fortress | `8/8/8/8/8/pk6/8/1K6 w - - 0 1` | draw | 0 | 69 | not-recommended-overlaps-stop-promotion |

## Recommendation (not approval)

- Position: `direct-opposition-hold-draw`
- FEN: `8/8/4k3/8/4K3/8/P7/8 w - - 0 1`
- Graph digest: `sha256-da2dcf8744dc5cd9f2a968ed23f4ebddac2cdfe6cf3325c2968bf331341eed48`
- Engine digest: `sha256-d64d360e8f9c16840d2b63053b008806dd95a8c1d8488639c2fc3a2d7b7d11ac`
- Position digest: `sha256-9cb54a040b9f403c41573210f5a463e53004dce066b209249e1db47a33580af1`

Recommended because opposition defense preserves a draw over repeated decisions without reducing the mission to catching one pawn.

## Bounded candidate lines

- **wdl-dtz-uci**: a3 Kd6 a4 Kc5 a5 Kb5 a6 Kxa6 — candidate-success-terminal-unapproved
- **maximum-resistance**: a3 Kd6 a4 Kc5 a5 Kb5 a6 Kxa6 — candidate-success-terminal-unapproved
- **authored-deterministic-tree**: a3 Kd6 a4 Kc5 a5 Kb5 a6 Kxa6 — candidate-success-terminal-unapproved

All fields in `reviewTemplate` must be supplied by a human reviewer and bound to the displayed digests.

Packet digest: `sha256-0d9f313349a135d92505ea8241a3fd4898eff8ca255e350ff4d6b6dff9599f39`
