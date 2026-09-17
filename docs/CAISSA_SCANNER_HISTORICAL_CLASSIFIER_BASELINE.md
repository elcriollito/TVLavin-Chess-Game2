# CAISSA Scanner — Phase 3-005 historical TFJS classifier baseline

Status: **HOLD for real accuracy**, not a production model approval. The model was certified and ran on 32 unique 2D real boards, but neither audited corpus contains verified piece labels or a verified FEN. Therefore **0 boards / 0 squares are eligible for accuracy scoring**. Reference-system predictions are not ground truth. The machine-readable [eligibility report](../artifacts/scanner-classifier-baseline/historical-tfjs-real-benchmark.json) deliberately contains `realMetrics: null`; [Node timing](../artifacts/scanner-classifier-baseline/historical-tfjs-performance.json) is separate because wall time is not byte-reproducible.

## Provenance and artifact certification

The primary recovered, unmodified archive is `C:\Users\ALEXANDER\Downloads\Caissa Chess Scanner Diagram\CAISSA-Chess-Position-Scanner .zip` (SHA-256 `7CEEF63C4166A5B1CDA61FB0B392931840D9D29F3B1C48937E376F91C3763729`). The older `CAISSA-Chess-Position-Scanner-betta.zip` (SHA-256 `A6FF290C59CFA01332EFDBB31882933B74396C47BF269BA58C12EFF62A853D45`) remains unchanged and contains no matching model artifacts. Only the three model files were copied from the primary archive into an isolated audit directory, never over working source.

| File | SHA-256 |
| --- | --- |
| `model.json` | `AA29183FBE73D8E6DB3B144BBC505558A04F64FC2C373C99009C9D6429F6CE8E` |
| `weights.bin` | `2FF117276E1D22BEAC35F2DBDBC4D8A29650917A9D657E81FFDFB026ADD2C458` |
| `metadata.json` | `9248660D4131FCAF219A7C7C7370B0EA2EAE58D046E7CA700DD54692FC0B31B2` |

The saved TensorFlow.js 4.22.0 layers model takes `[batch,32,32,1]` float32 and has Conv2D(32,3×3,same,ReLU) → max pool → Conv2D(64,3×3,same,ReLU) → max pool → flatten → Dense(128,ReLU) → Dropout(0.3) → Dense(13,softmax), 544,909 parameters. Its historical class order is `empty,P,N,B,R,Q,K,p,n,b,r,q,k`; the archived server maps index 0 from `""` to `empty`. Metadata records one epoch, batch 256, 115,200 synthetic training tiles, **zero verified real training tiles**, and synthetic validation accuracy `0.9655092592592592` (96.5509259%). This is not a real-world accuracy estimate.

## Faithful preprocessing and controlled geometry

The archived `server/board-analyzer.ts` calls Sharp `.rotate().resize(256,256,{fit:'fill'}).grayscale().raw()` for a board; it then extracts 64 row-major 32×32 grayscale tiles. Each tile is independently stretched to `[0,255]` with min/max and `Math.round`, except range <10 is left unchanged. The archived classifier divides each byte by 255, yielding `[0,1]` in one channel. No thresholding or background removal occurs in this inference path. The baseline runner uses Sharp **0.34.5** and native **tfjs-node 4.22.0** in an isolated audit directory; nothing is installed into the Scanner runtime or bundled into the site. A process-local compatibility shim restores `util.isNullOrUndefined` removed by the present Node 24 runtime; model weights and arithmetic are unchanged.

For the **classifier-only** question, human-verified TL/TR/BR/BL playable-board corners are passed through the existing deterministic 512px RGBA bilinear homography. The rectified board is then resized and tiled by the historical preprocessing. This replaces historical Sobel board localization intentionally; detector-predicted corners are **not** used. The external real images and manifests are checksum-checked read-only. Source images above 2048px / 4MP are downscaled before homography, as in the existing localization benchmark. This controlled crop is not a claim that the old end-to-end recognizer worked.

## Real benchmark eligibility and leakage

The v0.1 corpus contains 14 positive boards. V0.3 contains 33 positives, 14 of which are exact-byte v0.1 overlaps. One legacy board is a physical/volumetric 3D game scene and is excluded from the 2D MVP benchmark. The result is **32 unique in-scope 2D source boards with verified corners**. Native inference completed on all 32 (2,048 unscored square predictions). Exactly **zero** have 64 human-verified piece labels or a human-verified FEN with orientation. Piece-set-family metadata in the fresh corpus is `unknown`, so a piece-family result would also be unsupported. The 13-class, occupancy, piece type, color, per-class confusion, color-swap, exact-board, correction, calibration and chess-aware accuracy fields remain unavailable—not zero percent.

The runner supports a separate `caissa-scanner-piece-truth/1` JSON manifest. Every scored record must have `sampleId`, matching uppercase `sourceSha256`, `verifiedBy`, `verifiedAt`, and exactly 64 visual row-major `squareLabels`, or a `fenPlacement` with verified `orientation` (`white-at-bottom` or `black-at-bottom`). If both forms are present, they must agree. This is an evaluation-only input, not a runtime FEN. Scoring measures 13×13 confusion, per-class precision/recall, occupied-vs-empty, type and color on true occupied squares, same-type opposite-color swaps, piece-type confusions, group accuracies, exact-board/correction burden, 13-way Brier/ECE, high-confidence errors, and simple king/material-count signals. Structural king signals are diagnostic only; puzzles and compositions are never rejected automatically. Opening plausibility, material likelihood and reachability remain soft signals, not hard rules.

The fresh hard cases Alexander identified remain explicit but **unmapped partial truth**, not 64-square annotations: (A) White Re1/Bc1/Bf1/Qe3 and Black Ke8/Qd8/Bd6/Ba6; (B) Black Be7/Bc8/Na5; (C) e1 White King where the reference recognizer said Black King. We cannot attribute these errors to this TFJS model before identifying source images and scoring its predictions against full verified truth.

## Performance, decision, and next work

The included Node/Windows CPU timing artifact records load, preprocessing, native inference, board total, effective per-tile inference, and peak process RSS. It is **not an iPhone benchmark** and is not part of the byte-deterministic eligibility/metrics report. Re-running the runner twice yielded identical SHA-256 `F1F3D718D268D72AE5ED9EECD3B64CFB26499E1B311394210245057EA657EA07` for that report.

Historical model decision: **B — useful only as bootstrap/reference, provisionally**. The architecture and exact preprocessing can be reproduced and the weights run, but synthetic-only validation gives no evidence for real 2D generalization. Decision A (temporary product baseline) cannot be supported until real labeled metrics exist. The model is not integrated with the Scanner Worker, candidate FEN, confidence routing, correction, or UI.

The blocking next task is the separate [piece-label annotation task](CAISSA_SCANNER_PIECE_LABEL_ANNOTATION_TASK.md), followed by rerunning Phase 3-005 with verified truth. Phase 3-006 should then target **2D** family diversity: standard/classic/outline/solid/stylized/mobile/web/broadcast sets, print/hatched/degraded/low-contrast diagrams, black/white same-type swaps, bishop–knight/queen and rook–queen distinctions, and photo-of-screen artifacts. Synthetic renders should vary piece family independently of board theme and include color/contrast/print degradation; real augmentation must preserve label and source-family split boundaries. Do not optimize physical 3D; prefer safe abstention on 3D-like inputs. These are dataset requirements, not claims of measured TFJS failures.

Run locally with the isolated audit files:

`node tools/run-scanner-historical-tfjs-baseline.mjs --model-dir=<isolated model directory> --runtime-dir=<isolated tfjs-node 4.22.0 and sharp 0.34.5 directory> [--truth=<verified piece-truth JSON>]`

The current Scanner visual freeze remains in force. No public UI change, runtime integration, main-branch change, merge, or production deployment is authorized. A VISUAL-FREEZE exception requires Alexander's explicit approval.
