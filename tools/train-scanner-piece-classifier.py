"""Offline Phase 3-007 experiment. No Scanner runtime import or real truth in training."""
from __future__ import annotations

import argparse
import hashlib
import json
import random
import shutil
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.nn import functional as F


ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "scanner/recognition/classifier-baseline/config-v0.1.json"
CLASSES = ["empty", "P", "N", "B", "R", "Q", "K", "p", "n", "b", "r", "q", "k"]
BYTES_PER_TILE = 64 * 64 * 3


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest().upper()


def write_json(path: Path, value: object) -> None:
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(value, stream, indent=2, ensure_ascii=False, allow_nan=False)
        stream.write("\n")


class CompactRgbCnn(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        layers: list[nn.Module] = []
        channels = [3, 32, 32, 64, 64, 128, 128, 256]
        for index, (source, target) in enumerate(zip(channels[:-1], channels[1:]), 1):
            layers.extend([nn.Conv2d(source, target, 3, padding=1, bias=False),
                           nn.BatchNorm2d(target), nn.ReLU(inplace=True)])
            if index in (2, 4, 6):
                layers.append(nn.MaxPool2d(2))
        self.features = nn.Sequential(*layers)
        self.pool = nn.AdaptiveAvgPool2d(1)
        self.head = nn.Sequential(nn.Flatten(), nn.Linear(256, 128), nn.ReLU(inplace=True),
                                  nn.Dropout(0.2), nn.Linear(128, 13))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.head(self.pool(self.features(x)))


def confusion_metrics(truth: list[int], predicted: list[int]) -> dict:
    if len(truth) != len(predicted) or not truth:
        raise ValueError("nonempty aligned predictions required")
    matrix = [[0] * 13 for _ in CLASSES]
    for actual, found in zip(truth, predicted):
        if actual not in range(13) or found not in range(13):
            raise ValueError("invalid 13-class index")
        matrix[actual][found] += 1
    per_class = []
    for index, label in enumerate(CLASSES):
        support = sum(matrix[index]); chosen = sum(row[index] for row in matrix)
        precision = matrix[index][index] / chosen if chosen else 0.0
        recall = matrix[index][index] / support if support else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        per_class.append({"label": label, "support": support, "precision": precision,
                          "recall": recall, "f1": f1})
    occupied = [(a, b) for a, b in zip(truth, predicted) if a != 0]
    return {"sampleCount": len(truth), "accuracy13": sum(a == b for a, b in zip(truth, predicted)) / len(truth),
            "occupiedMacroF1": sum(item["f1"] for item in per_class[1:]) / 12,
            "occupiedVsEmptyAccuracy": sum((a == 0) == (b == 0) for a, b in zip(truth, predicted)) / len(truth),
            "pieceTypeAccuracyOnTrueOccupied": sum(CLASSES[a].upper() == CLASSES[b].upper() for a, b in occupied) / len(occupied),
            "colorAccuracyOnTrueOccupied": sum((CLASSES[a].isupper() == CLASSES[b].isupper()) and b != 0
                                               for a, b in occupied) / len(occupied),
            "whitePieceAccuracy": sum(a == b for a, b in occupied if CLASSES[a].isupper()) /
                                  sum(CLASSES[a].isupper() for a, _ in occupied),
            "blackPieceAccuracy": sum(a == b for a, b in occupied if CLASSES[a].islower()) /
                                  sum(CLASSES[a].islower() for a, _ in occupied),
            "classOrder": CLASSES, "perClass": per_class, "confusionMatrix": matrix}


def load_synthetic(directory: Path, config: dict) -> tuple[dict, np.memmap]:
    metadata_path = directory / "synthetic-rgb64.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    binary = directory / "synthetic-rgb64.bin"
    records = metadata["records"]
    if (metadata["schemaVersion"] != "caissa-scanner-classifier-synthetic-rgb64/1"
        or metadata["sourceManifestSha256"] != config["datasetManifestSha256"]
        or metadata["catalogSha256"] != config["catalogSha256"]
        or metadata["classOrder"] != CLASSES or metadata["shape"] != [5280, 64, 64, 3]
        or metadata["realEvaluationTilesIncluded"] != 0 or len(records) != 5280
        or binary.stat().st_size != 5280 * BYTES_PER_TILE or digest(binary) != metadata["pixelsSha256"]):
        raise ValueError("uncertified synthetic RGB64 input")
    by_split = {split: [item for item in records if item["split"] == split]
                for split in ("train", "validation", "test")}
    if ([len(by_split[key]) for key in ("train", "validation", "test")] != [3360, 960, 960]
        or set(item["pieceSetId"] for item in by_split["validation"]) != set(config["training"]["validationFamilies"])
        or set(item["pieceSetId"] for item in by_split["test"]) != set(config["training"]["testFamilies"])
        or len(set(item["pieceSetId"] for item in by_split["train"])) != 7):
        raise ValueError("whole-family holdout or sample-count failure")
    family_splits: dict[str, set[str]] = {}
    for item in records:
        family_splits.setdefault(item["pieceSetId"], set()).add(item["split"])
    if any(len(splits) != 1 for splits in family_splits.values()):
        raise ValueError("family crossed splits")
    return metadata, np.memmap(binary, dtype=np.uint8, mode="r", shape=(5280, 64, 64, 3))


def tensor_split(metadata: dict, pixels: np.memmap, split: str, device: torch.device):
    records = [item for item in metadata["records"] if item["split"] == split]
    indices = [item["index"] for item in records]
    x = torch.from_numpy(np.array(pixels[indices], copy=True)).permute(0, 3, 1, 2).contiguous().to(device)
    y = torch.tensor([item["classIndex"] for item in records], dtype=torch.long, device=device)
    return x, y, records


@torch.inference_mode()
def predict(model: nn.Module, x: torch.Tensor, batch_size: int = 256) -> tuple[list[int], list[list[float]]]:
    model.eval()
    found: list[int] = []; probabilities: list[list[float]] = []
    for offset in range(0, len(x), batch_size):
        logits = model(x[offset:offset + batch_size].float().div(255))
        if logits.ndim != 2 or logits.shape[1] != 13:
            raise ValueError("model output violates 13-class contract")
        prob = F.softmax(logits, dim=1).cpu().tolist()
        probabilities.extend(prob)
        found.extend(int(max(range(13), key=lambda j: row[j])) for row in prob)
    return found, probabilities


def seed_everything(seed: int) -> None:
    random.seed(seed); np.random.seed(seed); torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False
    torch.use_deterministic_algorithms(True, warn_only=True)


def load_frozen(output: Path, config: dict, device: torch.device) -> tuple[nn.Module, dict]:
    freeze = json.loads((output / "freeze-manifest.json").read_text(encoding="utf-8"))
    if (freeze["modelVersion"] != config["modelVersion"]
        or freeze["datasetManifestSha256"] != config["datasetManifestSha256"]
        or freeze["configSha256"] != digest(CONFIG_PATH)
        or digest(output / "frozen-state.pt") != freeze["stateSha256"]):
        raise ValueError("frozen artifact checksum/config mismatch")
    model = CompactRgbCnn().to(device)
    model.load_state_dict(torch.load(output / "frozen-state.pt", map_location=device, weights_only=True))
    model.eval()
    return model, freeze


def train(config: dict, synthetic_dir: Path, output: Path) -> None:
    if output.exists():
        raise ValueError("new training output directory required")
    metadata, pixels = load_synthetic(synthetic_dir, config)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    torch.set_num_threads(min(8, torch.get_num_threads()))
    train_x, train_y, _ = tensor_split(metadata, pixels, "train", device)
    val_x, val_y, val_records = tensor_split(metadata, pixels, "validation", device)
    output.mkdir(parents=False)
    seed_reports = []
    for seed in config["training"]["seeds"]:
        seed_everything(seed)
        model = CompactRgbCnn().to(device)
        optimizer = torch.optim.AdamW(model.parameters(), lr=config["training"]["learningRate"],
                                       weight_decay=config["training"]["weightDecay"])
        generator = torch.Generator().manual_seed(seed)
        best_score = -1.0; best_epoch = 0; stale = 0; history = []
        checkpoint = output / f"seed-{seed}-best.pt"
        for epoch in range(1, config["training"]["maximumEpochs"] + 1):
            model.train(); total_loss = 0.0
            order = torch.randperm(len(train_x), generator=generator).to(device)
            for offset in range(0, len(order), config["training"]["batchSize"]):
                take = order[offset:offset + config["training"]["batchSize"]]
                optimizer.zero_grad(set_to_none=True)
                logits = model(train_x[take].float().div(255))
                loss = F.cross_entropy(logits, train_y[take])
                loss.backward(); optimizer.step()
                total_loss += float(loss.detach()) * len(take)
            predictions, _ = predict(model, val_x)
            metrics = confusion_metrics(val_y.cpu().tolist(), predictions)
            score = metrics["occupiedMacroF1"]
            history.append({"epoch": epoch, "trainCrossEntropy": total_loss / len(train_x),
                            "validationOccupiedMacroF1": score, "validationAccuracy13": metrics["accuracy13"]})
            print(f"seed={seed} epoch={epoch} loss={total_loss/len(train_x):.4f} val-macro-f1={score:.4f} val-acc={metrics['accuracy13']:.4f}", flush=True)
            if score > best_score + 1e-6:
                best_score = score; best_epoch = epoch; stale = 0
                torch.save({key: value.detach().cpu() for key, value in model.state_dict().items()}, checkpoint)
            else:
                stale += 1
            if stale >= config["training"]["earlyStoppingPatience"]:
                break
        model.load_state_dict(torch.load(checkpoint, map_location=device, weights_only=True))
        predictions, _ = predict(model, val_x)
        all_metrics = confusion_metrics(val_y.cpu().tolist(), predictions)
        by_family = {family: confusion_metrics([int(val_y[i]) for i in indices],
                                               [predictions[i] for i in indices])
                     for family in sorted(set(item["pieceSetId"] for item in val_records))
                     for indices in [[i for i, item in enumerate(val_records) if item["pieceSetId"] == family]]}
        seed_reports.append({"trainingSeed": seed, "bestEpoch": best_epoch, "epochsRun": len(history),
                             "bestValidationOccupiedMacroF1": best_score, "checkpointSha256": digest(checkpoint),
                             "validation": all_metrics, "validationByFamily": by_family, "history": history})
    selected = sorted(seed_reports, key=lambda item: (-item["bestValidationOccupiedMacroF1"], item["trainingSeed"]))[0]
    state_path = output / "frozen-state.pt"
    shutil.copyfile(output / f"seed-{selected['trainingSeed']}-best.pt", state_path)
    model, _ = None, None
    model = CompactRgbCnn().cpu().eval()
    model.load_state_dict(torch.load(state_path, map_location="cpu", weights_only=True))
    traced_path = output / "frozen-torchscript.pt"
    torch.jit.trace(model, torch.zeros(1, 3, 64, 64), check_trace=True).save(str(traced_path))
    parameter_count = sum(parameter.numel() for parameter in model.parameters())
    summary = {"schemaVersion": "caissa-scanner-classifier-training-summary/1",
               "modelVersion": config["modelVersion"], "architectureVersion": config["architectureVersion"],
               "datasetVersion": config["datasetVersion"], "datasetManifestSha256": config["datasetManifestSha256"],
               "syntheticPixelsSha256": metadata["pixelsSha256"], "framework": f"PyTorch {torch.__version__}",
               "device": str(device), "inputShape": [None, 3, 64, 64], "classOrder": CLASSES,
               "parameterCount": parameter_count, "optimizer": config["training"]["optimizer"],
               "learningRate": config["training"]["learningRate"], "weightDecay": config["training"]["weightDecay"],
               "batchSize": config["training"]["batchSize"], "maximumEpochs": config["training"]["maximumEpochs"],
               "earlyStoppingPatience": config["training"]["earlyStoppingPatience"],
               "selectionMetric": config["training"]["selectionMetric"], "seedResults": seed_reports,
               "selectedSeed": selected["trainingSeed"], "selectedBestEpoch": selected["bestEpoch"],
               "realTrainingTiles": 0, "syntheticTestSeenBeforeFreeze": False}
    freeze = {"schemaVersion": "caissa-scanner-classifier-freeze/1", "modelVersion": config["modelVersion"],
              "architectureVersion": config["architectureVersion"], "datasetManifestSha256": config["datasetManifestSha256"],
              "syntheticPixelsSha256": metadata["pixelsSha256"], "configSha256": digest(CONFIG_PATH),
              "classOrder": CLASSES, "inputShape": [None, 3, 64, 64], "preprocessing": "RGB64 uint8 / 255",
              "parameterCount": parameter_count, "selectedSeed": selected["trainingSeed"],
              "bestEpoch": selected["bestEpoch"], "stateSha256": digest(state_path),
              "torchscriptSha256": digest(traced_path), "stateBytes": state_path.stat().st_size,
              "torchscriptBytes": traced_path.stat().st_size,
              "selectionEvidence": "validation occupied macro-F1 only; synthetic test and real benchmark not yet read",
              "thresholdPolicy": "argmax 13-class softmax; no abstention or chess correction"}
    write_json(output / "training-summary.json", summary)
    write_json(output / "validation-report.json", {"schemaVersion": "caissa-scanner-classifier-validation/1",
                                                   "selectedSeed": selected["trainingSeed"],
                                                   "bestEpoch": selected["bestEpoch"],
                                                   "metrics": selected["validation"],
                                                   "byFamily": selected["validationByFamily"]})
    write_json(output / "freeze-manifest.json", freeze)
    print(json.dumps({"selectedSeed": selected["trainingSeed"], "bestEpoch": selected["bestEpoch"],
                      "validationOccupiedMacroF1": selected["bestValidationOccupiedMacroF1"],
                      "parameters": parameter_count, "stateSha256": freeze["stateSha256"]}, indent=2), flush=True)


def synthetic_test(config: dict, synthetic_dir: Path, output: Path) -> None:
    if (output / "synthetic-test-report.json").exists():
        raise ValueError("synthetic test was already evaluated")
    metadata, pixels = load_synthetic(synthetic_dir, config)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model, freeze = load_frozen(output, config, device)
    x, y, records = tensor_split(metadata, pixels, "test", device)
    predicted, _ = predict(model, x)
    labels = y.cpu().tolist()
    by_family = {family: confusion_metrics([labels[i] for i in indices], [predicted[i] for i in indices])
                 for family in sorted(set(item["pieceSetId"] for item in records))
                 for indices in [[i for i, item in enumerate(records) if item["pieceSetId"] == family]]}
    write_json(output / "synthetic-test-report.json", {"schemaVersion": "caissa-scanner-classifier-synthetic-test/1",
                                                       "modelVersion": config["modelVersion"], "stateSha256": freeze["stateSha256"],
                                                       "datasetManifestSha256": config["datasetManifestSha256"],
                                                       "metrics": confusion_metrics(labels, predicted), "byFamily": by_family,
                                                       "evaluationPolicy": "single selected frozen checkpoint; no post-test tuning"})
    print("synthetic unseen-family test evaluated once", flush=True)


def infer_real(config: dict, output: Path, real_dir: Path) -> None:
    predictions_path = output / "real-predictions.json"
    if predictions_path.exists():
        raise ValueError("real inference already performed; no repeated benchmark")
    manifest = json.loads((real_dir / "real-rgb64.json").read_text(encoding="utf-8"))
    binary = real_dir / "real-rgb64.bin"
    if (manifest["schemaVersion"] != "caissa-scanner-classifier-real-rgb64/1"
        or manifest["boardCount"] != 31 or manifest["tileCount"] != 1984
        or manifest["classOrder"] != CLASSES or binary.stat().st_size != 1984 * BYTES_PER_TILE
        or digest(binary) != manifest["pixelsSha256"]):
        raise ValueError("uncertified real RGB64 input")
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model, freeze = load_frozen(output, config, device)
    raw = np.memmap(binary, dtype=np.uint8, mode="r", shape=(1984, 64, 64, 3))
    x = torch.from_numpy(np.array(raw, copy=True)).permute(0, 3, 1, 2).contiguous().to(device)
    predicted, probs = predict(model, x)
    if len(probs) != 1984 or any(len(row) != 13 for row in probs):
        raise ValueError("invalid real model output shape")
    write_json(predictions_path, {"schemaVersion": "caissa-scanner-classifier-real-predictions/1",
                                  "modelVersion": config["modelVersion"], "stateSha256": freeze["stateSha256"],
                                  "realPixelsSha256": manifest["pixelsSha256"], "classOrder": CLASSES,
                                  "boardIds": manifest["boardIds"], "predictedIndices": predicted,
                                  "probabilities": probs, "truthReadByModel": False,
                                  "policy": "one frozen checkpoint; argmax softmax; no post-real tuning"})
    print("real inference completed once; predictions contain no truth", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["train", "synthetic-test", "infer-real", "self-test"])
    parser.add_argument("--synthetic-dir", type=Path)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--real-dir", type=Path)
    args = parser.parse_args()
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    if config["classOrder"] != CLASSES or config["input"]["width"] != 64:
        raise ValueError("classification contract changed")
    if args.mode == "self-test":
        model = CompactRgbCnn().eval()
        assert tuple(model(torch.zeros(2, 3, 64, 64)).shape) == (2, 13)
        assert confusion_metrics([0, 1, 7, 2], [0, 7, 7, 2])["accuracy13"] == .75
        print(f"self-test passed; parameters={sum(p.numel() for p in model.parameters())}")
    elif args.mode == "train":
        if not args.synthetic_dir or not args.output_dir:
            parser.error("train needs --synthetic-dir and --output-dir")
        train(config, args.synthetic_dir, args.output_dir)
    elif args.mode == "synthetic-test":
        if not args.synthetic_dir or not args.output_dir:
            parser.error("synthetic-test needs --synthetic-dir and --output-dir")
        synthetic_test(config, args.synthetic_dir, args.output_dir)
    else:
        if not args.real_dir or not args.output_dir:
            parser.error("infer-real needs --real-dir and --output-dir")
        infer_real(config, args.output_dir, args.real_dir)


if __name__ == "__main__":
    main()
