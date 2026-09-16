# CAISSA Scanner recognition benchmark

This directory is developer-only evaluation infrastructure. It does not activate recognition, load a model in Scanner, change routing, upload images, collect telemetry, or modify the frozen UI.

## Contents

- `geometry.js` — strict normalized-board and 64-tile geometry contract.
- `manifest.js` — versioned manifest, FEN/label, grouped-split, and SHA-256 validation.
- `evaluator.js` — recognizer-independent deterministic metrics and report serialization.
- `run-benchmark.mjs` — read-only CLI adapter from manifest plus recognizer output to JSON report.
- `schema/` — machine-readable JSON Schemas.
- `manifests/` — small committed manifest definitions; large real images stay outside Git.
- `fixtures/` — unit fixtures only, never recognition-performance evidence.

## Read-only evaluation

```powershell
node scanner/recognition/benchmark/run-benchmark.mjs <manifest.json> <recognizer-output.json> > benchmark-report.json
```

The recognizer-output file contains:

```json
{
  "recognizer": {
    "modelVersion": "HistoricalTFJSBaseline/4.0.0",
    "preprocessingVersion": "historical-grayscale/1",
    "backend": "tfjs-wasm",
    "device": "iPhone model or developer machine",
    "browser": "browser and version"
  },
  "confidenceThreshold": 0.6,
  "outputs": []
}
```

The threshold is part of the run record and is not a production routing threshold. The evaluator reads manifests and source checksums but never writes to image or ground-truth paths. Shell redirection creates a separate report artifact.

The future `HistoricalTFJSBaseline` adapter must emit the generic output contract consumed here; it must not be imported into production Scanner code.
