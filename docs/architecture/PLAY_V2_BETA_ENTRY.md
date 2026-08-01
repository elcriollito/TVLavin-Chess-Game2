# Play v2 controlled beta entry

Status: **Season 11.2.1 accepted locally; internal and not public**  
Contract: `PlayV2BetaEntry@1.0.0`

## Decision

`/play/beta` is the canonical future Play v2 beta namespace. It is independent of the temporary `simplified=1` QA switch and never replaces `/play` or `/`. Authorized internal requests for `/play/beta`, `/play/beta/games`, and `/play/beta/bots` select only `play-v2.html`. Bots remains internal and uncertified. Coach, Mentor, Players, unknown modes, encoded aliases, trailing/duplicate slash variants, and every other descendant fail closed.

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

Direct navigation and refresh are server-owned. Once authorized, the client route controller preserves the beta namespace across Games/Bots tabs, browser back/forward, and canonicalization. Invalid descendants never silently enter Legacy Play, FICS, Coach, Mentor, or Players. Query parameters are setup data only and are never credentials.

`/play/beta` is safer than `?simplified=1` because the beta namespace can be admitted or rejected before selecting a runtime document, its descendant allowlist is explicit, invalid modes stay within a fail-closed namespace, and normal Play rewrite semantics do not need to change. The QA query remains temporarily for regression compatibility. Retire it only after canonical beta authorization, QA callers, fixtures, and rollback exercises migrate; removal is separately authorized work.

## Rollback

Unset `CAISSA_PLAY_V2_BETA_STAGE` or set it to any value other than exact `internal`. The gate immediately selects `play-v2-unavailable.html`, preventing Play v2 runtime loading while leaving implementation files, history, `/play`, Classic, and Legacy FICS intact. The checked-in hosting fallback is already disabled. Rollback requires no deletion, tag movement, rebase, or history rewrite.

## Contract

`PlayV2BetaEntry@1.0.0` declares: canonical route `/play/beta`; entry document `play-v2.html`; current stage `internal`; public navigation, public enrollment, default Play replacement, homepage replacement, Legacy Play fallback, and FICS fallback prohibited; Players, Coach, and Mentor blocked; Games allowed internally; Bots allowed internally but uncertified; analytics transport disabled; failure mode fail-closed; rollback owner `beta-entry-gate`.

The generated entry installs this contract alongside `PlayV2FicsIsolation@1.0.0` and `PlayV2ProductBoundary@1.0.0`. The latter contracts allow only the new Games/Bots beta paths and retain all resource, provider, educational, transition, persistence, and transport denials.

## Verification and limits

Season 11.2.1 automated evidence covers contract shape, exact gate values, rollback, hosting fallback, route parsing, direct navigation, refresh, back/forward, invalid/prohibited/encoded paths, hostile query/fragment/storage values, no prohibited resource requests, one board, Games initialization, Bots foundation, absent Coach/Mentor/Players, unavailable semantics, navigation/sitemap absence, QA compatibility, and Classic/Legacy defaults.

Acceptance results: 527/527 current Play unit/contract tests; 33/33 focused Chromium Play tests; 16/16 navigation/accessibility unit tests; 5/5 static guards; deterministic `play-v2.html` regeneration; syntax validation; and clean `git diff --check`. There are no skips in the current Play unit corpus. Four frozen Season 10 snapshot suites are not current acceptance owners: 15/20 assertions still pass, while five point-in-time assertions intentionally reject the already-established Season 11 state (more than two commits ahead and later authorized changes to `server.js`/`vercel.json`). Those historical records were not weakened, edited, skipped, retried, or counted as Season 11.2.1 failures.

This is local evidence only. It does not authorize deployment, public enrollment, public navigation, indexing, Bots certification, Worker production certification, analytics transport, or feedback. Physical devices and named screen readers remain untested and uncertified. Public activation requires a separately authorized trustworthy server/edge entitlement mechanism; the repository currently provides no such identity authority.
