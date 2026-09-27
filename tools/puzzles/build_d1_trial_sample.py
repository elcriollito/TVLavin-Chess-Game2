#!/usr/bin/env python3
"""Build a bounded, representative SQL sample for the remote D1 Free trial."""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from collections import Counter
from pathlib import Path
from typing import Iterable, Iterator, TextIO


SOURCE_VERSION = "2026-09-10"
PREFIXES = ("00", "01", "02", "03", "04")
MAX_FREE_WRITES = 90_000


def quality_tier(deviation: int, popularity: int, plays: int) -> int:
    if deviation <= 100 and popularity >= 80 and plays >= 500:
        return 2
    if deviation <= 100 and popularity >= 80 and plays >= 100:
        return 1
    return 0


def shuffle_key(puzzle_id: str) -> int:
    return int.from_bytes(hashlib.sha256(puzzle_id.encode("ascii")).digest()[:6], "big")


def quote(value: object) -> str:
    if value is None:
        return "null"
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def write_insert_batches(
    stream: TextIO,
    table: str,
    rows: Iterable[tuple[object, ...]],
    batch_size: int = 40,
) -> int:
    batch: list[tuple[object, ...]] = []
    count = 0
    for row in rows:
        batch.append(row)
        if len(batch) >= batch_size:
            stream.write(f"insert into {table} values\n")
            stream.write(",\n".join("(" + ",".join(quote(value) for value in item) + ")" for item in batch))
            stream.write(";\n")
            count += len(batch)
            batch.clear()
    if batch:
        stream.write(f"insert into {table} values\n")
        stream.write(",\n".join("(" + ",".join(quote(value) for value in item) + ")" for item in batch))
        stream.write(";\n")
        count += len(batch)
    return count


def select_sample(connection: sqlite3.Connection) -> None:
    connection.execute("create temp table selected(puzzle_id text primary key) without rowid")
    placeholders = ",".join("?" for _ in PREFIXES)
    connection.execute(
        f"insert or ignore into selected select puzzle_id from puzzles where substr(puzzle_id,1,2) in ({placeholders})",
        PREFIXES,
    )
    connection.execute(
        """
        insert or ignore into selected
        select p.puzzle_id
          from puzzle_themes t join puzzles p on p.puzzle_id = t.puzzle_id
         where t.theme = 'equality' and p.rating_deviation <= 100
           and p.popularity >= 80 and p.nb_plays >= 100
        """
    )
    connection.execute(
        """
        insert or ignore into selected
        select puzzle_id from (
          select p.puzzle_id
            from puzzle_openings o join puzzles p on p.puzzle_id = o.puzzle_id
           where o.opening_tag = 'Sicilian_Defense'
             and p.rating_deviation <= 100 and p.popularity >= 80 and p.nb_plays >= 500
           order by p.puzzle_id limit 1000
        )
        """
    )
    connection.execute("insert or ignore into selected values ('4TN7E')")


def canonical_rows(connection: sqlite3.Connection) -> Iterator[tuple[object, ...]]:
    yield from connection.execute(
        """
        select p.puzzle_id, p.fen, p.moves, p.rating, p.rating_deviation,
               p.popularity, p.nb_plays, p.themes, p.game_url,
               p.opening_tags, p.daily_date, ?
          from selected s join puzzles p on p.puzzle_id = s.puzzle_id
         order by p.puzzle_id
        """,
        (SOURCE_VERSION,),
    )


def pool_rows(connection: sqlite3.Connection, counts: Counter[str]) -> Iterator[tuple[object, ...]]:
    rows = connection.execute(
        """
        select p.puzzle_id, p.rating, p.rating_deviation, p.popularity,
               p.nb_plays, p.themes, p.opening_tags
          from selected s join puzzles p on p.puzzle_id = s.puzzle_id
         order by p.puzzle_id
        """
    )
    for puzzle_id, rating, deviation, popularity, plays, themes, openings in rows:
        tier = quality_tier(int(deviation), int(popularity), int(plays))
        tags = (
            ("theme", dict.fromkeys(str(themes).split())),
            ("opening", dict.fromkeys(str(openings).split())),
        )
        for dimension, values in tags:
            for tag in values:
                key = f"{dimension}:{tag}:q{tier}:b{int(rating) // 100}"
                counts[key] += 1
                yield key, shuffle_key(str(puzzle_id)), puzzle_id, rating


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--manifest", type=Path)
    args = parser.parse_args()
    if not args.database.is_file():
        parser.error(f"database does not exist: {args.database}")
    if args.output.exists():
        parser.error(f"refusing to replace existing output: {args.output}")

    schema = Path(__file__).resolve().parents[2] / "cloudflare-puzzles-worker" / "schema.sql"
    connection = sqlite3.connect(f"file:{args.database.resolve().as_posix()}?mode=ro", uri=True)
    try:
        select_sample(connection)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        counts: Counter[str] = Counter()
        with args.output.open("w", encoding="utf-8", newline="\n") as stream:
            stream.write(schema.read_text(encoding="utf-8"))
            stream.write("\n")
            metadata = (
                ("schema_version", "1"),
                ("source_version", SOURCE_VERSION),
                ("sample_strategy", "prefixes-00-04+all-relaxed-equality+1000-sicilian+4TN7E"),
            )
            metadata_count = write_insert_batches(stream, "catalog_metadata", metadata)
            canonical_count = write_insert_batches(stream, "puzzles", canonical_rows(connection))
            pool_count = write_insert_batches(stream, "puzzle_pool_entries", pool_rows(connection, counts))
            count_count = write_insert_batches(
                stream,
                "puzzle_pool_counts",
                ((key, value) for key, value in sorted(counts.items())),
            )

        logical_rows = metadata_count + canonical_count + pool_count + count_count
        if logical_rows > MAX_FREE_WRITES:
            args.output.unlink(missing_ok=True)
            raise SystemExit(
                f"sample would write {logical_rows:,} rows, above the {MAX_FREE_WRITES:,} safety cap"
            )
        manifest = {
            "schemaVersion": 1,
            "sourceVersion": SOURCE_VERSION,
            "strategy": "prefixes-00-04+all-relaxed-equality+1000-sicilian+4TN7E",
            "puzzles": canonical_count,
            "poolEntries": pool_count,
            "poolCounts": count_count,
            "metadataRows": metadata_count,
            "logicalRows": logical_rows,
            "safetyCap": MAX_FREE_WRITES,
            "sqlBytes": args.output.stat().st_size,
            "sha256": hashlib.sha256(args.output.read_bytes()).hexdigest(),
        }
        if args.manifest:
            args.manifest.parent.mkdir(parents=True, exist_ok=True)
            args.manifest.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(manifest, indent=2))
        return 0
    finally:
        connection.close()


if __name__ == "__main__":
    raise SystemExit(main())
