# Human chess review packet — kp-restrained-approach

Decision status: **UNRESOLVED — HUMAN INPUT REQUIRED**

## Position

```
8 . . . . . . . .
7 . . . . . . . .
6 . . . k . . . .
5 . . . p . . . .
4 . . . P . . . .
3 . . K . . . . .
2 . . . . . . . .
1 . . . . . . . .
  a b c d e f g h
```

- FEN: `8/8/3k4/3p4/3P4/2K5/8/8 w - - 0 1`
- Side: white
- Objective: authored-move
- Authored move: Kb4 (c3b4)
- Authored alternatives: Kb3

## Authored instruction

- Hint: Approach the fixed pawn without releasing the restraint.
- Correct feedback: Correct. This is an authored restrained approach.
- Incorrect feedback: Compare the king routes while keeping the pawn fixed.
- Provenance: `ku:endgames:pawn-weaknesses:fix-pawn-weakness/activity:fix-weakness:independent-route`

## Machine evidence

- Stockfish: requires-human-review; best move `c3b3`
- Tablebase: retrieved; category draw
- WDL-preserving moves: `c3b2`, `c3c2`, `c3d2`, `c3b3`, `c3d3`, `c3b4`
- DTZ-optimal moves: `c3b2`, `c3c2`, `c3d2`, `c3b3`, `c3d3`, `c3b4`
- Technical observation: authored-valid-among-equivalents

## Human question

- Does the authored move satisfy the intended pedagogical objective?
- Is the current uniqueness claim defensible?
- Should the position remain eligible for Quick Challenge?

## Reviewer input

Leave the JSON values empty until a real reviewer supplies the decision, rationale, stable private reference, revision, and confirms all three evidence digests.

- Position digest: `sha256-50358003e133d2a766b3680d669717eda9c08468f13354ce0dc7c3219c739c73`
- Engine evidence digest: `sha256-35bac4a28016dc88a4fdd734e686416ed08e0e80180c6e213aee4b83bae31fba`
- Remote evidence digest: `sha256-c1f1db0a6752b5acc33792be39fd1ec9e07ae43fcb1a08efda9767a65d501549`
- Packet digest: `sha256-f28aa60111469b27bce2dd67431e6e3f2ce3ca834a94f780562e749d3e184c64`
