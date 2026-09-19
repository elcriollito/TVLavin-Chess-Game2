# CAISSA Scanner Phase 3-007B — dataset and architecture revision

Status: offline experimental work; no Scanner runtime or public UI integration. Product scope remains 2D.

## Root-cause audit, completed before v0.2 training

The [read-only v0.1 audit](../artifacts/scanner-piece-classifier-v0.2/root-cause-audit.json) binds the frozen v0.1 checkpoint and certified synthetic RGB64 cache. Its only fresh model inference uses the two **validation** families; the previously published synthetic-test and real-board numbers are descriptive aggregates, not training or selection inputs.

Evidence:

- Training prior is 1,680 empty / 1,680 occupied (50.0%). The 31-board real cohort has 1,235 / 1,984 true empty squares (62.25%). Each v0.1 occupied class, including black king, has 140 training examples (4.17% of all training tiles); true black king is 31 / 1,984 (1.56%) in the real cohort. This is a prior mismatch, not proof that it alone caused errors.
- v0.3 does have 17 empty augmentation types and 10 board themes. Thus the failure cannot be attributed to *absence* of basic highlight, arrow, coordinate, moiré, print, wood or glare examples. The generation policy generally isolates one bounded effect per tile; combined effects, edge/border/UI artifacts and shadow diversity are less directly represented. The v0.4 expansion deliberately tests this gap rather than asserting a cause.
- v0.1 predicts **zero** empty→occupied on either validation family. Its largest empty occupancy probability is ~0.00151 and largest empty→black-king probability ~0.000144. Validation black-king predictions match 40 true black kings exactly. The old unseen synthetic test still has zero empty→occupied but predicts 74 black kings for 40 true black kings. The real benchmark has 248 empty→occupied, including 134 empty→black-king, and predicts 350 black kings for 31 true. This supports a substantial synthetic-to-real background shift and an unseen-style king sink; it does **not** identify one pixel-level causal feature.
- Class indices, sample labels, synthetic preprocessing, and output ordering are consistent (`k` is index 12). Equal black/white support and unweighted 13-class cross-entropy rule out a deliberate black-king class weight. These checks make a simple label-mapping or class-weight bug unlikely, not impossible. Distinct per-family silhouettes and king/non-king confusion remain a generalization concern.
- Real Brier 0.5589, ECE 0.2096 and 144 wrong predictions at ≥0.90 confidence indicate excessive confidence under shift. Temperature scaling can adjust stated probabilities but cannot fix the underlying ordering or empty→piece errors.

The audit therefore motivates a **controlled intervention**, not a claimed proven cure: add compositional empty negatives and compare a prior-adjusted single-head control against a hierarchical occupancy/color/type head under matched data, with a balanced-prior multi-head ablation. Preserve separate whole-family validation and test. The prior 31-board truth and images are barred from training, model selection, loss-weight selection and calibration.

## Pre-registered v0.2 experiment

`scanner-piece-dataset-v0.4` derives solely from certified v0.3 synthetic RGB64 tiles. It retains all eleven families and the 7/2/2 whole-family split. Each original empty receives one additional deterministic, bounded 2D variant from twelve subtype slots: plain, highlighted, arrow-overlay, coordinate-edge, border, print-texture, glare, moiré, compression, hatched, UI-overlay and shadow. The 10 existing themes include wood and low-contrast print. No occupied identity is transformed, no source family is reclassified, and no real-board pixels are opened. The new cache has 7,920 tiles: train 5,040, validation 1,440, test 1,440. Each split is now two-thirds empty, near (but not fitted to) the descriptive real occupancy prior. Train-only hard negatives are separately tagged; validation and test have corresponding subtype coverage from their own families. This is synthetic diversity, not a proprietary-platform screenshot dataset.

Before any test-family or real inference, the bounded matrix is:

1. `single-realistic`: original compact 13-logit CNN; v0.4 natural 2:1 empty/occupied sampling.
2. `multi-realistic`: shared compact CNN with occupancy, occupied-only color and occupied-only six-way type heads; natural 2:1 sampling.
3. `multi-balanced`: identical multi-head architecture and loss; 1:1 balanced occupancy sampling as a prior ablation.

Each variant uses two fixed training seeds. All selection and temperature fitting use **validation only**; one configuration/checkpoint is then frozen and hashed before a single v0.4 unseen-family synthetic test and a single human-corner real 31-board benchmark. The canonical output remains `empty,P,N,B,R,Q,K,p,n,b,r,q,k`. The hierarchical softmax product assigns empty probability from the occupancy head and each occupied class probability from occupancy × color × type; argmax requires simultaneous occupancy and identity evidence. Color/type losses are masked on empty. The benchmark reports the occupancy head independently and records uncertainty signals without changing Scanner runtime.

The builder ran three independent times into separate external directories. Metadata SHA-256 was `50DB29018B2B48AA34D940DC1FC4E2121EE690F2B6E2DD495C06A556367F860F` and RGB64 pixels SHA-256 was `36AC185585907C03CA705B35D6530F3918840A0194B396E8D12A414359920AFB` on **all three** runs. The [v0.4 certification](../artifacts/scanner-piece-classifier-v0.2/dataset-certification.json) records per-split support and source identity. Across 11 families there are 2,640 new empty tiles; 2,420 are tagged hard negatives. No original corpus or recovered archive was changed.

## Controlled training and validation selection

AdamW (learning rate 0.001, weight decay 0.0001), batch 128, maximum 28 epochs, patience five, deterministic seeds 1801 and 1802 were fixed in [config-v0.2](../scanner/recognition/classifier-revision/config-v0.2.json). The shared multi-head loss was `1.5 CE(occupancy) + 0.75 CE(color | occupied) + 1.0 CE(type | occupied)`; empty tiles contribute **no** color or type loss. Single-head control used ordinary 13-class cross-entropy. The canonical probability vector is `(P(empty), P(occupied)×P(white)×P(type 1..6), P(occupied)×P(black)×P(type 1..6))`, with 13-class argmax. This composition makes a weak occupancy head suppress all piece classes. It is not a deployed runtime threshold.

Validation score was preregistered as occupied macro-F1 + occupancy F1 + 0.25×color accuracy + 0.25×type macro-F1 − 2×hard-negative false-positive rate − 0.1×excess predicted black kings per tile. Lower validation NLL broke ties. Six runs:

| Variant | Seed | Best epoch | Validation score | Occupied macro-F1 | Empty false positives |
| --- | ---: | ---: | ---: | ---: | ---: |
| single-realistic | 1801 | 5 | 1.9165 | 0.5372 | 0 |
| single-realistic | 1802 | 21 | 2.3432 | 0.8772 | 0 |
| multi-realistic | 1801 | 9 | 2.3241 | 0.8570 | 0 |
| **multi-realistic** | **1802** | **8** | **2.4501** | **0.9600** | **0** |
| multi-balanced | 1801 | 3 | 2.3203 | 0.8533 | 0 |
| multi-balanced | 1802 | 7 | 2.3831 | 0.9063 | 0 |

The selected `multi-realistic` model has **649,706 parameters**, native checkpoint 2,622,565 bytes (2,425,832 gzip-compressed), and TorchScript 2,676,264 bytes (2,452,498 compressed). The weights SHA-256 is `13EE19030FAA5DFA99FF7B94E42749D1ED7ED7AB2AB96C57AF6EE0076E20DB7C`; TorchScript SHA-256 is `042B62179589A1CF3CB28C561A4D21DEDE36B89A25830AC24001DBCA0A235BFF`. The model, architecture, class order, input format, argmax policy and validation-fitted temperatures were frozen before unseen-family or real evaluation. Large checkpoints and the truth-free real prediction bundle are outside Git at `C:\Users\ALEXANDER\Alexander Projects\caissa\_scanner\_model_artifacts\phase3-007b-v0.2`.

Validation-only NLL chose temperature **0.75** for each of occupancy, color and type; the grid was `[0.75,1,1.5,2,3,4,6]`. On 1,440 held-out validation tiles, raw and calibrated 13-class accuracy are **98.68%**, occupied macro-F1 **0.9600**, occupancy precision/recall/F1 **1/1/1**, piece type **96.04%**, and color **100%**. Validation NLL improves from 0.0433 to 0.0331 and ECE from 0.0186 to 0.0124. Celtic scores 99.44% square accuracy / 0.9833 macro-F1; Livius 97.92% / 0.9344. These synthetic results still overstate transfer to real input.

## Frozen unseen-family and real evaluation

The selected checkpoint was tested once on 1,440 unseen-family v0.4 synthetic tiles. Raw/calibrated 13-class accuracy is **83.54%**, occupied macro-F1 **0.5391**, type accuracy **50.63%**, color accuracy **97.29%**, with zero synthetic empty false positives. RhosGFX scores 81.81% square accuracy / 0.3629 macro-F1 and predicts **no kings** for 20 white plus 20 black true kings; P4wn scores 85.28% / 0.4864 and predicts 46 black kings for 20 true. This is still weak piece-family transfer despite stronger total accuracy.

The explicit [king/non-king contrast set](../artifacts/scanner-piece-classifier-v0.2/king-contrast-set.json) selects every certified synthetic truth tile labeled empty, K/k, Q/q, B/b or R/r. Membership is reproducibly bound by sample-ID hashes and tabulated by split, light/dark square, board theme and catalog style. Its unseen-test portion has 1,280 tiles; **the same one-time test confusion matrix** yields 88.44% 13-class accuracy, 22 predicted white kings for 40 true and 46 predicted black kings for 40 true, with no empty→king. No additional test inference was performed. Glare/moiré/compression provide photographed-screen *proxies*, not actual photos. The catalog has no certified outline-versus-solid style field, so this requested contrast axis remains an evidence gap rather than a claimed result.

The real pass reused the previously certified human-corner RGB64 cache (identical tiles to v0.1, SHA-256 `3277B8B4321A1FE2625B0F97ADA3AA05DABD4F1FC4472B50A5D1C1CC9C254712`). The frozen model inferred it **once**; one scorer read the unchanged 31-board truth and scored both raw and already-frozen calibrated probabilities from that same pass. No model or temperature was changed afterward.

| Real metric | Historical TFJS | v0.1 | v0.2 raw | v0.2 calibrated |
| --- | ---: | ---: | ---: | ---: |
| 13-class accuracy | 65.93% | 62.70% | **70.21%** | 69.96% |
| Occupied macro-F1 | 0.1013 | 0.3121 | **0.4064** | 0.4048 |
| Occupancy precision | 98.22% | 75.03% | **81.24%** | 80.84% |
| Occupancy recall | 95.86% | 99.47% | **99.47%** | 99.73% |
| Occupancy F1 | 0.9703 | 0.8553 | **0.8944** | 0.8930 |
| True empty → occupied | 13 | 248 | **172** | 177 |
| True occupied → empty | 31 | 4 | **4** | 2 |
| Piece-type accuracy | 17.09% | 44.46% | **50.73%** | 50.87% |
| Color accuracy | 77.30% | 70.49% | **85.45%** | 85.45% |
| White exact accuracy | 17.41% | 21.64% | **35.88%** | 35.88% |
| Black exact accuracy | 5.41% | 47.30% | **52.43%** | 52.43% |
| Predicted `k` / true `k` | 2 / 31 | 350 / 31 | **135 / 31** | 138 / 31 |
| Empty → `k` | 0 | 134 | **66** | 69 |
| Color swaps | 42 | 76 | **50** | 51 |
| Exact boards | 0/31 | 0/31 | **0/31** | 0/31 |
| Mean corrections/board | 21.81 | 23.87 | **19.06** | 19.23 |
| Median corrections/board | 24 | 21 | **16** | 16 |
| Wrong ≥0.90 confidence | 97 | 144 | **183** | **266** |

Raw predicted `K` / true `K` is **43 / 31**, empty→`K` **0**; calibrated values are also 43 / 31 and 0. The black-king sink is **reduced but not eliminated**. All 31 boards still have at least three errors; none has 0, 1, or 2. Raw chess-aware structural warnings appear on 23/31 boards (duplicate white king 12, duplicate black king eight, missing white king five, missing black king nine, >16 white eight, >16 black ten, back-rank pawn five). Warnings are diagnostics only and never alter a prediction.

Raw Brier is **0.4730** and ECE **0.1886**; calibrated Brier worsens to **0.5013**, ECE to **0.2171**. Raw mean top-1 confidence is 0.8908 and wrong-prediction confidence 0.7460; calibration raises these to 0.9167 and 0.8019. The validation-selected sharpening temperature is counterproductive under real-world domain shift. Reporting both forms is essential; **no post-real temperature correction is authorized**. Benchmark-only uncertainty diagnostics flag 227 raw squares, including 163 errors, but do not route anything in Scanner.

Exploratory hard subsets (v0.2 raw square accuracy): bishop/knight/queen **60.93%** of 215 squares; king-color **67.74%** of 62; low-contrast-tagged **40.63%** of 128; printed-source **46.18%** of 576; digital/photo **80.13%** of 1,344; livestream **78.13%** of 64; book-tagged **38.44%** of 320. Source groups are small: digital-2d 16 boards at 77.44%; photo-of-screen five at 88.75%; degraded print two at 40.63%; hatched print three at 39.06%; general printed two at 71.09%; one printed diagram at 34.38%; one small-board print at 40.63%; one livestream at 78.13%. No platform-specific result is inferred from appearance or unverified metadata.

The [real report](../artifacts/scanner-piece-classifier-v0.2/real-31-board-report.json) contains full raw/calibrated 13×13 matrices, per-class metrics, correction and warning counts. The [historical comparison](../artifacts/scanner-piece-classifier-v0.2/historical-comparison.json) binds both prior models to the identical human truth SHA and records all deltas. The new model is a measurable improvement over v0.1 on several recognition dimensions but remains below the historical occupancy F1 and exceeds both prior models' confident-error count.

## Model size, performance, and decision

On this Windows desktop CPU (eight PyTorch threads), five warmups and 30 synthetic batch-64 repeats gave median **23.0 ms** model load, **0.75 ms** RGB64 tensor conversion, **213.7 ms** canonical multi-head inference per board-sized batch, and **3.34 ms** effective per tile. Process RSS was 543 MB before load, 552 MB after load and 692 MB after benchmark; these process-level numbers include PyTorch and are not model-only memory. The 2.62 MB native / 2.68 MB TorchScript binaries meet the preferred <3 MB raw target, but TorchScript is not a proven TFJS/browser export. This measurement excludes image decode, homography, file I/O and browser/mobile overhead; do not claim iPhone performance.

**Decision: MORE DATA / ARCHITECTURE WORK REQUIRED.** v0.2 preserves and extends occupied-piece gains, improves color and corrections, and roughly halves empty→black-king errors. It still has 172 raw empty false positives, 135 predicted black kings for 31 true, no exact board, 19 corrections per board and 183 raw (266 calibrated) highly confident wrong predictions. The target of materially fewer confident errors is unmet. Recommended next task: **PHASE 3-007C — TARGETED DATA / ARCHITECTURE REVISION**, with a fresh validation/calibration design that better reflects real 2D background complexity without using the protected 31-board cohort for tuning. The public UI is unchanged; a VISUAL-FREEZE exception requires Alexander's explicit approval. Do not integrate the model, merge, or deploy.

---

# Phase 3-007C-B — certified real-development cohort revision

Status: offline experiment complete; no runtime or public UI integration.

## Development data and controlled matrix

The separately documented `caissa-scanner-real-development-v0.2-certified` cohort contributes 28 session-isolated training boards and 13 validation boards. The protected 31-board benchmark contributes zero training, selection, threshold, or calibration tiles. `scanner-piece-dataset-v0.5` combines the unchanged rights-cleared v0.4 synthetic corpus with certified development tiles. It contains 10,544 RGB64 tiles: 6,832 train, 2,272 validation, and 1,440 unseen-family test. Real support is 1,792 train tiles and 832 validation tiles. Training samples are 80% synthetic / 20% real development; real draws are 75% empty. Weighted occupancy CE uses weights 1:2 for empty:occupied. Focal loss and arbitrary king suppression were rejected as unjustified.

The bounded 3×2 matrix compared (A) shared heads with real hard-negative curriculum, (B) a stronger occupancy branch with shared identity heads, and (C) strict two-stage occupancy then occupied-only identity. Seeds were 1901 and 1902. The selected run was shared-hard-negative seed 1902, epoch 16, because it led the preregistered combined synthetic-validation and held-out real-development criteria. The six-run matrix and exact metrics are committed in `artifacts/scanner-piece-classifier-v0.3/experiment-summary.json`.

Frozen v0.2 mining used train-development only. It found three true-empty false positives (`p`, `b`, and `n`); no development-validation tile entered the curriculum. Separate v0.2 train/validation analysis supports a multiple-factor diagnosis: real-background occupancy shift plus type and color interaction under platform/style shift. It does not support a single-cause claim.

## Threshold, calibration, and development validation

Development-validation alone selected occupancy threshold 0.5: precision/recall/F1 1/1/1, with no false positives or false negatives on 832 tiles. Separate occupancy/color/type temperatures of 0.75 were selected over no calibration and occupancy-only scaling. Against no calibration, NLL improved from 0.05095 to 0.04749, Brier from 0.02607 to 0.02553, and ECE from 0.01284 to 0.00721; validation accuracy remained 98.44%. Occupied macro-F1 was 0.9411, piece type 95.81%, and color 100%.

The benchmark-only abstention diagnostic accepted 822/832 development-validation tiles (98.80% coverage) at 98.91% accepted accuracy. Ten tiles were flagged; their error rate was 40%. This policy was not integrated.

## Freeze and one-time evaluations

Architecture, weights, preprocessing, threshold, calibration, and diagnostics were frozen before either test. The selected state SHA-256 is `561BDE692A9C196151396CD4236A9F6B10BA516F001D4ED850A4076E30994029`; TorchScript SHA-256 is `AF15522A716A82656C52CF7118856ECFECEC30F623F2D2EF99FF93BE88138F5D`. The unseen-family synthetic pass then scored 85.90% 13-class accuracy, 0.5380 occupied macro-F1, perfect occupancy separation, 57.92% piece type, and 99.17% color. RhosGFX remains weak (78.06%, 0.1949 macro-F1), while P4wn reached 93.75%, 0.7823 macro-F1.

The protected 31-board model inference ran exactly once after freeze. Its saved truth-free predictions were scored without retuning. Calibrated frozen-policy results:

| Protected metric | v0.2 calibrated | v0.3 calibrated |
| --- | ---: | ---: |
| 13-class accuracy | 69.96% | **83.87%** |
| Occupied macro-F1 | 0.4048 | **0.6536** |
| Occupancy precision | 80.84% | **83.22%** |
| Occupancy recall | 99.73% | **100%** |
| Occupancy F1 | 0.8930 | **0.9084** |
| Empty→occupied | 177 | **151** |
| Occupied→empty | 2 | **0** |
| Piece type | 50.87% | **80.77%** |
| Color | 85.45% | **91.32%** |
| White exact | 35.88% | **75.20%** |
| Black exact | 52.43% | **79.73%** |
| Predicted K / true K | 43 / 31 | **36 / 31** |
| Predicted k / true k | 138 / 31 | **121 / 31** |
| Empty→K | 0 | 9 |
| Empty→k | 69 | **36** |
| Color swaps | 51 | **25** |
| Exact boards | 0 / 31 | **8 / 31** |
| Mean / median corrections | 19.23 / 16 | **10.32 / 1** |
| Wrong ≥0.90 | 266 | **122** |

Raw v0.3 scored 84.48% accuracy, 0.6615 occupied macro-F1, and 74/57 wrong predictions at ≥0.90/≥0.95. Calibration selected on development validation was counterproductive under protected-domain shift: calibrated counts rose to 122/85. No post-benchmark calibration adjustment is authorized.

MVP-priority protected subsets remain exploratory: digital-2D 16 boards / 95.41% square accuracy; digital-photo five / 98.75%; livestream one / 93.75%. Print is the dominant unresolved domain: printed-source accuracy is 53.99%, low-contrast-tagged 25.78%. The worst board is the old-newspaper sample with 57 corrections; eight boards are exact, eight have one error, none has two, and 15 have at least three.

## Size, performance, and decision

The model has 649,706 parameters. Native state is 2,622,865 bytes (2,418,913 gzip); TorchScript is 2,676,478 bytes (2,447,220 gzip), both below the preferred 3 MB raw ceiling. On this Windows desktop CPU, five warmups and 30 batch-64 repeats measured 21.05 ms model load, 0.96 ms preprocessing per board, and 225.00 ms inference per board (3.52 ms effective per tile). These measurements exclude decode, homography, I/O, browser, and mobile overhead.

**Decision: MORE DATA / ARCHITECTURE WORK REQUIRED.** General recognition, correction burden, and high-confidence errors improve substantially, but 121 predicted black kings for 31 true and 151 empty→occupied errors mean `k` remains a sink. The held-out development sessions did not predict this protected print/domain failure. Recommended next task: **PHASE 3-007D — TARGETED CLASSIFIER REVISION**, emphasizing session-diverse development data, print/low-contrast empty backgrounds, stricter external calibration validation, and architecture work without touching protected truth. The public UI remains frozen; do not integrate, merge, or deploy this model.

---

# Phase 3-007D — targeted king-sink and occupancy-precision revision

Status: offline experiment complete; no runtime or public UI integration.

## Root-cause and morphology update

The frozen v0.3 model produced no false black kings on the 28 development-training boards and only two on the 13 development-validation boards. Both were black knights from PlayOK photo-of-screen captures (mean `k` confidence 0.6125). Every other requested truth-to-`k` bucket was zero. This is evidence that the protected king sink is primarily a style/domain-generalization defect, not a large in-cohort error cluster suitable for ordinary hard-negative mining. The curriculum therefore used no validation examples and no protected examples; it emphasized kings, queen/rook/bishop/knight contrasts, and empty squares from the existing certified synthetic and real-development training data.

The descriptive morphology audit covered all 11 synthetic families using foreground masks, edge maps, silhouette Jaccard, top/bottom mass, center of mass, and width/height ratios. King silhouettes frequently overlap queens. RhosGFX was the clearest exception: white-king-to-bishop Jaccard reached 0.8901. These audit statistics did not enter model selection, and the unseen RhosGFX/P4wn labels were not used to tune the result.

The v0.3 occupancy gate had three false positives on development train and none on development validation. All three train errors were photo-of-screen samples (World Chess once, Chess.com twice), with one explicit screen-glare tag; source category and capture type were otherwise human-recorded as unknown. No development error carried print texture, coordinate, arrow, moiré, or rectification-artifact metadata. This sparse evidence supports glare/background domain shift, but it cannot explain or select against the protected print-heavy failure.

## Controlled matrix and selection

The preregistered 3×2 matrix compared: (A) frozen-v0.3 initialization plus the king-focused curriculum; (B) the same model with a small occupied-only king-vs-non-king auxiliary head; and (C) the auxiliary head plus occupancy cross-entropy weights 2:1 for empty:occupied. Seeds were 2001 and 2002. All runs kept the 80% synthetic / 20% real-development sampling ratio. The selector balanced synthetic validation, real-development validation, occupancy precision/F1, occupied macro-F1, type/color quality, false-king rate, and confidence honesty.

The selected model was variant B, seed 2002, epoch 11. On 832 real-development validation tiles it scored 99.40% 13-class accuracy, 0.9748 occupied macro-F1, perfect occupancy precision/recall, 98.71% piece-type accuracy, 99.68% color accuracy, zero false black kings, and one wrong prediction at confidence >=0.90. Variant C did not win: its best selection score was 1.8748 versus 1.8779 for variant B and it had one validation occupancy false positive.

Development validation selected occupancy threshold 0.5. The bounded king confidence/margin grid selected no additional black-king restriction: minimum type probability 0, type margin 0, and occupancy probability 0.5. This is a visual policy only; no one-king chess rule is encoded. Calibration compared raw/no calibration, fixed 1.0, occupancy-only scaling, and separate temperatures constrained to >=1.0. Every fitted head temperature was 1.0, so the simpler raw/no-calibration policy was frozen. Sharpening is prohibited.

## Frozen evaluations

Architecture, weights, preprocessing, occupancy threshold, king policy, and calibration were frozen before testing. State SHA-256 is `90D06A3C1AAC934188CBA5EEB4B68D51AC64C815351BFE372F2215101DD7209E`; TorchScript SHA-256 is `F5677FA906104D2B62DCB5B47C853B5F7DAE797F1E271677E3B115DA45B4F7D6`. The one-time unseen-family synthetic pass improved over v0.3: 87.22% accuracy, 0.6304 occupied macro-F1, perfect occupancy separation, 62.50% type accuracy, and 98.33% color accuracy. Predicted black kings fell from 58 to 29 for 40 true; nine were false black kings.

The protected model inference then ran exactly once. No checkpoint, threshold, policy, calibration, or preprocessing was changed afterward.

| Protected metric | v0.3 frozen policy | v0.4 frozen policy |
| --- | ---: | ---: |
| 13-class accuracy | **83.87%** | 82.21% |
| Occupied macro-F1 | **0.6536** | 0.6497 |
| Occupancy precision | **83.22%** | 79.43% |
| Occupancy recall | 100% | 100% |
| Occupancy F1 | **0.9084** | 0.8853 |
| Empty to occupied | **151** | 194 |
| Occupied to empty | 0 | 0 |
| False occupancy / board | **4.87** | 6.26 |
| Piece type | 80.77% | **84.11%** |
| Color | **91.32%** | 89.99% |
| Predicted K / true K | 36 / 31 | **21 / 31** |
| Predicted k / true k | 121 / 31 | **44 / 31** |
| False-`k` rate | 75.21% | **36.36%** |
| Empty to `k` | 36 | **6** |
| Other piece to `k` | 55 | **10** |
| Exact boards | 8 / 31 | **11 / 31** |
| Mean / median corrections | **10.32 / 1** | 11.39 / 2 |
| Wrong >=0.90 / >=0.95 | 122 / 85 | **121 / 78** |

The king intervention generalizes materially: predicted black kings fall 64%, false-`k` rate falls from 75.21% to 36.36%, empty-to-`k` falls 83%, and other-piece-to-`k` falls 82%. Piece-type accuracy and exact-board count also improve. The occupancy objective does not generalize: empty false positives rise by 43, precision falls 3.79 percentage points, and correction burden worsens. Raw/no-calibration confidence remains poor under domain shift (Brier 0.2827, ECE 0.1208, 121 errors at >=0.90). The selected policy's canonical probabilities are already raw; the scorer's raw argmax is reported separately only to explain the occupancy-gate delta, not as a post-freeze alternative.

MVP categories are preserved: digital-2D 95.31%, photo-of-screen 99.06%, and livestream 98.44%. Secondary print remains the dominant failure: printed-source 47.74%, book-tagged 45.63%, degraded print 14.06%. The worst board remains `cv-failure-001-old-newspaper-mackenzie-97` with 62 corrections, driven by severe print degradation/background texture and class confusion rather than an authorized localization change. Eleven boards are exact; four have one error, two have two, and 14 have at least three.

The development-only abstention diagnostic covers 99.40% (827/832) at 99.64% accepted accuracy; five squares are abstained and concentrate 40% error. This is analysis only and is not integrated.

## Size, performance, and decision

The selected auxiliary model has 657,996 parameters. Native state is 2,656,885 bytes (2,450,738 gzip); TorchScript is 2,716,714 bytes (2,480,255 gzip), below the preferred 3 MB raw ceiling. On this Windows desktop CPU, five warmups and 30 batch-64 repeats measured 18.40 ms load, 0.32 ms preprocessing, and 69.62 ms inference per 64-tile board (1.09 ms effective per tile). The measurement excludes decode, homography, I/O, browser, and mobile overhead.

**Decision: MORE TARGETED CLASSIFIER WORK REQUIRED.** The highest-priority king sink is substantially reduced and digital MVP performance is preserved, but occupancy precision, overall accuracy, mean/median corrections, print robustness, and high-confidence-error reduction do not meet the requested direction. The next task is **PHASE 3-007E — FINAL TARGETED CLASSIFIER REVISION**, using new development-only background/print hard negatives or an occupancy architecture whose selection cohort actually represents the remaining shift. Do not reuse protected truth for training or selection. The public UI remains frozen; do not integrate, merge, or deploy this model.

---

# Phase 3-007E — final targeted occupancy recovery

Status: frozen offline experiment complete; no runtime or public UI integration.

## Occupancy failure analysis

The frozen v0.4 model has only three development-train empty-to-occupied errors and none on the 13-board development-validation split. The ranked sinks are black knight (`n`, two) and black pawn (`p`, one), not black king. All three are light border squares from photo-of-screen sessions; one has an explicit screen-glare tag. Their occupied probabilities are 0.977737, 0.989148, and 0.989630, so these are genuinely overconfident outliers rather than scores near 0.50. Capture type and highlight state were not recorded; no development record carries an explicit screenshot, print, or low-contrast tag, and that missing metadata is reported rather than inferred.

Across development train plus validation, the occupancy-logit margin for 1,818 true-empty tiles has mean -11.2987, median -11.3780, P10 -12.0944, and P90 -10.7208. For 806 true-occupied tiles it has mean 11.5371, median 11.1708, P10 8.6763, and P90 14.7811. The central 80% bands do not overlap. The minimum occupied probability is 0.995004, while the maximum empty probability is 0.989630. This clean validation separation justifies testing a conservative tail above 0.90; it does not imply that protected-domain print squares are equally separated.

## Bounded matrix and frozen selection

The preregistered matrix contained threshold-only frozen v0.4 plus six trained runs: loss rebalance, occupancy-only hard-negative fine-tune, and occupancy-only fine-tune with a 30% real mix, each at seeds 2101 and 2102. Trained variants used empty:occupied loss weights 1.5:1 and a 2% hard-negative draw. The baseline and loss-rebalance variants used 80% synthetic / 20% real development, with 75% empty within real; the final occupancy-only variant used 70% synthetic / 30% real, with 80% empty within real. No protected tile entered training or selection.

The validation-only threshold grid was 0.50 through 0.90 plus a justified conservative tail at 0.95, 0.975, and 0.99. Selection minimized `2 * FP + FN`, then maximized F1, precision, and threshold. Every threshold had zero FP and zero FN on development validation. The deterministic tie-break selected 0.99, which remains below every development occupied probability. Threshold-only scored 1.845378, narrowly above loss-rebalance seed 2101 at 1.844597; occupancy-only candidates scored 1.8212–1.8247 and did not win. Therefore the frozen v0.4 weights and shared multi-head plus occupied-only king auxiliary are preserved exactly. The selected policy has occupancy threshold 0.99, original 1:2 training-loss provenance, no occupancy fine-tune, the unchanged visual king policy, and raw/no calibration.

Development validation at the frozen policy is 99.40% 13-class accuracy, 0.9748 occupied macro-F1, perfect occupancy precision/recall, 98.71% piece-type accuracy, 99.68% color accuracy, 99.35% black exact, zero false black kings, and one wrong white-king prediction. The king-preservation gate passes. State SHA-256 remains `90D06A3C1AAC934188CBA5EEB4B68D51AC64C815351BFE372F2215101DD7209E`; the newly exported TorchScript SHA-256 is `8025AA0F8455BE582AB718A70BC75C1CE4A583852DA4A3A8E540FEF035EE9801`.

## Post-freeze evaluations

The one-time unseen-family synthetic test scored 87.22% 13-class accuracy, 0.6304 occupied macro-F1, perfect occupancy precision/recall, 62.50% piece-type accuracy, and 98.33% color accuracy. It predicted 20 white kings and 29 black kings for 40 true of each; false-black-king rate was 31.03%. RhosGFX identity transfer remains weak while P4wn remains strong. No result was used to retune the frozen policy.

The protected 31-board inference then ran exactly once. Relative to v0.4, the threshold policy trades 22 occupied false negatives for 106 fewer empty false positives, consistent with the preregistered higher FP cost.

| Protected metric | v0.3 | v0.4 | v0.5 |
| --- | ---: | ---: | ---: |
| 13-class accuracy | 83.87% | 82.21% | **87.05%** |
| Occupancy precision | 83.22% | 79.43% | **89.20%** |
| Occupancy recall | **100%** | **100%** | 97.06% |
| Occupancy F1 | 0.9084 | 0.8853 | **0.9297** |
| Empty to occupied | 151 | 194 | **88** |
| Occupied to empty | **0** | **0** | 22 |
| False occupancy / board | 4.87 | 6.26 | **2.84** |
| Occupied macro-F1 | 0.6536 | 0.6497 | **0.6933** |
| Predicted `k` / true `k` | 121 / 31 | 44 / 31 | **40 / 31** |
| Empty to `k` | 36 | 6 | **2** |
| Other piece to `k` | 55 | **10** | **10** |
| Exact boards | 8 / 31 | **11 / 31** | **11 / 31** |
| Mean / median corrections | 10.32 / **1** | 11.39 / 2 | **8.29 / 2** |
| Wrong >=0.90 / >=0.95 | 122 / 85 | 121 / 78 | **107 / 71** |

The white/black king counts are 21/31 and 40/31. White false-king rate is 9.52% (zero empty-to-`K`, two other-piece-to-`K`); black false-king rate is 30.00% (two empty-to-`k`, ten other-piece-to-`k`). Piece-type accuracy is 82.78%, color accuracy 87.58%, white exact 72.82%, black exact 82.16%, and color swaps remain 40. There are 11 zero-error, two one-error, five two-error, and 13 three-plus-error boards. Mean corrections excluding the worst one and two boards are 7.10 and 6.17. The worst degraded-newspaper board improves from 62 to 44 corrections.

MVP preservation is acceptable: digital-2D is 95.02%, photo-of-screen 99.06%, and livestream 96.88%. Printed-source rises to 65.10%, book-tagged to 63.75%, and degraded print to 44.53%, although all remain secondary and exploratory. Forty-six false occupied predictions are at confidence >=0.90 and 37 at >=0.95; the remaining errors are often truly overconfident, especially on degraded print. The existing analysis-only uncertainty policy covers 89.72% (1,780/1,984) at 89.83% accepted accuracy; 204 squares are abstained with a 37.25% error rate. It captures 76 errors and 23 of 88 false occupancies (26.14%). It remains unsuitable as a runtime gate without platform validation.

The frozen model still has 657,996 parameters. Native state is 2,656,885 bytes (2,450,738 gzip); TorchScript is 2,716,800 bytes (2,480,175 gzip). This Windows desktop CPU run measured 20.56 ms load, 0.90 ms preprocessing, and 204.29 ms inference per 64-tile board (3.19 ms effective per tile). These environment-dependent figures exclude decode, homography, I/O, browser, and mobile overhead and are not an iPhone claim.

**Decision: PROMISING REVISION — READY FOR PHASE 3-008.** Occupancy precision improves 9.78 points, empty false positives fall below 100, false occupancy per board more than halves, occupied macro-F1 rises, black-king behavior remains controlled, correction burden improves, exact boards do not regress, and primary digital/photo performance remains strong. Recall, color/identity quality, livestream, and high-confidence print errors remain explicit follow-up risks. Next: **PHASE 3-008 — REAL-PLATFORM VALIDATION + CLASSIFIER HARDENING**. Do not integrate runtime, change the public UI, merge, or deploy this model.
