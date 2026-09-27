#!/usr/bin/env python3
"""Benchmark representative indexed selections against the local SQLite catalog."""

from __future__ import annotations

import argparse
import json
import sqlite3
import statistics
import time
from pathlib import Path


CASES = {
    "theme_fork_1700_1900": (
        """select p.puzzle_id, p.fen, p.moves, p.rating, p.themes
             from puzzle_themes t join puzzles p on p.puzzle_id = t.puzzle_id
            where t.theme = ? and p.rating between ? and ?
              and p.rating_deviation <= 100 and p.popularity >= 80 and p.nb_plays >= 500
            order by p.rating, p.popularity desc, p.nb_plays desc, p.puzzle_id limit 12""",
        ("fork", 1700, 1900),
    ),
    "opening_sicilian_1700_1900": (
        """select p.puzzle_id, p.fen, p.moves, p.rating, p.opening_tags
             from puzzle_openings o join puzzles p on p.puzzle_id = o.puzzle_id
            where o.opening_tag = ? and p.rating between ? and ?
              and p.rating_deviation <= 100 and p.popularity >= 80 and p.nb_plays >= 500
            order by p.rating, p.popularity desc, p.nb_plays desc, p.puzzle_id limit 12""",
        ("Sicilian_Defense", 1700, 1900),
    ),
    "goal_equality_1700_2100": (
        """select p.puzzle_id, p.fen, p.moves, p.rating, p.themes
             from puzzles p
            where instr(' ' || p.themes || ' ', ' equality ') > 0 and p.rating between ? and ?
              and p.rating_deviation <= 100 and p.popularity >= 80 and p.nb_plays >= 100
            order by p.rating, p.popularity desc, p.nb_plays desc, p.puzzle_id limit 12""",
        (1700, 2100),
    ),
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path)
    parser.add_argument("--runs", type=int, default=7)
    parser.add_argument("--plan-only", action="store_true")
    parser.add_argument("--case", choices=sorted(CASES))
    args = parser.parse_args()
    if not args.database.is_file():
        parser.error(f"database does not exist: {args.database}")
    if not 1 <= args.runs <= 100:
        parser.error("runs must be between 1 and 100")

    connection = sqlite3.connect(f"file:{args.database.resolve()}?mode=ro", uri=True)
    connection.execute("pragma query_only = on")
    report = {"schemaVersion": 1, "database": args.database.name, "runs": args.runs, "cases": {}}
    try:
        selected_cases = {args.case: CASES[args.case]} if args.case else CASES
        for name, (sql, parameters) in selected_cases.items():
            plan = [row[3] for row in connection.execute("explain query plan " + sql, parameters)]
            if args.plan_only:
                report["cases"][name] = {"rows": None, "milliseconds": None, "plan": plan}
                continue
            durations = []
            rows = []
            for _ in range(args.runs):
                started = time.perf_counter()
                rows = connection.execute(sql, parameters).fetchall()
                durations.append((time.perf_counter() - started) * 1000)
            report["cases"][name] = {
                "rows": len(rows),
                "milliseconds": {
                    "minimum": round(min(durations), 3),
                    "median": round(statistics.median(durations), 3),
                    "maximum": round(max(durations), 3),
                },
                "plan": plan,
            }
    finally:
        connection.close()
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
