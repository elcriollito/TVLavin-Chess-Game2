# CAISSA Scanner Production Inference

## Frozen boundary

The private beta endpoint `POST /api/scanner/beta/recognize` executes the immutable classifier `caissa-piece-classifier-v0.5-occupancy-recovery`. It does not train, tune, calibrate, quantize, localize, or persist feedback.

- Frozen state SHA-256: `90D06A3C1AAC934188CBA5EEB4B68D51AC64C815351BFE372F2215101DD7209E`
- Source TorchScript SHA-256: `8025AA0F8455BE582AB718A70BC75C1CE4A583852DA4A3A8E540FEF035EE9801`
- Production ONNX SHA-256: `FFF4C633613997C7C29ACD31FB233CF9A2150D173AAB4E38E0BF650644485211`
- ONNX opset: `18`
- Production artifact size: `2,635,093` bytes
- Input: one fixed batch of `[64,3,64,64]` float32 tiles
- Preprocessing: `RGB64 uint8 / 255`
- Class order: `empty P N B R Q K p n b r q k`
- Occupancy threshold: `0.99`
- Calibration: none; all temperatures remain `1.0`

The ONNX file is a runtime-format conversion from the certified TorchScript artifact. The export command is:

```text
<frozen-v0.5-python> tools/scanner-beta-feedback/export-v05-onnx.py
```

The exporter verifies both source checksums, exports one 64-tile batch, runs the ONNX checker, and writes a manifest beside the artifact. Neither source artifact is changed.

## Runtime feasibility decision

| Candidate | Decision | Evidence |
| --- | --- | --- |
| Vercel Node.js / Fluid Compute | Selected | Full Node APIs, lazy native loading, a 30-second endpoint cap, and a measured 181.99 MiB local prebuilt function package including mapped files. |
| Vercel Python + Torch | Rejected | It would ship the full Torch stack. Vercel's Python function limit is 500 MB and Python tracing does not remove unreachable dependencies, producing materially worse bundle and cold-start risk. |
| ONNX Runtime Node CPU | Selected | Official Linux x64 CPU binaries are available. The Linux runtime plus model is roughly 49 MB before shared application dependencies. |
| TensorFlow.js conversion | Rejected | It adds an additional conversion path with no correctness benefit over the directly certified ONNX export. |
| Existing Windows adapter | Rejected for production | It spawns a Windows-local Python executable and cannot run in Vercel's Linux function runtime. It remains the certification reference only. |

Vercel documents a standard 250 MB uncompressed Node function limit, 2 GB / 1 vCPU standard instances, and Fluid Compute duration limits above this endpoint's explicit 30-second cap. The implementation does not require the large-function opt-in. See the official [function limits](https://vercel.com/docs/functions/limitations), [Python runtime](https://vercel.com/docs/functions/runtimes/python), and [ONNX Runtime Node binding](https://onnxruntime.ai/docs/get-started/with-javascript/node.html) documentation.

## Numerical parity

`npm run test:scanner:inference:parity` compares the certified TorchScript adapter with the production ONNX runtime. The deterministic governed suite contains four complete 64-square boards / 256 tiles and covers:

- all 13 canonical classes;
- all 11 rights-cleared synthetic piece-set families;
- synthetic train, validation, and unseen-family test roles;
- certified real-development train and validation crops;
- light and dark squares, 144 hard negatives, and 13 king tiles;
- white-at-bottom and black-at-bottom preprocessing.

The certified conversion result is 100% canonical-class agreement, 100% `0.99` threshold-decision agreement, and full placement-FEN agreement. Maximum absolute head-probability delta is `2.7107501743284246e-7`; mean absolute delta is `1.6319995739384236e-8`. The automated limit is `5e-6`, selected after the independent first conversion run measured `7.22e-7` maximum drift. Any class, threshold, board, checksum, or tolerance failure blocks release.

`scanner/recognition/production-inference/golden-fixtures-v01.json` stores governed fixture references, source hashes, tile hashes, and reference outputs, not protected benchmark images. The protected 31-board benchmark is not used for endpoint tuning or certification.

## Request and response protocol

The versioned JSON request is `caissa-scanner-beta-recognition-request/1` and contains:

- `boardEncoding=rgba8`, `boardWidth=512`, and `boardHeight=512`;
- a base64-encoded canonical 512x512 RGBA board;
- explicit `white-at-bottom` or `black-at-bottom` orientation;
- the original supported source type: JPEG, PNG, or WebP.

Decode, localization, and homography stay in the already-certified browser runtime. The server only rearranges the rectified board into canonical 64-square order and performs frozen classifier inference. Arbitrary paths and source images are never accepted.

The response `caissa-scanner-beta-recognition-response/1` returns server-controlled model identity, state and runtime-artifact checksums, threshold, preprocessing version, class order, predicted FEN, and exactly 64 square records containing canonical class, confidence, occupancy, color, piece-type, and king-auxiliary probabilities.

## Security and failure behavior

The handler fails closed. The infrastructure kill switch, method, origin, Clerk identity, Beta Program authorization, experiment registry, per-user rate limit, content type, payload size, schema, image type, dimensions, encoding, and exact byte length are checked before model execution. Model loading is lazy and occurs only after authorization. One warm execution environment reuses one verified ONNX session and evaluates all 64 tiles as one batch.

The endpoint returns stable errors without paths or stack traces: `AUTH_REQUIRED`, `BETA_ACCESS_DENIED`, `BETA_DISABLED`, `INVALID_IMAGE`, `INVALID_PAYLOAD`, `MODEL_INTEGRITY_FAILURE`, `INFERENCE_FAILURE`, and `TIMEOUT`. A best-effort serverless rate limit permits 12 authorized calls per user per minute. Private responses are non-cacheable and `noindex`.

Logs contain only outcome, typed reason, and duration. They never contain image bytes, FEN, private paths, authentication identifiers, or user image content. Recognition itself does not create a scan, feedback row, training candidate, or image object; immutable snapshot persistence remains a separate explicit client step.

## Performance and resources

On the release workstation using the same Node 24 x64 CPU runtime, 25 warm full-board repetitions measured:

- cold request: `260.05 ms`;
- cold model load: `77.18 ms`;
- cold 64-tile inference: `176.96 ms`;
- warm request P50: `174.37 ms`;
- warm request P95: `919.39 ms`;
- process RSS increase after the run: `218,779,648` bytes.

These measurements certify server-side feasibility, not iPhone compute performance. Production request timing is recorded separately during the governed deployment smoke.

## Deployment and rollback

Safe activation keeps `CAISSA_SCANNER_BETA_STAGE=disabled` while the endpoint is first deployed. Because the kill switch is additive, the registry may be enabled while the kill switch remains disabled without exposing Scanner. After disabled-route smoke, set the production kill switch to exactly `internal`, allow the environment redeployment to finish, and immediately verify model identity, authorized inference, anonymous denial, ordinary-user denial, and zero QA persistence. Physical iPhone certification remains Alexander's task.

Immediate rollback is:

1. disable the `scanner` experiment registry;
2. set `CAISSA_SCANNER_BETA_STAGE=disabled`;
3. verify `/api/scanner/beta/status` and `/api/scanner/beta/recognize` fail closed.

The deployed endpoint may remain present while inaccessible. Rollback does not change public Scanner, public navigation, sitemap, or any other CAISSA surface.
