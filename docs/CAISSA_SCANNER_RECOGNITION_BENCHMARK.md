# CAISSA Scanner — Recognition Benchmark and Geometry Contract

Status: **PHASE 3 EVALUATION FOUNDATION — EXTENDED BY LOCAL GEOMETRY PROTOTYPE**

Benchmark namespace: `scanner-realworld-v0.1`

Reference canonical board size: **512×512 pixels**

Visual changes authorized: **NONE**

This contract establishes immutable ground truth, deterministic geometry, grouped data splits, and recognizer-independent metrics before CAISSA selects, trains, or integrates a production recognizer. Unit fixtures prove the evaluator; they are not real-world performance data.

## 1. Protection boundary

This work is developer/evaluation infrastructure only. It does not change Capture, Reading, Review/Edit, Workspace, menus, the board, Edit, Export, or New Scan. Phase 3-004 now supplies a local board-localization/homography prototype to this contract; it does not load a model, activate a classifier, upload an image, collect telemetry, or contribute training data.

The existing frozen seam remains authoritative:

`Capture → Reading → routeRecognitionResult() → Review/Edit OR Workspace`

**VISUAL-FREEZE exception requires Alexander's explicit approval.**

## 2. Recognition Geometry Contract

A future homography must produce one canonical square image. Tile boundaries are derived only from that image's dimensions, never from per-square visual features.

Required invariants:

- `width === height`;
- width and height are positive safe integers;
- `width % 8 === 0`;
- `tileSize = width / 8`;
- exactly 64 tiles in row-major image-grid order;
- every tile is exactly `tileSize × tileSize`;
- zero gaps and zero overlaps;
- the union of all tile rectangles exactly covers the canonical board;
- repeated extraction from the same metadata is byte-for-byte deterministic.

For row `r` and column `c`, both in `[0..7]`:

```text
x0 = c * tileSize
y0 = r * tileSize
x1 = (c + 1) * tileSize
y1 = (r + 1) * tileSize
```

No independent boundary detection, fractional accumulation, local rounding, or confidence-selected inset may alter those boundaries after homography. Invalid geometry returns a typed `recognition-geometry-failure`; extraction never rounds, stretches one row differently, or creates compensating cells.

### Replit uneven-square regression protection

The recovered implementation's uneven-square failure is prevented structurally:

1. square and divisibility checks run before extraction;
2. one integer `tileSize` is computed once;
3. all 64 rectangles use multiplication from the same origin;
4. the final tile ends exactly at `width,height`;
5. tests mark every canonical pixel and prove each belongs to exactly one tile at 256, 512, and 1024;
6. 255, 510, and non-square inputs fail explicitly.

### Reference size versus production decision

512×512 is the deterministic benchmark reference size. It provides 64×64 source tiles before any model-specific resampling, improving localization and anti-aliasing headroom over the recovered 256×256/32×32 path while remaining a modest RGBA working allocation (about 1 MiB before additional buffers).

This is **not** the final production classifier decision. The production invariant is `boardSize % 8 === 0`; 256, 512, and 1024 remain benchmarkable. Model input size, interpolation, device memory, and Mobile Safari latency must be selected from evidence.

## 3. Homography output contract

Square extraction accepts only:

```js
{
  width,
  height,
  pixelSpace,
  sourceCorners,       // TL, TR, BR, BL in source pixel coordinates
  transformMetadata,   // versioned transform/interpolation diagnostics
  orientationState     // unresolved or an explicit resolved orientation
}
```

`sourceCorners` contains four finite `[x,y]` points. `pixelSpace` names the canonical coordinate space. `transformMetadata` preserves the homography version and diagnostics. Phase 3-004 implements and tests this contract in `scanner-board-geometry.js`; the reference size remains configurable rather than a final production decision.

## 4. Tile metadata and orientation separation

Every tile descriptor contains:

- `index`, `row`, `col`;
- `imageGridCoordinate`;
- `file`, `rank`, and `square` when chess orientation is resolved;
- `x`, `y`, `x1`, `y1`, `width`, `height`;
- `pixelSpace`.

With White at the bottom, order is `a8, b8, …, h8, a7, …, h1`. When orientation is unresolved, image-grid positions remain `r0c0 … r7c7` while `file`, `rank`, and `square` remain `null`. Raw pixels are never mislabeled as chess squares before orientation is known.

## 5. Versioned benchmark schema

Manifest schema: `caissa-scanner-benchmark-manifest/1`

Sample schema: `caissa-scanner-benchmark/1`

Required per sample:

- `sampleId`, `schemaVersion`, and `sourceType`;
- `sourceReference` with `kind` and stable value;
- lowercase `sha256:` source checksum;
- provenance origin and license;
- consent status;
- image width and height;
- `train`, `development`, or `test` split;
- one or more registered benchmark categories;
- `groundTruth.boardPresent`;
- conditions object;
- source, position, piece-family, board-theme, and augmentation grouping identifiers.

Optional when genuinely unknown or inapplicable:

- capture device details;
- individual condition fields;
- ground-truth board corners;
- orientation.

For board-positive samples, placement FEN and exactly 64 square labels are required. For hard negatives, they are forbidden. Allowed square labels are:

`empty P N B R Q K p n b r q k`

The label order is `a8` through `h1` after White-at-bottom normalization. Validation fails closed unless all 64 labels use the allowed classes and exactly reproduce the placement FEN.

### Placement FEN only

The image-recognition truth is the FEN **piece-placement field**, not an assumed six-field game state. Side to move, castling, en-passant, halfmove, and fullmove values are scored only by a future explicitly evidenced task. Static board pixels usually cannot establish them reliably.

## 6. Immutability and source policy

- Every referenced fixture records SHA-256.
- Evaluation records the byte-level manifest SHA-256.
- Source and ground-truth paths are opened read-only.
- The evaluator never rewrites a manifest, source image, label, or checksum.
- Reports are separate artifacts.
- Large real datasets remain outside Git unless a later governance decision says otherwise.
- A checksum mismatch, invalid path, invalid schema, or inconsistent label/FEN record fails evaluation.

No automatic upload, image telemetry, hidden collection, or training contribution is permitted. Acceptable future sources are CAISSA-controlled photos, public-domain or permissively licensed diagrams, intentionally created lawful screenshots, Alexander-created internal book/photo tests, and later explicitly consented contributions. Provenance and licensing are mandatory; blind scraping is prohibited.

## 7. Grouped split policy

Individual square tiles must never be randomly split. `scanner-realworld-v0.1` keeps these identifiers exclusive across train, development, and test:

- `sourceGroup` — original image, document/page, or capture session;
- `positionGroup` — base chess position;
- `pieceFamilyGroup` — related piece artwork/font family;
- `augmentationFamilyGroup` — an original and all derived crops/rotations/compressions.

`boardThemeGroup` is recorded and may also be declared exclusive by a manifest. The manifest explicitly lists its exclusive fields, and the validator rejects any identifier found in more than one split. The final test set is not used for training, threshold choice, or preprocessing selection.

## 8. Benchmark categories

The schema supports clean digital diagrams; app/site screenshots; modern printed books; old/yellowed books; physical boards; perspective; rotations; shadows; glare; blur; low resolution; compression; coordinates; annotations/arrows/highlights; unusual valid colors; multiple-board hard negatives; non-board hard negatives; and partial/cropped boards.

Categories may overlap. Reports include counts and failures by category so a large easy bucket cannot hide a weak stratum.

## 9. Recognizer-independent evaluator

Input is:

```text
immutable benchmark manifest + recognizer outputs → deterministic report
```

The evaluator does not import a model. Each adapter supplies sample ID, detection status, candidate placement, corners, orientation, 64 predicted classes, optional probability/confidence data, geometry status, warnings, timings, model version, and preprocessing version. A future `HistoricalTFJSBaseline` can therefore be measured without integrating it into Scanner.

Run read-only evaluation with:

```powershell
node scanner/recognition/benchmark/run-benchmark.mjs <manifest.json> <recognizer-output.json> > benchmark-report.json
```

The report serializer recursively sorts object keys and adds no current timestamp, so identical inputs produce identical bytes.

## 10. Metrics

Implemented metrics are:

- detection confusion counts, success rate, false-positive rate, and false-negative rate;
- normalized corner RMSE and worst-corner error when both corner records exist;
- geometry success/failure and the equal-cell requirement;
- orientation accuracy and ambiguity rate;
- occupied-versus-empty, color, piece-type, and full 13-class accuracy;
- deterministic 13×13 confusion matrix;
- exact 64-square board accuracy and exact placement-FEN accuracy;
- total wrong squares;
- correction-count buckets and mean/median corrections;
- Brier score and expected calibration error when full probabilities exist;
- low-confidence recall and review error-capture rate for the recorded threshold;
- mean/median latency and peak memory when supplied;
- failures by category.

Quadrilateral overlap is reserved as `null` until a localization evaluator defines deterministic polygon clipping. It must not be fabricated from corner error.

### Exact-board accuracy is critical

A board is exact only if all 64 labels match. A result with 63/64 correct squares has 98.4375% square accuracy and **0% exact-board accuracy** for that sample. Reports always include both values.

### Correction burden

`correctionCount` is the number of predicted square labels a person would have to change in Review/Edit. Reports include:

- zero, one, two, and three-or-more counts and percentages;
- mean corrections;
- median corrections.

Detection failures do not pretend that 64 edit operations are possible; they are recorded as pipeline failures and excluded from editable correction-count statistics.

## 11. Benchmark versioning and claims

Benchmark versions use `scanner-realworld-vMAJOR.MINOR`. A report records:

- benchmark version;
- manifest SHA-256;
- report schema version;
- recognizer/model version;
- preprocessing version;
- backend;
- device and browser when relevant;
- confidence/review threshold used for that run.

A changed image, label, split, or ground-truth record changes the manifest/checksum and requires a reviewed benchmark version. Accuracy claims must cite this complete identity. Unit-fixture results may validate math only and must never be presented as model performance.

## 12. First real-world acquisition plan

Target **180 diverse source images** for `scanner-realworld-v0.1` before drawing meaningful product conclusions:

- 40 clean digital diagrams;
- 30 screenshots from multiple lawful apps/sites;
- 30 modern printed-book diagrams;
- 20 old/yellowed or grayscale book diagrams;
- 30 controlled physical-board photos;
- 10 multiple-board hard negatives;
- 10 non-board hard negatives;
- 10 partial/cropped-board negatives.

The positive buckets should deliberately overlap condition quotas: at least 25 moderate-perspective captures, 20 rotated sources, 20 shadow/glare cases, 20 blur/low-resolution/compression cases, and 20 coordinate/annotation/unusual-color cases. Include at least six independently licensed piece families, six board styles, and three capture-device/setup families.

After deduplication and grouping, reserve approximately 40 sources for development and 140 for a sequestered test set, with entire source, position, piece-family, and augmentation groups assigned together. Do not create 180 near-identical screenshots to hit a count. Do not collect automatically and do not use user photos without explicit permission.

## 13. Test fixtures

The committed PGM and JSON fixture are labeled **TEST FIXTURE — NOT REAL-WORLD PERFORMANCE DATA**. They verify:

- perfect prediction;
- one wrong square;
- wrong color and wrong type;
- missing board;
- orientation error;
- geometry failure;
- confidence handling;
- checksum immutability;
- grouped split leakage;
- deterministic reports.

They do not establish recognition quality.

## 14. Deferred work

The repository now includes local image decode and a synthetic-evidence board-localization/homography prototype. Real-world localization certification, orientation inference, a classifier adapter, a production model, a visual dashboard, production routing, and any visible Scanner change remain deferred.
