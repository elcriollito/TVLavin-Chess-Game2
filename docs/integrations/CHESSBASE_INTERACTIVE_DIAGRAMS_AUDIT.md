# ChessBase Interactive Diagrams integration audit (ICD-0.1)

**Verdict: CONDITIONAL GO for a four-diagram, non-engine pilot.** The released Game Replayer isolation foundation can support one literal, allowlisted `interactive-diagrams` mode, but the PGN wrapper URL, PGN host, readiness heuristic, and parent protocol must not simply be relabelled. The first pilot should use published CAISSA Knowledge Platform positions through its immutable public consumer boundary, and should exclude `data-play`, Engine, Download, arbitrary markup, and private authoring inputs.

Audit date: 2026-08-15 UTC. Runtime observation window: 2026-08-15 03:02–03:04 UTC. This is an engineering, product, privacy, and provenance assessment, not legal advice.

## 1. Baseline and scope

| Check | Verified result |
| --- | --- |
| Branch | `main` |
| HEAD | `f842a49e6b518df70faea6569ecb95f10593ade0` |
| `origin/main` | `f842a49e6b518df70faea6569ecb95f10593ade0` |
| Divergence | `0 0` |
| Staged files | none |
| Expected unrelated work | modified `package.json`; untracked `tools/fics-lab/` |
| LTR-0.3A | HEAD and confirmed ancestor |
| GPR-0.3 | `0a381c82758aa8584ea597e613d505829215f0d7`, confirmed ancestor |
| NAV-2.3A | `04d311b30a35af969f4fe4ccbabfdb5db20d48f8`, confirmed ancestor |

No unexplained baseline change was found. The unrelated work was preserved exactly. ICD-0.1 changes no public page, navigation, Blog, Academy, Endgame surface, Game Replayer runtime, CSP, routing, sitemap, generated inventory, or supply-chain policy.

## 2. Repository ownership trace

The released Game Replayer separates three responsibilities:

1. `game-replayer.html` owns indexable copy, shared navigation, attribution, accessible status/fallback, and a titled first-party iframe.
2. `js/game-replayer-parent.js` owns the 15-second timeout, retry, and exact-source/exact-origin `CaissaGameReplayerStatus@1.0.0` message validation.
3. `integrations/chessbase-pgn-replayer.html` owns the ChessBase CSS, jQuery 3.0.0, `cbreplay.js`, SRI pins, narrow CSP, and PGN-specific `.cbreplay` host. Its controller treats rendered children without `LOADING...` as ready and emits a bounded status message.

Production wrapper headers are owned in `vercel.json`. External-script discovery and exact integrity registration are owned by `scripts/supply-chain-script-tags.mjs` and `scripts/audit-supply-chain.mjs`. Navigation order is owned by `CaissaGlobalNavigationOrderPolicy@1.7.0`; fallback navigation and the public route inventory have canonical deterministic generators. The Tactics and Live Blitz pages instead use provider-owned cross-origin iframes with CAISSA-owned attribution and fallback; they are patterns for disclosure, not the correct diagram runtime.

The Knowledge Platform has a separate trust boundary. Authoring units are registered explicitly, validated, and snapshotted into immutable releases. The Endgame Library browser reader is pinned to release `rel-58b238dfdda8f295fdab023cead6bf069aceefbee74a64a5cd71af2202480a84`, verifies the release contract and fingerprint, fetches only allowlisted release shards, and returns cloned/frozen public data. Consumers must not import authoring modules, resolve a mutable “latest” release, or read `endgame-pools/private/`.

### Reuse classification

| Component | Classification | ICD consequence |
| --- | --- | --- |
| Outer H1, explanatory DOM, attribution, status/fallback and titled iframe | directly reusable pattern | Use the established credited-gateway presentation contract. |
| First-party wrapper boundary and route-specific CSP | reusable with an explicit mode | A literal diagram mode can contain provider globals; do not turn it into an arbitrary selector/URL wrapper. |
| ChessBase CSS, jQuery, `cbreplay.js`, SRI pins and scanner ownership | directly reusable only after hash revalidation | The official diagram instructions name the same three assets. |
| Parent timeout, source/origin validation and retry | reusable with a diagram-specific schema | Multiple diagram readiness and partial failure need a new typed contract. |
| `sandbox="allow-scripts allow-same-origin"` evidence | directly reusable security limitation | It is required by the released provider runtime and is not a DOM-isolation boundary. Keep the wrapper free of CAISSA auth, analytics and user state. |
| `.cbreplay`, `data-url`, Capablanca PGN and download fallback | PGN-specific; not reusable | Diagrams consume reviewed positions, not PGN collections. |
| Existing “one rendered child means ready” heuristic | PGN-specific; not reusable | Diagram mode must count expected hosts and report complete, partial, error, and timeout states. |
| Current wrapper CSP | security-sensitive; reusable only after a clean trace | Static diagrams may fit it; `data-play` introduces Worker/engine requirements that it intentionally denies. |
| Immutable Knowledge release and browser reader | directly reusable content boundary | Select only published, structurally valid, educationally verified, provenance-cleared positions. |
| Academy, Blog, Library and Trainer renderers | not reusable runtime owners | They retain their current responsibilities and are not modified or coupled to the provider widget. |

## 3. Official ChessBase evidence

All integration authority below is first-party ChessBase material.

| Purpose | Requested URL | Exact observed final URL/result |
| --- | --- | --- |
| English documentation | `https://play.chessbase.com/en/howto/embeddiagrams` | same URL, HTTP 200; no redirect |
| Known German equivalent | `https://play.chessbase.com/de/howto/embeddiagrams` | same URL, HTTP 200 |
| Replayer stylesheet | `https://pgn.chessbase.com/CBReplay.css` | same URL |
| Documented jQuery | `https://pgn.chessbase.com/jquery-3.0.0.min.js` | same URL |
| Diagram/replayer runtime | `https://pgn.chessbase.com/cbreplay.js` | same URL |
| Privacy | `https://en.chessbase.com/pages/security` | directly linked by the English page |
| Software notices | `https://foss.chessbase.com/` | directly linked by the page |

The documentation describes an ordinary `.cbdiagram` element plus the same stylesheet, jQuery and global CBReplay script used by GPR. It is not a custom element, module, documented initializer API, or official iframe. The provider script discovers hosts and replaces their contents while executing with the embedding document's privileges.

The documented input attributes are:

- `data-pos` for ChessBase/Fritz piece-list notation;
- `data-title` and `data-legend` for visible explanation;
- `data-hint` and `data-solution` for a guided answer;
- `data-arrows` and `data-squares` for visual annotations;
- `data-moves` as an alternative to `data-pos`;
- `data-play` with an engine thinking time in milliseconds;
- `data-size` in the example, although the prose does not define responsive semantics.

The running English page currently uses `data-fen` rather than its prose example's `data-pos`. It rendered four hosts: a 300 px button-free diagram, a 400 px replayable diagram, a 400 px hint/solution diagram, and a 460 px `data-play="1000"` position. This discrepancy means a pilot may use FEN only after a focused implementation test establishes that it is a supported current input; the implementation must not silently translate private authoring formats in the browser.

## 4. Feature and first-pilot decision

| Feature | Evidence | Pilot decision |
| --- | --- | --- |
| Static position | documented `data-pos`; official page currently uses `data-fen` | allow reviewed FEN through a fixed adapter after certification |
| Title and legend | documented and visibly rendered | allow, but keep equivalent explanatory text in CAISSA DOM |
| Arrows and square markers | documented | allow only literal, validated square lists; optional in pilot |
| Move replay | documented `data-moves`; move entry visible | defer unless a specific lesson needs it and keyboard behavior passes |
| Hint and solution | documented and visible | safe candidate for one pilot item after answer/provenance validation |
| Piece movement | present by default on interactive examples | do not claim correctness checking unless a solution contract is configured and tested |
| Flip/notation controls | visible provider controls | acceptable incidental controls; do not depend on undocumented internal selectors |
| Engine button | appears on a normal replayable example even without `data-play` | exclude if a supported `data-noengine`/button configuration is proven; otherwise STOP for the pilot |
| Download | appears on interactive examples | exclude if supported configuration permits; otherwise disclose and review generated content behavior |
| `data-play` | documented as internal-engine thinking time; official example says every diagram has a little embedded engine | **defer** |

The smallest useful pilot is four static educational diagrams: two clean demonstrations, one contrast, and at most one hint/solution item. It must not use `data-play`, user-entered positions, arbitrary data attributes, remote position URLs, PGN loading, engine analysis, account, storage, or provider services as CAISSA features.

## 5. `data-play` security and lifecycle finding

`data-play` is not a harmless presentation flag. The official page explicitly defines its numeric value as internal-engine thinking time and labels the example “Every diagram has a little embedded engine.” Static inspection of the currently released `cbreplay.js` shows that diagram hosts with `dataset.play` enter `MiniPlayMode`, while ordinary diagrams enter an analysis mode. The same bundle contains engine-instance pools, `new Worker(...)`, Blob-backed Worker construction after Ajax retrieval, and engine URLs.

The official full documentation page is not a minimal dependency trace, but it loaded provider page bundles, advertising, fonts, CBReplay CSS/script, images and a cross-origin activity iframe. Those page-wide origins must not be copied into CAISSA policy. The evidence is sufficient to classify `data-play` as a separate engine/Worker/network lifecycle requiring:

- an explicit product requirement;
- exact Worker and engine URL tracing from a clean isolated wrapper;
- `worker-src`, `connect-src`, Blob, dynamic-code and shutdown review;
- CPU, battery, memory, concurrency and background-tab measurements;
- deterministic timeout/abort behavior and a non-engine fallback;
- separate accessibility and privacy certification.

Because the current GPR wrapper intentionally has no `worker-src` and no ChessBase service `connect-src`, enabling `data-play` would be a material security expansion. **Do not include it in ICD-0.2.** Mere presence of broad engine code in the shared bundle does not prove that a static diagram starts a Worker; implementation tracing must prove that the no-engine configuration stays dormant.

## 6. Mobile density and performance budget

The official page loads `cbreplay.js` once and renders four diagrams. At the observed desktop viewport (1536 × 695, device pixel ratio 2.5), the four hosts were approximately 302, 421, 445 and 500 CSS px high; the document was 3,283 CSS px tall and contained 245 DOM elements after render. The host width expanded to the content column rather than matching `data-size`, so `data-size` is not a reliable containment contract by itself.

The official page is not a controlled CAISSA mobile benchmark: it includes provider navigation, advertising, consent and activity content. GPR's earlier official-page audit also found horizontal overflow at 390 CSS px. Therefore this audit does **not** certify an unlimited or even eight-diagram mobile page.

Set the first release budget at **four diagrams maximum**, with no `data-play`, and render them in one column. This is a conservative product limit derived from the provider's own four-example page and the cost of a single 3+ MB shared runtime; it is not a claim that four is a universal provider maximum. ICD-0.2 must test an isolated four-item fixture at 1440, 1024, 768, 390 and 320 CSS px, 200% zoom, reduced motion, slow network and low-end mobile CPU. Release requires zero page-level horizontal overflow, bounded cumulative layout shift, useful text before provider readiness, and acceptable measured CPU/memory/long tasks. Increase the count only in a later evidence-backed release.

Progressive enhancement must be page-level: all four titles, instructions and position descriptions exist in ordinary CAISSA DOM, while the third-party diagrams enhance them. Do not lazy-initialize by injecting unreviewed markup. If later measurement supports lazy activation, preserve stable reserved dimensions and announce readiness without moving focus.

## 7. Accessibility and failure behavior

Positive observations: provider controls are native buttons; title, legend, Hint and Solution are visible; and the board can expose positional information through provider-generated labels.

Material limitations: the observed icon buttons had empty text and no `aria-label`, relying on `title`; the board's screen-reader semantics and move announcements are not documented; touch target size, contrast, focus order, keyboard move entry, zoom and reduced-motion behavior are uncertified. A visual diagram is not an accessible substitute for lesson text.

The CAISSA parent must provide one H1, a short introduction, visible ChessBase attribution, a concise iframe title, and for each item a heading, side to move, educational purpose, and textual fallback. Status must be polite and page-level; failure must leave every lesson understandable. The wrapper should emit a diagram-specific typed payload containing only schema, state, expected count and rendered count. The parent must validate exact source and origin. A partial result must not be announced as fully ready.

Release states should be `loading`, `ready`, `partial`, `error`, and `timeout`. A blocked script or stylesheet, invalid position, zero rendered diagrams, mismatch with the expected count, or timeout must reveal the textual fallback. Retry may reload only the fixed wrapper configuration. Never accept a query-string selector, FEN, HTML fragment, remote URL, or diagram count from the public URL.

## 8. Security, privacy, CSP and supply chain

- Reject direct ChessBase scripts in the public CAISSA page: they would gain application DOM/storage privileges and collide with the site's jQuery/runtime ownership.
- Use one first-party wrapper dedicated to the literal `interactive-diagrams` mode. An enum may select only build-owned, reviewed content. Do not create a generic wrapper system.
- Revalidate all three provider SRI digests immediately before implementation. Preserve the existing scanner as the only external-script registry owner.
- Derive wrapper CSP from a clean no-engine trace. Keep `'unsafe-eval'` confined to the wrapper only if the provider still requires it. Do not add ChessBase script/connect/worker origins to the global policy.
- Start with no `worker-src`, no provider service `connect-src`, no forms, popups, top navigation, downloads, account, analytics or CAISSA credentials. A network request outside the proven static asset/image/font set is a release failure until reviewed.
- The released `allow-scripts allow-same-origin` sandbox is a functional compatibility concession, not an isolation guarantee. The wrapper must contain no user data or privileged APIs.
- Do not describe ChessBase technology or diagrams as owned or operated by CAISSA. Disclose provider operation and mutable availability.

## 9. Knowledge Platform content reuse

The public consumer interface can technically provide pilot positions without a new database. Eligible content must come from the pinned immutable release through `loadPinnedEndgameLibrary()` / its equivalent verified release reader, then pass these gates:

```text
unit.status === "published"
unit.editorial.reviewStatus === "approved"
unit.editorial.verificationState === "verified"
unit.editorial.provenance.kind === "caissa-original" (or separately cleared)
position.fen is present
position.validation.structural === "valid"
position.validation.educational === "verified"
```

Strong pilot candidates include the released clean-demonstration positions for direct opposition, rule of the square, key squares, and a contrasting pawn-transformation or exchange position. Representative examples already exposed by published units include `pos:direct-opposition:file`, `pos:rule-square:a-pawn-white-king-outside`, `pos:key-squares:central-pawn-route`, and the independently authored pawn-breakthrough geometry. Final IDs must be selected by the consumer at implementation time and locked in a reviewed configuration; do not duplicate their FEN/prose into another content database.

The repository records CAISSA ownership, originality declarations, copyright notes, approved review, and verified educational status for these published units. That supports reuse of CAISSA-authored positions and prose inside CAISSA, subject to the repository's content governance. Traditional geometry marked as inspired requires preservation of its provenance note and independently authored wording. Do not consume authoring modules, historical/hash-protected release artifacts as editable sources, private pool reviews/evidence, private authoring data, or Blog/Academy presentation content.

The public reader currently returns whole released units rather than a diagram-specific projection. ICD-0.2 should add the smallest read-only adapter that maps a fixed list of eligible released position IDs to an immutable diagram view model. It must fail closed on release fingerprint, missing position, provenance, status or validation mismatch. It must not write back to Knowledge, create a second registry, or expose answer keys beyond the selected public lesson contract.

## 10. Architecture options

| Option | Security and maintenance | Content/performance | Verdict |
| --- | --- | --- | --- |
| Direct `.cbdiagram` hosts in public page | provider globals and old jQuery receive full page privileges; shared CSP expansion | simple markup but poor failure isolation | reject |
| Literal `interactive-diagrams` mode in the released isolated-wrapper foundation | reuses tested boundary, SRI, scanner and parent pattern; needs diagram-specific status/CSP certification | one shared runtime, fixed four-item public configuration | **recommend** |
| New unrelated diagram wrapper framework | duplicates ownership and invites arbitrary configuration | unnecessary abstraction | reject |
| Provider iframe | no official diagram iframe is documented | unavailable |
| Native CAISSA board/parser/engine | maximum control but large duplicate system | violates Reuse-First for this pilot | reject |
| Reuse Tactics gateway | strong cross-origin isolation, but it is a provider puzzle service, not CAISSA-authored diagrams | wrong content and product contract | reject |

### Recommended boundary

```text
CAISSA pilot parent
  owns SEO, shared navigation, H1, explanatory lesson DOM, status/fallback,
  attribution, and fixed selection of published Knowledge position IDs
    -> first-party isolated diagram wrapper (literal mode only)
       owns CBReplay CSS + jQuery + cbreplay.js and four validated hosts
       emits count-aware diagram status only
```

Reuse the foundation, not the PGN-specific route or names. A small shared status helper is justified only where the message validation and timeout behavior are byte-for-byte equivalent; keep schemas, content adapters, readiness predicates and CSP ownership mode-specific.

## 11. Proposed pilot contract

- Working product concept: a credited “Interactive Chess Diagrams” learning page; final route and navigation placement belong to a later implementation task.
- Four diagrams maximum, one column, sourced from one pinned immutable Knowledge release.
- Mix: two demonstrations, one contrast, and at most one reviewed hint/solution.
- No `data-play`, Engine claim, remote PGN, arbitrary FEN/query input, uploads, accounts, scoring, saved progress or new content database.
- All teaching text remains visible and indexable without the widget.
- Attribution states that ChessBase provides and operates the diagram technology; CAISSA supplies the selected CAISSA-authored educational positions.
- The page must not modify or imply integration with the existing Library, Trainer, Academy, Blog, Tactics, or Game Replayer experiences.

## 12. ICD-0.2 release gates

1. Reconfirm official documentation and the exact English final URL.
2. Verify whether `data-fen`, `data-buttons`, `data-noengine` and any download suppression used by the official examples are supported rather than merely reverse-engineered. Stop if the unwanted Engine/Download paths cannot be disabled safely.
3. Revalidate the provider CSS/script SRI digests and supply-chain registry.
4. Trace a clean static four-diagram wrapper and prove zero Workers, engine downloads, provider API calls, storage writes and unexpected origins during load and basic interaction.
5. Add an explicit build-owned mode/configuration allowlist and reject all URL-controlled content.
6. Implement a count-aware status schema and test ready, partial, invalid position, blocked CSS/script, timeout and retry.
7. Prove 1440/1024/768/390/320 containment, 200% zoom, keyboard order, visible focus, touch targets, reduced motion and no page-level horizontal overflow.
8. Measure transferred bytes, DOM nodes, long tasks, CPU and memory on a low-end mobile profile; retain the four-item cap unless evidence supports more.
9. Select positions only through the pinned public Knowledge consumer and assert publication, validation, provenance and fingerprint gates.
10. Add route/navigation/sitemap/inventory/CSP changes only in that implementation release, using canonical owners and generators.

## 13. Final answers

1. **Can GPR's foundation support the mode?** Yes, conditionally: reuse its isolated wrapper, SRI/scanner, timeout, attribution and exact-origin messaging patterns with a literal diagram mode. Do not overload the PGN URL, PGN host, readiness predicate or schema.
2. **How many diagrams on mobile?** Cap the pilot at four. The provider demonstrates four with one shared runtime, but no isolated low-end mobile maximum is published or yet certified; four remains a release budget pending ICD-0.2 measurements.
3. **Which features are safe first?** Static reviewed positions, visible title/legend, optional validated arrows/squares, and at most one hint/solution. Keep all essential teaching text in CAISSA DOM.
4. **What does `data-play` add?** An internal-engine mode with separate Worker, dynamic-code, resource, CPU and lifecycle concerns. Defer it.
5. **Can Knowledge supply the content?** Yes. Use only pinned immutable published units through the public consumer interface, with provenance and validation gates; create neither copies nor a second database.

**Decision: CONDITIONAL GO — FOUR STATIC, KNOWLEDGE-BACKED DIAGRAMS IN AN EXPLICIT ISOLATED MODE; NO ENGINE.**
