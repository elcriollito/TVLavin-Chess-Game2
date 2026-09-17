# CAISSA Scanner — separate real-piece-truth annotation task

Phase 3-005 is blocked on verified classification truth, **not** localization: 32 unique in-scope 2D boards already have Alexander-verified corners, but zero have complete 64-square piece truth. This task should produce a separate immutable, reviewed `caissa-scanner-piece-truth/1` manifest. Do not edit original images, reference screenshots, the v0.1/v0.3 localization manifests, or the recovered ZIPs. Reference-recognizer screenshots are evidence of possible mistakes, never ground truth.

For each board, show the original and a homography-rectified playable area. A human annotator records image-grid row-major labels (top-left to bottom-right), exactly 64 from `empty,P,N,B,R,Q,K,p,n,b,r,q,k`; records board orientation separately; and optionally enters FEN placement. A second human reviews all occupied squares, ambiguous colors/types and orientation against the original. Store annotator/reviewer names or IDs, verification date, source SHA-256, sample ID, and uncertainty notes. Only records with full verified truth enter accuracy metrics. Do not infer missing squares from a model or reference recognizer. If a source is genuinely unreadable, mark it unresolved outside the scored manifest.

Example record (illustrative all-empty *schema example*, **not** an annotation for any corpus board):

```json
{
  "schemaVersion": "caissa-scanner-piece-truth/1",
  "samples": [
    {
      "sampleId": "example-only",
      "sourceSha256": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      "verifiedBy": "human-reviewer",
      "verifiedAt": "2026-09-16",
      "orientation": "white-at-bottom",
      "fenPlacement": "8/8/8/8/8/8/8/8"
    }
  ]
}
```

For actual corpus records, source IDs and hashes must match the audited 2D source list in the Phase 3-005 report. `fenPlacement` alone is allowed only with human-verified white/black-at-bottom orientation; `squareLabels` may be used instead, or both may be supplied and checked for exact agreement. FEN is preserved internally for evaluation, not exposed in the frozen Scanner UI. The reviewer should map the three Alexander-identified partial-truth cases to exact source IDs and then verify every other square: (A) White Re1/Bc1/Bf1/Qe3; Black Ke8/Qd8/Bd6/Ba6; (B) Black Be7/Bc8/Na5; (C) e1 White King, reference output Black King. These partial assertions must not be expanded into fabricated full positions.

Prioritize diverse **2D** board themes and piece-set families, particularly mobile/web/broadcast, stylized pieces, printed books/puzzles, hatching, low contrast, and photo-of-screen. Livestream 2D boards are supported in the MVP domain. Degraded 2D print, page curvature and strong 2D perspective are supported-with-review. Physical or volumetric 3D is out of MVP scope and stays a hard negative; do not optimize or score it as a target. Preserve source-family and exact-byte deduplication when making any train/evaluation split.

Acceptance: a validator confirms source hashes, reviewer provenance, valid orientation/FEN, 64 legal class tokens per eligible board, unique IDs, no exact-byte overlap double-counting, and no reference-prediction-derived truth. Then rerun the benchmark-only runner with `--truth=<path>` and examine 13-class and exact-board results before authorizing Phase 3-006 data design.
