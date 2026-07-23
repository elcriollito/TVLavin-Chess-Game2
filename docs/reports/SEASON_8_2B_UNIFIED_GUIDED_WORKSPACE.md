# Season 8.2B Unified Guided Training Workspace

## Previous guided-state audit

Season 8.2 used three independent presentation inputs:

- `trainingMode` revealed a complete curriculum section below the training grid.
- `activeLesson` hid Setup and displayed Lesson Companion in the left column.
- `pilotSession` and `pilotMode` displayed a separate Canon player inside the lower curriculum section.

Selecting Guided Training did not create `activeLesson`; therefore Setup remained until a standard lesson started. Canon Learn/Recall never assigned `activeLesson`, so its instructions could not enter Lesson Companion. Recommendation lived in Progress while the selection workflow lived below the board. These were valid individual states but not one authoritative workspace model.

## Unified state model

`resolveGuidedWorkspaceState` is the single deterministic resolver:

| State | Condition | Left-column owner |
| --- | --- | --- |
| `setup` | mode is not guided | Free Practice Setup |
| `guided-catalog` | guided without active standard/pilot session | Curriculum Navigator |
| `guided-lesson` | guided with `activeLesson` | Lesson Companion |
| `guided-pilot` | guided with `pilotSession` | Pilot Companion |

Pilot ownership wins over a stale lesson reference, while non-guided mode always resolves to Setup. Rendering uses this state to make the four contexts mutually exclusive.

## Integrated behavior

Curriculum Navigator contains one recommendation, compact learning paths, progressive lesson detail, Canon Learn/Recall launchers, and a return to Free Practice. It is bounded and independently scrollable on wide layouts so it cannot elongate or compress the board.

Standard lessons retain objective, principle, current step, instruction, Previous, Next, Restart Lesson, Return to Curriculum, and Return to Setup. Canon Learn and Recall retain their original session domain, content, answers, progress events, and no-engine behavior; only their player moved into Pilot Companion. Exiting a pilot restores the runtime controller's FEN/orientation and returns to Curriculum Navigator.

The former lower curriculum and pilot player were removed. Recommendation, pilot instructions, curriculum paths, and active lesson instructions each have one presentation owner.

## Responsive contract

- Above 1100 CSS pixels: adaptive context, protected central board, and Session use three columns.
- 901-1100: context and board share the first row; Session follows below.
- 900 and below: board-first flow; Curriculum Navigator, Lesson Companion, Pilot Companion, and Session are collapsible after the board.

No transition recreates the board container, Board View, interaction controller, Worker, or progress store.

## QA

Focused contracts cover all resolver states, stale-reference precedence, Setup/catalog/lesson/pilot replacement, Learn and Recall, return transitions, a single recommendation/player/catalog, board restoration, responsive disclosure, and backward-compatible hooks. Transition coverage executes 50 standard lesson cycles, 50 Learn/Recall cycles, and 50 catalog/Setup cycles.

Completed verification:

- Node regression: 677 passed, 0 failed, 0 skipped.
- Workspace transitions: 100 starts, 100 new positions, 100 restarts, one board initialization, zero board disposals.
- Guided workspace state stress: 50 standard lesson cycles, 50 Learn/Recall cycles, and 50 Setup/catalog cycles.
- Role/reflection audit: 300 positions, zero inconsistencies.
- Coaching audit: 200 accepted cases, zero unsafe claims, zero nondeterministic results.
- Educational generation audit: 100 accepted positions, zero impossible exercises, zero theme mismatches, zero instantly lost or trivial exercises.
- ET.1 generation: 4,000 accepted, zero rejected, zero exhausted.
- ET.2 scoring: 4,000 evaluated, 3,518 accepted, zero fallbacks.
- Five-piece generation: 10,000 generated, 9,902 accepted, 98 rejected, zero exhausted, 10,000 unique.

Desktop evidence was captured for Curriculum Navigator, standard Lesson Companion, Canon Learn, and Canon Recall. Production verification is recorded after deployment.
