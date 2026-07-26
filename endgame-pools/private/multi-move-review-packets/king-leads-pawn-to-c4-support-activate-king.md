# Activate-king replacement candidate review

> **UNAPPROVED — HUMAN REVIEW REQUIRED.** This packet does not implement or approve runtime content.

## Candidate comparison

| Candidate | FEN | Result | DTZ | DTM | Immediate success moves | Disposition |
|---|---|---:|---:|---:|---:|---|
| king-leads-pawn-to-c4-support | `8/7k/8/8/8/3P4/8/2K5 w - - 0 1` | win | 13 | 41 | 0 | recommended-unapproved |
| king-leads-pawn-to-c4-support-closer-defender | `8/8/7k/8/8/3P4/8/2K5 w - - 0 1` | win | 13 | 41 | 0 | alternate-not-recommended-near-duplicate |
| king-leads-e-pawn-to-f4-support | `k7/8/8/8/8/4P3/8/5K2 w - - 0 1` | win | 13 | 41 | 0 | alternate-not-recommended-mirrored-concept |

## Recommended replacement

- Position: `king-leads-pawn-to-c4-support`
- FEN: `8/7k/8/8/8/3P4/8/2K5 w - - 0 1`
- Mission: Bring the king to c4 before advancing the d-pawn while preserving the win.
- Proposed authored line: Kb2 Kg6 Kb3 Kf5 Kc4
- Position digest: `sha256-2300d646206254ff076ad829f368b6316fb44514802d3bfab1ff3f258eb8214f`
- Graph digest: `sha256-30bc29f005b681528a3858b5f1f648ac107a0f0d0b8e743926e62ec9c3993387`
- Engine digest: `sha256-bc41fcee494ef9d9711a2a07b2b82765df4f02a72e6b18c14a68b30cacf7d9f9`

No legal first move completes the c4 support event. The premature pawn push `d4` changes the exact result from win to draw.

Every field in `reviewTemplate` remains null and must be supplied by a human reviewer.

Packet digest: `sha256-78f1d981fa283b6146bcd3ee65633fe9f2649617264891c234b2982e9cc3c596`
