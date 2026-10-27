# CAISSA Accessibility Season 001B — Test Results

Original candidate commands ran from `C:\Users\ALEXANDER\Alexander Projects\TVLavin-Chess-Game2-a11y-001b-release`. Hotfix commands ran from `C:\Users\ALEXANDER\Alexander Projects\TVLavin-Chess-Game2-a11y-001b-webkit-hotfix`. Candidate and hotfix browser tests used the loopback-only server `http://127.0.0.1:8187` at their respective checkpoints. Baseline differential browser tests used detached production commit `26e9d25…` at `http://127.0.0.1:8188`.

## Focused accessibility gates

```powershell
node --test tests/accessibility-foundation.test.js tests/accessibility-season-001b.test.js
```

Result: **PASS — 7/7**.

```powershell
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:8187'
npx playwright test tests/browser/accessibility-foundation.spec.js tests/browser/accessibility-season-001b.spec.js tests/browser/accessibility-season-001b-release.spec.js --project=chromium --project=firefox --project=webkit
```

Result: **PASS — 33/33** (11 per browser project). Coverage includes mouse activation, keyboard-only operation, Tab/Shift+Tab, Arrow/Home/End, skip-link focus and transfer, accessible naming, dialog focus containment/restoration, 200% zoom, computed 4.5:1 text contrast, EN/ES/PT, and serious/critical Axe findings.

## Pre-hotfix final-gate rerun — 2026-10-26

The exact focused browser command was repeated after the owner's targeted acceptance against unchanged candidate `23cc63fe807b9703224539004dd69b8155069ebd`.

Result: **BLOCKED — 32 passed / 1 failed**. WebKit did not move focus from the Opening Database `Moves` tab to `Search Games` when `End` was pressed immediately after navigation.

The failing assertion was then isolated:

```powershell
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:8187'
npx playwright test tests/browser/accessibility-season-001b.spec.js --project=webkit --grep "Opening Database exposes operable tabs" --repeat-each=5
```

Result: **3 passed / 2 failed** with the same focus signature. A separate read-only WebKit diagnostic completed the immediate focus/`End` sequence 10/10 times, confirming nondeterministic timing rather than a permanently absent handler, but it does not erase the official-suite failures.

Source inspection identifies the timing boundary: `runInit()` awaits `initBoard()` before calling `bindEvents()` in `js/opening-database.js`. The tabs are already rendered and focusable during that interval. The candidate and owner-tested combined build contain byte-identical Opening Database HTML/controller blobs, so this is not an extraction drift; it is a newly evidenced initialization race in the tested implementation.

At that checkpoint, no source fix was made because the owner had approved the exact candidate and the final gate forbade silently changing it. The separately authorized hotfix below implements the required binding change and supplies the requested automated evidence. Bounded Opening Database keyboard re-approval remains the only human gate.

## WebKit initialization race hotfix certification

Hotfix checkpoint: `4c7c3292cd181e96b67500326576c408efe41120`
Implementation tree: `82f842f41d3e5ff56495217f3f4ddea9847c7f5b`

The hotfix extracts idempotent tab interaction binding from the board-dependent event bundle. It binds and initializes tab semantics before `await initBoard()`, and it removes the late default-tab reset so an early user selection is preserved.

| Verification | Result |
|---|---|
| Deterministic delayed/fast/idempotent/failure WebKit spec | PASS — 4/4 |
| Previously failing WebKit assertion, `--repeat-each=30 --retries=0` | PASS — 30/30 |
| Deterministic delayed-init scenario, `--repeat-each=30 --retries=0` | PASS — 30/30 |
| Expanded Chromium/Firefox/WebKit accessibility suite | PASS — 45/45 |
| Broader WebKit selection repeated three times | PASS — 45/45 |
| Focused/static/Open Database Node selection | PASS — 15/15 |
| Final focused accessibility Node | PASS — 7/7 |
| Generator/Play contracts | PASS — 14/14 |
| Opening Database source contracts | PASS — 8/8 |
| Canonical board Chromium/WebKit | PASS — 19 passed, 1 intentional skip |
| Opening Database Quiet Drag Chromium/WebKit | PASS — 14/14 |
| Public release audit | PASS — 1,874 files, 23 required paths, 24 Chess TV contracts |
| Route inventory | PASS — 78 records |
| Supply-chain policy | PASS — 501 runtime files, 186 locked entries |
| Restricted path / secret / PayPal additions | PASS — 0 / 0 / 0 |

No retry, skip, expected-failure marker, arbitrary sleep, dependency change, or production-only debug hook was used to hide the race. The deterministic browser test holds the Quiet Drag module request pending, exercises the complete tab contract, releases initialization, and proves the early Games selection/focus survives.

## Final production-authorization gate — 2026-10-26

The immutable final candidate was rerun after the owner reported all three Human Test phases as passed. Every Playwright command below used `--retries=0`.

| Command or check | Final result |
|---|---|
| `node --test tests/accessibility-foundation.test.js tests/accessibility-season-001b.test.js` | PASS — 7/7 |
| WebKit deterministic race spec | PASS — 4/4 |
| Formerly failing WebKit assertion, `--repeat-each=30` | PASS — 30/30 |
| Controlled delayed-init assertion, `--repeat-each=30` | PASS — 30/30 |
| Four-spec Chromium/Firefox/WebKit accessibility selection | PASS — 45/45 |
| Canonical board Chromium/WebKit | PASS — 19 passed, 1 intentional project skip |
| Opening Database Quiet Drag Chromium/WebKit | PASS — 14/14 |
| Navigation fallback / route inventory / public audit | PASS — current / 78 / 1,874 files |
| Generator and Play fail-closed contracts | PASS — 14/14 |
| Opening Database source contracts | PASS — 8/8 |
| PayPal retirement Node / browser contracts | PASS — 5/5 and 4/4 |
| Scanner feedback and public-governance contracts | PASS — 31/31 |
| Changed JavaScript syntax | PASS — 16/16 |
| Supply-chain policy | PASS — 501 runtime files, 186 locked entries |
| Restricted path / added secret / package-lock delta | PASS — 0 / 0 / 0 |
| `/support` | PASS — HTTP 308 to `/help` |

The combined navigation/i18n Node selection produced 23/24 because `game-library-champions.html` lacks the test's expected i18n-before-navigation script order. The exact command reproduced 23/24 with the identical failure on detached production `26e9d25…`; both the HTML and failing test blobs are byte-identical across baseline and candidate. This is a pre-existing repository failure, not a candidate-attributable regression.

Read-only Vercel inspection confirmed deployment `dpl_2uyihaZJjvg2wFS915qWDvhVY9Dm`, project `prj_SU3FQKbxjztMccLO5TYBSpU6XvDf`, state/target `READY` / `production`, and Git SHA `26e9d25…` for both public domains. No deployment was created or changed.

## Canonical board behavior

```powershell
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:8187'
npx playwright test tests/browser/caissa-board-persistent-renderer.spec.js --config=playwright.board.config.js --project=chromium --project=webkit
```

Result: **PASS — 19 passed, 1 intentionally skipped**. Verified persistent board structure, quiet drag, selection, capture, en passant, castling, promotion, orientation, keyboard operation, update soak, responsive geometry, and Axe.

## Broader affected-source Node suite

```powershell
node --test tests/accessibility-foundation.test.js tests/accessibility-season-001b.test.js tests/chess-gym-foundation.test.js tests/opening-database-quiet-drag.test.js tests/opening-database-data-parity.test.js tests/spectator-tv-v2-shell.test.js tests/scanner-visual-contract.test.js tests/scanner-mobile-workspace.test.js tests/navigation-integrity.test.js tests/i18n-foundation.test.js tests/public-route-inventory.test.js tests/board/caissa-quiet-drag.test.js tests/play/simplified-play-shell.test.js tests/play/play-accessibility.test.js tests/play/games-panel.test.js
```

Candidate: **119 passed / 2 failed / 121 total**.

Detached production baseline comparison:

```powershell
node --test tests/i18n-foundation.test.js tests/spectator-tv-v2-shell.test.js
```

Baseline: **25 passed / 2 failed / 27 total**, with the same two failure signatures:

- `game-library-champions.html` is already missing the required i18n-before-navigation ordering.
- Chess TV already uses a different ECO resolver asset version than the stale `?v=1.0.0` assertion.

No candidate regression was identified.

## Broader affected-browser suite

```powershell
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:8187'
npx playwright test tests/browser/opening-database-quiet-drag.spec.js tests/browser/opening-database-data-parity.spec.js tests/browser/spectator-tv-v2-shell.spec.js tests/browser/scanner-mobile-workspace.spec.js tests/browser/i18n-navigation.spec.js tests/browser/puzzles-training-tools.spec.js --project=chromium
```

Candidate: **30 passed / 27 failed / 57 total**. The same command at `http://127.0.0.1:8188` on the detached production SHA reproduced the same 30/27 split and failure classes. Details are in [CAISSA_A11Y_001B_BASELINE_COMPARISON.md](CAISSA_A11Y_001B_BASELINE_COMPARISON.md).

## Generators, routes, syntax, and supply chain

| Command | Result |
|---|---|
| `node scripts/build-navigation-fallbacks.mjs --check` | PASS after deterministic fallback regeneration |
| `node scripts/build-caissa-public-route-inventory.mjs` | PASS — 78 records; byte-stable output |
| `npm run release:public:audit` | PASS — 1,874 committed files, 23 required paths, 24 Chess TV contracts |
| `node --test tests/generator-eol-reproducibility.test.js tests/play/play-v2-beta-entry.test.js` | PASS — 14/14 |
| `node --check` on every changed JS/test source | PASS |
| `git diff --check` | PASS |
| `node scripts/audit-supply-chain.mjs` | PASS — 501 runtime files, 186 locked entries |
| package/lock diff against production | PASS — no difference |
| restricted-path scan | PASS — 0 hits |
| added-line secret scan | PASS — 0 hits |
| added-line PayPal scan | PASS — 0 hits |

## Candidate dependency state

`npm ci` installed 162 packages and audited 163 install-time packages. `npm audit --json` reports **6 advisories: 1 moderate, 5 high, 0 critical** across the full metadata graph (186 dependencies): `@vercel/cli-config`, `@vercel/functions`, `@vercel/oidc`, `cheerio`, `undici`, and `zod`.

This release changes neither package file. The advisories are inherited from the production base and are not fixed or attributed to this accessibility candidate.

## Screenshots

Sixteen public-safe comparison captures are under `evidence/candidate/` and `evidence/combined/`. They cover Chess Gym, Opening Database, Chess TV, Scanner, navigation, desktop/mobile geometry, and the material Scanner consent difference.

## Limits and unverified matters

- No physical screen reader, VoiceOver, TalkBack, switch-control, or braille-device session was performed by automation.
- WebKit automation is not a claim of testing physical Safari hardware.
- No private Scanner images, database rows, user records, account balances, or transactions were inspected.
- No Clerk, Google, Stripe, PayPal, Supabase, DNS, GitHub, or Vercel configuration was changed.
- External Opening Database shard availability and Scanner runtime asset 404s remain outside this accessibility patch.
