# Stop-Promotion Candidate Human Review Handoff

> Every objective, move, policy, terminal, hint, feedback item, and ply value is **UNAPPROVED — HUMAN REVIEW REQUIRED**.

## Candidate comparison

| Candidate | FEN | WDL category | DTZ | DTM | Score | Disposition |
|---|---|---:|---:|---:|---:|---|
| rule-square-a-pawn-catch-stop-promotion | `k7/8/8/8/p7/8/8/3K4 w - - 0 1` | draw | 0 | 0 | 92 | recommended |
| central-opposition-blockade-stop-promotion | `8/8/8/4k3/4p3/8/4K3/8 w - - 0 1` | draw | 0 | 0 | 61 | rejected-objective-success-ambiguous |
| rook-pawn-corner-fortress-stop-promotion | `8/8/8/8/8/pk6/8/1K6 w - - 0 1` | draw | 0 | 0 | 68 | rejected-disguised-one-move-boundary |

## Recommended candidate

- ID: `rule-square-a-pawn-catch-stop-promotion`
- FEN: `k7/8/8/8/p7/8/8/3K4 w - - 0 1`
- Learner: White
- Designated pawn: black pawn from a4 toward a1
- Position digest: `sha256-b565e2f59641eb28ba6a3862874f89efb72230d16a15ef693724dd18b6fdd417`
- Remote provider: lichess-syzygy-remote@1.0.0
- Local Syzygy verification: no
- Graph states: 14
- Graph digest: `sha256-529b22e9b815518b563df735bdc6c00c39a6d3cef974dcf100eb70dc2e911ad9`
- Engine digest: `sha256-e04bb999b390650a201c69a524dbcc0ca1fc66568fdc5c4b04121f4afab26d90`

## Candidate lines

- **d1c1-wdl-dtz-uci** — Kc1 a3 Kb1 a2+ Ka1 Ka7 Kxa2 — designated-pawn-captured
- **d1c1-maximum-resistance** — Kc1 a3 Kb1 a2+ Ka1 Ka7 Kxa2 — designated-pawn-captured
- **d1c1-authored-deterministic-tree** — Kc1 a3 Kb1 a2+ Ka1 Ka7 Kxa2 — designated-pawn-captured
- **d1c2-wdl-dtz-uci** — Kc2 a3 Kb1 a2+ Ka1 Ka7 Kxa2 — designated-pawn-captured
- **d1c2-maximum-resistance** — Kc2 a3 Kb1 a2+ Ka1 Ka7 Kxa2 — designated-pawn-captured
- **d1c2-authored-deterministic-tree** — Kc2 a3 Kb1 a2+ Ka1 Ka7 Kxa2 — designated-pawn-captured
- **d1d2-wdl-dtz-uci** — Kd2 a3 Kc1 a2 Kb2 a1=B+ — opposing-pawn-promoted
- **d1d2-maximum-resistance** — Kd2 a3 Kc1 a2 Kb2 a1=B+ — opposing-pawn-promoted
- **d1d2-authored-deterministic-tree** — Kd2 a3 Kc1 a2 Kb2 a1=B+ — opposing-pawn-promoted

## Human decisions required

- Is the generated variant educationally natural enough to approve?
- Which first and subsequent defensive moves should form the authored route?
- Which opponent policy and tie-break should be approved?
- Should success require capture or allow an earlier exact terminal?
- Should failure trigger only on legal promotion or earlier exact unstopability?
- How should a legal off-route drawing move be retried?
- Which ply bound, hints, and feedback should be approved?

Complete every null field in `reviewTemplate` and bind all reviewed digests. Nothing in this packet is human approval.

Packet digest: `sha256-2800982f81697f3e5de7db223411b85f2b8215a11c245839d344f884a045d555`
