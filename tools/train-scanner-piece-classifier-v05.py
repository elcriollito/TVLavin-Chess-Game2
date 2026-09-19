"""Final surgical occupancy recovery built on the frozen v0.4 king model.

Only synthetic validation and certified real-development validation select the
model and threshold. Protected truth is unavailable until the post-freeze pass.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import math
import shutil
from collections import Counter
from pathlib import Path

import numpy as np
import torch
from torch.nn import functional as F


ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "scanner/recognition/classifier-revision/config-v0.5.json"
V04_PATH = ROOT / "tools/train-scanner-piece-classifier-v04.py"
spec = importlib.util.spec_from_file_location("caissa_v04", V04_PATH)
v04 = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(v04)
CLASSES = v04.CLASSES


def percentile(values: np.ndarray, quantile: float):
    return float(np.quantile(values, quantile)) if len(values) else None


def distribution(values: np.ndarray) -> dict:
    if not len(values):
        return {"count": 0, "mean": None, "median": None, "p10": None, "p90": None, "minimum": None, "maximum": None}
    return {"count": int(len(values)), "mean": float(values.mean()), "median": float(np.median(values)),
            "p10": percentile(values, .1), "p90": percentile(values, .9),
            "minimum": float(values.min()), "maximum": float(values.max())}


def threshold_rows(truth, occupancy, records, config):
    board_ids = {row.get("boardSampleId") for row in records if row.get("boardSampleId")}
    board_count = len(board_ids) or max(1, math.ceil(len(records) / 64))
    rows = []
    for threshold in config["threshold"]["grid"]:
        row = v04.v03.occupancy_at_threshold(truth, occupancy, threshold)
        row["cost"] = (config["threshold"]["falsePositiveCost"] * row["falsePositive"]
                       + config["threshold"]["falseNegativeCost"] * row["falseNegative"])
        row["falsePositivePerBoard"] = row["falsePositive"] / board_count
        rows.append(row)
    return rows


def choose_threshold(truth, occupancy, records, config):
    rows = threshold_rows(truth, occupancy, records, config)
    chosen = sorted(rows, key=lambda row: (row["cost"], -row["f1"], -row["precision"], -row["threshold"]))[0]
    return chosen, rows


def false_occupancy_metrics(probability, truth, predicted) -> dict:
    truth = truth.cpu(); predicted = predicted.cpu(); top = probability.max(1).values
    mask = (truth == 0) & (predicted != 0)
    counts = {CLASSES[index]: int((mask & (predicted == index)).sum()) for index in range(1, 13)}
    return {"count": int(mask.sum()), "atLeast090": int((mask & (top >= .9)).sum()),
            "atLeast095": int((mask & (top >= .95)).sum()),
            "byPredictedClass": dict(sorted(counts.items(), key=lambda item: (-item[1], item[0])))}


def king_preservation(metrics: dict) -> dict:
    king = metrics["kingPrecision"]
    passed = (king["predictedk"] <= king["truek"] + 3 and king["falseKingRate"] <= .15
              and king["emptyTok"] == 0 and king["otherPieceTok"] <= 1
              and metrics["blackExactAccuracy"] >= .97)
    return {"passed": passed, "predictedk": king["predictedk"], "truek": king["truek"],
            "falseKingRate": king["falseKingRate"], "emptyTok": king["emptyTok"],
            "otherPieceTok": king["otherPieceTok"], "blackExactAccuracy": metrics["blackExactAccuracy"]}


def policy_metrics(model, value, truth, records, config, threshold_override=None):
    probability, heads = v04.probabilities(model, value)
    selected, sweep = choose_threshold(truth, heads["occupancy"], records, config)
    threshold = (selected if threshold_override is None else
                 next(row for row in threshold_rows(truth, heads["occupancy"], records, config)
                      if row["threshold"] == threshold_override))
    predicted = v04.apply_policy(probability, heads, threshold["threshold"], config["kingPolicy"])
    metrics = v04.extended_metrics(probability, truth, records, heads, predicted)
    metrics["falseOccupancy"] = false_occupancy_metrics(probability, truth, predicted)
    raw = v04.head_logits(model, value)[0]
    margin = (raw[:, 1] - raw[:, 0]).numpy(); labels = truth.cpu().numpy()
    metrics["occupancySeparation"] = {
        "emptyP90": percentile(margin[labels == 0], .9), "occupiedP10": percentile(margin[labels != 0], .1),
        "p10MinusP90": percentile(margin[labels != 0], .1) - percentile(margin[labels == 0], .9)}
    return probability, heads, predicted, metrics, threshold, sweep


def selection_score(synthetic, real):
    separation = min(25.0, max(0.0, real["occupancySeparation"]["p10MinusP90"])) / 25.0
    score = (.25 * synthetic["occupiedMacroF1"] + .15 * synthetic["occupancy"]["f1"]
             + .35 * real["occupiedMacroF1"] + .35 * real["occupancy"]["f1"]
             + .35 * real["occupancy"]["precision"] + .15 * real["pieceTypeAccuracy"]
             + .15 * real["blackExactAccuracy"] + .15 * separation
             - .20 * real["occupancy"]["falsePositivePerBoard"] / 64
             - .10 * real["confidence"]["wrongAtLeast090"] / max(1, real["sampleCount"]))
    return score if king_preservation(real)["passed"] else score - 10.0


def training_order(records, variant, config, hard_indices, seed, device):
    generator = torch.Generator().manual_seed(seed); total = config["training"]["samplesPerEpoch"]
    synthetic = torch.tensor([index for index, row in enumerate(records) if row["dataRole"] == "synthetic-train"])
    real_empty = torch.tensor([index for index, row in enumerate(records)
                               if row["dataRole"] == "real-development-train" and row["classIndex"] == 0])
    real_occupied = torch.tensor([index for index, row in enumerate(records)
                                  if row["dataRole"] == "real-development-train" and row["classIndex"] != 0])
    real_count = round(total * variant["realFraction"]); synthetic_count = total - real_count
    empty_count = round(real_count * variant["realEmptyFraction"]); occupied_count = real_count - empty_count
    hard_count = min(empty_count, round(total * variant["hardNegativeFraction"]))
    ordinary_empty_count = empty_count - hard_count
    parts = [synthetic[torch.randint(len(synthetic), (synthetic_count,), generator=generator)],
             real_empty[torch.randint(len(real_empty), (ordinary_empty_count,), generator=generator)],
             real_occupied[torch.randint(len(real_occupied), (occupied_count,), generator=generator)]]
    if hard_count:
        hard = torch.tensor(hard_indices)
        parts.append(hard[torch.randint(len(hard), (hard_count,), generator=generator)])
    chosen = torch.cat(parts); chosen = chosen[torch.randperm(len(chosen), generator=generator)]
    return chosen.to(device)


def loss(output, labels, variant, config):
    occupied = labels != 0
    weights = torch.tensor(variant["occupancyWeights"], device=labels.device)
    result = 1.75 * F.cross_entropy(output[0], occupied.long(), weight=weights)
    if variant["occupancyOnly"] or not bool(occupied.any()):
        return result
    result = result + .75 * F.cross_entropy(output[1][occupied], (labels[occupied] >= 7).long())
    result = result + F.cross_entropy(output[2][occupied], (labels[occupied] - 1) % 6)
    king_target = (((labels[occupied] - 1) % 6) == 5).long()
    return result + config["training"]["kingAuxiliaryWeight"] * F.cross_entropy(output[3][occupied], king_target)


def square_metadata(record):
    index = record["canonicalSquareIndex"]; row, column = divmod(index, 8)
    tags = record.get("subtypeTags", [])
    return {"squareTone": "light" if (row + column) % 2 == 0 else "dark",
            "borderProximitySquares": min(row, column, 7-row, 7-column),
            "highlightStatus": "tagged" if any("highlight" in tag for tag in tags) else "unrecorded",
            "artifactTags": [tag for tag in tags if any(word in tag for word in ("glare", "moire", "compression", "highlight"))]}


def occupancy_analysis(model, metadata, pixels, device):
    combined = []
    split_outputs = {}; all_heads = []; all_logits = []; all_truth = []; all_records = []
    for role in ("real-development-train", "real-development-validation"):
        value, truth, records = v04.v03.tensors(metadata, pixels, lambda row, role=role: row["dataRole"] == role, device)
        probability, heads = v04.probabilities(model, value); logits = v04.head_logits(model, value)[0]
        predicted = v04.apply_policy(probability, heads, .5, {"minimumTypeProbability": 0.0,
            "minimumTypeMargin": 0.0, "minimumOccupancyProbability": .5})
        failures = []
        for index in ((truth.cpu() == 0) & (predicted != 0)).nonzero().flatten().tolist():
            record = records[index]; found = int(predicted[index])
            failures.append({"sampleId": record["sampleId"], "sourceBoard": record["boardSampleId"],
                             "squareIndex": record["canonicalSquareIndex"], "predictedClass": CLASSES[found],
                             "canonicalConfidence": float(probability[index, found]),
                             "occupiedProbability": float(heads["occupancy"][index]),
                             "occupancyLogitMargin": float(logits[index, 1] - logits[index, 0]),
                             "platform": record.get("platform"), "captureType": record.get("captureType"),
                             "sourceCategory": record.get("sourceCategory"), "subtypeTags": record.get("subtypeTags", []),
                             **square_metadata(record)})
        split_outputs[role] = {"emptyToOccupiedCount": len(failures), "failures": failures}
        combined.extend(failures); all_heads.append(heads["occupancy"])
        all_logits.append(logits); all_truth.append(truth.cpu()); all_records.extend(records)
    occupancy = torch.cat(all_heads).numpy()
    logits = torch.cat(all_logits); margin = (logits[:, 1] - logits[:, 0]).numpy(); truth = torch.cat(all_truth).numpy()
    tags = [set(row.get("subtypeTags", [])) for row in all_records]
    masks = {
        "true-empty": truth == 0, "true-occupied": truth != 0,
        "hard-negatives": np.array([bool(row.get("hardNegative")) for row in all_records]),
        "photo-of-screen": np.array(["photo-of-screen" in value for value in tags]),
        "digital-screenshot": np.array([any("screenshot" in tag or "digital" in tag for tag in value) and "photo-of-screen" not in value for value in tags]),
        "print": np.array([any("print" in tag or "book" in tag or "newspaper" in tag for tag in value) for value in tags]),
        "low-contrast": np.array([any("low-contrast" in tag or "fading" in tag for tag in value) for value in tags])}
    distributions = {name: {"occupancyLogitMargin": distribution(margin[mask]),
                            "occupiedProbability": distribution(occupancy[mask])} for name, mask in masks.items()}
    empty_range = distributions["true-empty"]["occupancyLogitMargin"]
    occupied_range = distributions["true-occupied"]["occupancyLogitMargin"]
    low = max(empty_range["p10"], occupied_range["p10"]); high = min(empty_range["p90"], occupied_range["p90"])
    ranking = Counter(item["predictedClass"] for item in combined)
    return {"schemaVersion": "caissa-occupancy-development-analysis/1", "splits": split_outputs,
            "rankedEmptyToPiece": [{"predictedClass": label, "count": count} for label, count in ranking.most_common()],
            "distributions": distributions, "central80OverlapLogitMargin": [low, high] if low <= high else None,
            "protectedBenchmarkUsed": False}


def train(config, data_dir, output, v04_model_dir):
    if output.exists(): raise ValueError("new output directory required")
    metadata, pixels = v04.v03.load_dataset(data_dir, config); output.mkdir(parents=True)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu"); torch.set_num_threads(min(8, torch.get_num_threads()))
    train_x, train_y, train_records = v04.v03.tensors(metadata, pixels, lambda row: row["split"] == "train", device)
    synth_x, synth_y, synth_records = v04.v03.tensors(metadata, pixels, lambda row: row["dataRole"] == "synthetic-validation", device)
    real_x, real_y, real_records = v04.v03.tensors(metadata, pixels, lambda row: row["dataRole"] == "real-development-validation", device)
    old_config = json.loads(v04.CONFIG.read_text(encoding="utf-8")); baseline, baseline_freeze = v04.load_frozen(v04_model_dir, old_config, device)
    analysis = occupancy_analysis(baseline, metadata, pixels, device); v04.v03.write_json(output / "occupancy-development-analysis.json", analysis)
    hard_ids = {item["sampleId"] for item in analysis["splits"]["real-development-train"]["failures"]}
    hard_indices = [index for index, row in enumerate(train_records) if row["sampleId"] in hard_ids]
    if len(hard_indices) != 3: raise ValueError("expected exactly three certified v0.4 development-train hard negatives")
    attempts = []
    threshold_variant = config["variants"][0]; checkpoint = output / "threshold-only-best.pt"
    shutil.copyfile(v04_model_dir / "frozen-state.pt", checkpoint)
    _, _, _, real_metrics, threshold, sweep = policy_metrics(baseline, real_x, real_y, real_records, config)
    _, _, _, synth_metrics, _, _ = policy_metrics(baseline, synth_x, synth_y, synth_records, config, threshold["threshold"])
    attempts.append({"variant": threshold_variant["id"], "seed": None, "bestEpoch": 0, "epochsRun": 0,
                     "checkpointSha256": v04.v03.digest(checkpoint), "selectionScore": selection_score(synth_metrics, real_metrics),
                     "thresholdSelection": threshold, "thresholdSweep": sweep, "kingPreservation": king_preservation(real_metrics),
                     "syntheticValidation": synth_metrics, "realDevelopmentValidation": real_metrics,
                     "sampling": {"synthetic": .8, "real": .2, "realEmptyWithinReal": .75, "hardNegative": 0.0}, "history": []})
    for variant in config["variants"][1:]:
        for seed in config["training"]["seeds"]:
            v04.v03.base.seed_all(seed); model = v04.create_model("shared-king-aux").to(device)
            model.load_state_dict(baseline.state_dict())
            if variant["occupancyOnly"]:
                for name, parameter in model.named_parameters(): parameter.requires_grad_(name.startswith("occupancy."))
            learning_rate = (config["training"]["learningRateOccupancyOnly"] if variant["occupancyOnly"]
                             else config["training"]["learningRateAllHeads"])
            optimizer = torch.optim.AdamW([parameter for parameter in model.parameters() if parameter.requires_grad],
                                          lr=learning_rate, weight_decay=config["training"]["weightDecay"])
            checkpoint = output / f"{variant['id']}-seed-{seed}-best.pt"
            best = -math.inf; best_nll = math.inf; stale = 0; history = []
            for epoch in range(1, config["training"]["maximumEpochs"] + 1):
                model.train(); order = training_order(train_records, variant, config, hard_indices, seed*100+epoch, device); total = 0.0
                for indices in order.split(config["training"]["batchSize"]):
                    optimizer.zero_grad(set_to_none=True); result = loss(model(train_x[indices].float().div(255)), train_y[indices], variant, config)
                    result.backward(); optimizer.step(); total += float(result.detach()) * len(indices)
                _, _, _, real_metrics, threshold, _ = policy_metrics(model, real_x, real_y, real_records, config)
                _, _, _, synth_metrics, _, _ = policy_metrics(model, synth_x, synth_y, synth_records, config, threshold["threshold"])
                score = selection_score(synth_metrics, real_metrics); nll = real_metrics["confidence"]["nll13"]
                history.append({"epoch": epoch, "loss": total/len(order), "selectionScore": score,
                                "threshold": threshold["threshold"], "realOccupancyPrecision": real_metrics["occupancy"]["precision"],
                                "realOccupancyRecall": real_metrics["occupancy"]["recall"],
                                "realOccupiedMacroF1": real_metrics["occupiedMacroF1"],
                                "realFalseKingRate": real_metrics["kingPrecision"]["falseKingRate"],
                                "realOccupancySeparation": real_metrics["occupancySeparation"]["p10MinusP90"]})
                print(f"{variant['id']} seed={seed} epoch={epoch} loss={total/len(order):.5f} score={score:.5f} "
                      f"threshold={threshold['threshold']:.3f} sep={real_metrics['occupancySeparation']['p10MinusP90']:.3f}", flush=True)
                if score > best + 1e-7 or (abs(score-best) <= 1e-7 and nll < best_nll - 1e-7):
                    best, best_nll, stale, best_epoch = score, nll, 0, epoch
                    torch.save({key: value.detach().cpu() for key, value in model.state_dict().items()}, checkpoint)
                else: stale += 1
                if stale >= config["training"]["earlyStoppingPatience"]: break
            model.load_state_dict(torch.load(checkpoint, map_location=device, weights_only=True))
            _, _, _, real_metrics, threshold, sweep = policy_metrics(model, real_x, real_y, real_records, config)
            _, _, _, synth_metrics, _, _ = policy_metrics(model, synth_x, synth_y, synth_records, config, threshold["threshold"])
            attempts.append({"variant": variant["id"], "seed": seed, "bestEpoch": best_epoch, "epochsRun": len(history),
                             "checkpointSha256": v04.v03.digest(checkpoint), "selectionScore": selection_score(synth_metrics, real_metrics),
                             "thresholdSelection": threshold, "thresholdSweep": sweep, "kingPreservation": king_preservation(real_metrics),
                             "syntheticValidation": synth_metrics, "realDevelopmentValidation": real_metrics,
                             "sampling": {"synthetic": 1-variant["realFraction"], "real": variant["realFraction"],
                                          "realEmptyWithinReal": variant["realEmptyFraction"], "hardNegative": variant["hardNegativeFraction"]},
                             "history": history})
    selected = sorted(attempts, key=lambda row: (-row["selectionScore"],
        row["realDevelopmentValidation"]["confidence"]["nll13"], row["variant"], row["seed"] or 0))[0]
    selected_variant = next(row for row in config["variants"] if row["id"] == selected["variant"])
    state = output / "frozen-state.pt"; source = output / ("threshold-only-best.pt" if selected["seed"] is None else f"{selected['variant']}-seed-{selected['seed']}-best.pt")
    shutil.copyfile(source, state); model = v04.create_model("shared-king-aux").to(device)
    model.load_state_dict(torch.load(state, map_location=device, weights_only=True)); model.eval()
    probability, heads, predicted, final_validation, threshold, sweep = policy_metrics(model, real_x, real_y, real_records, config)
    traced = output / "frozen-torchscript.pt"; torch.jit.trace(model.cpu(), torch.zeros(1,3,64,64), check_trace=True).save(str(traced))
    freeze = {"schemaVersion": "caissa-scanner-classifier-revision-freeze/4", "modelVersion": config["modelVersion"],
              "datasetVersion": config["datasetVersion"], "datasetMetadataSha256": config["datasetMetadataSha256"],
              "datasetPixelsSha256": config["datasetPixelsSha256"], "humanTruthSha256": config["humanTruthSha256"],
              "configSha256": v04.v03.digest(CONFIG), "classOrder": CLASSES, "selectedVariant": selected["variant"],
              "selectedArchitecture": "shared-king-aux", "selectedSeed": selected["seed"], "selectedBestEpoch": selected["bestEpoch"],
              "parameterCount": sum(parameter.numel() for parameter in model.parameters()), "kingAuxiliary": True,
              "occupancyOnlyFineTune": selected_variant["occupancyOnly"], "occupancyLossWeights": selected_variant["occupancyWeights"],
              "sampling": selected["sampling"], "calibrationMethod": config["calibration"]["method"],
              "temperature": config["calibration"]["temperature"], "occupancyThreshold": threshold["threshold"],
              "kingPolicy": config["kingPolicy"], "stateSha256": v04.v03.digest(state), "stateBytes": state.stat().st_size,
              "torchscriptSha256": v04.v03.digest(traced), "torchscriptBytes": traced.stat().st_size,
              "baselineStateSha256": baseline_freeze["stateSha256"],
              "selectionEvidence": "synthetic validation plus certified real development-validation only",
              "protectedFinalBenchmarkReadBeforeFreeze": False, "runtimeIntegrated": False}
    validation = {"schemaVersion": "caissa-scanner-classifier-revision-validation/4", "selectedVariant": selected["variant"],
                  "selectedSeed": selected["seed"], "thresholdSelection": threshold, "thresholdSweep": sweep,
                  "calibrationMethod": config["calibration"]["method"], "finalRealDevelopmentValidation": final_validation,
                  "syntheticValidation": selected["syntheticValidation"], "kingPreservation": king_preservation(final_validation),
                  "falseOccupancy": false_occupancy_metrics(probability, real_y, predicted),
                  "abstention": v04.v03.abstention(probability, real_y, predicted, heads, config["uncertainty"])}
    summary = {"schemaVersion": "caissa-scanner-classifier-revision-training/4", "modelVersion": config["modelVersion"],
               "attempts": attempts, "selectedVariant": selected["variant"], "selectedSeed": selected["seed"],
               "selectedBestEpoch": selected["bestEpoch"], "realTrainingBoards": 28, "realValidationBoards": 13,
               "protectedTrainingTiles": 0, "trainingRuns": 6, "thresholdOnlyCandidates": 1,
               "hardNegativeCount": len(hard_indices), "baselineStateSha256": baseline_freeze["stateSha256"]}
    v04.v03.write_json(output/"training-summary.json", summary); v04.v03.write_json(output/"validation-report.json", validation)
    v04.v03.write_json(output/"freeze-manifest.json", freeze)
    print(json.dumps({"selectedVariant": selected["variant"], "seed": selected["seed"], "threshold": threshold["threshold"],
                      "occupancyOnly": selected_variant["occupancyOnly"], "stateSha256": freeze["stateSha256"]}, indent=2))


def load_frozen(output, config, device):
    freeze = json.loads((output/"freeze-manifest.json").read_text(encoding="utf-8"))
    if (freeze["configSha256"] != v04.v03.digest(CONFIG) or freeze["datasetPixelsSha256"] != config["datasetPixelsSha256"]
            or freeze["stateSha256"] != v04.v03.digest(output/"frozen-state.pt")
            or freeze["torchscriptSha256"] != v04.v03.digest(output/"frozen-torchscript.pt")
            or freeze["protectedFinalBenchmarkReadBeforeFreeze"]): raise ValueError("frozen artifact mismatch")
    model = v04.create_model("shared-king-aux").to(device)
    model.load_state_dict(torch.load(output/"frozen-state.pt", map_location=device, weights_only=True)); model.eval()
    return model, freeze


def synthetic_test(config, data_dir, output):
    path = output/"synthetic-test-report.json"
    if path.exists(): raise ValueError("synthetic test already scored")
    metadata,pixels=v04.v03.load_dataset(data_dir,config); model,freeze=load_frozen(output,config,torch.device("cpu"))
    value,truth,records=v04.v03.tensors(metadata,pixels,lambda row:row["dataRole"]=="synthetic-test",torch.device("cpu"))
    probability,heads=v04.probabilities(model,value); predicted=v04.apply_policy(probability,heads,freeze["occupancyThreshold"],freeze["kingPolicy"])
    metrics=v04.extended_metrics(probability,truth,records,heads,predicted); metrics["falseOccupancy"]=false_occupancy_metrics(probability,truth,predicted)
    report={"schemaVersion":"caissa-scanner-classifier-revision-synthetic-test/4","modelVersion":config["modelVersion"],
            "stateSha256":freeze["stateSha256"],"frozenPolicy":metrics,
            "byFamily":v04.grouped_reports(probability,truth,records,heads,freeze["occupancyThreshold"],freeze["kingPolicy"],lambda row:row["pieceSetId"]),
            "policy":"one post-freeze pass over RhosGFX and P4wn; no retuning"}
    v04.v03.write_json(path,report); print("synthetic unseen-family test scored exactly once")


def infer_protected(config, real_dir, output):
    path=output/"real-predictions.json"
    if path.exists(): raise ValueError("protected inference already performed")
    real=json.loads((real_dir/"real-rgb64.json").read_text(encoding="utf-8"));binary=real_dir/"real-rgb64.bin"
    if real["boardCount"]!=31 or real["tileCount"]!=1984 or real["classOrder"]!=CLASSES or binary.stat().st_size!=1984*v04.v03.TILE_BYTES or v04.v03.digest(binary)!=real["pixelsSha256"]: raise ValueError("protected real cache changed")
    model,freeze=load_frozen(output,config,torch.device("cpu"));pixels=np.memmap(binary,dtype=np.uint8,mode="r",shape=(1984,64,64,3))
    value=torch.from_numpy(np.array(pixels,copy=True)).permute(0,3,1,2).contiguous();probability,heads=v04.probabilities(model,value)
    predicted=v04.apply_policy(probability,heads,freeze["occupancyThreshold"],freeze["kingPolicy"]);color=heads["color"].topk(2,dim=1).values;piece=heads["type"].topk(2,dim=1).values
    diagnostics={"occupancyProbability":heads["occupancy"].tolist(),"occupancyMargin":(2*heads["occupancy"]-1).tolist(),
                 "colorMargin":(color[:,0]-color[:,1]).tolist(),"typeMargin":(piece[:,0]-piece[:,1]).tolist(),"kingProbability":heads["king"].tolist()}
    v04.v03.write_json(path,{"schemaVersion":"caissa-scanner-classifier-revision-real-predictions/4","modelVersion":config["modelVersion"],
        "stateSha256":freeze["stateSha256"],"realPixelsSha256":real["pixelsSha256"],"truthManifestSha256":real["truthManifestSha256"],
        "classOrder":CLASSES,"boardIds":real["boardIds"],"rawProbabilities":probability.tolist(),"calibratedProbabilities":probability.tolist(),
        "rawPredictedIndices":probability.argmax(1).tolist(),"calibratedPredictedIndices":predicted.tolist(),
        "diagnostics":{"raw":diagnostics,"calibrated":diagnostics},"truthReadByModel":False,
        "occupancyThreshold":freeze["occupancyThreshold"],"kingPolicy":freeze["kingPolicy"],
        "policy":"exactly one protected pass after freeze; raw/no calibration; no post-benchmark tuning"})
    print("protected 31-board inference completed exactly once")


def self_test(config):
    truth=torch.tensor([0,0,1,1]);occupancy=torch.tensor([.6,.95,.995,.999]);records=[{"boardSampleId":"a"}]*4
    chosen,rows=choose_threshold(truth,occupancy,records,config);assert chosen["threshold"]==.99 and chosen["cost"]==0
    assert rows[0]["cost"]==4 and rows[0]["falsePositivePerBoard"]==2
    probability=torch.zeros(4,13);probability[0,1]=.91;probability[1,2]=.96;probability[2,1]=1;probability[3,1]=1
    found=torch.tensor([1,2,1,1]);false=false_occupancy_metrics(probability,truth,found)
    assert false["count"]==2 and false["atLeast090"]==2 and false["atLeast095"]==1
    metric={"kingPrecision":{"predictedk":13,"truek":13,"falseKingRate":0.0,"emptyTok":0,"otherPieceTok":0},"blackExactAccuracy":1.0}
    assert king_preservation(metric)["passed"]
    assert choose_threshold(truth,occupancy,records,config)==choose_threshold(truth,occupancy,records,config)
    print("v0.5 threshold cost, FP/board, high-confidence occupancy, king gate and determinism self-test passed")


def main():
    parser=argparse.ArgumentParser();parser.add_argument("mode",choices=["train","synthetic-test","infer-protected","performance","self-test"])
    parser.add_argument("--data-dir",type=Path);parser.add_argument("--output-dir",type=Path);parser.add_argument("--v04-model-dir",type=Path);parser.add_argument("--real-dir",type=Path)
    args=parser.parse_args();config=json.loads(CONFIG.read_text(encoding="utf-8"))
    if config["classOrder"]!=CLASSES:raise ValueError("class order changed")
    if args.mode=="self-test":self_test(config)
    elif args.mode=="train":
        if not args.data_dir or not args.output_dir or not args.v04_model_dir:parser.error("train paths required")
        train(config,args.data_dir,args.output_dir,args.v04_model_dir)
    elif args.mode=="synthetic-test":
        if not args.data_dir or not args.output_dir:parser.error("data/output required")
        synthetic_test(config,args.data_dir,args.output_dir)
    elif args.mode=="infer-protected":
        if not args.real_dir or not args.output_dir:parser.error("real/output required")
        infer_protected(config,args.real_dir,args.output_dir)
    else:
        if not args.data_dir or not args.output_dir:parser.error("data/output required")
        original=v04.CONFIG;v04.CONFIG=CONFIG
        try:v04.performance(config,args.data_dir,args.output_dir)
        finally:v04.CONFIG=original


if __name__=="__main__":main()
