# Human chess review packet — kp-breakthrough-side-to-move

Decision status: **UNRESOLVED — HUMAN INPUT REQUIRED**

## Position

```
8 . . . . . . . .
7 p p p . . . . .
6 . . . . . . . .
5 P P P . . . . .
4 . . . . . . . .
3 . . . . . . . .
2 . . . . . . . .
1 . . . . K . . k
  a b c d e f g h
```

- FEN: `8/ppp5/8/PPP5/8/8/8/4K2k b - - 0 1`
- Side: black
- Objective: only-move
- Authored move: b6 (b7b6)
- Authored alternatives: none

## Authored instruction

- Hint: Begin with the central pawn of the three-pawn front.
- Correct feedback: Correct. The breakthrough begins with the authored pawn move.
- Incorrect feedback: Recalculate the capture sequence from the side-to-move fact.
- Provenance: `ku:endgames:pawn-transformations:pawn-breakthrough/activity:pawn-breakthrough:independent-turn`

## Machine evidence

- Stockfish: authored-answer-questioned; best move `h1g1`
- Tablebase: retrieved; category maybe-loss
- WDL-preserving moves: `h1g1`, `h1g2`, `h1h2`, `a7a6`, `b7b6`, `c7c6`
- DTZ-optimal moves: unavailable
- Technical observation: only-move-claim-invalid

## Human question

- Does the authored move satisfy the intended pedagogical objective?
- Is the current uniqueness claim defensible?
- Should the position remain eligible for Quick Challenge?

## Reviewer input

Leave the JSON values empty until a real reviewer supplies the decision, rationale, stable private reference, revision, and confirms all three evidence digests.

- Position digest: `sha256-da8f978676c0adf91f1bc56ae5e8e888f0991c10e51d2d4a73976f3794aca94a`
- Engine evidence digest: `sha256-de891d78878e6a9d19cd5fbc94b61320ea59f160871df917cbe6fa4d40e8304c`
- Remote evidence digest: `sha256-a5c46e9e2c53f16c7148d81d1dd7765cf82513faceacd4de5bb72f6199df6f60`
- Packet digest: `sha256-91888138568587ab3a197188b042651631a5e358f80c1f4ab7be08eac8001e33`
