# Opening Database V2 — Engineering QA Report

Date: 2026-11-07 (America/New_York)  
Repository: `elcriollito/TVLavin-Chess-Game2`  
Feature branch: `feature/opening-database-v2-modernization`  
Base SHA: `ce9a5198a8d0618d32fa9c34c500267ad89efc85`  
Base tree: `8e80b1cc806ba6b4249534f1c2b3cafd3a6da868`

Remote candidate SHA, tree SHA, Pull Request, protected Preview URL, and Vercel deployment ID are recorded in the owner handoff after the final branch push. This report intentionally does not self-certify Human QA.

## Architecture

- Reused the existing Chessboard.js instance, Chess.js rules owner, piece assets, CAISSA board styling, and legacy Quiet Drag adapter.
- Refactored the surrounding Opening Database page into one board-and-workspace composition with a single right-side `HEAD / BODY / FOOT` workspace.
- Kept the existing opening shard, ECO, Stockfish, and line-search clients. No replacement chess core or duplicate board owner was introduced.
- Added the established Analyzer handoff transport for same-origin, bounded, opaque-token transfer.

## UI and UX

- The desktop layout keeps the board dominant on the left and the workspace on the right.
- The workspace exposes `Analysis`, `Games`, and `Explore`, with `Explore` as the default.
- ECO, opening name, played line, lookup state, and dataset freshness live in the workspace head.
- Move rows present `Move → Engine → Games → White/Draw/Black` with semantic buttons and accessible WDL labels.
- Start Position, Takeback, Flip Board, Input FEN, and Analyzer transfer live in the workspace foot.
- At mobile widths the board remains first and the workspace stacks beneath it without horizontal overflow.

Candidate screenshots:

- [360 × 800 phone](opening-database-v2-evidence/candidate-phone-360x800.png)
- [390 × 844 phone](opening-database-v2-evidence/candidate-phone-390x844.png)
- [768 × 1024 tablet](opening-database-v2-evidence/candidate-tablet-768x1024.png)
- [1024 × 768 tablet](opening-database-v2-evidence/candidate-tablet-1024x768.png)
- [1440 × 900 Explore](opening-database-v2-evidence/candidate-desktop-1440x900.png)
- [1440 × 900 Analysis](opening-database-v2-evidence/candidate-desktop-1440x900-analysis.png)
- [1440 × 900 Games](opening-database-v2-evidence/candidate-desktop-1440x900-games.png)
- [1920 × 1080 desktop](opening-database-v2-evidence/candidate-desktop-1920x1080.png)

## Functional parity

- Legal move activation, FEN input, reset, takeback, orientation, opening identification, Stockfish control, database lookup, and line search remain present.
- The three-tab binding is race-safe and idempotent before or after board initialization.
- Games results explicitly separate indexed totals from the returned metadata sample.
- Missing WDL data is displayed as missing, not as a fabricated zero.
- Unsupported individual PGN and ZIP artifacts are disabled and described honestly.

## Protected board certification — automated evidence

- No board palette selector, piece asset, Chessboard.js vendor file, Chess.js vendor file, or Quiet Drag implementation was changed.
- The page still loads `/img/chesspieces/wikipedia/{piece}.png` and the canonical legacy Quiet Drag adapter.
- Quiet Drag interaction tests cover ordinary moves, captures, castling, en passant, queen promotion, rejection, board flip, touch, and ten reset/recreate cycles.
- The instrumented benchmark observed zero left/top writes, zero jQuery animation calls, zero layouts, zero cursor lag, zero long tasks, and no chess/database work during pointer movement for Quiet Drag.
- The same benchmark observed exactly one Chess.js move and one opening lookup after drop.
- Board usability assertions passed at 1024, 1366, 1440, and 1920 desktop widths in Chromium, Firefox, and WebKit. Mobile composition and touch behavior also passed browser automation.

Human inspection is still required for subjective smoothness, native iPhone Safari behavior, and visual identity.

## Data integrity

- The active canonical opening dataset is `v3_p60`, generated 2026-03-08, with 256 shards and a 60-ply limit.
- Localhost and Production start-position statistics passed the live parity assertion.
- Candidate moves continue to be intersected with Chess.js legal moves.
- Position requests retain stale-response guards.
- Game Search is a bounded move-order prefix index (`v1`, maximum 10 plies, top 100 metadata records), not a transposition-aware exact-position database.
- The authoritative games/PGN manifest remains unavailable; no fabricated PGN or ZIP support was added.

## Integrations

- **Analyzer:** implemented through the shared `CaissaAnalyzeHandoff` transport. Standard-start histories transfer PGN; custom-FEN sessions transfer the final position. Automated token/storage/navigation coverage passed.
- **Opening Trainer:** deferred. There is no verified Opening Database → Trainer contract that can be added without expanding scope. The control is disabled with an explanation.
- **ECO:** retained and surfaced prominently in the workspace head.
- **Game Search:** retained as line-order search with explicit transposition and sample limitations.

## Performance

Instrumented Chromium comparison using the same e2–e4 gesture:

| Metric | Legacy drag | Quiet Drag |
| --- | ---: | ---: |
| Pointer events | 24 | 24 |
| Left/top writes | 25 | 0 |
| jQuery animations | 1 | 0 |
| Layouts during movement | 24 | 0 |
| Movement script CPU | 5.675 ms | 2.574 ms |
| Cursor lag | 10.98 px | 0 px |
| Long tasks | 0 | 0 |
| Chess moves during movement | 0 | 0 |
| Opening lookups during movement | 0 | 0 |
| Chess moves after drop | 1 | 1 |
| Opening lookups after drop | 1 | 1 |

The page still lazy-starts Stockfish and caps/deduplicates opening shard work. A laboratory browser benchmark is not a substitute for native-device Human QA.

## SEO

- Added a canonical URL, Open Graph metadata, Twitter card metadata, and `WebApplication` plus breadcrumb structured data.
- Added crawlable explanatory content and internal links without inventing dataset or performance claims.
- Static shell tests verify the required metadata.

## Security

- Codex Security diff scan: `f23e91cd-4002-43ab-8707-f3a3f8639466`.
- Coverage: complete; findings: 0.
- External metadata rendering, FEN/move state, line-search construction, Analyzer handoff, diagnostics, and URL-controlled entitlement behavior were reviewed.
- External game metadata is escaped or written with DOM text APIs.
- The client-controlled `?tier=premium` entitlement path was removed.
- Diagnostics remain debug-only.
- Dependency installation reported 0 vulnerabilities.
- Sealed report: `C:\Users\ALEXANDER\.codex\state\plugins\codex-security\scans\TVLavin-Chess-Game2-opening-database-v2\ce9a5198a8d0618d32fa9c34c500267ad89efc85_20261107T215755Z_lxjd7dgu\report.md`.

## Automated QA

| Suite | Result |
| --- | --- |
| Syntax/static checks for changed JavaScript and tests | PASS |
| Opening Database + Analyzer handoff Node contracts | 22/22 PASS |
| V2 UI, tabs, Quiet Drag, responsive, and axe checks — Chromium/Firefox/WebKit | 48/48 PASS |
| Live data parity + instrumented Quiet Drag benchmark — Chromium | 2/2 PASS |
| Codex Security diff scan | PASS, complete coverage, 0 findings |
| `git diff --check` | PASS |

The axe assertion covers serious and critical violations on the default V2 surface. It does not replace owner review with browser zoom, text scaling, or assistive technology.

## Remaining risks and deferred work

- **Low / product limitation:** Games search is move-order based and excludes transpositions reached through another line.
- **Low / data limitation:** Individual PGN and ZIP downloads remain unavailable until an authoritative artifact manifest exists.
- **Low / deferred integration:** Opening Trainer transfer is not implemented.
- **Human verification pending:** native iPhone Safari, Desktop Edge, subjective drag feel, typography/density, and final visual comparison.

## Release status

Automated engineering status: candidate meets the applicable automated acceptance criteria.  
Human status: **PENDING OWNER HUMAN QA**.  
Production status: **LOCKED — not modified, promoted, aliased, or released by this work.**

