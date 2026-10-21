# CAISSA Opening Trainer v1.0 — Human Test Guide

## Candidate scope

Route: `/opening-trainer`

The candidate adds a board-first opening workspace with exactly five primary tabs: Analysis, Practice, Games, Opening, and WikiBook. It reuses the CAISSA persistent board/Quiet Drag foundation, variation tree, Stockfish client, ECO data, CAISSA Explorer, GameSearch index, public PGN catalog, shared navigation, and Clerk server authentication.

The route remains `noindex, nofollow` during review. Production deployment, merge to `main`, and database migration application are intentionally outside this candidate.

## Architecture boundaries

- Analysis Tree is transient exploratory state owned by the variation-tree adapter.
- Saved Repertoire is validated, versioned, and persisted locally; signed-in sync uses the private repertoire API.
- Training Session receives an immutable repertoire snapshot and cannot modify Analysis Tree state.
- Game review owns an independent cursor and cannot modify Analysis Tree state.
- The board renderer is constructed once. Legal quiet moves preserve piece-node identity; position changes do not reconstruct the board.

## Functional review

1. Open `/opening-trainer` and verify the five tabs appear once, in the required order.
2. In Analysis, play `1. e4 e5 2. Nf3 Nc6 3. Bb5`. Verify SAN, the tree, Ruy Lopez identification, Stockfish evaluation/PVs, and a best-move arrow.
3. Add a branch by navigating backward and playing a different legal move. Select the desired terminal rows, choose White or Black, then use Save.
4. Use Save & Train. Confirm the decision dialog, start Practice, and verify Retry, Hint, Reveal, error/deviation feedback, progress, and CAISSA replies.
5. Return to Analysis and confirm its tree and current position were not modified by Practice.
6. Open Games. Confirm at most ten results, load a game, switch to Notation, and use the anchored footer navigation without changing Analysis.
7. Open Opening. Search by ECO/name/moves, load a line, then open CAISSA Explorer and play an indexed continuation.
8. Enable Auto WikiBook, play a known opening move, and verify automatic navigation, source attribution, CC BY-SA link, Return to Analysis, and article locking.
9. Toggle Engine and Flip. Confirm the workspace geometry is stable and the footer remains anchored while only the content body scrolls.
10. Repeat key paths at 390×844, tablet width, and desktop width. Confirm all five tabs remain visible, the board stays square, and no horizontal page scroll appears.

## Persistence and migration

Guest repertoires are stored under `caissa.opening-trainer.repertoires.v1` in local storage, with an in-memory fallback for storage failures.

Signed-in cloud sync requires the review-only migration:

`supabase/migrations/20261021214528_opening_trainer_repertoires.sql`

The table enables RLS, revokes browser roles, grants only `service_role`, and has no direct browser policy. Access is server-mediated through a Clerk bearer token and queries scoped to the authenticated internal `user_id`. Do not apply the migration until a reviewer approves it for a non-production environment.

## Data and licensing

WikiBook requests use the official Wikibooks MediaWiki API, render returned content as text (never HTML), link to the canonical source/contributor history, and display the CC BY-SA 4.0 attribution link.

GameSearch returns metadata only. The selected game is resolved against CAISSA's existing public PGN catalog. If a source PGN contains an invalid continuation, the full source notation remains visible and the UI explicitly limits board navigation to the verified legal prefix.

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

- `docs/opening-trainer/screenshots/analysis-desktop.png`
- `docs/opening-trainer/screenshots/wikibook-mobile.png`
- `docs/opening-trainer/screenshots/games-mobile.png`

## Known review points

- The Supabase migration is unapplied by design, so authenticated cloud sync cannot be certified end-to-end until an approved non-production database receives it.
- The existing Polgar–Kasparov PGN matched by the public GameSearch index contains an illegal continuation after 53 legal plies while declaring 84 plies. The trainer surfaces that source-validation warning and keeps the complete source notation visible.
- The route is intentionally excluded from indexing during human review. Removing `noindex` is a release decision.
