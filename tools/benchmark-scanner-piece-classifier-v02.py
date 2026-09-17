"""Desktop CPU performance of the frozen v0.2 model using synthetic tiles only."""
from __future__ import annotations

import argparse
import gzip
import json
import statistics
import time
from pathlib import Path

import numpy as np
import psutil
import torch

from importlib.machinery import SourceFileLoader


ROOT = Path(__file__).resolve().parent.parent
revision = SourceFileLoader("scanner_revision", str(ROOT / "tools/train-scanner-piece-classifier-v02.py")).load_module()


def benchmark(data_dir: Path, model_dir: Path, output: Path) -> None:
    if output.exists():
        raise ValueError("performance report already exists")
    config = json.loads(revision.CONFIG.read_text(encoding="utf-8"))
    metadata, pixels = revision.load_dataset(data_dir, config)
    freeze = json.loads((model_dir / "freeze-manifest.json").read_text(encoding="utf-8"))
    indices = [item["index"] for item in metadata["records"] if item["split"] == "test"][:64]
    if len(indices) != 64:
        raise ValueError("missing synthetic board-sized batch")
    samples = np.array(pixels[indices], copy=True)
    torch.set_num_threads(8)
    process = psutil.Process()
    rss_before = process.memory_info().rss
    start = time.perf_counter()
    fresh_model, _ = revision.load_frozen(model_dir, config, torch.device("cpu"))
    load_ms = (time.perf_counter() - start) * 1000
    rss_after_load = process.memory_info().rss
    with torch.inference_mode():
        for _ in range(5):
            x = torch.from_numpy(samples).permute(0, 3, 1, 2).contiguous().float().div(255)
            revision.canonical(fresh_model(x), freeze["temperature"])
        prep_ms = []; inference_ms = []
        for _ in range(30):
            start = time.perf_counter()
            x = torch.from_numpy(samples).permute(0, 3, 1, 2).contiguous().float().div(255)
            prep_ms.append((time.perf_counter() - start) * 1000)
            start = time.perf_counter()
            probabilities, _ = revision.canonical(fresh_model(x), freeze["temperature"])
            inference_ms.append((time.perf_counter() - start) * 1000)
            if tuple(probabilities.shape) != (64, 13):
                raise ValueError("canonical output shape changed")
    state = model_dir / "frozen-state.pt"
    traced = model_dir / "frozen-torchscript.pt"
    report = {"schemaVersion": "caissa-scanner-classifier-revision-desktop-performance/1",
              "modelVersion": freeze["modelVersion"], "stateSha256": freeze["stateSha256"],
              "environment": {"framework": f"PyTorch {torch.__version__}", "device": "CPU", "cpuThreads": 8,
                              "os": "Windows", "samplePolicy": "64 certified synthetic unseen-family tiles; no real-board timing"},
              "method": "5 warmups, 30 timed repeats; RGB64 NCHW float32 /255, batch 64; median",
              "modelLoadMilliseconds": load_ms,
              "preprocessMillisecondsPerBoard": statistics.median(prep_ms),
              "inferenceMillisecondsPerBoard": statistics.median(inference_ms),
              "inferenceMillisecondsPerTileEffective": statistics.median(inference_ms) / 64,
              "totalPreprocessAndInferenceMillisecondsPerBoard": statistics.median(prep_ms) + statistics.median(inference_ms),
              "residentMemoryBytesBeforeLoad": rss_before,
              "residentMemoryBytesAfterLoad": rss_after_load,
              "residentMemoryBytesAfterBenchmark": process.memory_info().rss,
              "nativeModelBytes": state.stat().st_size,
              "nativeModelGzipBytes": len(gzip.compress(state.read_bytes(), compresslevel=9, mtime=0)),
              "torchscriptBytes": traced.stat().st_size,
              "torchscriptGzipBytes": len(gzip.compress(traced.read_bytes(), compresslevel=9, mtime=0)),
              "limitations": "Excludes image decoding, homography, crop, file I/O, browser backend and mobile device behavior"}
    output.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    benchmark(args.data_dir, args.model_dir, args.output)
