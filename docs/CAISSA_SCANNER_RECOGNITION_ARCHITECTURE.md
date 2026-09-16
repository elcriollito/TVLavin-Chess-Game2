# CAISSA Scanner — Phase 3 Recognition Architecture Audit

Status: **AUDIT / PLANNING ONLY**

Audit date: **2026-09-15**

Scanner baseline: `06321be1fd7335a0e5b41994636c04a6a8431980`

Visual changes authorized: **NONE**

This document records verified repository and recovery evidence separately from proposed Phase 3 architecture. It does not activate recognition, add a model or dependency, upload an image, change Scanner routing, or alter the certified Phase 2C interface.

Terms used below:

- **VERIFIED** — directly observed in the current Scanner worktree or recovered archives.
- **PROPOSED** — an architecture decision recommended for a later implementation task.
- **DEFERRED** — intentionally outside the recognition MVP or dependent on separate approval/evidence.

## 1. Protection boundary

**VERIFIED** — `docs/CAISSA_SCANNER_VISUAL_FREEZE.md` freezes the four exclusive public views and the seam:

`Capture → Reading → routeRecognitionResult() → Review/Edit OR Workspace`

Recognition work must preserve the single board, current board geometry, control order, menus, Edit layout, app-like view ownership, and no-jitter behavior. Recognition internals may evolve behind that seam. A manual-corners screen or any new visible recognition control would be a separate product change and cannot be introduced by the tasks in this plan without explicit approval.

**VISUAL-FREEZE exception requires Alexander's explicit approval.**

## 2. Evidence and archive integrity

### Current repository

**VERIFIED** — the isolated worktree was clean at audit start, on `feature/caissa-scanner-web-lab`, with local `HEAD` equal to `origin/feature/caissa-scanner-web-lab` at `06321be1fd7335a0e5b41994636c04a6a8431980`. The current repository contains no Scanner recognition model, weights, training set, CV runtime, upload endpoint, or recognition dependency.

### Recovered archives

Both recovered Replit archives were found outside the repository. SHA-256 was recorded before inspection. Neither archive was modified and neither was extracted over working source.

| Role | Archive | Bytes | Last write (UTC) | SHA-256 |
|---|---|---:|---|---|
| Primary recovery candidate | `CAISSA-Chess-Position-Scanner .zip` | 215,818,018 | 2026-02-25 01:03:26.2602339 | `7CEEF63C4166A5B1CDA61FB0B392931840D9D29F3B1C48937E376F91C3763729` |
| Older/beta reference | `CAISSA-Chess-Position-Scanner-betta.zip` | 17,136,745 | 2026-02-23 23:19:31.1498305 | `A6FF290C59CFA01332EFDBB31882933B74396C47BF269BA58C12EFF62A853D45` |

Local source paths used for the audit:

- `C:\Users\ALEXANDER\Downloads\Caissa Chess Scanner Diagram\CAISSA-Chess-Position-Scanner .zip`
- `C:\Users\ALEXANDER\Downloads\Caissa Chess Scanner Diagram\CAISSA-Chess-Position-Scanner-betta.zip`

The archives were inspected through isolated audit copies under `C:\Temp\s3a-5d320b62\p` and `C:\Temp\s3a-5d320b62\b`. Those temporary copies are not application source and are not committed.

## 3. Recognition asset inventory

### 3.1 Current frozen Scanner

**VERIFIED**

| Asset | What exists |
|---|---|
| `scanner/scanner-state.js` | Authoritative recognition lifecycle with generations, stale-result rejection, candidate, confirmed result, error and reset states. `setCandidate()` accepts extensible candidate fields. |
| `scanner/scanner-view-state.js` | Independent four-view presentation state machine. Reading can route to Capture, Review/Edit, or Workspace. |
| `scanner/scanner-app.js` | Image selection stays local via `URL.createObjectURL`; a deterministic mock candidate is currently installed after a delay. `routeRecognitionResult()` currently always opens recognition Review/Edit. |
| `scanner/scanner-fen.js` | FEN parsing/serialization, exactly-eight-ranks/eight-files checks, allowed piece characters, six FEN fields, side/castling/en-passant/counter syntax, and exactly one king of each color for final validation. |
| `scanner/scanner-adapters.js` | Confirmed FEN handoff to CAISSA Analyze and Lichess; orientation is already represented as `'white'` or `'black'`. |
| Scanner tests | Visual freeze contract, state-generation guard, FEN helpers, persistent 64-square geometry, browser flow and cross-browser tests. |

The current state already has fields for `generation`, candidate `fen`, `boardConfidence`, `pieceConfidenceBySquare`, `lowConfidenceSquares`, and `orientation`. No parallel recognition store is needed.

### 3.2 Primary recovered archive

**VERIFIED**

| Area | Files / facts |
|---|---|
| Model | `models/tile-classifier/model.json`, `weights.bin`, `metadata.json` |
| Runtime | `server/ml-classifier.ts`, `server/board-analyzer.ts` using `@tensorflow/tfjs-node` 4.22 and Sharp |
| Training | `training/generate-dataset.ts`, `train-model.ts`, `ingest-real.ts` |
| Evaluation | `training/evaluate-model.ts`, `evaluate-pipeline.ts`, `analyze-image.ts`, `create-test-image.ts` |
| Synthetic assets | `training/data/labels.json`; 115,200 binary tiles, each exactly 1,024 bytes; 484 PNG board screenshots |
| Renderer | `training/board-renderer.html`, six color themes and one Unicode chess-glyph set |
| APIs | `/api/analyze-board`, `/api/test-image`, `/api/ingest-real`, `/api/model-status` |
| Historical notes | `replit.md` plus recovered prompt/debug notes describing known real-image failures and intended real-data ingestion |

No notebooks, ONNX files, TFLite files, OpenCV implementation, Python training code, real-image manifest, real tiles, real labels, or persisted real-world benchmark results were found in the recovered current tree.

The 484 residual screenshots cover 81 position indices and six themes (`blue`, `brown`, `gray`, `green`, `purple`, `wood`); two expected `pos80` images are absent. They use one browser/Unicode glyph style. The current 115,200-tile label manifest does not reference those PNGs; the active generator instead draws one set of simple geometric SVG silhouettes.

### 3.3 Older/beta archive

**VERIFIED**

The beta archive contains the React Native/Expo application, manual crop/editor flow, and a Sharp-based server heuristic. It contains no trained model, model weights, ML training dataset, `ml-classifier.ts`, TensorFlow dependency, or real benchmark.

Its `BoardCropScreen.tsx` shows four draggable handles, rotate, and horizontal/vertical flip. On confirmation it reduces the four handle positions to `minX/maxX/minY/maxY`, performs an axis-aligned rectangular crop, and resizes to 800×800. It does not order a quadrilateral, validate convexity, compute a homography, or warp perspective. It is therefore a manual rectangular crop helper, not four-corner perspective correction.

Its `server/board-analyzer.ts` uses brightness/color/edge heuristics on a square center crop. Piece-type confidence is mostly hard-coded around 0.35–0.45. It is historical failure/reference material, not a credible recognizer.

## 4. Historical model audit

### 4.1 Model facts

**VERIFIED**

| Property | Value |
|---|---|
| Framework | TensorFlow.js Layers, trained/loaded with `@tensorflow/tfjs-node` 4.22.0 |
| Format | TensorFlow.js `layers-model`: `model.json` plus one `weights.bin` shard |
| Weight file | 2,179,636 bytes; SHA-256 `2FF117276E1D22BEAC35F2DBDBC4D8A29650917A9D657E81FFDFB026ADD2C458` |
| Input | `[batch, 32, 32, 1]`, float32 grayscale |
| Preprocessing | Per-tile min/max histogram stretch (unless range < 10), then byte value divided by 255 |
| Classes / exact output order | `empty`, `P`, `N`, `B`, `R`, `Q`, `K`, `p`, `n`, `b`, `r`, `q`, `k` |
| Architecture | Conv2D 32 3×3 ReLU → 2×2 max pool → Conv2D 64 3×3 ReLU → 2×2 max pool → flatten → dense 128 ReLU → dropout 0.3 → dense 13 softmax |
| Parameters | 544,909 float32 parameters, derived from the recorded weight shapes |
| Metadata version | `4.0.0` |
| Training run | 1 epoch, batch size 256, Adam learning rate 0.001 |
| Training/validation | 97,920 synthetic train tiles; 17,280 synthetic validation tiles; 0 real train or validation tiles |
| Recorded metric | Synthetic validation accuracy `0.9655092592592592` (96.5509259%); final validation loss `0.13905350863933563` |

The model topology uses standard TensorFlow.js Layers operations and is technically loadable by browser TensorFlow.js without conversion, subject to a browser-runtime compatibility test. The recovered server code itself depends on the native Node binding and cannot run in a browser unchanged.

### 4.2 Dataset facts and limitations

**VERIFIED**

- 115,200 labels and 115,200 unique 32×32 grayscale `.bin` tiles.
- 60 unique FENs and all 64 square names.
- Seven base board colors are generated (`green`, `brown`, `blue`, `walnut`, `maple`, `cherry`, `ebony`), with clean and augmentation labels producing 21 recorded theme names.
- Exact class counts: empty 79,350; `P` 6,750; `N` 3,030; `B` 2,490; `R` 2,460; `Q` 1,890; `K` 1,800; `p` 6,510; `n` 2,220; `b` 2,460; `r` 3,000; `q` 1,440; `k` 1,800.
- Synthetic effects include brightness/contrast/noise, gamma, vignette, local rectangular shadow, Gaussian blur, small rotation, JPEG artifacts, sharpening, color variation, borders and occasional coordinates.
- All current generated pieces come from one handcrafted geometric silhouette generator. The residual screenshot set uses one Unicode glyph family. Neither provides meaningful multi-piece-set generalization.
- No real tiles or real labels are present despite real-ingest code.

The training script shuffles individual tiles and then takes a 15% synthetic validation split. Sibling squares, render-size variants and augmented derivatives of the same FEN/style can therefore appear across train and validation. There is no held-out image-source, position, piece-set or theme split. The 96.55% result is a valid record of that synthetic tile split, not evidence of real-image accuracy.

`replit.md` claims 96.70% tile accuracy, 99.24% square accuracy over 180 pipeline boards, 140/140 clean boards, and about 50% bordered-board success. No immutable result file or test output supporting those figures exists in the archive, and the recorded metadata differs on tile accuracy. Those values are **historical claims, not verified metrics**.

Recovered notes explicitly say the high-synthetic-accuracy model failed on real images/screenshots with coordinates. That statement is consistent with the absence of real data and the domain limitations, but it is not a quantified benchmark.

## 5. Asset disposition

| Asset | Classification | Rationale |
|---|---|---|
| Current `scanner-state.js` generation/candidate seam | **A — REUSE DIRECTLY** | Already tested, extensible and prevents stale results. |
| Current `routeRecognitionResult()` and view-state seam | **A — REUSE DIRECTLY** | Canonical frozen integration point; policy can change internally without a visual redesign. |
| Current FEN parser/serializer | **A — REUSE DIRECTLY** | Appropriate structural boundary; extend with separate warning logic rather than replacing it. |
| Recovered model topology/weights | **B — REUSE AS REFERENCE** | Loadable experimental baseline, but synthetic-only and uncalibrated on real images. Must not ship as proof of recognition quality. |
| Recovered class order and 32×32 preprocessing | **B — REUSE AS REFERENCE** | Useful compatibility baseline; must be benchmarked against stronger real-data variants. |
| Recovered training/evaluation scripts | **B — REUSE AS REFERENCE** | Reproducible ideas, but validation leakage, nondeterministic sampling and no immutable benchmark reports need correction. |
| Recovered synthetic tiles/screenshots | **B — REUSE AS REFERENCE** | Useful smoke-test/domain-randomization seed; insufficient and strongly style-biased. Do not mix into a real holdout. |
| Recovered real-ingest design | **B — REUSE AS REFERENCE** | Demonstrates labels-from-FEN, but persistence/consent/provenance are not acceptable as production design. |
| Recovered board-localization code | **E — DISCARD** for production; **B** for failure cases | Axis-aligned projections and forced square resizing cannot solve perspective/localization reliably. |
| Recovered destructive chess postprocessing | **E — DISCARD** | It injects/removes kings, caps queens at two and guesses promotions, silently changing evidence. |
| Beta heuristic classifier | **E — DISCARD** | Hand-coded fill/edge thresholds with low piece-type confidence and no credible generalization evidence. |
| Beta four-handle crop screen | **B — REUSE AS REFERENCE** | Interaction concept may inform an approved advanced fallback, but its transform is rectangular only and its React Native code does not fit the current web app. |
| A future production classifier | **D — RETRAIN REQUIRED** | Requires real, grouped, independently held-out data and calibration. |
| ONNX version of the old model | **C — REUSE AFTER CONVERSION** only for an ORT experiment | No ONNX artifact exists. Conversion must be numerically parity-tested and offers no accuracy improvement by itself. |

## 6. Board localization audit

**VERIFIED** — the primary archive computes Sobel magnitude after EXIF-aware `sharp.rotate()`, resizes/crops the source to 512×512, sums horizontal/vertical edge projections, selects peaks, and derives an axis-aligned bounding rectangle. If detection fails, the full square image is used. It optionally tests 4%, 6%, 8% and 10% inner rectangular crops and chooses the crop with the highest mean classifier top probability.

This implementation:

- can sometimes find an already upright, approximately square grid with strong horizontal and vertical lines;
- does not identify four true corners;
- does not distinguish a board from another regular grid robustly;
- does not support a projective quadrilateral;
- forces non-square source geometry through square crop/fill operations;
- can mistake page borders, coordinates or other high-contrast lines for board edges;
- has no multiple-board selection, hard-negative detector, partial-board test, clutter model or detector benchmark.

Classification: **prototype-only**, with the beta rectangle helper as a **manual fallback reference**. No production-usable automatic localization exists.

## 7. Perspective / homography audit

**VERIFIED** — no implementation was found for corner ordering, convex quadrilateral validation, line-intersection scoring, homography estimation, perspective warp, reprojection error, or normalized board warp. The historical use of the word “warp” in notes does not match the code.

The beta four handles are visually independent but collapse to an axis-aligned box before cropping. That is not perspective correction.

**PROPOSED** — a later localization module should return four ordered source-image corners (`topLeft`, `topRight`, `bottomRight`, `bottomLeft`), detector confidence, diagnostics and candidate alternatives. A deterministic geometry module should validate convexity, minimum area, edge lengths, angle/projective plausibility and grid evidence, then compute a 3×3 homography and warp into a square board. The source-to-board and inverse matrices should remain available for diagnostics and optional local correction records.

**DEFERRED** — a manual four-corner correction tool is an advanced fallback, not the primary recognizer. It would change visible UX and therefore requires a separate visual-freeze decision before implementation.

## 8. Orientation audit

**VERIFIED**

- Sharp applies EXIF rotation, but that only corrects camera metadata.
- The old crop UI offers manual 90-degree rotation and horizontal/vertical flips.
- The classifier and FEN generator always read the normalized image top-to-bottom and append `w - - 0 1`.
- No code infers White-at-bottom versus Black-at-bottom, 90/180/270-degree board rotation, file/rank direction, printed coordinates, pawn direction or orientation confidence.
- The current Scanner already retains a board display flip and hands `'white'`/`'black'` orientation to Analyze, but that is display state, not image-orientation recognition.

**PROPOSED MVP strategy**

1. Normalize EXIF first.
2. Evaluate board rotations 0°, 90°, 180° and 270° after localization.
3. Reject 90°/270° candidates unless grid/coordinate evidence supports them; chess piece placement alone is ambiguous.
4. Use printed coordinate OCR only as optional evidence, not a required dependency.
5. Score both White-bottom and Black-bottom interpretations using calibrated classifier evidence plus soft chess plausibility (pawn ranks/direction, king/pawn distribution). Do not treat starting-position habits as rules.
6. If orientation is not decisively supported by evidence, return `orientation: 'unknown'`, a warning, and Review/Edit. Do not silently guess.

Side to move, castling rights, en-passant target and move counters are generally not visible in a board image. The Candidate FEN may use neutral defaults (`w - - 0 1`) only when accompanied by explicit ambiguity warnings and Review/Edit routing.

## 9. Normalized board and square contract

### Verified compatibility baseline

- Board: 256×256 luminance bytes.
- Grid: exact 8×8.
- Tile: 32×32×1.
- Tile order: rank 8 to rank 1, file a to file h after orientation normalization.
- Tile normalization: local min/max stretch when range is at least 10, then float32 `[0,1]`.
- Class order: `empty P N B R Q K p n b r q k`.

### Proposed Phase 3 contract

**PROPOSED**

1. Decode locally, apply EXIF orientation and reject unsupported/oversized/corrupt input safely.
2. Preserve an immutable source-space coordinate system; downsample a working copy with aspect ratio intact. A 1,600-pixel maximum working edge is a starting experiment, not a frozen value.
3. Localize a single four-corner board quadrilateral.
4. Warp with a documented interpolation mode to a square. Keep 512×512 as a localization/diagnostic working board, then derive the classifier input deterministically.
5. Normalize orientation.
6. Derive an exact 256×256 compatibility board and 64 exact 32×32 tiles for the recovered baseline.
7. Preserve RGB/luminance/edge variants in the benchmark harness so a retrained model can compare 32×32 grayscale with 64×64 or color input. Do not commit to a larger production model without evidence.
8. Use a small, fixed inset only if benchmarked; never let classifier top probability choose arbitrary crops because an overconfident wrong crop can reinforce itself.
9. Record every preprocessing version in the recognition result and benchmark manifest.

Avoid aggressive background removal. Contrast normalization, grayscale, edge channels and color normalization must be ablated on real sets: book paper, wood texture, coordinates and piece interiors can all be destroyed by the wrong normalization.

## 10. Chess-aware postprocessing

### Existing checks

**VERIFIED** — current `scanner-fen.js` distinguishes syntactically parseable drafts from final positions and requires exactly one white king and one black king on final validation. It does not validate pawn ranks, adjacent kings, impossible check state, total pieces, promotions, or consistency between castling rights and piece placement.

The recovered primary code also tries to enforce kings, demote low-confidence pieces, cap queens and rewrite back-rank pawns. Those operations are destructive guesses and must not be imported.

### Proposed validation categories

**PROPOSED**

Hard invalidity (no routable Candidate FEN):

- not exactly eight ranks or eight files per rank;
- unknown class/piece character;
- incomplete 64-square classifier output;
- non-finite/missing probability vectors;
- impossible mapping between normalized grid and square names;
- corrupt result schema or stale generation.

Needs-review warnings (candidate retained; never silently repaired):

- zero or multiple white/black kings;
- pawn on rank 1 or 8;
- adjacent kings;
- both kings simultaneously in check, when legal-state validation is available;
- orientation unresolved;
- board/corners uncertain;
- low-confidence occupied squares or small top-1/top-2 margins;
- material counts that require promotions;
- castling/side-to-move/en-passant not inferable from the image.

Soft suspicious warnings:

- more than eight pawns of a color;
- more than the normal starting count for a piece type;
- more than two queens (legal through promotion, so never cap them);
- unusual piece distribution or occupancy;
- strong classifier disagreement with square/background evidence.

Postprocessing may rank alternatives or raise warnings. It must not invent kings, erase pieces, convert pawns to queens, or otherwise mutate the top candidate without preserving the original per-square probabilities and an auditable reason.

## 11. Proposed recognizer output contract

The current state store should remain authoritative. A future recognizer returns one immutable value to `setCandidate(generation, result)`:

```js
{
  schemaVersion: 'caissa-scanner-recognition/1',
  generation: 12,
  status: 'candidate', // candidate | no-board | unsupported | error
  fen: '8/8/8/8/8/8/4K3/7k w - - 0 1', // null unless structurally complete
  boardPart: '8/8/8/8/8/8/4K3/7k',
  orientation: 'white', // white | black | unknown
  orientationConfidence: 0.0,
  boardConfidence: 0.0,
  pieceConfidenceBySquare: {
    a8: { predicted: 'empty', probability: 0.0, runnerUp: 'r', runnerUpProbability: 0.0 }
  },
  lowConfidenceSquares: ['a8'],
  warnings: [
    { code: 'SIDE_TO_MOVE_UNKNOWN', severity: 'review', squares: [], messageKey: 'side-to-move-unknown' }
  ],
  localization: {
    corners: {
      topLeft: [0, 0], topRight: [0, 0], bottomRight: [0, 0], bottomLeft: [0, 0]
    },
    coordinateSpace: 'source-pixels',
    detectorVersion: '...',
    preprocessingVersion: '...'
  },
  model: { id: '...', version: '...', classOrder: ['empty', 'P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k'] },
  sourceMetadata: {
    kind: 'camera', // camera | gallery
    width: 0,
    height: 0,
    mimeType: 'image/jpeg',
    processedLocally: true,
    uploaded: false
  },
  timingsMs: { decode: 0, localize: 0, warp: 0, classify: 0, postprocess: 0, total: 0 }
}
```

Contract rules:

- Probabilities are unrounded internal numbers in `[0,1]`; presentation decides formatting.
- `boardConfidence` is calibrated detector confidence, not line count or average classifier confidence.
- `lowConfidenceSquares` is derived by a versioned policy, not a hard-coded universal 0.60.
- Warnings use stable codes/severity; user-facing copy remains outside the recognizer.
- `sourceMetadata` contains no path, image bytes, EXIF location, account ID or persistent fingerprint.
- Full probability vectors may exist in an opt-in local debug harness, but are not needed in normal app state.
- `generation` must match the active state generation before any result is accepted.

## 12. `routeRecognitionResult()` integration seam

**VERIFIED** — current selection flow is:

1. validate image MIME type;
2. `beginSource()` increments generation and clears old position;
3. enter Reading;
4. `beginRecognition(generation)`;
5. asynchronous candidate is accepted only by matching `setCandidate(generation, ...)`;
6. `routeRecognitionResult()` currently opens recognition Review/Edit;
7. Apply confirms; Cancel resets safely to Capture.

**PROPOSED**

```text
Capture
  → valid local image
  → Reading
  → worker recognizes with generation token
  → state.setCandidate(generation, result)
  → routeRecognitionResult(result, versionedPolicy)
       ├─ no board / corrupt / unsupported → fail safely → Capture + retry
       ├─ candidate requiring review       → existing Review/Edit
       └─ certified high-reliability case  → existing Workspace
```

For the first real MVP, route every structurally complete recognition candidate to Review/Edit. Direct-to-Workspace must remain disabled until the independent real-world benchmark establishes a calibrated policy and physical-device QA certifies it. There is no evidence for an arbitrary 95% rule.

Recognition code must never directly manipulate the board, edit controls, analysis engine or principal views. It returns data; state and `routeRecognitionResult()` own the transition.

## 13. Client/server architecture comparison

| Option | Privacy/offline | iPhone Safari | Cost/scale | Fit for CAISSA MVP |
|---|---|---|---|---|
| A. Main-thread browser | Local/offline | Broad APIs, but decode/CV/inference can freeze UI and violate Reading/no-jitter quality | Low server cost | Reject as primary execution context. |
| B. Browser + Web Worker | Local/offline | Strongest UI isolation; workers are broadly available. OffscreenCanvas needs a tested fallback | Low server cost | **Preferred execution shell.** |
| C. TensorFlow.js browser | Local/offline | WebGL and WASM available; backend behavior, memory and precision vary. Existing model format is compatible | Bundle/model download cost only | **Preferred first classifier baseline**, using WASM first and measured fallback. |
| D. ONNX Runtime Web | Local/offline | Official compatibility matrix supports iOS Safari WASM and WebGL, not ORT WebGPU/WebNN; conversion/parity required | Bundle/model download cost only | Good later comparison if runtime size/performance wins. |
| E. WASM/OpenCV-style preprocessing | Local/offline | Deterministic CPU path possible, but OpenCV.js payload/memory can be large | Bundle cost only | Use targeted geometry/WASM, not a full OpenCV bundle by default. |
| F. Server inference | Image leaves device; not offline | Thin client, predictable model runtime | Upload latency, cold starts, compute/storage/privacy cost | Not default; conflicts with local-first privacy. |
| G. Hybrid | Local fast path plus consented server fallback | Flexible but operationally complex | Highest maintenance and policy burden | Deferred until a server model materially outperforms local and consent is designed. |

The recovered server is specifically unsuitable as-is: `/api/analyze-board` unconditionally writes `tmp/debug_upload.jpg`, and `/api/ingest-real` persists originals and tiles. That violates the current no-debug-persistence/no-silent-training-capture requirement.

Vercel Node functions can support computational work, but bundle size, memory/CPU, duration, cold-start behavior and per-invocation cost remain deployment constraints. A server option would still require explicit image-transfer consent and a retention/deletion contract; server availability does not justify making it the default.

## 14. Recommended MVP architecture

**PROPOSED — local-first browser worker**

1. The frozen UI passes a `File`/`Blob`, generation and source kind to a dedicated recognition worker.
2. The worker decodes and downsamples locally, with feature-detected OffscreenCanvas/ImageBitmap paths and a tested non-OffscreenCanvas fallback.
3. Deterministic localization and homography code produces a normalized board plus diagnostics.
4. Orientation candidates are evaluated locally.
5. A small TensorFlow.js Layers classifier runs in the worker. Use the recovered model only as a benchmark baseline; ship only a retrained, real-data-certified model.
6. Prefer the TensorFlow.js WASM backend for the first iPhone-safe baseline because the model is small and WASM has stable float32 behavior. Benchmark WebGL as an optional faster backend; never assume it is faster or equally precise on every iPhone.
7. Chess-aware validation creates warnings without silently changing pieces.
8. The immutable result returns to the main thread and enters the existing generation/state/routing seam.
9. Cache versioned static model/runtime assets only after integrity and update behavior are designed. The first load must expose no new permanent UI and must stay within the Reading view.

Why this is the MVP choice:

- preserves local-first privacy and future offline/PWA potential;
- avoids upload latency, server cost and retention obligations;
- reuses the current app-state seam and recovered TFJS format;
- isolates expensive work from board rendering and interaction;
- keeps an ONNX experiment possible without prematurely converting the only historical baseline.

## 15. Mobile Safari feasibility and risks

**VERIFIED from official platform/runtime documentation, checked 2026-09-15**

- TensorFlow.js supports browser WebGL and WASM. Its documentation warns that mobile WebGL may use 16-bit float textures and requires explicit tensor disposal; synchronous reads can block the UI.
- ONNX Runtime Web's compatibility table lists iOS Safari support for WASM and WebGL, but not WebGPU or WebNN. ORT WebGL is in maintenance mode. Safari's WebGPU API shipping does not by itself prove ORT WebGPU support.
- WebKit supports OffscreenCanvas 2D from Safari 16.4 and WebGL in OffscreenCanvas from Safari 17, making worker-based preprocessing feasible on supported devices.
- SharedArrayBuffer/shared-memory paths depend on cross-origin isolation through COOP/COEP. Scanner must not require threaded WASM for correctness.
- WebKit has WASM SIMD support, but runtime/library/device behavior still requires physical-device verification.
- Safari 26 ships WebGPU, yet CAISSA must treat it as an optional acceleration experiment until the selected ML runtime certifies it on iOS.

Risks and required mitigations:

- Decode camera images at bounded resolution; do not allocate full-resolution RGBA plus multiple large copies.
- Transfer `ImageBitmap`/buffers where supported and release canvases/tensors promptly.
- Make single-threaded WASM a correct fallback when cross-origin isolation or threads are unavailable.
- Warm the model inside the worker and measure cold start separately from warm inference.
- Self-host exact runtime/model assets with immutable versioning; avoid CDN worker/CSP surprises.
- Test memory pressure, background/foreground interruption, low-power mode, repeated scans, orientation metadata and large HEIC/JPEG inputs on physical iPhones.
- Feature-detect backends; do not user-agent-gate.
- A WebGL/WebGPU failure must fall back or route to safe Review/Edit/Capture without losing the active generation.

## 16. Privacy model

**PROPOSED default policy**

- Image bytes remain on device for normal recognition.
- No automatic upload, analytics payload, debug-image write, object-storage persistence or service-worker cache of source images.
- Revoke object URLs and release decoded buffers when a scan is replaced, cancelled or completed.
- Store only the confirmed FEN under existing product rules unless the user separately chooses to save a diagram/source in a future approved feature.
- Logs contain timings, reason codes and version identifiers, never pixels, FEN tied to identity, local file names, EXIF location or stable source fingerprints.
- A training contribution flow is a separate future feature with explicit, granular consent, preview of contributed fields, withdrawal/retention terms and a clear statement that image bytes leave the device.

Any future server fallback must disclose before transfer: what bytes leave the device, why local recognition was insufficient, processor/region, encryption, retention duration, deletion behavior, whether humans review the image, and whether it is excluded from training by default.

## 17. Real-world benchmark plan

Synthetic validation is not an acceptance benchmark. The benchmark must be versioned, reproducible and image-grouped.

### Dataset organization

Create immutable image-level manifests with train/development/test partitions. Group by original image, source document/book, capture session, device and generated parent so related crops/tiles never cross partitions. Keep the final test set sequestered from training and threshold selection.

Required strata:

- clean digital diagrams and native screenshots;
- screenshots with and without coordinates/borders;
- modern printed books;
- old/yellowed/grayscale books;
- near-frontal and moderate-perspective phone photos;
- 90°/180°/270° rotations;
- uneven light, shadow and glare;
- low resolution, blur and compression;
- light, dark, wood/textured and monochrome boards;
- multiple common digital and print piece sets;
- hard negatives with grids, tables and no chessboard;
- multiple-board, partial-board, clutter and occlusion cases.

Every supported stratum needs multiple physical devices, source works, board themes and piece families. A data-acquisition task should set sample counts after a coverage/power review; this audit does not invent a marketing sample size.

### Metrics

Board localization:

- board-found recall by stratum;
- false-positive rate on hard negatives;
- quadrilateral IoU;
- normalized corner RMSE and worst-corner error;
- warp grid alignment error;
- correct-board selection rate when multiple candidates exist.

Orientation:

- exact orientation accuracy;
- unknown/abstention rate;
- confident-wrong orientation rate.

Piece recognition:

- per-square accuracy and macro-F1 across 13 classes;
- occupied-versus-empty precision/recall;
- piece-type accuracy ignoring color;
- color accuracy on occupied squares;
- per-class confusion matrix;
- calibration error/Brier score and top-1/top-2 margin behavior.

Whole position:

- exact 64-square board accuracy;
- exact FEN board-part accuracy;
- percentage sent to Review/Edit;
- percentage requiring any correction;
- average/median/95th-percentile corrected squares;
- orientation corrections and hard failures.

Performance/privacy:

- asset bytes, cold/warm startup, decode/localize/classify/total latency;
- peak memory and repeated-scan stability;
- battery/thermal observations on the minimum and current supported iPhones;
- network requests and proof that source bytes never leave the device.

Report confidence intervals and all stratum results, not only an aggregate dominated by empty squares. Freeze routing thresholds only after calibration on development data, then evaluate once on the held-out test set.

## 18. Human correction and learning record

**PROPOSED local session record**

```js
{
  schemaVersion: 'caissa-scanner-correction/1',
  sessionId: 'ephemeral-random-id',
  sourceFingerprint: 'session-scoped-nonreversible-or-null',
  predictedFen: '...',
  correctedFen: '...',
  predictedBySquare: { a8: { class: 'r', confidence: 0.71 } },
  correctedSquares: [{ square: 'a8', from: 'r', to: 'q' }],
  predictedOrientation: 'white',
  correctedOrientation: 'black',
  boardCorners: { /* source-pixel coordinates */ },
  modelVersion: '...',
  preprocessingVersion: '...',
  consent: { trainingContribution: false }
}
```

Without becoming training data, session-local corrections can immediately improve the current experience by preserving the user's confirmed FEN, keeping subsequent analysis/export consistent, recording which warning was resolved, and avoiding re-running recognition while the same scan remains active. The record should be discarded with the session unless the user explicitly saves the position under existing product behavior.

No correction or image becomes training data automatically. A future consented contribution must be copied into a separately governed dataset with provenance, license/consent, deletion identity and review status.

## 19. Dataset strategy and annotation

### Existing data assessment

**VERIFIED** — available data is synthetic-only, class-imbalanced toward empty squares, based on one generated silhouette family plus one residual Unicode family, and split at tile level. It is useful for unit/smoke tests and baseline comparison, not production certification.

### Proposed stages

1. **Stage A — synthetic diversity foundation.** Add multiple licensed piece families, print fonts, coordinates, borders, page textures, grayscale/halftone, realistic projective transforms, lens distortion, occlusion, blur, glare and hard-negative grids. Split by generator seed, piece family, position and render parent.
2. **Stage B — curated real corpus.** Capture/scan consented screenshots, books and phone photos across supported scenarios. Annotate board corners, orientation and true board placement/FEN. Keep source/license/provenance.
3. **Stage C — hard-example mining.** Add confident mistakes, missed boards, coordinate contamination, empty-square false positives and piece-family confusions found by the benchmark. Never mine from the final holdout.
4. **Stage D — consented corrections.** Only after an explicit contribution product and data-governance review; quarantine until annotation validation and deduplication pass.

Proposed image-level annotation:

```json
{
  "schemaVersion": "caissa-board-annotation/1",
  "imageId": "opaque-id",
  "source": { "kind": "photo", "license": "consented", "deviceClass": "iphone" },
  "image": { "path": "images/opaque-id.jpg", "width": 3024, "height": 4032 },
  "boards": [{
    "corners": [[412, 730], [2630, 680], [2715, 2890], [355, 2960]],
    "cornerOrder": "tl-tr-br-bl",
    "orientation": "white",
    "fen": "... w - - 0 1",
    "boardPart": "...",
    "squareLabels": null
  }],
  "splitGroup": "book-or-capture-session-id",
  "review": { "status": "double-checked", "annotators": 2 }
}
```

Derive square labels from verified board placement after homography; allow explicit per-square overrides for occlusion/ambiguous source content. Version raw data, annotations, preprocessing and model separately.

## 20. Piece-set and board-style generalization

**VERIFIED** — the current synthetic tile corpus uses one geometric SVG piece generator. The 484 residual screenshots use one Unicode chess font family. Board color changes do not create new piece shapes. Therefore historical validation does not test Staunton variants, Wikipedia pieces, common site themes, book diagram fonts, old monochrome type, figurine glyphs or decorative sets.

**PROPOSED**

- Hold out entire piece families from training to measure transfer.
- License and track every font/art asset; do not scrape unknown-rights board images into training.
- Balance piece family × board theme × square color × capture condition.
- Include anti-aliased screenshots at multiple device pixel ratios and print/raster artifacts.
- Preserve luminance and edges as candidate inputs, but test RGB because white/black identity may depend on fill/stroke behavior.
- Do not train primarily on CAISSA's own official pieces; that would optimize the scanner for images it already renders rather than users' books and screenshots.

Board-style coverage must include coordinates inside/outside squares, thick/thin/no grid lines, borders, page texture, wood, gradients, grayscale, shadows and compression. Use ablation results to decide grayscale, contrast normalization or additional channels.

## 21. Failure-mode behavior

| Failure | Future behavior |
|---|---|
| No board detected | Hard recognition failure; return to Capture with retry. Do not fabricate a center crop FEN. |
| Multiple boards | If one is not decisively selected, fail/retry. A future approved selector is deferred. |
| Partial board | Hard failure; retry. |
| Perspective too extreme | Fail/retry; offer manual corners only in a separately approved advanced flow. |
| Quadrilateral/grid disagreement | Review/Edit if a complete candidate is still credible; otherwise retry. |
| Occluded square / hand / physical piece | Mark affected squares and route Review/Edit; large occlusion becomes hard failure. |
| Diagram labels inside squares | Warn/Review/Edit; mine as a dedicated dataset stratum. |
| Decorative/unseen piece set | Abstain or Review/Edit based on calibrated confidence; never force a known class. |
| Wrong/unknown orientation | Review/Edit with orientation warning; no silent auto-confirm. |
| Low-confidence occupied square | Review/Edit and retain top alternatives internally. |
| White/black confusion | Review/Edit; report color-specific uncertainty. |
| Empty-square false positives | Review/Edit; occupancy calibration is tracked separately. |
| Board grid misalignment | Reject localization or Review/Edit with board warning; classifier confidence cannot validate geometry alone. |
| Corrupt/unsupported/oversized image | Safe Capture error and retry; no state loss from stale callbacks. |
| Worker/runtime/model load failure | Safe Capture error; optional measured backend fallback, never server upload automatically. |

## 22. Recognition MVP scope

### Supported, subject to benchmark certification

**PROPOSED smallest credible scope**

- one fully visible 2D board per image;
- clean digital diagrams/screenshots from benchmarked piece families;
- clear printed 2D diagrams from benchmarked modern/grayscale sources;
- upright or 180-degree boards, plus 90/270 only when orientation evidence is reliable;
- near-frontal phone photos with the complete board, limited clutter and readable squares;
- local processing with every initial candidate routed through Review/Edit;
- board-piece placement only; non-board FEN fields default with warnings.

### Explicitly unsupported initially

- live video scanning;
- physical 3D chess sets;
- multiple or partial boards;
- severe perspective, curl, glare, shadow, blur or occlusion;
- handwritten boards or arbitrary decorative/fantasy sets;
- automatic recovery of side to move, castling, en-passant or move counters from pixels;
- automatic image upload or server fallback;
- background learning or training from corrections;
- direct-to-Workspace auto-accept before calibrated benchmark certification;
- visible manual-corner UI without separate approval.

## 23. Phase 3 implementation sequence

1. **3-001 — Recognition architecture audit (this document).** Dependencies: recovered archives and frozen seam.
2. **3-002 — Recognition contracts and benchmark schema.** Add non-visual schemas, fixtures, warning taxonomy, grouped-split validator and result-contract tests. No runtime recognition.
3. **3-003 — Local image decode/worker foundation.** Feature-detected worker transport, EXIF-safe decode, bounded memory, cancellation/generation tests and proof of zero uploads. No model.
4. **3-004 — Board-localization prototype and hard-negative benchmark.** Return corners/diagnostics only; compare targeted JS/WASM approaches using real annotated boards.
5. **3-005 — Homography and orientation normalization.** Deterministic geometry, warp tests, rotation candidates and unknown-orientation behavior.
6. **3-006 — Legacy classifier baseline.** Import the recovered model only into an isolated benchmark harness, verify TFJS browser parity and measure real holdout failure. Do not activate it in Scanner.
7. **3-007 — Real-data classifier retraining.** Correct grouped splits, multiple piece sets, calibration and immutable reports; compare 32×32 grayscale against evidence-backed alternatives.
8. **3-008 — Candidate FEN integration behind an inactive flag.** Plug worker output into `setCandidate()` and `routeRecognitionResult()`; all candidates go to existing Review/Edit; preserve frozen UI.
9. **3-009 — Confidence/warning policy.** Calibrate abstention/review rules from development data; add non-destructive chess validation and policy-version tests.
10. **3-010 — Real-world and mobile certification.** Held-out benchmark, physical iPhone Safari performance/memory/privacy, repeated-scan and no-jitter verification.
11. **3-011 — Controlled recognition activation decision.** Requires benchmark evidence, visual freeze gate, privacy review and explicit release approval. Direct Workspace routing remains a separate evidence-backed decision.

Dependencies are sequential through 3-006. Data collection/schema work for 3-007 may proceed in parallel only after 3-002 defines governance and splits. Activation cannot precede 3-010.

## 24. External feasibility references

Official sources checked for this audit:

- [TensorFlow.js platform and backend guidance](https://www.tensorflow.org/js/guide/platform_environment)
- [ONNX Runtime Web browser support matrix](https://onnxruntime.ai/docs/get-started/with-javascript/web.html)
- [ONNX Runtime Web deployment, workers and artifact sizing](https://onnxruntime.ai/docs/tutorials/web/deploy.html)
- [WebKit: OffscreenCanvas on iOS/Safari](https://webkit.org/blog/14445/webkit-features-in-safari-17-0/)
- [WebKit: WebGPU shipping in Safari 26](https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/)
- [WebKit: COOP/COEP and SharedArrayBuffer isolation](https://webkit.org/blog/12140/new-webkit-features-in-safari-15-2/)
- [Vercel Node runtime characteristics](https://vercel.com/docs/functions/runtimes/node-js)
- [Vercel function memory/CPU considerations](https://vercel.com/docs/functions/configuring-functions/memory)
- [Vercel function duration limits](https://vercel.com/docs/functions/configuring-functions/duration)

These sources establish feasibility, not performance on CAISSA's model. Physical-device measurements remain mandatory.

## 25. Audit decision

**PROPOSED decision:** proceed with a local-first, dedicated-worker recognition program; preserve the recovered TensorFlow.js model as a reproducible baseline only; build real four-corner localization/homography; retrain on governed real data; calibrate warnings and routing on an independent benchmark; and integrate exclusively through the current generation-safe state and `routeRecognitionResult()` seam.

No production recognizer, CV runtime, model download, server endpoint, upload path, training capture, or visible UX change is authorized by this audit.
