# CAISSA Scanner — Real-World Localization Hardening

Status: **PHASE 3-004C EVALUATED — MORE LOCALIZATION HARDENING REQUIRED**

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

## 15. PHASE 3-004C — v0.2 development corpus and sealed evaluation

The v0.1 ground truth and its 10/4 split were not changed. `scanner-localization-hard-v0.2-dev` references the ten checksum-verified v0.1 **development** positives and adds six deterministic developer-created positive analogues (strong-perspective print, thick coordinate frame, low-contrast print, diagonal hatching, digital highlights, and a small board in a page) plus six developer-created hard negatives (plain field, stripes, generic grid, empty frame, 10×10 non-chess checker, and webpage/table panels). The generator source, manifest, and each generated RGBA input are SHA-256 identified in the development report. No newly found local image was silently added; there are **zero real-world negative images** in this version. Thus real-world false-positive and true-negative rates are **not measurable** here; the synthetic-negative results must not be presented as a real-world rate.

The detector version is `caissa-scanner-board-localizer/3`. It adds rectified-space grid-phase support at all seven internal divisions on both axes, trimmed directional sampling that tolerates local highlights/hatching, balanced outer-border evidence, a bounded four-ratio playable inset search, bounded two-candidate corner refinement, and a fail-closed check for an 8×8 crop cut out of a larger periodic grid. The last check was motivated by the synthetic 10×10 negative, which initially caused a false positive. Rejected candidates are no longer allowed to suppress an overlapping accepted candidate during deduplication. These are geometric rules, not sample-ID or image-specific exceptions. The analysis edge remains 256 pixels in the runtime; 320 and 384 were benchmarked only.

Wrong-board selection has a higher operational cost than board-not-found: a plausible but incorrect quadrilateral would poison all 64 downstream piece crops. A failed or ambiguous result is therefore treated as a safe abstention, not as successful localization. Successful returns still use the existing homography and exact 64 equal, gapless, non-overlapping squares.

### Development results (256-pixel analysis edge)

| Evidence set | Positive | Negative | Found positives | Accepted positives | Wrong positives | False positives | True negatives |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Real v0.1 development | 10 | 0 | 6/10 | 3/10 | 0/10 | n/a | n/a |
| v0.2 synthetic analogues | 6 | 6 | 6/6 | 6/6 | 0/6 | 0/6 | 6/6 |

Real development had two typed ambiguities and two score-based no-board results. Three returned boards needed corner review. Relative to 3-004B, real accepted localization declined from 4/10 to 3/10; no real development wrong-board case was introduced. The synthetic hard-negative false-positive rate is 0/6 (0%) and true-negative rate 6/6 (100%), **synthetic only**. The previous false positive on the 10×10 checker was eliminated by grid-continuation abstention.

Analysis-edge comparison on the same ten real development positives:

| Edge | Found | Accepted | Wrong | Mean total geometry latency |
| ---: | ---: | ---: | ---: | ---: |
| 256 | 6/10 | 3/10 | 0/10 | 855.074 ms |
| 320 | 6/10 | 2/10 | 1/10 | 802.326 ms |
| 384 | 5/10 | 3/10 | 1/10 | 922.884 ms |

Changing search resolution changes the discrete hypotheses; higher resolution is not monotonically better and was not adopted. The synthetic 256/320/384 runs had 6/6, 5/6, and 6/6 accepted positives respectively, zero wrong positives, and zero false positives among six negatives at each edge. On the ten real development positives, a benchmark-only global 5th–95th-percentile contrast stretch raised acceptance to 5/10 but also caused 1/10 wrong-board selection. It was **not enabled**. This leaves real degraded/hatched print preprocessing unresolved.

Mean 256-edge synthetic timing across 12 inputs was 550.899 ms candidate generation, 17.250 ms final periodicity scoring, 2.406 ms inset refinement, 16.458 ms corner refinement, 1.142 ms homography, and 588.282 ms total geometry. Mean real-development timing across ten inputs was 750.402 ms candidate generation, 22.163 ms periodicity scoring, 0.050 ms inset refinement, 51.765 ms corner refinement, 30.383 ms homography, and 855.074 ms total geometry. Candidate generation remains the dominant cost; these Node/Sharp wall times are not physical mobile-Safari measurements. Search remains bounded by the existing eight seeds and twelve candidates; refinement is fixed-size and deterministic. No WebGPU, SharedArrayBuffer, server fallback, OCR, ML, image upload, telemetry, or training capture was added.

### Final sealed v0.1 holdout — one run only

The original four holdout image pixels were not inspected or used to adjust the detector during development. After the algorithm and tests were frozen, the holdout split was evaluated **once** at 256 pixels. There were no detector changes afterward.

| Sample | 3-004C bucket | RMSE | Failure taxonomy |
| --- | --- | ---: | --- |
| old newspaper problem 196 | review-needed | 0.057690 | corner-position-error |
| 3D videogame board | failed | 0.096980 | outer-frame-selected |
| Lichess photo of screen | excellent | 0.010766 | none |
| printed perspective sparse | failed | 0.074308 | wrong-board-selected |

Board found was 4/4; accepted localization 1/4; wrong/outer selection **2/4 (50%)**, down from the prior 3/4 (75%) but still unacceptable. Mean detected RMSE was 0.059936; worst normalized corner error 0.136496. All four returned homographies passed the 64-square geometry contract, but geometric validity cannot make incorrect corners acceptable. The 3D category is **DEFERRED / OUTSIDE MVP**. The current detector still returns an outer frame there, so simply labelling 3D unsupported does not yet make runtime behavior safe. The strong-perspective printed case likewise remains unsupported for automatic localization. This holdout result is not a threshold-tuning set for this task.

### Verification and readiness

`npm run test:scanner:localization` passed 31/31 focused localization/evaluator tests. `npm run verify:scanner` passed 7 visual-contract, 22 unit, 17 benchmark, 31 localization, 13 runtime, and 96 three-browser checks (186 total). `git diff --check` passed. No public Scanner UI file was changed; the certified visual contract is intact. **VISUAL-FREEZE exception requires Alexander's explicit approval.**

Readiness decision: **MORE LOCALIZATION HARDENING REQUIRED**. A 50% wrong/outer-board rate on the sealed holdout fails the near-zero target, despite the synthetic-negative pass and improvement on degraded newspaper print. Next task: **PHASE 3-004D — LOCALIZATION HARDENING / SUPPORT-BOUNDARY DECISION**. Add lawful real negatives and a fresh, independently reserved evaluation split before further tuning; resolve or explicitly gate unsupported 3D and strong-perspective print without using these four sealed images as a development loop. Do not integrate the classifier, merge, or deploy production on this evidence.

## 16. PHASE 3-004D — certified v0.3 support boundary

The immutable `scanner-localization-hard-v0.3` corpus contains 33 verified positives, 13 verified board-absent hard negatives, and 33 reference screenshots. Starter schema: `caissa-scanner-localization-starter/3`; annotation schema: `caissa-scanner-localization-annotations/1`. Starter SHA-256: `46700321AFDF531D3D295CC7B31EFC0CFD59DFA68833C505208B0ADC65AD44F1`; annotated SHA-256: `D059F172747921D6D5AEF3106099ABCF6C8553074E4961ACDA626C2312248BA6`. All source/reference bytes were rehashed; 33 playable-field quadrilaterals passed finite, bounds, normalized-coordinate, and convexity checks and were visually checked against the playable 8×8 field. Neither source manifest nor image bytes changed.

Positive IDs `real-v03-positive-020`–`033` (14) exactly overlap v0.1 by SHA-256 and are `legacy-overlap`, never fresh evaluation. The 19 fresh positives and 13 negatives have a frozen 21/11 development/evaluation split: development 13 positives + 8 negatives; evaluation 6 positives + 5 negatives. `localization-v03-split.js` records all groups, keeping positives 002–003 (same session) and 013–014 (mobile theme), and negatives 003–004 (grid paper), 006–009 (notebook family), and 010–011 (rectangular layout) together. Evaluation IDs are positives 004, 008, 012, 013, 014, 019 and negatives 002, 005, 007, 010, 011. This split was fixed before detector benchmarking. The old sealed v0.1 holdout was not rerun or tuned on.

### Development changes and decision policy

The pre-change `/3` baseline found 11/13 development positives with no wrong/outer corners, but automatically accepted 5/8 real negatives (62.5% false-positive rate). One checkers negative has chess-crown discs and excellent 8×8 scores: localization geometry cannot establish chess identity. The `/4` localizer retains distinct candidate, grid, checker, grid-phase, geometry, playable-field, outer-frame-risk, and perspective-risk signals. Bounded symmetric and one-side inset trials are used only when grid/phase evidence materially improves. Strong perspective, weak phase, outer-frame risk, and candidate ambiguity cannot become automatic acceptance. Without independent chess-identity evidence, a plausible geometry candidate is `review-needed`; no classifier exists in this phase. The Worker forwards this metadata without changing public UI or the existing rectification seam. `board-not-found`, `multiple-board-candidates`, and `deferred-unsupported` remain distinct. These scores are diagnostics, not probabilities; later consumers must not portray review candidates as auto-approved chessboards.

These changes address frame-versus-field, phase, perspective, and non-chess-grid ambiguity without sample-specific rules. A development-only global 5th–95th percentile contrast-stretch probe recovered one ambiguous positive but introduced one wrong-board selection (positive 015; 1/13), so it was rejected. The frozen configuration uses no preprocessing. Adaptive edge fusion, denoise, and local luminance normalization were not enabled without evidence they preserve the zero-wrong-board boundary. No OCR, classifier, server inference, WebGPU, SharedArrayBuffer, upload, telemetry, or training capture was added.

### Development and fresh sealed evaluation

| Measure | Baseline development | Hardened development | Fresh evaluation |
| --- | ---: | ---: | ---: |
| Fresh positives / negatives | 13 / 8 | 13 / 8 | 6 / 5 |
| Positive geometry found | 11/13 | 11/13 | 6/6 |
| Wrong / outer positive corners | 0 / 0 | 0 / 0 | **0 / 0** |
| Ambiguous positives | 2 | 2 | 0 |
| Negative geometry candidates | 5/8 | 5/8 | 2/5 |
| Negatives auto-accepted | 5/8 | 0/8 | 0/5 |
| Positive boards auto-accepted | 11/13 | 0/13 | 0/6 |
| Median positive normalized corner RMSE | 0.006 | 0.006 | 0.017 |
| Worst normalized corner error | 0.023907 | 0.023907 | 0.034237 |
| Homography / 64-square pass, positives | 11/13 | 11/13 | 6/6 |

Fresh wrong-board rate is **0/6 (0%)**. Safe-decision false-positive rate is **0/5 (0%)** and true-negative rate **5/5 (100%)**, but these are conservative *auto-acceptance* measures: 2/5 negatives still yield reviewable geometry candidates. There is **zero autonomous positive acceptance** in this phase. The fresh geometric false-candidate rate is 40%; it is not hidden by the safe decision rate. Wrong or outer-board selection is costlier than abstention because it corrupts all downstream square crops.

Fresh category results: digital-2d 5/5 found, 0 wrong, median normalized RMSE 0.014; printed 1/1 found, 0 wrong, RMSE 0.029079 (near the 0.03 acceptable limit); checkers-board and checker-pattern negatives each yielded review candidates; grid paper and both rectangular-layout negatives were not found. The single development livestream image remained ambiguous. The development printed image was localized at RMSE 0.008. No fresh 3D evidence exists; the historical 3D outer-frame failure remains a warning, and 3D is **DEFERRED / OUTSIDE MVP**. Severe occlusion, extreme perspective, and tiny ambiguous livestreams are also deferred pending evidence.

**SUPPORTED for classifier-baseline candidate generation:** digital-2d web/mobile boards. **SUPPORTED-WITH-REVIEW:** the small printed cohort. **DEFERRED:** 3D and the high-risk conditions above. These labels do not authorize automatic acceptance. Readiness decision: **ADEQUATE FOR CLASSIFIER BASELINE ON SUPPORTED CATEGORIES**, provided the geometry-candidate/review-only identity boundary remains intact. Next task: **PHASE 3-005 — HISTORICAL TFJS BASELINE REPRODUCTION + REAL BENCHMARK**. Automatic acceptance requires independently benchmarked identity evidence against these negatives.

The frozen localizer SHA-256 is `83495B446583DA4B966EC0C0CE1DE4C944DE74EB092C1883706F31A3C5768FE2` (`/4`, analysis edge 256, no preprocessing). Evaluation ran once after freeze, with no subsequent detector change. Fresh evaluation median total geometry latency was 927.710 ms overall (positive median 576.126 ms), worst 1180.740 ms; one hardened development run had median 1224.546 ms. Per-sample reports retain candidate-generation, periodicity, inset, corner-refinement, homography, geometry-validation, and total timing. These environment-dependent wall times are not deterministic or physical-iPhone measurements; sample ordering, decisions, split, and checksums are deterministic. Analysis/candidate memory remains bounded; eight fixed inner trials are added for the selected candidate. All returned boards have 64 identical gapless non-overlapping squares, which alone cannot prove corner correctness.

Reports: `artifacts/scanner-localization-hard-v0.3/development-baseline.json`, `development-contrast-probe.json` (rejected), `development-hardened.json`, `final-evaluation.json`, and `support-boundary.json`. The read-only benchmark command is `node tools/run-scanner-localization-v03.mjs --split=development --label=<name>`; evaluation/legacy modes additionally require the frozen localizer SHA. Source manifest checksums are verified on each run. No public Scanner UI changed. **VISUAL-FREEZE exception requires Alexander's explicit approval.**
