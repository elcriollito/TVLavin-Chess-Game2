# CAISSA Scanner — Phase 3-005A local piece-label annotation

Status: **tool ready; human annotation pending**. The audited v0.1/v0.3 corpora currently yield **32 unique in-scope 2D boards with certified human corners**, **14 exact-byte v0.3 aliases**, and **one excluded physical/volumetric 3D board**. No sample has a trusted complete FEN or 64-square piece truth. Accordingly, **0 are prefillable from trusted FEN and 32 require Alexander's manual annotation**. The tool does not label boards automatically or assert that a reference recognizer is correct.

## Launch and privacy boundary

From the isolated Scanner worktree:

```powershell
npm run annotate:scanner:pieces
```

Open the printed `http://127.0.0.1:4179` URL. The service binds only to loopback, uses port 4179 (distinct from the corner annotator's 4178), accepts same-origin JSON saves with a local-tool header, and exposes no image-upload, telemetry, model, training, or external API route. It serves only its own HTML/CSS/JS, the approved CAISSA piece PNGs, a read-only rectified board PNG, sample/coverage JSON, and a validated record-save endpoint. It rejects other hostnames and cross-origin writes. The main CAISSA server returns 404 for `/tools/scanner-piece-label-annotator/`; nothing is added to `/scanner` or public navigation. It neither changes the frozen Scanner views nor routes any result to production recognition.

Defaults are the certified external `caissa_scanner_real_localization_corpus_v0_1` and `caissa_scanner_real_localization_corpus_v0_3` siblings of the Scanner worktree. Optional local arguments are `--port=`, `--corpus-v01=`, `--corpus-v03=`, and `--output=`. The default **separate** output is:

`C:\Users\ALEXANDER\Alexander Projects\caissa_scanner_piece_labels_v0_1\piece-labels-v0.1.json`

The manifest is created only on the first Save draft or Confirm verified. No source image, reference screenshot, corner annotation, or recovered ZIP is written. Custom `--output` paths inside either immutable source corpus, or directly over any source image, are rejected. Each resave preserves the previous manifest by SHA-256 in the output folder's `history/` directory before atomic replacement. A stale or corrupt existing manifest prevents launch/save rather than being silently replaced.

## Board and label workflow

The primary surface is the **rectified playable board**, not the entire source photograph. Each original source SHA-256 and certified corner-manifest checksum is checked before use. Human TL/TR/BR/BL corners pass through the existing `scanner-board-geometry.js` true projective homography. The resulting 512×512 RGBA board has an exact shared-geometry 8×8 overlay: 64 cells, each 64×64 canonical pixels, with zero gaps or overlaps. Browser CSS renders those same 64 equal cells responsively; it never detects square boundaries independently.

Choose **White at bottom** or **Black at bottom / flipped** explicitly. With White at bottom, image-grid top-left is `a8` and bottom-right is `h1`; with Black at bottom, image-grid top-left is `h1` and bottom-right is `a8`. Flipping orientation reverses canonical label mapping and changes the FEN while preserving the underlying image and each visually placed piece. Square hover/focus/tap status shows the chess square and current stored label. Verification is blocked until orientation is chosen.

The palette uses the existing CAISSA Wikipedia PNG piece assets, organized White K/Q/R/B/N/P, Black k/q/r/b/n/p, and Empty/Clear. Its stored classes are exactly `empty,P,N,B,R,Q,K,p,n,b,r,q,k`. Select once, then click any number of squares; the tool stays armed. Empty supports repeated clearing. Image, Labels, and Both overlay modes support comparing printed or unfamiliar pieces to the annotation. No model prediction is rendered as truth.

The generated FEN is **placement only**. It is derived from the 64 canonical labels and parsed back before save; the tool never invents side to move, castling, en passant or counters and never requires a legal position. Optional FEN prefill is enabled only when an already **human-verified** placement is bound to that certified corpus sample; the displayed FEN is read-only and cannot be replaced by pasted model output. Prefill is saved as an *unverified draft* until Alexander reviews all 64 cells against the image and explicitly confirms. Current trusted-FEN prefill candidates: **0**.

Nonblocking warnings flag missing/multiple kings and unusual pawn or material counts. They never auto-correct pieces or prevent puzzles and compositions from being verified. The known hard cases still need exact source-ID mapping and complete human annotation: (A) White Re1/Bc1/Bf1/Qe3; Black Ke8/Qd8/Bd6/Ba6; (B) Black Be7/Bc8/Na5; (C) e1 White King where the reference recognizer said Black King. These partial facts are not expanded into fabricated full positions.

## File schema and source binding

Version: `caissa-scanner-piece-labels/1`, with a [machine-readable JSON Schema](../tools/scanner-piece-label-annotator/caissa-scanner-piece-labels-v1.schema.json) and fail-closed code validation. Canonical `squareOrder` is a8,b8,…,h8,a7,…,h1. The manifest contains corpus corner-manifest hashes and sorted sample records. Each record contains `sampleId`, source filename, source SHA-256, specific corner-manifest SHA-256, explicit `boardOrientation`, exactly 64 canonical `labels`, matching `placementFen`, annotation status (`draft` or `verified`), source (`manual`, `fen-prefill-unreviewed` draft, or `fen-prefill-reviewed` verified), and human-review evidence for verified entries. Optional piece-set family/style, board theme, difficulty, platform and reference-comparison metadata are retained. Reference FEN, wrong-square notes or outcomes are **comparative only**. There are no generated timestamps in canonical truth.

Illustrative record shape only—not a corpus annotation:

```json
{
  "sampleId": "example-only",
  "sourceFilename": "example.png",
  "sourceSha256": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "cornerManifestSha256": "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
  "boardOrientation": "white-at-bottom",
  "squareOrder": "a8-to-h1",
  "labels": ["64 exact class tokens in canonical square order"],
  "placementFen": "8/8/8/8/8/8/8/8",
  "annotation": {
    "status": "verified",
    "source": "manual",
    "humanVerifiedBy": "Alexander",
    "reviewedAgainstRectifiedBoard": true
  }
}
```

The example's label-array placeholder is deliberately **not valid data**; the validator requires all 64 actual tokens. Changing source bytes, source identity, corner-manifest identity, labels, FEN agreement, orientation, or human-review evidence invalidates a verified record. Exact-byte v0.3 overlaps are shown as aliases of their v0.1 canonical source and never require duplicate manual labeling. Only one verified record per source checksum enters headline evaluation. Drafts do not count as classifier truth.

## Resume, review, coverage, and benchmark handoff

Use Save draft whenever stopping. Restart the command later: the tool reads the file manifest, restores labels/orientation, and shows verified/draft/pending progress. Previous, Next, jump-to-sample and Incomplete only support work across all eligible boards; a verified board can be revisited, edited and re-verified. Editing a saved verified result must be saved as a draft or confirmed again. Review mode displays the rectified image and labeled-piece overlay alongside the generated FEN, metadata and warnings. Confirm verified requires Alexander to check the explicit all-64-squares review box.

Read-only coverage:

```powershell
npm run report:scanner:pieces
```

It reports verified-corner and unique 2D boards, completed/pending/draft/missing truth, exact-byte aliases, out-of-scope boards, trusted-FEN candidates, and the output-manifest path. The [historical TFJS benchmark runner](../tools/run-scanner-historical-tfjs-baseline.mjs) now accepts this versioned manifest with `--truth=<path>`, ignores drafts, validates source/corner hashes and canonical label/FEN agreement, and remaps Black-at-bottom labels to image order only for scoring. **Do not rerun Phase 3-005 as an accuracy claim until Alexander finishes and verifies the labels.**

This is a **2D MVP** annotation tool: digital screenshots, app/web/broadcast boards, printed books, diagrams, puzzles and photographed screens are in scope. Degraded print, strong 2D perspective, page curvature and unusual 2D piece sets may need careful review. Physical/volumetric 3D is out of MVP and retained only as an educational hard negative. No classifier training, fine-tuning, production Candidate FEN, recognition routing, merge, or deployment is part of this task. **VISUAL-FREEZE exception requires Alexander's explicit approval.**
