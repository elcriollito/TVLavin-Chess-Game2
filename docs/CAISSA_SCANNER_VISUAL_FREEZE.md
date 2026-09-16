# CAISSA Scanner — Phase 2C Visual Freeze

## Status

**PHYSICALLY CERTIFIED ON IPHONE**

Certified baseline: `ad8036132417bc0d283f18ccd8d0e320111325c2`

This document is the canonical visual contract for the CAISSA Scanner Phase 2C public experience. It protects the physically approved interface while allowing future internal engineering.

Certification scope:

- Mobile portrait.
- App-like exclusive views.
- Physical iPhone acceptance.
- Touch and safe-area acceptance.
- Visual hierarchy.
- Board stability.
- No-jitter behavior.

## Frozen public experience

The public Scanner has four principal views:

- **CAPTURE** — the minimal entry view for starting a scan.
- **READING** — a calm, short-lived processing view.
- **REVIEW / EDIT** — the dedicated board confirmation and editing view.
- **WORKSPACE** — the accepted position, navigation, analysis, export, and New Scan view.

Only one principal view may be visible at a time. Inactive views must not reserve layout space or remain keyboard-focusable.

Canonical recognition flow:

`Capture → Reading → Review/Edit OR Workspace`

Manual edit flow:

`Workspace → Review/Edit → Workspace`

New Scan flow:

`Workspace → chooser → Reading`

Canceling the New Scan chooser keeps the current Workspace and position intact. Canceling a manual edit restores the exact Workspace state. Canceling recognition review returns safely to Capture rather than exposing an unconfirmed Workspace.

## Workspace visual contract

The board is the primary object. The certified toolbar order above it is:

1. Edit Position.
2. Save Diagram.
3. Export / Share.
4. Product Menu.

Raw FEN must not be permanently visible.

The certified structure beneath the board contains:

- Board navigation.
- Flip.
- Lower analysis menu.
- Analyze.
- Engine toggle.
- Stockfish 18.
- MultiPV 3.
- One prominent New Scan action.

The Workspace retains the dark CAISSA identity, official piece set, existing board colors, existing spacing and hierarchy, and an exactly 8×8 board. Analysis updates must not remount, resize, shift, or jitter the board. Do not turn Scanner into a desktop-dashboard layout.

## Review / Edit visual contract

Review/Edit is a dedicated exclusive view and edits the **current** board position. Its certified controls and arrangement include:

- Apply and Cancel.
- White / Black to move.
- Castling.
- Clear Board.
- Clear Square.
- Flip.
- Black piece palette above the board.
- White piece palette below the board.
- Persistent active-tool indication.
- Official CAISSA piece assets.
- Diagram Library placeholder.
- Export access.
- Product Menu access.

Camera, Gallery, and rescan controls must not be introduced into Edit.

## Menu contract

The top menu is the **Product / Account** menu. Its intended items are:

- Diagram Library.
- Video Board Explorer.
- Account.
- Membership.
- Logout.

The lower menu is the **Current Position / Analysis** menu. Its intended items are:

- Open in Lichess Analyzer.
- Open in Chess.com Analyzer.
- Open in CAISSA Analyzer.

These menus must remain distinct. They may not be merged without explicit Alexander approval.

## Export and New Scan contract

The first Export tap opens the internal CAISSA format chooser. It must not immediately invoke native sharing. Current formats are:

- Diagram Image.
- FEN Text.

Workspace has one prominent New Scan action. It opens:

- Take Photo.
- Choose Photo.
- Cancel.

Do not add duplicate permanent Camera or Gallery controls.

## App-like behavior

- Scanner should feel like a dedicated mobile app inside CAISSA.
- Do not stack workflow stages vertically.
- Do not show inactive stages.
- Do not reintroduce large technical cards.
- Do not expose internal FEN or recognition-pipeline language.
- Do not show Candidate FEN to normal users.
- Do not show debug architecture labels.

## Board geometry invariants

- Exactly 8×8.
- Exactly 64 equal squares.
- Stable board dimensions.
- No board remount during analysis or view transitions.
- No layout shift from principal-variation updates.
- No jitter.
- No horizontal overflow.
- Official CAISSA piece assets.
- No Unicode fallback as the final visual piece set.

## What is not frozen internally

The following areas may evolve when the certified public UX contract remains intact:

- Image recognition implementation.
- Board detection.
- Perspective correction.
- Orientation detection.
- Classifier.
- Confidence scoring.
- Chess-aware warnings.
- Training pipeline.
- Diagram Library backend.
- Account backend.
- Membership backend.
- Video Board Explorer backend.
- Saved-position persistence.
- Performance optimization.
- Internal data and state architecture.

## Phase 3 recognition protection

**PHASE 3 RECOGNITION MUST PLUG INTO THE EXISTING SEAM:**

`Capture → Reading → routeRecognitionResult() → Review/Edit OR Workspace`

Phase 3 must not redesign the certified views merely to integrate computer vision. If recognition work requires a visible UX change, stop with HOLD and request explicit Alexander approval.

## Visual Freeze Exception Policy

Any future change to visible control order, primary layout, board size or position, toolbar structure, menu organization, Edit layout, color identity, piece set, major spacing, app-like view flow, Export behavior, or New Scan behavior requires explicit Alexander approval.

**VISUAL-FREEZE exception requires Alexander's explicit approval.**

Codex must not infer that approval from a technical implementation task.

## Rule for future Codex work

Before changing Scanner visible UI:

1. Read `docs/CAISSA_SCANNER_VISUAL_FREEZE.md`.
2. Run `node --test tests/scanner-visual-contract.test.js`.
3. If the task conflicts with this freeze and no explicit Alexander approval exists, return **HOLD**.
