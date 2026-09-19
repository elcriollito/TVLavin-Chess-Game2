"""Internal-only frozen v0.5 inference. Reads one JSON request from stdin."""
from __future__ import annotations

import base64
import hashlib
import json
import os
import sys
from pathlib import Path

import numpy as np
import torch
from torch.nn import functional as F

CLASSES = ["empty", "P", "N", "B", "R", "Q", "K", "p", "n", "b", "r", "q", "k"]
MODEL_VERSION = "caissa-piece-classifier-v0.5-occupancy-recovery"
STATE_SHA = "90D06A3C1AAC934188CBA5EEB4B68D51AC64C815351BFE372F2215101DD7209E"
TORCHSCRIPT_SHA = "8025AA0F8455BE582AB718A70BC75C1CE4A583852DA4A3A8E540FEF035EE9801"
THRESHOLD = 0.99


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def model_directory() -> Path:
    configured = os.environ.get("CAISSA_SCANNER_BETA_MODEL_DIR")
    if configured:
        return Path(configured).resolve()
    return (Path(__file__).resolve().parents[3] / "caissa" / "_scanner" / "_model_artifacts" / "phase3-007e-v0.5-final1").resolve()


def fen(labels: list[str]) -> str:
    ranks = []
    for start in range(0, 64, 8):
        output, empty = "", 0
        for label in labels[start:start + 8]:
            if label == "empty":
                empty += 1
            else:
                if empty:
                    output += str(empty)
                output += label
                empty = 0
        if empty:
            output += str(empty)
        ranks.append(output)
    return "/".join(ranks) + " w - - 0 1"


def main() -> None:
    request = json.load(sys.stdin)
    orientation = request.get("orientation")
    if orientation not in ("white-at-bottom", "black-at-bottom"):
        raise ValueError("ORIENTATION_INVALID")
    raw = base64.b64decode(request.get("boardRgbaBase64", ""), validate=True)
    if len(raw) != 512 * 512 * 4:
        raise ValueError("RECTIFIED_BOARD_INVALID")
    directory = model_directory()
    state, traced = directory / "frozen-state.pt", directory / "frozen-torchscript.pt"
    if digest(state) != STATE_SHA or digest(traced) != TORCHSCRIPT_SHA:
        raise ValueError("FROZEN_MODEL_CHECKSUM_MISMATCH")
    rgba = np.frombuffer(raw, dtype=np.uint8).reshape(512, 512, 4)
    visual_tiles = [rgba[row * 64:(row + 1) * 64, col * 64:(col + 1) * 64, :3]
                    for row in range(8) for col in range(8)]
    tiles = [None] * 64
    for image_index, tile in enumerate(visual_tiles):
        canonical = 63 - image_index if orientation == "black-at-bottom" else image_index
        tiles[canonical] = tile
    value = torch.from_numpy(np.stack(tiles).copy()).permute(0, 3, 1, 2).float().div(255)
    model = torch.jit.load(str(traced), map_location="cpu")
    model.eval()
    with torch.inference_mode():
        occupancy_logits, color_logits, type_logits, king_logits = model(value)
        occupancy = F.softmax(occupancy_logits, dim=1)
        color = F.softmax(color_logits, dim=1)
        piece_type = F.softmax(type_logits, dim=1)
        king = F.softmax(king_logits, dim=1)[:, 1]
        occupied = occupancy[:, 1]
        probability = torch.cat((occupancy[:, :1],
                                 occupied[:, None] * color[:, :1] * piece_type,
                                 occupied[:, None] * color[:, 1:] * piece_type), dim=1)
        identity = probability[:, 1:].argmax(1) + 1
        predicted = torch.where(occupied >= THRESHOLD, identity, torch.zeros_like(identity))
    labels = [CLASSES[index] for index in predicted.tolist()]
    rows = []
    for index, class_index in enumerate(predicted.tolist()):
        rows.append({
            "square": chr(97 + index % 8) + str(8 - index // 8),
            "predictedClass": CLASSES[class_index],
            "confidence": float(probability[index, class_index]),
            "occupancyProbability": float(occupied[index]),
            "colorProbabilities": [float(value) for value in color[index]],
            "pieceTypeProbabilities": [float(value) for value in piece_type[index]],
            "kingAuxiliaryProbability": float(king[index])
        })
    json.dump({
        "modelVersion": MODEL_VERSION,
        "modelChecksum": STATE_SHA,
        "occupancyThreshold": THRESHOLD,
        "classOrder": CLASSES,
        "preprocessing": "RGB64 uint8 / 255",
        "predictedFEN": fen(labels),
        "squarePredictions": rows
    }, sys.stdout, separators=(",", ":"), allow_nan=False)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # Fail closed without leaking paths.
        json.dump({"error": str(error)}, sys.stdout)
        sys.exit(1)
