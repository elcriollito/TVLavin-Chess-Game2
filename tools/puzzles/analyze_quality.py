#!/usr/bin/env python3
"""Measure quality and duplication signals in the local Lichess puzzle catalog."""

from __future__ import annotations

import argparse
import hashlib
import heapq
import json
import sqlite3
import time
from collections import Counter
from pathlib import Path


def bucket(value: int, limits: list[tuple[int, str]], fallback: str) -> str:
    for maximum, label in limits:
        if value <= maximum:
            return label
    return fallback


def duplicate_summary(connection: sqlite3.Connection, minimum: int, maximum: int, columns: str) -> dict[str, int]:
    groups, extras = connection.execute(
        f"""select count(*), coalesce(sum(c - 1), 0)
              from (
                select count(*) as c
                  from puzzles
                 where rating between ? and ?
                 group by {columns}
                having count(*) > 1
              )""",
        (minimum, maximum),
    ).fetchone()
    return {"groups": groups, "extraRows": extras}


def analyze(database: Path, minimum: int, maximum: int, sample_size: int) -> tuple[dict[str, object], list[dict[str, str]]]:
    connection = sqlite3.connect(f"file:{database.resolve()}?mode=ro", uri=True)
    connection.execute("pragma query_only = on")
    started = time.perf_counter()
    total = connection.execute("select count(*) from puzzles").fetchone()[0]
    target = connection.execute(
        "select count(*) from puzzles where rating between ? and ?", (minimum, maximum)
    ).fetchone()[0]

    ratings: Counter[str] = Counter()
    deviations: Counter[str] = Counter()
    popularities: Counter[str] = Counter()
    plays: Counter[str] = Counter()
    sequence_lengths: Counter[str] = Counter()
    themes: Counter[str] = Counter()
    openings = 0
    duplicate_theme_tokens = 0
    standard_quality = 0
    equality_quality = 0
    sums = Counter()
    sample_heap: list[tuple[int, str, dict[str, str]]] = []

    rows = connection.execute(
        """select puzzle_id, fen, moves, rating, rating_deviation, popularity,
                  nb_plays, themes, game_url, opening_tags, daily_date
             from puzzles
            where rating between ? and ?
            order by puzzle_id""",
        (minimum, maximum),
    )
    for row in rows:
        puzzle_id, fen, moves_text, rating, deviation, popularity, play_count, theme_text, game_url, opening_tags, daily_date = row
        rating_floor = rating - (rating % 100)
        ratings[f"{rating_floor}-{rating_floor + 99}"] += 1
        deviations[bucket(deviation, [(50, "0-50"), (75, "51-75"), (100, "76-100"), (150, "101-150")], "151+")] += 1
        popularities[bucket(popularity, [(-1, "negative"), (49, "0-49"), (79, "50-79"), (89, "80-89")], "90-100")] += 1
        plays[bucket(play_count, [(99, "0-99"), (499, "100-499"), (999, "500-999"), (4999, "1000-4999")], "5000+")] += 1
        move_count = len(moves_text.split())
        sequence_lengths[str(move_count) if move_count <= 5 else "6+"] += 1
        tag_list = theme_text.split()
        themes.update(set(tag_list))
        duplicate_theme_tokens += len(tag_list) - len(set(tag_list))
        openings += bool(opening_tags)
        sums.update({"rating": rating, "deviation": deviation, "popularity": popularity, "plays": play_count})
        if deviation <= 100 and popularity >= 80 and play_count >= 500:
            standard_quality += 1
        if "equality" in tag_list and deviation <= 100 and popularity >= 80 and play_count >= 100:
            equality_quality += 1

        score = int.from_bytes(hashlib.sha256(puzzle_id.encode("ascii")).digest()[:8], "big")
        sample_row = {
            "PuzzleId": puzzle_id,
            "FEN": fen,
            "Moves": moves_text,
            "Rating": str(rating),
            "RatingDeviation": str(deviation),
            "Popularity": str(popularity),
            "NbPlays": str(play_count),
            "Themes": theme_text,
            "GameUrl": game_url,
            "OpeningTags": opening_tags,
            "DailyDate": daily_date,
        }
        item = (-score, puzzle_id, sample_row)
        if len(sample_heap) < sample_size:
            heapq.heappush(sample_heap, item)
        elif item[0] > sample_heap[0][0]:
            heapq.heapreplace(sample_heap, item)

    duplicate_started = time.perf_counter()
    duplicate_fens = duplicate_summary(connection, minimum, maximum, "fen")
    duplicate_sequences = duplicate_summary(connection, minimum, maximum, "fen, moves")
    duplicate_seconds = time.perf_counter() - duplicate_started
    connection.close()

    sample = [entry for _, _, entry in sorted(sample_heap, key=lambda value: (-value[0], value[1]))]
    divisor = max(target, 1)
    report: dict[str, object] = {
        "schemaVersion": 1,
        "database": database.name,
        "ratingRange": {"minimum": minimum, "maximum": maximum},
        "catalogCount": total,
        "targetCount": target,
        "targetShare": round(target / max(total, 1), 6),
        "averages": {name: round(value / divisor, 2) for name, value in sums.items()},
        "ratingBuckets": dict(sorted(ratings.items())),
        "ratingDeviationBuckets": dict(deviations),
        "popularityBuckets": dict(popularities),
        "playCountBuckets": dict(plays),
        "solutionMoveCounts": dict(sorted(sequence_lengths.items())),
        "topThemes": dict(themes.most_common(30)),
        "openingTagged": openings,
        "qualityGate": {
            "standard": {
                "criteria": "rating deviation <= 100, popularity >= 80, plays >= 500",
                "count": standard_quality,
            },
            "equality": {
                "criteria": "equality, rating deviation <= 100, popularity >= 80, plays >= 100",
                "count": equality_quality,
            },
        },
        "duplicates": {
            "repeatedThemeTokens": duplicate_theme_tokens,
            "exactFen": duplicate_fens,
            "exactFenAndMoves": duplicate_sequences,
        },
        "legalSampleSize": len(sample),
        "timingsSeconds": {
            "duplicates": round(duplicate_seconds, 3),
            "total": round(time.perf_counter() - started, 3),
        },
    }
    return report, sample


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path)
    parser.add_argument("--rating-min", type=int, default=1700)
    parser.add_argument("--rating-max", type=int, default=2100)
    parser.add_argument("--sample-size", type=int, default=2048)
    parser.add_argument("--sample-out", type=Path)
    args = parser.parse_args()
    if not args.database.is_file():
        parser.error(f"database does not exist: {args.database}")
    if not 1 <= args.rating_min <= args.rating_max <= 5000:
        parser.error("rating range must be between 1 and 5000")
    if not 1 <= args.sample_size <= 10_000:
        parser.error("sample size must be between 1 and 10000")

    report, sample = analyze(args.database, args.rating_min, args.rating_max, args.sample_size)
    if args.sample_out:
        args.sample_out.parent.mkdir(parents=True, exist_ok=True)
        args.sample_out.write_text(
            json.dumps({"columns": list(sample[0]) if sample else [], "puzzles": sample}, indent=2) + "\n",
            encoding="utf-8",
        )
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
