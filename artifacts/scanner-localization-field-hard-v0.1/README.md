# CAISSA Scanner localization field hardening v0.1

This directory contains metadata, checksums, and derived localization metrics only. Private beta images and the human annotation file remain outside Git.

- `manifest.json` is the fail-closed governed inventory derived from the immutable beta-field-v0.1 snapshot.
- `audit-report.json` summarizes the pre-annotation exact Chromium production-pipeline diagnostics.
- `baseline-scoring.json` freezes the production-v4 baseline against 12/12 human-verified playable-field quads.
- `candidate-analysis.json` records candidate ranks, scores, score components, geometric matches, and the multiple-candidate case.
- `corner-error-report.json` records per-corner error, normalized error, polygon overlap, and homography-alignment metrics.
- `failure-taxonomy.json` separates generation, ranking, corner-estimation, ambiguity-policy, and homography failures.
- `counterfactual-analysis.json` evaluates ambiguity margins and ranking evidence without changing production behavior.

The baseline uses the exact Chromium production decode, resize, v4 localization, and 512-by-512 homography path. The frozen classifier, model artifacts, classifier threshold, localization constants, RGB64 preprocessing, and certified beta-field-v0.1 records are unchanged.

Headline metrics are reported on the seven independently admitted records. The five session/duplicate-group records are diagnostic only and do not inflate the independent claim. See `docs/CAISSA_SCANNER_FIELD_LOCALIZATION_BASELINE.md` for definitions, results, and the evidence-based decision.
