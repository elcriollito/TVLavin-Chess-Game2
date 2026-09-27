#!/usr/bin/env python3
"""Build and verify a lossless local SQLite catalog from the Lichess puzzle CSV.

The source may be the official ``.csv.zst`` archive or a plain CSV fixture. The
database is written to ``<output>.part`` and only promoted after the source has
been fully decoded, counted, indexed, and passed ``PRAGMA integrity_check``.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import heapq
import io
import json
import os
import re
import sqlite3
import sys
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, TextIO


COLUMNS = [
    "PuzzleId",
    "FEN",
    "Moves",
    "Rating",
    "RatingDeviation",
    "Popularity",
    "NbPlays",
    "Themes",
    "GameUrl",
    "OpeningTags",
    "DailyDate",
]
UCI_MOVE = re.compile(r"^[a-h][1-8][a-h][1-8][nbrq]?$", re.ASCII)
DEFAULT_EXPECTED_COUNT = 6_100_952


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Official .csv.zst archive or a plain CSV fixture")
    parser.add_argument("database", type=Path, help="Destination SQLite catalog")
    parser.add_argument("--manifest", type=Path, help="Destination JSON manifest")
    parser.add_argument("--sample", type=Path, help="Destination deterministic validation sample")
    parser.add_argument("--source-date", default="2026-09-10", help="Date published by Lichess")
    parser.add_argument("--expected-count", type=int, default=DEFAULT_EXPECTED_COUNT)
    parser.add_argument("--sample-size", type=int, default=512)
    parser.add_argument("--batch-size", type=int, default=20_000)
    parser.add_argument("--progress-every", type=int, default=250_000)
    parser.add_argument("--allow-existing", action="store_true", help="Replace an existing completed catalog")
    return parser.parse_args(argv)


class HashingReader(io.RawIOBase):
    """File wrapper that hashes the compressed bytes consumed by the decoder."""

    def __init__(self, raw: io.BufferedReader) -> None:
        self.raw = raw
        self.sha256 = hashlib.sha256()

    def readable(self) -> bool:
        return True

    def readinto(self, buffer: bytearray) -> int:
        chunk = self.raw.read(len(buffer))
        if not chunk:
            return 0
        self.sha256.update(chunk)
        buffer[: len(chunk)] = chunk
        return len(chunk)


@contextmanager
def open_text_source(path: Path) -> Iterator[tuple[TextIO, HashingReader | None]]:
    if path.suffix.lower() != ".zst":
        with path.open("r", encoding="utf-8-sig", newline="") as stream:
            yield stream, None
        return

    try:
        import zstandard
    except ImportError as exc:  # pragma: no cover - exercised by the real archive only.
        raise SystemExit("Install tools/puzzles/requirements.txt before reading .zst files") from exc

    with path.open("rb") as compressed:
        hashing = HashingReader(compressed)
        buffered = io.BufferedReader(hashing, buffer_size=1024 * 1024)
        decoder = zstandard.ZstdDecompressor().stream_reader(buffered, read_across_frames=True)
        with io.TextIOWrapper(decoder, encoding="utf-8-sig", newline="") as text:
            yield text, hashing


def create_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        pragma journal_mode = off;
        pragma synchronous = off;
        pragma temp_store = memory;
        pragma cache_size = -262144;

        create table catalog_metadata (
          key text primary key,
          value text not null
        ) without rowid;

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
          opening_tags text not null,
          daily_date text not null
        ) without rowid;

        create table puzzle_themes (
          theme text not null,
          puzzle_id text not null,
          primary key (theme, puzzle_id)
        ) without rowid;

        create table puzzle_openings (
          opening_tag text not null,
          puzzle_id text not null,
          primary key (opening_tag, puzzle_id)
        ) without rowid;
        """
    )


def validate_row(row: dict[str, str | list[str] | None], line_number: int) -> tuple[int, int, int, int]:
    if None in row or any(row.get(column) is None for column in COLUMNS):
        raise ValueError(f"CSV field count mismatch at line {line_number}")
    try:
        rating = int(str(row["Rating"]))
        deviation = int(str(row["RatingDeviation"]))
        popularity = int(str(row["Popularity"]))
        plays = int(str(row["NbPlays"]))
    except ValueError as exc:
        raise ValueError(f"Invalid numeric field at line {line_number}") from exc
    if rating <= 0 or deviation < 0 or not -100 <= popularity <= 100 or plays < 0:
        raise ValueError(f"Numeric field outside the Lichess contract at line {line_number}")
    fen = str(row["FEN"])
    if len(fen.split()) != 6:
        raise ValueError(f"Invalid FEN field count at line {line_number}")
    moves = str(row["Moves"]).split()
    if len(moves) < 2 or any(not UCI_MOVE.fullmatch(move) for move in moves):
        raise ValueError(f"Invalid UCI move sequence at line {line_number}")
    daily_date = str(row["DailyDate"])
    if daily_date and (not daily_date.isdigit() or int(daily_date) <= 0):
        raise ValueError(f"Invalid DailyDate at line {line_number}")
    return rating, deviation, popularity, plays


def sample_row(heap: list[tuple[int, str, dict[str, str]]], row: dict[str, str], size: int) -> None:
    score = int.from_bytes(hashlib.sha256(row["PuzzleId"].encode("ascii")).digest()[:8], "big")
    item = (-score, row["PuzzleId"], row.copy())
    if len(heap) < size:
        heapq.heappush(heap, item)
    elif item[0] > heap[0][0]:
        heapq.heapreplace(heap, item)


def flush_batch(
    connection: sqlite3.Connection,
    puzzles: list[tuple[object, ...]],
    themes: list[tuple[str, str]],
    openings: list[tuple[str, str]],
) -> None:
    connection.executemany("insert into puzzles values (?,?,?,?,?,?,?,?,?,?,?)", puzzles)
    connection.executemany("insert into puzzle_themes values (?,?)", themes)
    connection.executemany("insert into puzzle_openings values (?,?)", openings)
    puzzles.clear()
    themes.clear()
    openings.clear()


def build_catalog(args: argparse.Namespace) -> dict[str, object]:
    source = args.source.resolve()
    database = args.database.resolve()
    partial = database.with_name(database.name + ".part")
    if not source.is_file():
        raise SystemExit(f"Source does not exist: {source}")
    if partial.exists():
        raise SystemExit(f"Partial catalog already exists; inspect or remove it before retrying: {partial}")
    if database.exists() and not args.allow_existing:
        raise SystemExit(f"Catalog already exists (use --allow-existing to replace it): {database}")

    database.parent.mkdir(parents=True, exist_ok=True)
    started = time.time()
    count = 0
    sample: list[tuple[int, str, dict[str, str]]] = []
    puzzle_batch: list[tuple[object, ...]] = []
    theme_batch: list[tuple[str, str]] = []
    opening_batch: list[tuple[str, str]] = []
    compressed_hash: str | None = None

    connection = sqlite3.connect(partial)
    try:
        create_schema(connection)
        connection.execute("begin")
        with open_text_source(source) as (stream, hashing):
            reader = csv.DictReader(stream)
            if reader.fieldnames != COLUMNS:
                raise ValueError(f"Unsupported CSV schema: {reader.fieldnames!r}")
            for line_number, raw_row in enumerate(reader, start=2):
                rating, deviation, popularity, plays = validate_row(raw_row, line_number)
                row = {column: str(raw_row[column]) for column in COLUMNS}
                puzzle_id = row["PuzzleId"]
                puzzle_batch.append(
                    (
                        puzzle_id,
                        row["FEN"],
                        row["Moves"],
                        rating,
                        deviation,
                        popularity,
                        plays,
                        row["Themes"],
                        row["GameUrl"],
                        row["OpeningTags"],
                        row["DailyDate"],
                    )
                )
                # Some upstream rows repeat a tag. Preserve the original strings
                # in `puzzles`, but normalize each auxiliary lookup key once.
                theme_batch.extend((theme, puzzle_id) for theme in dict.fromkeys(row["Themes"].split()))
                opening_batch.extend((tag, puzzle_id) for tag in dict.fromkeys(row["OpeningTags"].split()))
                sample_row(sample, row, args.sample_size)
                count += 1
                if len(puzzle_batch) >= args.batch_size:
                    flush_batch(connection, puzzle_batch, theme_batch, opening_batch)
                if args.progress_every and count % args.progress_every == 0:
                    elapsed = max(time.time() - started, 0.001)
                    print(f"Imported {count:,} puzzles ({count / elapsed:,.0f}/s)", flush=True)
            flush_batch(connection, puzzle_batch, theme_batch, opening_batch)
            if hashing is not None:
                compressed_hash = hashing.sha256.hexdigest()

        if count != args.expected_count:
            raise ValueError(f"Expected {args.expected_count:,} puzzles, decoded {count:,}")

        connection.executescript(
            """
            create index puzzles_rating_quality_idx
              on puzzles(rating, popularity desc, nb_plays desc, puzzle_id);
            create index puzzles_daily_date_idx
              on puzzles(daily_date) where daily_date <> '';
            create index puzzles_training_standard_idx
              on puzzles(rating, popularity desc, nb_plays desc, puzzle_id)
              where rating_deviation <= 100 and popularity >= 80 and nb_plays >= 500;
            create index puzzles_training_relaxed_idx
              on puzzles(rating, popularity desc, nb_plays desc, puzzle_id)
              where rating_deviation <= 100 and popularity >= 80 and nb_plays >= 100;
            create index puzzles_training_equality_idx
              on puzzles(rating, popularity desc, nb_plays desc, puzzle_id)
              where rating_deviation <= 100 and popularity >= 80 and nb_plays >= 100
                and instr(' ' || themes || ' ', ' equality ') > 0;
            analyze;
            """
        )
        metadata = {
            "schema_version": "1",
            "source_url": "https://database.lichess.org/lichess_db_puzzle.csv.zst",
            "source_date": args.source_date,
            "source_sha256": compressed_hash or hashlib.sha256(source.read_bytes()).hexdigest(),
            "source_bytes": str(source.stat().st_size),
            "puzzle_count": str(count),
            "columns": ",".join(COLUMNS),
            "license": "CC0",
        }
        connection.executemany("insert into catalog_metadata values (?,?)", metadata.items())
        connection.commit()
        integrity = connection.execute("pragma integrity_check").fetchone()[0]
        if integrity != "ok":
            raise ValueError(f"SQLite integrity check failed: {integrity}")
    except Exception:
        connection.close()
        raise
    else:
        connection.close()

    if database.exists():
        database.unlink()
    os.replace(partial, database)

    ordered_sample = [row for _, _, row in sorted(sample, key=lambda item: (-item[0], item[1]))]
    if args.sample:
        args.sample.parent.mkdir(parents=True, exist_ok=True)
        args.sample.write_text(json.dumps({"columns": COLUMNS, "puzzles": ordered_sample}, indent=2) + "\n", encoding="utf-8")

    manifest: dict[str, object] = {
        "schemaVersion": 1,
        "source": {
            "url": "https://database.lichess.org/lichess_db_puzzle.csv.zst",
            "publishedDate": args.source_date,
            "downloadedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(source.stat().st_mtime)),
            "bytes": source.stat().st_size,
            "sha256": compressed_hash or hashlib.sha256(source.read_bytes()).hexdigest(),
            "license": "CC0",
        },
        "verification": {
            "status": "verified",
            "puzzleCount": count,
            "expectedPuzzleCount": args.expected_count,
            "columns": COLUMNS,
            "zstandardStreamDecoded": source.suffix.lower() == ".zst",
            "sqliteIntegrityCheck": "ok",
            "sampleSize": len(ordered_sample),
            "tool": "tools/puzzles/build_catalog.py",
            "python": sys.version.split()[0],
            "sqlite": sqlite3.sqlite_version,
        },
        "catalog": {
            "format": "SQLite 3",
            "bytes": database.stat().st_size,
            "relativePath": database.name,
            "indexes": [
                "puzzles(puzzle_id)",
                "puzzles(rating,popularity,nb_plays,puzzle_id)",
                "puzzle_themes(theme,puzzle_id)",
                "puzzle_openings(opening_tag,puzzle_id)",
                "puzzles(daily_date) where daily_date <> ''",
                "puzzles(rating,popularity,nb_plays,puzzle_id) quality partial indexes",
            ],
        },
    }
    if args.manifest:
        args.manifest.parent.mkdir(parents=True, exist_ok=True)
        args.manifest.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        manifest = build_catalog(args)
    except (OSError, csv.Error, sqlite3.Error, ValueError) as exc:
        print(f"Catalog build failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
