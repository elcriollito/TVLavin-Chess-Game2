# CAISSA Scanner — Board Localization and Homography Prototype

Status: **PHASE 3-004 PROTOTYPE — SYNTHETIC GEOMETRY EVIDENCE ONLY**

Localizer version: `caissa-scanner-board-localizer/1`

Homography version: `caissa-scanner-homography/1`

Reference canonical board: **512×512 RGBA**

Visual changes authorized: **NONE**

This prototype extends the local decode/Worker foundation with evidence-driven board localization, strict quadrilateral validation, a true projective homography, and an exact 64-cell canonical geometry. It implements no piece classification, model integration, chess-orientation inference, Candidate FEN recognition, server inference, upload, training, or confidence-based routing.

The existing mock Candidate FEN still follows a successful geometry result solely to keep the certified Scanner flow testable. Internally the candidate is labeled `geometry-only` and `pieceRecognition: not-implemented`; the mock FEN is not attributed to the image.

## 1. Frozen integration boundary

The public flow remains:

`Capture → Reading → routeRecognitionResult() → Review/Edit OR Workspace`

No control, layout, menu, board, toolbar, Export, New Scan, Edit Board, engine, color, or typography change is part of Phase 3-004. No manual-corner interface is present.

**VISUAL-FREEZE exception requires Alexander's explicit approval.**

## 2. Worker pipeline

The dedicated recognition Worker now performs:

```text
bounded oriented RGBA working image
→ luminance analysis copy, maximum edge 256 px
→ two-threshold Sobel edge evidence
→ connected edge structures
→ convex hulls and quadrilateral hypotheses
→ four-corner ordering and strict validation
→ 8×8 grid/checker evidence scoring
→ unambiguous candidate selection
→ 3×3 projective homography
→ 512×512 RGBA inverse warp
→ shared Recognition Geometry Contract
→ structured local result
```

The Worker remains independent from Stockfish and is reused across Scanner requests. Geometry is synchronous inside the Worker, so it cannot block the UI thread.

## 3. Candidate generation

The dependency-free MVP uses targeted JavaScript rather than OpenCV.js:

1. RGBA is converted to luminance at a maximum analysis edge of 256 pixels. The source working image remains bounded by Phase 3-003.
2. A Sobel magnitude map is computed.
3. Strong and soft adaptive thresholds create two edge masks. The softer pass helps retain lower-contrast outer borders without weakening scoring requirements.
4. Each mask is dilated by one analysis pixel so grid intersections remain connected.
5. Connected edge structures are bounded and sorted by evidence size.
6. Each component is converted to a convex hull.
7. At most 24 hull samples are considered, and the maximum-area cyclic four-point subset becomes a candidate.
8. Candidate arrays and diagnostic summaries are capped at 12.

A full-frame grid hypothesis is also scored. It is not a localization failure fallback: it is accepted only when the image itself supplies the same explicit 8×8 checker and bidirectional grid evidence as any other candidate. Failure never fabricates full-image corners, a center crop, or a fixed inset.

The localizer can emit zero, one, or several candidates. It does not simply choose the largest rectangle.

## 4. Candidate scoring

Every valid candidate is rectified to an 80×80 luminance scoring surface. Scoring measures:

- `gridEvidenceScore` — boundary contrast at the seven expected internal file/rank boundaries, horizontal/vertical balance, and boundary consistency;
- `checkerEvidenceScore` — alternating square-luminance separation and within-parity consistency, sampled away from typical central piece mass;
- `edgeEvidenceScore` — expected boundary evidence relative to off-grid evidence;
- `geometryScore` — angle, opposing-edge, and thinness plausibility from the quadrilateral validator;
- `candidateScore` — deterministic weighted evidence, not a calibrated probability.

Current formula:

```text
0.54 × gridEvidenceScore
+ 0.31 × checkerEvidenceScore
+ 0.10 × geometryScore
+ 0.05 × edgeEvidenceScore
```

Acceptance requires all of:

- candidate score at least `0.50`;
- grid evidence at least `0.35`;
- checker evidence at least `0.24`.

These thresholds are prototype policy constants selected for deterministic synthetic tests. They are not product confidence or real-world calibration.

The checker requirement rejects uniform table-like grids that have line periodicity but no alternating chessboard structure. Bidirectional evidence rejects stripe-only patterns.

## 5. Four-corner ordering

`orderCorners()` accepts four finite distinct points in any input order. It:

1. computes their centroid;
2. sorts cyclically by polar angle;
3. normalizes winding;
4. chooses the minimum `x + y` corner as the canonical start, with deterministic coordinate tie-breaking.

The output order is always:

1. top-left;
2. top-right;
3. bottom-right;
4. bottom-left.

Tests cover clockwise, counter-clockwise, random, perspective-trapezoid, and diamond-like inputs. Ordering is a distinct operation. The validator does not silently reorder a supplied bow-tie or otherwise repair invalid geometry.

## 6. Quadrilateral validation

The validator checks:

- exactly four finite points;
- distinct corners;
- non-zero signed area;
- no non-adjacent edge intersection;
- consistent convex winding;
- minimum edge length;
- image bounds;
- configurable minimum and maximum area ratios;
- opposing-edge ratio no greater than 6:1;
- horizontal/vertical thinness at least 0.18;
- every interior angle between 18° and 162°.

It returns measurable shape metadata plus explicit rejection reasons such as:

- `duplicate-corner`;
- `self-intersection`;
- `zero-area`;
- `non-convex`;
- `collapsed-edge`;
- `out-of-bounds`;
- `area-too-small`;
- `opposing-edges-implausible`;
- `quadrilateral-too-thin`;
- `corner-angle-implausible`.

Invalid geometry is not corrected, stretched, or reduced to min/max X/Y.

## 7. True projective homography

Source corners map to the continuous canonical board boundary:

```text
top-left     → (0, 0)
top-right    → (boardSize, 0)
bottom-right → (boardSize, boardSize)
bottom-left  → (0, boardSize)
```

For a source point `(x,y)` and destination `(u,v)`:

```text
u = (h00x + h01y + h02) / (h20x + h21y + 1)
v = (h10x + h11y + h12) / (h20x + h21y + 1)
```

The implementation fixes `h22 = 1` and solves the resulting eight-equation linear system with deterministic partial-pivot Gaussian elimination. It then computes the full inverse 3×3 matrix.

Both source-to-board and board-to-source matrices are retained with corner reprojection diagnostics. Singular or unstable systems return `homography-failed`. This is a projective transform; it is not an affine approximation, bounding-box crop, independent row/column resize, or historical fixed inset.

The same `rectifyBoard()` core accepts already ordered automatic or future manually corrected corners. A future manual UI would still require separate visual approval.

## 8. Resampling and canonical output

The default board size is 512×512, configurable to any positive size divisible by eight.

The warp uses inverse mapping from every destination pixel center into source coordinates and bilinear interpolation across all four RGBA channels.

- Interpolation: bilinear RGBA.
- Edge behavior: clamp to the nearest source edge.
- Alpha: interpolated and preserved.
- Output: one canonical RGBA `ArrayBuffer`.
- Crop: only the validated projective board quadrilateral.
- Chess orientation: `unknown` / geometry `unresolved`.

No grayscale-only classifier surface and no historical 32×32 square input are produced here. The 512 board retains 64×64 source cells for future benchmarked classifiers.

## 9. Exact 64-square geometry contract

The Worker and benchmark now share the same geometry core. After homography the output must satisfy:

- width equals height;
- size is a positive safe integer;
- size is divisible by eight;
- one integer `tileSize = boardSize / 8`;
- exactly 64 row-major descriptors;
- identical tile width and height;
- no gaps;
- no overlaps;
- complete canonical-board coverage.

Every tile uses multiplication from the same origin:

```text
x0 = column × tileSize
y0 = row × tileSize
x1 = (column + 1) × tileSize
y1 = (row + 1) × tileSize
```

Tests mark every canonical pixel and require a coverage count of exactly one. This structurally prevents the recovered Replit uneven-square defect. The localizer never adjusts individual rows or columns to improve grid evidence.

## 10. Multiple-board and no-board behavior

Accepted candidates are sorted by score. If the top two candidates differ by less than `0.08`, the Worker returns:

`multiple-board-candidates`

The error includes bounded candidate summaries, scores, and score separation. No board is chosen silently and there is no visible selection UI.

If no candidate passes geometry, grid, checker, and total-score requirements, the Worker returns:

`board-not-found`

It never falls back to a center crop, whole-image crop, or fabricated corners.

## 11. Result contract

Successful Worker responses use `type: 'board-localized'` and `status: 'board-localized'` with the existing protocol identity:

```js
{
  protocol: 'caissa-scanner-recognition-worker/1',
  version: 1,
  generation,
  requestId,
  source: metadata,
  board: {
    pixels,                 // transferred 512×512 RGBA ArrayBuffer
    corners,                // working-image TL,TR,BR,BL
    boardSize,
    candidateScore,
    geometryScore,
    gridEvidenceScore,
    checkerEvidenceScore,
    orientation: 'unknown',
    transformMetadata,
    geometry               // exact 64-tile contract
  },
  diagnostics,
  timing
}
```

Failure remains `type: 'recognition-error'` with `generation`, `requestId`, a typed code, bounded internal diagnostics, and timing. Raw diagnostics are not exposed in the certified UI.

New geometry codes are:

- `board-not-found`;
- `multiple-board-candidates`;
- `invalid-quadrilateral`;
- `homography-failed`;
- `geometry-contract-failed`.

Existing decode, Worker, stale-generation, and cancellation codes remain active.

## 12. Generation and cancellation

Scanner state remains the only generation authority. The runtime still checks generation after decode, before Worker transfer, on Worker response, and before installing the mock candidate.

Worker geometry is synchronous once processing begins, so a queued cancel message cannot interrupt an individual JavaScript loop. Cancellation is nevertheless deterministic at the main-thread boundary: pending work is removed, late responses are ignored, and stale geometry cannot mutate Scanner state. The Worker is reused rather than terminated for every scan.

## 13. Memory and performance

Bounded working-set design:

- Phase 3-003 source RGBA: at most 16,000,000 bytes;
- luminance analysis surface: at most 256×256 float32, about 256 KiB;
- edge magnitude and masks: bounded to the same analysis dimensions;
- candidate summaries: capped at 12;
- scoring surface: 80×80 float32;
- canonical output: 512×512×4, exactly 1 MiB;
- no retained candidate crops;
- canonical pixels are transferred back rather than cloned.

Internal timings record:

- `localizationMs`;
- `candidateScoringMs`;
- `homographyMs`;
- `geometryValidationMs`;
- `totalGeometryMs`;
- aggregate Worker and preprocessing timings from Phase 3-003.

No timing is shown in the UI or transmitted as telemetry.

The main remaining peak-memory risk is the source decoder's native allocation plus the bounded working RGBA buffer. The pure-JavaScript inverse warp may also be slower on older physical iPhones than Playwright WebKit suggests.

## 14. Safari compatibility

Localization uses Worker-safe typed arrays and ordinary JavaScript math. It does not require:

- OffscreenCanvas;
- Worker WebGL;
- WebGPU;
- SharedArrayBuffer;
- threaded WASM;
- OpenCV.js.

The existing Image-element decode fallback still feeds the same Worker RGBA contract. Chromium, Firefox, and WebKit run the actual Worker localization and homography tests. Physical-iPhone memory, latency, foreground/background, and repeated-scan testing remain mandatory.

## 15. Benchmark integration

`toBenchmarkOutput()` adapts a localizer result to the existing recognizer-independent evaluator fields:

- `boardDetected`;
- `predictedCorners`;
- geometry output;
- candidate, geometry, and grid evidence scores;
- localize, warp, and total timing;
- localizer version.

`cornerErrorMetrics()` calculates normalized corner RMSE and worst-corner error against annotated truth. The unit fixtures require normalized RMSE no greater than 0.012 and worst-corner error no greater than 0.02.

Those values are synthetic engineering tolerances, not real-world accuracy claims. Piece and FEN metrics are intentionally absent.

## 16. Deterministic engineering fixtures

Generated fixtures cover:

- perfect axis-aligned board;
- rotated board;
- moderate perspective trapezoid;
- board surrounded by a page/background;
- low-contrast grayscale board;
- several light/dark color families;
- plain non-board image;
- vertical stripes;
- single rectangle;
- uniform non-checker grid;
- two-board ambiguity;
- partial/cropped board;
- degenerate, duplicate, self-intersecting, thin, and non-convex quadrilaterals.

Fixtures contain no user photos and are explicitly not real-world benchmark performance data.

## 17. Privacy

All localization and rectification remain local. The recognition modules contain no image upload, server fallback, image telemetry, persistent browser storage, debug-image write, or training capture. Existing static zero-upload guards include the new geometry files, and the browser flow still requires zero non-GET image-processing requests.

## 18. Known limitations

- Candidate generation currently relies on connected straight-edge/checker structure; borderless boards whose outer edge blends into the background can be missed.
- The scoring thresholds are synthetic-fixture thresholds, not calibrated real-world confidence.
- Dense page tables, patterned textiles, or adversarial checker-like graphics need a larger hard-negative benchmark.
- Severe perspective, lens distortion, curled pages, blur, compression, glare, shadow, and partial occlusion are not certified.
- 3D pieces can obscure square boundaries; controlled physical boards are a target, not a proven capability.
- Multiple boards intentionally abstain without a selector.
- Chess orientation remains unresolved.
- Playwright WebKit is not physical-iPhone certification.

## 19. Boundary for the next task

No piece classification is implemented yet.

The prototype demonstrates correct projective geometry on deterministic synthetic fixtures, but no immutable real annotated board set has yet established adequate localization quality. The evidence therefore supports:

**PHASE 3-004B — LOCALIZATION HARDENING**

That task should add lawful real annotated boards and hard negatives, quantify board-found recall, false positives, normalized corner error, ambiguity, physical-iPhone memory/latency, and compare targeted candidate-generation improvements. Classifier integration must wait until localization is evidence-backed.
