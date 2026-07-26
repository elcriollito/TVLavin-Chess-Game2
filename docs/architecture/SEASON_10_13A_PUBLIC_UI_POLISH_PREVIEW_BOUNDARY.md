# Season 10.13A — Public UI Polish and Preview Boundary

## Baseline and objective

Implementation began from clean `main` at `a22c7ecae468ef42d78b44bc0f335fe2ad1dab19`, equal to `origin/main`. This season prepares an identifiable, accessible future Limited Preview without releasing it.

## Architecture

The boundaries are independent:

- `CAISSA_ENDGAME_PRACTICE_RELEASE_MODE` controls presentation/release eligibility.
- `CAISSA_PRIVATE_ENDGAME_RUN_ENABLED`, `CAISSA_PRIVATE_ENDGAME_RUN_MODE`, and the existing reason allowlist control operational runtime availability.
- `/endgame-practice` is presentation only. It never imports the manifest, controller, board, artifacts, approvals, evidence, hints, or feedback maps.
- The existing no-store edge endpoint evaluates both boundaries. It exposes only normalized allowlisted state.
- The runtime and artifacts remain lazy and are loaded only after both checks pass.

Release values are exactly `unreleased`, `internal-preview`, `limited-preview`, and `paused`. Missing or empty values safely default to `unreleased`. Unknown, mixed-case, and whitespace-bearing values are invalid and resolve to an unreleased configuration failure. The production-safe default is `unreleased`; runtime defaults to disabled.

## State matrix

| Release boundary | Runtime | Result |
| --- | --- | --- |
| paused | any | Paused shell; runtime does not load |
| unreleased | any | Closed shell; runtime does not load |
| internal-preview | disabled/maintenance | Safe unavailable shell |
| internal-preview | enabled | Start is permitted in the configured environment |
| limited-preview | disabled/maintenance | Safe unavailable shell |
| limited-preview | enabled | Structurally ready, not authorized for production in 10.13A |

Invalid configuration fails closed before runtime initialization.

## Shell, copy, and behavior

`/endgame-practice` uses the future identity “CAISSA Endgame Practice” and “Limited Preview,” lists five human-readable exercise themes, and includes the approved overview, availability, privacy, account, rating, and ephemeral-progress disclosures. Its internal navigation is limited to Overview, Exercises, Privacy, and Availability. Return links lead to Endgame Trainer and Endgame Library.

The shell has no global navigation registration and no Start action while unreleased. In an explicitly configured internal/limited environment with an enabled runtime, Start performs a full-page transition into the existing privacy-suppressed technical runtime. Exit uses `location.replace()` to return to `/endgame-practice`, preventing session restoration through history.

## Privacy and observability

The closed shell follows the existing public privacy-aware Clarity policy and emits no preview-specific events. The active exercise is a full-page privacy-suppressed runtime with `Referrer-Policy: no-referrer`, no application analytics, exercise telemetry, accounts, or persistence.

Application-level exercise telemetry is disabled. Platform-level request logs may still exist.

## Accessibility and responsive behavior

The page uses landmarks, one H1, ordered section headings, keyboard-visible focus, a skip link, an atomic polite live region limited to availability copy, semantic links/buttons, non-color status text, and reduced-motion rules. Layout is designed to scroll naturally from 320 px through wide desktop and short landscape without horizontal overflow.

## Indexing and exposure

The route is `noindex, nofollow`. It has no canonical, public Open Graph metadata, social card, JSON-LD, sitemap entry, robots disclosure, IndexNow submission, homepage/sidebar/Academy/Library/Trainer/About link, or public CTA.

## Validation and risks

Tests cover exact parsing, precedence, invalid and polluted selectors, closed-shell lazy-loading, copy, accessibility, responsive widths, authorized local transition, Clarity suppression, and return behavior. Existing artifact integrity, private-path protection, release audits, navigation, Knowledge, operations, and deterministic builders remain mandatory gates.

Residual risk is operational misconfiguration. The independent allowlists, invalid-configuration state, release-first precedence, no-store endpoint, and production verification mitigate it. Season 10.14 must not proceed without every human-controlled checklist decision below.

## Handoff to Season 10.14

10.13A does not approve a release. Production must remain `unreleased` with the private runtime disabled. Season 10.14 owns any release-mode change, discoverability decision, privacy approval, support plan, and rollback rehearsal.
