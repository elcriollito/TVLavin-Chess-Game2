# CAISSA Accessibility Compliance Status

**Verified:** 2026-10-26
**Production SHA:** `6e912be5c314080be8944efde261b8dc133452a6`
**Status:** Accessibility Season 001B is released, verified and closed. This audit did not reimplement it.

## Evidence credited

Season 001B records improvements and automated/browser/human checks for Chess Gym, Opening Database, Chess TV, Scanner, Analyze, navigation and EN/ES/PT presentation in Chromium, Firefox and WebKit. The production deployment remains on the reported checkpoint SHA. Accessibility-specific repository tests and release evidence are present.

## A11Y-001 - No unsupported whole-site conformance claim

A set of passing tests and targeted human checks does not establish that all 78 route destinations and every responsive/authenticated state conform to WCAG 2.2 AA. W3C conformance applies to full pages and their responsive variations. CAISSA should accurately say it has implemented and tested accessibility improvements, not that the whole service is certified compliant.

## Legal applicability

CAISSA is not a state/local government, so the ADA Title II web/mobile rule is not the direct standard. DOJ states that Title III applies to businesses open to the public and their online goods/services, while no detailed Title III web regulation specifies one technical standard. Whether a free personal online-only project is a covered public accommodation is a legal question. WCAG 2.2 AA remains the proportionate engineering benchmark and becomes especially important with commercialization, education/government partnerships or native apps.

## Ongoing control set

- Preserve keyboard access, visible focus, logical order and escape/return behavior.
- Give chessboards operable square semantics and nonvisual state/turn/move announcements.
- Label authentication, upload, consent, errors and status changes programmatically.
- Test mobile reflow, zoom, orientation, target size and safe-area behavior.
- Maintain contrast and avoid color-only meaning.
- Caption prerecorded video and provide text alternatives/transcripts as applicable.
- Validate EN/ES/PT labels and language attributes; untranslated strings are a quality risk.
- Test protected/authenticated states without disclosing real user data.
- Provide `privacy@caissa-chess.org` or a dedicated accessible contact path for barriers and track remediation.

## Future release gate

Any new payment, forum/chat, Junior, AI, tournament or native-app flow requires automated checks plus keyboard, screen-reader and mobile human testing before activation. Re-test after major component/framework changes. Preserve the 001B evidence rather than reopening the closed season.

## Primary sources

- [WCAG 2.2 W3C Recommendation](https://www.w3.org/TR/WCAG22/)
- [DOJ guidance on web accessibility and the ADA](https://www.ada.gov/resources/web-guidance/)
- [ADA Title II web/mobile regulations](https://www.ada.gov/law-and-regs/regulations/title-ii-2010-regulations/)
