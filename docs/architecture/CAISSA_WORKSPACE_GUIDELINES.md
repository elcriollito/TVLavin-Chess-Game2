# CAISSA Workspace Guidelines

Status: official product architecture guidance

Reference implementation: Endgame Trainer Feature Complete Beta v1.0

Audience: CAISSA product designers, engineers, reviewers, and contributors

## Purpose and scope

This document defines the shared product language for chess workspaces in CAISSA. It describes responsibilities, information hierarchy, interaction expectations, and adoption boundaries. It is not a pixel specification, CSS framework, or instruction to copy the Endgame Trainer DOM.

Future modules should preserve these principles while using their own domain-appropriate content. Existing modules are not implicitly scheduled for redesign by this document.

## Goals

- Keep chess and the student's immediate task visually primary.
- Give each piece of information one authoritative owner.
- Separate active work from retrospective analysis.
- Reveal complexity only when it becomes useful.
- Preserve board and session continuity through asynchronous operations.
- Reuse stable CAISSA domains instead of rebuilding local variants.
- Support responsive, accessible, localizable, and persistence-independent evolution.

## Official terminology

Use these names consistently in product copy, architecture, tests, and reviews:

| Term | Meaning | Primary owner |
| --- | --- | --- |
| **Training Workspace** | The active environment for learning, solving, or playing. | Product presentation |
| **Progress Workspace** | The retrospective environment for review, history, mastery, and next actions. | Product presentation |
| **Lesson Companion** | The current lesson's objective, principle, step, instruction, and lesson navigation. | Curriculum/session integration |
| **Board** | The persistent visual and interaction surface for the chess position. | Board View + Board API |
| **Coach** | Deterministic instructional feedback and progressive hints. | Coaching domain |
| **Session** | Live task facts, state, move history, and essential controls. | Session controller/presentation |
| **Training Memory** | Validated educational history and derived learning measures. | Training Memory domain |
| **Mastery** | A derived measure of learning by theme; not a game result. | Training Memory domain |
| **Recommendation** | One deterministic next-learning suggestion. | Recommendation derivation |

Avoid aliases such as “learning sidebar,” “stats area,” or “AI advice” when one of the official terms applies.

## Core principles

### 1. Board First

The Board is the primary visual element in any position-based workspace. Supporting panels may frame it but must not compete with it, force uncomfortable compression, or appear before it on constrained screens.

### 2. Learn Before Statistics

During active training, the reading sequence is:

```text
Lesson Companion or task context
              ↓
            Board
              ↓
            Coach
              ↓
           Session
```

Progress, history, mastery, and recommendations belong after the active work. A metric must not interrupt the student's attempt merely because it is available.

### 3. Single Workspace Context

Each workspace has one primary purpose:

- **Training Workspace:** learn, solve, play, receive coaching, and complete a session.
- **Progress Workspace:** review, compare, identify weaknesses, manage Training Memory, and select the next activity.

A feature should not display the complete contents of both contexts simultaneously in the same panel.

### 4. Single Source of Truth

Status, Recommendation, hint, active Lesson Companion, and feedback each have one authoritative presentation location. Other surfaces may link to that location but must not restate or independently calculate the same content.

### 5. Progressive Disclosure

Show the minimum information needed for the present decision. Advanced evaluation, long history, secondary controls, and management actions should become available through clear expansion or through the Progress Workspace. Disclosure must remain keyboard-operable and understandable without relying on animation.

### 6. Persistent Board

Ordinary status, coaching, evaluation, loading, and timer changes must not replace, hide, or remount the Board. Existing positions remain visible while asynchronous work proceeds. Only position-owning actions—such as move, undo, restart, or new position—may reconcile pieces.

### 7. Educational Priority

Every interface decision should improve recognition, decision-making, feedback, or retention. Decorative complexity, extra metrics, and competing calls to action are rejected when they distract from chess.

## Workspace anatomy

The recommended conceptual flow is responsibility-based rather than coordinate-based:

```text
┌──────────────────── Training Workspace ────────────────────┐
│ Context: Setup or Lesson Companion                         │
│                           ↓                                │
│ Board: position, input, legal interaction                  │
│                           ↓                                │
│ Coach: timely feedback and progressive hints               │
│                           ↓                                │
│ Session: live facts, history, controls, completion          │
└───────────────────────────┬─────────────────────────────────┘
                            ↓ completed/review action
┌──────────────────── Progress Workspace ────────────────────┐
│ Summary → Mastery → History → Insights → Recommendation     │
│                         Training Memory actions             │
└─────────────────────────────────────────────────────────────┘
```

### Context

Before training, Context contains Setup. During guided work, Lesson Companion replaces Setup in the same conceptual region; both are not presented as competing panels. Context owns task selection and lesson meaning, not board or progress state.

### Board

Board owns position rendering, orientation, interaction affordances, selection, legal targets, and move animation. It does not own session, engine, lesson, coaching, or persistence state.

### Coach

Coach presents one response to the student's latest relevant action. It may explain a classification or progressively reveal a hint. It does not duplicate Session status or expose unsupported theoretical certainty.

### Session

Session contains only information useful while solving: objective, turn, status, attempt/hint/undo counts, essential engine/result indicators, move history, and task controls. Detailed trends and historical comparisons belong to Progress.

### Progress

Progress owns terminal summary, overview metrics, Theme Mastery, Recent Sessions, Insights, Recommendation, and Training Memory management. It behaves as a review dashboard and remains secondary to active training.

## Responsive philosophy

Responsive behavior preserves priority rather than reproducing desktop geometry at smaller sizes.

| Environment | Expected composition |
| --- | --- |
| **Desktop** | Three-column Training Workspace when content and board can remain comfortable: Context, Board, Session. |
| **Laptop** | Adaptive composition; Context stays near the Board and Session may move below or become a compact region. Never shrink the Board merely to retain three columns. |
| **Tablet** | Board first. Lesson Companion and Session are independently collapsible and follow the Board. |
| **Mobile** | Board first. Lesson Companion uses an accessible accordion pattern; Session follows as a compact/expandable region; Progress remains below training. |

DOM reading order, focus order, and screen-reader relationships must remain coherent when visual order changes. Capability detection, not viewport width alone, determines board input behavior.

## Shared component responsibilities

### CAISSA Board API v1.0

The [CAISSA Board Interaction API](./CAISSA_BOARD_INTERACTION_API_V1.md) is the page-agnostic input coordinator. Workspaces provide rules, a Board View, and immutable move callbacks. They must not fork touch/drag behavior, infer session state from board selection, or remount the board for auxiliary updates.

### Lesson Companion

Lesson Companion owns only the active lesson: title, objective, principle, current step, instruction, lesson navigation, restart, and return to Setup. It does not own Coaching classifications, live move history, or progress analytics.

### Coach

The [Deterministic Coaching contract](./ENDGAME_COACHING_V1.md) owns instructional classification, safe theme language, and hint progression. Presentation renders its structured output idempotently. It must not trigger board rendering or calculate competing session truth.

### Session

The session controller is authoritative for live lifecycle and task state. Presentation may collapse Session but must not synthesize a second lifecycle or hide terminal/error recovery.

### Training Memory and Mastery

The [Training Memory v1 contract](./ENDGAME_TRAINING_MEMORY_V1.md) owns validated educational records, statistics, mastery, weaknesses, and recommendation derivation. UI surfaces consume snapshots; they do not recalculate formulas.

### Recommendation

Exactly one visible Recommendation communicates the deterministic next action. Launch controls may act on it, but no other panel independently derives or restates another recommendation.

### Import, export, and reset

These are Training Memory management actions and belong in Progress. They retain the domain's validation, version, privacy, and failure behavior. Destructive reset requires explicit confirmation.

## State and ownership flow

```text
Rules / Session Controller ── position ──▶ Board View
           │                                  │
           ├── lifecycle ───────────────▶ Session
           ├── move context ────────────▶ Coach
           └── terminal record ─────────▶ Training Memory
                                                │
                             mastery / insight / recommendation
                                                ▼
                                      Progress Workspace
```

Arrows describe data ownership, not required implementation classes. Presentation may compose outputs, but it must not reverse ownership or create a second source of truth.

## UX anti-patterns

| Avoid | Why |
| --- | --- |
| Duplicated recommendations | Creates contradictory next actions and unclear ownership. |
| Duplicated lesson text | Increases scanning and makes updates inconsistent. |
| Hidden or replaced Board during loading | Breaks spatial memory and makes ordinary operations feel destructive. |
| Scrolling repeatedly between lesson and Board | Interrupts comparison between instruction and position. |
| Statistics before learning | Competes with the student's immediate chess decision. |
| Multiple primary CTAs | Obscures the intended next step. |
| Repeated status messages | Produces noise and conflicting lifecycle descriptions. |
| Board remounts for moves or auxiliary state | Causes flicker, loses focus/selection, and duplicates listeners. |
| Page-specific touch/drag logic | Fragments behavior and bypasses the shared Board API. |
| UI-derived mastery or recommendation formulas | Diverges from Training Memory truth. |
| Desktop columns compressed onto mobile | Sacrifices board usability and reading order. |
| Color-only state or motion-only feedback | Excludes users and weakens deterministic communication. |

## Accessibility and language

- Preserve semantic headings and landmarks for both workspaces.
- Keep visual, DOM, keyboard, and announced reading orders compatible.
- Collapsible regions expose name, state, and controlled content through native or equivalent accessible semantics.
- Status and coaching announcements are timely, concise, and not duplicated across live regions.
- Touch targets, focus visibility, contrast, zoom, reduced motion, and keyboard board operation are release requirements.
- Product strings belong in presentation/message catalogs suitable for future localization. Domain identifiers, classifications, and stored records must not depend on translated labels.

## Compatibility and evolution

- **Board API v1.0:** workspace adoption must preserve its stable exports, lifecycle, capability-based input, and rendering guarantees.
- **Deterministic Coaching:** workspaces render existing classifications and safe messages; visual integration does not add engine claims.
- **Training Memory:** UI evolution consumes its schema and derived outputs without changing formulas or history semantics.
- **Cloud synchronization:** a future persistence adapter may replace local storage without moving Training Memory ownership into UI or authentication.
- **Localization:** future translated presentation must preserve stable IDs, enum values, schemas, and deterministic behavior.
- **Accessibility:** future improvements may enrich semantics and alternate interaction, but must not weaken board persistence or single-source ownership.

Breaking a referenced public contract requires that contract's own version and review process. A visual redesign alone never authorizes an API change.

## Future adoption

Academy, Analyze, Mentor, Puzzle Trainer, Opening Explorer, Classic Training, and Endgame Library should adopt these guidelines incrementally when their product scope calls for workspace work. Adoption means applying responsibilities and priorities—not cloning Endgame Trainer markup.

For each module:

1. State its primary user task and identify whether it needs Training, Progress, or both.
2. Inventory existing sources of board, status, feedback, history, and recommendation truth.
3. Remove duplicate ownership before changing layout.
4. Integrate the shared Board API where interactive board input is required.
5. Keep module-specific domain logic outside shared presentation components.
6. Define responsive reading and focus order before selecting visual breakpoints.
7. Prove no remount, lifecycle, accessibility, persistence, or existing-workflow regression.

Analyze may emphasize investigation rather than instruction; Opening Explorer may emphasize a tree rather than Session; Endgame Library may be review-only. Those differences are valid when the Board remains appropriately prioritized and ownership stays explicit.

## Design and review checklist

- [ ] One primary workspace purpose is named.
- [ ] Board priority and persistence are explicit.
- [ ] Setup and active context do not compete.
- [ ] Status, lesson, hint, feedback, and Recommendation each have one owner.
- [ ] Active learning precedes statistics.
- [ ] Session shows only solving-relevant information.
- [ ] Progress contains review and Training Memory actions.
- [ ] Responsive order is board-first where space is constrained.
- [ ] Collapsible content remains accessible and recoverable.
- [ ] Shared domain outputs are consumed rather than recalculated.
- [ ] No new dependency or page-specific board interaction is introduced without architectural review.
- [ ] Tests cover ownership, lifecycle, responsive contracts, accessibility, and existing workflows.

## Authority

This guide is the default architectural reference for new CAISSA chess workspaces. Product-specific requirements may refine it, but deviations should be explicit, justified by the user's task, and reviewed for compatibility with the stable domain contracts above.
