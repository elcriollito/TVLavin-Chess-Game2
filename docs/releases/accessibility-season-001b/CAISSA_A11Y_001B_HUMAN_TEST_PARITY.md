# CAISSA Accessibility Season 001B — Human Test Parity

Owner record: `HUMAN TEST PASS — CAISSA ACCESSIBILITY SEASON 001B` on combined build `69ef0401b606bc6f537d9b884b87dfc7f1898598`.

Targeted owner record: `TARGETED HUMAN RETEST PASS — CAISSA ACCESSIBILITY 001B` on isolated candidate `23cc63fe807b9703224539004dd69b8155069ebd`, tree `124a9a5220bfb0550c1d9e2a79eed1fad987d7ff`.

Parity result: **APPROVED**.

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

## Targeted owner test — completed

The owner used the exact isolated release candidate and approved:

1. At `/analyze`, press Tab once in Safari/WebKit or the owner's target browser. Confirm the bypass becomes visible; press Enter and confirm main content receives focus.
2. At mobile `/scanner`, activate New Scan. Confirm initial focus on Cancel, Shift+Tab reaches Choose Photo, Tab wraps to Cancel, and Escape returns focus to Start a new scan.
3. After a safe synthetic failed scan, open Help improve Scanner. Confirm the candidate's two consent controls and wording are acceptable for the accessibility-only release. Do not submit feedback or private imagery.

The mobile Scanner check was completed on a physical device through a private local-network connection. No feedback or private image submission was required. No repeat is needed unless a source change invalidates the tested behavior.

## Gate

The previous Human Test approvals remain valid for unchanged behavior. They are acceptance of the tested user experience, not legal approval of Scanner data processing or certification of complete WCAG conformance.

Hotfix `4c7c3292cd181e96b67500326576c408efe41120` changes only Opening Database keyboard initialization and its tests. The owner should perform this bounded retest against the revised local server:

1. Open `/opening-database` and reload the page.
2. Immediately focus the `Moves` tab and press `End`.
3. Confirm `Search Games` receives focus and becomes selected.
4. Press `Home` and confirm focus/selection returns to `Moves`.
5. Repeat after the chessboard finishes loading.
6. Confirm tab clicks and normal Opening Database use still work.

No repeat of Chess Gym, Chess TV, Analyze bypass, Scanner mobile dialog, Scanner consent controls, or general navigation is required. Production approval remains separate.
