"""Build exact public puzzle counts from the verified local Lichess SQLite catalog.

Usage: python tools/puzzles/build_count_manifest.py --sqlite CATALOG.sqlite3 \
    --output public/data/puzzles/lichess-full-counts.json
"""

import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
import sqlite3


ROOT = Path(__file__).resolve().parents[2]
PREVIEW = ROOT / "public/data/puzzles/lichess-curated-preview.json"
DEFAULT_OUTPUT = ROOT / "public/data/puzzles/lichess-full-counts.json"
DIFFICULTIES = ("easier", "normal", "challenge")
QUALITIES = ("standard", "relaxed")


def count_intersections(categories):
    """Return the bounded intersections needed by specialized catalog clients."""
    phase_tags = categories.get("Phases", ())
    return tuple(
        ("endgame", tag)
        for tag in phase_tags
        if tag != "endgame" and tag.endswith("Endgame")
    )


def rating_bounds(target, difficulty):
    if difficulty == "easier":
        return target - 450, target - 100
    if difficulty == "challenge":
        return target, target + 400
    return target - 200, target + 200


def selected_bounds(target, difficulty):
    minimum, maximum = rating_bounds(target, difficulty)
    first_complete = (minimum + 99) // 100
    last_complete = (maximum - 99) // 100
    if first_complete <= last_complete:
        return max(minimum, first_complete * 100), min(maximum, last_complete * 100 + 99)
    return minimum, maximum


def build_manifest(connection, categories, source_version="2026-09-10"):
    tag_categories = defaultdict(set)
    for category, tags in categories.items():
        for tag in tags:
            tag_categories[tag].add(category)

    intersections = count_intersections(categories)

    # One pass over canonical rows. The category membership is a set, so an
    # All-category count never counts a puzzle twice for overlapping themes.
    histogram = defaultdict(Counter)
    total = 0
    for rating, deviation, popularity, plays, themes in connection.execute(
        "select rating, rating_deviation, popularity, nb_plays, themes from puzzles"
    ):
        total += 1
        tier = 2 if deviation <= 100 and popularity >= 80 and plays >= 500 else (
            1 if deviation <= 100 and popularity >= 80 and plays >= 100 else 0
        )
        tags = set(str(themes).split()) & tag_categories.keys()
        keys = {f"theme:{tag}" for tag in tags}
        keys.update(f"category:{category}" for tag in tags for category in tag_categories[tag])
        keys.update(
            f"intersection:{'+'.join(intersection)}"
            for intersection in intersections
            if set(intersection).issubset(tags)
        )
        for key in keys:
            histogram[(key, tier)][int(rating)] += 1

    result = {}
    for key in [*(f"category:{name}" for name in categories),
                *(f"theme:{tag}" for tags in categories.values() for tag in tags),
                *(f"intersection:{'+'.join(tags)}" for tags in intersections)]:
        tiers = [histogram[(key, tier)] for tier in range(3)]
        counts = {"total": sum(sum(bucket.values()) for bucket in tiers), "ranges": {}}
        for target in range(1200, 2401, 100):
            for difficulty in DIFFICULTIES:
                low, high = selected_bounds(target, difficulty)
                for quality in QUALITIES:
                    first_tier = 2 if quality == "standard" else 1
                    counts["ranges"][f"{target}:{difficulty}:{quality}"] = sum(
                        count for tier in tiers[first_tier:] for rating, count in tier.items()
                        if low <= rating <= high
                    )
        result[key] = counts
    return {"schemaVersion": 1, "sourceVersion": source_version, "puzzles": total, "counts": result}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--expected-count", type=int, default=6_100_952)
    args = parser.parse_args()
    categories = json.loads(PREVIEW.read_text(encoding="utf-8"))["categories"]
    with sqlite3.connect(f"file:{args.sqlite.resolve().as_posix()}?mode=ro", uri=True) as db:
        manifest = build_manifest(db, categories)
    if manifest["puzzles"] != args.expected_count:
        raise SystemExit(f"Unexpected puzzle count: {manifest['puzzles']:,}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(manifest, separators=(",", ":")) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(f"Wrote {args.output} with {manifest['puzzles']:,} puzzles and {len(manifest['counts'])} count keys")


if __name__ == "__main__":
    main()
