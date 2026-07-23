# Season 8.2 Training Workspace Integration

## Information architecture

Before Season 8.2, the training grid, guided curriculum, session summary, and progress panel were sibling sections in one continuous page. Recommendation controls lived in Setup while training-memory controls were presented as a generic progress footer.

The page now has two explicit semantic regions:

1. **Training Workspace** owns Setup or Lesson Companion, the persistent board, Session, coaching/status, controls, and guided curriculum selection.
2. **Progress Workspace** owns the terminal session summary, Insights, Recommendation, Guided Training progress, Theme Mastery, Recent Sessions, and Training Memory import/export/reset controls.

No training, coaching, recommendation, mastery, persistence, generator, engine, or Board API algorithm changed.

## Dynamic learning column

The left training column has one owner at a time. Free Practice and pre-lesson Guided Training show Setup. An active guided lesson hides the complete Setup workspace and replaces it with Lesson Companion. The companion retains title, objective, principle, current step, instruction, navigation, restart, and return-to-setup actions.

## Responsive behavior

- Desktop: Setup/Lesson Companion, protected central board, and Session use a three-column grid.
- Laptop: Setup/Lesson Companion remains beside the board; Session moves below without compressing the board.
- Tablet and mobile: board-first reading order; Lesson Companion and Session provide independent accessible collapse controls.
- Progress always follows training and never precedes the board.

## Screenshots

- [Before: Season 8.1.5 production](season-8.2-before-production.png)
- [After: desktop](season-8.2-after-desktop.png)
- [After: laptop](season-8.2-after-laptop.png)
- [After: tablet](season-8.2-after-tablet.png)
- [After: mobile](season-8.2-after-mobile.png)

Chrome headless enforces a minimum layout viewport wider than a 390px screenshot crop. Mobile layout correctness is therefore additionally enforced by source contracts for viewport containment, board-first ordering, and responsive collapse controls.

## QA contracts

Product tests assert workspace separation, ownership of each surface, Setup/Lesson Companion mutual exclusion, a single recommendation presentation hook, a protected central board track, responsive board-first order, and collapsible instructional/session panels. Existing suites continue to cover free practice, guided lessons, coaching, Training Memory, recommendations, import/export, board lifecycle, and procedural generation.

Final results: 659/659 Node tests passed; 100 starts, 100 new positions, and 100 restarts retained one board initialization and zero disposals; 300/300 role/reflection samples were consistent; Training Memory completed 500-session round-trip coverage; coaching completed 200/200 samples with zero unsafe or nondeterministic messages. ET.1 generated 4,000/4,000 accepted positions, ET.2 accepted 3,518/4,000 candidates with zero fallbacks, and the five-piece suite produced 10,000 unique positions with zero exhaustion.
