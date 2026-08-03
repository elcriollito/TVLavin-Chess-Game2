# Play v2 Desktop Product Acceptance

Status: **APPROVED**

Approval date: 2026-08-02

Product owner decision: **Desktop Product Acceptance approved.**

This record certifies the combined local desktop implementation for the CAISSA Native Play Experience. It is a product-acceptance checkpoint, not a public-release approval.

## Baseline and scope

- Starting branch: `main`.
- Starting HEAD: `32f0da4371c9fab6f20fa8a289d014bd01478e3c`.
- Remote baseline: `origin/main` at `7cec9ea60289d32435849ffde736041f739126d6`.
- Starting divergence: 0 behind and 25 ahead.
- Product principle: **Enter. Choose. Play.**
- Accepted internal route: `/play/beta`.
- Production `/play` remains Legacy Play and the homepage remains CAISSA Classic.

The approval covers the board-first shell, Games, Bots, Coach, active-game controls, Assistance, PostGame, Analyze, completed-game evidence, responsive behavior, accessibility automation, and the external ECO continuation described below.

## Accepted desktop experience

### Board geometry

The authoritative board derives its size from available viewport geometry rather than the former 760 px ceiling. Automated minimums remain:

| Viewport | Setup board | Active board |
|---|---:|---:|
| 1440×900 | 700 px | 650 px |
| 1920×1080 | 880 px | 830 px |
| 2560×1440 | 1240 px | 1190 px |
| 3840×2160 | 1960 px | 1910 px |

The board remains square, primary, singular, above the fold with active actions, and free of document-level horizontal overflow.

### Mode navigation and active controls

The internal mode rail exposes Play Game, Play Bots, and Play Coach. Players is absent. Each mode owns a distinct setup surface without replacing the board owner. Active Games and Bots expose Resign, PGN, and Menu; Coach additionally exposes bounded Coach help. Resign requires confirmation and produces the truthful result-first PostGame.

### Assistance

Bots truthfully reports that no optional live assistance is available. Coach exposes only Messages level, Focus, and on-request Timing. Configuration may change during an active game without restarting the board, clock, session, or Worker. Coach does not expose best moves, principal variations, candidate moves, future positions, hidden answers, Training Memory writes, or Mastery writes.

### PostGame and Mentor

PostGame presents result and termination first, preserves the completed GameRecord, and offers bounded Rematch, New Game, PGN, Analyze, and optional Mentor review actions. Analyze and Mentor remain continuations of the completed game; neither converts Play into an educational dashboard. Back from Analyze restores the same PostGame record.

## Analyze acceptance

### Lifecycle and honesty

Analyze receives an opaque completed-game handoff with truthful player identities, result, termination, and PGN. The URL contains no PGN or FEN. The local engine starts only after explicit Analyze activation, owns at most one separate attributed Worker, and is torn down after completion, failure, cancellation, or Back. Gameplay and Analyze Workers do not coexist. Progress, unavailable, retry, cancellation, and completed states fail closed; no accuracy, classification, recommendation, or summary is shown from incomplete evidence.

### Classification policy

CAISSA owns classification; Stockfish supplies evaluation, mate, best move, and search evidence.

| Normalized loss | Internal/summary classification | Visible move glyph |
|---:|---|---|
| `[0, 50)` cp | Acceptable | none |
| `[50, 100)` cp | Inaccuracy | `?!` |
| `[100, 250)` cp | Mistake | `?` |
| `≥ 250` cp | Blunder | `??` |
| Losing a forced mate | Blunder | `??` |

Loss is normalized from the mover's perspective and cannot be negative. Positive praise glyphs and unsupported Brilliant, Great, Excellent, Best, `!`, `!!`, and `!?` categories are absent.

### Book and accuracy policy

A move matching a repository-owned ECO line is Book only when its engine loss is below 50 cp. It receives no praise glyph and is excluded from player accuracy. At 50 cp or above, the engine-backed negative classification wins and the move is included in accuracy. Non-Book analyzed moves use the existing deterministic exponential accuracy calculation. Missing or partial evidence produces no accuracy claim.

### Engine recommendation

For Inaccuracy, Mistake, and Blunder, the completed-game workspace shows Played SAN, legal engine-recommended SAN from the pre-move position, evaluation before and after, normalized loss, and classification. Recommendation evidence retains record ID, ply, generation, and bounded depth. Malformed, illegal, stale, cancelled, timed-out, wrong-record, or wrong-ply evidence is rejected; raw UCI and full PV are never presented. Selecting a negative move shows the pre-move board position without autoplay.

### Piece movement

The proven visual echo had two chessboard.js causes: drag retained a visible source image while a floating image moved, and programmatic board updates used a floating jQuery animation owner. The adapter now hides the marked drag source while the single floating owner moves, cleans it on completion, and uses immediate programmatic placement. Reduced motion is immediate and has no opacity trail.

### Horizontal Move Evidence

At wide desktop widths, Move Evidence uses the full board-owner width in the reading order Classification, Played, Engine recommends, Evaluation, Loss, followed by the board-position disclosure. Intermediate layouts reflow to a classification row plus a 2×2 comparison; mobile may use one column. Book and Acceptable collapse to a concise classification with no empty recommendation boxes. The accessible group announces one coherent sentence and never announces punctuation without meaning.

### ECO continuation

Analyze derives the displayed opening name and code from the same trusted `eco_codes.json` record. A valid match offers **Explore in ECO Database** at canonical `/eco/{CODE}` in a new tab with `rel="noopener"`. Only the allowlisted ECO code is transmitted; no PGN, FEN, record identity, handoff, or redirect value enters the URL. The ECO owner validates the A00–E99 shape and exact dataset membership, focuses the requested entry, preserves normal `/eco` behavior without a code, and safely leaves malformed or unknown paths unselected. The ECO Database is external to Play and is not embedded.

## Accessibility automation

Chromium and WebKit evidence covers keyboard activation and move selection, focus visibility, dialog focus containment and restoration, accessible classification sentences, native controls, 44 px touch targets where interactive, 200% reflow, reduced motion, forced colors, no horizontal overflow, and Axe serious/critical acceptance. This automation does not replace named assistive-technology testing.

## Preserved boundaries

- `/play` remains Legacy Play; `/` remains CAISSA Classic.
- Play v2 remains internal and absent from public navigation.
- FICS resources, providers, fallbacks, identity, ratings, presence, matchmaking, and challenges are absent from Play v2.
- Players is absent and remains blocked pending CAISSA-native infrastructure.
- Academy, classes, lessons, Endgame Training, curriculum, Knowledge Units, training recommendations, and educational promotional cards are absent.
- Analytics transport remains disabled.
- Training Memory and Mastery writes remain zero.
- No deployment, push, tag movement, public exposure, or physical certification is authorized by this approval.

## Automated results

- Authoritative Play, Analyze, ECO, boundary, Worker, PostGame, GameRecord, and static-contract selection: **167 passed, 0 failed, 0 skipped**.
- Combined beta-entry, responsive, and desktop browser selection: **62 scenarios exercised across Chromium and WebKit**; the final desktop run passed **28/28**, while the unchanged beta-entry/mobile owners passed **34/34** in the combined run.
- Focused ECO deep-link and rejection behavior: **4/4 passed** across Chromium and WebKit.
- JavaScript syntax, deterministic generated entry, JSON parsing, sensitive-data inspection, and `git diff --check`: passed before commit.

## Physical-device status and remaining gates

Physical-device status remains **NOT CERTIFIED — PAUSED FOR DESKTOP PRODUCT ACCEPTANCE**. Desktop approval closes the prerequisite but does not resume that work automatically.

Still required before any public beta decision:

1. Resume and complete authorized physical-device QA, including the open mobile navigation finding.
2. Complete named NVDA, JAWS, VoiceOver, and TalkBack testing plus the non-pointer board model review.
3. Implement and approve the public opt-in gate, explicit exit, feedback/support flow, privacy handling, and abuse controls.
4. Rehearse kill-switch and rollback behavior and verify production-equivalent assets, CSP, MIME, cache, and headers.
5. Perform final production-boundary and deployment verification under separate authorization.

**No public-readiness or Season 11 completion claim is made.**
