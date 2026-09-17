# Scanner piece dataset v0.2

Private, local **2D-only** generation. No classifier training or public Scanner change is authorized. See [dataset governance](../../../../docs/CAISSA_SCANNER_PIECESET_DATASET.md) and the committed [quality report](../../../../artifacts/scanner-piece-dataset/quality-v0.2.json).

Seven pinned open-source 12-piece families plus one CAISSA procedural pilot are cataloged. Original SVGs, separate normalized PNGs, source notice/license texts and every checksum are committed under `piece-sets/`. The asset integrity check runs before generation. The upstream acquisition tool is audit/reference code and refuses to overwrite assets; do not rerun it in a populated worktree.

Generate to a **new external directory**:

```powershell
npm run generate:scanner:piece-dataset -- --seed=306 '--output-dir=C:\Temp\new-scanner-piece-dataset-folder'
```

This creates 3,840 128×128 color SVG/PNG synthetic tiles, a deterministic manifest and quality report. The manifest also contains 1,984 test-only logical records from 31 Alexander-verified real boards; source pixels and truth stay external and unchanged. The tool checks their hashes, corners, orientation, labels and 14 exact-byte alias exclusions. The nonstandard no-kings draft remains excluded. `--truth=`, `--corpus-v01=` and `--corpus-v03=` may select certified copies. No real pixels are copied to Git.

The six train families and two complete whole-family holdouts have balanced occupied/empty and white/black counts. Board themes cross splits intentionally; piece-art families do not. Exact-byte and structural asset duplicate screens, role/license metadata, per-family checksum and deterministic report are checked by `npm run test:scanner:dataset`. Eight families are still below the ten-family minimum: **NEEDS MORE PIECE-SET DIVERSITY**. Do not train a model or tune on the real 31-board cohort.
