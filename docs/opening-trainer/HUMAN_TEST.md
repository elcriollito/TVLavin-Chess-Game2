# CAISSA Opening Trainer v1.0 — Human Test Guide

## Candidate scope

Route: `/opening-trainer`

The candidate adds a board-first opening workspace with exactly five primary tabs: Analysis, Practice, Games, Opening, and WikiBook. It reuses the CAISSA persistent board/Quiet Drag foundation, variation tree, Stockfish client, ECO data, CAISSA Explorer, the PGN Reader opening proxy, shared navigation, and Clerk server authentication.

The route remains `noindex, nofollow` during review. Production deployment, merge to `main`, and database migration application are intentionally outside this candidate.

## Architecture boundaries

- Analysis Tree is transient exploratory state owned by the variation-tree adapter.
- Saved Repertoire is validated, versioned, and persisted locally; signed-in sync uses the private repertoire API.
- Training Session receives an immutable repertoire snapshot and cannot modify Analysis Tree state.
- Paired notation is a presentation-only projection over the canonical half-move nodes; node IDs, FENs, branches, and saved-line selection remain unchanged.
- Practice owns an explicit White/Black session choice. The saved repertoire color supplies only the default and is never rewritten by a session override.
- Game review owns an independent cursor and cannot modify Analysis Tree state.
- NEW advances an atomic workspace generation before cancelling Stockfish, WikiBook, Explorer, and PGN requests; late results from the old generation cannot repopulate the new study.
- The board renderer is constructed once. Legal quiet moves preserve piece-node identity; position changes do not reconstruct the board.

## Functional review

1. Open `/opening-trainer` and verify the five tabs appear once, in the required order.
2. In Analysis, load or play `1. e4 c6 2. d4 d5 3. Nc3 dxe4`. Verify that it renders as three paired rows, each White/Black move remains individually selectable, and each selection restores that node's exact FEN.
3. Return to `2...d5` and create a legal alternative such as `3.e5 Nf6 4.Nf3`. Return to `3.Nc3` and create a black alternative such as `3...g6`. Verify moderate indentation, branch markers, `3...` numbering for the black-only row, and no duplicated prefix.
4. Select the desired terminal rows, choose White or Black, then use the persistent footer Save from each primary tab. Confirm the row checkbox represents the complete line ending at that row rather than an individual half-move.
5. Use Save & Train with Black selected and confirm that the dialog exposes the same choice. Verify Black orientation and CAISSA's automatic first White move.
6. Save a White-default Caro-Kann repertoire, open Practice, choose Black, and complete `1.e4 c6 2.d4 d5 3.Nc3 dxe4`. Exercise an error, Retry, Hint, and Reveal. Then change to White, accept the restart confirmation, and verify the stored repertoire still says White.
7. While a session is active, change color again and cancel the confirmation. Verify the current position, session color, and statistics do not change.
8. Verify Retry, Next, progress and CAISSA replies for both sides; during CAISSA's turn, confirm its pieces cannot be moved and Stockfish shows no solution arrow.
9. Return to Analysis and confirm its tree and current position were not modified by Practice.
10. Open Games. Search by opening name, variation, or ECO. Confirm the PGN Reader proxy label, at most ten results per page, result pagination, game loading, Notation, and anchored footer navigation without changing Analysis.
11. Open Opening. Search by ECO/name/moves, load a line, then open CAISSA Explorer and play an indexed continuation.
12. Enable Auto WikiBook, play a known opening move, and verify automatic navigation, source attribution, CC BY-SA link, Return to Analysis, and article locking.
13. Toggle Engine and Flip. Confirm `NEW | Flip | Engine | Save | Save & Train | First | Previous | Next | Last` stays anchored while only the content body scrolls.
14. With unsaved moves, press NEW and test Cancel, Save, and Discard. Confirm Cancel is lossless; a confirmed reset returns to Opening, keeps orientation/engine preferences and saved repertoires, and clears only transient analysis/game/theory state.
15. Repeat key paths at 390×844, tablet width, and desktop width. Confirm all five tabs remain visible, the board stays square, the footer prioritizes NEW/Save & Train/navigation, and no horizontal page scroll appears.

## Persistence and migration

Guest repertoires are stored under `caissa.opening-trainer.repertoires.v1` in local storage, with an in-memory fallback for storage failures.

Signed-in cloud sync requires the review-only migration:

`supabase/migrations/20261021214528_opening_trainer_repertoires.sql`

The table enables RLS, revokes browser roles, grants only `service_role`, and has no direct browser policy. Access is server-mediated through a Clerk bearer token and queries scoped to the authenticated internal `user_id`. Do not apply the migration until a reviewer approves it for a non-production environment.

## Data and licensing

WikiBook requests use the official Wikibooks MediaWiki API, render returned content as text (never HTML), link to the canonical source/contributor history, and display the CC BY-SA 4.0 attribution link.

Games uses the same allowlisted, same-origin opening gateway as CAISSA PGN Reader: `/api/pgn/opening`. The browser never contacts PGN Mentor directly. The proxy fetches approved PGN Mentor opening ZIPs, enforces archive/PGN limits, extracts one PGN, and publishes cacheable 100-game pages. Opening Trainer presents ten real games per UI page and retains the complete source notation. See `docs/opening-trainer/PGN_PROXY_INTEGRATION.md`.

## Automated verification

Run:

```powershell
node --test tests/opening-trainer.test.js tests/navigation-integrity.test.js tests/global-navigation-order-policy.test.js tests/public-route-inventory.test.js
node node_modules/@playwright/test/cli.js test tests/browser/opening-trainer.spec.js
node --test tests/board/*.test.js
node node_modules/@playwright/test/cli.js test tests/browser/caissa-board-persistent-renderer.spec.js --config=playwright.board.config.js --project=chromium --project=webkit
node node_modules/@playwright/test/cli.js test tests/browser/global-navigation-order.spec.js --project=chromium
node scripts/capture-opening-trainer.mjs
```

The capture script checks mobile horizontal geometry before writing:

- `docs/opening-trainer/screenshots/analysis-desktop.png` — paired main line plus White and Black branches.
- `docs/opening-trainer/screenshots/practice-black-desktop.png` — Black selected, Black orientation, and CAISSA's automatic `1.e4`.
- `docs/opening-trainer/screenshots/wikibook-mobile.png`
- `docs/opening-trainer/screenshots/games-mobile.png`

Latest candidate results:

- Opening Trainer lint: pass.
- Opening Trainer unit/integration/navigation: 31/31 pass.
- Opening Trainer browser: 28 pass, 2 deliberate Stockfish WASM skips outside Chromium.
- CAISSA Board/Quiet Drag unit: 26/26 pass.
- CAISSA Board browser: 19 pass, 1 expected visual-evidence skip.
- PGN Reader browser: 33/33 pass across Chromium, Firefox, and WebKit.
- PGN Reader unit: 146/147 pass; the only failure is the pre-existing contract that expects the already tracked Capablanca PGN to be absent.
- Codex Security diff review: 7/7 authoritative source files reviewed, 0 findings, complete coverage (scan `4b6c2953-8309-4adb-ad37-a6ed7674506a`).

## Known review points

- The Supabase migration is unapplied by design, so authenticated cloud sync cannot be certified end-to-end until an approved non-production database receives it.
- Provider availability and PGN quality remain external constraints. A malformed source game keeps its complete notation visible while board navigation stops at the verified legal prefix.
- The route is intentionally excluded from indexing during human review. Removing `noindex` is a release decision.
