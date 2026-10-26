# CAISSA Accessibility Season 001B — Release Candidate

Mission: `CAISSA-A11Y-001B-RELEASE-CERT-20261026`

Decision: **CONDITIONAL GO**. The accessibility-only code is isolated, locally verified, and has no migration or provider dependency. A short targeted Human Test is required because the isolated Scanner consent surface intentionally excludes the privacy lane and the release hardening adds keyboard behavior not present in the owner-tested combined build.

Production remains unchanged. No push, pull request, remote merge, Vercel Preview, Vercel Production deployment, database change, provider configuration change, AUTH-004 change, PayPal restoration, or privacy/security release was performed.

## Owner approval

`HUMAN TEST PASS — CAISSA ACCESSIBILITY SEASON 001B`

The approval applies to the combined Season 2.0 build at `69ef0401b606bc6f537d9b884b87dfc7f1898598`. It is not deployment authorization and is transferred only where behavioral parity is demonstrated.

## Authoritative baseline

- GitHub `main`: `26e9d25bf4ffbd13fb8b4d253e3bdb03169dcf7b`
- Vercel production deployment: `dpl_2uyihaZJjvg2wFS915qWDvhVY9Dm`
- Vercel state: `READY`, target `production`
- Production Git branch/SHA: `main` / `26e9d25bf4ffbd13fb8b4d253e3bdb03169dcf7b`
- Public aliases observed: `www.caissa-chess.org`, `caissa-chess.org`

Both remote `main` and the independently inspected production deployment matched before extraction.

## Worktree preservation

The original checkout remains on `feature/arena-redesign` at `61c2fab70c8eb7d4b431ba9074089e1f346b713b` with its pre-existing Market Reader/Stripe/navigation test edits and untracked diagnostics, migration, test, and `tools/fics-lab/` artifacts intact. It was not reset, stashed, cleaned, or committed. The accessibility, legal, AUTH-004, PayPal, privacy, and combined Season 2.0 worktrees were not edited by this release package.

## Candidate identity

- Worktree: `C:\Users\ALEXANDER\Alexander Projects\TVLavin-Chess-Game2-a11y-001b-release`
- Local branch: `release/accessibility-001b-certified-20261026`
- Runtime checkpoint: `f8252d2bb43ffc0b95a2e6ba98561b4d6f6d95de`
- Runtime tree: `04f4c0016305d60778b210eb3c869c1e59f4b32c`
- Runtime commits above production:
  - `e0d03d1924a144fb0737f34bbe9a791efb561bf5` — accessibility-only extraction of upstream implementation `5a7a680618d4a9df19b0245c595abfe6c6740b98`
  - `f8252d2bb43ffc0b95a2e6ba98561b4d6f6d95de` — WebKit bypass, Scanner modal focus containment, generated fallbacks, and release-only tests

The final local documentation commit and branch tree are reported in the owner handoff because a commit cannot embed its own SHA.

## Scope result

The runtime checkpoint changes 28 files. It changes no package manifest or lockfile, database or migration, Supabase artifact, Worker, authentication provider, Stripe or PayPal integration, `vercel.json`, `server.js`, sitemap, privacy backend, security override, AUTH-004 document, or provider configuration.

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
| Navigation fallback check | PASS after deterministic regeneration |
| Public route inventory | PASS — 78 records |
| Public release audit | PASS — 1,874 committed files, 23 required paths, 24 Chess TV contracts |
| Focused Node | PASS — 7/7 |
| Focused browser | PASS — 33/33, Chromium/Firefox/WebKit |
| Canonical board browser | PASS — 19 passed, 1 intentional project skip |
| Baseline differential | PASS — candidate introduced no failure signature |
| Supply-chain policy | PASS — 501 runtime files, 186 locked entries |
| Dependency audit | BASELINE OPEN — 6 advisories (1 moderate, 5 high), no dependency change |
| Human Test parity | TARGETED RETEST REQUIRED |
| Production authorization | NOT GRANTED |

## Bounded release condition

Before any production approval, the owner should test only these deltas on the exact isolated candidate:

1. WebKit/Safari-style first Tab reaches the global bypass; Enter transfers focus to main content.
2. Scanner New Scan dialog cycles with Tab and Shift+Tab; Escape closes and restores focus.
3. Scanner optional feedback displays the accessibility-only consent wording shown in the candidate screenshot, not the combined privacy-lane rights checkbox.

No complete repeat of Chess Gym, Opening Database, Chess TV, or unchanged navigation behavior is requested.

## Status

`CONDITIONAL GO — TARGETED HUMAN RETEST REQUIRED — PRODUCTION AUTHORIZATION NOT GRANTED`
