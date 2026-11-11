# CAISSA Mobile Experience — Season 001

Status: `READY_FOR_HUMAN_QA`

## Candidate

- Branch: `feature/caissa-mobile-home-s001-20261111`
- Worktree: `C:\Users\ALEXANDER\Alexander Projects\TVLavin-Chess-Game2-mobile-home-s001`
- Base: `origin/main` at `04ee0993`
- Publication: not published, pushed, merged, or deployed
- Breakpoint: the dedicated mobile shell is active at `720px` and below; the existing desktop Home remains the active experience above that breakpoint

## Routes

| Mobile destination | Route |
| --- | --- |
| Play | `/play/games` |
| Puzzles | `/puzzles` |
| Bots | `/play/bots` |
| Coach | `/play/coach` |
| Analyze | `/analyze` |
| CAISSA Scanner | `/scanner` |
| Opening Explorer | `/opening-database` |
| Watch Games — Lichess | `/watch/lichess-tv` |
| Watch Games — FICS | `/spectator-tv` |
| Settings | Mobile category sheet on Home |

## Mobile primitives

- `MobileShell` — `.mobile-shell`
- `MobileHeader` — `.mobile-header`
- `MobileHero` — `.mobile-hero`
- `MobileCard` — `.mobile-card`
- `MobileCardList` — `.mobile-card-list`
- `MobileSubmenu` — `.mobile-submenu`
- `MobileSheet` — `.mobile-sheet`
- `MobileSettingsEntry` — `.mobile-settings-entry`

The blue knight hero reuses the existing CAISSA `/icon-512.png` identity. Watch Games uses an inline disclosure. Settings uses eight category views and retains the existing supported language preference without inventing global toggles.

## Screenshots

- [390px mobile Home](screenshots/mobile-home-390.png)
- [430px mobile Home](screenshots/mobile-home-430.png)
- [Watch Games expanded](screenshots/watch-games-expanded.png)
- [Mobile Settings — Language](screenshots/mobile-settings-language.png)

## Automated verification

- `npm run lint:home` — passed
- `npm run test:home` — 71 passed
- `npm run test:home:browser` — 10 passed in Chromium
- `npm run test:mobile-home:browser` — 10 passed across Chromium and WebKit
- All nine destination documents returned HTTP 200 under the local candidate environment
- Back navigation and refresh on `/play/games` passed
- 390px and 430px layouts passed horizontal-overflow and minimum touch-target checks
- Axe found no critical or serious violations in the mobile shell
- Desktop screenshot comparison at 1440×1000: 0 changed pixels out of 1,440,000

## Desktop regression result

The original sidebar, dashboard, desktop navigation, account controls, and all-tools experience remain mounted and active above the mobile breakpoint. A clean `origin/main` desktop screenshot and the candidate desktop screenshot were pixel-identical at 1440×1000.

## Known limitations

- Physical-device Human QA remains required for iPhone Safari and Android Chrome.
- Account, board, notation, and advanced category views intentionally direct users to existing tool-owned controls; Season 001 does not centralize or rewrite those settings.
- Play availability continues to follow the repository's existing environment gate. This candidate changes only the Home links, not Play authorization or chess functionality.
- The in-app preview browser host was unavailable during this run; local Playwright browser QA and captured screenshots were used instead.

## Human QA checklist

- [ ] HQA-01 Mobile Home renders correctly.
- [ ] HQA-02 Blue CAISSA knight hero displays correctly.
- [ ] HQA-03 Card spacing and typography are readable.
- [ ] HQA-04 Play opens direct Play Game route.
- [ ] HQA-05 Bots opens direct Bots route.
- [ ] HQA-06 Coach opens direct Coach route.
- [ ] HQA-07 Analyze opens canonical Analyzer.
- [ ] HQA-08 Scanner opens Scanner.
- [ ] HQA-09 Opening Explorer opens correctly.
- [ ] HQA-10 Watch Games Lichess selection works.
- [ ] HQA-11 Watch Games FICS selection works.
- [ ] HQA-12 Settings opens correctly.
- [ ] HQA-13 Back navigation works.
- [ ] HQA-14 No horizontal overflow.
- [ ] HQA-15 Desktop remains unchanged.

## Local preview

From the candidate worktree, run `npm start`, then open `http://127.0.0.1:8000/` at a phone-width viewport. No deployment is required for Human QA.

Final commit SHA is reported in the Human QA handoff after the candidate commit is created.
