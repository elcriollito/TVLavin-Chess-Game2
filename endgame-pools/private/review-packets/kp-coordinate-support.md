# Human chess review packet — kp-coordinate-support

Decision status: **UNRESOLVED — HUMAN INPUT REQUIRED**

## Position

```
8 . . . . . . . .
7 . . k . . . . .
6 . . . . . . . .
5 . . . . K . . .
4 . . . . P . . .
3 . . . . . . . .
2 . . . . . . . .
1 . . . . . . . .
  a b c d e f g h
```

- FEN: `8/2k5/8/4K3/4P3/8/8/8 w - - 0 1`
- Side: white
- Objective: only-move
- Authored move: Kd5 (e5d5)
- Authored alternatives: none

## Authored instruction

- Hint: Keep the king close enough to support the pawn’s route.
- Correct feedback: Correct. The king and pawn remain coordinated.
- Incorrect feedback: Look for the king move that keeps the support route connected.
- Provenance: `ku:endgames:pawn-foundations:convert-with-king-support/activity:king-support:independent-transfer`

## Machine evidence

- Stockfish: authored-answer-questioned; best move `e5e6`
- Tablebase: retrieved; category win
- WDL-preserving moves: `e5e6`, `e5f6`, `e5f5`, `e5f4`
- DTZ-optimal moves: `e5e6`, `e5f6`
- Technical observation: authored-move-tablebase-invalid

## Human question

- Does the authored move satisfy the intended pedagogical objective?
- Is the current uniqueness claim defensible?
- Should the position remain eligible for Quick Challenge?

## Reviewer input

Leave the JSON values empty until a real reviewer supplies the decision, rationale, stable private reference, revision, and confirms all three evidence digests.

- Position digest: `sha256-50d8e785332d770dd75862892b141dadc772a9523dea1f2f6767e16e8c6bca8d`
- Engine evidence digest: `sha256-e5c4c7c1f200949c3ece104bb879f07c9f0910f55954c9df1b61887c609a1813`
- Remote evidence digest: `sha256-473231eb64958acdf2cd91664f4c3958e547641550216a1c3a67b7617777e27a`
- Packet digest: `sha256-e4b23bfa2377971ed8df331f15d7b273b19fd64b5e6d682fd4a44868237f4dbe`
