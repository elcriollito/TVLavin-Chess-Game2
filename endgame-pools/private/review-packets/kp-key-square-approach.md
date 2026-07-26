# Human chess review packet — kp-key-square-approach

Decision status: **UNRESOLVED — HUMAN INPUT REQUIRED**

## Position

```
8 . . . . . . . .
7 . . . . k . . .
6 . . . . . . . .
5 . . . P . . . .
4 . . K . . . . .
3 . . . . . . . .
2 . . . . . . . .
1 . . . . . . . .
  a b c d e f g h
```

- FEN: `8/4k3/8/3P4/2K5/8/8/8 w - - 0 1`
- Side: white
- Objective: only-move
- Authored move: Kc5 (c4c5)
- Authored alternatives: none

## Authored instruction

- Hint: Choose the king route toward the useful entry square.
- Correct feedback: Correct. The king approaches the target square.
- Incorrect feedback: Recheck which king square supports the pawn most directly.
- Provenance: `ku:endgames:pawn-foundations:key-squares/activity:key-squares:independent-target`

## Machine evidence

- Stockfish: requires-human-review; best move `c4d3`
- Tablebase: retrieved; category draw
- WDL-preserving moves: `d5d6`, `c4b3`, `c4c3`, `c4d3`, `c4b4`, `c4d4`, `c4b5`, `c4c5`
- DTZ-optimal moves: `d5d6`, `c4b3`, `c4c3`, `c4d3`, `c4b4`, `c4d4`, `c4b5`, `c4c5`
- Technical observation: only-move-claim-invalid

## Human question

- Does the authored move satisfy the intended pedagogical objective?
- Is the current uniqueness claim defensible?
- Should the position remain eligible for Quick Challenge?

## Reviewer input

Leave the JSON values empty until a real reviewer supplies the decision, rationale, stable private reference, revision, and confirms all three evidence digests.

- Position digest: `sha256-36e2cc23e01b579c145f68a0aa683a6a02f07273c727e21fa7180a952cfd61ca`
- Engine evidence digest: `sha256-09bd4d4c8b2af224cf92703b587d31e83f0adb7014f62638370e7bd381b3831a`
- Remote evidence digest: `sha256-8d84f8758ec08145542f13af8b7b38656309fff84bb0f7e0a0cf7c1516fd81d2`
- Packet digest: `sha256-fbb7bc86d9b29eabf8bb4a4a30e3e366e5e21f3be2a3cfe73fdf1e20be99aae0`
