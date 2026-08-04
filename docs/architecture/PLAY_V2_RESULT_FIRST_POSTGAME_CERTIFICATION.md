# Play v2 Result-First PostGame Certification

> Season 11.8.1A successor: `PlayV2PostGamePolicy@1.1.0` implements `POSTGAME-UX-001`. Analyze This Game is now the sole primary action; Rematch and New Game are strong secondary actions, Mentor is optional secondary, and PGN actions are utilities. The frozen 1.0.0 Rematch-primary declaration remains historical. No automatic Analyze/Mentor, education surface, upload, or analytics transport is introduced.

> Season 11.6.3 addendum: every completed-state transition is governed by `PlayV2PostGameExitPolicy@1.0.0`. One shared busy owner rejects concurrent exits while preserving result-first hierarchy, failure focus, and the finalized record.

> Season 11.6.2 addendum: PostGame retains result/reason first and Rematch as primary. `Review with Mentor` is optional and secondary, requires a finalized record, and opens the isolated QA-only workspace documented in `PLAY_V2_MENTOR_REVIEW_CERTIFICATION.md`. Analyze remains independent.

Season: **11.6.1**  
Contract: `PlayV2PostGamePolicy@1.0.0`  
Status: **accepted locally under the internal Play v2 gate**

## Ownership and terminal audit

The Play v2 entry loads one policy and one `post-game-core.js` owner. Classic and Legacy retain `post-game-experience.js`; the graphs do not coexist. A valid finalized `GameRecord` is mandatory, so initialization failure and incomplete play never render as completed games.

GameRecord maps checkmate, stalemate, repetition, insufficient material, fifty-move rule, timeout, resignation, draw agreement, aborted, and unknown termination. Hydration stops clocks, cancels the opponent request session, tears down an active Native Bot Worker, and causes the shell to hide and tear down Coach assistance. The completed record is retained across Analyze/Back and cleared only after successful Rematch or New Game.

## Result and hierarchy

The player-relative title is `You Won`, `You Lost`, or `Draw`; unavailable perspective falls back to White/Black. The reason sits immediately beneath it. The board remains visible. There is no second board, duplicate move list, rating delta, reward, performance score, celebration, advertisement, or education surface.

Action order under `PlayV2PostGamePolicy@1.1.0` is Analyze This Game, Rematch, New Game, optional Review with Mentor, then Copy PGN, Download PGN, and consent-controlled Save PGN Locally. Analyze is the sole primary action but remains an external continuation and never opens automatically. Failures keep the record and PostGame visible and restore action focus.

Rematch preserves certified color/time configuration, starts once, and closes only after success. Bot rematch prepares a fresh Worker. New Game rotates lifecycle/request state, returns to clean setup, does not start automatically, and never falls back to Legacy/FICS.

## PGN and Analyze

Copy, Download, and local Save share the finalized record. Save is disabled until existing local-history consent is granted; repeat save is disabled. Clipboard failures are visible. Download uses and revokes a local object URL. No upload exists.

Analyze stops active owners, creates the existing opaque handoff, and opens one workspace. PGN and FEN never enter the URL; only the opaque token may. Browser Back restores the same completed record ID. Mentor and educational resources remain absent.

## Accessibility, privacy, limitations, and evidence

The result is the labelled focusable heading and receives focus once. Action order follows DOM order; native controls provide keyboard operation and failure-focus restoration. Automation covers phone, tablet, desktop, forced colors, reduced motion, 200% zoom/reflow, Chromium/WebKit, and Axe. The board remains visible with zero horizontal overflow.

No analytics transport, remote save, identity bridge, FICS, cookies, educational-profile/Training Memory/Mastery write, external destination, rating mutation, or reward was added. Physical-device and named-screen-reader certification remain pending. Legacy repetition/fifty-move public history injection remains unavailable, so those mappings are unit-certified rather than browser-forced.

Deterministic evidence covers both colors, every reason, incomplete suppression, Games/Bots/Coach cleanup, action order, Rematch failure/success, New Game, PGN consent/copy failure, opaque Analyze/Back, graph isolation, responsive accessibility, privacy, and all boundary regressions. Play v2 remains internal and `publicReady = false`; Mentor remains blocked pending Season 11.6.2.
