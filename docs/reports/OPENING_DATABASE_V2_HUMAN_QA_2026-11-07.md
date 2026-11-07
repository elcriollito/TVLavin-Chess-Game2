# Opening Database V2 — Owner Human QA Packet

Use the protected Vercel Preview URL supplied in the final handoff and Pull Request. Sign in to Vercel if the access-protection screen appears. Test only the Preview; do not use a Production alias for acceptance.

Record each applicable item as `PASS` or `FAIL` with a short note. Do not mark an item passed based only on the automated report.

## Test setup

- Desktop: current Chrome and Edge, normal zoom first, then 200% zoom or equivalent text scaling.
- Mobile: a physical iPhone with current Safari when available; portrait and landscape.
- Optional mobile comparison: Android Chrome and an iPad/equivalent tablet.
- Begin at `/opening-database` on the protected Preview.

## Checklist

- [ ] **HQA-01 — Desktop board:** The page loads and displays the original CAISSA board correctly.
- [ ] **HQA-02 — Board identity:** Square colors and the piece set match the existing Production page.
- [ ] **HQA-03 — Drag feel:** Piece dragging is smooth, with no lag, hiccup, ghost piece, or duplicate move.
- [ ] **HQA-04 — Explore refresh:** In Explore, play `1. e4 e5 2. Nf3`; opening name, ECO, line, candidate rows, totals, and WDL bars update after each move.
- [ ] **HQA-05 — Move rows:** Statistical rows remain readable; mouse, touch, Enter, and Space activation select the intended legal move.
- [ ] **HQA-06 — Analysis:** Open Analysis, start Stockfish, confirm evaluation/depth/PV updates, stop it, and confirm the worker visibly returns to an inactive state.
- [ ] **HQA-07 — Games:** After playing moves, open Games, run the search, change filters, and confirm totals and sample results are understandable. Confirm the UI says the search is move-order based and that unavailable PGN/ZIP actions are not presented as working downloads.
- [ ] **HQA-08 — Opening and ECO:** Confirm common lines identify correctly, including the Ruy Lopez after `1. e4 e5 2. Nf3 Nc6 3. Bb5`.
- [ ] **HQA-09 — Footer controls:** Verify Start Position, Takeback, Flip Board, and a valid custom FEN. Confirm an invalid FEN is rejected without corrupting the board.
- [ ] **HQA-10 — Analyzer transfer:** Play several moves, choose `Analyze in CAISSA`, and confirm Analyzer opens the same game/position and orientation.
- [ ] **HQA-11 — Opening Trainer transfer:** **NOT APPLICABLE.** This integration is intentionally deferred because no verified Opening Database → Trainer handoff contract exists in the current scope.
- [ ] **HQA-12 — iPhone Safari:** Verify layout, one natural page scroll, touch targets, tab switching, move activation, dragging, portrait/landscape behavior, and the absence of horizontal overflow.
- [ ] **HQA-13 — Chrome and Edge:** Verify full desktop functionality in both browsers, including all three tabs and footer controls.
- [ ] **HQA-14 — Design direction:** Confirm visual density, typography, board/workspace balance, navigation, and the HEAD/BODY/FOOT organization match the approved reference direction while retaining CAISSA identity.
- [ ] **HQA-15 — Regression sweep:** Confirm there are no visible broken controls, console-facing error states, clipped content, stale panels, unexpected Production navigation, or other regressions.

## Pass criteria

- Every applicable item is explicitly marked `PASS` by the owner.
- HQA-11 remains `NOT APPLICABLE`; it must not be converted to PASS.
- Any board identity, Quiet Drag, legal-move, ghost-piece, mobile-drag, security, or Preview-isolation failure blocks approval.
- A Games limitation that matches the documented move-order/PGN constraints is not itself a failure; misleading behavior is.

## Owner decision

- [ ] Accept the candidate for a later, separately authorized Production release.
- [ ] Reject the candidate and list blocking observations.

This packet does not authorize merging the Pull Request or deploying/promoting Production.
