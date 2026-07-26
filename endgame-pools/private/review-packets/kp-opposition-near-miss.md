# Human chess review packet — kp-opposition-near-miss

Decision status: **UNRESOLVED — HUMAN INPUT REQUIRED**

## Position

```
8 . . . . . . . .
7 . . . . . . . .
6 . . . . . k . .
5 . . . . . . . .
4 . . . K . . . .
3 . . . . . . . .
2 P . . . . . . .
1 . . . . . . . .
  a b c d e f g h
```

- FEN: `8/8/5k2/8/3K4/8/P7/8 w - - 0 1`
- Side: white
- Objective: only-move
- Authored move: Ke4 (d4e4)
- Authored alternatives: none

## Authored instruction

- Hint: Move toward a direct king relationship.
- Correct feedback: Correct. The king approaches the direct relationship.
- Incorrect feedback: Compare the king geometry before choosing the route.
- Provenance: `ku:endgames:pawn-foundations:direct-opposition/activity:opposition:independent-near-miss`

## Machine evidence

- Stockfish: authored-answer-questioned; best move `d4d5`
- Tablebase: retrieved; category win
- WDL-preserving moves: `d4c5`, `d4d5`
- DTZ-optimal moves: `d4c5`, `d4d5`
- Technical observation: authored-move-tablebase-invalid

## Human question

- Does the authored move satisfy the intended pedagogical objective?
- Is the current uniqueness claim defensible?
- Should the position remain eligible for Quick Challenge?

## Reviewer input

Leave the JSON values empty until a real reviewer supplies the decision, rationale, stable private reference, revision, and confirms all three evidence digests.

- Position digest: `sha256-997ea00de823dffd5fa7fc0d588a700a6fb8908d9742016a9e0a22a29da6a6f5`
- Engine evidence digest: `sha256-7aef1d4d4d2b42cb940856c1ca7a1754d3ecd75226875963c473628006e04198`
- Remote evidence digest: `sha256-e896d4a6346df13aa3f5817be661bf9889f0ed99144f92e50d812ed4e9fd7c96`
- Packet digest: `sha256-b919d6e2f6fc32444eab7ee30da159c761bd4bd93d6b1d735748044233c0e64b`
