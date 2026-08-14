# NAV-2.0 Global Sidebar Architecture and Surface Audit

Status: complete audit; implementation not started

Baseline: `0cb9d8f47af043de4721fd48d104cb597b2003bc`

Navigation contract: `CaissaGlobalNavigationOrderPolicy@1.5.0`

## 1. Executive verdict

**CONDITIONAL GO.** CAISSA already has one authoritative, immutable 28-destination inventory and a reusable modern sidebar. The visible inconsistency is not primarily data drift: the application/Classic shell calls the canonical renderer without `showHeadings`, owns older 220 px chrome, and has different mobile behavior; Endgame Trainer is a justified specialized adapter. The smallest safe target is one canonical model plus two rendering adapters: the existing modern standalone renderer and a thin application-shell adapter that can also serve Play/Classic. Endgame Trainer should retain its product layout while consuming the same model and shared interaction primitives.

No new inventory, per-page sidebar, route table, CSS system, or mobile drawer should be created. Production `/play` is deliberately fail-closed at this baseline, so Play sidebar work must be certified against the source/preview shell without changing that release boundary.

## 2. Repository baseline

Preflight observed before this document was created:

| Check | Result |
|---|---|
| Branch | `main` |
| `HEAD` | `0cb9d8f47af043de4721fd48d104cb597b2003bc` |
| `origin/main` | `0cb9d8f47af043de4721fd48d104cb597b2003bc` |
| Divergence | `0 0` |
| Staged files | none |
| Known modified work | `package.json` |
| Known untracked work | `tools/fics-lab/` |
| `git diff --check` | no content error; existing `package.json` line-ending warning only |

The unrelated work above was not read as an implementation input, altered, staged, or committed. Applicable architecture, navigation, Play V2, mobile, accessibility, release-generation, and test documents were reviewed. No applicable `AGENTS.md` exists in the audited repository scope.

## 3. Canonical ownership map

| Concern | Current owner and exact symbol | Finding |
|---|---|---|
| Destination, label, icon, route, category data | `js/caissa-primary-navigation.js`: `allGroups`, `groups`, `groupLabels`, `support`, `connect`, `inventory` | Canonical source. Categories are semantic data, not gateway-page copies. |
| Policy/version | `js/caissa-primary-navigation.js`: `contractId` | `CaissaGlobalNavigationOrderPolicy@1.5.0`; asserted by `tests/global-navigation-order-policy.test.js`. |
| Item/category HTML | `js/caissa-primary-navigation.js`: `renderItem`, `renderGroups`, `renderSupport`, `renderConnect` | Canonical markup builder. `showHeadings` controls category subtitles. |
| Standalone desktop/mobile renderer | `js/caissa-standalone-sidebar.js`: `renderSidebar`, `closeMobileNav` and event handlers | Modern full-shell renderer; supplies branding, auth placeholders, Premium, collapse, drawer, backdrop, focus loop. |
| Standalone CSS | `css/caissa-standalone-sidebar.css` plus shared `styles.css` navigation rules | Modern 240 px presentation and <=768 px drawer. |
| Application/Classic desktop shell | `index.html` and generated `yahoo-classic.html`: `.main-navigation`, `[data-caissa-primary-groups]`, `[data-caissa-primary-support]`; shared rules in `styles.css` | Canonical items, locally owned chrome and 220 px presentation. Hydration omits `showHeadings`. |
| Application mobile/section behavior | `js/caissa-navigation.js`: `CaissaNavigation`, section activation/history/mobile methods; `js/caissa-primary-navigation-transition-policy.js` | Owns application transitions and drawer behavior; route/surface identity is separate from data rendering. |
| Legacy route normalization | `js/legacy-canonical-section-route-policy.js`: `LegacyCanonicalSectionRoutePolicy`; generated signal in `js/caissa-navigation.js` | Maps historical section identity to canonical public routes without owning labels/order. |
| Active state | `renderItem(activeKey)` for route shells; `CaissaNavigation` section activation and transition policy for application shell | Correctly emits `aria-current="page"`; application active identity is runtime-derived. |
| Endgame Trainer adapter | `endgame-trainer.html`: `[data-caissa-primary-groups]`, `[data-mobile-nav]`, `[data-mobile-nav-toggle]`; `js/endgame-trainer/endgame-trainer-page.js`; `css/endgame-trainer.css` | Canonical data with specialized chrome/drawer. |
| Authentication/account state | `js/caissa-auth.js` and `js/caissa-ui-auth.js`: sidebar IDs `sidebarSignIn`, `sidebarUserInfo`, account menu handlers | State owner is shared JS; shell markup is duplicated between application HTML and standalone renderer. |
| Premium CTA | Markup in `index.html`, generated `yahoo-classic.html`, `play-v2.html`, `js/caissa-standalone-sidebar.js`, and `endgame-trainer.html` | Presentation is shell-owned and duplicated; entitlement remains in `js/caissa-access.js`. |
| Help/About/Settings | Help/About are `support`; `js/caissa-navigation.js` owns legacy Help/Settings action/modal behavior; `/help` and `/about` are canonical routes | Settings is a contextual application action, not one of the 28 destinations. |
| Generated public inventory | `scripts/build-caissa-public-route-inventory.mjs`; output `docs/architecture/CAISSA_PUBLIC_ROUTE_AND_NAVIGATION_INVENTORY.md` | `CaissaPublicRouteInventory@1.0.0`; generated from navigation plus route/deployment owners. |
| Accessibility names | `renderItem`; logo normalization at the bottom of `js/caissa-primary-navigation.js`; shell toggle markup/handlers | Item names are canonical; toggle semantics differ by adapter. |
| Public release | `scripts/build-public-release.mjs` | Copies committed allowlisted public files; sidebar implementation should use this owner only if its deterministic output changes. |

## 4. Complete canonical inventory

The exact order is four primary groups (24 internal destinations) followed by four Connect destinations: **28 total**. Help and About are support links outside that count.

| # | Current canonical category | Label | Route/destination |
|---:|---|---|---|
| 1 | Play & Compete | Play | `/play` |
| 2 | Play & Compete | CAISSA Classic | `/yahoo-classic` |
| 3 | Play & Compete | FICS | `/fics` |
| 4 | Play & Compete | Playchess | `/play-online/playchess` |
| 5 | Play & Compete | Fritz | `/play-online/fritz` |
| 6 | Learn & Improve | Tactics | `/puzzles/chessbase-tactics` |
| 7 | Learn & Improve | Academy | `/academy` |
| 8 | Learn & Improve | Endgame Trainer | `/endgame-trainer` |
| 9 | Learn & Improve | Endgame Practice | `/endgame-practice` |
| 10 | Learn & Improve | Endgame Library | `/endgame-library` |
| 11 | Analyze & Watch | Insights | `/insights` |
| 12 | Analyze & Watch | Analyze | `/analyze` |
| 13 | Analyze & Watch | Spectator TV | `/spectator-tv` |
| 14 | Analyze & Watch | Live Blitz | `/watch/live-blitz` |
| 15 | Analyze & Watch | Arena | `/arena` |
| 16 | Tools | Cheater Insight | `/cheater-insight` |
| 17 | Tools | Polyglot Tool | `/tools/polyglot` |
| 18 | Tools | Opening Database | `/opening-database` |
| 19 | Tools | ECO Codes | `/eco` |
| 20 | Tools | Game Library | `/game-library` |
| 21 | Tools | History | `/history` |
| 22 | Tools | DOS Chess | `/dos-chess` |
| 23 | Tools | Vault | `/vault` |
| 24 | Tools | Blog | `/blog` |
| 25 | Connect | Facebook | external |
| 26 | Connect | CAISSA Chess YouTube | external |
| 27 | Connect | CAISSA Discord | external |
| 28 | Connect | Share an Idea / Contact & Feedback | `mailto:` |

Support then renders Help (`/help`) and About (`/about`). The proposed IA differs from the contract: Blog is currently Tools, social/contact entries are a separate unheaded `connect` collection, and Help/About are Support. There is no canonical Community & Support group and no global Settings destination. All 28 items are unambiguous under the current model, but Blog's placement and whether Connect/Support should merge require product decisions. Any group addition, rename, reordering, or reassignment changes the versioned contract and should bump policy/version plus regenerate the public route inventory.

## 5. Shell-family and route-to-renderer inventory

Routes are grouped by actual renderer, not by HTML-file count.

| Family | Public surfaces | Renderer / evidence | Classification |
|---|---|---|---|
| Modern standalone gateways | `/play-online/playchess`, `/play-online/fritz`, `/puzzles/chessbase-tactics`, `/watch/live-blitz` | Page host `[data-caissa-standalone-sidebar]` -> `renderSidebar` | **A — MODERN CANONICAL** |
| Modern standalone content/tools | `/tools/polyglot`, `/opening-database`, `/eco` and `/eco/:code`, `/vault`, `/blog` and generated articles, `/endgame-practice`, `/endgame-library`, `/help`, `/about` | Same standalone host/renderer; generator-owned blog markup in `scripts/build-blog.mjs` | **A — MODERN CANONICAL** |
| Core application shell | `/academy`, `/insights`, `/fics`, `/analyze`, `/spectator-tv`, `/arena`, `/cheater-insight`, `/game-library`, `/history`, `/dos-chess` | `index.html`, canonical group/support hydration, `CaissaNavigation` | **B — CANONICAL DATA / LEGACY PRESENTATION** |
| CAISSA Classic shell | `/yahoo-classic` plus its lobby, tables, tournament, computer, teaching, challenge, spectating and game-room surfaces | generated `yahoo-classic.html`; canonical hydration plus Classic application state | **B — CANONICAL DATA / LEGACY PRESENTATION** |
| Endgame Trainer | `/endgame-trainer` | specialized HTML/CSS/JS adapter with canonical group hydration | **E — INTENTIONALLY DIFFERENT SHELL** |
| Play V2 source/preview | `/play`, `/play/games`, `/play/bots`, `/play/coach` conceptually map to `play-v2.html`; source shell uses canonical hydration | Play's outer shell is **B** in source; internal Games/Bots/Coach are not global-sidebar destinations |
| Production Play fail-closed shell | `/`, `/play`, `/play/:mode`, beta/preview aliases | `vercel.json` rewrites to `play-v2-unavailable.html`, which intentionally has no sidebar and `noindex` | **G — INTENTIONALLY EXCLUDED** while release gate is closed |
| Auth/commercial/roadmap utilities | `/signin`, `/signup`, `/premium`, `/roadmap` | focused standalone flows without application sidebar | **G — INTENTIONALLY EXCLUDED**; avoid circular auth/checkout distraction |
| Legacy database/library documents | `/database`, `/database/eco/:code`, `/library` | public compatibility surfaces outside the 28 canonical navigation entries | **G — INTENTIONALLY EXCLUDED** pending retirement/redirect decision |
| QA, diagnostic, harness and static asset HTML | named test/diagnostic files, `public/*`, `client/index.html`, `chess-llm-platform/index.html` | not canonical public product surfaces or protected/fail-closed preview artifacts | **G — INTENTIONALLY EXCLUDED** |

No runtime family is classified C: the hard-coded application fallback is duplicate markup risk, but canonical JS replaces the item area at runtime. No applicable canonical public route is classified F at the audited baseline. `/` is a redirect, not a fourth renderer. Contact/feedback is a canonical mail destination rather than a page. Settings remains an application-local action.

## 6. Runtime desktop/tablet/mobile matrix

Read-only local browser checks sampled each distinct family. The controlled Chrome viewport reported CSS viewports at 1.25x the requested values; breakpoint conclusions use the reported CSS width. Direct loads preserved active state and produced one sidebar. External/account/settings actions were not invoked.

| Family | Desktop (~1800x1125 reported) | Tablet (960x1280) | Narrow tablet/mobile (767x1125 / 487x1055) |
|---|---|---|---|
| Modern standalone | 240 px fixed sidebar; main begins ~294 px on Fritz; 5 visible headings including Support; 33 visible links; active item correct; no horizontal overflow | 240 px fixed sidebar and headings; content begins 240 px; no overflow | At <=768, 280 px off-canvas drawer and visible toggle. Open moves drawer to x≈0, sets `aria-expanded=true`, applies body scroll-lock class, and focuses logo. Escape/backdrop/link close and focus loop exist. |
| Core application / Classic | 220 px sidebar; main begins 220 px; no category headings; 33 links; active FICS correct; no overflow | Desktop form remains until breakpoint | 280 px drawer translates fully off-screen; toggle visible, but lacks `aria-controls` and `aria-expanded` in observed closed state. This is a semantic and state-parity gap. |
| Endgame Trainer | 220 px specialized sidebar; canonical active Endgame Trainer; no headings, auth block, or collapse button; no overflow | Specialized fixed form until breakpoint | 280 px off-canvas drawer; toggle exposes `aria-controls=endgame-nav` and `aria-expanded=false`; specialized product chrome remains justified. |
| Play V2 | Source/preview outer shell resembles application family; production response is centered fail-closed document without sidebar | Same release-boundary distinction | Same release-boundary distinction; do not certify source behavior as currently deployed `/play`. |

Across the modern samples Fritz, Tactics, and Live Blitz used the same renderer, order, headings, width, typography/icon source, Premium/auth block, divider model, internal navigation scroll, collapse control, and <=768 drawer. Playchess is source-identical at the ownership boundary. Hover/focus rules and active `aria-current` come from the common renderer/CSS; browser checks confirmed active items and no page-level horizontal overflow. The modern drawer has an explicit focus cycle and focus return on Escape/backdrop, but link-close does not explicitly return focus because navigation normally leaves the document.

## 7. Modern-versus-legacy evidence

| Visible concern | Modern gateways | Application/Play/Classic | Code owner causing difference |
|---|---|---|---|
| Category subtitles | Play & Compete, Learn & Improve, Analyze & Watch, Tools, Support | omitted | `renderGroups({showHeadings:true})` in standalone versus hydration options without it in `caissa-primary-navigation.js` |
| Brand/logo | modern 240 px header and shared normalized return-to-Play link | older 220 px shell treatment | shell markup plus `css/caissa-standalone-sidebar.css` versus `styles.css` |
| Account/Premium | renderer creates full sign-in/user menu placeholders and Upgrade CTA | application HTML owns equivalent markup; Trainer has only Premium | standalone renderer vs shell HTML; state then bound by `caissa-ui-auth.js` |
| Icons/order | canonical Font Awesome classes and same 28-order | same canonical icons/order | `renderItem`; no data drift |
| Active item | route `data-active` | section/route controller | `activeKey` versus `CaissaNavigation` |
| Spacing/dividers/scroll | modern group sections, dividers, 240 px width and scroll positioning | flat groups/dividers, 220 px width; Trainer-local scroll | renderer option and CSS owners |
| Collapse | modern renderer button | application has its own behavior; Trainer none | shell adapters |
| Mobile semantics | labelled, controlled, expanded state, backdrop, focus containment/return | application toggle observed without controls/expanded; Trainer has core ARIA state | separate drawer implementations |

Primary root cause: canonical **data** was unified by HOTFIX 9.1.3, but canonical **presentation and interaction** were not. Shells still reconstruct brand/auth/Premium/drawer concerns and select different render options.

## 8. Authentication and Premium boundary

`js/caissa-auth.js` owns authentication state; `js/caissa-ui-auth.js` binds the common sidebar IDs and updates signed-in identity, tier, account menu, sign-out, and upgrade affordances. `js/caissa-access.js` owns Premium/credit entitlement. The renderer must not absorb either state machine. A shared sidebar chrome adapter may emit one stable set of hooks, but auth/access modules must remain the state owners.

The implementation must verify anonymous, signed-in Free, and Premium states without changing accounts. Duplicate IDs are forbidden. Settings stays a contextual game/application action owned by `CaissaNavigation`; Help and About remain canonical route links. A global sidebar must not invent a Settings route or convert Help back to divergent modal-only behavior.

## 9. Mobile and accessibility findings

1. **High:** application drawer state lacks observed `aria-controls` and `aria-expanded`, so assistive technology cannot reliably associate or announce it. Align with the modern adapter.
2. **High:** every closed drawer must be non-interactive to keyboard and accessibility APIs. Off-screen transform alone is insufficient; certify `inert`/focus exclusion and appropriate hidden semantics without hiding an open drawer.
3. **High:** use one focus-management primitive per shell: focus first meaningful control on open, trap only while open, Escape/backdrop close, and return focus to the invoker. Never leave parallel desktop/mobile copies focusable.
4. **Medium:** category labels should remain visible text and non-interactive headings that label grouped navigation (`section` + `aria-labelledby` is already the modern pattern). They must not become links/buttons or decorative pseudo-content.
5. **Medium:** the logo's accessible name is canonically “CAISSA Chess — return to Play”; do not add a second ambiguous Return to Play action beside it without distinct purpose/name.
6. **Medium:** preserve `aria-current="page"` on exactly one active global destination. Internal Play tabs need their own tab/navigation current-state semantics and must not compete with the outer current item.
7. **Medium:** internal nav scroll must reveal the active/focused item and must not steal page scroll. Visible focus indicators may not be clipped at scroll edges.
8. **Medium:** certify 44 CSS px touch targets, safe-area padding, 200% zoom/reflow (including ~640 CSS px), forced colors, and readable source order.
9. **Low:** drawer/collapse transforms must honor reduced motion. The existing modern logic is functional without animation; CSS should disable nonessential transitions.
10. **Low:** brand, auth, Premium, grouped links, Connect, then Support is the intended reading order. Do not use CSS order to produce a different visual order.

## 10. Play V2 boundary

The global sidebar is the outer application navigation. Play V2's Games, Bots, and governed Coach state are internal product modes. Blocked Mentor/Players/education states, FICS isolation, Worker isolation, gameplay lifecycle, and route controller remain Play-owned. Sidebar unification must not:

- move Academy, Tactics, Endgame, Mentor, Players, or FICS logic into Play;
- alter `/play`, `/play/games`, `/play/bots`, `/play/coach` routing;
- enable a blocked surface;
- introduce FICS resources or identity into Play;
- share or restart a Play Worker;
- change the production fail-closed rewrite.

The adapter boundary ends at outer chrome and global destination activation. Tests under `tests/play/` and `tests/browser/play-*` remain authoritative for the inner workspace.

## 11. Duplication and drift risks

- Brand/auth/Premium markup is repeated in `index.html`, generated Classic/Play documents, standalone renderer, and Trainer.
- Three drawer implementations can diverge in ARIA, focus containment, safe-area behavior, and breakpoints.
- `showHeadings` is an untyped renderer option; omission silently produces the legacy appearance.
- Application fallback navigation remains a no-JS copy and can drift even though runtime replaces it.
- Generated `yahoo-classic.html`, `play-v2.html`, and blog pages must change through their canonical generators when their owned markup changes.
- Multiple CSS owners use the same generic classes at 220 and 240 px, increasing cascade risk.
- Production Play's fail-closed rewrite can make local Play visual evidence misleading.

## 12. Reuse options and recommendation

| Option | Scope / risk | Verdict |
|---|---|---|
| A. Use the existing modern renderer everywhere | Few conceptual owners, but replacing entire application/Trainer nav DOM couples auth, section transitions, game layout, generated shells, and mobile state in one high-risk cutover. | Reject as first move. Useful end-state only if later evidence removes adapter need. |
| B. One canonical model with minimal shell adapters | Reuse inventory/builders and modern group semantics; add a small application adapter/configuration while retaining application route/auth ownership and Trainer boundary. Moderate focused CSS/mobile work; reversible by family. | **Recommended.** |
| C. Keep per-shell renderers with shared data | Smallest immediate diff, but preserves drawer/auth/chrome duplication and recurring accessibility drift. | Reject as target architecture. |

Recommended architecture: retain `CaissaPrimaryNavigation` as the sole model; make sidebar rendering accept explicit shell capabilities (headings, auth hooks, Premium, collapse, route/application activation) with shared group markup and one shared drawer accessibility controller. Keep at most the modern standalone adapter and an application adapter; Endgame Trainer supplies a thin layout adapter, not another data or interaction implementation.

Must not be created: a second inventory/JSON file, page-local item arrays, copied category labels, a fourth sidebar component, another route normalizer, a separate mobile CSS system, or a navigation-owned auth/entitlement state machine.

## 13. Exact migration plan

Two implementation tasks are sufficient; a six-task season is not justified.

### NAV-2.1 — Shared sidebar presentation and interaction foundation

- **Goal:** make headings/chrome/drawer behavior explicit reusable capabilities and remove semantic divergence without changing routes/order/labels.
- **Likely files:** `js/caissa-primary-navigation.js`, `js/caissa-standalone-sidebar.js`, a shared navigation section of `styles.css` and/or `css/caissa-standalone-sidebar.css`, application shell source/generator identified by `scripts/build-yahoo-classic.mjs` and `scripts/build-play-v2.mjs`, focused unit/browser tests.
- **Surfaces:** modern standalone, core shell, Classic/Play source shells; Trainer only consumes the shared drawer primitive if proven compatible.
- **Reuse:** current inventory/render functions, auth hook IDs, transition policy and modern grouped markup.
- **Tests:** exact 28/order/categories; one sidebar; auth/Premium hooks; headings; active current; desktop widths/content offset; closed-drawer focus exclusion; controls/expanded; focus return; 768 breakpoint; 200% zoom/reduced motion.
- **Stop conditions:** any label/order/route/policy change, auth state regression, Play/Classic transition regression, duplicate IDs/sidebar, or need to modify Play internals.
- **Rollback:** revert this task's shared adapter/CSS/test commit; no data migration.
- **Policy version:** no, if categories/order/labels/routes remain identical.
- **Generated inventory:** no. Regenerate only generator-owned HTML when its canonical source changes; do not hand-edit deterministic output.

### NAV-2.2 — Family adoption, differential certification and release

- **Goal:** adopt the shared adapter by core/Classic/Trainer where applicable; certify every shell and release artifact.
- **Likely files:** `index.html` or its real source, `scripts/build-yahoo-classic.mjs` + deterministic `yahoo-classic.html`, `scripts/build-play-v2.mjs` + allowed preview output, `endgame-trainer.html`, `js/endgame-trainer/endgame-trainer-page.js`, `css/endgame-trainer.css`, standalone host pages only if the adapter API requires a mechanical version update, `tests/browser/global-navigation-order.spec.js`, `tests/browser/primary-navigation-surface-consistency.spec.js`, focused new sidebar consistency/accessibility specs.
- **Surfaces:** all A/B/E families; G remains excluded.
- **Reuse:** one model, two full adapters maximum, Trainer layout hook.
- **Tests:** desktop/tablet/mobile route matrix, screenshots for Play preview/Fritz/Tactics/Live Blitz, auth state fixtures, Help/Settings/About, legacy redirects/back-forward, Play/FICS/Worker isolation, public-release audit.
- **Stop conditions:** production Play boundary changes, gateway iframe/function changes, baseline failure set grows, screenshots reveal content obstruction, or canonical generator emits unrelated output.
- **Rollback:** revert adoption by shell family; each family commit must be independently deployable/revertible.
- **Policy version:** no unless a separately approved IA decision changes contract data.
- **Generated inventory:** only run `scripts/build-caissa-public-route-inventory.mjs` if canonical data/routing changes (not expected). Use `scripts/build-public-release.mjs` solely for its directly owned deterministic release output/check.

## 14. Existing coverage and focused test plan

Existing coverage includes:

- `tests/global-navigation-order-policy.test.js`: contract ID, immutable count/order/category expectations and renderer adoption.
- `tests/navigation-integrity.test.js`: application/Classic/Trainer/standalone script ownership and singleton hosts.
- `tests/browser/global-navigation-order.spec.js`: runtime contract marker and destination order.
- `tests/browser/primary-navigation-surface-consistency.spec.js`: route, active state, direct/reload/history identity and standalone resolution.
- `tests/primary-navigation-transition-policy.test.js` and `tests/browser/legacy-canonical-section-routes.spec.js`: legacy/canonical transitions.
- Gateway tests (`tests/playchess-gateway.test.js`, `tests/fritz-gateway.test.js`, `tests/tactics-gateway.test.js`, `tests/live-blitz-gateway.test.js`).
- `tests/browser/endgame-practice-sidebar.spec.js`: standalone mobile sidebar behavior.
- `tests/hotfix-9-2-1-help-game-options.test.js`: Help/Settings ownership.
- Play isolation/responsive/accessibility suites under `tests/play/` and `tests/browser/play-*`.

Focused gaps to add:

1. One parameterized shell-family test for headings, 28-order, icons, single active current item, logo name, Support/Connect placement and no duplicate sidebar.
2. Anonymous/Free/Premium sidebar snapshots or DOM contracts without live account mutation.
3. Drawer ARIA and keyboard contract across standalone/application/Trainer: closed focus exclusion, open focus, cycle, Escape, backdrop, focus return.
4. Responsive visual baselines at 1440x1000, 768x1024, 390x844 and 200% equivalent, covering Play source/preview, Fritz, Tactics and Live Blitz.
5. Content/sidebar independent scroll and focused-item visibility tests.
6. Explicit exclusions asserting auth/payment/fail-closed/QA pages do not accidentally acquire the global shell.

Do not duplicate route/order assertions already owned by the policy test. Prefer data-driven shell fixtures.

## 15. Baseline debt and differential certification

The eleven inherited failures are outside scope: four Endgame Trainer digest expectations, one migration-version expectation, one package-lock guard, three Season 10 `index.html` guards, one Season 10 `server.js` guard, and one public-disclosure expectation. Sidebar work must capture the exact baseline command/output before modification, rerun the same command after modification, and require **zero new failures**. Report inherited failures separately; do not fix, update, suppress, rebaseline, or include them in sidebar commits. Focused navigation tests must pass absolutely.

## 16. Stop conditions and rollback

Stop implementation if the baseline/branch differs, extra dirty files appear unexplained, generated output expands beyond its owner, the 28 count/order changes without approval, a page needs a new inventory, production Play gating changes, auth/account mutation is required for certification, or any canonical route loses direct-load/refresh/back-forward identity.

Rollback is commit- and family-bounded: revert foundation before adoption only after reverting adopters; otherwise revert the affected family adoption while retaining the shared model. There is no schema/data rollback. Preserve the current standalone renderer until all family tests pass; never delete fallbacks and adapters in the same step that introduces their replacement.

## 17. Explicit out of scope

- Runtime changes, visual redesign, label/order/category changes, deployment and push.
- Play V2 internal modes, education restrictions, FICS/Worker behavior and production gate.
- Gateway iframe/product behavior and third-party attribution.
- Auth, entitlement, billing or account-state changes.
- Redirect/SEO/public inventory changes.
- The eleven inherited failures.
- Unrelated `package.json` and `tools/fics-lab/` work.

## 18. Product decisions required

1. Should Blog remain Tools, or move under a future Community & Support group?
2. Should Connect and Support become one named category, and if so is Settings intentionally excluded while Help/About remain routes?
3. Should Endgame Trainer adopt full auth/account chrome and desktop collapse, or retain its deliberately reduced product chrome?
4. When `/play` is re-enabled, should its outer sidebar match the 240 px modern presentation exactly or use an application-layout adapter with identical semantics/tokens?
5. Is the no-JS hard-coded application navigation a required resilience feature? If yes, its generation owner must be explicit; if no, remove it only in a separately reviewed change.

None blocks adapter-foundation work if current IA and Trainer chrome are preserved. Decisions 1–2 would change `CaissaGlobalNavigationOrderPolicy` and require version/inventory regeneration; decisions 3–5 are presentation/architecture decisions.

## 19. Final recommendation

**CONDITIONAL GO** for two small implementation tasks, conditioned on preserving the 1.5.0 inventory, production Play gate, auth/entitlement ownership, and differential baseline. The evidence is sufficient to draft NAV-2.1 and NAV-2.2 without repeating discovery.

**NAV-2.0 COMPLETE — GLOBAL SIDEBAR AUDITED**
