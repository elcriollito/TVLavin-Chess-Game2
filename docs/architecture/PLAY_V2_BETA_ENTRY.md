# Play v2 controlled beta entry

Status: **Season 11.2.2 accepted locally; internal and not public**

Contract: `PlayV2BetaEntry@1.0.0`

## Decision

`/play/beta` is the canonical future Play v2 beta namespace. It is independent of the temporary `simplified=1` QA switch and never replaces `/play` or `/`. Authorized internal requests for `/play/beta`, `/play/beta/games`, `/play/beta/bots`, and `/play/beta/coach` select only `play-v2.html`. Bots remains internal and uncertified; Coach remains internal with assistance certification pending. Mentor, Players, unknown modes, encoded aliases, trailing/duplicate slash variants, and every other descendant fail closed.

The gate owner is `beta-entry-gate`. `js/play/play-v2-beta-entry-gate.js` makes the document decision before static Play routing. Local authorization requires the exact build-time/server value `CAISSA_PLAY_V2_BETA_STAGE=internal`; missing, different, public-sounding, query, fragment, cookie, and storage values do not authorize entry. Default hosting rewrites send the whole beta namespace to the runtime-free `play-v2-unavailable.html`. No trustworthy internal identity system exists in this repository, so none was invented.

The unavailable document has a meaningful title, one heading, one keyboard-operable return link, visible focus, reduced-motion handling, responsive reflow, `noindex` metadata, and no scripts, stylesheets, forms, frames, runtime resources, identity details, configuration names, or secrets. Local server responses additionally use `no-store`, `X-Robots-Tag`, `no-referrer`, and `nosniff` headers.

## Route ownership and behavior

| Request | Internal local gate | Default/disabled gate |
|---|---|---|
| `/play/beta`, `/play/beta/games` | `play-v2.html`, Games | runtime-free unavailable document |
| `/play/beta/bots` | `play-v2.html`, Bots foundation | runtime-free unavailable document |
| prohibited/invalid beta descendant | unavailable document | unavailable document |
| query or fragment on an allowed path | ignored for authorization; allowed mode remains bounded | unavailable document |
| `/play` and `/play/:mode` | existing legacy/QA resolution | unchanged |
| `/`, Classic, `/yahoo-classic`, FICS | unchanged | unchanged |

Direct navigation and refresh are server-owned. Once authorized, the client route controller preserves the beta namespace across Games/Bots/isolated-Coach tabs, browser back/forward, and canonicalization. Invalid descendants never silently enter Legacy Play, FICS, educational Coach, Mentor, or Players. Query parameters are setup data only and are never credentials.

`/play/beta` is safer than `?simplified=1` because the beta namespace can be admitted or rejected before selecting a runtime document, its descendant allowlist is explicit, invalid modes stay within a fail-closed namespace, and normal Play rewrite semantics do not need to change. The QA query remains temporarily for regression compatibility. Retire it only after canonical beta authorization, QA callers, fixtures, and rollback exercises migrate; removal is separately authorized work.

## Rollback

Unset `CAISSA_PLAY_V2_BETA_STAGE` or set it to any value other than exact `internal`. The gate immediately selects `play-v2-unavailable.html`, preventing Play v2 runtime loading while leaving implementation files, history, `/play`, Classic, and Legacy FICS intact. The checked-in hosting fallback is already disabled. Rollback requires no deletion, tag movement, rebase, or history rewrite.

## Contract

`PlayV2BetaEntry@1.0.0` declares: canonical route `/play/beta`; entry document `play-v2.html`; current stage `internal`; public navigation, public enrollment, default Play replacement, homepage replacement, Legacy Play fallback, and FICS fallback prohibited; Players and Mentor blocked; Games allowed internally; Bots allowed internally but uncertified; isolated Coach allowed internally with assistance certification pending; analytics transport disabled; failure mode fail-closed; rollback owner `beta-entry-gate`.

The generated entry installs this contract alongside `PlayV2FicsIsolation@1.0.0` and `PlayV2ProductBoundary@1.0.0`. The latter contracts allow only the new Games/Bots beta paths and retain all resource, provider, educational, transition, persistence, and transport denials.

## Verification and limits

Season 11.2.1 automated evidence was point-in-time evidence with Coach absent. Season 11.5.1 supersedes only that Coach-admission assertion with the isolated native boundary; Mentor and Players remain absent and all other entry evidence remains applicable.

Acceptance results: 527/527 current Play unit/contract tests; 33/33 focused Chromium Play tests; 16/16 navigation/accessibility unit tests; 5/5 static guards; deterministic `play-v2.html` regeneration; syntax validation; and clean `git diff --check`. There are no skips in the current Play unit corpus. Four frozen Season 10 snapshot suites are not current acceptance owners: 15/20 assertions still pass, while five point-in-time assertions intentionally reject the already-established Season 11 state (more than two commits ahead and later authorized changes to `server.js`/`vercel.json`). Those historical records were not weakened, edited, skipped, retried, or counted as Season 11.2.1 failures.

This is local evidence only. It does not authorize deployment, public enrollment, public navigation, indexing, Bots certification, Worker production certification, analytics transport, or feedback. Physical devices and named screen readers remain untested and uncertified. Public activation requires a separately authorized trustworthy server/edge entitlement mechanism; the repository currently provides no such identity authority.

## Season 11.2.2 minimal entry experience

### Initial UX audit

The authorized pre-change view was functionally reachable but did not satisfy `Enter. Choose. Play.` Measurements at 1440×900, 768×1024, 1024×768, and 390×844 found:

- the board was already the largest object, but desktop retained a 220px global-navigation column and mobile retained the legacy site header;
- the setup panel was approximately 630px tall and repeated “Play Computer,” engine-strength prose, generic readiness text, and an Advanced controls disclosure;
- the primary action began below the viewport on tablet portrait, tablet landscape, and mobile;
- the first desktop focus targets belonged to legacy navigation/topbar controls rather than the playing surface;
- three document H1 elements existed in the monolithic source, while the active shell had no page-purpose H1;
- visible “QA Preview · Simplified Play,” “Current Play Controls,” runtime, engine, and fixed-strength language exposed implementation detail;
- a first-visit onboarding script could create a carousel modal over the board;
- only Games and Bots were admitted by the shell, but unrelated hidden legacy roles remained in the source document.

These findings—not the existing component count—defined the simplification scope.

### Entry hierarchy

The authorized beta experience now renders, in order:

1. one visible `Play` H1 with a discreet `Internal preview` status;
2. the existing authoritative board with opponent identity and clocks;
3. a two-item mode selector: Games and `Bots · Internal`;
4. a compact `Game setup` panel containing time control, White/Random/Black, a bounded selection status, and one `Play` action;
5. existing game controls only after a game becomes active.

The dedicated builder removes the onboarding stylesheet and script. Beta activation hides the monolithic global header, navigation, mobile toggle, and legacy topbar from rendering and focus without changing those products in `index.html`. The QA-query entry retains its prior presentation for regression compatibility.

### Permitted controls and transition

Games remains the default. The time-control selector exposes only the six configurations already accepted by the compatibility and clock path: No limit, 1+0, 3+0, 5+0, 10+0, and 15+0. Increment presets are deferred until Season 11.3.1 certifies their end-to-end behavior.

White, Random, and Black are keyboard-operable native radio controls with visible checked and focus states. Random remains selected in setup and is resolved exactly once at submission with `crypto.getRandomValues`; only the resolved White or Black value crosses the existing `startNewGame` compatibility boundary. If secure resolution is unavailable, start fails honestly.

`Play` is the sole setup CTA. The existing GamesPanel owns validation and calls the existing compatibility command exactly once. It disables during submission, blocks immediate duplicate activation, preserves the same board/lifecycle/Worker owners, focuses the authoritative board after success, and reveals existing active-game controls. Failure creates no fallback or alternate provider, retains selected time/color, displays a concise error, and leaves the same `Play` action as the retry path.

Bots is labeled `Internal preview. Bot play is not yet certified.` No Worker or engine implementation detail is presented in the mode label. Bots certification remains outside this decision.

### Responsive and accessibility rules

Desktop and tablet landscape place the dominant board beside a compact panel. Tablet portrait and phone layouts keep the practical-width board first, followed by mode and setup. During setup, the single CTA is fixed above the safe-area inset on stacked layouts so it remains reachable without horizontal scrolling or covering the board; reserved bottom space prevents content loss. The EvaluationRail retains its bounded 10–16px allocation and does not create a second board.

Automated evidence verifies one visible H1, logical landmarks, board-first initial Tab focus, native radio names and checked state, one primary CTA, disabled/busy state, bounded error text, board focus after start, touch-size controls, no horizontal overflow, forced colors, reduced motion, and 200% reflow. This is not physical-device, VoiceOver, TalkBack, NVDA, or JAWS certification.

### Acceptance and remaining boundary

Season 11.2.2 remains historical entry evidence. Season 11.5.1 admits only isolated assisted-play Coach; no FICS, educational Coach graph, Mentor, Players, onboarding, analytics transport, external destination, Training Memory write, or Mastery write is admitted. `/play`, `/`, Classic, Legacy FICS, public navigation, SEO, and the fail-closed gate remain unchanged.

Acceptance evidence: 528/528 current Play unit/contract tests; 40/40 consolidated Chromium flows; 5/5 static guards; 8/8 navigation checks; deterministic entry regeneration; syntax validation; and clean whitespace/path inspection. Chromium coverage includes the canonical beta route, unavailable/rollback behavior, hostile routes and storage, FICS and educational isolation, Games, Bots, one board/Worker owner, failure/retry, duplicate activation, accessibility automation, the full responsive profile matrix, and portrait/landscape transition.

The five frozen Season 10 point-in-time assertions remain superseded characterization exactly as documented above. One additional pre-boundary responsive workflow still asks Coach and Players to become reachable; its PostGame/promotion companion passes, but the obsolete mode-admission assertion correctly times out under `PlayV2ProductBoundary@1.0.0`. It is not a current Season 11 acceptance owner and was not weakened, skipped, retried, or timeout-inflated.

Season 11.3 still owns full Games lifecycle, clock/preset, promotion, terminal-state, recovery, persistence, error-matrix, and physical-device certification. Season 11.4 still owns Worker production certification. Bots remains internal and uncertified. No public-beta readiness or production verification is claimed here.
