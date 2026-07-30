# CAISSA Play Visual Originality Audit

Status: approved internal design boundary

Contract: `PlayVisualIdentity@1.0.0` / `PlayOriginalityPolicy@1.0.0`

Scope: Simplified Play under `body.caissa-simplified-play-active`

## Principle and expression boundary

Board-first hierarchy, a contextual panel, one primary action, progressive disclosure,
mode navigation, responsive stacking, and evaluation visibility are reusable product
principles. CAISSA does not treat those ordinary interaction concepts as proprietary.

CAISSA expression is independently specified: an inscribed mode rail, asymmetric corner
rhythm, edge-marked surfaces, identity-first profile hierarchy, separated primary
commands, explicit learning continuation, truthful readiness language, and a visible
relationship to CAISSA Classic. Exact third-party assets, words, measurements, component
orders, palettes, type systems, shadows, animations, and breakpoint sets are prohibited.

## Originality matrix

| Pattern | Functional principle | Current CAISSA form | Risk | Preserve | Change | Observable reason |
|---|---|---|---|---|---|---|
| Shell proportions | Board first | Square board derived from available stage geometry | Low | Largest stable region | None | CAISSA layout logic, not a fixed copied split |
| Board/panel split | Context beside play | Named board stage and independently scrolling panel | Low | Two-region usability | None | Repository-specific semantic regions and QA activation |
| Mode tabs | Clear selection | Plain horizontal buttons | High | Routing and keyboard model | Inscribed rail, edge marker, asymmetric selected surface | Removes generic pill/button resemblance |
| Profile cards | Opponent selection | Emblem, identity, difficulty or focus | Medium | Radio selection and truthful data | Edge-marked silhouette and identity-first rhythm | No portrait asset or rating-pill hierarchy |
| Rating badge | Strength metadata | Small rounded badge | High | Rating/range semantics | Rectangular ledger mark | Avoids a floating rating pill |
| Time controls | Fast preset choice | Radio choice grid | Medium | Standard notation and form semantics | Ruled score-sheet rows and selected edge | Common chess notation; CAISSA-owned grouping |
| Collapsible options | Progressive disclosure | Native details/summary | Low | Native behavior | Engraved summary edge | Accessibility behavior remains standard |
| CTA footer | One primary command | Wrapping action row | High | Exactly one primary | Primary separated from utilities | Avoids equal-button clusters |
| PostGame | Continue after completion | Result, facts, actions, Mentor continuation | Medium | Truth and commands | Distinct learning bridge | Education is part of CAISSA hierarchy |
| Loading skeleton | Honest waiting | Scoped animated surface | Medium | Status and reduced motion | Diagonal ledger wash | Independently specified animation |
| Empty state | Truthful absence | Title and explanation | Medium | No fabricated data | Edge-marked open-file surface | Not a promotional empty card |
| Locked state | Unavailable capability | Explicit locked vocabulary | Medium | Reason and alternatives | Notched edge, no lock illustration | Avoids copied icon conventions |
| Evaluation rail | Evaluation visibility | Policy-owned vertical rail | Low | Rail and states | None | Geometry derives from CAISSA board stage |
| Mobile stacking | Board first when constrained | Board precedes context | Medium | Order and safe areas | CAISSA boundary plus rail overflow | Avoids a generic component breakpoint |
| Labels and microcopy | Clear chess actions | CAISSA, Mentor, Classic, QA readiness | Low | Standard chess terms | Foreign-brand and phrase guard | CAISSA-authored, evidence-bound copy |

## Asset and provenance audit

The shared layer loads no icons, avatars, flags, illustrations, textures, fonts, or
remote images. Bot emblems are registry-derived initials; Coach emblems are registry-owned
text marks. Board pieces remain the existing ChessboardAdapter concern. Existing external
URLs in Analyze, attribution, authentication, and the legacy SPA are not imported by this
identity layer.

## Wording audit

Reviewed mode labels, headings, setup labels, primary actions, PostGame actions, Mentor
continuation, Players readiness, and state copy. Standard terms such as “Rematch,”
“Analyze,” “Time control,” colors, and chess clock notation remain. CAISSA-specific terms
include “CAISSA Classic,” “Mentor,” “Guided Replay,” and explicit QA-only/unavailable
language. Foreign product branding and copied promotional phrases are prohibited in
user-facing Simplified Play.

## CSS value-cluster audit

The original layer combined a conventional spacing sequence, uniform radius, pill
badges, generic shadow, 600px breakpoint, and ordinary selected button. The revised
layer uses a 6/10/16px rhythm, asymmetric 10px/3px corners, inset edge engraving,
rectangular ledger badges, a separated primary command, a 42rem adaptation boundary,
and a 980ms diagonal ledger wash. All selectors remain under the explicit Simplified
Play body state.

## Enforcement

`window.CaissaPlayIdentityRules` is passive, immutable, resource-free, and versioned.
Static tests scan the Simplified Play boundary for prohibited domains, brand strings,
suspicious asset names, external visual assets, global CSS leakage, runtime ownership,
and value-cluster regression. Browser tests verify structure, one-primary hierarchy,
board identity, asset requests, wording, nine viewports, reduced motion, and Legacy and
Classic boundaries.
