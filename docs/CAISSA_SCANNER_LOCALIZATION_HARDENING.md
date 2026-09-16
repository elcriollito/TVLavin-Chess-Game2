# CAISSA Scanner — Real-World Localization Hardening

Status: **PHASE 3-004B COMPLETE — MORE LOCALIZATION HARDENING REQUIRED**

Visual changes authorized and made: **NONE**

This record covers board localization only. It does not evaluate piece classification, activate a model, change Scanner routing, or establish overall superiority over another product.

## 1. Immutable corpus identity

Corpus version: `scanner-localization-hard-v0.1`

- Source manifest: `manifest-starter.json`
- Source manifest SHA-256: `DFE01F52B20BAF38ED5BF680B4A929E49D231CE0A1F2F69F8433C6257F7E1304`
- Annotation manifest: `localization-hard-v0.1.annotated.json`
- Annotation manifest SHA-256: `EEA230D23C0BC608784B20542A4EC5B2FAA7F533E1EC427E62985BB4720708A7`
- Annotation schema: `caissa-scanner-localization-annotations/1`
- Samples: 14/14 board-positive images
- Corner order: TL → TR → BR → BL of the playable 8×8 field
- Certification: all original image checksums matched; every annotation was verified, finite, normalized to `[0,1]`, convex, non-self-intersecting, and consistent with source dimensions.

The source corpus and Alexander's annotation manifest are external immutable inputs. The repository contains only a derived split/checksum manifest and generated JSON result artifacts; it contains no corpus image bytes and does not rewrite the external inputs.

## 2. Deterministic split

The split was fixed before baseline evaluation.

Development (10):

- `cv-failure-001-old-newspaper-mackenzie-97`
- `cv-success-001-ui-overlay-board`
- `cv-success-003-lichess-endgame-photo`
- `cv-success-004-lichess-complex-screen-photo`
- `cv-success-005-puzzle-diagram-no-kings`
- `cv-success-006-printed-book-classic-diagram`
- `cv-success-007-printed-skewer-hatched`
- `cv-success-009-small-printed-diagram-in-page`
- `cv-success-010-digital-board-photo-with-ui`
- `cv-success-011-printed-driving-off`

Holdout (4):

- `cv-failure-002-old-newspaper-problem-196` — degraded print
- `cv-failure-003-3d-videogame-board` — 3D board
- `cv-success-002-lichess-photo-of-screen` — digital/photo of screen
- `cv-success-008-printed-perspective-sparse` — perspective/hatched print

The holdout was not used during tuning. It was evaluated once after detector behavior and tests were frozen, and the detector was not modified afterward.

## 3. Quality policy

Buckets are engineering thresholds, not probabilities:

| Bucket | Normalized corner RMSE | Worst normalized corner |
| --- | ---: | ---: |
| excellent | ≤ 0.012 | ≤ 0.020 |
| acceptable | ≤ 0.030 | ≤ 0.050 |
| review-needed | ≤ 0.060 | ≤ 0.100 |
| failed | above either review threshold | above either review threshold |

Only excellent and acceptable count as `localizationAccepted`. Returning a homography is not by itself a successful localization.

## 4. Baseline

Baseline implementation: commit `d0d9a736c355d15cee09750d859dc3c147380124`, localizer version `/1`.

| Scope | Found | False negative | Accepted | Wrong board | Ambiguity | Homography | Geometry contract | Median latency |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| All 14 | 0% | 100% | 0% | 0% | 0% | 0% | 0% | 27.167 ms |
| Development 10 | 0% | 100% | 0% | 0% | 0% | 0% | 0% | 26.252 ms |
| Holdout 4 | 0% | 100% | 0% | 0% | 0% | 0% | 0% | 35.445 ms |

Corner accuracy was unavailable because no board was returned. Every sample failed as `board-not-found`, classified at the `candidate-score-too-low` stage. The baseline all-sample mean latency was 31.118 ms and worst latency was 65.430 ms on `cv-failure-001-old-newspaper-mackenzie-97`.

## 5. Generalizable hardening changes

### Bounded periodicity candidate recovery

- Observed pattern: annotated playable fields scored well when supplied directly, but connected-edge components did not generate their quadrilaterals.
- Change: add a bounded multi-scale axis-aligned search on a 32×32 scoring surface, retain eight diverse seeds, then refine each corner with decreasing deterministic step sizes.
- Generalization: searches geometry and 8×8 periodicity rather than filenames, colors, piece art, or coordinates.
- Risk: more CPU time and checker-like false positives.
- Protection: fixed analysis dimensions, seed cap, candidate cap, generic-grid/stripe/plain-image negatives, and deterministic-output tests.

### Checker-prioritized scoring

- Observed pattern: internal page/UI edges could outrank the annotated playable field while the correct field had stronger alternating parity.
- Change: candidate weights became 0.30 grid, 0.55 checker, 0.10 geometry, and 0.05 edge evidence.
- Generalization: checker parity applies across digital colors, monochrome print, highlights, and hatched squares.
- Risk: pieces or nonuniform lighting can weaken parity.
- Protection: grid, checker, total-score, and geometry requirements remain independent.

### Search-only fail-closed boundary rules

- Observed pattern: coarse search could stretch a cropped board into a complete quadrilateral.
- Change: reject search candidates too close to the image boundary or lacking measurable evidence across any outer side.
- Generalization: detects missing external support rather than recognizing a fixture.
- Risk: complete boards photographed extremely tightly may abstain.
- Protection: legacy component candidates remain eligible; the real development set and full synthetic suite were rerun.

### Safer selection and diagnostics

- Candidate score threshold increased from 0.50 to 0.60 after development evidence showed that lower-scored selections were wrong.
- Overlapping candidates are deduplicated by corner proximity and bounding-box overlap.
- Candidate summaries now retain outer-boundary and rectified-evidence diagnostics.
- Corpus certification, evaluator metrics, failure taxonomy, split reporting, and deterministic report merging are tested independently.

## 6. Hardened development result

Detector identity: `caissa-scanner-board-localizer/2`; implementation file SHA-256 `50DD073EE74C580661C0962273AA02D109BC7DAB7680CA4BE7FC9CBF492E9696`.

- Board found: 70% (7/10)
- False negatives/abstentions: 30% (3/10)
- Accepted localization: 40% (4/10)
- Wrong-board selection: 0%
- Multiple-board ambiguity: 10% (1/10)
- Detected-corner mean normalized RMSE: 0.024480
- Detected-corner median normalized RMSE: 0.016105
- Worst detected sample: `cv-failure-001-old-newspaper-mackenzie-97`, RMSE 0.053697
- Worst corner error: 0.059051
- Homography success: 70%
- Geometry-contract pass: 70% overall and 100% of returned boards
- Quality: 3 excellent, 1 acceptable, 3 review-needed, 3 failed
- Latency: mean 436.113 ms, median 434.274 ms, worst 498.595 ms

Development failures were two `candidate-score-too-low`, one `multiple-board-candidates`, and three returned-but-`corner-position-error` review cases. No development image selected a failed wrong board after the fail-closed threshold was frozen.

## 7. Final holdout result

The holdout was run once. No detector change followed.

- Board found: 100% (4/4)
- False negatives: 0%
- Accepted localization: 25% (1/4)
- Wrong/outer board selection: 75% (3/4)
- Multiple-board ambiguity: 0%
- Mean normalized RMSE: 0.062978
- Median normalized RMSE: 0.074306
- Worst sample: `cv-failure-003-3d-videogame-board`, RMSE 0.090058
- Worst corner error: 0.125236
- Homography success: 100%
- Geometry-contract pass: 100%
- Quality: 0 excellent, 1 acceptable, 0 review-needed, 3 failed
- Latency: mean 465.005 ms, median 460.869 ms, worst 485.789 ms

Per sample:

| Sample | Result | RMSE | Failure |
| --- | --- | ---: | --- |
| old newspaper problem 196 | failed | 0.074581 | wrong-board-selected |
| 3D videogame board | failed | 0.090058 | outer-frame-selected |
| Lichess photo of screen | acceptable | 0.013243 | none |
| printed perspective sparse | failed | 0.074030 | wrong-board-selected |

This result is a major generalization warning: detection rate alone would misleadingly report 100%, while playable-field corner truth accepts only one holdout image.

## 8. Before/after comparison

| Metric | Baseline all 14 | Hardened all 14 |
| --- | ---: | ---: |
| Board found | 0% | 78.5714% |
| False negative | 100% | 21.4286% |
| Accepted localization | 0% | 35.7143% |
| Wrong/outer board selected | 0% | 21.4286% |
| Ambiguity | 0% | 7.1429% |
| Mean detected RMSE | n/a | 0.038479 |
| Median detected RMSE | n/a | 0.031950 |
| Worst corner error | n/a | 0.125236 |
| Homography success | 0% | 78.5714% |
| Geometry-contract pass | 0% | 78.5714% |
| Median total geometry latency | 27.167 ms | 446.616 ms |

All-sample hardened quality was 3 excellent, 2 acceptable, 3 review-needed, and 6 failed. Candidate recovery improves recall substantially but costs CPU and does not yet generalize safely to difficult printed/3D bounds.

## 9. Category findings

- Digital/photo-of-screen: 4/5 accepted, one deliberate ambiguity, no wrong-board selection; mean detected RMSE 0.011863.
- Degraded print: both boards found, neither accepted; one review-needed and one wrong-board selection.
- Hatched print: 2/3 found, none accepted; one review-needed, one wrong-board selection, one abstention.
- Printed diagram: 1/2 accepted; one abstention.
- Small board in page: found but review-needed at RMSE 0.031950.
- 3D board: outer frame selected; this category is outside the current MVP evidence boundary.

The 14-image corpus is board-positive. Real false-positive performance remains incomplete until a lawful real hard-negative corpus is added. Existing synthetic negatives pass separately and must not be presented as real false-positive measurement.

## 10. Playable grid versus outer frame

All metrics use Alexander's playable 8×8 corners, never a decorative frame, coordinate border, browser rectangle, or page boundary. The evaluator classifies a materially oversized returned quadrilateral as `outer-frame-selected`. Synthetic fixtures protect board-with-page geometry and reject partial boards, single rectangles, stripes, plain images, and non-checker grids. The sealed 3D holdout still selected an outer frame, proving this distinction needs further hardening.

## 11. Chessvision context

Chessvision metadata is contextual and is not a ranking:

- CAISSA accepted five localization samples whose Chessvision reference outcome was success.
- CAISSA found the development newspaper board where the Chessvision record was a piece-level misread, but CAISSA's corners were only review-needed; this is not an overall recognition win.
- Both systems failed the 3D case at the declared localization-quality boundary; CAISSA returned the wrong outer frame while Chessvision recorded board-not-found.
- Chessvision success on printed cases does not rescue CAISSA's failed playable-bound localization.

No piece/FEN comparison is made here.

## 12. Performance and memory

Final median total geometry latency was 434.274 ms on development and 460.869 ms on holdout. Worst final latency was 498.595 ms on the development newspaper sample. Reports separately retain `localizationMs`, `candidateScoringMs`, `homographyMs`, `geometryValidationMs`, and `totalGeometryMs` per sample.

Memory remains bounded by the existing runtime contract: maximum 256×256 luminance/edge analysis surfaces, a 32×32 search surface, eight retained search seeds, 12 diagnostic candidates, an 80×80 final scoring surface, and one 512×512 RGBA canonical board. Physical-iPhone latency and memory remain uncertified.

## 13. Artifacts and commands

Immutable-derived manifest:

- `scanner/recognition/benchmark/manifests/scanner-localization-hard-v0.1.json`

Generated reports:

- `artifacts/scanner-localization-hard-v0.1/baseline-localization-v0.1.json`
- `artifacts/scanner-localization-hard-v0.1/hardened-development-localization-v0.1.json`
- `artifacts/scanner-localization-hard-v0.1/hardened-holdout-localization-v0.1.json`
- `artifacts/scanner-localization-hard-v0.1/hardened-localization-v0.1.json`

Commands:

```powershell
npm run benchmark:scanner:localization-real -- --label=<label> --split=<development|holdout> --checkpoint=<identity> --output=<path>
npm run benchmark:scanner:localization-real:merge
```

## 14. Readiness decision

**MORE LOCALIZATION HARDENING REQUIRED**

The digital/photo-of-screen category is promising, and the geometry contract remains exact, but the sealed holdout's 75% wrong/outer-board rate is not trustworthy enough for a classifier baseline across declared printed and 3D categories.

Next task: **PHASE 3-004C — TARGETED REAL-WORLD LOCALIZATION HARDENING**. The new task must preserve this holdout result as evidence, add or reserve fresh evaluation data before any further tuning, address playable-field-versus-frame discrimination and perspective/hatched print, and add real hard negatives.

**VISUAL-FREEZE exception requires Alexander's explicit approval.**
