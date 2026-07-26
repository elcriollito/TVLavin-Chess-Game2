# Human chess review packet — kp-majority-improve-first

Decision status: **UNRESOLVED — HUMAN INPUT REQUIRED**

## Position

```
8 . . . . . . . .
7 . . . . . . . .
6 . . . . . . k .
5 . . . . . p p .
4 . . . . . P P P
3 . . . . . . K .
2 . . . . . . . .
1 . . . . . . . .
  a b c d e f g h
```

- FEN: `8/8/6k1/5pp1/5PPP/6K1/8/8 w - - 0 1`
- Side: white
- Objective: only-move
- Authored move: Kf3 (g3f3)
- Authored alternatives: none

## Authored instruction

- Hint: Improve the king before committing the pawn majority.
- Correct feedback: Correct. The king improves before the pawn structure changes.
- Incorrect feedback: Check whether a king improvement is available before a pawn push.
- Provenance: `ku:endgames:pawn-weaknesses:pawn-majority/activity:pawn-majority:independent-blocked`

## Machine evidence

- Stockfish: authored-answer-questioned; best move `h4g5`
- Tablebase: retrieved; category win
- WDL-preserving moves: `f4g5`, `h4g5`, `g4f5`, `g3f2`, `g3g2`, `g3h2`
- DTZ-optimal moves: `f4g5`, `h4g5`, `g3f2`, `g3g2`, `g3h2`
- Technical observation: authored-move-tablebase-invalid

## Human question

- Does the authored move satisfy the intended pedagogical objective?
- Is the current uniqueness claim defensible?
- Should the position remain eligible for Quick Challenge?

## Reviewer input

Leave the JSON values empty until a real reviewer supplies the decision, rationale, stable private reference, revision, and confirms all three evidence digests.

- Position digest: `sha256-07e68159f7980f378adad82110aee1e131eeb9bfcbc61d0335b236e35a9857cf`
- Engine evidence digest: `sha256-236ee62fe63ab9aa7d6675f6e6bdfd84863d00a1dd107929ee30a85f5939ffd1`
- Remote evidence digest: `sha256-8354d317de963986736e8c6057c3001c1179f3d0e5d33442f55d490f9f6c48d5`
- Packet digest: `sha256-ee3c6f2884a2c9afeea984ae11d277d26878f26e78674a15d647289aed2986ae`
