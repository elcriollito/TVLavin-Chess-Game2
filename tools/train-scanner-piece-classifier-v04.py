"""Bounded v0.4 king-sink and occupancy-precision revision.

Selection is development-only. The protected benchmark is accepted only by the
post-freeze ``infer-protected`` command and is never available to training.
"""
from __future__ import annotations

import argparse
import gzip
import importlib.util
import json
import math
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
CONFIG = ROOT / "scanner/recognition/classifier-revision/config-v0.4.json"
V03_PATH = ROOT / "tools/train-scanner-piece-classifier-v03.py"
spec = importlib.util.spec_from_file_location("caissa_v03", V03_PATH)
v03 = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(v03)
CLASSES = v03.CLASSES
TARGET_LABELS = {0, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12}


class KingAuxiliaryModel(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.backbone = v03.base.Backbone()
        self.occupancy = nn.Sequential(nn.Linear(256, 64), nn.ReLU(inplace=True), nn.Linear(64, 2))
        self.color = nn.Sequential(nn.Linear(256, 64), nn.ReLU(inplace=True), nn.Linear(64, 2))
        self.piece_type = nn.Sequential(nn.Linear(256, 128), nn.ReLU(inplace=True), nn.Linear(128, 6))
        self.king = nn.Sequential(nn.Linear(256, 32), nn.ReLU(inplace=True), nn.Linear(32, 2))

    def forward(self, value: torch.Tensor):
        features = self.backbone(value)
        return (self.occupancy(features), self.color(features), self.piece_type(features), self.king(features))


def create_model(architecture: str) -> nn.Module:
    if architecture == "shared":
        return v03.base.MultiHead()
    if architecture == "shared-king-aux":
        return KingAuxiliaryModel()
    raise ValueError(f"unknown architecture {architecture}")


def canonical(output, temperatures=None):
    probability, heads = v03.base.canonical(output[:3], temperatures)
    heads["king"] = (F.softmax(output[3], dim=1)[:, 1]
                     if len(output) == 4 else heads["type"][:, 5])
    return probability, heads


@torch.inference_mode()
def probabilities(model, value, temperatures=None, batch=256):
    model.eval(); result = []; heads = {name: [] for name in ("occupancy", "color", "type", "king")}
    for part in value.split(batch):
        probability, diagnostics = canonical(model(part.float().div(255)), temperatures)
        result.append(probability.cpu())
        for name in heads:
            heads[name].append(diagnostics[name].cpu())
    return torch.cat(result), {name: torch.cat(items) for name, items in heads.items()}


@torch.inference_mode()
def head_logits(model, value, batch=256):
    model.eval(); parts = []
    for part in value.split(batch):
        output = model(part.float().div(255))
        parts.append(tuple(item.cpu() for item in output[:3]))
    return tuple(torch.cat([part[index] for part in parts]) for index in range(3))


def classifier_loss(output, labels, variant, config):
    occupancy, color, piece_type = output[:3]
    occupied = labels != 0
    weights = torch.tensor(variant["occupancyWeights"], device=labels.device)
    result = 1.75 * F.cross_entropy(occupancy, occupied.long(), weight=weights)
    if bool(occupied.any()):
        result = result + .75 * F.cross_entropy(color[occupied], (labels[occupied] >= 7).long())
        result = result + F.cross_entropy(piece_type[occupied], (labels[occupied] - 1) % 6)
        if variant["kingAuxiliary"]:
            king_target = (((labels[occupied] - 1) % 6) == 5).long()
            result = result + config["training"]["kingAuxiliaryWeight"] * F.cross_entropy(output[3][occupied], king_target)
    return result


def apply_policy(probability, heads, occupancy_threshold, king_policy):
    identity = probability[:, 1:].argmax(1) + 1
    predicted = torch.where(heads["occupancy"] >= occupancy_threshold, identity, torch.zeros_like(identity))
    type_values = heads["type"].topk(2, dim=1).values
    type_margin = type_values[:, 0] - type_values[:, 1]
    rejected_k = ((predicted == 12)
                  & ((heads["type"][:, 5] < king_policy["minimumTypeProbability"])
                     | (type_margin < king_policy["minimumTypeMargin"])
                     | (heads["occupancy"] < king_policy["minimumOccupancyProbability"])))
    fallback = probability[:, 7:12].argmax(1) + 7
    return torch.where(rejected_k, fallback, predicted)


def extended_metrics(probability, truth, records, heads, predicted):
    report = v03.explicit_metrics(probability, truth, records,
                                  {key: heads[key] for key in ("occupancy", "color", "type")}, predicted)
    matrix = report["confusionMatrix"]
    predicted_k = sum(row[12] for row in matrix); true_k = sum(matrix[12])
    predicted_K = sum(row[6] for row in matrix); true_K = sum(matrix[6])
    false_k = predicted_k - matrix[12][12]; false_K = predicted_K - matrix[6][6]
    board_ids = {item.get("boardSampleId") for item in records if item.get("boardSampleId")}
    board_count = len(board_ids) or max(1, math.ceil(len(records) / 64))
    report["kingPrecision"] = {
        "predictedk": predicted_k, "truek": true_k, "falsek": false_k,
        "falseKingRate": false_k / predicted_k if predicted_k else 0.0,
        "predictedK": predicted_K, "trueK": true_K, "falseK": false_K,
        "falseKRate": false_K / predicted_K if predicted_K else 0.0,
        "emptyTok": matrix[0][12], "otherPieceTok": false_k - matrix[0][12],
        "emptyToK": matrix[0][6], "otherPieceToK": false_K - matrix[0][6],
        "emptyTokRate": matrix[0][12] / max(1, sum(matrix[0])),
        "otherPieceTokRate": (false_k - matrix[0][12]) / max(1, sum(sum(row) for row in matrix[1:]))}
    report["occupancy"]["falsePositivePerBoard"] = report["occupancy"]["trueEmptyPredictedOccupied"] / board_count
    report["boardCount"] = board_count
    return report


def selection_score(synthetic, real):
    return (0.30 * synthetic["occupiedMacroF1"] + .15 * synthetic["occupancy"]["f1"]
            + .45 * real["occupiedMacroF1"] + .45 * real["occupancy"]["f1"]
            + .30 * real["occupancy"]["precision"] + .15 * real["pieceTypeAccuracy"]
            + .10 * real["colorAccuracy"] - .45 * real["kingPrecision"]["falseKingRate"]
            - .20 * real["occupancy"]["falsePositivePerBoard"] / 64
            - .10 * real["confidence"]["wrongAtLeast090"] / max(1, real["sampleCount"]))


def training_order(records, config, hard_indices, seed, device):
    generator = torch.Generator().manual_seed(seed); total = config["training"]["samplesPerEpoch"]
    synthetic = torch.tensor([i for i, row in enumerate(records) if row["dataRole"] == "synthetic-train"])
    targeted = torch.tensor([i for i in synthetic.tolist() if records[i]["classIndex"] in TARGET_LABELS])
    real_empty = torch.tensor([i for i, row in enumerate(records)
                               if row["dataRole"] == "real-development-train" and row["classIndex"] == 0])
    real_occupied = torch.tensor([i for i, row in enumerate(records)
                                  if row["dataRole"] == "real-development-train" and row["classIndex"] != 0])
    synth_count = round(total * config["training"]["syntheticFractionPerEpoch"])
    focus_count = round(synth_count * config["training"]["kingFocusedSyntheticFraction"])
    real_count = total - synth_count
    empty_count = round(real_count * config["training"]["realEmptyFraction"])
    parts = [targeted[torch.randint(len(targeted), (focus_count,), generator=generator)],
             synthetic[torch.randint(len(synthetic), (synth_count - focus_count,), generator=generator)],
             real_empty[torch.randint(len(real_empty), (empty_count,), generator=generator)],
             real_occupied[torch.randint(len(real_occupied), (real_count - empty_count,), generator=generator)]]
    if hard_indices:
        hard = torch.tensor(hard_indices)
        count = min(64, len(hard_indices)); parts[-1][:count] = hard[torch.randint(len(hard), (count,), generator=generator)]
    chosen = torch.cat(parts); chosen = chosen[torch.randperm(len(chosen), generator=generator)]
    return chosen.to(device)


def decomposition(probability, truth, records, heads, predicted):
    rows = {}
    for label in range(12):
        indices = [i for i, (actual, found) in enumerate(zip(truth.cpu().tolist(), predicted.tolist()))
                   if found == 12 and actual == label]
        source = lambda key: dict(sorted(Counter(str(records[i].get(key) or "unknown") for i in indices).items()))
        rows[f"{CLASSES[label]}→k"] = {
            "count": len(indices),
            "meanConfidence": statistics.fmean(float(probability[i, 12]) for i in indices) if indices else None,
            "meanTypeHeadProbability": statistics.fmean(float(heads["type"][i, 5]) for i in indices) if indices else None,
            "meanColorHeadProbability": statistics.fmean(float(heads["color"][i, 1]) for i in indices) if indices else None,
            "sourceCategory": source("sourceCategory"), "platform": source("platform"),
            "pieceFamily": source("pieceSetId"), "captureType": source("captureType"),
            "subtypeTags": dict(sorted(Counter(tag for i in indices for tag in records[i].get("subtypeTags", [])).items()))}
    return rows


def v03_development_analysis(model_dir, config, metadata, pixels, device):
    old_config = json.loads(v03.CONFIG.read_text(encoding="utf-8"))
    model, freeze = v03.load_frozen(model_dir, old_config, device)
    output = {"schemaVersion": "caissa-king-sink-development-analysis/1",
              "sourceModel": old_config["modelVersion"], "stateSha256": freeze["stateSha256"], "splits": {}}
    hard_indices = []
    for role in ("real-development-train", "real-development-validation"):
        value, truth, records = v03.tensors(metadata, pixels, lambda item, role=role: item["dataRole"] == role, device)
        probability, old_heads = v03.probabilities(model, value)
        heads = {**old_heads, "king": old_heads["type"][:, 5]}
        predicted = v03.threshold_predictions(probability, heads["occupancy"], .5)
        false_local = [i for i, (actual, found) in enumerate(zip(truth.cpu().tolist(), predicted.tolist()))
                       if found == 12 and actual != 12]
        near = sorted((i for i, actual in enumerate(truth.cpu().tolist()) if actual != 12),
                      key=lambda i: (-float(probability[i, 12]), records[i]["sampleId"]))[:32]
        output["splits"][role] = {
            "falseKCount": len(false_local), "decomposition": decomposition(probability, truth, records, heads, predicted),
            "rankedFalseK": [{"sampleId": records[i]["sampleId"], "truth": CLASSES[int(truth[i])],
                              "confidence": float(probability[i, 12])} for i in false_local],
            "topNonKNearMisses": [{"sampleId": records[i]["sampleId"], "truth": CLASSES[int(truth[i])],
                                    "kProbability": float(probability[i, 12])} for i in near]}
    # Exact development-train false-k rows are mapped into the combined train tensor by sample identity later.
    return output, hard_indices


def morphology_audit(metadata, pixels):
    groups = defaultdict(list)
    wanted = {0, 3, 4, 5, 6, 9, 10, 11, 12}
    for row in metadata["records"]:
        if row.get("pieceSetId") and row["classIndex"] in wanted:
            groups[(row["pieceSetId"], row["classLabel"])].append(row["index"])
    summaries = {}; mean_masks = {}
    for (family, label), indices in sorted(groups.items()):
        images = np.asarray(pixels[indices], dtype=np.float32); gray = images.mean(3)
        border = np.concatenate((images[:, :4].reshape(len(images), -1, 3), images[:, -4:].reshape(len(images), -1, 3),
                                 images[:, 4:-4, :4].reshape(len(images), -1, 3), images[:, 4:-4, -4:].reshape(len(images), -1, 3)), 1)
        background = np.median(border, axis=1)[:, None, None, :]
        distance = np.abs(images - background).mean(3); threshold = np.maximum(12, np.percentile(distance, 65, axis=(1, 2)))
        mask = distance > threshold[:, None, None]
        dy = np.abs(np.diff(gray, axis=1, prepend=gray[:, :1])); dx = np.abs(np.diff(gray, axis=2, prepend=gray[:, :, :1]))
        edge = (dx + dy) > np.percentile(dx + dy, 75, axis=(1, 2))[:, None, None]
        features = []
        for item, edges in zip(mask, edge):
            ys, xs = np.where(item); mass = max(1, int(item.sum()))
            features.append({"occupancyMaskFraction": float(item.mean()), "edgeDensity": float(edges.mean()),
                             "topMass": float(item[:32].sum() / mass), "bottomMass": float(item[32:].sum() / mass),
                             "centerMassX": float(xs.mean() / 63) if len(xs) else .5,
                             "centerMassY": float(ys.mean() / 63) if len(ys) else .5,
                             "widthHeightRatio": float((xs.max()-xs.min()+1) / max(1, ys.max()-ys.min()+1)) if len(xs) else 0.0})
        summaries.setdefault(family, {})[label] = {key: statistics.fmean(row[key] for row in features) for key in features[0]}
        mean_masks[(family, label)] = mask.mean(0) >= .5
    overlaps = {}
    for family in sorted(summaries):
        family_rows = {}
        for king in ("K", "k"):
            for other in ("Q", "q", "B", "b", "R", "r", "empty"):
                if (family, king) in mean_masks and (family, other) in mean_masks:
                    a, b = mean_masks[(family, king)], mean_masks[(family, other)]
                    family_rows[f"{king}:{other}"] = float((a & b).sum() / max(1, (a | b).sum()))
        overlaps[family] = family_rows
    return {"schemaVersion": "caissa-king-morphology-audit/1", "families": summaries,
            "silhouetteJaccard": overlaps,
            "selectionUse": "descriptive only; synthetic test families were not used for model selection"}


def calibration_selection(model, value, truth, records, config):
    raw_logits = head_logits(model, value)
    fitted = v03.fit_head_temperatures(raw_logits, truth, config["calibration"]["temperatureGrid"])
    candidates = {
        "raw-no-calibration": {"occupancy": 1.0, "color": 1.0, "type": 1.0},
        "fixed-1.0": {"occupancy": 1.0, "color": 1.0, "type": 1.0},
        "occupancy-only": {"occupancy": fitted["occupancy"], "color": 1.0, "type": 1.0},
        "separate-heads": fitted}
    reports = {}
    for name, temperatures in candidates.items():
        probability, heads = probabilities(model, value, temperatures)
        predicted = probability.argmax(1)
        reports[name] = {"temperature": temperatures,
                         "metrics": extended_metrics(probability, truth, records, heads, predicted)}
    baseline = reports["raw-no-calibration"]["metrics"]["confidence"]
    eligible = []
    for name in ("occupancy-only", "separate-heads"):
        confidence = reports[name]["metrics"]["confidence"]
        improvement = (baseline["nll13"] - confidence["nll13"]) / max(1e-12, baseline["nll13"])
        if improvement >= config["calibration"]["minimumNllImprovementFraction"] and confidence["wrongAtLeast090"] <= baseline["wrongAtLeast090"]:
            eligible.append((confidence["nll13"], confidence["brier13"], name))
    selected = min(eligible)[2] if eligible else "raw-no-calibration"
    return selected, reports[selected]["temperature"], reports


def choose_policy(probability, heads, truth, records, config):
    baseline_recall = v03.occupancy_at_threshold(truth, heads["occupancy"], .5)["recall"]
    rows = []
    for threshold in config["threshold"]["grid"]:
        if v03.occupancy_at_threshold(truth, heads["occupancy"], threshold)["recall"] < baseline_recall - config["threshold"]["minimumRecallDrop"]:
            continue
        for type_probability in config["kingPolicy"]["minimumTypeProbability"]:
            for type_margin in config["kingPolicy"]["minimumTypeMargin"]:
                for king_occupancy in config["kingPolicy"]["minimumOccupancyProbability"]:
                    policy = {"minimumTypeProbability": type_probability, "minimumTypeMargin": type_margin,
                              "minimumOccupancyProbability": king_occupancy}
                    predicted = apply_policy(probability, heads, threshold, policy)
                    metrics = extended_metrics(probability, truth, records, heads, predicted)
                    true_k_recall = metrics["confusionMatrix"][12][12] / max(1, sum(metrics["confusionMatrix"][12]))
                    score = (metrics["occupancy"]["f1"] + .35 * metrics["occupancy"]["precision"]
                             + .45 * metrics["occupiedMacroF1"] + .15 * metrics["pieceTypeAccuracy"]
                             + .10 * metrics["colorAccuracy"] + .15 * true_k_recall
                             - .35 * metrics["kingPrecision"]["falseKingRate"]
                             - .03 * metrics["confidence"]["wrongAtLeast090"] / max(1, metrics["sampleCount"]))
                    rows.append({"occupancyThreshold": threshold, "kingPolicy": policy, "score": score,
                                 "occupancyPrecision": metrics["occupancy"]["precision"],
                                 "occupancyRecall": metrics["occupancy"]["recall"],
                                 "occupiedMacroF1": metrics["occupiedMacroF1"],
                                 "falseKingRate": metrics["kingPrecision"]["falseKingRate"],
                                 "trueBlackKingRecall": true_k_recall})
    chosen = sorted(rows, key=lambda row: (-row["score"], row["kingPolicy"]["minimumTypeProbability"],
                                           row["kingPolicy"]["minimumTypeMargin"],
                                           row["kingPolicy"]["minimumOccupancyProbability"], row["occupancyThreshold"]))[0]
    return chosen, rows


def grouped_reports(probability, truth, records, heads, threshold, policy, key):
    output = {}
    for value in sorted(set(key(row) for row in records)):
        indices = [i for i, row in enumerate(records) if key(row) == value]
        subset_heads = {name: part[indices] for name, part in heads.items()}
        predicted = apply_policy(probability[indices], subset_heads, threshold, policy)
        output[value] = extended_metrics(probability[indices], truth[indices], [records[i] for i in indices], subset_heads, predicted)
    return output


def train(config, data_dir, output, v03_model_dir):
    if output.exists():
        raise ValueError("new output directory required")
    metadata, pixels = v03.load_dataset(data_dir, config); output.mkdir(parents=True)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu"); torch.set_num_threads(min(8, torch.get_num_threads()))
    train_x, train_y, train_records = v03.tensors(metadata, pixels, lambda row: row["split"] == "train", device)
    synth_x, synth_y, synth_records = v03.tensors(metadata, pixels, lambda row: row["dataRole"] == "synthetic-validation", device)
    real_x, real_y, real_records = v03.tensors(metadata, pixels, lambda row: row["dataRole"] == "real-development-validation", device)
    old_analysis, _ = v03_development_analysis(v03_model_dir, config, metadata, pixels, device)
    v03.write_json(output / "v03-king-development-analysis.json", old_analysis)
    v03.write_json(output / "king-morphology-audit.json", morphology_audit(metadata, pixels))
    old_config = json.loads(v03.CONFIG.read_text(encoding="utf-8")); old_model, _ = v03.load_frozen(v03_model_dir, old_config, device)
    # No exact false-k exists in development-train. The list is deliberately empty and the curriculum remains synthetic-targeted.
    hard_indices = []
    attempts = []
    for variant in config["variants"]:
        for seed in config["training"]["seeds"]:
            v03.base.seed_all(seed); model = create_model(variant["architecture"]).to(device)
            model.load_state_dict(old_model.state_dict(), strict=not variant["kingAuxiliary"])
            optimizer = torch.optim.AdamW(model.parameters(), lr=config["training"]["learningRate"],
                                          weight_decay=config["training"]["weightDecay"])
            checkpoint = output / f"{variant['id']}-seed-{seed}-best.pt"
            best = -math.inf; best_nll = math.inf; stale = 0; history = []
            for epoch in range(1, config["training"]["maximumEpochs"] + 1):
                model.train(); order = training_order(train_records, config, hard_indices, seed * 100 + epoch, device); total = 0.0
                for indices in order.split(config["training"]["batchSize"]):
                    optimizer.zero_grad(set_to_none=True); loss = classifier_loss(model(train_x[indices].float().div(255)), train_y[indices], variant, config)
                    loss.backward(); optimizer.step(); total += float(loss.detach()) * len(indices)
                synth_probability, synth_heads = probabilities(model, synth_x)
                real_probability, real_heads = probabilities(model, real_x)
                neutral = {"minimumTypeProbability": 0.0, "minimumTypeMargin": 0.0, "minimumOccupancyProbability": .5}
                synth_report = extended_metrics(synth_probability, synth_y, synth_records, synth_heads,
                                                apply_policy(synth_probability, synth_heads, .5, neutral))
                real_report = extended_metrics(real_probability, real_y, real_records, real_heads,
                                               apply_policy(real_probability, real_heads, .5, neutral))
                score = selection_score(synth_report, real_report); nll = real_report["confidence"]["nll13"]
                history.append({"epoch": epoch, "loss": total / len(order), "selectionScore": score,
                                "syntheticValidationAccuracy13": synth_report["accuracy13"],
                                "realValidationAccuracy13": real_report["accuracy13"],
                                "realValidationOccupancyPrecision": real_report["occupancy"]["precision"],
                                "realValidationOccupiedMacroF1": real_report["occupiedMacroF1"],
                                "realValidationFalseKingRate": real_report["kingPrecision"]["falseKingRate"]})
                print(f"{variant['id']} seed={seed} epoch={epoch} loss={total/len(order):.4f} score={score:.4f} "
                      f"real-occ-p={real_report['occupancy']['precision']:.4f} false-k={real_report['kingPrecision']['falsek']}", flush=True)
                if score > best + 1e-6 or (abs(score - best) <= 1e-6 and nll < best_nll - 1e-6):
                    best, best_nll, stale, best_epoch = score, nll, 0, epoch
                    torch.save({key: value.detach().cpu() for key, value in model.state_dict().items()}, checkpoint)
                else:
                    stale += 1
                if stale >= config["training"]["earlyStoppingPatience"]:
                    break
            model.load_state_dict(torch.load(checkpoint, map_location=device, weights_only=True))
            synth_probability, synth_heads = probabilities(model, synth_x); real_probability, real_heads = probabilities(model, real_x)
            neutral = {"minimumTypeProbability": 0.0, "minimumTypeMargin": 0.0, "minimumOccupancyProbability": .5}
            synth_report = extended_metrics(synth_probability, synth_y, synth_records, synth_heads, apply_policy(synth_probability, synth_heads, .5, neutral))
            real_report = extended_metrics(real_probability, real_y, real_records, real_heads, apply_policy(real_probability, real_heads, .5, neutral))
            attempts.append({"variant": variant["id"], "architecture": variant["architecture"], "seed": seed,
                             "bestEpoch": best_epoch, "epochsRun": len(history),
                             "parameterCount": sum(parameter.numel() for parameter in model.parameters()),
                             "checkpointSha256": v03.digest(checkpoint), "selectionScore": selection_score(synth_report, real_report),
                             "syntheticValidation": synth_report, "realDevelopmentValidation": real_report, "history": history})
    selected = sorted(attempts, key=lambda row: (-row["selectionScore"], row["realDevelopmentValidation"]["confidence"]["nll13"], row["variant"], row["seed"]))[0]
    selected_variant = next(row for row in config["variants"] if row["id"] == selected["variant"])
    state = output / "frozen-state.pt"; shutil.copyfile(output / f"{selected['variant']}-seed-{selected['seed']}-best.pt", state)
    model = create_model(selected["architecture"]).to(device); model.load_state_dict(torch.load(state, map_location=device, weights_only=True)); model.eval()
    calibration_method, temperatures, calibration_reports = calibration_selection(model, real_x, real_y, real_records, config)
    calibrated, calibrated_heads = probabilities(model, real_x, temperatures)
    policy_selection, policy_grid = choose_policy(calibrated, calibrated_heads, real_y, real_records, config)
    threshold = policy_selection["occupancyThreshold"]; king_policy = policy_selection["kingPolicy"]
    predicted = apply_policy(calibrated, calibrated_heads, threshold, king_policy)
    final_validation = extended_metrics(calibrated, real_y, real_records, calibrated_heads, predicted)
    traced = output / "frozen-torchscript.pt"; torch.jit.trace(model.cpu(), torch.zeros(1, 3, 64, 64), check_trace=True).save(str(traced))
    freeze = {"schemaVersion": "caissa-scanner-classifier-revision-freeze/3", "modelVersion": config["modelVersion"],
              "datasetVersion": config["datasetVersion"], "datasetMetadataSha256": config["datasetMetadataSha256"],
              "datasetPixelsSha256": config["datasetPixelsSha256"], "humanTruthSha256": config["humanTruthSha256"],
              "configSha256": v03.digest(CONFIG), "classOrder": CLASSES, "selectedVariant": selected["variant"],
              "selectedArchitecture": selected["architecture"], "selectedSeed": selected["seed"],
              "selectedBestEpoch": selected["bestEpoch"], "parameterCount": selected["parameterCount"],
              "kingAuxiliary": selected_variant["kingAuxiliary"], "occupancyLossWeights": selected_variant["occupancyWeights"],
              "calibrationMethod": calibration_method, "temperature": temperatures, "occupancyThreshold": threshold,
              "kingPolicy": king_policy, "stateSha256": v03.digest(state), "stateBytes": state.stat().st_size,
              "torchscriptSha256": v03.digest(traced), "torchscriptBytes": traced.stat().st_size,
              "selectionEvidence": "synthetic family validation plus certified real development-validation only",
              "protectedFinalBenchmarkReadBeforeFreeze": False, "runtimeIntegrated": False}
    validation = {"schemaVersion": "caissa-scanner-classifier-revision-validation/3", "selectedVariant": selected["variant"],
                  "selectedSeed": selected["seed"], "calibrationMethod": calibration_method,
                  "calibrationCandidates": calibration_reports, "policySelection": policy_selection,
                  "policyGrid": policy_grid, "finalRealDevelopmentValidation": final_validation,
                  "syntheticValidation": selected["syntheticValidation"],
                  "platformExploratory": grouped_reports(calibrated, real_y, real_records, calibrated_heads, threshold, king_policy,
                                                         lambda row: row.get("platform") or "unknown"),
                  "mvpCategoryExploratory": grouped_reports(calibrated, real_y, real_records, calibrated_heads, threshold, king_policy,
                                                            lambda row: "livestream/broadcast" if "livestream" in row.get("subtypeTags", []) else "photo-of-screen" if "photo-of-screen" in row.get("subtypeTags", []) else "digital"),
                  "blackKingDecomposition": decomposition(calibrated, real_y, real_records, calibrated_heads, predicted),
                  "abstention": v03.abstention(calibrated, real_y, predicted, calibrated_heads, config["uncertainty"])}
    summary = {"schemaVersion": "caissa-scanner-classifier-revision-training/3", "modelVersion": config["modelVersion"],
               "attempts": attempts, "selectedVariant": selected["variant"], "selectedSeed": selected["seed"],
               "selectedBestEpoch": selected["bestEpoch"], "parameterCount": selected["parameterCount"],
               "realTrainingBoards": 28, "realValidationBoards": 13, "protectedTrainingTiles": 0,
               "primaryRuns": 6, "samplingRatio": {"synthetic": .8, "realDevelopment": .2},
               "exactDevelopmentTrainFalseKHardNegatives": 0}
    v03.write_json(output / "training-summary.json", summary); v03.write_json(output / "validation-report.json", validation)
    v03.write_json(output / "freeze-manifest.json", freeze)
    print(json.dumps({"selectedVariant": selected["variant"], "seed": selected["seed"], "threshold": threshold,
                      "kingPolicy": king_policy, "calibration": calibration_method, "stateSha256": freeze["stateSha256"]}, indent=2))


def load_frozen(output, config, device):
    freeze = json.loads((output / "freeze-manifest.json").read_text(encoding="utf-8"))
    if (freeze["configSha256"] != v03.digest(CONFIG) or freeze["datasetPixelsSha256"] != config["datasetPixelsSha256"]
            or freeze["stateSha256"] != v03.digest(output / "frozen-state.pt")
            or freeze["torchscriptSha256"] != v03.digest(output / "frozen-torchscript.pt")
            or freeze["protectedFinalBenchmarkReadBeforeFreeze"]):
        raise ValueError("frozen artifact mismatch")
    model = create_model(freeze["selectedArchitecture"]).to(device)
    model.load_state_dict(torch.load(output / "frozen-state.pt", map_location=device, weights_only=True)); model.eval()
    return model, freeze


def synthetic_test(config, data_dir, output):
    path = output / "synthetic-test-report.json"
    if path.exists(): raise ValueError("synthetic test already scored")
    metadata, pixels = v03.load_dataset(data_dir, config); model, freeze = load_frozen(output, config, torch.device("cpu"))
    value, truth, records = v03.tensors(metadata, pixels, lambda row: row["dataRole"] == "synthetic-test", torch.device("cpu"))
    raw, raw_heads = probabilities(model, value); calibrated, heads = probabilities(model, value, freeze["temperature"])
    predicted = apply_policy(calibrated, heads, freeze["occupancyThreshold"], freeze["kingPolicy"])
    report = {"schemaVersion": "caissa-scanner-classifier-revision-synthetic-test/3", "modelVersion": config["modelVersion"],
              "stateSha256": freeze["stateSha256"], "rawCanonical": extended_metrics(raw, truth, records, raw_heads, raw.argmax(1)),
              "frozenPolicy": extended_metrics(calibrated, truth, records, heads, predicted),
              "byFamily": grouped_reports(calibrated, truth, records, heads, freeze["occupancyThreshold"], freeze["kingPolicy"], lambda row: row["pieceSetId"]),
              "policy": "one post-freeze pass over RhosGFX and P4wn; no retuning"}
    v03.write_json(path, report); print("synthetic unseen-family test scored exactly once")


def infer_protected(config, real_dir, output):
    path = output / "real-predictions.json"
    if path.exists(): raise ValueError("protected inference already performed")
    real = json.loads((real_dir / "real-rgb64.json").read_text(encoding="utf-8")); binary = real_dir / "real-rgb64.bin"
    if real["boardCount"] != 31 or real["tileCount"] != 1984 or real["classOrder"] != CLASSES or binary.stat().st_size != 1984 * v03.TILE_BYTES or v03.digest(binary) != real["pixelsSha256"]:
        raise ValueError("protected real cache changed")
    model, freeze = load_frozen(output, config, torch.device("cpu")); pixels = np.memmap(binary, dtype=np.uint8, mode="r", shape=(1984, 64, 64, 3))
    value = torch.from_numpy(np.array(pixels, copy=True)).permute(0, 3, 1, 2).contiguous()
    raw, raw_heads = probabilities(model, value); calibrated, heads = probabilities(model, value, freeze["temperature"])
    predicted = apply_policy(calibrated, heads, freeze["occupancyThreshold"], freeze["kingPolicy"])
    diagnostics = {}
    for name, values in (("raw", raw_heads), ("calibrated", heads)):
        color = values["color"].topk(2, dim=1).values; piece = values["type"].topk(2, dim=1).values
        diagnostics[name] = {"occupancyProbability": values["occupancy"].tolist(), "colorMargin": (color[:, 0]-color[:, 1]).tolist(),
                             "typeMargin": (piece[:, 0]-piece[:, 1]).tolist(), "kingProbability": values["king"].tolist()}
    v03.write_json(path, {"schemaVersion": "caissa-scanner-classifier-revision-real-predictions/3", "modelVersion": config["modelVersion"],
                          "stateSha256": freeze["stateSha256"], "realPixelsSha256": real["pixelsSha256"],
                          "truthManifestSha256": real["truthManifestSha256"], "classOrder": CLASSES, "boardIds": real["boardIds"],
                          "rawProbabilities": raw.tolist(), "calibratedProbabilities": calibrated.tolist(),
                          "rawPredictedIndices": raw.argmax(1).tolist(), "calibratedPredictedIndices": predicted.tolist(),
                          "diagnostics": diagnostics, "truthReadByModel": False, "occupancyThreshold": freeze["occupancyThreshold"],
                          "kingPolicy": freeze["kingPolicy"], "policy": "exactly one protected pass after freeze; no post-benchmark tuning"})
    print("protected 31-board inference completed exactly once")


def performance(config, data_dir, output):
    path = output / "performance-report.json"
    if path.exists(): raise ValueError("performance report already exists")
    metadata, pixels = v03.load_dataset(data_dir, config); indices = [row["index"] for row in metadata["records"] if row["dataRole"] == "synthetic-test"][:64]
    samples = np.array(pixels[indices], copy=True); process = psutil.Process(); before = process.memory_info().rss
    started = time.perf_counter(); model, freeze = load_frozen(output, config, torch.device("cpu")); load_ms = (time.perf_counter()-started)*1000
    after_load = process.memory_info().rss; prep = []; inference = []
    with torch.inference_mode():
        for _ in range(5): model(torch.from_numpy(samples).permute(0,3,1,2).contiguous().float().div(255))
        for _ in range(30):
            started=time.perf_counter(); value=torch.from_numpy(samples).permute(0,3,1,2).contiguous().float().div(255); prep.append((time.perf_counter()-started)*1000)
            started=time.perf_counter(); model(value); inference.append((time.perf_counter()-started)*1000)
    state=output/"frozen-state.pt"; traced=output/"frozen-torchscript.pt"
    report={"schemaVersion":"caissa-scanner-classifier-performance/3","modelVersion":config["modelVersion"],"parameterCount":freeze["parameterCount"],
            "modelLoadMilliseconds":load_ms,"preprocessMillisecondsPerBoard":statistics.median(prep),"inferenceMillisecondsPerBoard":statistics.median(inference),
            "inferenceMillisecondsPerTileEffective":statistics.median(inference)/64,"nativeModelBytes":state.stat().st_size,
            "nativeModelGzipBytes":len(gzip.compress(state.read_bytes(),compresslevel=9,mtime=0)),"torchscriptBytes":traced.stat().st_size,
            "torchscriptGzipBytes":len(gzip.compress(traced.read_bytes(),compresslevel=9,mtime=0)),"residentMemoryBytesBeforeLoad":before,
            "residentMemoryBytesAfterLoad":after_load,"residentMemoryBytesAfterBenchmark":process.memory_info().rss,
            "method":"Windows desktop CPU; 5 warmups; 30 batch-64 repeats; excludes decode/homography/I/O/browser"}
    v03.write_json(path,report); print(json.dumps(report,indent=2))


def self_test(config):
    labels=torch.tensor([0,1,6,8,12]); value=torch.zeros(5,3,64,64)
    for variant in config["variants"]:
        model=create_model(variant["architecture"]); output=model(value)
        assert len(output)==(4 if variant["kingAuxiliary"] else 3)
        probability,heads=canonical(output); assert probability.shape==(5,13) and heads["king"].shape==(5,)
        classifier_loss(output,labels,variant,config).backward()
    occupied=labels!=0; expected=(((labels[occupied]-1)%6)==5).long(); assert expected.tolist()==[0,1,0,1]
    probability=torch.zeros(3,13); probability[:,7:13]=torch.tensor([[.1,.2,.1,.1,.1,.4],[.02,.02,.02,.02,.4,.5],[.1,.1,.1,.1,.1,.5]])
    heads={"occupancy":torch.tensor([.9,.9,.4]),"type":torch.tensor([[0,0,0,0,.3,.7],[0,0,0,0,.45,.55],[0,0,0,0,.1,.9]],dtype=torch.float),
           "color":torch.tensor([[0.,1.]]*3),"king":torch.tensor([.7,.55,.9])}
    policy={"minimumTypeProbability":.6,"minimumTypeMargin":.2,"minimumOccupancyProbability":.5}
    assert apply_policy(probability,heads,.5,policy).tolist()==[12,11,0]
    asymmetric=next(row for row in config["variants"] if row["id"].endswith("asymmetric-occupancy")); assert asymmetric["occupancyWeights"]==[2.0,1.0]
    assert min(config["calibration"]["temperatureGrid"])>=1.0
    first=apply_policy(probability,heads,.5,policy); assert torch.equal(first,apply_policy(probability,heads,.5,policy))
    print("v0.4 king auxiliary, masked loss, asymmetric occupancy, policy, calibration and determinism self-test passed")


def main():
    parser=argparse.ArgumentParser(); parser.add_argument("mode",choices=["train","synthetic-test","infer-protected","performance","self-test"])
    parser.add_argument("--data-dir",type=Path); parser.add_argument("--output-dir",type=Path); parser.add_argument("--v03-model-dir",type=Path); parser.add_argument("--real-dir",type=Path)
    args=parser.parse_args(); config=json.loads(CONFIG.read_text(encoding="utf-8"))
    if config["classOrder"]!=CLASSES: raise ValueError("class order changed")
    if args.mode=="self-test": self_test(config)
    elif args.mode=="train":
        if not args.data_dir or not args.output_dir or not args.v03_model_dir: parser.error("train paths required")
        train(config,args.data_dir,args.output_dir,args.v03_model_dir)
    elif args.mode=="synthetic-test":
        if not args.data_dir or not args.output_dir: parser.error("data/output required")
        synthetic_test(config,args.data_dir,args.output_dir)
    elif args.mode=="infer-protected":
        if not args.real_dir or not args.output_dir: parser.error("real/output required")
        infer_protected(config,args.real_dir,args.output_dir)
    else:
        if not args.data_dir or not args.output_dir: parser.error("data/output required")
        performance(config,args.data_dir,args.output_dir)


if __name__=="__main__": main()
