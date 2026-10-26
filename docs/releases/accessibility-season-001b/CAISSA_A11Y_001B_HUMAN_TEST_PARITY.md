# CAISSA Accessibility Season 001B — Human Test Parity

Owner record: `HUMAN TEST PASS — CAISSA ACCESSIBILITY SEASON 001B` on combined build `69ef0401b606bc6f537d9b884b87dfc7f1898598`.

Parity result: **TARGETED HUMAN RETEST REQUIRED**.

## Equivalent approved surfaces

- Chess Gym HTML, CSS, and tab controller are byte-identical to the combined build.
- Opening Database HTML and controller are byte-identical to the combined build.
- Chess TV CSS and controller are byte-identical to the combined build.
- Shared i18n and primary navigation owner are byte-identical to the combined build.
- Desktop/mobile screenshots show equivalent layout for these surfaces.

These approved experiences do not require a complete repeat.

## Materially different surfaces

### Scanner optional feedback consent

The combined build includes privacy-lane wording and a disabled-until-applicable source-image-rights checkbox. Importing those controls would also require the excluded privacy consent-binding backend. The accessibility-only candidate therefore retains the production-base optional image consent while adding only the accessible dialog relationship.

- Candidate: [Scanner consent — candidate](evidence/candidate/scanner-feedback-consent-mobile.png)
- Human-tested combined build: [Scanner consent — combined](evidence/combined/scanner-feedback-consent-mobile.png)

This is visible and behaviorally material. Approval must not be silently transferred.

### Scanner modal keyboard containment

The isolated candidate adds Tab/Shift+Tab containment for active sheets and restores focus on Escape. This is an accessibility-only hardening discovered during WebKit/keyboard certification and is not present in the combined build.

### Global bypass in WebKit

The isolated candidate explicitly places bypass links in the sequential focus order and uses a clipped-until-focused presentation. The combined build's offscreen link was skipped by automated WebKit's first Tab.

### Generated Play fallback markers

Four direct Play documents gained only the deterministic `active` / `aria-current="page"` fallback marker. Those routes remain behind the unchanged unavailable gate; this does not broaden Play availability.

## Public-safe comparison evidence

Candidate captures:

- [Chess Gym desktop](evidence/candidate/chess-gym-desktop.png)
- [Opening Database desktop](evidence/candidate/opening-database-desktop.png)
- [Chess TV desktop](evidence/candidate/chess-tv-desktop.png)
- [Scanner desktop](evidence/candidate/scanner-desktop.png)
- [Scanner mobile](evidence/candidate/scanner-mobile.png)
- [Navigation desktop](evidence/candidate/navigation-desktop.png)
- [Navigation mobile](evidence/candidate/navigation-mobile.png)

Matching combined-build captures are in `evidence/combined/` with the same filenames.

## Targeted owner test

Use the exact isolated server/candidate, not the combined server:

1. At `/analyze`, press Tab once in Safari/WebKit or the owner's target browser. Confirm the bypass becomes visible; press Enter and confirm main content receives focus.
2. At mobile `/scanner`, activate New Scan. Confirm initial focus on Cancel, Shift+Tab reaches Choose Photo, Tab wraps to Cancel, and Escape returns focus to Start a new scan.
3. After a safe synthetic failed scan, open Help improve Scanner. Confirm the candidate's two consent controls and wording are acceptable for the accessibility-only release. Do not submit feedback or private imagery.

Expected duration: approximately 3–5 minutes. No repeat of unchanged Chess Gym, Opening Database, Chess TV, or broader navigation flows is needed.

## Gate

Until the owner records this bounded retest against the exact candidate, the correct classification is `CONDITIONAL GO`, not `GO FOR OWNER PRODUCTION APPROVAL`.
