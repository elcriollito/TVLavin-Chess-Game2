# Opening Explorer HQA adjustment

Status: `READY_FOR_HUMAN_QA`

## Outcome

The mobile information hierarchy is now:

1. Chessboard
2. Side to move, ply and database version/freshness
3. `Popular Moves | Engine`
4. At most five relevant move rows
5. Current Opening, ECO, line and match status
6. Explorer, Analysis, Games and Moves tabs
7. Analyze in CAISSA, dataset details and position controls

The desktop DOM ownership and two-column presentation are restored automatically above 640 px and remain unchanged.

## Zero-data root cause

Mobile Popular Moves could previously receive `latestAllLegalRows` whenever `latestPopularRows` was empty. `renderStatsRows()` then had a second fallback that generated every legal move with `games: 0`. Those two fallbacks allowed legal but statistically empty moves such as `a3` or `a4` to occupy visual slots.

The mobile Popular path now:

- reads only positive-game database rows;
- sorts them by real game count descending;
- renders `min(realRows, 5)` with no More expansion;
- repeats the filter and cap after every FEN update.

The legal-move fallback is retained for Engine mode, where it is needed to evaluate candidate moves. Engine still renders one primary arrow and at most two secondary arrows without moving the board.

## Verification

- 13/13 Opening Explorer Node contract/localization tests passed.
- 14/14 Season 001 hotfix scenarios passed across Chromium and WebKit, including 390 px and 430 px.
- 25/25 existing Explorer browser regressions passed in Chromium, including 768, 1024 and 1440 px desktop/tablet layouts.
- The fixture includes zero-game `a3` and `a4`; neither appears in the mobile Top 5.
- After `e4`, only the three positive-game continuations render; zero-game legal candidates do not fill the remaining slots.
- Horizontal overflow is at most one rounding pixel.

## Screenshots

- [Popular Moves — 390 px](screenshots/opening-explorer-390.png)
- [Popular Moves — 430 px](screenshots/opening-explorer-430.png)
- [Engine — 390 px](screenshots/opening-explorer-engine-390.png)
- [Engine — 430 px](screenshots/opening-explorer-engine-430.png)
