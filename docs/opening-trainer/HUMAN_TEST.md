# CAISSA Opening Trainer v1.0 — Human Test Guide

## Candidate scope

Route: `/opening-trainer`

The candidate adds a board-first opening workspace with exactly five primary tabs: Analysis, Practice, Games, Opening, and WikiBook. It reuses the CAISSA persistent board/Quiet Drag foundation, variation tree, Stockfish client, ECO data, CAISSA Explorer, the PGN Reader opening proxy, shared navigation, and Clerk identity when available. Save and Save & Train also work for guests without Clerk or Supabase.

The route remains `noindex, nofollow` during review. No merge or Production deployment has been authorized. This v1 candidate itself did not execute any database migration; however, the previously approved **separate Staging gate** did apply the retained DDL (see the reconciliation below and `docs/opening-trainer/FINAL_RELEASE_GATE.md`).

## Architecture boundaries

- Analysis Tree is transient exploratory state owned by the variation-tree adapter and mirrored into an identity-scoped session draft for same-tab reload.
- Saved Repertoire is validated, versioned, and stored only in identity-scoped `sessionStorage`, with an in-memory fallback.
- Training Session receives an immutable repertoire snapshot and cannot modify Analysis Tree state.
- Paired notation is a presentation-only projection over the canonical half-move nodes; node IDs, FENs, branches, and saved-line selection remain unchanged.
- Practice owns an explicit White/Black session choice. The saved repertoire color supplies only the default and is never rewritten by a session override.
- Game review owns an independent cursor and cannot modify Analysis Tree state.
- NEW advances an atomic workspace generation before cancelling Stockfish, WikiBook, Explorer, and PGN requests; late results from the old generation cannot repopulate the new study.
- Guest, Clerk A, and Clerk B use separate session namespaces. Identity changes never expose or save another identity's tree or repertoires.
- Opening Trainer v1 does not import the retained cloud-sync module and the retained API is feature-disabled by default.
- The board renderer is constructed once. Legal quiet moves preserve piece-node identity; position changes do not reconstruct the board.

## Functional review

1. Open `/opening-trainer` and verify the five tabs appear once, in the required order.
2. In Analysis, load or play `1. e4 c6 2. d4 d5 3. Nc3 dxe4`. Verify that it renders as three paired rows, each White/Black move remains individually selectable, and each selection restores that node's exact FEN.
3. Return to `2...d5` and create a legal alternative such as `3.e5 Nf6 4.Nf3`. Return to `3.Nc3` and create a black alternative such as `3...g6`. Verify moderate indentation, branch markers, `3...` numbering for the black-only row, and no duplicated prefix.
4. Select the desired terminal rows, choose White or Black, then use the persistent footer Save from each primary tab. Confirm the row checkbox represents the complete line ending at that row rather than an individual half-move and the footer says “Saved for this session”.
5. Use Save & Train with Black selected and confirm that the dialog exposes the same choice. Verify Black orientation and CAISSA's automatic first White move.
6. Save a White-default Caro-Kann repertoire, open Practice, choose Black, and complete `1.e4 c6 2.d4 d5 3.Nc3 dxe4`. Exercise an error, Retry, Hint, and Reveal. Then change to White, accept the restart confirmation, and verify the stored repertoire still says White.
7. While a session is active, change color again and cancel the confirmation. Verify the current position, session color, and statistics do not change.
8. Verify Retry, Next, progress and CAISSA replies for both sides; during CAISSA's turn, confirm its pieces cannot be moved and Stockfish shows no solution arrow.
9. Return to Analysis and confirm its tree and current position were not modified by Practice.
10. Open Games. Search by opening name, variation, or ECO. Confirm the PGN Reader proxy label, at most ten results per page, result pagination, game loading, Notation, and anchored footer navigation without changing Analysis.
11. Open Opening. Search by ECO/name/moves, load a line, then open CAISSA Explorer and play an indexed continuation.
12. Enable Auto WikiBook, play a known opening move, and verify automatic navigation, source attribution, CC BY-SA link, Return to Analysis, and article locking.
13. Toggle Engine and Flip. Confirm `NEW | Flip | Engine | Save | Save & Train | First | Previous | Next | Last` stays anchored while only the content body scrolls.
14. With unsaved moves, press NEW and test Cancel, Save, and Discard. Confirm Cancel is lossless; a confirmed reset returns to Opening, keeps orientation/engine preferences and separately saved session repertoires, and clears only the active analysis/game/theory state.
15. Save as Guest, reload the same tab and confirm the repertoire, selected variations, color and Analysis tree return. Open an independent browser session and confirm none of them appears there.
16. Switch Clerk A → B → Guest → A. Confirm each identity sees only its own session repertoires and draft, Practice is cleared at every boundary, and late Stockfish/WikiBook/Games results from A never render in B.
17. Inspect Network and confirm there are no requests to `/api/opening-trainer/repertoires`; existing localStorage v1/v2 repertoire keys must remain untouched.
18. Repeat key paths at 390×844, tablet width, and desktop width. Confirm all five tabs remain visible, the board stays square, the footer prioritizes NEW/Save & Train/navigation, and no horizontal page scroll appears.

## Session storage and deferred migration

Session repertoires use `caissa.opening-trainer.session.repertoires.v1:{identity}` and Analysis drafts use `caissa.opening-trainer.session.analysis-draft.v1:{identity}`. They survive a same-tab reload and do not cross into a new browser session. Existing localStorage v1/v2 data is neither imported nor deleted.

The cloud client, API, migration and rollback remain inactive for v1 and retained for possible v2. The API is `404`-disabled before auth/database work unless both explicit v2 server flags are enabled, and the v1 page has no code path that calls it. Separately, on **2026-10-22**, the previously approved migration SQL was applied to **Supabase Staging** (`aqizagaskicotorfpwfn`) and was recorded under remote version **`20261022034441`** (not the Git filename version `20261021214528`). The table exists and had **0 rows** at the final gate read; RLS is enabled and browser roles have no direct SELECT. Neither reapply nor roll back this migration for v1, and do not change the remote ledger to conceal the version difference. See `docs/opening-trainer/SESSION_ONLY_STORAGE.md` and `docs/opening-trainer/FINAL_RELEASE_GATE.md`.

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
- Opening Trainer unit/integration/navigation: 44/44 pass.
- Opening Trainer browser: 34 pass, 2 deliberate Stockfish WASM skips outside Chromium.
- CAISSA Board/Quiet Drag unit: 26/26 pass.
- CAISSA Board browser: 19 pass, 1 expected visual-evidence skip.
- PGN Reader browser: 33/33 pass across Chromium, Firefox, and WebKit.
- PGN Reader unit: 146/147 pass; the only failure is the pre-existing contract that expects the already tracked Capablanca PGN to be absent.
- A fresh Codex Security diff review is required for the final immutable candidate and is recorded in the Draft PR evidence rather than hard-coded here.

## Human acceptance and final release boundary

- Owner-approved functional Human Test: **6/6 PASS** (Analysis/Stockfish, WikiBook, Save & Train, Games/Notation, NEW, footer/mobile).
- Owner-approved paired-notation and Black-side Practice Human Test: **5/5 PASS**.
- Owner-approved v1 session-only storage Human Test: **4/4 PASS**.
- These approvals authorize preparation of the release gate **only**, not a merge, `noindex` removal, migration execution, or a Production deployment.
- Final release evidence, outstanding migration-file safety guard, and immutable-commit checks: `docs/opening-trainer/FINAL_RELEASE_GATE.md`.

## Known review points

- Active Practice cursor/statistics are page-memory state. Completed results are stored in the session repertoire; a reload can restart Practice from the saved lines but does not resume the exact in-progress move.
- Cloud storage is deliberately deferred to v2. The preserved process-local API limiter is not a distributed rate-limit control.
- Provider availability and PGN quality remain external constraints. A malformed source game keeps its complete notation visible while board navigation stops at the verified legal prefix.
- The route is intentionally excluded from indexing during human review. Removing `noindex` is a release decision.
