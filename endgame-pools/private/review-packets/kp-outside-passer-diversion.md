# Human chess review packet — kp-outside-passer-diversion

Decision status: **UNRESOLVED — HUMAN INPUT REQUIRED**

## Position

```
8 . . . . . . . .
7 . . . . . . . .
6 . . k . . . . .
5 . . . . . . . .
4 P . . K . P . .
3 . . . . . . . .
2 . . . . . . . .
1 . . . . . . . .
  a b c d e f g h
```

- FEN: `8/8/2k5/8/P2K1P2/8/8/8 w - - 0 1`
- Side: white
- Objective: only-move
- Authored move: a5 (a4a5)
- Authored alternatives: none

## Authored instruction

- Hint: Advance the distant pawn to test the king’s route.
- Correct feedback: Correct. The outside pawn creates the authored diversion.
- Incorrect feedback: Compare which pawn can pull the king away first.
- Provenance: `ku:endgames:pawn-transformations:outside-passed-pawn/activity:outside-passer:independent-return`

## Machine evidence

- Stockfish: requires-human-review; best move `d4c4`
- Tablebase: retrieved; category win
- WDL-preserving moves: `a4a5`, `f4f5`, `d4e4`, `d4e5`, `d4c3`, `d4d3`, `d4e3`, `d4c4`
- DTZ-optimal moves: `a4a5`, `f4f5`, `d4e4`, `d4e5`, `d4c3`, `d4d3`, `d4e3`, `d4c4`
- Technical observation: only-move-claim-invalid

## Human question

- Does the authored move satisfy the intended pedagogical objective?
- Is the current uniqueness claim defensible?
- Should the position remain eligible for Quick Challenge?

## Reviewer input

Leave the JSON values empty until a real reviewer supplies the decision, rationale, stable private reference, revision, and confirms all three evidence digests.

- Position digest: `sha256-39b739776c0dc1e721e3d619e7f9ca7904606518c0245383377fc74d465f76c1`
- Engine evidence digest: `sha256-9fde01b1b265f8b9513ab417d3ae3309e51728557bd0dbcc335df85d54136fe8`
- Remote evidence digest: `sha256-4048b7ec02a949f3560d81f289e9d4e55b51ae6bb36c030a9c55003c12a75d78`
- Packet digest: `sha256-f92a5ebd2fccf5957c5896f397f79cf318b74422887b4b72b177887d94f6fa4b`
