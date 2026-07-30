# Simplified Play Accessibility Audit

Audit version: 1.0.0

Scope: QA-only Simplified Play and its connected Play presentation surfaces

Boundary: board, game, engine, lifecycle, FairPlay, route, provider, Mentor evidence, and theme persistence ownership remain unchanged.

## Risk matrix

| Surface | Keyboard | Focus | Name/Label | Role/State | Live Region | Contrast | Touch | Risk | Decision |
|---|---|---|---|---|---|---|---|---|---|
| Mode tabs | Arrow/Home/End moved focus but did not activate | Roving focus existed | Named | Tab roles valid | Competing shell status | Theme-safe | 44px | High | Activate the focused tab through the existing click/route path; synchronize roving tabindex |
| Board actions and board | Native controls; board-level focus only | Board focusable | Board orientation and interaction named | `application` boundary is truthful | None added | Existing board identity | Existing board | Medium | Preserve drag/tap and board-level focus; do not claim square keyboard chess |
| Time controls | Native radio/select | Predictable | Fieldset/labels present | Native state | None | Theme-safe | 44px | Low | Preserve |
| Advanced options/disclosures | Native details/summary | Native order | Named | Expanded state not explicit | None | Theme-safe | 44px | Medium | Synchronize `aria-expanded`; preserve native behavior |
| Bot and Coach cards | Native radio/buttons | Predictable | Contextual names | Valid groups | Multiple competing regions | Theme-safe | 44px | High | Centralize announcements; retain visible status copy |
| Players tabs | Arrow/Home/End activation present | Roving focus present | Named | Tabs/panels linked | Competing region | Theme-safe | 44px | Medium | Preserve activation; centralize announcements |
| Player/challenge rows | Rows and actions reachable | Static rows added redundant stops | Contextual row/action names | Lists valid | None | Non-color text states | Actions 44px | Medium | Remove tabindex from noninteractive rows; retain button actions |
| Provider/Fair Play/blockers | Native actions | Predictable | Blocker described | Disabled native state | Visible status | Theme-safe | 44px | Medium | Preserve production block and adjacent explanation |
| CTA footers | Native buttons | DOM order logical | Contextual labels | Disabled state valid | None | Theme-safe | 44px | Low | Preserve primary-first order |
| PostGame | Native actions | Card receives focus | Named | Heading/summary valid | Result plus feedback competed | Theme-safe | 44px | High | Use central assertive game-over announcement and polite action announcements |
| Mentor Summary | Explicit generation | Summary receives focus | Named | Section/headings valid | Feedback competed | Theme-safe | 44px | Medium | Announce readiness once after explicit generation |
| Guided Replay | Native form/buttons | Close lost trigger | Input labeled | Hidden answer excluded from rendered reference | Three competing regions | Theme-safe | 44px | High | One bounded manager; restore focus to replay trigger; preserve answer gating |
| Knowledge links | Native links | Predictable | Contextual | Link semantics valid | Knowledge region was live | Theme-safe | 44px | Medium | Remove redundant live behavior |
| EvaluationRail | Read-only meter | Not tabbable | Value text present | Meter state valid | Every engine update was live | Theme-safe | Not interactive | High | Remove live updates; announce loading/unavailable transitions only |
| Clocks | Read-only context | Not tabbable | Existing names | Existing state | No per-second live behavior | Theme-safe | Not interactive | High if changed | Preserve; do not announce every second |
| Promotion | Native buttons | Existing modal controller | Choice labels present | Dialog semantics incomplete | None | Existing modal | Existing controls | High | Add dialog name/modal state; preserve promotion runtime |
| Loading/empty/locked/error | Static state copy | No hidden focus | Headings/messages | Visible non-color state | Loading factory created extra region | Theme-safe | Actions 44px | Medium | Use central manager only; retain visible text |
| Global dialogs/navigation | Existing owners | Existing restoration/traps | Existing labels | Existing dialog/nav semantics | Outside new manager | Existing | Existing | Medium | Do not replace global owners |
| Theme QA controls | API-only | No production control | N/A | QA-only | None | Dark/light/system verified | N/A | Low | Preserve QA-only boundary |
| Back/Forward | Existing route owner | Active tab synchronized | Named | Selection synchronized | Bounded mode message | Theme-safe | 44px | Medium | Preserve route ownership and update roving state |

## Findings and decisions

- High risk: repeated evaluation announcements, competing live regions, non-activating mode-tab arrow navigation, replay focus loss, and incomplete promotion dialog semantics.
- Medium risk: shadow-only focus indication, redundant row tab stops, disclosure state exposure, disabled-state discoverability, and reduced-motion/forced-colors parity.
- Low risk: already-native form controls, correctly linked tab panels, existing headings, and noninteractive clock presentation.
- The accessibility layer owns only validation, bounded focus records, fixed announcements, preference inspection, and diagnostics.
- The accessibility layer never receives or publishes board state, engine output, provider payloads, Mentor evidence, routes, or storage.
- Two live regions are the Simplified Play maximum: one polite and one assertive. Announcement IDs are fixed and messages are bounded constants.

## Truthful board boundary

The current board supports drag, tap-to-move, board-level focus, orientation description, and coordinate-form Guided Replay input. It does not provide square-by-square keyboard chess in Simplified Play. This audit does not claim screen-reader chess certification and does not replace the board.

## Manual validation boundary

Automated semantic, keyboard, contrast, forced-colors, reduced-motion, reflow, and Axe checks are required. Manual NVDA, JAWS, VoiceOver, TalkBack, switch-device, and physical touch-device certification remains outside this automated audit.
