#!/usr/bin/env python3
"""Build a small, reproducible CAISSA practice pool from Lichess's CC0 CSV.

Usage: zstd -dc lichess_db_puzzle.csv.zst | python3 scripts/build-puzzle-preview.py
The full upstream export is deliberately never included in the web bundle.
"""

import csv
import hashlib
import heapq
import json
import math
import sys
from pathlib import Path

THEMES = {
    "Phases": ["opening", "middlegame", "endgame", "rookEndgame", "bishopEndgame", "pawnEndgame", "knightEndgame", "queenEndgame"],
    "Motifs": ["fork", "pin", "skewer", "sacrifice", "discoveredAttack", "hangingPiece", "trappedPiece", "intermezzo"],
    "Advanced": ["deflection", "attraction", "clearance", "interference", "quietMove", "xRayAttack", "zugzwang", "defensiveMove"],
    "Mates": ["mateIn1", "mateIn2", "mateIn3", "mateIn4", "mateIn5"],
    "Mate themes": ["backRankMate", "smotheredMate", "anastasiaMate", "arabianMate", "bodenMate", "hookMate", "dovetailMate", "operaMate"],
    "Special moves": ["castling", "enPassant", "promotion", "underPromotion"],
    "Lengths": ["oneMove", "short", "long", "veryLong"],
    "Origin": ["master", "masterVsMaster", "superGM"],
}

BANDS = [(1200, 1599), (1600, 1799), (1800, 1999), (2000, 2199), (2200, 2400)]
PER_BUCKET = 8


def main():
    buckets = {}
    tags = set(sum(THEMES.values(), []))
    reader = csv.DictReader(sys.stdin)
    expected = {"PuzzleId", "FEN", "Moves", "Rating", "RatingDeviation", "Popularity", "NbPlays", "Themes", "GameUrl"}
    if not expected.issubset(reader.fieldnames or []):
        raise SystemExit("Unsupported Lichess puzzle CSV columns")
    for row in reader:
        try:
            rating = int(row["Rating"])
            deviation = int(row["RatingDeviation"])
            popularity = int(row["Popularity"])
            plays = int(row["NbPlays"])
        except (ValueError, TypeError):
            continue
        if not (1200 <= rating <= 2400 and deviation <= 100 and popularity >= 80 and plays >= 500):
            continue
        present = tags.intersection(row["Themes"].split())
        if not present or len(row["Moves"].split()) < 2:
            continue
        band = next(i for i, (lo, hi) in enumerate(BANDS) if lo <= rating <= hi)
        stable = int.from_bytes(hashlib.sha256(row["PuzzleId"].encode()).digest()[:4], "big")
        quality = round(popularity * 2 + min(30, math.log2(plays)) - deviation * .12, 3)
        item = {
            "id": row["PuzzleId"], "fen": row["FEN"], "moves": row["Moves"],
            "rating": rating, "deviation": deviation, "popularity": popularity,
            "plays": plays, "themes": row["Themes"].split(), "gameUrl": row["GameUrl"],
        }
        for tag in present:
            key = (tag, band)
            heap = buckets.setdefault(key, [])
            entry = (quality, stable, item)
            if len(heap) < PER_BUCKET:
                heapq.heappush(heap, entry)
            elif entry[:2] > heap[0][:2]:
                heapq.heapreplace(heap, entry)
    selected = {entry[2]["id"]: entry[2] for heap in buckets.values() for entry in heap}
    output = Path("public/data/puzzles/lichess-curated-preview.json")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({
        "source": "Lichess Open Database puzzles (CC0)",
        "sourceUrl": "https://database.lichess.org/#puzzles",
        "selection": "rating 1200–2400; deviation ≤100; popularity ≥80; plays ≥500; top eight per tag and band",
        "categories": THEMES,
        "puzzles": sorted(selected.values(), key=lambda p: p["id"]),
    }, separators=(",", ":")) + "\n")
    print(f"Wrote {len(selected)} puzzles to {output}")
    for category, names in THEMES.items():
        available = [name for name in names if any((name, band) in buckets for band in range(len(BANDS)))]
        print(f"{category}: {', '.join(available)}")


if __name__ == "__main__":
    main()
