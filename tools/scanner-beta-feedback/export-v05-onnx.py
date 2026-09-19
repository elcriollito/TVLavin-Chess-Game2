"""Export the immutable CAISSA Scanner v0.5 TorchScript classifier to ONNX.

This is a format conversion only. The source artifacts are opened read-only and
their certified checksums are verified before export.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import onnx
import torch


MODEL_VERSION = "caissa-piece-classifier-v0.5-occupancy-recovery"
STATE_SHA256 = "90D06A3C1AAC934188CBA5EEB4B68D51AC64C815351BFE372F2215101DD7209E"
TORCHSCRIPT_SHA256 = "8025AA0F8455BE582AB718A70BC75C1CE4A583852DA4A3A8E540FEF035EE9801"
OPSET = 18
BATCH_SIZE = 64


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest().upper()


def default_source() -> Path:
    return (
        Path(__file__).resolve().parents[3]
        / "caissa"
        / "_scanner"
        / "_model_artifacts"
        / "phase3-007e-v0.5-final1"
    )


def default_output() -> Path:
    return Path(__file__).resolve().parents[2] / "api" / "_private" / "scanner-beta-model"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=default_source())
    parser.add_argument("--output", type=Path, default=default_output())
    args = parser.parse_args()

    source = args.source.resolve()
    state = source / "frozen-state.pt"
    traced = source / "frozen-torchscript.pt"
    if digest(state) != STATE_SHA256:
        raise SystemExit("FROZEN_STATE_CHECKSUM_MISMATCH")
    if digest(traced) != TORCHSCRIPT_SHA256:
        raise SystemExit("FROZEN_TORCHSCRIPT_CHECKSUM_MISMATCH")

    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    artifact = output / "frozen-v05.onnx"
    manifest_path = output / "manifest.json"

    model = torch.jit.load(str(traced), map_location="cpu")
    model.eval()
    sample = torch.zeros(BATCH_SIZE, 3, 64, 64, dtype=torch.float32)
    with torch.inference_mode():
        torch.onnx.export(
            model,
            sample,
            str(artifact),
            export_params=True,
            opset_version=OPSET,
            do_constant_folding=True,
            input_names=["tiles"],
            output_names=["occupancy_logits", "color_logits", "piece_type_logits", "king_logits"],
            dynamo=False,
        )

    converted = onnx.load(str(artifact))
    onnx.checker.check_model(converted, full_check=True)
    artifact_sha256 = digest(artifact)
    manifest = {
        "schemaVersion": "caissa-scanner-production-model/1",
        "modelVersion": MODEL_VERSION,
        "sourceStateSha256": STATE_SHA256,
        "sourceTorchScriptSha256": TORCHSCRIPT_SHA256,
        "format": "ONNX",
        "opset": OPSET,
        "artifact": artifact.name,
        "artifactSha256": artifact_sha256,
        "artifactBytes": artifact.stat().st_size,
        "input": {"name": "tiles", "dtype": "float32", "shape": [64, 3, 64, 64]},
        "outputs": [
            {"name": "occupancy_logits", "dtype": "float32", "shape": [64, 2]},
            {"name": "color_logits", "dtype": "float32", "shape": [64, 2]},
            {"name": "piece_type_logits", "dtype": "float32", "shape": [64, 6]},
            {"name": "king_logits", "dtype": "float32", "shape": [64, 2]},
        ],
        "preprocessingVersion": "caissa-rgb64-uint8-div255/1",
        "occupancyThreshold": 0.99,
        "classOrder": ["empty", "P", "N", "B", "R", "Q", "K", "p", "n", "b", "r", "q", "k"],
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(manifest, separators=(",", ":")))


if __name__ == "__main__":
    main()
