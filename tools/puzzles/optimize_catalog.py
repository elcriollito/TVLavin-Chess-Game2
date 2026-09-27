#!/usr/bin/env python3
"""Add the current CAISSA training-selection indexes to an existing catalog."""

from __future__ import annotations

import argparse
import json
import sqlite3
import time
from pathlib import Path


INDEXES = {
    "puzzles_training_standard_idx": """create index if not exists puzzles_training_standard_idx
      on puzzles(rating, popularity desc, nb_plays desc, puzzle_id)
      where rating_deviation <= 100 and popularity >= 80 and nb_plays >= 500""",
    "puzzles_training_relaxed_idx": """create index if not exists puzzles_training_relaxed_idx
      on puzzles(rating, popularity desc, nb_plays desc, puzzle_id)
      where rating_deviation <= 100 and popularity >= 80 and nb_plays >= 100""",
    "puzzles_training_equality_idx": """create index if not exists puzzles_training_equality_idx
      on puzzles(rating, popularity desc, nb_plays desc, puzzle_id)
      where rating_deviation <= 100 and popularity >= 80 and nb_plays >= 100
        and instr(' ' || themes || ' ', ' equality ') > 0""",
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path)
    args = parser.parse_args()
    if not args.database.is_file():
        parser.error(f"database does not exist: {args.database}")
    before = args.database.stat().st_size
    started = time.perf_counter()
    connection = sqlite3.connect(args.database)
    try:
        for statement in INDEXES.values():
            connection.execute(statement)
        connection.execute("analyze")
        connection.commit()
        integrity = connection.execute("pragma quick_check").fetchone()[0]
        names = [row[0] for row in connection.execute(
            "select name from sqlite_schema where type='index' and name in (?,?,?) order by name",
            tuple(INDEXES),
        )]
    finally:
        connection.close()
    print(json.dumps({
        "indexes": names,
        "quickCheck": integrity,
        "bytesBefore": before,
        "bytesAfter": args.database.stat().st_size,
        "seconds": round(time.perf_counter() - started, 3),
    }, indent=2))
    return 0 if integrity == "ok" and names == sorted(INDEXES) else 1


if __name__ == "__main__":
    raise SystemExit(main())
