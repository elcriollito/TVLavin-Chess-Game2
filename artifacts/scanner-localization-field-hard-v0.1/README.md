# CAISSA Scanner localization field hardening v0.1

This directory contains metadata and checksums only. Private beta images remain outside Git.

- `manifest.json` is the fail-closed governed inventory derived from the immutable beta-field-v0.1 snapshot.
- `audit-report.json` summarizes exact Chromium production-pipeline diagnostics and prepares the four-corner annotation batch.

The audit does not change the frozen classifier, model artifacts, threshold, RGB64 preprocessing, or certified beta-field-v0.1 records. Human `TL, TR, BR, BL` playable-field annotations are still required before correct-board, wrong-board, corner-error, or IoU claims can be certified.
