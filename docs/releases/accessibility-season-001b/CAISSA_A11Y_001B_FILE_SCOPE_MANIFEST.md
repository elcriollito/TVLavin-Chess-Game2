# CAISSA Accessibility Season 001B — File Scope Manifest

Baseline: `26e9d25bf4ffbd13fb8b4d253e3bdb03169dcf7b`

Certified code checkpoint: `d8958b9b0fafd2c4e51ed45348643077c347b648`

Upstream accessibility implementation: `5a7a680618d4a9df19b0245c595abfe6c6740b98` (locally replayed as `e0d03d1924a144fb0737f34bbe9a791efb561bf5`). Release hardening sources are `f8252d2bb43ffc0b95a2e6ba98561b4d6f6d95de` and the generator synchronization at `d8958b9b0fafd2c4e51ed45348643077c347b648`.

Abbreviations: AF = `accessibility-foundation`; A1B = `accessibility-season-001b`; RC = `accessibility-season-001b-release`; shared = navigation/i18n/generated fallback.

| Path | State | Source | Accessibility rationale / criterion | Associated verification | Shared or combined-build difference |
|---|---:|---|---|---|---|
| `api/_lib/play-v2-public-beta-document.js` | M | 5a7a + d895 | Accessible fail-closed document and synchronized generated export; 2.4.7 | fallback check + generator EOL + Play beta entry | Shared export; candidate includes regenerated active-state fallback |
| `chess-gym.html` | M | 5a7a | Tab/panel relationships; 1.3.1, 4.1.2 | A1B Node/browser | Identical to combined |
| `css/caissa-standalone-sidebar.css` | M | 5a7a | Brand/focus contrast; 1.4.3, 1.4.11, 2.4.7 | AF browser, RC contrast | Shared; identical to combined |
| `css/chess-gym.css` | M | 5a7a | Selected/disabled/focus presentation; 1.4.3, 1.4.11, 2.4.7 | A1B browser/Axe | Identical to combined |
| `css/spectator-tv-2.css` | M | 5a7a | Visible non-color turn state; 1.4.1 | A1B Node | Identical to combined |
| `endgame-trainer.html` | M | 5a7a | Generated semantic navigation fallback; 1.3.1, 4.1.2 | fallback check, navigation Node | Shared; identical to combined |
| `index.html` | M | 5a7a + f825 | Bypass, focus target, Chess TV status; 2.4.1, 2.4.3, 4.1.3 | AF/A1B/RC browser | Shared; explicit WebKit `tabindex` differs from combined |
| `js/caissa-i18n.js` | M | 5a7a | EN/ES/PT accessible names; 3.1.2, 4.1.2 | AF Node/browser | Shared; identical to combined |
| `js/caissa-primary-navigation.js` | M | 5a7a | Correct language semantics, Premium name, focus transfer; 2.4.1, 2.5.3, 4.1.2 | AF/A1B + navigation tests | Shared; identical to combined |
| `js/caissa-standalone-sidebar.js` | M | 5a7a + f825 | Injected bypass and explicit WebKit tab stop; 2.1.1, 2.4.1 | A1B Node, AF WebKit | Shared; hardening differs from combined |
| `js/chess-gym/page.js` | M | 5a7a | Roving focus and Arrow/Home/End; 2.1.1, 2.4.3, 4.1.2 | A1B Node/browser | Identical to combined |
| `js/opening-database.js` | M | 5a7a | Keyboard tabs and bounded status/error announcements; 2.1.1, 4.1.3 | A1B + Opening tests | Identical to combined |
| `js/play/games-panel.js` | M | 5a7a | Visible label remains accessible name; 2.5.3 | AF Node | Identical to combined |
| `js/spectator-tv-section.js` | M | 5a7a | Visible turn state and deduplicated announcements; 1.4.1, 4.1.3 | A1B + Chess TV tests | Identical to combined |
| `opening-database.html` | M | 5a7a | Tab/panel/status/error semantics; 1.3.1, 4.1.2, 4.1.3 | A1B Node/browser | Identical to combined |
| `play-v2-ipad-analyze-diagnostic.html` | M | 5a7a + f825 generator | Current semantic fallback/active state; 1.3.1, 4.1.2 | fallback check, Play gate | Shared generated output; active marker differs from combined |
| `play-v2-promotion-qa.html` | M | 5a7a + f825 generator | Current semantic fallback/active state; 1.3.1, 4.1.2 | fallback check, Play gate | Shared generated output; active marker differs from combined |
| `play-v2-public-beta.html` | M | 5a7a + f825 generator | Current semantic fallback/active state; 1.3.1, 4.1.2 | fallback check, Play gate | Shared generated output; active marker differs from combined |
| `play-v2.html` | M | 5a7a + f825 generator | Current semantic fallback/active state; 1.3.1, 4.1.2 | fallback check, Play gate | Shared generated output; active marker differs from combined |
| `scripts/build-navigation-fallbacks.mjs` | M | d895 | Keeps generated Play HTML and its server-side module export atomic | fallback check + generator EOL + Play beta entry | Shared build tooling; prevents stale accessibility fallback export |
| `scanner/index.html` | M | 5a7a | Product naming, limits, dialog description; 3.3.2, 4.1.2 | A1B + RC browser/Axe | Combined adds privacy-lane image-rights control; targeted retest |
| `scanner/scanner-app.js` | M | f825 | Modal Tab/Shift+Tab containment and focus return; 2.1.1, 2.1.2, 2.4.3 | A1B Node + RC browser | Candidate focus trap differs; combined instead contains privacy-lane eligibility logic |
| `styles.css` | M | 5a7a + f825 | Robust visible bypass in WebKit; 2.4.1, 2.4.7 | AF + RC browser | Shared hardening differs from combined |
| `tests/accessibility-foundation.test.js` | A | 5a7a + f825 | Static foundation contract | 7-test focused Node command | Test-only |
| `tests/accessibility-season-001b.test.js` | A | 5a7a + f825 | Product/static accessibility contract | 7-test focused Node command | Test-only |
| `tests/browser/accessibility-foundation.spec.js` | A | 5a7a | Browser bypass, locale and Axe contract | Chromium/Firefox/WebKit | Test-only |
| `tests/browser/accessibility-season-001b-release.spec.js` | A | f825 | Shift+Tab/modal, 200% zoom, computed contrast | Chromium/Firefox/WebKit | Release test-only; not in combined |
| `tests/browser/accessibility-season-001b.spec.js` | A | 5a7a | Product keyboard semantics and Axe | Chromium/Firefox/WebKit | Test-only |
| `yahoo-classic.html` | M | 5a7a | Generated semantic navigation fallback | fallback check, navigation Node | Shared; identical to combined |

## Certification package inventory

The following 23 added paths are release evidence only and have no runtime effect:

| Path | Purpose |
|---|---|
| `docs/releases/accessibility-season-001b/CAISSA_A11Y_001B_BASELINE_COMPARISON.md` | Production-base failure differential |
| `docs/releases/accessibility-season-001b/CAISSA_A11Y_001B_DEPLOYMENT_RUNBOOK.md` | Future owner-authorized release procedure |
| `docs/releases/accessibility-season-001b/CAISSA_A11Y_001B_FILE_SCOPE_MANIFEST.md` | Exact implementation and evidence inventory |
| `docs/releases/accessibility-season-001b/CAISSA_A11Y_001B_HUMAN_TEST_PARITY.md` | Combined-build parity and bounded retest |
| `docs/releases/accessibility-season-001b/CAISSA_A11Y_001B_RECOVERY_PLAN.md` | Revert and forward-fix strategy |
| `docs/releases/accessibility-season-001b/CAISSA_A11Y_001B_RELEASE_CANDIDATE.md` | Executive certification record |
| `docs/releases/accessibility-season-001b/CAISSA_A11Y_001B_TEST_RESULTS.md` | Commands, counts, failures, and limits |
| `docs/releases/accessibility-season-001b/evidence/candidate/chess-gym-desktop.png` | Candidate Chess Gym visual |
| `docs/releases/accessibility-season-001b/evidence/candidate/chess-tv-desktop.png` | Candidate Chess TV visual |
| `docs/releases/accessibility-season-001b/evidence/candidate/navigation-desktop.png` | Candidate desktop navigation visual |
| `docs/releases/accessibility-season-001b/evidence/candidate/navigation-mobile.png` | Candidate mobile navigation visual |
| `docs/releases/accessibility-season-001b/evidence/candidate/opening-database-desktop.png` | Candidate Opening Database visual |
| `docs/releases/accessibility-season-001b/evidence/candidate/scanner-desktop.png` | Candidate Scanner desktop visual |
| `docs/releases/accessibility-season-001b/evidence/candidate/scanner-feedback-consent-mobile.png` | Candidate Scanner consent visual |
| `docs/releases/accessibility-season-001b/evidence/candidate/scanner-mobile.png` | Candidate Scanner mobile visual |
| `docs/releases/accessibility-season-001b/evidence/combined/chess-gym-desktop.png` | Owner-tested combined Chess Gym visual |
| `docs/releases/accessibility-season-001b/evidence/combined/chess-tv-desktop.png` | Owner-tested combined Chess TV visual |
| `docs/releases/accessibility-season-001b/evidence/combined/navigation-desktop.png` | Owner-tested combined desktop navigation visual |
| `docs/releases/accessibility-season-001b/evidence/combined/navigation-mobile.png` | Owner-tested combined mobile navigation visual |
| `docs/releases/accessibility-season-001b/evidence/combined/opening-database-desktop.png` | Owner-tested combined Opening Database visual |
| `docs/releases/accessibility-season-001b/evidence/combined/scanner-desktop.png` | Owner-tested combined Scanner desktop visual |
| `docs/releases/accessibility-season-001b/evidence/combined/scanner-feedback-consent-mobile.png` | Owner-tested combined Scanner consent visual |
| `docs/releases/accessibility-season-001b/evidence/combined/scanner-mobile.png` | Owner-tested combined Scanner mobile visual |

## Positive allowlist conclusion

All 29 implementation allowlist paths map to Foundation 001, Season 001B, a direct accessibility hardening, an accessibility test, or deterministic shared navigation output/tooling. The other 23 paths in the final release range are the seven certification documents and sixteen public-safe evidence captures. No deletion occurs.

## Negative restricted-path conclusion

The exact path scan returned `restricted_path_hits=0`. No changed path belongs to Supabase, migrations, Scanner persistence or quota services, Worker code, downloads hardening, polyglot security, authentication, Stripe, PayPal, AUTH-004, privacy publication, dependency overrides, or provider configuration.

`package.json`, `package-lock.json`, `vercel.json`, `server.js`, and `public/sitemap.xml` are byte-identical to the selected production base.

## Secret and payment checks

- Added-line secret-pattern findings: `0`
- Added PayPal/Hosted Button/contribution lines: `0`
- `/support` redirects: unchanged, still `/help`
- Private data and private transaction inspection: not performed and not required
