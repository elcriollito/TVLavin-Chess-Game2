# CAISSA Accessibility Season 001B — Release Candidate

Mission: `CAISSA-A11Y-001B-RELEASE-CERT-20261026`

Decision: **GO FOR OWNER PRODUCTION APPROVAL**. All three owner Human Test phases pass. Hotfix `4c7c3292cd181e96b67500326576c408efe41120` resolves the WebKit Opening Database initialization race without migration or provider dependencies, and the immutable candidate passes the fresh deterministic, repeated WebKit, multibrowser, board, privacy-boundary, PayPal-retirement, and release-integrity gates.

Production remains unchanged. No push, pull request, remote merge, Vercel Preview, Vercel Production deployment, database change, provider configuration change, AUTH-004 change, PayPal restoration, or privacy/security release was performed.

## Owner approval

`HUMAN TEST PASS — CAISSA ACCESSIBILITY SEASON 001B`

`TARGETED HUMAN RETEST PASS — CAISSA ACCESSIBILITY 001B`

`FINAL WEBKIT HOTFIX RETEST PASS — CAISSA ACCESSIBILITY 001B`

The original approval applies to the combined Season 2.0 build at `69ef0401b606bc6f537d9b884b87dfc7f1898598`. The targeted approval applies to the isolated release candidate at `23cc63fe807b9703224539004dd69b8155069ebd`, tree `124a9a5220bfb0550c1d9e2a79eed1fad987d7ff`. The final Opening Database approval applies to hotfix `4c7c3292cd181e96b67500326576c408efe41120`, tree `82f842f41d3e5ff56495217f3f4ddea9847c7f5b`. These approvals are not deployment authorization, legal approval of Scanner processing, or whole-site WCAG certification.

## Authoritative baseline

- GitHub `main`: `26e9d25bf4ffbd13fb8b4d253e3bdb03169dcf7b`
- Vercel production deployment: `dpl_2uyihaZJjvg2wFS915qWDvhVY9Dm`
- Vercel state: `READY`, target `production`
- Production Git branch/SHA: `main` / `26e9d25bf4ffbd13fb8b4d253e3bdb03169dcf7b`
- Public aliases observed: `www.caissa-chess.org`, `caissa-chess.org`

Remote `main`, the independently inspected deployment ID, and both production domains were reverified at the final authorization gate and still matched this baseline.

## Worktree preservation

The original checkout remains on `feature/arena-redesign` at `61c2fab70c8eb7d4b431ba9074089e1f346b713b` with its pre-existing Market Reader/Stripe/navigation test edits and untracked diagnostics, migration, test, and `tools/fics-lab/` artifacts intact. It was not reset, stashed, cleaned, or committed. The accessibility, legal, AUTH-004, PayPal, privacy, and combined Season 2.0 worktrees were not edited by this release package.

## Candidate identity

- Worktree: `C:\Users\ALEXANDER\Alexander Projects\TVLavin-Chess-Game2-a11y-001b-webkit-hotfix`
- Local branch: `hotfix/a11y-001b-openingdb-webkit-init-race`
- Certified code checkpoint: `d8958b9b0fafd2c4e51ed45348643077c347b648`
- Certified code tree: `33a9b2ed1c31c02dcf18fb0b07dcab74949284d0`
- WebKit race hotfix checkpoint: `4c7c3292cd181e96b67500326576c408efe41120`
- WebKit race hotfix tree: `82f842f41d3e5ff56495217f3f4ddea9847c7f5b`
- Runtime commits above production:
  - `e0d03d1924a144fb0737f34bbe9a791efb561bf5` — accessibility-only extraction of upstream implementation `5a7a680618d4a9df19b0245c595abfe6c6740b98`
  - `f8252d2bb43ffc0b95a2e6ba98561b4d6f6d95de` — WebKit bypass, Scanner modal focus containment, generated fallbacks, and release-only tests
  - `d8958b9b0fafd2c4e51ed45348643077c347b648` — atomically synchronizes the generated Play fallback module with navigation fallback regeneration
  - `4c7c3292cd181e96b67500326576c408efe41120` — binds Opening Database tab interactions before asynchronous board initialization and adds deterministic race coverage

The final local documentation commit and branch tree are reported in the owner handoff because a commit cannot embed its own SHA.

## Scope result

The implementation allowlist at the hotfix checkpoint contains 30 runtime, build, and test paths. The final release range contains 53 paths after adding seven certification documents and sixteen public-safe evidence captures. It changes no package manifest or lockfile, database or migration, Supabase artifact, Worker, authentication provider, Stripe or PayPal integration, `vercel.json`, `server.js`, sitemap, privacy backend, security override, AUTH-004 document, or provider configuration.

`PLAY_V2_UNAVAILABLE_DOCUMENT` remains exported and the Play unavailable gate remains fail-closed. `/support`, `/support/`, and `/support.html` remain 308 redirects to `/help`. No PayPal text, SDK, Hosted Button, CSP permission, or donation navigation was added.

See [CAISSA_A11Y_001B_FILE_SCOPE_MANIFEST.md](CAISSA_A11Y_001B_FILE_SCOPE_MANIFEST.md) for the allowlist and per-file rationale.

## Accessibility result

- Foundation: language-control semantics, truthful Premium naming, brand contrast, application bypass, and Play setup-summary naming retained.
- Chess Gym: semantic tabs/panels, roving focus, Arrow/Home/End operation, selected state, and contrast retained.
- Opening Database: operable tabs, focus order, loading/result/error semantics, and nonintrusive status updates retained.
- Chess TV: visible side-to-move text, accessible labels, non-color-only state, and bounded announcements retained.
- Scanner: truthful product naming, file limits, described feedback dialog, accessible controls, initial focus, Tab/Shift+Tab containment, Escape dismissal, and focus restoration retained.
- Global navigation: EN/ES/PT bypass names, valid focus transfer, explicit WebKit tab stop, visible focus, current inventory, and PayPal retirement retained.

## Certification gates

| Gate | Result |
|---|---|
| Current production base verified | PASS |
| Accessibility-only allowlist | PASS |
| Restricted-path negative scan | PASS |
| Package/lock parity | PASS |
| Secret-pattern scan | PASS — 0 findings |
| PayPal-addition scan | PASS — 0 additions |
| PayPal retirement contracts | PASS — 5/5 Node and 4/4 Chromium |
| Navigation fallback check | PASS after deterministic regeneration |
| Public route inventory | PASS — 78 records |
| Public release audit | PASS — 1,874 committed files, 23 required paths, 24 Chess TV contracts |
| Focused Node | PASS — 7/7 |
| Focused browser, prior certification | PASS — 33/33, Chromium/Firefox/WebKit |
| Original failing WebKit scenario after hotfix | PASS — 30/30 consecutive, no retries |
| Deterministic delayed-init WebKit scenario | PASS — 30/30 consecutive, no retries |
| Expanded focused browser suite | PASS — 45/45, Chromium/Firefox/WebKit |
| Repeated broader WebKit selection | PASS — 45/45 across three consecutive runs |
| Canonical board browser | PASS — 19 passed, 1 intentional project skip |
| Opening Database Quiet Drag | PASS — 14/14, Chromium/WebKit |
| Scanner consent/backend governance | PASS — 31/31; no backend/model delta |
| Broader baseline differential | PASS — previously compared failure counts/signatures remain unchanged; focused WebKit race is separate |
| Supply-chain policy | PASS — 501 runtime files, 186 locked entries |
| Dependency audit | BASELINE OPEN — 6 advisories (1 moderate, 5 high), no dependency change |
| Human Test parity | PASS — original, targeted, and final WebKit owner tests approved |
| Production authorization | NOT GRANTED |

## Human acceptance completion

The owner completed and approved these deltas on exact candidate `23cc63fe807b9703224539004dd69b8155069ebd`:

1. WebKit/Safari-style first Tab reaches the global bypass; Enter transfers focus to main content.
2. Scanner New Scan dialog cycles with Tab and Shift+Tab; Escape closes and restores focus.
3. Scanner optional feedback displays the accessibility-only consent wording shown in the candidate screenshot, not the combined privacy-lane rights checkbox.

No repeat of these accepted checks is requested unless source changes invalidate the approval.

The owner also approved the final Opening Database hotfix behavior: immediate tab access during initialization, `End` to `Search Games`, `Home` to `Moves`, retained behavior after board readiness, and normal mouse/tab operation.

## WebKit race correction

The root cause was `bindEvents()` running only after asynchronous `initBoard()` completed. The hotfix extracts an idempotent tab-only binding helper, invokes it synchronously before the board boundary, initializes default tab semantics before awaiting, and removes the late `setActiveTab('moves')` override. Board-dependent controls remain bound after board initialization. Early user selection survives success or failure of board setup.

## Remaining release condition

All technical and Human Test gates are complete. Production publication still requires a new, explicit owner authorization for the exact final documentation HEAD/tree reported in the handoff, followed by the drift checks and Git-to-Vercel procedure in `CAISSA_A11Y_001B_DEPLOYMENT_RUNBOOK.md`.

## Status

`GO FOR OWNER PRODUCTION APPROVAL — ALL HUMAN TESTS PASS — PRODUCTION AUTHORIZATION NOT GRANTED`
