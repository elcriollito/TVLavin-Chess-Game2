"""Deterministic v0.4 empty-tile expansion from certified v0.3 RGB64 synthetic data.

The 31 real boards and their pixels are never opened. New pixels are external to Git.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


BASE_PIXELS_SHA = "188AFD2146BBE70B3CA5A6F2D9B2A2A5CC140E73737E092F48E64E1A4E348BE4"
BASE_MANIFEST_SHA = "DCDF1799CC8D25F8D9CEEE6FFCE37FF7214958BA36C27331A48BA0D5EE9AB531"
CATALOG_SHA = "4D71DC062A494DBA8E030FFE31A5FA44522DBDE1C2F0280B1193E8D0B48865CC"
CLASSES = ["empty", "P", "N", "B", "R", "Q", "K", "p", "n", "b", "r", "q", "k"]
SUBTYPES = ["plain", "highlighted", "arrow-overlay", "coordinate-edge", "border", "print-texture",
            "glare", "moire", "compression", "hatched", "ui-overlay", "shadow"]
TILE_BYTES = 64 * 64 * 3


def sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest().upper()


def expanded_empty(source: np.ndarray, subtype: str, seed: int) -> bytes:
    """Bounded 2D background effects; never place any chess-piece silhouette."""
    rng = np.random.default_rng(seed)
    image = Image.fromarray(source)
    if subtype == "plain":
        array = np.asarray(image).astype(np.int16)
        image = Image.fromarray(np.uint8(np.clip((array - 128) * 0.94 + 134, 0, 255)))
    elif subtype == "highlighted":
        layer = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        draw = ImageDraw.Draw(layer)
        draw.rectangle((2, 2, 61, 61), fill=(245, 232, 44, 68))
        draw.ellipse((21, 21, 43, 43), outline=(252, 232, 40, 155), width=3)
        image = Image.alpha_composite(image.convert("RGBA"), layer).convert("RGB")
    elif subtype == "arrow-overlay":
        layer = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        draw = ImageDraw.Draw(layer)
        draw.line((8, 51, 49, 13), fill=(32, 165, 82, 175), width=6)
        draw.polygon([(49, 13), (34, 16), (49, 29)], fill=(32, 165, 82, 175))
        image = Image.alpha_composite(image.convert("RGBA"), layer).convert("RGB")
    elif subtype == "coordinate-edge":
        draw = ImageDraw.Draw(image)
        draw.rectangle((0, 49, 19, 63), fill=(40, 42, 45))
        draw.text((3, 50), "a1", fill=(248, 246, 233))
    elif subtype == "border":
        draw = ImageDraw.Draw(image)
        draw.line((0, 0, 63, 0), fill=(23, 25, 30), width=4)
        draw.line((0, 0, 0, 63), fill=(23, 25, 30), width=4)
        draw.line((0, 63, 63, 63), fill=(214, 211, 204), width=2)
    elif subtype == "print-texture":
        array = np.asarray(image).astype(np.int16)
        gray = (array[..., 0] * 30 + array[..., 1] * 59 + array[..., 2] * 11) // 100
        noise = rng.normal(0, 8, (64, 64))
        gray = np.uint8(np.clip(gray + noise, 0, 255))
        image = Image.fromarray(np.stack([gray, gray, gray], axis=2))
    elif subtype == "glare":
        array = np.asarray(image).astype(np.float32)
        yy, xx = np.indices((64, 64))
        band = np.maximum(0, 1 - np.abs(xx + yy * 0.42 - 42) / 17)[..., None]
        image = Image.fromarray(np.uint8(np.clip(array + band * 57, 0, 255)))
    elif subtype == "moire":
        array = np.asarray(image).astype(np.float32)
        yy, xx = np.indices((64, 64))
        waves = (np.sin(xx * 0.56 + yy * 0.31) * 8 + np.sin(yy * 1.3) * 4)[..., None]
        image = Image.fromarray(np.uint8(np.clip(array + waves, 0, 255)))
    elif subtype == "compression":
        compressed = io.BytesIO()
        image.save(compressed, format="JPEG", quality=48, subsampling=2)
        image = Image.open(io.BytesIO(compressed.getvalue())).convert("RGB")
    elif subtype == "hatched":
        array = np.asarray(image).astype(np.float32)
        yy, xx = np.indices((64, 64))
        lines = ((xx + yy) % 8 == 0)[..., None]
        image = Image.fromarray(np.uint8(np.clip(array * (1 - lines * 0.25), 0, 255)))
    elif subtype == "ui-overlay":
        layer = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        draw = ImageDraw.Draw(layer)
        draw.rounded_rectangle((2, 2, 37, 15), radius=3, fill=(20, 28, 39, 150))
        draw.line((7, 9, 29, 9), fill=(244, 246, 247, 190), width=2)
        image = Image.alpha_composite(image.convert("RGBA"), layer).convert("RGB")
    elif subtype == "shadow":
        array = np.asarray(image).astype(np.float32)
        yy, xx = np.indices((64, 64))
        shade = np.clip((xx + yy - 35) / 82, 0, 0.42)[..., None]
        image = Image.fromarray(np.uint8(np.clip(array * (1 - shade), 0, 255)))
    else:
        raise ValueError(f"unknown empty subtype {subtype}")
    result = image.tobytes()
    if len(result) != TILE_BYTES:
        raise ValueError("RGB64 contract changed")
    return result


def build(source_dir: Path, output_dir: Path) -> None:
    if output_dir.exists():
        raise ValueError("new output directory required")
    metadata_path = source_dir / "synthetic-rgb64.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    binary = source_dir / "synthetic-rgb64.bin"
    if (metadata["sourceManifestSha256"] != BASE_MANIFEST_SHA or metadata["catalogSha256"] != CATALOG_SHA
        or metadata["pixelsSha256"] != BASE_PIXELS_SHA or sha(binary) != BASE_PIXELS_SHA
        or metadata["shape"] != [5280, 64, 64, 3] or metadata["realEvaluationTilesIncluded"] != 0
        or metadata["classOrder"] != CLASSES or len(metadata["records"]) != 5280):
        raise ValueError("v0.3 synthetic source is not certified")
    source = np.memmap(binary, dtype=np.uint8, mode="r", shape=(5280, 64, 64, 3))
    original = metadata["records"]
    by_family = defaultdict(list)
    for item in original:
        by_family[(item["split"], item["pieceSetId"])].append(item)
    if len(by_family) != 11 or any(len(rows) != 480 for rows in by_family.values()):
        raise ValueError("whole-family source split changed")
    output_dir.mkdir(parents=True)
    out_binary = output_dir / "synthetic-rgb64-v04.bin"
    digest = hashlib.sha256()
    records = [dict(item, sourceDatasetVersion="v0.3", emptySubtype="base" if item["classIndex"] == 0 else None,
                    hardNegative=False) for item in original]
    with out_binary.open("xb") as out, binary.open("rb") as source_stream:
        for block in iter(lambda: source_stream.read(1024 * 1024), b""):
            out.write(block); digest.update(block)
        index = 5280
        for (split, family), rows in sorted(by_family.items()):
            empty = sorted((item for item in rows if item["classIndex"] == 0), key=lambda item: item["sampleId"])
            if len(empty) != 240:
                raise ValueError("source family empty count changed")
            for position, item in enumerate(empty):
                subtype = SUBTYPES[position % len(SUBTYPES)]
                seed = int(hashlib.sha256(f"v04/307/{item['sampleId']}/{subtype}".encode()).hexdigest()[:16], 16)
                pixels = expanded_empty(source[item["index"]], subtype, seed)
                out.write(pixels); digest.update(pixels)
                records.append({**item, "index": index, "sampleId": f"{item['sampleId']}--v04-{subtype}",
                                "sourceSampleId": item["sampleId"], "sourceDatasetVersion": "v0.4",
                                "emptySubtype": subtype, "hardNegative": subtype != "plain",
                                "augmentationId": f"v04-{subtype}"})
                index += 1
    if index != 7920 or out_binary.stat().st_size != index * TILE_BYTES:
        raise ValueError("expanded dataset count/length failed")
    count = Counter((item["split"], item["classLabel"]) for item in records)
    if ([sum(1 for item in records if item["split"] == part) for part in ("train", "validation", "test")]
        != [5040, 1440, 1440] or len(set(item["sampleId"] for item in records)) != index):
        raise ValueError("split leakage or count failure")
    result = {"schemaVersion": "caissa-scanner-piece-dataset-rgb64/4", "datasetVersion": "scanner-piece-dataset-v0.4",
              "seed": 307, "sourceManifestSha256": BASE_MANIFEST_SHA, "sourcePixelsSha256": BASE_PIXELS_SHA,
              "catalogSha256": CATALOG_SHA, "classOrder": CLASSES, "shape": [index, 64, 64, 3],
              "pixelsSha256": digest.hexdigest().upper(), "realEvaluationTilesIncluded": 0,
              "splitCounts": {part: sum(1 for item in records if item["split"] == part)
                              for part in ("train", "validation", "test")},
              "emptySubtypes": SUBTYPES, "additionalEmptyTiles": 2640,
              "hardNegativeTiles": sum(item["hardNegative"] for item in records),
              "classCountsBySplit": {part: {label: count[(part, label)] for label in CLASSES}
                                     for part in ("train", "validation", "test")},
              "policy": "one extra deterministic empty variant per certified v0.3 empty tile; no new occupied labels, source families, or real pixels",
              "records": records}
    meta_path = output_dir / "synthetic-rgb64-v04.json"
    meta_path.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"metadataSha256": sha(meta_path), "pixelsSha256": result["pixelsSha256"],
                      "splitCounts": result["splitCounts"], "hardNegativeTiles": result["hardNegativeTiles"]}, indent=2))


def self_test() -> None:
    yy, xx = np.indices((64, 64))
    source = np.stack((80 + xx, 110 + yy, 90 + (xx + yy) // 2), axis=2).astype(np.uint8)
    seen = set()
    for subtype in SUBTYPES:
        first = expanded_empty(source, subtype, 307)
        second = expanded_empty(source, subtype, 307)
        assert first == second and len(first) == TILE_BYTES and first != source.tobytes()
        seen.add(hashlib.sha256(first).hexdigest())
    assert len(seen) == len(SUBTYPES)
    print("v0.4 empty-subtype determinism self-test passed")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
    elif args.source_dir and args.output_dir:
        build(args.source_dir, args.output_dir)
    else:
        parser.error("provide --source-dir and --output-dir or --self-test")
