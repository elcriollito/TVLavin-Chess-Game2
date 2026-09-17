"""Desktop CPU timing of the frozen experimental classifier on synthetic tiles only."""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import statistics
import time
from pathlib import Path

import numpy as np
import psutil
import torch

from importlib.machinery import SourceFileLoader


ROOT = Path(__file__).resolve().parent.parent
MODEL_CODE = SourceFileLoader("classifier_train", str(ROOT / "tools/train-scanner-piece-classifier.py")).load_module()


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def benchmark(model_dir: Path, synthetic_dir: Path, output: Path) -> None:
    if output.exists():
        raise ValueError("performance report already exists")
    config = json.loads(MODEL_CODE.CONFIG_PATH.read_text(encoding="utf-8"))
    freeze = json.loads((model_dir / "freeze-manifest.json").read_text(encoding="utf-8"))
    if (freeze["configSha256"] != sha(MODEL_CODE.CONFIG_PATH)
        or freeze["stateSha256"] != sha(model_dir / "frozen-state.pt")
        or freeze["torchscriptSha256"] != sha(model_dir / "frozen-torchscript.pt")):
        raise ValueError("frozen model checksum mismatch")
    metadata, raw = MODEL_CODE.load_synthetic(synthetic_dir, config)
    indices = [item["index"] for item in metadata["records"] if item["split"] == "test"][:64]
    if len(indices) != 64:
        raise ValueError("missing synthetic test board-sized batch")
    pixels = np.array(raw[indices], copy=True)
    torch.set_num_threads(8)
    process = psutil.Process()
    rss_before = process.memory_info().rss
    start = time.perf_counter()
    model = MODEL_CODE.CompactRgbCnn().cpu().eval()
    model.load_state_dict(torch.load(model_dir / "frozen-state.pt", map_location="cpu", weights_only=True))
    load_ms = (time.perf_counter() - start) * 1000
    rss_after_load = process.memory_info().rss
    with torch.inference_mode():
        for _ in range(5):
            x = torch.from_numpy(pixels).permute(0, 3, 1, 2).contiguous().float().div(255)
            model(x)
        prep_samples = []
        inference_samples = []
        for _ in range(30):
            start = time.perf_counter()
            x = torch.from_numpy(pixels).permute(0, 3, 1, 2).contiguous().float().div(255)
            prep_samples.append((time.perf_counter() - start) * 1000)
            start = time.perf_counter()
            logits = model(x)
            inference_samples.append((time.perf_counter() - start) * 1000)
            if logits.shape != (64, 13):
                raise ValueError("output shape changed")
    rss_after = process.memory_info().rss
    state = model_dir / "frozen-state.pt"
    traced = model_dir / "frozen-torchscript.pt"
    report = {
        "schemaVersion": "caissa-scanner-classifier-desktop-performance/1",
        "modelVersion": freeze["modelVersion"], "stateSha256": freeze["stateSha256"],
        "environment": {"framework": f"PyTorch {torch.__version__}", "device": "CPU",
                        "cpuThreads": torch.get_num_threads(), "os": "Windows", "samplePolicy": "64 certified synthetic test tiles; no real-board inference"},
        "method": "5 warmups, 30 timed repeats; float32 NCHW normalized RGB64, batch 64; median",
        "modelLoadMilliseconds": load_ms,
        "preprocessMillisecondsPerBoard": statistics.median(prep_samples),
        "inferenceMillisecondsPerBoard": statistics.median(inference_samples),
        "inferenceMillisecondsPerTileEffective": statistics.median(inference_samples) / 64,
        "totalPreprocessAndInferenceMillisecondsPerBoard": statistics.median(prep_samples) + statistics.median(inference_samples),
        "residentMemoryBytesBeforeLoad": rss_before,
        "residentMemoryBytesAfterLoad": rss_after_load,
        "residentMemoryBytesAfterBenchmark": rss_after,
        "nativeModelBytes": state.stat().st_size,
        "nativeModelGzipBytes": len(gzip.compress(state.read_bytes(), compresslevel=9, mtime=0)),
        "torchscriptBytes": traced.stat().st_size,
        "torchscriptGzipBytes": len(gzip.compress(traced.read_bytes(), compresslevel=9, mtime=0)),
        "limitations": "64x64 tile tensor conversion only; excludes human-corner warp/Sharp cropping, file I/O, browser/WebGPU/TFJS overhead, and mobile latency"
    }
    output.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", required=True, type=Path)
    parser.add_argument("--synthetic-dir", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    benchmark(args.model_dir, args.synthetic_dir, args.output)
