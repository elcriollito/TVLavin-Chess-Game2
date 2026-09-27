#!/usr/bin/env python3
"""Build and benchmark a disposable D1-compatible puzzle selection index.

The trial reads the verified catalog without modifying it, materializes only
three representative pools in a temporary SQLite database, benchmarks the
cursor plan, and removes the database unless ``--keep`` is supplied. SQLite is
used because D1 implements SQLite semantics; this does not claim remote D1
network latency or billing-row measurements.
"""

from __future__ import annotations

import argparse
import hashlib
import heapq
import json
import sqlite3
import statistics
import tempfile
import time
from pathlib import Path


CASES = {
    "theme_fork_1700_1900": {
        "dimension": "theme",
        "lookup_table": "puzzle_themes",
        "lookup_column": "theme",
        "tag": "fork",
        "minimum": 1700,
        "maximum": 1900,
        "minimum_plays": 500,
    },
    "opening_sicilian_1700_1900": {
        "dimension": "opening",
        "lookup_table": "puzzle_openings",
        "lookup_column": "opening_tag",
        "tag": "Sicilian_Defense",
        "minimum": 1700,
        "maximum": 1900,
        "minimum_plays": 500,
    },
    "goal_equality_1700_2100": {
        "dimension": "theme",
        "lookup_table": "puzzle_themes",
        "lookup_column": "theme",
        "tag": "equality",
        "minimum": 1700,
        "maximum": 2100,
        "minimum_plays": 100,
    },
}


def quality_tier(deviation: int, popularity: int, plays: int) -> int:
    """Return 2 for standard, 1 for relaxed-only, and 0 otherwise."""
    if deviation <= 100 and popularity >= 80 and plays >= 500:
        return 2
    if deviation <= 100 and popularity >= 80 and plays >= 100:
        return 1
    return 0


def shuffle_key(puzzle_id: str) -> int:
    """Stable 48-bit key that is exactly representable by JavaScript."""
    return int.from_bytes(hashlib.sha256(puzzle_id.encode("ascii")).digest()[:6], "big")


def pool_key(dimension: str, tag: str, tier: int, rating_bucket: int) -> str:
    return f"{dimension}:{tag}:q{tier}:b{rating_bucket}"


def create_trial_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        pragma journal_mode = off;
        pragma synchronous = off;
        create table puzzles (
          puzzle_id text primary key,
          fen text not null,
          moves text not null,
          rating integer not null,
          rating_deviation integer not null,
          popularity integer not null,
          nb_plays integer not null,
          themes text not null,
          game_url text not null,
          opening_tags text not null
        ) without rowid;
        create table puzzle_pool_entries (
          pool_key text not null,
          shuffle_key integer not null,
          puzzle_id text not null,
          rating integer not null,
          primary key (pool_key, shuffle_key, puzzle_id)
        ) without rowid;
        create table puzzle_pool_counts (
          pool_key text primary key,
          entry_count integer not null
        ) without rowid;
        """
    )


def source_rows(source: sqlite3.Connection, case: dict[str, object]) -> list[tuple[object, ...]]:
    table = str(case["lookup_table"])
    column = str(case["lookup_column"])
    # Table and column names are selected only from the constant CASES map.
    sql = f"""
        select p.puzzle_id, p.fen, p.moves, p.rating, p.rating_deviation,
               p.popularity, p.nb_plays, p.themes, p.game_url, p.opening_tags
          from {table} l join puzzles p on p.puzzle_id = l.puzzle_id
         where l.{column} = ? and p.rating between ? and ?
           and p.rating_deviation <= 100 and p.popularity >= 80
           and p.nb_plays >= ?
    """
    return source.execute(
        sql,
        (case["tag"], case["minimum"], case["maximum"], case["minimum_plays"]),
    ).fetchall()


def populate_trial(source: sqlite3.Connection, trial: sqlite3.Connection) -> dict[str, int]:
    canonical: dict[str, tuple[object, ...]] = {}
    entries: dict[tuple[str, int, str, int], None] = {}
    case_counts: dict[str, int] = {}
    for name, case in CASES.items():
        rows = source_rows(source, case)
        case_counts[name] = len(rows)
        for row in rows:
            puzzle_id = str(row[0])
            canonical[puzzle_id] = row
            tier = quality_tier(int(row[4]), int(row[5]), int(row[6]))
            key = pool_key(str(case["dimension"]), str(case["tag"]), tier, int(row[3]) // 100)
            entries[(key, shuffle_key(puzzle_id), puzzle_id, int(row[3]))] = None

    trial.executemany("insert into puzzles values (?,?,?,?,?,?,?,?,?,?)", canonical.values())
    trial.executemany("insert into puzzle_pool_entries values (?,?,?,?)", entries.keys())
    trial.execute(
        "insert into puzzle_pool_counts select pool_key, count(*) from puzzle_pool_entries group by pool_key"
    )
    trial.commit()
    trial.execute("analyze")
    return {
        **case_counts,
        "canonical_rows": len(canonical),
        "pool_entries": len(entries),
    }


def eligible_pool_keys(case: dict[str, object]) -> list[str]:
    tiers = (2,) if int(case["minimum_plays"]) >= 500 else (1, 2)
    buckets = range(int(case["minimum"]) // 100, int(case["maximum"]) // 100 + 1)
    return [
        pool_key(str(case["dimension"]), str(case["tag"]), tier, bucket)
        for tier in tiers
        for bucket in buckets
    ]


POOL_QUERY = """
    select shuffle_key, puzzle_id
      from puzzle_pool_entries
     where pool_key = ?
       and (shuffle_key, puzzle_id) > (?, ?)
       and rating between ? and ?
     order by shuffle_key, puzzle_id
     limit ?
"""


def select_page(
    connection: sqlite3.Connection,
    case: dict[str, object],
    after_key: int = -1,
    after_id: str = "",
    limit: int = 12,
) -> tuple[list[tuple[object, ...]], int]:
    candidates: list[tuple[int, str]] = []
    scanned = 0
    for key in eligible_pool_keys(case):
        rows = connection.execute(
            POOL_QUERY,
            (key, after_key, after_id, case["minimum"], case["maximum"], limit),
        ).fetchall()
        scanned += len(rows)
        candidates.extend((int(row[0]), str(row[1])) for row in rows)

    chosen: list[tuple[int, str]] = []
    seen: set[str] = set()
    for candidate in heapq.nsmallest(len(candidates), candidates):
        if candidate[1] in seen:
            continue
        seen.add(candidate[1])
        chosen.append(candidate)
        if len(chosen) == limit:
            break
    if not chosen:
        return [], scanned

    placeholders = ",".join("?" for _ in chosen)
    by_id = {
        row[0]: row
        for row in connection.execute(
            f"select * from puzzles where puzzle_id in ({placeholders})",
            [item[1] for item in chosen],
        )
    }
    return [by_id[item[1]] for item in chosen], scanned


def benchmark(connection: sqlite3.Connection, runs: int) -> dict[str, object]:
    result: dict[str, object] = {}
    for name, case in CASES.items():
        durations: list[float] = []
        rows: list[tuple[object, ...]] = []
        scanned = 0
        for _ in range(runs):
            started = time.perf_counter()
            rows, scanned = select_page(connection, case)
            durations.append((time.perf_counter() - started) * 1000)
        plans = sorted({
            row[3]
            for key in eligible_pool_keys(case)
            for row in connection.execute(
                "explain query plan " + POOL_QUERY,
                (key, -1, "", case["minimum"], case["maximum"], 12),
            )
        })
        result[name] = {
            "rows": len(rows),
            "candidateRowsReturnedToMerger": scanned,
            "poolQueries": len(eligible_pool_keys(case)),
            "milliseconds": {
                "minimum": round(min(durations), 3),
                "median": round(statistics.median(durations), 3),
                "maximum": round(max(durations), 3),
            },
            "plans": plans,
        }
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path)
    parser.add_argument("--runs", type=int, default=7)
    parser.add_argument("--keep", type=Path, help="Keep the disposable trial database at this path")
    args = parser.parse_args()
    if not args.database.is_file():
        parser.error(f"database does not exist: {args.database}")
    if not 1 <= args.runs <= 100:
        parser.error("runs must be between 1 and 100")

    temporary = None
    if args.keep:
        trial_path = args.keep.resolve()
        if trial_path.exists():
            parser.error(f"refusing to replace existing trial database: {trial_path}")
        trial_path.parent.mkdir(parents=True, exist_ok=True)
    else:
        temporary = tempfile.TemporaryDirectory(prefix="caissa-puzzles-d1-trial-")
        trial_path = Path(temporary.name) / "trial.sqlite3"

    source = sqlite3.connect(f"file:{args.database.resolve().as_posix()}?mode=ro", uri=True)
    source.execute("pragma query_only = on")
    trial = sqlite3.connect(trial_path)
    try:
        create_trial_schema(trial)
        population = populate_trial(source, trial)
        results = benchmark(trial, args.runs)
        integrity = trial.execute("pragma integrity_check").fetchone()[0]
        report = {
            "schemaVersion": 1,
            "scope": "local-disposable-d1-compatible-index-trial",
            "source": args.database.name,
            "runs": args.runs,
            "population": population,
            "trialBytes": trial_path.stat().st_size,
            "integrityCheck": integrity,
            "cases": results,
            "limitations": [
                "Local SQLite timing only; no remote D1 network latency was measured.",
                "D1 rows_read and Worker CPU metadata require an approved remote rehearsal.",
                "Only the three representative pools are materialized in this trial.",
            ],
        }
        print(json.dumps(report, indent=2))
        return 0 if integrity == "ok" else 1
    finally:
        trial.close()
        source.close()
        if temporary is not None:
            temporary.cleanup()


if __name__ == "__main__":
    raise SystemExit(main())
