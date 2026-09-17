# Scanner piece dataset v0.1

This is a private, local, **2D-only dataset foundation**, not a classifier or a production Scanner feature. The 31 Alexander-verified real boards are evaluation-only. Their original images and canonical truth stay outside Git and are opened read-only. The nonstandard `cv-success-005-puzzle-diagram-no-kings` remains in the source truth but is excluded from this dataset's test tiles and all headline counts.

## Generate an isolated pilot

From the Scanner worktree:

```powershell
npm run generate:scanner:piece-dataset -- --seed=306 '--output-dir=C:\Temp\caissa-piece-dataset-v01-new'
```

Choose a **new, nonexistent folder outside the repository**. The command refuses to overwrite an existing folder. It writes 128×128 color SVG pilot tiles, a deterministic `dataset-manifest.json`, and `quality-report.json`. The manifest references the 31 real sources by cohort-relative path and checksum; it writes no real image or real tile pixels. The canonical published summary is at `artifacts/scanner-piece-dataset/quality-v0.1.json`.

The generator defaults to the sibling external piece-truth and v0.1/v0.3 localization corpora. `--truth=`, `--corpus-v01=`, and `--corpus-v03=` may point to certified copies. It checks every original SHA-256, both corner-manifest identities, exact 64-square labels and placement FEN, explicit orientation, human verification, 14 alias exclusions, and the external truth checksum before and after the run. If any binding changes, generation fails closed.

## What exists and what does not

- One original CAISSA-authored geometric **pilot** family is training-eligible. It has six types in both colors, but cannot demonstrate visual generalization. SVGs are 128×128 and preserve color/detail; future experiments may rasterize/downsample them.
- Two Lichess families are **acquisition leads**, not local assets or training data. The existing CAISSA Wikipedia PNG set lacks certified per-file dataset rights; the recovered Replit silhouette is historical reference only. All four are `REFERENCE-ONLY` in the catalog.
- The 31 real boards give 1,984 `EVALUATION-ONLY` square records. Their piece-art family, board-theme family, and platform are not verified; no invented platform label enters the catalog.
- No validation family, platform-family holdout, or independently held-out named piece family exists yet. The real test cohort stays sequestered; it must not be used for training, augmentation choices, or threshold tuning.
- This v0.1 renderer covers independent squares, color backgrounds, hatching/grain, small bounded blur, print fade, low contrast, highlights, and coordinates. JPEG artifacts, moiré, real screen glare, perspective residual, camera capture, and book-page effects are **planned**, not claimed as generated.

Schemas are enforced by `dataset-core.js`; catalog, theme, and platform-coverage versions are JSON. The validator rejects role/license inconsistencies, invalid classes, missing metadata, duplicate image bytes, cross-split source/family/theme/augmentation/session leakage, and malformed generated SVGs. All generated tiles remain outside Git. See [the dataset design](../../../../docs/CAISSA_SCANNER_PIECESET_DATASET.md) for governance, coverage, and readiness.
