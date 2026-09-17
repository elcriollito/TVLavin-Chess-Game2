"""Read-only v0.1 root-cause probe. Uses synthetic validation, never real pixels or labels."""
from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

import torch
from torch.nn import functional as F

from importlib.machinery import SourceFileLoader


ROOT = Path(__file__).resolve().parent.parent
baseline = SourceFileLoader("scanner_baseline", str(ROOT / "tools/train-scanner-piece-classifier.py")).load_module()


def audit(synthetic_dir: Path, model_dir: Path, output: Path) -> None:
    if output.exists():
        raise ValueError("new audit output required")
    config = json.loads(baseline.CONFIG_PATH.read_text(encoding="utf-8"))
    metadata, pixels = baseline.load_synthetic(synthetic_dir, config)
    model, freeze = baseline.load_frozen(model_dir, config, torch.device("cpu"))
    train = [item for item in metadata["records"] if item["split"] == "train"]
    validation = [item for item in metadata["records"] if item["split"] == "validation"]
    empty_train = [item for item in train if item["classLabel"] == "empty"]
    x, y, records = baseline.tensor_split(metadata, pixels, "validation", torch.device("cpu"))
    torch.set_num_threads(8)
    with torch.inference_mode():
        logits = torch.cat([model(batch.float().div(255)) for batch in x.split(128)])
        probabilities = F.softmax(logits, dim=1)
    found = probabilities.argmax(1)
    groups = {}
    for family in sorted(set(item["pieceSetId"] for item in records)):
        mask = torch.tensor([item["pieceSetId"] == family for item in records])
        empty = mask & (y == 0)
        king = mask & (y == 12)
        groups[family] = {
            "emptyCount": int(empty.sum()),
            "emptyPredictedOccupied": int(((found != 0) & empty).sum()),
            "emptyMeanBlackKingProbability": float(probabilities[empty, 12].mean()),
            "emptyMaxBlackKingProbability": float(probabilities[empty, 12].max()),
            "emptyMeanOccupancyProbability": float((1 - probabilities[empty, 0]).mean()),
            "emptyMaxOccupancyProbability": float((1 - probabilities[empty, 0]).max()),
            "trueBlackKingCount": int(king.sum()),
            "predictedBlackKingCount": int((found[mask] == 12).sum()),
            "meanTop1Confidence": float(probabilities[mask].max(1).values.mean()),
            "meanLogitMargin": float((logits[mask].topk(2, dim=1).values[:, 0]
                                      - logits[mask].topk(2, dim=1).values[:, 1]).mean())
        }
    real = json.loads((ROOT / "artifacts/scanner-piece-classifier-v0.1/real-31-board-report.json").read_text(encoding="utf-8"))
    test = json.loads((ROOT / "artifacts/scanner-piece-classifier-v0.1/synthetic-test-report.json").read_text(encoding="utf-8"))
    test_matrix = test["metrics"]["confusionMatrix"]
    real_matrix = real["confusionMatrix"]
    report = {
        "schemaVersion": "caissa-scanner-classifier-v01-root-cause/1",
        "sourceStateSha256": freeze["stateSha256"],
        "syntheticPixelsSha256": metadata["pixelsSha256"],
        "trainClassCounts": dict(sorted(Counter(item["classLabel"] for item in train).items())),
        "trainEmptyFraction": len(empty_train) / len(train),
        "realEmptyFractionDescriptiveOnly": sum(real_matrix[0]) / real["squareCount"],
        "trainEmptyAugmentationCounts": dict(sorted(Counter(item["augmentationId"] for item in empty_train).items())),
        "trainEmptyThemeCounts": dict(sorted(Counter(item["boardThemeId"] for item in empty_train).items())),
        "validationOnlyLogits": groups,
        "prior13ClassOutputOrder": baseline.CLASSES,
        "syntheticUnseenFamilyAggregateDescriptiveOnly": {
            "emptyPredictedOccupied": sum(test_matrix[0][1:]),
            "emptyToBlackKing": test_matrix[0][12],
            "predictedBlackKing": sum(row[12] for row in test_matrix),
            "trueBlackKing": sum(test_matrix[12])
        },
        "previousRealAggregateDescriptiveOnly": {
            "emptyPredictedOccupied": sum(real_matrix[0][1:]),
            "emptyToBlackKing": real_matrix[0][12],
            "predictedBlackKing": sum(row[12] for row in real_matrix),
            "trueBlackKing": sum(real_matrix[12]),
            "brier13": real["confidence"]["brier13"],
            "ece10": real["confidence"]["ece10"],
            "highConfidenceWrong": real["confidence"]["wrongAtLeast090"]
        },
        "interpretationPolicy": "Validation logits and dataset metadata only; prior synthetic test and real results are descriptive aggregates, not training/model-selection inputs"
    }
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--synthetic-dir", required=True, type=Path)
    parser.add_argument("--model-dir", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    options = parser.parse_args()
    audit(options.synthetic_dir, options.model_dir, options.output)
