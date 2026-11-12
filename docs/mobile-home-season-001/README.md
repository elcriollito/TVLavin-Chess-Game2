# CAISSA Mobile Experience — Season 001

Status: `READY_FOR_HUMAN_QA`

## Candidate

- Branch: `feature/caissa-mobile-home-s001-20261111`
- Worktree: `C:\Users\ALEXANDER\Alexander Projects\TVLavin-Chess-Game2-mobile-home-s001`
- Hotfix baseline: `a874d5c4d3dd0ac30a16c01c24c7f5657065bb48`
- Publication: not pushed, merged, deployed, or published
- Mobile Home breakpoint: 720 px and below; the existing desktop Home remains active above it

## Routes

| Mobile destination | Route |
|---|---|
| Play | `/play/games` |
| Puzzles | `/puzzles` |
| Bots | `/play/bots` |
| Coach | `/play/coach` |
| Analyze | `/analyze` |
| CAISSA Scanner | `/scanner` |
| Opening Explorer | `/opening-database` |
| Watch Games | `/watch/lichess-tv` |
| Settings | Mobile category sheet on Home |

Watch Games is a direct Lichess destination on Mobile Home. FICS remains available elsewhere on the CAISSA website and was not removed globally.

## QA handoff

The hotfix implementation notes, root-cause classifications, HQA-01…23 physical checklist, automated totals, and all 390/430 px evidence are in [HUMAN-QA-HOTFIX.md](hotfix/HUMAN-QA-HOTFIX.md).

## Local preview

Run the candidate on `0.0.0.0`, then open the computer's LAN address from a phone on the same network. No deployment is required for Human QA.
