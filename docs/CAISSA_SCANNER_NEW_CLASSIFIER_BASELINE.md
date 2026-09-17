# CAISSA Scanner Phase 3-007 — generalized piece classifier baseline

Status: **experimental, not integrated**. Decision: **DATASET / ARCHITECTURE NEEDS REVISION**. This is a 2D-only recognition study; physical 3D boards were neither a target nor used for tuning. The Phase 2C visual UI remains frozen.

## Certified data and evaluation firewall

The source is `scanner-piece-dataset-v0.3`, seed 306. Its certified manifest SHA-256 is `DCDF1799CC8D25F8D9CEEE6FFCE37FF7214958BA36C27331A48BA0D5EE9AB531` and catalog SHA-256 is `4D71DC062A494DBA8E030FFE31A5FA44522DBDE1C2F0280B1193E8D0B48865CC`. The dataset gate certifies generator determinism, asset checksums, 11 eligible families, complete 7/2/2 whole-family train/validation/test assignment, and balanced occupied colors/classes. Training consumed 3,360 synthetic tiles from seven families. Validation and test each used 960 tiles from distinct, held-out two-family sets. Each synthetic holdout has 480 empty tiles and 40 per occupied class. The original manifest also references 1,984 real evaluation tiles; those were excluded from synthetic preprocessing and model training. The RGB64 synthetic cache contains exactly 5,280 synthetic tiles and zero real tiles (pixels SHA-256 `188AFD2146BBE70B3CA5A6F2D9B2A2A5CC140E73737E092F48E64E1A4E348BE4`). Only the certified v0.3 bounded augmentations were used; training adds none.

The 31 human-verified real boards (1,984 squares, truth manifest SHA-256 `AA471439A1EE78301591424A92FC9C425D3B7C3FCF12AC18A2CFE83B2A4EF855`) were evaluation-only. Training and validation code have no real-truth input. Selection used validation occupied macro-F1 only. Architecture, preprocessing, class order, argmax policy, and weights were frozen and hashed before the unseen-family synthetic test and the single real-model inference. There was no post-test or post-real tuning. Real boards used human corners, a 512×512 rectification, and exact 64 visual-order RGB64 tiles; no detector corners or chess-aware corrections were used. The real pixels hash is `3277B8B4321A1FE2625B0F97ADA3AA05DABD4F1FC4472B50A5D1C1CC9C254712`.

## Model and training

Version `caissa-piece-classifier-v0.1-baseline`, architecture `compact-rgb-cnn-v1`: seven 3×3 Conv/BatchNorm/ReLU blocks with channels 32, 32, 64, 64, 128, 128, 256; 2×2 pools after blocks 2, 4, 6; global average pooling; 128-unit ReLU dense layer; dropout 0.2; 13 logits. **617,453 parameters**, no pretrained backbone. The canonical class order is `empty, P, N, B, R, Q, K, p, n, b, r, q, k` and the prediction policy is plain 13-class softmax argmax, without abstention or thresholds. Input is 64×64 RGB uint8 scaled by 255. This preserves color and more spatial detail than the historical 32×32 grayscale baseline while remaining compact; no claim of mobile suitability follows from parameter count alone. Synthetic 128×128 tiles use Sharp 0.35.3 Lanczos3 RGB64 resize; real board cells are already 64×64 after rectification.

PyTorch 2.13.0+cu130 trained on an NVIDIA RTX 3080 Ti Laptop GPU. AdamW, learning rate 0.001, weight decay 0.0001, batch 128, unweighted cross-entropy (classes are balanced), maximum 35 epochs, patience six; deterministic algorithms and seed settings were requested where practical. The dataset seed was 306 and independent training/framework seeds were 1701, 1702, 1703. Best epochs were 12, **10**, 10; corresponding validation occupied macro-F1 scores were 0.9728, **0.9875**, 0.9488. Seed 1702 won by validation-only selection. Its checkpoint SHA-256 is `EA12AAF00ED8E330C572B51F73FF1545696208ECC58458E5AFC20DC78F6DDABB`. Config SHA-256 is `775F02A0226F0309841A999CC43AA0057D70B867AC5B9DACEFFA3B149B4F6E76`. The native checkpoint is 2,489,733 bytes (2,304,277 gzip-compressed); TorchScript is 2,536,300 bytes (2,329,975 compressed), SHA-256 `40A2390BD17919058B230CB489EB4E3366A611C8D6DEB832B536BD41CE85A8D9`. TorchScript is a future-compatible research export, not a tested TFJS/browser/mobile model. Large binaries and the truth-free prediction bundle are stored outside Git at `C:\Users\ALEXANDER\Alexander Projects\caissa\_scanner\_model_artifacts\phase3-007-v0.1`; small reports and hashes are committed.

## Whole-family holdouts

| Cohort | Family | 13-class accuracy | Occupied macro-F1 | Piece type | Color |
| --- | --- | ---: | ---: | ---: | ---: |
| Validation | lichess-celtic | 99.17% | 0.9832 | 100.00% | 98.33% |
| Validation | livius | 99.58% | 0.9916 | 99.17% | 100.00% |
| Validation | combined | 99.38% | 0.9875 | 99.58% | 99.17% |
| Unseen test | lichess-rhosgfx | 67.50% | 0.2789 | 44.17% | 68.33% |
| Unseen test | p4wn-svg | 73.54% | 0.3917 | 58.33% | 88.75% |
| Unseen test | combined | 70.52% | 0.3816 | 51.25% | 78.54% |

Validation was a poor proxy for unseen-family generalization: the test occupied macro-F1 falls by 0.606. For `lichess-rhosgfx`, confusion includes piece-color/type failures; for `p4wn-svg`, type remains weak despite stronger color. Full 13×13 family confusion matrices are in the committed JSON reports. No model was changed in response.

## One-time real 31-board benchmark

| Metric | Historical TFJS | New baseline |
| --- | ---: | ---: |
| 13-class square accuracy | 65.93% | **62.70%** |
| Occupied macro-F1 (12 classes) | 0.1013 | **0.3121** |
| Occupied/empty accuracy | 97.78% | **87.30%** |
| Piece-type accuracy on occupied truth | 17.09% | **44.46%** |
| Color accuracy on occupied truth | 77.30% | **70.49%** |
| White exact-class accuracy | 17.41% | **21.64%** |
| Black exact-class accuracy | 5.41% | **47.30%** |
| Exact boards | 0/31 | **0/31** |
| Mean corrections/board | 21.81 | **23.87** |
| Color swaps | 42 | **76** |
| Wrong predictions at confidence ≥0.90 | 97 | **144** |

The macro-F1 convention gives zero to a class with no predicted support. The historical value was computed from the prior certified per-class report on the identical real truth. The new full per-class precision/recall/F1 and 13×13 matrix are in `artifacts/scanner-piece-classifier-v0.1/real-31-board-report.json`; selected rows:

| Class | Support | Precision | Recall | F1 |
| --- | ---: | ---: | ---: | ---: |
| empty | 1,235 | 0.996 | 0.799 | 0.887 |
| P | 184 | 0.826 | 0.103 | 0.184 |
| N | 40 | 0.207 | 0.300 | 0.245 |
| B | 44 | 0.176 | 0.295 | 0.220 |
| R | 54 | 0.875 | 0.389 | 0.538 |
| Q | 26 | 0.538 | 0.269 | 0.359 |
| K | 31 | 0.192 | 0.323 | 0.241 |
| p | 183 | 0.840 | 0.459 | 0.594 |
| n | 44 | 0.092 | 0.205 | 0.127 |
| b | 40 | 0.098 | 0.200 | 0.131 |
| r | 51 | 0.493 | 0.647 | 0.559 |
| q | 21 | 0.288 | 0.714 | 0.411 |
| k | 31 | 0.074 | 0.839 | 0.136 |

False black kings dominate: `empty→k` occurs 134 times and `k` is predicted 350 times for 31 true black kings. Other large confusions include `p→n` 48, `P→b` 41, `P→B` 34, `n→k` 31, and `P→k` 28. Pawn↔bishop type confusions improve from 265 to 103, but are still material. Bishop/knight/queen type confusions and exact counts are in the comparison artifact. Color swaps by type (white→black / black→white): P 14/0, N 5/0, B 4/0, R 18/3, Q 8/0, K 20/4. The model trades the historical tendency to call black pieces white for a new white-to-black bias.

Zero, one, and two-error board buckets each contain zero boards; all 31 need at least three corrections. Median is 21 (historical 24). Best is `cv-success-001-ui-overlay-board` at three errors; worst is `cv-failure-001-old-newspaper-mackenzie-97` at 63. The resulting mean burden increases despite a slightly better median.

Hard subsets: bishop/knight/queen 215 squares, 29.77% exact; king color 62 squares, 58.06% exact; low-contrast-tagged 128 squares, 7.81% exact; printed-source 576 squares, 31.42% exact; digital/photo 1,344 squares, 75.74% exact; livestream 64 squares, 70.31% exact; book-tagged 320 squares, 26.88% exact. Source groups are small and exploratory: 16 digital-2d boards 72.95%; five photo-of-screen boards 84.69%; two degraded-print boards 7.81%; one printed-diagram board 7.81%; three hatched-print boards 30.21%; one small-board print 35.94%; two general printed boards 66.41%; one livestream board 70.31%. Tags and categories are not a balanced statistical sample.

Confidence remains unsafe: mean top-1 0.8366, mean top-2 0.0958, mean margin 0.7409, mean confidence correct 0.9313 versus wrong 0.6774; Brier 0.5589 and 10-bin ECE 0.2096 (historical 0.4903 / 0.1812). There are 144 wrong ≥0.90-confidence predictions. Chess-aware warnings were measured but **not applied**: 29/31 boards have at least one warning; duplicate white king 15, duplicate black king 27, missing white king 10, missing black king one, >16 white pieces three, >16 black pieces 23, back-rank pawn four. The historical warning counts are in `historical-comparison.json`.

## Performance and comparison limits

On this Windows desktop CPU with eight PyTorch threads, five warmups and 30 timed batch-64 runs over *synthetic* RGB64 tiles gave median 12.7 ms model load, 1.04 ms tensor conversion/normalization, 228.3 ms batch inference, and 3.57 ms effective per tile. Process RSS was 540 MB before load, 549 MB after load, and 656 MB after the benchmark; these are process-level figures including PyTorch, not incremental model memory. This timing excludes image decode, homography, Sharp crop, file I/O, browser runtime and iPhone behavior. Historical real-board TFJS timing (~16.9 ms mean model inference per board) was collected with a different backend, preprocessing and workload; direct latency ranking is invalid. Historical model binary byte count is not certified, so the comparison table records it as unknown rather than inferring size from parameter count.

## Decision and next task

**DATASET / ARCHITECTURE NEEDS REVISION.** Gains in occupied macro-F1, black exact-class accuracy and type recognition are real but insufficient: overall accuracy and occupancy fall, corrections and confident errors rise, and print remains especially poor. Do not integrate this checkpoint, convert it into a production Candidate FEN path, change routing, or expose it in Scanner UI. Recommended next task: **PHASE 3-007B — DATASET / ARCHITECTURE REVISION**, with new training-only 2D family diversity and preprocessing analysis under a new frozen evaluation protocol; protect the same 31-board real cohort from tuning.

The scripts and reports are deliberately offline. `npm run test:scanner:dataset`, `npm run test:scanner:benchmark`, and `npm run verify:scanner` are the release gate. No VISUAL-FREEZE exception is authorized; any future public Scanner UI change requires Alexander's explicit approval.
