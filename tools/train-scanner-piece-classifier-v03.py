"""Offline v0.3 experiment using certified development-only real boards.

Protected final benchmark truth is unavailable to training, selection, thresholding and calibration.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import importlib.util
import json
import math
import random
import shutil
import statistics
import time
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import psutil
import torch
from torch import nn
from torch.nn import functional as F


ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "scanner/recognition/classifier-revision/config-v0.3.json"
BASE_PATH = ROOT / "tools/train-scanner-piece-classifier-v02.py"
spec = importlib.util.spec_from_file_location("caissa_v02", BASE_PATH)
base = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(base)
CLASSES = base.CLASSES
TILE_BYTES = 64 * 64 * 3


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest().upper()


def write_json(path: Path, value: object) -> None:
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(value, stream, indent=2, ensure_ascii=False, allow_nan=False)
        stream.write("\n")


class StrongOccupancy(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.backbone = base.Backbone()
        self.occupancy = nn.Sequential(nn.Linear(256, 128), nn.ReLU(inplace=True),
                                       nn.Linear(128, 64), nn.ReLU(inplace=True), nn.Linear(64, 2))
        self.color = nn.Sequential(nn.Linear(256, 64), nn.ReLU(inplace=True), nn.Linear(64, 2))
        self.piece_type = nn.Sequential(nn.Linear(256, 128), nn.ReLU(inplace=True), nn.Linear(128, 6))

    def forward(self, value: torch.Tensor):
        features = self.backbone(value)
        return self.occupancy(features), self.color(features), self.piece_type(features)


class OccupancyBackbone(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(3, 16, 3, padding=1, bias=False), nn.BatchNorm2d(16), nn.ReLU(inplace=True),
            nn.MaxPool2d(2), nn.Conv2d(16, 32, 3, padding=1, bias=False), nn.BatchNorm2d(32),
            nn.ReLU(inplace=True), nn.MaxPool2d(2), nn.Conv2d(32, 64, 3, padding=1, bias=False),
            nn.BatchNorm2d(64), nn.ReLU(inplace=True), nn.AdaptiveAvgPool2d(1))
        self.head = nn.Sequential(nn.Flatten(), nn.Linear(64, 32), nn.ReLU(inplace=True), nn.Linear(32, 2))

    def forward(self, value: torch.Tensor) -> torch.Tensor:
        return self.head(self.features(value))


class TwoStage(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.occupancy_model = OccupancyBackbone()
        self.identity_backbone = base.Backbone()
        self.color = nn.Sequential(nn.Linear(256, 64), nn.ReLU(inplace=True), nn.Linear(64, 2))
        self.piece_type = nn.Sequential(nn.Linear(256, 128), nn.ReLU(inplace=True), nn.Linear(128, 6))

    def forward(self, value: torch.Tensor):
        occupancy = self.occupancy_model(value)
        identity = self.identity_backbone(value)
        return occupancy, self.color(identity), self.piece_type(identity)


def create_model(architecture: str) -> nn.Module:
    if architecture == "shared":
        return base.MultiHead()
    if architecture == "strong-occupancy":
        return StrongOccupancy()
    if architecture == "two-stage":
        return TwoStage()
    raise ValueError(f"unknown architecture {architecture}")


def multi_loss(logits, labels: torch.Tensor) -> torch.Tensor:
    occupancy, color, piece_type = logits
    occupied = labels != 0
    occupancy_weights = torch.tensor([1.0, 2.0], device=labels.device)
    loss = 1.75 * F.cross_entropy(occupancy, occupied.long(), weight=occupancy_weights)
    if bool(occupied.any()):
        loss = loss + .75 * F.cross_entropy(color[occupied], (labels[occupied] >= 7).long())
        loss = loss + F.cross_entropy(piece_type[occupied], (labels[occupied] - 1) % 6)
    return loss


def load_dataset(directory: Path, config: dict):
    metadata_path = directory / "piece-rgb64-v05.json"
    binary_path = directory / "piece-rgb64-v05.bin"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    if (digest(metadata_path) != config["datasetMetadataSha256"]
            or digest(binary_path) != config["datasetPixelsSha256"]
            or metadata["pixelsSha256"] != config["datasetPixelsSha256"]
            or metadata["humanTruthSha256"] != config["humanTruthSha256"]
            or metadata["certifiedRealCorpusVersion"] != config["certifiedCorpusVersion"]
            or metadata["protectedFinalBenchmarkTilesIncluded"] != 0
            or metadata["classOrder"] != CLASSES or metadata["shape"] != [10544, 64, 64, 3]
            or len(metadata["records"]) != 10544 or binary_path.stat().st_size != 10544 * TILE_BYTES):
        raise ValueError("uncertified v0.5 dataset")
    if any(item["index"] != index or item.get("protectedFinalBenchmark") for index, item in enumerate(metadata["records"])):
        raise ValueError("dataset identity or protected-role leak")
    real_groups: dict[str, set[str]] = defaultdict(set)
    for item in metadata["records"]:
        if item["dataRole"].startswith("real-development"):
            for group in (item.get("sourceGroup"), item.get("sessionGroup")):
                if group:
                    real_groups[group].add(item["split"])
    if any(len(splits) != 1 for splits in real_groups.values()):
        raise ValueError("real source group crossed train/validation")
    pixels = np.memmap(binary_path, dtype=np.uint8, mode="r", shape=(10544, 64, 64, 3))
    return metadata, pixels


def tensors(metadata: dict, pixels: np.memmap, predicate, device: torch.device):
    records = [item for item in metadata["records"] if predicate(item)]
    indices = [item["index"] for item in records]
    value = torch.from_numpy(np.array(pixels[indices], copy=True)).permute(0, 3, 1, 2).contiguous().to(device)
    labels = torch.tensor([item["classIndex"] for item in records], dtype=torch.long, device=device)
    return value, labels, records


@torch.inference_mode()
def probabilities(model: nn.Module, value: torch.Tensor, temperatures: dict | None = None, batch: int = 256):
    model.eval(); result = []; heads = {name: [] for name in ("occupancy", "color", "type")}
    for part in value.split(batch):
        probability, diagnostics = base.canonical(model(part.float().div(255)), temperatures)
        result.append(probability.cpu())
        for name in heads:
            heads[name].append(diagnostics[name].cpu())
    return torch.cat(result), {name: torch.cat(items) for name, items in heads.items()}


@torch.inference_mode()
def logits(model: nn.Module, value: torch.Tensor, batch: int = 256):
    model.eval(); parts = []
    for part in value.split(batch):
        parts.append(tuple(item.cpu() for item in model(part.float().div(255))))
    return tuple(torch.cat([part[index] for part in parts]) for index in range(3))


def confidence_metrics(probability: torch.Tensor, truth: torch.Tensor, predicted: torch.Tensor) -> dict:
    truth = truth.cpu(); predicted = predicted.cpu(); top = probability.max(1).values
    wrong = predicted != truth
    nll = float(F.nll_loss(probability.clamp_min(1e-12).log(), truth))
    brier = float(((probability - F.one_hot(truth, 13)).square().sum(1)).mean())
    ece = 0.0
    for index in range(10):
        selected = ((top >= index / 10) & (top < (index + 1) / 10)) if index < 9 else top >= .9
        if bool(selected.any()):
            ece += float(selected.float().mean()) * abs(float((~wrong)[selected].float().mean()) - float(top[selected].mean()))
    return {"meanTop1": float(top.mean()), "nll13": nll, "brier13": brier, "ece10": ece,
            "wrongAtLeast090": int((wrong & (top >= .9)).sum()),
            "wrongAtLeast095": int((wrong & (top >= .95)).sum())}


def explicit_metrics(probability: torch.Tensor, truth: torch.Tensor, records: list[dict], heads: dict,
                     predicted: torch.Tensor) -> dict:
    forced = probability.clone(); maximum = forced.max(1).values + 1
    forced[torch.arange(len(forced)), predicted.cpu()] = maximum
    report = base.metrics(forced, truth, records, heads)
    report["confidence"] = confidence_metrics(probability, truth, predicted)
    report["predictionPolicy"] = "frozen occupancy threshold then best occupied identity"
    return report


def threshold_predictions(probability: torch.Tensor, occupancy: torch.Tensor, threshold: float) -> torch.Tensor:
    identity = probability[:, 1:].argmax(1) + 1
    return torch.where(occupancy >= threshold, identity, torch.zeros_like(identity))


def occupancy_at_threshold(truth: torch.Tensor, occupancy: torch.Tensor, threshold: float) -> dict:
    actual = truth.cpu() != 0; found = occupancy >= threshold
    tp = int((actual & found).sum()); fp = int((~actual & found).sum()); fn = int((actual & ~found).sum())
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {"threshold": threshold, "precision": precision, "recall": recall, "f1": f1,
            "falsePositive": fp, "falseNegative": fn}


def fit_head_temperatures(raw_logits, truth: torch.Tensor, grid: list[float]) -> dict[str, float]:
    occupancy, color, piece_type = raw_logits; truth = truth.cpu(); occupied = truth != 0
    targets = {"occupancy": (occupancy, occupied.long()),
               "color": (color[occupied], (truth[occupied] >= 7).long()),
               "type": (piece_type[occupied], (truth[occupied] - 1) % 6)}
    return {name: min((float(F.cross_entropy(value / temperature, target)), temperature)
                      for temperature in grid)[1] for name, (value, target) in targets.items()}


def calibration_selection(model: nn.Module, value: torch.Tensor, truth: torch.Tensor,
                          records: list[dict], config: dict):
    raw_logits = logits(model, value); fitted = fit_head_temperatures(raw_logits, truth, config["calibration"]["temperatureGrid"])
    candidates = {
        "none": {"occupancy": 1.0, "color": 1.0, "type": 1.0},
        "occupancy-temperature": {"occupancy": fitted["occupancy"], "color": 1.0, "type": 1.0},
        "separate-head-temperatures": fitted,
    }
    reports = {}
    for name, temperatures in candidates.items():
        probability, heads = probabilities(model, value, temperatures)
        predicted = probability.argmax(1)
        reports[name] = {"temperature": temperatures,
                         "metrics": explicit_metrics(probability, truth, records, heads, predicted)}
    baseline = reports["none"]["metrics"]["confidence"]["wrongAtLeast090"]
    eligible = [(row["metrics"]["confidence"]["nll13"], row["metrics"]["confidence"]["brier13"], name)
                for name, row in reports.items()
                if row["metrics"]["confidence"]["wrongAtLeast090"] <= baseline]
    selected = min(eligible)[2]
    return selected, reports[selected]["temperature"], reports


def choose_threshold(truth: torch.Tensor, occupancy: torch.Tensor, config: dict):
    rows = [occupancy_at_threshold(truth, occupancy, value) for value in config["threshold"]["grid"]]
    raw_recall = next(item["recall"] for item in rows if item["threshold"] == .5)
    eligible = [item for item in rows if item["recall"] >= raw_recall - .03]
    chosen = sorted(eligible, key=lambda item: (-(item["f1"] + .2 * item["precision"]),
                                                item["falsePositive"], item["threshold"]))[0]
    return chosen, rows


def selection_score(synthetic: dict, real: dict) -> float:
    real_empty = real["occupancy"]["trueEmptyPredictedOccupied"]
    real_empty_total = sum(real["confusionMatrix"][0])
    excess_k = max(0, real["kingSink"]["predictedk"] - real["kingSink"]["truek"])
    return (0.35 * synthetic["occupiedMacroF1"] + .15 * synthetic["occupancy"]["f1"]
            + .35 * real["occupiedMacroF1"] + .5 * real["occupancy"]["f1"]
            + .2 * real["occupancy"]["precision"] + .15 * real["colorAccuracy"]
            - .8 * real_empty / max(1, real_empty_total) - .1 * excess_k / real["sampleCount"])


def train_order(labels: torch.Tensor, records: list[dict], empty_fraction: float, seed: int,
                samples_per_epoch: int) -> torch.Tensor:
    generator = torch.Generator().manual_seed(seed)
    synthetic = torch.tensor([i for i, item in enumerate(records) if item["dataRole"] == "synthetic-train"])
    real_empty = torch.tensor([i for i, item in enumerate(records)
                               if item["dataRole"] == "real-development-train" and item["classIndex"] == 0])
    real_occupied = torch.tensor([i for i, item in enumerate(records)
                                  if item["dataRole"] == "real-development-train" and item["classIndex"] != 0])
    synthetic_count = round(samples_per_epoch * .8)
    real_count = samples_per_epoch - synthetic_count
    empty_count = round(real_count * empty_fraction); occupied_count = real_count - empty_count
    chosen = torch.cat((synthetic[torch.randperm(len(synthetic), generator=generator)[:synthetic_count]],
                        real_empty[torch.randint(len(real_empty), (empty_count,), generator=generator)],
                        real_occupied[torch.randint(len(real_occupied), (occupied_count,), generator=generator)]))
    return chosen[torch.randperm(len(chosen), generator=generator)].to(labels.device)


def grouped_reports(probability, truth, records, heads, threshold: float, key):
    values = sorted(set(key(item) for item in records))
    result = {}
    for value in values:
        indices = [index for index, item in enumerate(records) if key(item) == value]
        subset_heads = {name: part[indices] for name, part in heads.items()}
        predicted = threshold_predictions(probability[indices], subset_heads["occupancy"], threshold)
        result[value] = explicit_metrics(probability[indices], truth[indices],
                                         [records[index] for index in indices], subset_heads, predicted)
    return result


def abstention(probability: torch.Tensor, truth: torch.Tensor, predicted: torch.Tensor,
               heads: dict, config: dict) -> dict:
    color = heads["color"].topk(2, dim=1).values; piece = heads["type"].topk(2, dim=1).values
    entropy = -(probability.clamp_min(1e-12) * probability.clamp_min(1e-12).log()).sum(1)
    occupied = predicted != 0
    flag = ((occupied & (heads["occupancy"] < config["lowOccupancyProbability"]))
            | (occupied & ((color[:, 0] - color[:, 1]) < config["lowColorMargin"]))
            | (occupied & ((piece[:, 0] - piece[:, 1]) < config["lowTypeMargin"]))
            | (probability.max(1).values < config["lowCanonicalTop1"]) | (entropy > config["highEntropy"]))
    correct = predicted.cpu() == truth.cpu(); accepted = ~flag
    return {"total": len(truth), "accepted": int(accepted.sum()), "abstained": int(flag.sum()),
            "coverage": float(accepted.float().mean()),
            "acceptedAccuracy": float(correct[accepted].float().mean()) if bool(accepted.any()) else None,
            "abstainedErrorRate": float((~correct[flag]).float().mean()) if bool(flag.any()) else None}


def v02_analysis(model_dir: Path, train_value, train_truth, train_records,
                 validation_value, validation_truth, validation_records):
    old_config = json.loads(base.CONFIG.read_text(encoding="utf-8"))
    model, freeze = base.load_frozen(model_dir, old_config, train_value.device)
    output = {}
    for name, value, truth, records in (("train", train_value, train_truth, train_records),
                                         ("validation", validation_value, validation_truth, validation_records)):
        probability, heads = base.model_probabilities(model, value)
        report = base.metrics(probability, truth, records, heads)
        predicted = probability.argmax(1); truth_cpu = truth.cpu()
        k_log_score = probability[:, 12].clamp_min(1e-12).log()
        other_to_k = int(((truth_cpu != 0) & (truth_cpu != 12) & (predicted == 12)).sum())
        output[name] = {"metrics": report, "blackKingSink": {
            "otherPieceTok": other_to_k,
            "meanKCanonicalLogScoreTrueEmpty": float(k_log_score[truth_cpu == 0].mean()),
            "meanKCanonicalLogScoreTrueBlackPieces": float(k_log_score[truth_cpu >= 7].mean()),
            "meanKCanonicalLogScoreOtherOccupied": float(k_log_score[(truth_cpu != 0) & (truth_cpu != 12)].mean())}}
        if name == "train":
            hard = []
            for index, (actual, found) in enumerate(zip(truth_cpu.tolist(), predicted.tolist())):
                if actual == 0 and found != 0:
                    item = records[index]
                    hard.append({"sampleId": item["boardSampleId"], "squareIndex": item["canonicalSquareIndex"],
                                 "predictedClass": CLASSES[found], "confidence": float(probability[index, found]),
                                 "platform": item.get("platform"), "sourceCategory": item.get("sourceCategory"),
                                 "subtypeTags": item.get("subtypeTags", [])})
            output["hardNegatives"] = sorted(hard, key=lambda item: (-item["confidence"], item["sampleId"], item["squareIndex"]))
    output["stateSha256"] = freeze["stateSha256"]
    output["diagnosis"] = "multiple factors: real-background occupancy shift plus type/color interactions; separate train/validation evidence retained"
    return output


def train(config: dict, data_dir: Path, output: Path, v02_model_dir: Path) -> None:
    if output.exists():
        raise ValueError("new output directory required")
    metadata, pixels = load_dataset(data_dir, config)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    torch.set_num_threads(min(8, torch.get_num_threads()))
    train_x, train_y, train_records = tensors(metadata, pixels, lambda item: item["split"] == "train", device)
    synth_x, synth_y, synth_records = tensors(metadata, pixels,
        lambda item: item["dataRole"] == "synthetic-validation", device)
    real_val_x, real_val_y, real_val_records = tensors(metadata, pixels,
        lambda item: item["dataRole"] == "real-development-validation", device)
    real_train_x, real_train_y, real_train_records = tensors(metadata, pixels,
        lambda item: item["dataRole"] == "real-development-train", device)
    output.mkdir(parents=True)
    old = v02_analysis(v02_model_dir, real_train_x, real_train_y, real_train_records,
                       real_val_x, real_val_y, real_val_records)
    write_json(output / "v02-development-analysis.json", old)
    write_json(output / "hard-negative-mining.json", {"schemaVersion": "caissa-real-hard-negatives/1",
        "model": "frozen-v0.2", "role": "real-development-train-only", "count": len(old["hardNegatives"]),
        "priorityCounts": dict(Counter(item["predictedClass"] for item in old["hardNegatives"])),
        "records": old["hardNegatives"]})
    attempts = []
    for variant in config["variants"]:
        for seed in config["training"]["seeds"]:
            base.seed_all(seed); model = create_model(variant["architecture"]).to(device)
            optimizer = torch.optim.AdamW(model.parameters(), lr=config["training"]["learningRate"],
                                          weight_decay=config["training"]["weightDecay"])
            best = -math.inf; best_nll = math.inf; stale = 0; history = []
            checkpoint = output / f"{variant['id']}-seed-{seed}-best.pt"
            for epoch in range(1, config["training"]["maximumEpochs"] + 1):
                model.train(); order = train_order(train_y, train_records, variant["realEmptyFraction"],
                    seed * 100 + epoch, config["training"]["samplesPerEpoch"]); total = 0.0
                for indices in order.split(config["training"]["batchSize"]):
                    optimizer.zero_grad(set_to_none=True)
                    loss = multi_loss(model(train_x[indices].float().div(255)), train_y[indices])
                    loss.backward(); optimizer.step(); total += float(loss.detach()) * len(indices)
                synth_probability, synth_heads = probabilities(model, synth_x)
                real_probability, real_heads = probabilities(model, real_val_x)
                synth_report = explicit_metrics(synth_probability, synth_y, synth_records, synth_heads,
                    threshold_predictions(synth_probability, synth_heads["occupancy"], .5))
                real_report = explicit_metrics(real_probability, real_val_y, real_val_records, real_heads,
                    threshold_predictions(real_probability, real_heads["occupancy"], .5))
                score = selection_score(synth_report, real_report)
                nll = real_report["confidence"]["nll13"]
                history.append({"epoch": epoch, "loss": total / len(order), "selectionScore": score,
                    "syntheticValidationAccuracy13": synth_report["accuracy13"],
                    "realValidationAccuracy13": real_report["accuracy13"],
                    "realValidationOccupancyF1": real_report["occupancy"]["f1"],
                    "realValidationEmptyFalsePositive": real_report["occupancy"]["trueEmptyPredictedOccupied"],
                    "realValidationPredictedk": real_report["kingSink"]["predictedk"]})
                print(f"{variant['id']} seed={seed} epoch={epoch} loss={total/len(order):.4f} "
                      f"score={score:.4f} real-occ={real_report['occupancy']['f1']:.4f} "
                      f"empty-fp={real_report['occupancy']['trueEmptyPredictedOccupied']}", flush=True)
                if score > best + 1e-6 or (abs(score - best) <= 1e-6 and nll < best_nll - 1e-6):
                    best = score; best_nll = nll; stale = 0
                    torch.save({key: value.detach().cpu() for key, value in model.state_dict().items()}, checkpoint)
                    best_epoch = epoch
                else:
                    stale += 1
                if stale >= config["training"]["earlyStoppingPatience"]:
                    break
            model.load_state_dict(torch.load(checkpoint, map_location=device, weights_only=True))
            synth_probability, synth_heads = probabilities(model, synth_x)
            real_probability, real_heads = probabilities(model, real_val_x)
            synth_report = explicit_metrics(synth_probability, synth_y, synth_records, synth_heads,
                threshold_predictions(synth_probability, synth_heads["occupancy"], .5))
            real_report = explicit_metrics(real_probability, real_val_y, real_val_records, real_heads,
                threshold_predictions(real_probability, real_heads["occupancy"], .5))
            attempts.append({"variant": variant["id"], "architecture": variant["architecture"], "seed": seed,
                "bestEpoch": best_epoch, "epochsRun": len(history),
                "parameterCount": sum(parameter.numel() for parameter in model.parameters()),
                "checkpointSha256": digest(checkpoint), "selectionScore": selection_score(synth_report, real_report),
                "syntheticValidation": synth_report, "realDevelopmentValidation": real_report, "history": history})
    selected = sorted(attempts, key=lambda item: (-item["selectionScore"],
        item["realDevelopmentValidation"]["confidence"]["nll13"], item["variant"], item["seed"]))[0]
    state = output / "frozen-state.pt"
    shutil.copyfile(output / f"{selected['variant']}-seed-{selected['seed']}-best.pt", state)
    model = create_model(selected["architecture"]).to(device)
    model.load_state_dict(torch.load(state, map_location=device, weights_only=True)); model.eval()
    calibration_method, temperatures, calibration_reports = calibration_selection(
        model, real_val_x, real_val_y, real_val_records, config)
    calibrated, calibrated_heads = probabilities(model, real_val_x, temperatures)
    threshold, threshold_grid = choose_threshold(real_val_y, calibrated_heads["occupancy"], config)
    final_predicted = threshold_predictions(calibrated, calibrated_heads["occupancy"], threshold["threshold"])
    final_validation = explicit_metrics(calibrated, real_val_y, real_val_records, calibrated_heads, final_predicted)
    platform = grouped_reports(calibrated, real_val_y, real_val_records, calibrated_heads,
                               threshold["threshold"], lambda item: item.get("platform") or "unknown")
    category = grouped_reports(calibrated, real_val_y, real_val_records, calibrated_heads,
                               threshold["threshold"], lambda item: "livestream/broadcast" if "livestream" in item.get("subtypeTags", [])
                               else "photo-of-screen" if "photo-of-screen" in item.get("subtypeTags", []) else "digital")
    traced = output / "frozen-torchscript.pt"
    torch.jit.trace(model.cpu(), torch.zeros(1, 3, 64, 64), check_trace=True).save(str(traced))
    freeze = {"schemaVersion": "caissa-scanner-classifier-revision-freeze/2",
        "modelVersion": config["modelVersion"], "datasetVersion": config["datasetVersion"],
        "datasetMetadataSha256": config["datasetMetadataSha256"], "datasetPixelsSha256": config["datasetPixelsSha256"],
        "humanTruthSha256": config["humanTruthSha256"], "configSha256": digest(CONFIG), "classOrder": CLASSES,
        "selectedVariant": selected["variant"], "selectedArchitecture": selected["architecture"],
        "selectedSeed": selected["seed"], "selectedBestEpoch": selected["bestEpoch"],
        "parameterCount": selected["parameterCount"], "calibrationMethod": calibration_method,
        "temperature": temperatures, "occupancyThreshold": threshold["threshold"],
        "stateSha256": digest(state), "stateBytes": state.stat().st_size,
        "torchscriptSha256": digest(traced), "torchscriptBytes": traced.stat().st_size,
        "samplingRatio": {"synthetic": .8, "realDevelopment": .2, "realEmptyWithinReal": .75},
        "selectionEvidence": "synthetic family validation plus certified real development-validation only",
        "protectedFinalBenchmarkReadBeforeFreeze": False, "runtimeIntegrated": False}
    validation = {"schemaVersion": "caissa-scanner-classifier-revision-validation/2",
        "selectedVariant": selected["variant"], "selectedSeed": selected["seed"],
        "calibrationMethod": calibration_method, "calibrationCandidates": calibration_reports,
        "thresholdSelection": threshold, "thresholdGrid": threshold_grid,
        "finalRealDevelopmentValidation": final_validation,
        "syntheticValidation": selected["syntheticValidation"], "platformExploratory": platform,
        "mvpCategoryExploratory": category,
        "abstention": abstention(calibrated, real_val_y, final_predicted, calibrated_heads, config["uncertainty"]),
        "vectorScalingDecision": "not justified: 832 validation tiles with sparse per-class support; bounded temperature methods sufficient"}
    summary = {"schemaVersion": "caissa-scanner-classifier-revision-training/2",
        "modelVersion": config["modelVersion"], "attempts": attempts,
        "selectedVariant": selected["variant"], "selectedSeed": selected["seed"],
        "selectedBestEpoch": selected["bestEpoch"], "parameterCount": selected["parameterCount"],
        "realTrainingBoards": 28, "realValidationBoards": 13, "protectedTrainingTiles": 0,
        "samplingRatio": freeze["samplingRatio"]}
    write_json(output / "training-summary.json", summary)
    write_json(output / "validation-report.json", validation)
    write_json(output / "freeze-manifest.json", freeze)
    print(json.dumps({"selectedVariant": selected["variant"], "seed": selected["seed"],
        "threshold": threshold, "calibration": calibration_method, "stateSha256": freeze["stateSha256"]}, indent=2))


def load_frozen(output: Path, config: dict, device: torch.device):
    freeze = json.loads((output / "freeze-manifest.json").read_text(encoding="utf-8"))
    if (freeze["configSha256"] != digest(CONFIG) or freeze["datasetPixelsSha256"] != config["datasetPixelsSha256"]
            or freeze["stateSha256"] != digest(output / "frozen-state.pt")
            or freeze["torchscriptSha256"] != digest(output / "frozen-torchscript.pt")
            or freeze["protectedFinalBenchmarkReadBeforeFreeze"]):
        raise ValueError("frozen artifact mismatch")
    model = create_model(freeze["selectedArchitecture"]).to(device)
    model.load_state_dict(torch.load(output / "frozen-state.pt", map_location=device, weights_only=True)); model.eval()
    return model, freeze


def synthetic_test(config: dict, data_dir: Path, output: Path):
    path = output / "synthetic-test-report.json"
    if path.exists():
        raise ValueError("synthetic test already scored")
    metadata, pixels = load_dataset(data_dir, config); device = torch.device("cpu")
    model, freeze = load_frozen(output, config, device)
    value, truth, records = tensors(metadata, pixels, lambda item: item["dataRole"] == "synthetic-test", device)
    raw, raw_heads = probabilities(model, value)
    calibrated, heads = probabilities(model, value, freeze["temperature"])
    predicted = threshold_predictions(calibrated, heads["occupancy"], freeze["occupancyThreshold"])
    report = {"schemaVersion": "caissa-scanner-classifier-revision-synthetic-test/2",
        "modelVersion": config["modelVersion"], "stateSha256": freeze["stateSha256"],
        "rawCanonical": base.metrics(raw, truth, records, raw_heads),
        "frozenPolicy": explicit_metrics(calibrated, truth, records, heads, predicted),
        "byFamily": grouped_reports(calibrated, truth, records, heads, freeze["occupancyThreshold"],
                                    lambda item: item["pieceSetId"]),
        "policy": "one post-freeze pass over unseen synthetic families; no retuning"}
    write_json(path, report); print("synthetic unseen-family test scored once", flush=True)


def infer_protected(config: dict, real_dir: Path, output: Path):
    path = output / "real-predictions.json"
    if path.exists():
        raise ValueError("protected inference already performed")
    real = json.loads((real_dir / "real-rgb64.json").read_text(encoding="utf-8")); binary = real_dir / "real-rgb64.bin"
    if (real["boardCount"] != 31 or real["tileCount"] != 1984 or real["classOrder"] != CLASSES
            or binary.stat().st_size != 1984 * TILE_BYTES or digest(binary) != real["pixelsSha256"]):
        raise ValueError("protected real cache changed")
    device = torch.device("cpu"); model, freeze = load_frozen(output, config, device)
    pixels = np.memmap(binary, dtype=np.uint8, mode="r", shape=(1984, 64, 64, 3))
    value = torch.from_numpy(np.array(pixels, copy=True)).permute(0, 3, 1, 2).contiguous()
    raw, raw_heads = probabilities(model, value)
    calibrated, heads = probabilities(model, value, freeze["temperature"])
    predicted = threshold_predictions(calibrated, heads["occupancy"], freeze["occupancyThreshold"])
    diagnostics = {}
    for name, values in (("raw", raw_heads), ("calibrated", heads)):
        color = values["color"].topk(2, dim=1).values; piece = values["type"].topk(2, dim=1).values
        diagnostics[name] = {"occupancyProbability": values["occupancy"].tolist(),
            "colorMargin": (color[:, 0] - color[:, 1]).tolist(),
            "typeMargin": (piece[:, 0] - piece[:, 1]).tolist()}
    write_json(path, {"schemaVersion": "caissa-scanner-classifier-revision-real-predictions/2",
        "modelVersion": config["modelVersion"], "stateSha256": freeze["stateSha256"],
        "realPixelsSha256": real["pixelsSha256"], "truthManifestSha256": real["truthManifestSha256"],
        "classOrder": CLASSES, "boardIds": real["boardIds"], "rawProbabilities": raw.tolist(),
        "calibratedProbabilities": calibrated.tolist(), "rawPredictedIndices": raw.argmax(1).tolist(),
        "calibratedPredictedIndices": predicted.tolist(), "diagnostics": diagnostics,
        "truthReadByModel": False, "occupancyThreshold": freeze["occupancyThreshold"],
        "policy": "exactly one protected pass after model/config freeze; no post-benchmark tuning"})
    print("protected 31-board inference completed exactly once", flush=True)


def performance(config: dict, data_dir: Path, output: Path):
    path = output / "performance-report.json"
    if path.exists():
        raise ValueError("performance report already exists")
    metadata, pixels = load_dataset(data_dir, config); indices = [item["index"] for item in metadata["records"]
        if item["dataRole"] == "synthetic-test"][:64]
    samples = np.array(pixels[indices], copy=True); process = psutil.Process(); before = process.memory_info().rss
    started = time.perf_counter(); model, freeze = load_frozen(output, config, torch.device("cpu"))
    load_ms = (time.perf_counter() - started) * 1000; after_load = process.memory_info().rss
    prep = []; inference = []
    with torch.inference_mode():
        for _ in range(5):
            value = torch.from_numpy(samples).permute(0, 3, 1, 2).contiguous().float().div(255); model(value)
        for _ in range(30):
            started = time.perf_counter(); value = torch.from_numpy(samples).permute(0, 3, 1, 2).contiguous().float().div(255)
            prep.append((time.perf_counter() - started) * 1000); started = time.perf_counter(); model(value)
            inference.append((time.perf_counter() - started) * 1000)
    state = output / "frozen-state.pt"; traced = output / "frozen-torchscript.pt"
    report = {"schemaVersion": "caissa-scanner-classifier-performance/2", "modelVersion": config["modelVersion"],
        "parameterCount": freeze["parameterCount"], "modelLoadMilliseconds": load_ms,
        "preprocessMillisecondsPerBoard": statistics.median(prep),
        "inferenceMillisecondsPerBoard": statistics.median(inference),
        "inferenceMillisecondsPerTileEffective": statistics.median(inference) / 64,
        "nativeModelBytes": state.stat().st_size,
        "nativeModelGzipBytes": len(gzip.compress(state.read_bytes(), compresslevel=9, mtime=0)),
        "torchscriptBytes": traced.stat().st_size,
        "torchscriptGzipBytes": len(gzip.compress(traced.read_bytes(), compresslevel=9, mtime=0)),
        "residentMemoryBytesBeforeLoad": before, "residentMemoryBytesAfterLoad": after_load,
        "residentMemoryBytesAfterBenchmark": process.memory_info().rss,
        "method": "Windows desktop CPU; 5 warmups; 30 batch-64 repeats; excludes decode/homography/I/O/browser"}
    write_json(path, report); print(json.dumps(report, indent=2))


def self_test(config: dict):
    value = torch.zeros(3, 3, 64, 64); labels = torch.tensor([0, 1, 12])
    for architecture in ("shared", "strong-occupancy", "two-stage"):
        model = create_model(architecture); output = model(value)
        assert [tuple(item.shape) for item in output] == [(3, 2), (3, 2), (3, 6)]
        probability, heads = base.canonical(output)
        assert probability.shape == (3, 13) and torch.allclose(probability.sum(1), torch.ones(3))
        multi_loss(output, labels).backward()
    probability = torch.full((3, 13), 1 / 13); occupancy = torch.tensor([.2, .7, .9])
    assert threshold_predictions(probability, occupancy, .65).tolist() == [0, 1, 1]
    report = occupancy_at_threshold(labels, occupancy, .65); assert report["falsePositive"] == 0
    first_threshold = choose_threshold(labels, occupancy, config)
    assert first_threshold == choose_threshold(labels, occupancy, config)
    assert first_threshold[0]["threshold"] == .5
    raw_logits = (torch.tensor([[3., 0.], [0., 3.], [0., 3.]]),
                  torch.tensor([[3., 0.], [3., 0.], [0., 3.]]),
                  torch.tensor([[3., 0., 0., 0., 0., 0.], [3., 0., 0., 0., 0., 0.],
                                [0., 0., 0., 0., 0., 3.]]))
    first_temperatures = fit_head_temperatures(raw_logits, labels, config["calibration"]["temperatureGrid"])
    assert first_temperatures == fit_head_temperatures(raw_logits, labels,
                                                        config["calibration"]["temperatureGrid"])
    predicted = torch.tensor([0, 1, 1])
    assert confidence_metrics(probability, labels, predicted) == confidence_metrics(probability, labels, predicted)
    print("v0.3 architecture, threshold, calibration and metric self-test passed")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["train", "synthetic-test", "infer-protected", "performance", "self-test"])
    parser.add_argument("--data-dir", type=Path); parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--v02-model-dir", type=Path); parser.add_argument("--real-dir", type=Path)
    args = parser.parse_args(); config = json.loads(CONFIG.read_text(encoding="utf-8"))
    if config["classOrder"] != CLASSES:
        raise ValueError("class order changed")
    if args.mode == "self-test": self_test(config)
    elif args.mode == "train":
        if not args.data_dir or not args.output_dir or not args.v02_model_dir: parser.error("train paths required")
        train(config, args.data_dir, args.output_dir, args.v02_model_dir)
    elif args.mode == "synthetic-test":
        if not args.data_dir or not args.output_dir: parser.error("data/output required")
        synthetic_test(config, args.data_dir, args.output_dir)
    elif args.mode == "infer-protected":
        if not args.real_dir or not args.output_dir: parser.error("real/output required")
        infer_protected(config, args.real_dir, args.output_dir)
    else:
        if not args.data_dir or not args.output_dir: parser.error("data/output required")
        performance(config, args.data_dir, args.output_dir)


if __name__ == "__main__":
    main()
