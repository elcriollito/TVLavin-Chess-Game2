#!/usr/bin/env python3
"""Stream the local SQLite puzzle catalog as PostgreSQL COPY-compatible CSV."""

from __future__ import annotations

import argparse
import csv
import sqlite3
import sys
from pathlib import Path


COPY_COLUMNS = [
    "puzzle_id",
    "fen",
    "moves",
    "rating",
    "rating_deviation",
    "popularity",
    "nb_plays",
    "themes",
    "game_url",
    "opening_tags",
    "daily_date",
    "source_version",
]


def pg_array(value: str) -> str:
    tags = value.split()
    return "{" + ",".join('"' + tag.replace('\\', '\\\\').replace('"', '\\"') + '"' for tag in tags) + "}"


def export(database: Path, source_version: str, output) -> int:
    connection = sqlite3.connect(f"file:{database.resolve()}?mode=ro", uri=True)
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(COPY_COLUMNS)
    count = 0
    try:
        cursor = connection.execute(
            """select puzzle_id, fen, moves, rating, rating_deviation, popularity,
                      nb_plays, themes, game_url, opening_tags, daily_date
               from puzzles order by puzzle_id"""
        )
        for row in cursor:
            writer.writerow(
                [
                    *row[:7],
                    pg_array(row[7]),
                    row[8],
                    pg_array(row[9]),
                    row[10] or None,
                    source_version,
                ]
            )
            count += 1
    finally:
        connection.close()
    return count


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path)
    parser.add_argument("--source-version", required=True)
    args = parser.parse_args()
    export(args.database, args.source_version, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
