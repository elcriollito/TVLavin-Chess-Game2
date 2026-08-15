# ChessBase PGN Game Replayer integration audit (GPR-0.1)

**Verdict: CONDITIONAL GO.** The official ChessBase replayer can satisfy a narrowly scoped replay/study page, but it is a global, mutable third-party JavaScript integration—not a self-contained ChessBase game database. CAISSA must provide a lawfully sourced inline PGN or PGN URL and should isolate the official integration in a first-party wrapper document. Release must stop if ChessBase permission/terms, the content licence, a narrow tested CSP, mobile containment, or an accessible CAISSA fallback cannot be established.

Audit date: 2026-08-14. This is an engineering and provenance assessment, not legal advice.

## 1. Preflight baseline

| Check | Verified result |
| --- | --- |
| Branch | `main` |
| HEAD | `04d311b30a35af969f4fe4ccbabfdb5db20d48f8` |
| `origin/main` | `04d311b30a35af969f4fe4ccbabfdb5db20d48f8` |
| Divergence | `0 0` |
| Staged files | none |
| Expected unrelated work | modified `package.json`; untracked `tools/fics-lab/` |
| NAV-2.3A | confirmed ancestor of HEAD |

No unexplained baseline change was found. The unrelated work was not read as an input to, edited by, staged with, or otherwise used for this audit.

## 2. Official evidence and final URLs

Primary documentation and resources were requested directly and retained their stated HTTPS URLs:

- [ChessBase: Embed PGN Files](https://play.chessbase.com/en/howto/embedpgn)
- [Replayer stylesheet](https://pgn.chessbase.com/CBReplay.css)
- [Documented jQuery 3.0.0 bundle](https://pgn.chessbase.com/jquery-3.0.0.min.js)
- [Replayer script](https://pgn.chessbase.com/cbreplay.js)
- [Official example PGN](https://play.chessbase.com/Images/Howto/Kortschnoj.pgn)
- [ChessBase privacy policy](https://en.chessbase.com/pages/security)
- [ChessBase FOSS notices](https://foss.chessbase.com/)

The official instructions place these resources in the document head and mark content as either:

```html
<div class="cbreplay">[Event "..."] ...</div>
```

or:

```html
<div class="cbreplay" data-url="/games/collection.pgn"></div>
```

They say multiple games/databases may appear on one page while the script is loaded once. They also say the bundled jQuery line can be omitted if jQuery is already present. The page text says “jQuery version 1.14 or higher”; that is not a credible semver floor because jQuery 1.14 did not exist. The concrete documented asset is jQuery 3.0.0, and compatibility with other versions must therefore be tested rather than inferred.

The official page does not publish a replayer-specific licence, SLA, stability promise, maximum PGN size, accessibility conformance statement, or permission to redistribute its sample PGN. FOSS notices concern software components and are not a licence for ChessBase editorial/game collections.

## 3. Verified integration mechanism and data flow

The mechanism is external CSS plus global JavaScript which discovers and replaces ordinary `.cbreplay` DOM hosts. It is not a custom element, documented initializer API, jQuery plugin, server-generated embed, or official iframe. jQuery is a documented dependency. The script executes with the embedding document's origin privileges.

```text
CAISSA-owned/licensed PGN
  -> inline text in .cbreplay OR first-party HTTPS .pgn selected by data-url
  -> browser fetch (URL form; correct PGN MIME type recommended by ChessBase)
  -> global cbreplay.js parser/UI
  -> Games list + selected game metadata + board/notation/variations

ChessBase opening-book/engine services (separate, optional runtime features)
  -> widget controls
  -> provider network/worker resources

ChessBase public game database
  -X- not documented or supplied by this embed contract
```

The example host has `data-url="/Images/Howto/Kortschnoj.pgn"`. Its rendered Games view contains the players, ratings, event, result and other headers present in that file. Replacing that response with empty or malformed content produced no game collection; a 404 remained at `LOADING...`. Therefore the Games tab is a view of supplied PGN records, not proof of a public ChessBase database API. The opening-book table is a distinct provider feature and must not be described as CAISSA's game collection.

**Answer to the primary question:** CAISSA must supply and own or license the PGN collection. No player/event query, cloud-database binding, searchable provider collection, or public database API is documented by the embed page.

## 4. Dependency and resource map

The minimal documented render path is:

| Resource / origin | Classification | Requirement and risk |
| --- | --- | --- |
| `https://pgn.chessbase.com/CBReplay.css` | `style-src` | required; unversioned, mutable |
| `https://pgn.chessbase.com/jquery-3.0.0.min.js` | `script-src` | required unless a compatible jQuery is already loaded; version-named but remotely mutable |
| `https://pgn.chessbase.com/cbreplay.js` | `script-src` | required; unversioned, mutable, approximately 3.33 MB observed |
| CAISSA `.pgn` URL | first-party content / `connect-src 'self'` | required for URL mode; CAISSA-owned/licensed |
| `https://pgn.chessbase.com/common/Media/...` | `img-src` | board textures, pieces, flags and controls observed |
| `https://fonts.gstatic.com` | `font-src` | Roboto-family fonts referenced/observed; avoid if wrapper can use provider-hosted/embedded alternatives only after testing |
| `https://play.chessbase.com/Common/Chess/Engine/Enginemin.js` | `script-src` | observed on the official documentation page; engine-related, not proven minimal in an isolated embed |
| `blob:` plus ChessBase engine paths | `worker-src` | bundle contains Web Worker/engine paths; permit only if engine is intentionally certified |
| provider service endpoints | `connect-src` | opening book/engine/share/online-database code exists; exact calls must be captured in the isolated GPR-0.2 wrapper for enabled controls |

The official documentation page additionally loaded `resources.chessbase.com`, `share.chessbase.com`, Google Fonts, advertising, SignalR/WebSocket notification resources, and page-specific bundles. Those are evidence about the provider documentation page, not automatic proof that a minimal isolated replayer requires them. They must not be copied wholesale into CAISSA CSP.

Static inspection of `cbreplay.js` found broad global code paths including `document.write`, dynamic-code constructs, local-storage references, engine workers, share/online-database URLs, and multiple ChessBase services. Presence in the bundle is an exposure finding, not a claim that every path runs on initial render. The CSS also contains legacy `http://pgn.chessbase.com/...` references; `upgrade-insecure-requests` may mask these, but GPR-0.2 must prove that no mixed-content request fails.

No official iframe is documented, so `frame-src https://play.chessbase.com` does not integrate this component. Under the recommended architecture the outer CAISSA page needs only `frame-src 'self'`; the dedicated first-party wrapper receives its own narrowly measured policy.

### Dependency ownership and integrity

CAISSA already vendors jQuery 3.6.0 at `/assets/vendor/jquery/jquery-3.6.0.min.js`. Loading ChessBase's 3.0.0 globally risks replacing `$`/`jQuery` and colliding with CAISSA code. Even omitting the provider copy leaves undocumented compatibility risk. A wrapper gives ChessBase sole ownership of its jQuery global.

SRI is syntactically possible only if the response's CORS behavior supports it, but the core CSS and script URLs are unversioned and mutable. Pinning a current digest would turn routine provider updates into outages. GPR-0.2 must either obtain a versioned/redistributable provider artifact and record its hash, or treat remote execution as an explicit monitored supply-chain exception with change detection and a fail-closed fallback. Do not silently self-host ChessBase code without permission.

## 5. Feature matrix

| Capability | Status | Evidence / limit |
| --- | --- | --- |
| One or multiple games | verified | official inline and URL examples; documentation allows games/databases; sample Games list populated from one multi-game PGN |
| Games list, names, ratings, event, round, ECO, result | verified | rendered sample metadata/table |
| Move navigation / previous-next game / flip / maximize | verified controls and basic render | named native buttons observed; keyboard behavior needs certification |
| Notation, comments, variations, NAGs | parser/UI support observed | notation and editing controls rendered; GPR-0.2 fixture must assert semantic round-trip before product claims |
| Engine analysis | available control; conditional | Engine button and engine resource observed; network, worker, CSP, privacy, mobile and service availability not yet certified |
| Opening book | verified provider view | Book tab populated; this is not the supplied Games database |
| Position editing and FEN | UI support observed | page menu text exposes Setup Position/FEN; not a launch commitment |
| Download/export/share/save | controls observed | Download/share/save controls exist; destination, consent, data disclosure and licence behavior require interaction tests |
| Autoplay | not verified | no supported option established |
| Diagrams | not verified as an authored-content feature | board/piece rendering is not proof of diagram directives |
| Maximum/practical PGN size | undocumented | set a CAISSA budget and test it; never advertise unlimited games |
| User upload | not part of GPR-0.1/0.2 recommendation | would require parsing limits, privacy, XSS/content and retention design |

Controls alone are not a product promise. Initially expose replay, Games, notation, variations and navigation; hide or disclaim unverified networked/edit/export functions if the provider offers a supported configuration. If controls cannot be disabled through supported configuration, that is a STOP condition pending product/security approval.

## 6. Configuration findings

The official page documents only the `.cbreplay` marker, inline PGN, `data-url`, and multiple hosts per page. It does not document stable attributes/options for width, height, board size, initial game/move, language, theme, pieces, colors, tabs, notation, game-list visibility, engine, callbacks, timeout, or errors. Visual CSS behavior is not a supported configuration API. Do not depend on reverse-engineered internal classes.

The widget chooses layout from available space, but controlled wrapper dimensions and a message protocol for height/readiness are still required. CAISSA should not inject CSS into provider internals.

## 7. Browser and responsive observations

Headless Chromium loaded the unmodified official page at the required viewports after network idle plus three seconds:

| Viewport | `.cbreplay` bounding box | Widget overflow | Page result |
| --- | --- | --- | --- |
| 1440 × 1000 | 1070 × 860 at x=185 | none inside host | document width 1440; page scroll required vertically |
| 768 × 1024 | 738 × 900 at x=15 | none inside host | document width 768; stacked/tablet layout |
| 390 × 844 | 360 × 742.7 at x=15 | host itself fit | document scroll width 715: horizontal overflow exists on official page |

The full board box could not be identified through a stable public selector without coupling to private DOM. Games/Notation switch to compressed/stacked layouts, and several toolbar controls remain small icon buttons. The mobile result is **not acceptable as proof of native responsive safety**. GPR-0.2 must measure the isolated wrapper (not the documentation chrome), provide a minimum-height/aspect strategy, contain overflow, test touch navigation, and verify at 320 CSS px plus 200% zoom. If the isolated widget still requires more than the available width without a usable internal scroll strategy, stop rather than clipping the board.

## 8. Accessibility

Positive observations: key toolbar actions are native `<button>` elements; many have English `title` values; tabs have visible text; some composite regions expose `role="group"` and positional `aria-label` values.

Limitations: icon buttons generally had no `aria-label` or visible text, relying on `title`; game/player links lacked clear contextual names; numerous inputs had no observed labels; robust landmark/tab semantics and board-square semantics were not established; keyboard move navigation, focus order, focus visibility, contrast, screen-reader announcements, touch-target size, and 200%/400% zoom remain uncertified. The provider publishes no accessibility conformance statement on the embed page.

The first-party iframe must have a concise `title`, for example `Chess game replayer`. The outer page must provide an H1, instructions, attribution, status/error text in a live region, and a direct PGN download as an accessible fallback. A keyboard-only and screen-reader smoke is a release gate, not optional polish.

## 9. Security, privacy, CSP and supply chain

- Direct integration grants a large remote mutable script full CAISSA DOM, storage and same-origin access. Isolation materially reduces that blast radius.
- The wrapper should contain no authentication bootstrap, user data, analytics secrets, or parent DOM access. Use an iframe sandbox only after testing the minimum tokens required; start with `allow-scripts` and do not add `allow-same-origin`, popups, forms or downloads without demonstrated need and review.
- Use `referrerpolicy="strict-origin-when-cross-origin"` or stricter, and document any referrer required by ChessBase terms.
- Create a wrapper-specific CSP from an isolated network trace. Do not add broad ChessBase origins to the global policy and do not use `https:` or `*.chessbase.com` wildcards.
- Treat engine, book, share, online database and download as separate capabilities. Each new origin/direction requires evidence and policy review.
- The bundle's dynamic-code patterns may require `'unsafe-eval'`; if a supported minimal replayer cannot run without it, confine it to the sandboxed wrapper or stop. Never add it to the shared page policy.
- Register every external runtime script with `scripts/audit-supply-chain.mjs` policy ownership, expected origin/path, mutability decision and review procedure. The current scanner detects HTTPS external script tags and rejects unapproved drift.
- The provider privacy policy discusses cookies and analytics generally. The isolated replayer must be traced with clean storage before consent decisions; the advertising/SignalR traffic observed belongs to the documentation page and must not be assumed necessary.
- Set explicit loading timeout, abort/fallback behavior and monitoring. Remote failure must not break shared navigation or the rest of the page.

## 10. Failure behavior

Safe request interception on the official example produced:

| Condition | Observed outcome |
| --- | --- |
| PGN 404 | widget remained visibly `LOADING...`; console resource error; no user-facing error |
| Empty PGN | widget shell remained, no useful collection and no user-facing error |
| Malformed text | shell/book content rendered, no explicit parse error |
| `cbreplay.js` blocked | empty `.cbreplay` host; console network error |
| Slow loading | no documented timeout/progress contract; `LOADING...` is provider-owned and unbounded |

No credentials, uploads or provider data were changed. CAISSA must render its own loading state before iframe readiness, replace it after a bounded timeout, expose retry/open-PGN/download actions, and retain meaningful explanatory DOM content even when scripts fail. Unsupported-browser detection should resolve to the same fallback. A wrapper-controlled handshake is preferable; absence of a reliable readiness signal may require a conservative load-plus-timeout design and is a GPR-0.2 test item.

## 11. Copyright and provenance decision

Raw move facts and game methods are generally not protected as expressive authorship under U.S. principles, but that does not make an arbitrary PGN file free to copy. The [U.S. Copyright Office](https://www.copyright.gov/register/tx-games.html) distinguishes game methods from copyrightable literary/pictorial expression, and its guidance recognizes original compilations and annotations. Prose comments, authored analysis, photographs, diagrams/art, creative annotations, and original selection/arrangement may be protected.

EU [Directive 96/9/EC](https://eur-lex.europa.eu/legal-content/en/ALL/?uri=CELEX%3A31996L0009) separately protects qualifying database investment and restricts substantial—or repeated systematic—extraction even where individual facts are not copyrighted. Historical status of the played game does not erase rights in a modern annotated/editorial database.

No express reuse licence for `Kortschnoj.pgn` was found. Treat it as demonstration-only: link as audit evidence, but do not ship it. Do not scrape or reconstruct ChessBase's commercial database.

Initial content priority:

1. CAISSA-owned games with participant permission and CAISSA-authored annotations;
2. a small unannotated factual collection from an explicitly permitted source;
3. carefully researched public-domain historical source material, independently transcribed/verified rather than copied from a proprietary annotated database;
4. user-supplied PGN only in a later separately secured, ephemeral feature.

Every collection needs a sidecar/catalog record:

```text
collection_id; title; source_url; source_provider; acquired_at;
licence_or_permission_basis; attribution_text; annotation_owner;
scope/game identifiers; transformation_history; sha256;
reviewer; reviewed_at; review_status; takedown/contact note
```

Release only records marked approved. Preserve source snapshots/permission evidence outside the public bundle where appropriate, and separate factual scores from authored annotations so their rights are independently reviewable.

## 12. Architecture comparison

| Option | Security/dependencies | Responsive/accessibility/failure | Maintenance/SEO/content | Verdict |
| --- | --- | --- | --- | --- |
| A. Direct provider scripts in CAISSA page | highest exposure; jQuery collision; shared CSP expansion | provider failures can affect page; hard to wrap semantics | simplest markup but mutable globals and content rights remain | reject |
| B. First-party isolated wrapper with official integration | dedicated CSP, storage/DOM boundary, provider-owned jQuery | outer accessible status/fallback; measured containment; wrapper failure isolated | small extra document; outer content indexable; CAISSA supplies licensed PGN | **recommend** |
| C. Official ChessBase iframe | would isolate well | provider would own behavior | no such replayer iframe is documented | unavailable |
| D. Native CAISSA replayer | best first-party control, no provider supply chain | potentially best accessibility/responsiveness | large parser/board/engine effort violates reuse-first while official embed can work | contingency only |

### Recommended boundary

`/watch/game-replayer` owns shared sidebar, banner, metadata, explanatory copy, consent/status/fallback, attribution and a responsive first-party `<iframe>`. A dedicated same-origin wrapper (for example `/integrations/chessbase-pgn-replayer.html`) owns only the official CSS, jQuery, script and one approved first-party PGN. Keep auth, analytics and user data outside it. Add a narrow postMessage protocol only for versioned readiness/height/error messages, with exact origin and schema validation.

This is still the officially documented mechanism inside the wrapper; CAISSA is not rebuilding or proxying the replayer. The first-party iframe is an isolation boundary, not a claim that ChessBase provides an iframe product.

## 13. Product proposal

- Route: `/watch/game-replayer`
- Sidebar: `Game Replayer`
- Category/order: `Analyze & Watch`, after `Live Blitz` and before `Arena`
- H1: `Chess Game Replayer`
- SEO title: `Chess Game Replayer | CAISSA Chess`
- Meta description: `Replay and study a curated collection of chess games with an embedded ChessBase PGN replayer on CAISSA Chess.`
- Introduction: `Replay complete games, follow the notation, and explore available variations from a carefully sourced CAISSA collection.`
- Attribution: `Game replay technology provided by ChessBase. Game data is selected and licensed or documented by CAISSA Chess.`
- Independence: `CAISSA Chess is independent and is not owned or operated by ChessBase.`
- Fallback: `The game replayer could not be loaded. Retry, or download the PGN to use in another compatible chess program.`
- Empty: `No games are available in this collection yet.`
- Loading: `Loading the game replayer…`
- Tournament banner: reuse the existing Coming Soon banner above the introduction/replayer card without obscuring the H1.
- Free-tier value: free browser replay of the specifically listed curated collection; do not promise unlimited games, registration status, persistence, uploads or engine access.

The label and placement are clear and consistent with replay/watch intent. They are a forecast only.

## 14. Navigation contract forecast

The canonical owner is `js/caissa-primary-navigation.js`, contract `CaissaGlobalNavigationOrderPolicy@1.5.0`. It currently exposes 28 primary-plus-Connect destinations. `Live Blitz` immediately precedes `Arena` in Analyze & Watch. Approval would add one destination (29 total), require a minor successor contract version, and update directly owned unit/browser expectations plus deterministic route inventory and no-JS fallback output. Mobile sidebar height/scroll behavior must be retested at 390 × 844 and 320 px width.

Shared rendering remains owned by the navigation module/foundation; no page-local navigation array is permitted. Inventory ownership is `scripts/build-caissa-public-route-inventory.mjs` with outputs `config/caissa-public-route-inventory.json` and `docs/architecture/CAISSA_PUBLIC_ROUTE_AND_NAVIGATION_INVENTORY.md`. Deployment headers/routes are owned by `vercel.json`.

## 15. GPR-0.2 bounded implementation scope

Expected additions:

- `game-replayer.html` — outer product page using the shared gateway/sidebar pattern;
- `integrations/chessbase-pgn-replayer.html` — isolated wrapper;
- one small approved first-party PGN under a dedicated asset directory plus provenance record;
- focused unit and browser tests for metadata, DOM, wrapper boundary, CSP, failures, accessibility, layouts and content checksum.

Expected updates:

- `js/caissa-primary-navigation.js` and its policy/order tests;
- `vercel.json` for the route and wrapper-specific exact CSP/header rule;
- supply-chain allow/policy owner used by `scripts/audit-supply-chain.mjs`;
- sitemap/robots route source as appropriate;
- canonical deterministic route inventory source/output via `node scripts/build-caissa-public-route-inventory.mjs` only;
- existing gateway/browser release matrices and no-JS fallback owner.

Certification matrix: Chromium, Firefox and WebKit at 1440 × 1000, 768 × 1024, 390 × 844 and 320 px/200% zoom; keyboard, reduced motion, screen-reader smoke; online, offline, slow, blocked script, 404/empty/malformed/oversize PGN; no horizontal page overflow; iframe isolation; exact network allowlist; parent remains functional after wrapper failure; PGN checksum/provenance approval.

STOP if provider use permission is unclear; content approval is absent; a wildcard, shared `'unsafe-eval'`, or global remote script is required; engine/share/database traffic cannot be bounded; sandbox isolation breaks essential supported behavior; mobile board is unusable; accessibility lacks an effective external fallback; mutable dependency monitoring is unowned; or deterministic generation changes unrelated files.

## 16. GPR-0.3 release scope

Freeze the certified commit, rerun the immutable browser/security/content matrix, capture desktop/tablet/mobile evidence, verify only canonical generated output changed, commit release evidence separately, push normally, observe automatic deployment, and smoke Production route, headers, navigation/order, PGN checksum, fallback, analytics bootstrap and unrelated gateways. GPR-0.3A is reserved only for a distinct production defect.

## 17. Repository validation

Focused checks for this audit:

- inspected canonical navigation/version/order and generated inventory ownership;
- inspected shared sidebar and existing Fritz/Tactics/Live Blitz gateway patterns;
- inspected `vercel.json` route/header/CSP ownership;
- inspected the external-script supply-chain scanner and policy tests;
- exercised the live official documentation page at all three required viewports;
- captured successful/failed request behavior without provider mutation;
- validated official HTTPS documentation/resource links where network access permitted;
- ran the focused repository tests and `git diff --check` after authoring (results recorded in commit handoff).

No disposable file prototype was created. Browser request interception was in-memory and closed after the test.

## 18. Scope confirmation

GPR-0.1 changed only this audit document. It did not create a public route or final page, change navigation/CSP/routes/sitemap/metadata/inventory, download a database, modify an account or external service, upload data, push, deploy, or mutate production. `package.json` and `tools/fics-lab/` remain the user's unrelated work.
