# CAISSA Scanner — Real Corpus Corner Annotation

Status: **DEV-ONLY LOCAL TOOLING**

Public Scanner UI changes authorized: **NONE**

This document describes the local corner-annotation helper used to prepare the real-image localization corpus for Phase 3-004B. The helper is not linked from `/scanner`, public navigation, or a production route. It performs no upload, API submission, telemetry, training capture, or image modification.

**VISUAL-FREEZE exception requires Alexander's explicit approval.**

## Corpus folder

Select the extracted corpus folder, not the ZIP and not the repository:

```text
C:\Users\ALEXANDER\Alexander Projects\caissa_scanner_real_localization_corpus_v0_1
```

The selected folder must contain:

```text
manifest-starter.json
originals/
reference_chessvision/
```

The source ZIP remains unchanged at:

```text
C:\Users\ALEXANDER\Downloads\caissa_scanner_real_localization_corpus_v0_1.zip
```

Recorded ZIP SHA-256:

```text
00CBACF04B3BCF06562B96472328FFBCB5B0A9E4AF0E02072C7E9EBE7CA03AE0
```

The starter manifest contains 14 positive samples. Their recorded image checksums were verified against the extracted original files before the tool was implemented.

## Launch

From the isolated Scanner worktree:

```powershell
npm run annotate:scanner:localization
```

Open the printed loopback URL in current Chrome or Edge, normally:

```text
http://127.0.0.1:4178
```

Choose **Open corpus folder** and select the extracted folder above. The browser asks for read/write access because it must create the separate annotation manifest. The loopback server serves four static tool files only; it has no corpus endpoint and refuses POST requests.

The tool uses the Chromium File System Access API. It does not send selected files to the local server or any remote service. Firefox and Safari are not claimed for this developer-only utility.

## Playable-board boundary rule

Mark the four corners of the actual playable 8×8 square field.

Do not mark:

- a decorative frame;
- coordinate margins or labels;
- a marble or wooden outer border;
- browser or application UI;
- the photographed book-page boundary.

The instruction remains visible while annotating.

## Positive sample workflow

1. Confirm that the checksum status says **SHA-256 verified**. A mismatch blocks annotation.
2. Keep **Board present** selected.
3. Click or tap the corners in this exact order:
   1. top-left;
   2. top-right;
   3. bottom-right;
   4. bottom-left.
4. Review the numbered markers and closed quadrilateral.
5. Use **Undo last** or **Reset** if needed.
6. Select **Confirm** only after the overlay follows the playable board.

Confirm does not change the source image or starter manifest. It writes the separate output manifest.

## Negative, partial, and deferred samples

- **No board present** records `boardPresent: false` and `expectedLocalizationResult: board-not-found` without corners.
- **Unsupported partial board** records the board as present but unsupported and does not invent corners.
- **Skip for now** records a non-completed status so the sample remains visible under the incomplete filter.

The starter corpus currently contains 14 board-present samples, but these classifications exist for future hard negatives and corrections to starter metadata.

## Coordinates and validation

The complete original image is displayed without crop or distortion. A click is mapped from the rendered image rectangle back into the original image dimensions. The saved record contains:

- source pixel coordinates, rounded to three decimal places;
- normalized coordinates `x / imageWidth` and `y / imageHeight`, rounded to six decimal places;
- the explicit `topLeft`, `topRight`, `bottomRight`, `bottomLeft` keys;
- source width and height.

Positive confirmation is blocked unless the four points are finite, distinct, in bounds, convex, non-crossing, and have non-zero area. The tool never reorders or fixes human clicks.

## Checksum verification

Before each image becomes annotatable, the browser calculates SHA-256 over the local original bytes and compares it with `originalSha256` from `manifest-starter.json`.

`checksum-mismatch` blocks clicks and confirmation. Do not replace or edit a source file to work around that result; investigate the corpus copy instead.

## Output manifest

The only file created or replaced is:

```text
localization-hard-v0.1.annotated.json
```

It is written in the selected corpus root, beside `manifest-starter.json`. It contains:

- annotation schema and corpus identity;
- SHA-256 of the exact starter manifest;
- progress counts;
- every original sample in original order;
- all existing provenance, permission, difficulty, split, and Chessvision reference fields;
- source dimensions and checksum identity;
- verified disposition and corners where applicable.

`annotatedAt` is deliberately omitted. The annotation records `timestampPolicy: omitted-for-determinism`, so identical human inputs serialize identically. Existing development/holdout split values are preserved; the tool never assigns or reshuffles splits.

## Resume and review

On reopening the same corpus folder, the tool validates the starter-manifest checksum and loads the existing annotation manifest. Completed samples display a check mark and their saved overlay.

Available navigation:

- Previous and Next;
- sample jump list;
- Show incomplete only;
- review and correct any completed sample, then Confirm again.

Keyboard shortcuts are optional conveniences:

- `R`: reset;
- `U` or Backspace: undo last;
- Enter: confirm;
- Left/Right arrow: previous/next.

Click and touch controls remain sufficient.

## Privacy and immutability

- Processing is local.
- No selected image is requested by or posted to the loopback server.
- No remote request, telemetry, API, storage service, or training path exists.
- Original images and `manifest-starter.json` are read only.
- Chessvision metadata remains comparative only and never generates ground truth.

After all samples are verified, preserve the corpus folder and use the resulting annotation manifest as the immutable input to **PHASE 3-004B — REAL-WORLD LOCALIZATION HARDENING**.
