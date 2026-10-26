# CAISSA Accessibility Season 001B — Test Results

All candidate commands ran from `C:\Users\ALEXANDER\Alexander Projects\TVLavin-Chess-Game2-a11y-001b-release`. Candidate browser tests used the loopback-only server `http://127.0.0.1:8187`. Baseline differential browser tests used detached production commit `26e9d25…` at `http://127.0.0.1:8188`.

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
