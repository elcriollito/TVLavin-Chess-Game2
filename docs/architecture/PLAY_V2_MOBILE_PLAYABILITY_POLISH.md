# Play v2 Mobile Playability Polish

**Season:** 11.8.1A

**Implementation baseline:** `d313b76267403e7c644370db6c563197fc3ed5ae`

**Physical status:** **NOT CERTIFIED — PAUSED FOR MOBILE PLAYABILITY POLISH**

## Physical evidence boundary

The product owner physically observed an iPhone 17 Pro on iOS 26.6. Board-first hierarchy, EvaluationRail integration, Games/Bots/Coach visibility, Players omission, visible FICS and education-surface absence, portrait/landscape/portrait stability, zero horizontal document scrolling, smooth single-piece movement, and essential game/PostGame actions passed. Screenshots remain external evidence with their original filenames; no image is copied into the repository and no unavailable result is invented.

Open findings are `IPH-11.8.1-003` (provisional P1 CTA overlap), `IPH-11.8.1-004` (P2 excess top space), `IPH-11.8.1-005` (P2 excessive expanded setup), `IPH-11.8.1-006` (P2 missing collapsed summary), and `IPH-11.8.1-007` (provisional P1 bottom-chrome risk). This implementation is automated remediation evidence only and does not close any physical finding.

## Root causes and corrections

| Finding | Root cause | Local correction |
| --- | --- | --- |
| IPH-11.8.1-003 | The mobile Play CTA was fixed to the viewport while its content reservation was a separate constant. Semantic setup content could pass behind the CTA. | The sole CTA now participates in normal document flow. Its preceding disclosure rectangle must end before the CTA begins; no overlay spacer or duplicate CTA exists. |
| IPH-11.8.1-004 | The generic shell used the same application padding at every edge in addition to the genuine top safe area and context-header padding. | Stacked beta layouts retain `safe-area-inset-top` but reduce the duplicate application top pad and compact the setup heading. Visual viewport height/offset are observed by the shell without device sniffing. |
| IPH-11.8.1-005 | Seven single-line preset labels occupied a three-column grid and the complete setup was always expanded. | Phone time controls use a consistent four-column, two-line value/category presentation with 44px targets. All seven certified presets remain present. |
| IPH-11.8.1-006 | Games had no disclosure or derived selection summary. | A native `details`/`summary` owner displays live `time · category · color` wording derived from the selected radio values. It owns no form state and starts no game. |
| IPH-11.8.1-007 | The fixed CTA was positioned against layout-viewport bottom/safe-area values, which cannot guarantee clearance from changing Safari chrome. | Normal flow makes the CTA scroll-reachable rather than viewport-overlaid. Dynamic viewport resize still recalculates geometry; safe-area bottom padding and focus scroll padding remain bounded. |

## CTA and setup geometry contract

There is exactly one Games CTA. In setup state it is a normal-flow sibling following the setup disclosure and status. Therefore every visible or focusable setup rectangle ends at or before the CTA top. The shell reserves only genuine bottom safe-area padding and uses `scroll-padding-bottom` for focus navigation. Closing the disclosure removes its content from layout, so no obsolete spacer remains.

The phone setup defaults collapsed. Its summary updates immediately for every time and color selection, including truthful `Random` before submission. Expanded phone layout retains `1+0`, `2+1`, `3+0`, `3+2`, `5+0`, `10+0`, and `15+10`, native radios, Bullet/Blitz/Rapid labels, non-color selected borders, forced-colors treatment and 44px targets. The authoritative board remains singular and is not made sticky.

## PostGame hierarchy decision

`POSTGAME-UX-001` is implemented as `PlayV2PostGamePolicy@1.1.0`. The prior `PlayV2PostGamePolicy@1.0.0` Rematch-primary declaration remains frozen in the successor's history record.

The DOM and visual order is result, reason, opponent summary, full-width gold **Analyze This Game**, strong-secondary **Rematch** and **New Game**, optional-secondary **Review with Mentor**, then Copy/Download/consent-controlled Save PGN utilities. Analyze remains an explicit opaque completed-record continuation. Automatic Analyze, automatic Mentor, remote upload, Academy, education recommendations and analytics transport are prohibited.

## Automated evidence

The dedicated responsive owner covers 320×568, 360×640, 390×844, 402×874, 430×932, tablet portrait/landscape, 1440×900, 1920×1080, 2560×1440 and 3840×2160. It uses `getBoundingClientRect()` to check CTA/setup separation, touch height, document overflow, one-board ownership, preset readability, live summary and PostGame DOM/hierarchy. Safari-chrome-shortened and rotation-equivalent viewports are included. Chromium and WebKit results, accessibility checks, regression selections and screenshot paths are recorded in the manual-review report after execution.

## Remaining physical cases

Physical retest is still required for all five findings under real expanded/collapsed Safari chrome, rotation, safe areas and focus scrolling. Promotion, all clocks/increments, every color/preset, PGN platform behavior, Mentor navigation, Worker lifecycle, background suspension, Reduce Motion, zoom/reflow, direct Players rejection, final logs/CSP and separately authorized assistive-technology testing remain unexecuted where not already attributed. No VoiceOver or complete physical certification claim is made.
