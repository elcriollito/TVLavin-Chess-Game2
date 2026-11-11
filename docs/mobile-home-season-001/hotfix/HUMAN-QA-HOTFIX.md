# CAISSA Mobile Season 001 — Human QA hotfix

Status: `READY_FOR_HUMAN_QA`

Branch: `feature/caissa-mobile-home-s001-20261111`

Baseline: `a874d5c4d3dd0ac30a16c01c24c7f5657065bb48`

Canonical routes: `/`, `/watch/lichess-tv`, `/opening-database`, `/analyze`

## Root-cause audit

| Area | Classification | Root cause | Resolution |
|---|---|---|---|
| Settings language | NEW MOBILE ISSUE | The Season 001 sheet styled the native `select` as a flex container and depended on document-level locale delegation from inside a modal dialog. That combination was unreliable with the iPhone Safari native picker. | Restored a native `menulist` control at 16 px and bound `input` plus `change` directly to the existing `CaissaI18n.setLocale` owner. Existing `caissa.locale` persistence and EN/ES/PT bundles remain authoritative. |
| Analyzer vertical movement | SHARED ISSUE | The shared Analyze notation renderer called `scrollIntoView()` on the active move. At the shorter 390 px viewport that also scrolled the outer Analyze section by 10 px, moving the board. | The renderer now scrolls only its notation owner using local bounding rectangles and `scrollTop`; the compact shell also disables scroll anchoring and uses viewport-relative board sizing. |
| Analyzer legacy Menu | LEGACY ISSUE | The generic legacy mobile quick-action factory added its `menu` action to Analyze, exposing the old mobile shell from the new canonical experience. | Analyze now registers only its Engine action; the canonical mobile header/menu toggle is route-scoped out of the compact surface. |
| “CAISSA Classic” title | LEGACY ISSUE | The legacy SPA shell shipped a hard-coded Classic header default, while the canonical-route metadata policy created canonical metadata but did not apply the route title early on direct loads. | The shell default is neutral and the route policy applies `Analyze | CAISSA Chess` plus the canonical surface marker before the Analyze UI initializes. |

## Implementation evidence

- Mobile Home Watch Games is a single anchor to `/watch/lichess-tv` with the copy “High-rated chess live”; it has no provider submenu.
- FICS was removed only from Mobile Home navigation. Desktop Home still contains its FICS card, and the global `/fics` route, primary navigation, client, and spectator integrations are unchanged.
- Lichess TV is board-first below 800 px. The intro, promotional blocks, duplicated navigation and footer are hidden; `Powered by Lichess · Info` remains as compact progressive disclosure.
- Opening Explorer uses the existing real-game row source and `sortExplorerRows()`. At up to 640 px, `renderStatsRows()` takes the first five popularity-sorted rows. “More moves” is optional disclosure, and expansion resets whenever the normalized FEN changes.
- Engine arrows reuse the existing Stockfish 19 candidate-evaluation queue and `getExplorerDisplayRows()` ordering. The first valid evaluated move is the primary SVG arrow; at most two further evaluated moves are translucent secondary arrows. No second engine owner was added.
- `/analyze` is canonical. Legacy `/?section=analyze` links found in Help and Blog were changed to `/analyze`; the exact legacy route adapter remains only for backward-compatible inbound URLs.

## Automated verification

- 43/43 targeted Node contract tests passed.
- 28/28 required mobile browser tests passed in Chromium and WebKit, covering 390 px and 430 px.
- 29/29 scoped desktop/tablet regression checks passed: desktop Home, Analyzer shell/session sanity, Explorer at 768/1024/1440, sort behavior, accessibility and overflow.
- An additional pre-existing Analyzer engine-streaming test completed its functional assertions but its final console-cleanliness check still reports three baseline CSP violations from the unchanged inline Help buttons in `index.html`. The same handlers exist in the baseline commit; they are outside this mobile hotfix and did not block the scoped regression gate.

## Physical iPhone checklist

Automated status is complete. `DEVICE RECHECK` means the item is ready to repeat on physical iPhone Safari; it does not claim a new physical-device run.

| ID | Check | Automated | Physical |
|---|---|---:|---:|
| HQA-01 | Mobile Home Watch Games has no Lichess/FICS submenu. | PASS | DEVICE RECHECK |
| HQA-02 | Watch Games opens Lichess directly. | PASS | DEVICE RECHECK |
| HQA-03 | Watch Games board appears near the top. | PASS | DEVICE RECHECK |
| HQA-04 | Long Watch Games explanation is hidden/collapsed. | PASS | DEVICE RECHECK |
| HQA-05 | Compact Lichess attribution remains available. | PASS | DEVICE RECHECK |
| HQA-06 | Opening Explorer board appears near the top. | PASS | DEVICE RECHECK |
| HQA-07 | Explorer shows five popular moves by default. | PASS | DEVICE RECHECK |
| HQA-08 | Top five refreshes after a move. | PASS | DEVICE RECHECK |
| HQA-09 | Engine mode renders the best-move arrow. | PASS | DEVICE RECHECK |
| HQA-10 | Engine mode renders no more than three arrows. | PASS | DEVICE RECHECK |
| HQA-11 | Settings language selector is operable. | PASS | DEVICE RECHECK |
| HQA-12 | English to Spanish works. | PASS | DEVICE RECHECK |
| HQA-13 | Locale persists through reload using existing behavior. | PASS | DEVICE RECHECK |
| HQA-14 | Analyzer board stays vertically fixed through moves. | PASS | DEVICE RECHECK |
| HQA-15 | Dynamic engine updates do not move the board. | PASS | DEVICE RECHECK |
| HQA-16 | Legacy Analyzer Menu is absent from the mobile experience. | PASS | DEVICE RECHECK |
| HQA-17 | Canonical mobile Analyzer exposes no path into the old shell. | PASS | DEVICE RECHECK |
| HQA-18 | Browser title is `Analyze | CAISSA Chess`. | PASS | DEVICE RECHECK |
| HQA-19 | Canonical `/analyze` loads correctly. | PASS | DEVICE RECHECK |
| HQA-20 | Browser Back returns naturally to Mobile Home. | PASS | DEVICE RECHECK |
| HQA-21 | Home, Lichess, Explorer and Analyzer have no horizontal overflow. | PASS | DEVICE RECHECK |
| HQA-22 | Desktop Home remains the existing dashboard. | PASS | DEVICE RECHECK |
| HQA-23 | Desktop Analyzer sanity check passes. | PASS | DEVICE RECHECK |

## Screenshots

Home:

- [390 px](../screenshots/mobile-home-390.png)
- [430 px](../screenshots/mobile-home-430.png)
- [Language selector](../screenshots/mobile-settings-language.png)

Hotfix surfaces:

- [Opening Explorer — 390 px](screenshots/opening-explorer-390.png)
- [Opening Explorer — 430 px](screenshots/opening-explorer-430.png)
- [Analyzer — 390 px](screenshots/analyzer-390.png)
- [Analyzer — 430 px](screenshots/analyzer-430.png)
- [Lichess TV — 390 px](screenshots/lichess-tv-390.png)
- [Lichess TV — 430 px](screenshots/lichess-tv-430.png)
