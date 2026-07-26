# Human chess review packet — kp-safe-king-approach

Decision status: **UNRESOLVED — HUMAN INPUT REQUIRED**

## Position

```
8 k . . . . . . .
7 . . . . . . . .
6 . . . . . . . .
5 . . . . . . . .
4 . . . . . . . .
3 . . . . P . . .
2 . . . . . K . .
1 . . . . . . . .
  a b c d e f g h
```

- FEN: `k7/8/8/8/8/4P3/5K2/8 w - - 0 1`
- Side: white
- Objective: authored-move
- Authored move: Kf3 (f2f3)
- Authored alternatives: Ke2

## Authored instruction

- Hint: Choose a safe king route that stays near the pawn.
- Correct feedback: Correct. This is an authored safe king approach.
- Incorrect feedback: Keep the king’s route coordinated with the pawn.
- Provenance: `ku:endgames:pawn-foundations:activate-the-king/activity:activate-king:independent-transfer`

## Machine evidence

- Stockfish: requires-human-review; best move `f2g2`
- Tablebase: retrieved; category win
- WDL-preserving moves: `e3e4`, `f2f3`, `f2g3`, `f2e2`, `f2g2`, `f2e1`, `f2f1`, `f2g1`
- DTZ-optimal moves: `e3e4`, `f2e2`, `f2g2`
- Technical observation: authored-valid-among-equivalents

## Human question

- Does the authored move satisfy the intended pedagogical objective?
- Is the current uniqueness claim defensible?
- Should the position remain eligible for Quick Challenge?

## Reviewer input

Leave the JSON values empty until a real reviewer supplies the decision, rationale, stable private reference, revision, and confirms all three evidence digests.

- Position digest: `sha256-f48e37ab1bbc07c9e8d3dffc995f57e51af94f74d5299917833fdda8720f2976`
- Engine evidence digest: `sha256-1e066c601a30b70ea109c32a673414cede9eb792af9a68626b276825088639bb`
- Remote evidence digest: `sha256-b60e0e35e8d7a323b2810d2791873287b340e1333d9cb3c1f48f2c79d6f7c42b`
- Packet digest: `sha256-dfe1b5643a563d32e8155fc2bd457a37fd179bf5676f07df2e47fc58326986c6`
