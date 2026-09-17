# CAISSA Scanner — Phase 3-005B verified-real historical TFJS baseline

Status: **MEASURED, NOT PRODUCT-READY**. Decision: **B — USEFUL ONLY AS BOOTSTRAP / REFERENCE**. The deterministic [classifier-only report](../artifacts/scanner-classifier-baseline/historical-tfjs-verified-real-benchmark.json) scores 31 human-verified 2D boards and 1,984 squares. The separate [Node performance report](../artifacts/scanner-classifier-baseline/historical-tfjs-verified-real-performance.json) is environment-dependent and is not an iPhone measurement. The earlier [unscored Phase 3-005 report](../artifacts/scanner-classifier-baseline/historical-tfjs-real-benchmark.json) remains historical evidence, not the current accuracy result.

## Model and truth certification

Both recovered ZIPs still match their audited SHA-256 values: primary `7CEEF63C4166A5B1CDA61FB0B392931840D9D29F3B1C48937E376F91C3763729`, older/beta `A6FF290C59CFA01332EFDBB31882933B74396C47BF269BA58C12EFF62A853D45`. Neither archive was changed or extracted over working source. The three model files in the existing isolated audit directory were rehashed before inference:

| Artifact | SHA-256 |
| --- | --- |
| `model.json` | `AA29183FBE73D8E6DB3B144BBC505558A04F64FC2C373C99009C9D6429F6CE8E` |
| `weights.bin` | `2FF117276E1D22BEAC35F2DBDBC4D8A29650917A9D657E81FFDFB026ADD2C458` |
| `metadata.json` | `9248660D4131FCAF219A7C7C7370B0EA2EAE58D046E7CA700DD54692FC0B31B2` |

This is a TensorFlow.js Layers 4.22.0 model loaded by isolated native `@tensorflow/tfjs-node` 4.22.0. It has 544,909 parameters, input `[batch,32,32,1]`, and exact output order `empty,P,N,B,R,Q,K,p,n,b,r,q,k`. Its Conv2D/pool/Conv2D/pool/flatten/Dense/Dropout/Dense topology and weight length were re-certified. Sharp 0.34.5 resizes the corner-rectified board to 256×256 grayscale using the historical default interpolation, extracts exact row-major 32×32 tiles, applies each tile's min/max stretch unless its range is below 10, and divides bytes by 255. No preprocessing improvement, training, or model conversion was introduced.

The external canonical truth manifest SHA-256 was `AA471439A1EE78301591424A92FC9C425D3B7C3FCF12AC18A2CFE83B2A4EF855` before and after the run. Its schema, corner/corpus identity, source hashes, explicit orientation, 64 valid labels, FEN round-trip, and Alexander's verification evidence were validated. The same 32 source image hashes were checked before and after inference. The 14 v0.3 exact-byte aliases score only through their canonical v0.1 source; the physical 3D sample remains out of MVP.

Exactly 31 records are human-verified and score. `cv-success-005-puzzle-diagram-no-kings` is retained as a **draft, nonstandard artistic/composition edge case** with `benchmarkEligibility: excluded`, `exclusionReason: nonstandard-artistic-composition`, `classifierHeadlineScoring: false`, `chessLogicScoring: false`, and `retainForEdgeCaseResearch: true`. It was **not run** in this 31-board inference and contributes to no headline metric or chess-logic warning. No truth record was deleted or edited. The eight recorded source-category families are not eight known piece-art families: `pieceSetFamily` and `pieceSetStyle` are unrecorded/unknown for all 31 scored boards.

## Controlled classifier-only method

For each scored original: checksum-verified source image plus human-verified TL/TR/BR/BL playable-board corners → deterministic true projective homography to a 512×512 RGBA board → historical Sharp 256×256 grayscale conversion → 64 exact 32×32 tiles → historical normalization → native TFJS inference. The v0.3 source dimensions are bounded to 2048 px / 4 MP before homography, as in the existing localization evaluator. Detector-predicted corners, localization errors, Chessvision predictions, post-hoc crop selection, and chess-aware corrections never enter classifier scoring. Black-at-bottom truth is mapped to visual tile order before comparison. This is **not** old end-to-end pipeline accuracy.

The immutable scoring unit is 31 boards × 64 = **1,984** squares. The deterministic JSON report records model/truth checksums, all 13-class vectors, each square's truth, top-1/top-2 class and score, margin, confusion, grouping, per-board corrections and structural warnings. Its SHA-256 matched on two independent benchmark runs: `EA133B2D7C5D145632D166983DC84109BD9BB8474BFD53FE740B7249B83D6F83`. No timestamp is included. Softmax scores are **not calibrated probabilities**.

## Measured real performance

| Metric | Result | Denominator / meaning |
| --- | ---: | --- |
| 13-class square accuracy | **65.93%** | 1,308 / 1,984 |
| Occupied-vs-empty accuracy | 97.78% | 1,940 / 1,984; does not establish piece identity |
| Piece-type accuracy, ignoring color | **17.09%** | 128 / 749 true occupied squares |
| Color accuracy on true occupied | 77.30% | 579 / 749; an `empty` prediction is incorrect |
| White-piece exact-class accuracy | 17.41% | 66 / 379 true white pieces |
| Black-piece exact-class accuracy | **5.41%** | 20 / 370 true black pieces |
| Exact-board accuracy | **0 / 31 (0%)** | All 64 labels must match |

The class imbalance matters: 1,235 of 1,984 truth squares are empty, and empty alone has 98.95% recall. Per-class precision / recall / F1, with truth support, are below; the full 13×13 matrix is in the JSON report.

| Class | Support | Precision | Recall | F1 |
| --- | ---: | ---: | ---: | ---: |
| empty | 1,235 | 97.53% | 98.95% | 98.23% |
| P | 184 | 18.57% | 7.07% | 10.24% |
| N | 40 | 1.96% | 2.50% | 2.20% |
| B | 44 | 10.89% | 75.00% | 19.02% |
| R | 54 | 57.14% | 29.63% | 39.02% |
| Q | 26 | 9.09% | 11.54% | 10.17% |
| K | 31 | 0% | 0% | 0% |
| p | 183 | 37.50% | 1.64% | 3.14% |
| n | 44 | 10.53% | 13.64% | 11.88% |
| b | 40 | 7.48% | 20.00% | 10.88% |
| r | 51 | 5.26% | 1.96% | 2.86% |
| q | 21 | 0% | 0% | 0% |
| k | 31 | 100% | 6.45% | 12.12% |

The `k` precision reflects only **two** `k` predictions, so it does not imply reliable king recognition. The dominant type confusions after ignoring piece color were `P→B` 259, `P→N` 48, `N→Q` 34, `R→B` 30, `N→B` 26, and `Q→N` 25. These are actual counts, not anticipated examples. Of 663 errors on true occupied squares, **42 (6.33%)** were the same piece type with opposite color: B/b 27, P/p 8, R/r 3, Q/q 2, K/k 2, N/n 0. Another 590 were occupied-piece type confusions. Color swaps are consequential, but wrong type is the larger observed failure.

Every board needs at least three corrections: 0 with zero, 0 with one, 0 with two, and **31 with three or more** wrong squares. Mean corrections are **21.81**, median **24**. Best: `cv-success-008-printed-perspective-sparse` with 7 wrong; worst: `cv-success-006-printed-book-classic-diagram` with 32 wrong. The full board ranking and all wrong squares are retained in the report.

## Source and style analysis

All category results below are **exploratory**; some contain only one or two boards and their empty-square proportions differ. They must not be ranked as platform quality claims.

| Recorded source category | Boards | Squares | 13-class accuracy |
| --- | ---: | ---: | ---: |
| degraded-print | 2 | 128 | 79.69% |
| digital-photo | 5 | 320 | 74.38% |
| printed-diagram | 1 | 64 | 50.00% |
| hatched-print | 3 | 192 | 72.92% |
| small-board-print | 1 | 64 | 75.00% |
| digital-2d | 16 | 1,024 | 61.82% |
| printed | 2 | 128 | 57.03% |
| livestream | 1 | 64 | 65.63% |

No defensible piece-family/style comparison is possible: all 31 are `unknown` in those fields, yielding one aggregate style group (31 boards, 1,984 squares, 65.93% accuracy, 42 swaps / 749 occupied = 5.61%, 590 type confusions / 749 occupied = 78.77%). Existing difficulty tags are only exploratory proxies, not a replacement for licensed piece-art family metadata: for example, five `printed-book`-tagged boards score 68.75%, four `classic-piece-style`-tagged boards 73.44%, and five `photo-of-screen`-tagged boards 74.38%. Platform identity is unrecorded; no Chess.com/Lichess/ChessBase per-platform score is invented.

## Known hard cases and confidence

The prior Chessvision hard-case notes did not include certified source IDs or per-square reference outputs. The report therefore records **partial-truth candidate matches, not cross-system rankings**:

- A (White Re1/Bc1/Bf1/Qe3; Black Ke8/Qd8/Bd6/Ba6): `real-v03-positive-007` matches **7/8** facts, but its verified e1 label is **K, not R**. It cannot be certified as the same reference case. On this candidate the TFJS model says c1 `N` (28.4%, runner-up `b`), f1 `empty` (32.3%, runner-up `B`), e3 `b` (34.3%, runner-up `N`), and e8 `b` (82.7%, runner-up `B`). These are descriptive classifier errors only.
- B (Black Be7/Bc8/Na5): `real-v03-positive-006` uniquely matches all **3/3** partial facts, but provenance still does not certify it as the Chessvision example. TFJS predicts e7 `B` (27.2%, runner-up `Q`), c8 `n` (47.6%, runner-up `b`), and a5 `B` (46.5%, runner-up `P`): three wrong black-piece labels.
- C (e1 White King, reference said Black King): **10** scored boards have a verified e1 `K`. None has TFJS top-1 `k` there; the model instead chooses B, P, N, or Q. Without the source ID, whether it shares Chessvision's specific color error remains **unresolved**.

On all squares, 13-way Brier score is **0.4903** and 10-bin ECE is **0.1812** (1,984 observations; exploratory calibration). Mean top-1 softmax is **0.9572 when correct** and **0.6146 when wrong**. There are **97 incorrect predictions at ≥0.9 softmax**, including `real-v03-positive-005` g2 truth `P` → `B` at 0.9955 and `cv-failure-001-old-newspaper-mackenzie-97` b6 truth `B` → `empty` at 0.9952. Full top-2 alternatives, margins, and scores are in the report. High softmax must not be treated as safe auto-acceptance.

Post-classification structural checks changed **no** label or score. Among 31 predictions, 24 boards lack a white king, 29 lack a black king, 1 has multiple white kings, 15 have more than 16 white pieces, and 21 have a pawn on a back rank; categories overlap. The excluded composition is not included in those counts. These are review warnings, not proof of source illegality or a license to invent/cap pieces. Reachability and opening plausibility were not scored.

## Synthetic comparison, performance, and decision

Metadata's historical **96.5509259% synthetic tile-validation accuracy** came from a tile-level split of one generated piece silhouette family; related positions/renders could cross train and validation. It is **not** real accuracy and is not averaged with 65.93% real 13-class or 0% exact-board accuracy.

The latest separate Node 24 / Windows x64 native-CPU timing run measured **11.8 ms model load**, **13.7 ms mean preprocessing**, **16.9 ms mean inference**, **83.7 ms mean per-board total**, **0.264 ms effective inference per tile**, and **318.8 MB peak process RSS**. An earlier independent run measured approximately 35.2 / 41.7 / 46.6 / 239.4 ms respectively with 233.3 MB peak RSS; process/OS conditions make wall-time and RSS variable. The per-board totals include decode, downsampling and homography; `preprocessMs` names only the historical Sharp/tile stage. These are **not iPhone Safari measurements** and say nothing about an integrated product path.

Decision **B — USEFUL ONLY AS BOOTSTRAP / REFERENCE**: the model loads and provides a reproducible failure comparator, but 17.09% occupied piece-type accuracy, 5.41% black-piece exact accuracy, 0/31 exact boards, severe king failures, and confident mistakes rule out even a temporary production baseline. Do not load it in Scanner or choose thresholds from this set. A future model must use a separately governed, source-/family-grouped real evaluation set; this small corpus is diagnostic, not a final product acceptance set.

## Phase 3-006 implications

Build a **2D-only** piece-set diversity/generalization dataset with licensed and provenance-tracked artwork. Prioritize relevant web/app ecosystems—Chess.com, Lichess, ChessBase/Playchess, ICC, PlayOK, FIDE/event broadcasts, Chessworld and popular mobile/web boards—through permissively licensed sets, open-source rendered equivalents, user-provided internal evaluation images, and legally appropriate screenshots. Do not scrape or redistribute proprietary assets blindly.

Record actual piece-family/style and platform IDs; cross piece family with board theme and capture condition; hold out whole source, position and piece families. Target bishop/queen/knight and pawn/bishop distinctions, black/white separation, king identity, outline/solid/stylized/uncommon 2D sets, degraded/low-contrast print, book figurines and hatching, screenshots/photographed monitors, and livestream boards. Include enough independently sourced examples per stratum to report uncertainty, and track occupied-class macro-F1, color swaps, exact boards, corrections and calibration—not only empty-dominated square accuracy. **Physical/volumetric 3D is out of MVP scope; do not train for it.** This task did not train, augment, fine-tune, deploy, or change public Scanner UI. **VISUAL-FREEZE exception requires Alexander's explicit approval.**

Reproduce locally with the certified isolated model/runtime and the external immutable truth:

`node tools/run-scanner-historical-tfjs-baseline.mjs --scoring-policy=verified-real-31 --model-dir=<isolated model directory> --runtime-dir=<isolated tfjs-node 4.22.0 + sharp 0.34.5 directory> --truth=<piece-labels-v0.1.json> --output=artifacts/scanner-classifier-baseline/historical-tfjs-verified-real-benchmark.json --timing-output=artifacts/scanner-classifier-baseline/historical-tfjs-verified-real-performance.json`
