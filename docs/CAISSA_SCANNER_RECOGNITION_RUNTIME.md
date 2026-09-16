# CAISSA Scanner — Local Recognition Runtime

Status: **PHASE 3-003 FOUNDATION — NO BOARD LOCALIZATION OR PIECE RECOGNITION**

Runtime preprocessing version: `caissa-scanner-local-decode/1`

Worker protocol: `caissa-scanner-recognition-worker/1`

Visual changes authorized: **NONE**

This document defines the local image-decode and dedicated Worker foundation behind the frozen Scanner flow. It does not implement board detection, corners, homography, 8×8 extraction from a real image, orientation inference, a model, a classifier, Candidate FEN generation, confidence routing, server inference, or image upload.

## 1. Frozen integration boundary

The certified public flow remains:

`Capture → Reading → routeRecognitionResult() → Review/Edit OR Workspace`

Camera/Gallery selection, authoritative Scanner generations, Reading, Review/Edit, the current mock position, and `routeRecognitionResult()` remain the same product seam. The old artificial 320 ms mock timer is replaced internally by:

```text
File / Blob
→ local signature and dimension checks
→ browser-native decode with EXIF orientation
→ aspect-preserving bounded canvas resize
→ transferable RGBA ArrayBuffer
→ dedicated recognition Worker probe
→ generation check
→ existing mock candidate
→ existing routeRecognitionResult()
```

The existing 320 ms minimum Reading dwell is retained as a presentation guarantee, but it begins before real preprocessing and waits only for any remaining time after preprocessing completes. It no longer stands in for image processing; slow decode/Worker work naturally extends Reading.

No technical timing or runtime metadata is exposed in the certified UI.

**VISUAL-FREEZE exception requires Alexander's explicit approval.**

## 2. Local-only privacy contract

Selected image bytes remain inside the browser process for the active scan lifecycle.

Recognition runtime files contain no:

- `fetch()`;
- `XMLHttpRequest`;
- `FormData`;
- `sendBeacon`;
- server/API upload path;
- IndexedDB, localStorage, or sessionStorage image persistence;
- filesystem/debug-image write;
- telemetry or training contribution.

The browser suite also observes the real file-selection flow and requires zero non-GET requests while the image is decoded, transferred to the Worker, and routed to Review/Edit. This is developer validation, not telemetry.

## 3. Supported baseline inputs

Accepted MIME types:

- `image/jpeg`;
- `image/png`;
- `image/webp` when the active browser can decode it.

MIME is not trusted alone. The decoder reads at most the first 65,536 bytes and verifies JPEG, PNG, or WebP signatures before browser decode. It extracts encoded dimensions when the format header makes them available, then validates the browser-decoded dimensions again.

WebP capability is established by an actual native decode. Lack of native support returns `decode-failed`; there is no upload or conversion fallback.

HEIC/HEIF is not claimed or accepted by this contract. An iPhone capture may still work when Safari supplies the selected file as a browser-decodable JPEG. Native HEIC/HEIF support or explicit local conversion requires a separately tested task.

SVG, GIF, filenames, and file extensions are not accepted as recognition evidence. Embedded image content is decoded only through browser image APIs; metadata is never evaluated or executed.

## 4. MVP decode bounds

| Bound | Value | Purpose |
|---|---:|---|
| Maximum compressed source bytes | 32 MiB | Reject unusually large input before decode. |
| Maximum declared/decoded source edge | 32,768 px | Header and decoded-dimension sanity limit. |
| Maximum declared/decoded source pixels | 100,000,000 | Decompression-bomb safety ceiling while retaining normal 48 MP captures. |
| Minimum image edge | 64 px | Leaves at least eight source pixels per future board cell in the absolute minimum case. |
| Maximum working edge | 2,048 px | Preserves useful localization detail without carrying arbitrary camera resolution forward. |
| Maximum working pixels | 4,000,000 | Caps the transferred RGBA payload at 16,000,000 bytes. |

These are **MVP decode bounds**, not permanent production thresholds. Physical-iPhone memory, latency, and future localization benchmarks must determine any revision.

The browser may allocate internal memory while decoding the compressed source. Header and byte bounds reduce risk, but JavaScript cannot guarantee the native decoder's peak allocation. This remains a physical-device risk to measure.

## 5. Deterministic downscale policy

The working scale is:

```text
min(
  1,
  MAX_DECODE_EDGE / max(sourceWidth, sourceHeight),
  sqrt(MAX_DECODE_PIXELS / (sourceWidth × sourceHeight))
)
```

Both dimensions are multiplied by the same scale and rounded once. The decoder performs no crop, stretch, square normalization, board localization, or tile extraction.

Metadata records:

- encoded width and height when available from the header;
- browser-oriented source width and height;
- working width and height;
- source byte count and MIME type;
- whether resizing occurred;
- orientation handling;
- preprocessing version;
- transport backend.

For example, a 3000×1500 image becomes 2048×1024. A 4000×4000 image becomes 2000×2000 because the four-million-pixel limit is stricter than the edge limit.

## 6. EXIF orientation policy

The runtime requests `createImageBitmap(blob, { imageOrientation: 'from-image' })`. This is the primary local decode path. The fallback uses a main-thread `Image` element, whose browser rendering path also applies image orientation.

CAISSA does not manually rotate the resulting pixels and therefore does not double-apply EXIF. `sourceWidth` and `sourceHeight` describe the oriented browser-decoded image; `encodedWidth` and `encodedHeight` retain the header dimensions when known.

Deterministic browser tests insert EXIF orientation 6 into a 120×80 JPEG. Chromium, Firefox, and WebKit must all produce one 80×120 source/working image.

This is EXIF/display normalization only. Chess orientation inference—White at bottom, Black at bottom, or 90°/270° board rotation—is not implemented here.

## 7. Decode and transfer strategy

Primary path:

1. Verify type, signature, source bytes, and header dimensions.
2. Decode with `createImageBitmap` and `imageOrientation: 'from-image'`.
3. Draw once to a bounded main-thread 2D canvas.
4. Read one RGBA buffer.
5. Transfer ownership of the `ArrayBuffer` to the Worker.
6. Close the `ImageBitmap` and release the canvas backing store.

Safari-compatible fallback:

1. Create a temporary object URL.
2. Decode through a main-thread `Image` element.
3. Use the same bounded canvas and RGBA transfer path.
4. Remove the image source and revoke the temporary URL in success, failure, or cancellation cleanup.

Correctness does not depend on OffscreenCanvas, Worker WebGL, SharedArrayBuffer, WebGPU, or threaded WASM. The RGBA `ArrayBuffer` path is deliberately less exotic and broadly transferable.

## 8. Worker lifecycle and responsibilities

`scanner-recognition-worker.js` is a separate Worker from every Stockfish Worker.

The runtime:

- creates one Worker lazily on the first valid scan;
- reuses it for sequential scans;
- never creates a Worker per square;
- cancels the prior logical job when a new scan begins;
- removes settled/canceled requests from the pending map;
- terminates the Worker on explicit disposal/page exit;
- recreates a clean runtime on a restored page lifecycle.

The Worker currently validates the request and performs only a harmless deterministic pixel probe. It loads no model, finds no board, extracts no squares, and returns no chess result.

## 9. Versioned Worker protocol

Process request:

```js
{
  type: 'process-image',
  protocol: 'caissa-scanner-recognition-worker/1',
  version: 1,
  generation,
  requestId,
  image: { pixels: ArrayBuffer },
  metadata: {
    sourceWidth,
    sourceHeight,
    encodedWidth,
    encodedHeight,
    workingWidth,
    workingHeight,
    sourceBytes,
    mimeType,
    resized,
    orientationHandling,
    preprocessingVersion,
    backend
  }
}
```

Success response:

```js
{
  type: 'image-ready',
  protocol: 'caissa-scanner-recognition-worker/1',
  version: 1,
  generation,
  requestId,
  metadata,
  timing: { workerProcessMs },
  probe: { byteLength, samples, checksum, firstByte, lastByte }
}
```

Typed error:

```js
{
  type: 'recognition-error',
  protocol: 'caissa-scanner-recognition-worker/1',
  version: 1,
  generation,
  requestId,
  code,
  message
}
```

Cancel messages use the same identity. The Worker keeps cancellation markers bounded to 64 entries; the main-thread runtime remains the authoritative cancellation/staleness gate.

## 10. Generation and cancellation model

Scanner state remains the only generation authority. The runtime receives the generation from `state.beginSource()` and adds only a request identity within that generation.

Every asynchronous boundary checks identity:

- after header inspection;
- after browser decode;
- before Worker transfer;
- on Worker response;
- before installing the existing mock candidate.

When Scan B replaces Scan A:

1. authoritative Scanner generation advances;
2. the runtime marks A canceled;
3. a cancel message is sent when a Worker job exists;
4. A is removed from the pending map;
5. any later A decode or Worker response is rejected/ignored;
6. only B may call `state.setCandidate()`.

Browser image decoding may not be physically abortable. Logical cancellation is deterministic and releases resources as each decode boundary completes. The Worker is not terminated/recreated for every scan.

## 11. Timing metadata

Local internal results record:

- `decodeMs`;
- `resizeMs`;
- `workerTransferMs`—main-thread transfer/round-trip wall time;
- `workerProcessMs`—Worker probe time;
- `totalPreprocessMs`.

These values can feed future benchmark records. They are not uploaded and are not shown in the frozen UI.

## 12. Typed failures

| Code | Meaning |
|---|---|
| `unsupported-image-type` | MIME type is outside JPEG/PNG/WebP. |
| `decode-failed` | Empty, signature-mismatched, corrupt, or browser-undecodable input. |
| `image-too-small` | Either decoded edge is below 64 px. |
| `image-dimensions-invalid` | Invalid integers or source/working safety bound violation. |
| `worker-init-failed` | Web Worker unavailable or could not start. |
| `worker-processing-failed` | Transfer, Worker execution, or response failure. |
| `malformed-payload` | Worker message or pixel byte length violates the protocol. |
| `stale-generation` | Decode/result no longer belongs to current Scanner generation. |
| `canceled` | Reset, replacement scan, or disposal canceled the job. |

Raw stack traces are not displayed. Current Scanner failure handling returns safely to Capture with existing toast behavior.

## 13. Resource cleanup

- Preview object URLs are revoked when replaced, after successful preprocessing, on reset, and on page exit.
- Fallback decoder URLs are always revoked by the decoder.
- `ImageBitmap.close()` is called when available.
- Fallback `Image` handlers and source are cleared.
- Temporary canvas dimensions are reset to zero.
- RGBA buffer ownership transfers to the Worker instead of being cloned.
- Pending request entries are deleted on success, error, cancellation, and disposal.
- No image registry is retained.
- Worker disposal terminates the Worker and clears pending work.

## 14. Automated proof

Node tests verify bounds, signature parsing, typed errors, Worker validation, sequential reuse, cancellation, stale-generation rejection, failure isolation, pending-map cleanup, disposal, and static privacy guards.

Chromium, Firefox, and WebKit tests verify:

- real JPEG and PNG decode;
- WebP when natively available;
- invalid, unsupported, and tiny inputs;
- actual oversized downscale and aspect ratio;
- EXIF orientation normalization;
- forced Image-element fallback and URL revocation;
- real Worker initialization and sequential requests;
- malformed Worker payload error;
- replacement-image cleanup;
- existing mock Review/Edit routing;
- zero non-GET requests during the scan flow.

Fixtures are deterministic canvases or repository-owned chess-piece imagery. No user photo is used.

## 15. Known risks

- Native browser decoding can temporarily allocate more memory than the final 16 MB RGBA buffer.
- Playwright WebKit is a compatibility gate, not a substitute for repeated physical-iPhone testing.
- Browser-native WebP and future HEIC behavior can vary by OS/browser version.
- Main-thread canvas resize is compatible but may cause a short processing task on older phones; measurements will determine whether a later OffscreenCanvas path is worthwhile.
- Color management and interpolation can vary slightly across browser engines. Geometry metadata remains deterministic, while pixel parity must be benchmarked before model selection.
- Cancellation cannot forcibly interrupt an in-progress native image decode; stale work is logically isolated and released afterward.

## 16. Boundary for Phase 3-004

Phase 3-004 may consume the validated, orientation-normalized, bounded RGBA buffer and its metadata to prototype board localization and homography diagnostics.

Phase 3-004 must not silently expand this task into piece classification, model integration, Candidate FEN, confidence routing, server inference, upload, or visible Scanner redesign. Any new visible manual-corner or board-selection UI requires separate Alexander approval.
