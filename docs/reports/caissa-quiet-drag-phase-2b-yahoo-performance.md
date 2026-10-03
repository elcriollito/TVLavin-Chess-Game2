# CAISSA Quiet Drag Phase 2B — Yahoo Classic Performance

## Method

- Date: 2026-10-02
- Route: `/yahoo-classic?quiet-drag-lab=1`
- Browser: Playwright Chromium
- Viewport: 1440 × 900
- Position: standard initial position, white to move
- Input: 145 movement samples over 36 display frames
- Comparison: the same Yahoo Chessboard.js instance and FICS callback seam, switching only the localhost A/B selector between Legacy Drag and Quiet Drag
- Lifecycle precondition: 10 CAISSA Lobby → Tournament Hall → CAISSA Lobby cycles before measurement
- Trace categories: `devtools.timeline`, `toplevel`, and `blink.user_timing`

## BEFORE / AFTER

| Measure | Legacy Drag (before) | Quiet Drag (after) |
| --- | ---: | ---: |
| Pointer events | 145 | 145 |
| Visual writes | 66 | 37 |
| Frames requested | 36 | 37 |
| Geometry reads in movement instrumentation | 0 | 0 |
| Forced layouts in trace | 30 | 0 |
| Style recalculations | 30 | 36 |
| Paints | 75 | 0 |
| Movement handler CPU | 4.300 ms | 3.800 ms |
| Movement pipeline main-thread total | 73.097 ms | 9.055 ms |
| Event → visual average | 13.692 ms | 15.236 ms |
| Event → visual p95 | 15.800 ms | 16.000 ms |
| Frame p95 | 16.800 ms | 16.800 ms |
| Cursor/piece temporal separation p95 | 111.827 px | 0 px |
| Long tasks | 0 | 0 |
| Adapter listener count after room cycles | 5 | 5 |
| Legacy input attached | yes | no |

## Contract result

Quiet Drag met the technical performance targets in this run:

- zero forced layouts during the traced movement interval;
- zero geometry reads attributed to the movement hot path;
- 37 visual writes for 37 requested frames (maximum one write per frame);
- zero paints recorded during the movement interval;
- zero long tasks;
- stable five-listener pointer controller after the required room cycles; and
- vendor legacy input detached while Quiet Drag was selected.

The event-to-visual timing remained within one display frame. The material improvement was removal of the legacy layout/paint pipeline and reduction of cursor/piece temporal separation to zero in the sampled frames.

This measurement is repeatable through `tests/browser/yahoo-classic-quiet-drag-performance.spec.js`. It supports the technical gate but does not replace human feel approval.
