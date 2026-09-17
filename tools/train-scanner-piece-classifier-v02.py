"""Offline v0.2 controlled experiment. Real truth is never imported by this module."""
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
CONFIG = ROOT / "scanner/recognition/classifier-revision/config-v0.2.json"
CLASSES = ["empty", "P", "N", "B", "R", "Q", "K", "p", "n", "b", "r", "q", "k"]
TILE_BYTES = 64 * 64 * 3


def digest(path: Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest().upper()


def write_json(path: Path, value: object) -> None:
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(value, stream, indent=2, ensure_ascii=False, allow_nan=False)
        stream.write("\n")


def seed_all(seed: int) -> None:
    random.seed(seed); np.random.seed(seed); torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False
    torch.use_deterministic_algorithms(True, warn_only=True)


class Backbone(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        channels = [3, 32, 32, 64, 64, 128, 128, 256]
        layers: list[nn.Module] = []
        for index, (source, target) in enumerate(zip(channels[:-1], channels[1:]), 1):
            layers.extend((nn.Conv2d(source, target, 3, padding=1, bias=False),
                           nn.BatchNorm2d(target), nn.ReLU(inplace=True)))
            if index in (2, 4, 6):
                layers.append(nn.MaxPool2d(2))
        self.features = nn.Sequential(*layers)
        self.pool = nn.AdaptiveAvgPool2d(1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.pool(self.features(x)).flatten(1)


class SingleHead(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.backbone = Backbone()
        self.head = nn.Sequential(nn.Linear(256, 128), nn.ReLU(inplace=True), nn.Dropout(0.2), nn.Linear(128, 13))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.head(self.backbone(x))


class MultiHead(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.backbone = Backbone()
        self.occupancy = nn.Sequential(nn.Linear(256, 64), nn.ReLU(inplace=True), nn.Linear(64, 2))
        self.color = nn.Sequential(nn.Linear(256, 64), nn.ReLU(inplace=True), nn.Linear(64, 2))
        self.piece_type = nn.Sequential(nn.Linear(256, 128), nn.ReLU(inplace=True), nn.Linear(128, 6))

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        features = self.backbone(x)
        return self.occupancy(features), self.color(features), self.piece_type(features)


def create_model(head: str) -> nn.Module:
    return SingleHead() if head == "single" else MultiHead() if head == "multi" else None


def multi_loss(logits: tuple[torch.Tensor, torch.Tensor, torch.Tensor], labels: torch.Tensor) -> torch.Tensor:
    occ, color, piece_type = logits
    occupied = labels != 0
    occ_loss = F.cross_entropy(occ, occupied.long())
    if not bool(occupied.any()):
        return occ_loss * 1.5
    color_target = (labels[occupied] >= 7).long()
    type_target = (labels[occupied] - 1) % 6
    return 1.5 * occ_loss + 0.75 * F.cross_entropy(color[occupied], color_target) + F.cross_entropy(piece_type[occupied], type_target)


def canonical(logits: torch.Tensor | tuple[torch.Tensor, torch.Tensor, torch.Tensor],
              temperatures: dict[str, float] | None = None) -> tuple[torch.Tensor, dict[str, torch.Tensor]]:
    temps = temperatures or {"single": 1, "occupancy": 1, "color": 1, "type": 1}
    if isinstance(logits, torch.Tensor):
        probabilities = F.softmax(logits / temps.get("single", 1), dim=1)
        occupied = 1 - probabilities[:, 0]
        white = probabilities[:, 1:7].sum(1)
        black = probabilities[:, 7:13].sum(1)
        conditional_color = torch.stack((white, black), dim=1) / occupied[:, None].clamp_min(1e-12)
        conditional_type = (probabilities[:, 1:7] + probabilities[:, 7:13]) / occupied[:, None].clamp_min(1e-12)
        return probabilities, {"occupancy": occupied, "color": conditional_color, "type": conditional_type}
    occ, color, piece_type = logits
    occ_prob = F.softmax(occ / temps.get("occupancy", 1), dim=1)
    color_prob = F.softmax(color / temps.get("color", 1), dim=1)
    type_prob = F.softmax(piece_type / temps.get("type", 1), dim=1)
    occupied = occ_prob[:, 1]
    probability = torch.cat((occ_prob[:, :1],
                             occupied[:, None] * color_prob[:, :1] * type_prob,
                             occupied[:, None] * color_prob[:, 1:] * type_prob), dim=1)
    return probability, {"occupancy": occupied, "color": color_prob, "type": type_prob}


def load_dataset(directory: Path, config: dict) -> tuple[dict, np.memmap]:
    metadata_path = directory / "synthetic-rgb64-v04.json"
    binary = directory / "synthetic-rgb64-v04.bin"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    if (digest(metadata_path) != config["datasetMetadataSha256"]
        or digest(binary) != config["datasetPixelsSha256"]
        or metadata["pixelsSha256"] != config["datasetPixelsSha256"]
        or metadata["sourceManifestSha256"] != config["sourceManifestSha256"]
        or metadata["catalogSha256"] != config["catalogSha256"]
        or metadata["classOrder"] != CLASSES or metadata["shape"] != [7920, 64, 64, 3]
        or metadata["realEvaluationTilesIncluded"] != 0 or len(metadata["records"]) != 7920
        or metadata["splitCounts"] != {"train": 5040, "validation": 1440, "test": 1440}
        or binary.stat().st_size != 7920 * TILE_BYTES):
        raise ValueError("uncertified v0.4 synthetic dataset")
    records = metadata["records"]
    if len(set(item["sampleId"] for item in records)) != 7920 or any(item["index"] != index for index, item in enumerate(records)):
        raise ValueError("dataset sample identity or order changed")
    by_family: dict[str, set[str]] = {}
    for item in records:
        if item["classIndex"] != CLASSES.index(item["classLabel"]):
            raise ValueError("label/class order mismatch")
        by_family.setdefault(item["pieceSetId"], set()).add(item["split"])
    if len(by_family) != 11 or any(len(value) != 1 for value in by_family.values()):
        raise ValueError("whole-family leakage")
    for split, expected_families, expected_empty in (
        ("validation", config["training"]["validationFamilies"], 960),
        ("test", config["training"]["testFamilies"], 960)):
        rows = [item for item in records if item["split"] == split]
        if set(item["pieceSetId"] for item in rows) != set(expected_families) or sum(item["classIndex"] == 0 for item in rows) != expected_empty:
            raise ValueError("holdout split integrity failure")
    return metadata, np.memmap(binary, dtype=np.uint8, mode="r", shape=(7920, 64, 64, 3))


def split_tensors(metadata: dict, pixels: np.memmap, split: str, device: torch.device):
    records = [item for item in metadata["records"] if item["split"] == split]
    x = torch.from_numpy(np.array(pixels[[item["index"] for item in records]], copy=True)).permute(0, 3, 1, 2).contiguous().to(device)
    labels = torch.tensor([item["classIndex"] for item in records], dtype=torch.long, device=device)
    return x, labels, records


@torch.inference_mode()
def model_probabilities(model: nn.Module, x: torch.Tensor, temps: dict[str, float] | None = None,
                        batch: int = 256) -> tuple[torch.Tensor, dict[str, torch.Tensor]]:
    model.eval()
    probabilities = []; diagnostics: dict[str, list[torch.Tensor]] = {"occupancy": [], "color": [], "type": []}
    for part in x.split(batch):
        probs, heads = canonical(model(part.float().div(255)), temps)
        if probs.ndim != 2 or probs.shape[1] != 13:
            raise ValueError("canonical 13-class output changed")
        probabilities.append(probs.cpu())
        for key in diagnostics:
            diagnostics[key].append(heads[key].cpu())
    return torch.cat(probabilities), {key: torch.cat(values) for key, values in diagnostics.items()}


def metrics(probability: torch.Tensor, truth: torch.Tensor, records: list[dict],
            heads: dict[str, torch.Tensor] | None = None) -> dict:
    labels = truth.cpu().tolist(); found = probability.argmax(1).tolist()
    matrix = [[0] * 13 for _ in CLASSES]
    for actual, predicted in zip(labels, found):
        matrix[actual][predicted] += 1
    per_class = []
    for index, label in enumerate(CLASSES):
        tp = matrix[index][index]; support = sum(matrix[index]); predicted = sum(row[index] for row in matrix)
        precision = tp / predicted if predicted else 0
        recall = tp / support if support else 0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0
        per_class.append({"label": label, "support": support, "predicted": predicted,
                          "precision": precision, "recall": recall, "f1": f1})
    occupied_truth = [i for i, value in enumerate(labels) if value != 0]
    tp_occ = sum(labels[i] != 0 and found[i] != 0 for i in range(len(labels)))
    fp_occ = sum(labels[i] == 0 and found[i] != 0 for i in range(len(labels)))
    fn_occ = sum(labels[i] != 0 and found[i] == 0 for i in range(len(labels)))
    precision_occ = tp_occ / (tp_occ + fp_occ) if tp_occ + fp_occ else 0
    recall_occ = tp_occ / (tp_occ + fn_occ) if tp_occ + fn_occ else 0
    f1_occ = 2 * precision_occ * recall_occ / (precision_occ + recall_occ) if precision_occ + recall_occ else 0
    type_matrix = [[0] * 6 for _ in range(6)]
    type_missing = [0] * 6
    for i in occupied_truth:
        actual_type = (labels[i] - 1) % 6
        if found[i]:
            type_matrix[actual_type][(found[i] - 1) % 6] += 1
        else:
            type_missing[actual_type] += 1
    type_f1 = []
    for index in range(6):
        tp = type_matrix[index][index]
        actual = sum(type_matrix[index]) + type_missing[index]
        predicted = sum(row[index] for row in type_matrix)
        type_f1.append(2 * tp / (actual + predicted) if actual + predicted else 0)
    hard = [i for i, item in enumerate(records) if item.get("hardNegative")]
    hard_fp = sum(found[i] != 0 for i in hard)
    true_k = sum(value == 12 for value in labels)
    predicted_k = sum(value == 12 for value in found)
    top = probability.max(1).values
    wrong = torch.tensor([a != b for a, b in zip(labels, found)])
    nll = float(F.nll_loss(probability.clamp_min(1e-12).log(), truth.cpu()))
    brier = float(((probability - F.one_hot(truth.cpu(), 13)).square().sum(1)).mean())
    confidence_bins = []
    ece = 0.0
    for bin_index in range(10):
        selected = ((top >= bin_index / 10) & (top < (bin_index + 1) / 10)) if bin_index < 9 else top >= .9
        count = int(selected.sum())
        accuracy = float((~wrong)[selected].float().mean()) if count else None
        average = float(top[selected].mean()) if count else None
        if count: ece += count / len(labels) * abs(accuracy - average)
        confidence_bins.append({"count": count, "accuracy": accuracy, "meanConfidence": average})
    result = {"sampleCount": len(labels), "classOrder": CLASSES, "confusionMatrix": matrix, "perClass": per_class,
              "accuracy13": sum(a == b for a, b in zip(labels, found)) / len(labels),
              "occupiedMacroF1": sum(item["f1"] for item in per_class[1:]) / 12,
              "occupancy": {"precision": precision_occ, "recall": recall_occ, "f1": f1_occ,
                            "trueEmptyPredictedOccupied": fp_occ, "trueOccupiedPredictedEmpty": fn_occ,
                            "headAccuracy": float(((heads["occupancy"] >= .5).long() == (truth.cpu() != 0)).float().mean()) if heads else None},
              "pieceTypeAccuracy": sum(found[i] and (found[i] - 1) % 6 == (labels[i] - 1) % 6 for i in occupied_truth) / len(occupied_truth),
              "pieceTypeMacroF1": sum(type_f1) / 6,
              "colorAccuracy": sum(found[i] and (found[i] >= 7) == (labels[i] >= 7) for i in occupied_truth) / len(occupied_truth),
              "whiteExactAccuracy": sum(a == b for a, b in zip(labels, found) if 1 <= a <= 6) / sum(1 <= a <= 6 for a in labels),
              "blackExactAccuracy": sum(a == b for a, b in zip(labels, found) if 7 <= a <= 12) / sum(7 <= a <= 12 for a in labels),
              "kingSink": {"predictedK": sum(value == 6 for value in found), "trueK": sum(value == 6 for value in labels),
                           "predictedk": predicted_k, "truek": true_k,
                           "emptyToK": matrix[0][6], "emptyTok": matrix[0][12]},
              "hardNegative": {"sampleCount": len(hard), "falsePositive": hard_fp,
                               "falsePositiveRate": hard_fp / len(hard) if hard else 0},
              "confidence": {"meanTop1": float(top.mean()), "nll13": nll, "brier13": brier,
                             "ece10": ece, "wrongAtLeast090": int((wrong & (top >= .9)).sum()), "bins": confidence_bins}}
    return result


def selection_score(report: dict) -> float:
    return (report["occupiedMacroF1"] + report["occupancy"]["f1"]
            + .25 * report["colorAccuracy"] + .25 * report["pieceTypeMacroF1"]
            - 2 * report["hardNegative"]["falsePositiveRate"]
            - .1 * max(0, report["kingSink"]["predictedk"] - report["kingSink"]["truek"]) / report["sampleCount"])


def train_order(labels: torch.Tensor, sampling: str, generator: torch.Generator) -> torch.Tensor:
    count = len(labels)
    if sampling == "natural-v04":
        return torch.randperm(count, generator=generator)
    if sampling != "balanced-occupancy":
        raise ValueError("unknown sampling policy")
    labels_cpu = labels.cpu()
    empty = torch.where(labels_cpu == 0)[0]
    occupied = torch.where(labels_cpu != 0)[0]
    take = torch.cat((empty[torch.randint(len(empty), (count // 2,), generator=generator)],
                      occupied[torch.randint(len(occupied), (count - count // 2,), generator=generator)]))
    return take[torch.randperm(count, generator=generator)]


def fit_temperatures(model: nn.Module, x: torch.Tensor, y: torch.Tensor, config: dict, head: str) -> dict[str, float]:
    model.eval()
    logits_parts = []
    with torch.inference_mode():
        for batch in x.split(256):
            logits_parts.append(model(batch.float().div(255)))
    grid = config["calibration"]["temperatureGrid"]
    if head == "single":
        logits = torch.cat(logits_parts)
        values = [(float(F.cross_entropy(logits / temp, y)), temp) for temp in grid]
        return {"single": min(values)[1]}
    occ, color, piece_type = (torch.cat([part[index] for part in logits_parts]) for index in range(3))
    occupied = y != 0
    targets = {"occupancy": (occ, occupied.long()), "color": (color[occupied], (y[occupied] >= 7).long()),
               "type": (piece_type[occupied], (y[occupied] - 1) % 6)}
    return {name: min((float(F.cross_entropy(values / temp, target)), temp) for temp in grid)[1]
            for name, (values, target) in targets.items()}


def load_frozen(output: Path, config: dict, device: torch.device) -> tuple[nn.Module, dict]:
    freeze = json.loads((output / "freeze-manifest.json").read_text(encoding="utf-8"))
    if (freeze["modelVersion"] != config["modelVersion"] or freeze["configSha256"] != digest(CONFIG)
        or freeze["datasetPixelsSha256"] != config["datasetPixelsSha256"]
        or freeze["stateSha256"] != digest(output / "frozen-state.pt")
        or freeze["torchscriptSha256"] != digest(output / "frozen-torchscript.pt")):
        raise ValueError("frozen artifact/config checksum mismatch")
    model = create_model(freeze["selectedHead"]).to(device)
    model.load_state_dict(torch.load(output / "frozen-state.pt", map_location=device, weights_only=True))
    model.eval()
    return model, freeze


def train(config: dict, data_dir: Path, output: Path) -> None:
    if output.exists():
        raise ValueError("new output directory required")
    metadata, pixels = load_dataset(data_dir, config)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    torch.set_num_threads(min(8, torch.get_num_threads()))
    train_x, train_y, _ = split_tensors(metadata, pixels, "train", device)
    validation_x, validation_y, validation_records = split_tensors(metadata, pixels, "validation", device)
    output.mkdir(parents=True)
    attempts = []
    for variant in config["variants"]:
        for seed in config["training"]["seeds"]:
            seed_all(seed)
            model = create_model(variant["head"]).to(device)
            optimizer = torch.optim.AdamW(model.parameters(), lr=config["training"]["learningRate"],
                                          weight_decay=config["training"]["weightDecay"])
            generator = torch.Generator().manual_seed(seed)
            best = -float("inf"); best_nll = float("inf"); best_epoch = 0; stale = 0; history = []
            checkpoint = output / f"{variant['id']}-seed-{seed}-best.pt"
            for epoch in range(1, config["training"]["maximumEpochs"] + 1):
                model.train(); total_loss = 0.0
                order = train_order(train_y, variant["sampling"], generator).to(device)
                for batch_index in order.split(config["training"]["batchSize"]):
                    optimizer.zero_grad(set_to_none=True)
                    logits = model(train_x[batch_index].float().div(255))
                    loss = F.cross_entropy(logits, train_y[batch_index]) if variant["head"] == "single" else multi_loss(logits, train_y[batch_index])
                    loss.backward(); optimizer.step()
                    total_loss += float(loss.detach()) * len(batch_index)
                probability, heads = model_probabilities(model, validation_x)
                report = metrics(probability, validation_y, validation_records, heads)
                score = selection_score(report); nll = report["confidence"]["nll13"]
                history.append({"epoch": epoch, "trainLoss": total_loss / len(order),
                                "validationSelectionScore": score, "validationAccuracy13": report["accuracy13"],
                                "validationOccupiedMacroF1": report["occupiedMacroF1"],
                                "validationEmptyFalsePositive": report["occupancy"]["trueEmptyPredictedOccupied"],
                                "validationNll13": nll})
                print(f"{variant['id']} seed={seed} epoch={epoch} loss={total_loss/len(order):.4f} score={score:.4f} macro={report['occupiedMacroF1']:.4f} empty-fp={report['occupancy']['trueEmptyPredictedOccupied']}", flush=True)
                if score > best + 1e-6 or (abs(score - best) <= 1e-6 and nll < best_nll - 1e-6):
                    best = score; best_nll = nll; best_epoch = epoch; stale = 0
                    torch.save({key: value.detach().cpu() for key, value in model.state_dict().items()}, checkpoint)
                else:
                    stale += 1
                if stale >= config["training"]["earlyStoppingPatience"]:
                    break
            model.load_state_dict(torch.load(checkpoint, map_location=device, weights_only=True))
            probability, heads = model_probabilities(model, validation_x)
            final = metrics(probability, validation_y, validation_records, heads)
            attempts.append({"variant": variant["id"], "head": variant["head"], "sampling": variant["sampling"],
                             "seed": seed, "bestEpoch": best_epoch, "epochsRun": len(history),
                             "parameterCount": sum(parameter.numel() for parameter in model.parameters()),
                             "checkpointSha256": digest(checkpoint), "validation": final,
                             "validationSelectionScore": selection_score(final), "history": history})
    selected = sorted(attempts, key=lambda item: (-item["validationSelectionScore"],
                                                    item["validation"]["confidence"]["nll13"],
                                                    item["variant"], item["seed"]))[0]
    state = output / "frozen-state.pt"
    shutil.copyfile(output / f"{selected['variant']}-seed-{selected['seed']}-best.pt", state)
    model = create_model(selected["head"]).to(device)
    model.load_state_dict(torch.load(state, map_location=device, weights_only=True))
    model.eval()
    temperatures = fit_temperatures(model, validation_x, validation_y, config, selected["head"])
    raw_probability, raw_heads = model_probabilities(model, validation_x)
    calibrated_probability, calibrated_heads = model_probabilities(model, validation_x, temperatures)
    by_family = {}
    for family in config["training"]["validationFamilies"]:
        indices = [index for index, item in enumerate(validation_records) if item["pieceSetId"] == family]
        by_family[family] = metrics(calibrated_probability[indices], validation_y[indices],
                                    [validation_records[index] for index in indices],
                                    {key: value[indices] for key, value in calibrated_heads.items()})
    traced = output / "frozen-torchscript.pt"
    torch.jit.trace(model.cpu().eval(), torch.zeros(1, 3, 64, 64), check_trace=True).save(str(traced))
    summary = {"schemaVersion": "caissa-scanner-classifier-revision-training/1", "modelVersion": config["modelVersion"],
               "datasetVersion": config["datasetVersion"], "datasetMetadataSha256": config["datasetMetadataSha256"],
               "datasetPixelsSha256": config["datasetPixelsSha256"], "framework": f"PyTorch {torch.__version__}",
               "device": str(device), "attempts": attempts, "selectedVariant": selected["variant"],
               "selectedSeed": selected["seed"], "selectedBestEpoch": selected["bestEpoch"],
               "selectionPolicy": "validation only, no synthetic test or real benchmark before freeze", "realTrainingTiles": 0}
    freeze = {"schemaVersion": "caissa-scanner-classifier-revision-freeze/1", "modelVersion": config["modelVersion"],
              "datasetVersion": config["datasetVersion"], "datasetMetadataSha256": config["datasetMetadataSha256"],
              "datasetPixelsSha256": config["datasetPixelsSha256"], "configSha256": digest(CONFIG),
              "classOrder": CLASSES, "inputShape": [None, 3, 64, 64], "selectedVariant": selected["variant"],
              "selectedHead": selected["head"], "selectedSeed": selected["seed"],
              "selectedBestEpoch": selected["bestEpoch"], "parameterCount": selected["parameterCount"],
              "temperature": temperatures, "stateSha256": digest(state), "stateBytes": state.stat().st_size,
              "torchscriptSha256": digest(traced), "torchscriptBytes": traced.stat().st_size,
              "canonicalPolicy": "occupancy x occupied-only color x occupied-only type product; 13-class argmax",
              "thresholdPolicy": "none; raw and validation-calibrated argmax reported separately",
              "selectionEvidence": "whole-family v0.4 validation only; no synthetic test or real inference read"}
    validation_report = {"schemaVersion": "caissa-scanner-classifier-revision-validation/1",
                         "selectedVariant": selected["variant"], "selectedSeed": selected["seed"],
                         "temperature": temperatures, "raw": metrics(raw_probability, validation_y, validation_records, raw_heads),
                         "calibrated": metrics(calibrated_probability, validation_y, validation_records, calibrated_heads),
                         "byFamilyCalibrated": by_family}
    write_json(output / "training-summary.json", summary)
    write_json(output / "validation-report.json", validation_report)
    write_json(output / "freeze-manifest.json", freeze)
    print(json.dumps({"selectedVariant": selected["variant"], "seed": selected["seed"],
                      "bestEpoch": selected["bestEpoch"], "parameters": selected["parameterCount"],
                      "stateSha256": freeze["stateSha256"], "temperatures": temperatures}, indent=2), flush=True)


def synthetic_test(config: dict, data_dir: Path, output: Path) -> None:
    if (output / "synthetic-test-report.json").exists():
        raise ValueError("synthetic test already scored")
    metadata, pixels = load_dataset(data_dir, config)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model, freeze = load_frozen(output, config, device)
    x, labels, records = split_tensors(metadata, pixels, "test", device)
    raw, raw_heads = model_probabilities(model, x)
    calibrated, calibrated_heads = model_probabilities(model, x, freeze["temperature"])
    families = {}
    for family in config["training"]["testFamilies"]:
        indices = [index for index, item in enumerate(records) if item["pieceSetId"] == family]
        families[family] = metrics(calibrated[indices], labels[indices], [records[index] for index in indices],
                                   {key: value[indices] for key, value in calibrated_heads.items()})
    report = {"schemaVersion": "caissa-scanner-classifier-revision-synthetic-test/1",
              "modelVersion": config["modelVersion"], "stateSha256": freeze["stateSha256"],
              "datasetPixelsSha256": config["datasetPixelsSha256"],
              "raw": metrics(raw, labels, records, raw_heads),
              "calibrated": metrics(calibrated, labels, records, calibrated_heads),
              "byFamilyCalibrated": families, "policy": "one frozen selected checkpoint; no post-test tuning"}
    write_json(output / "synthetic-test-report.json", report)
    print("synthetic unseen-family test scored once", flush=True)


def infer_real(config: dict, real_dir: Path, output: Path) -> None:
    prediction_path = output / "real-predictions.json"
    if prediction_path.exists():
        raise ValueError("real inference already performed")
    real = json.loads((real_dir / "real-rgb64.json").read_text(encoding="utf-8"))
    binary = real_dir / "real-rgb64.bin"
    if (real["boardCount"] != 31 or real["tileCount"] != 1984 or real["classOrder"] != CLASSES
        or real["truthManifestSha256"] != "AA471439A1EE78301591424A92FC9C425D3B7C3FCF12AC18A2CFE83B2A4EF855"
        or binary.stat().st_size != 1984 * TILE_BYTES or digest(binary) != real["pixelsSha256"]):
        raise ValueError("real RGB64 source changed")
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model, freeze = load_frozen(output, config, device)
    pixels = np.memmap(binary, dtype=np.uint8, mode="r", shape=(1984, 64, 64, 3))
    x = torch.from_numpy(np.array(pixels, copy=True)).permute(0, 3, 1, 2).contiguous().to(device)
    raw, raw_heads = model_probabilities(model, x)
    calibrated, calibrated_heads = model_probabilities(model, x, freeze["temperature"])
    diagnostics = {}
    for name, heads in (("raw", raw_heads), ("calibrated", calibrated_heads)):
        color_top = heads["color"].topk(2, dim=1).values
        type_top = heads["type"].topk(2, dim=1).values
        diagnostics[name] = {"occupancyProbability": heads["occupancy"].tolist(),
                             "colorMargin": (color_top[:, 0] - color_top[:, 1]).tolist(),
                             "typeMargin": (type_top[:, 0] - type_top[:, 1]).tolist()}
    write_json(prediction_path, {"schemaVersion": "caissa-scanner-classifier-revision-real-predictions/1",
                                 "modelVersion": config["modelVersion"], "stateSha256": freeze["stateSha256"],
                                 "realPixelsSha256": real["pixelsSha256"], "truthManifestSha256": real["truthManifestSha256"],
                                 "classOrder": CLASSES, "boardIds": real["boardIds"],
                                 "rawProbabilities": raw.tolist(), "calibratedProbabilities": calibrated.tolist(),
                                 "rawPredictedIndices": raw.argmax(1).tolist(),
                                 "calibratedPredictedIndices": calibrated.argmax(1).tolist(),
                                 "diagnostics": diagnostics, "truthReadByModel": False,
                                 "policy": "single real-model pass after freeze; no real labels, tuning, or corrected predictions"})
    print("real frozen-checkpoint inference completed once; truth not read", flush=True)


def self_test() -> None:
    input_batch = torch.zeros(2, 3, 64, 64)
    single = SingleHead().eval(); multi = MultiHead().eval()
    assert single(input_batch).shape == (2, 13)
    logits = multi(input_batch)
    assert [tuple(item.shape) for item in logits] == [(2, 2), (2, 2), (2, 6)]
    probabilities, heads = canonical(logits)
    assert probabilities.shape == (2, 13)
    assert torch.allclose(probabilities.sum(1), torch.ones(2))
    assert torch.allclose(probabilities[:, 0], 1 - heads["occupancy"])
    crafted = (torch.tensor([[12., -12.], [-12., 12.], [-12., 12.]]),
               torch.tensor([[12., -12.], [12., -12.], [-12., 12.]]),
               torch.tensor([[-12., -12., -12., -12., -12., 12.]]).expand(3, -1))
    derived, _ = canonical(crafted)
    assert derived.argmax(1).tolist() == [0, 6, 12]
    assert CLASSES[6] == "K" and CLASSES[12] == "k"
    for head in (multi.color, multi.piece_type):
        head.zero_grad(set_to_none=True)
    multi_loss(multi(input_batch), torch.zeros(2, dtype=torch.long)).backward()
    assert all(parameter.grad is None for parameter in multi.color.parameters())
    assert all(parameter.grad is None for parameter in multi.piece_type.parameters())
    occ = torch.zeros(3, 2, requires_grad=True)
    color = torch.zeros(3, 2, requires_grad=True)
    piece_type = torch.zeros(3, 6, requires_grad=True)
    multi_loss((occ, color, piece_type), torch.tensor([0, 1, 7])).backward()
    assert torch.count_nonzero(color.grad[0]) == 0 and torch.count_nonzero(piece_type.grad[0]) == 0
    assert torch.count_nonzero(color.grad[1:]) > 0 and torch.count_nonzero(piece_type.grad[1:]) > 0
    print(f"self-test passed; single={sum(p.numel() for p in single.parameters())}, multi={sum(p.numel() for p in multi.parameters())}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["train", "synthetic-test", "infer-real", "self-test"])
    parser.add_argument("--data-dir", type=Path)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--real-dir", type=Path)
    args = parser.parse_args()
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    if config["classOrder"] != CLASSES or config["inputShape"] != [None, 3, 64, 64]:
        raise ValueError("canonical 13-class input/output contract changed")
    if args.mode == "self-test":
        self_test()
    elif args.mode == "train":
        if not args.data_dir or not args.output_dir: parser.error("train requires --data-dir and --output-dir")
        train(config, args.data_dir, args.output_dir)
    elif args.mode == "synthetic-test":
        if not args.data_dir or not args.output_dir: parser.error("synthetic-test requires --data-dir and --output-dir")
        synthetic_test(config, args.data_dir, args.output_dir)
    else:
        if not args.real_dir or not args.output_dir: parser.error("infer-real requires --real-dir and --output-dir")
        infer_real(config, args.real_dir, args.output_dir)


if __name__ == "__main__":
    main()
