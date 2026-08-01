# Simplified Play Mentor Engagement Analytics Audit

Version: `PlayMentorEngagementPayload@1.0.0`
Season boundary: `10.13.4`

## Scope and ownership

This audit covers only Simplified Play Mentor engagement. `PostGameExperience` remains the owner of review requests, technical-review readiness, critical-moment selection, Guided Replay start, and Mentor Summary outcomes. `GuidedReplayView` remains the owner of user replay attempts, reference-reveal controls, Knowledge link activation, and replay exit. The analytics observer records owner-confirmed outcomes and performs no product action.

No Memory, Mastery, Academy, Mentor analysis, game, board, routing, persistence, network, consent, or identity ownership moved. The observer has no transport, storage, cookies, timers, workers, DOM construction, chess engine, or board resources.

## Event taxonomy

| Event | Authoritative signal | Broad categories |
| --- | --- | --- |
| `play_mentor_review_requested` | Mentor request created | review / review-request / requested |
| `play_mentor_review_ready` | technical review prepared | review / review-ready / ready |
| `play_mentor_review_failed` | request owner rejected creation | review / review-ready / failed |
| `play_mentor_critical_moments_opened` | critical moments selected | critical-moments / opened |
| `play_mentor_guided_replay_started` | replay started and view mounted | guided-replay / started |
| `play_mentor_replay_attempted` | replay owner returned attempt result | replay-attempt / attempted |
| `play_mentor_reference_revealed` | replay owner first revealed reference | reference-reveal / revealed |
| `play_mentor_knowledge_opened` | visible Knowledge link activated | knowledge / opened |
| `play_mentor_summary_requested` | summary generation invoked | summary / requested |
| `play_mentor_summary_ready` | summary owner generated successfully | summary / ready |
| `play_mentor_summary_failed` | summary owner rejected generation | summary / failed |
| `play_mentor_exited` | replay close action completed | exit / exited |

The exact payload fields are `engagement`, `stage`, `state`, `attemptCategory`, `conceptCategory`, `source`, `failureReason`, `qaEligible`, `productionEligible`, `completionSequence`, `engagementSequence`, and `shellVersion`. Contracts reject extra or malformed fields.

## Category and content boundary

Attempts are limited to accepted, rejected, invalid, unavailable, or unknown. Concepts map only when an existing value exactly equals an allowlisted broad category; near matches and arbitrary identifiers become unknown. Sources and failures are closed allowlists. Production eligibility remains false and QA eligibility true.

Forbidden data includes moves, SAN, UCI, squares, PGN, FEN, positions, evaluations, principal variations, prompts, explanations, feedback, summaries, evidence, Knowledge unit or concept identifiers, Mentor or player identity, session/game/review identifiers, URLs, exact time, time spent, and exact attempt counts. Hidden reference answers are observed only after the replay owner confirms reveal; the reference itself is never read or emitted.

## Deduplication, stale handling, and failure isolation

The observer keeps at most 12 non-persistent signatures and evicts the oldest. Duplicate lifecycle signals are suppressed. Explicit stale outcomes are ignored. Replay attempts use view-local ordinal keys so distinct attempts remain countable without content or cross-session identity. Disposal is terminal and clears the local signature set.

Contract rejection, observer exceptions, dispatcher duplicates, and trusted QA sink failures cannot change Mentor results, rendering, announcements, navigation, board state, or learning state. Diagnostics contain counts and allowlisted reason codes only.

## Privacy, consent, and security

No analytics transport or persistence exists, so no new consent surface is introduced. Existing consent ownership is unchanged. Exact schemas, allowlists, frozen events, non-executable categorical payloads, bounded state, and the expanded prohibited-field policy form the security boundary. No dependencies, breakpoints, visual hierarchy, runtime resources, protected architecture documents, or migration ownership changed.

## Responsive navigation incident and readiness qualification

Historical responsive runs timed out at inconsistent browser lifecycle and actionability boundaries across Chromium, Firefox, and WebKit even though diagnostic screenshots showed the board, EvaluationRail, context panel, mode content, styles, and accessibility composition rendered. Bare `page.goto` calls implicitly waited for browser `load`, while later readiness checks were fragmented across individual specs. Browser lifecycle completion was therefore an unreliable proxy for authoritative CAISSA readiness.

The test-only `PlayResponsiveReadiness@1.0.0` helper now navigates to the Playwright `commit` boundary, validates the main-document HTTP status, HTML content type, and allowlisted route, then requires the settled route mode, one active shell, one initialized nonzero board, expected mode content, a nonzero context panel, active-tab semantics, and exactly two live regions. Geometry must remain within the existing 2 CSS-pixel tolerance for three consecutive animation frames. A panel is scrolled with instant DOM scrolling only when measured viewport bounds require it, followed by another stabilization check. Existing board, geometry, route, accessibility, focus, resource, PostGame, promotion, and blocked-Players assertions remain intact.

No production code, timeout, retry, worker, browser, viewport, or workflow changed. Exact workflow diagnostics passed in Chromium, Firefox, and WebKit. Each full isolated browser project then passed three consecutive times (36/36 cases total). The complete cross-browser responsive command passed three consecutive times: 4/4 helper contracts and 12/12 browser cases per run, in 128.2, 128.0, and 143.1 seconds. Future readiness or geometry reason-code failures must reopen the infrastructure investigation rather than weaken the contract.

## Consolidated regression Bots readiness incident

The first final consolidated regression reached its Chromium full-Play layer after the preceding unit, integration, responsive, hard-invariant, and smoke layers passed. It reported 194 passes, three documented skips, and two failures. The theme preservation test exhausted its 45-second test budget waiting for the first `[data-bot-id]`; the representative visual-components test found zero of the four required Bot profile cards after its assertion timeout.

Both preserved Playwright page snapshots showed the legacy Play surface. They contained no Simplified Play shell, selected mode rail, context panel, Bots loading state, Bots unavailable state, stale Games panel, or Bots error boundary. Consequently no Bots lazy-loader state, registry, panel, cards, or lazy script elements existed in the rendered document at failure time. The original run retained error-context snapshots but had trace, screenshot, console, page-error, request-failure, and server-response capture disabled, so those channels supplied no additional failure evidence.

The Playwright configuration uses one worker, zero retries, and a reused local HTTP server. Standard `page` fixtures still create a new browser context and page for every test, so local storage, session storage, document namespaces, global registries, shell instances, lazy-loader instances, and route history do not survive between tests. Only the server and browser process are reused. The relevant preceding specs cannot dispose a singleton used by a later fresh document. The full suite runs the theme spec before the visual-components spec, but neither failed test depends on that order.

Both entry points register analytics contracts, privacy, dispatcher, routing, visual themes/components, event lifecycle, lazy contracts, load registry, prefetch policy, lazy loader, mode analytics, Mentor engagement observer, PostGame, and finally the Simplified Play shell in the same dependency-safe order. The five Bots scripts occur only in the fixed `bots-stack` registry and are not eager or duplicated. The Mentor observer is eager but has no dependency edge to `bots-stack`; the test-only readiness helper is absent from both production pages. Existing static ownership tests cover eager critical resources, deferred groups, uniqueness, and visual assets before panels.

Fresh-process diagnostic runs with trace enabled passed the exact theme test, the exact visual-components test, and both together using one Chromium worker, zero retries, and the original timeout. Their complete invocations took 5.8, 3.9, and 5.0 seconds respectively. This proves the four-profile registry, sequential five-script Bots load, readiness assertion, single panel mount, visual factory, and card rendering contracts work on a cold isolated boot. Combined with the failure snapshots, the supported root cause is a test readiness defect under full-suite resource pressure: the two tests used default `page.goto` lifecycle waiting followed by an immediate Bot selector, while the failed documents had not yet reached authoritative Simplified Play readiness.

The narrow correction reuses the test-only committed-response readiness helper and adds `PlayBotsReadiness@1.0.0`. Bots readiness now requires the authoritative Bots route, active ready shell, loaded `bots-stack`, Bot contracts and four-profile registry, mounted BotsPanel, exactly four profile cards, no loading/error/unavailable state, one board, at most one Play worker, and active accessibility composition. The original theme, lifecycle, FairPlay, clock, route, resource, visual-component, and four-card assertions remain unchanged. No product code, lazy ownership, eager loading, timeout, retry, expected card count, browser, or test was changed or removed.

Focused Chromium qualification passed without source changes: the exact theme test three times (4.0, 2.8, and 2.8 seconds), the exact visual-components test three times (4.2, 3.0, and 3.0 seconds), both tests together three times (2/2 in 3.9 seconds each), and the relevant lazy-loading state-machine test three times (2.8, 2.7, and 2.7 seconds). A clean 32-test Chromium subset covering themes, visual components, Bots, lazy loading, shell, and all four analytics browser specs then passed in 44.5 seconds. Every run used one worker, zero retries, the original timeout, and the unchanged four-card expectation.

The single responsive reconfirmation passed 4/4 responsive contract tests and 12/12 browser cases across Chromium, Firefox, and WebKit in 82.2 seconds. The analytics safety reconfirmation passed 30/30 unit/static tests and 24/24 browser cases across all three engines in 31.4 seconds, reaffirming the twelve-event categorical boundary and zero chess content, identity, transport, storage, cookie, Memory, or Mastery ownership.

Final acceptance passed on the fixed patch without retries: analytics 30/30 unit/static plus 24/24 cross-browser; Play unit 501/501; integration 9/9; responsive 4/4 contract plus 12/12 cross-browser; hard invariants 7/7; cross-browser smoke 3/3; and static guards 5/5. The consolidated regression passed all eight layers in 358.6 seconds, including its formerly failing full-Play layer and repository layer, with zero blockers. The separate full-Play invocation passed 196 tests with only the three pre-existing documented characterization skips, and the separate repository regression passed 1,573/1,573. Bots rendered four cards throughout the focused and sustained-load gates.
