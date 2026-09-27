#!/usr/bin/env python3
"""Resume-safe SQLite to PostgreSQL importer for the CAISSA puzzle catalog."""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import time
from pathlib import Path
from urllib.parse import unquote, urlparse


PRODUCTION_PROJECT_REF = "jczauvkfkweuvdpurpem"
PROJECT_REF_PATTERN = re.compile(r"^[a-z0-9]{20}$")
COPY_COLUMNS = [
    "puzzle_id", "fen", "moves", "rating", "rating_deviation", "popularity",
    "nb_plays", "themes", "game_url", "opening_tags", "daily_date", "source_version",
]


def validate_staging_target(database_url: str, project_ref: str) -> None:
    parsed = urlparse(database_url)
    if parsed.scheme not in {"postgres", "postgresql"} or not parsed.hostname:
        raise ValueError("staging database URL must be a PostgreSQL connection string")
    if not PROJECT_REF_PATTERN.fullmatch(project_ref):
        raise ValueError("staging project ref must be exactly 20 lowercase letters or digits")

    target_refs: set[str] = set()
    direct_host = re.fullmatch(r"db\.([a-z0-9]{20})\.supabase\.co", parsed.hostname.lower())
    if direct_host:
        target_refs.add(direct_host.group(1))
    username = unquote(parsed.username or "").lower()
    pooler_user = re.fullmatch(r"postgres\.([a-z0-9]{20})", username)
    if pooler_user:
        target_refs.add(pooler_user.group(1))

    if PRODUCTION_PROJECT_REF in target_refs or project_ref == PRODUCTION_PROJECT_REF:
        raise ValueError("the production project is forbidden as an import target")
    if target_refs != {project_ref}:
        raise ValueError("staging project ref does not match the connection target")


def tags(value: str) -> list[str]:
    return list(dict.fromkeys(value.split()))


def postgres_row(row: tuple[object, ...], source_version: str) -> tuple[object, ...]:
    return (*row[:7], tags(str(row[7])), row[8], tags(str(row[9])), int(row[10]) if row[10] else None, source_version)


def read_batch(connection: sqlite3.Connection, last_puzzle_id: str, batch_size: int) -> list[tuple[object, ...]]:
    return connection.execute(
        """select puzzle_id, fen, moves, rating, rating_deviation, popularity,
                  nb_plays, themes, game_url, opening_tags, daily_date
             from puzzles
            where puzzle_id > ?
            order by puzzle_id
            limit ?""",
        (last_puzzle_id, batch_size),
    ).fetchall()


def load_checkpoint(path: Path, source_version: str, source_bytes: int) -> dict[str, object]:
    if not path.exists():
        return {"schemaVersion": 1, "sourceVersion": source_version, "sourceBytes": source_bytes, "lastPuzzleId": "", "processed": 0}
    checkpoint = json.loads(path.read_text(encoding="utf-8"))
    if checkpoint.get("sourceVersion") != source_version or checkpoint.get("sourceBytes") != source_bytes:
        raise ValueError("checkpoint belongs to a different catalog source")
    return checkpoint


def save_checkpoint(path: Path, checkpoint: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_suffix(path.suffix + ".tmp")
    partial.write_text(json.dumps(checkpoint, indent=2) + "\n", encoding="utf-8")
    os.replace(partial, path)


def local_aggregate(connection: sqlite3.Connection) -> dict[str, int | str | None]:
    count, minimum, maximum, rating_sum, plays_sum = connection.execute(
        "select count(*), min(puzzle_id), max(puzzle_id), sum(rating), sum(nb_plays) from puzzles"
    ).fetchone()
    return {"count": count, "minimum": minimum, "maximum": maximum, "ratingSum": rating_sum, "playsSum": plays_sum}


def remote_aggregate(cursor, source_version: str) -> dict[str, int | str | None]:
    cursor.execute(
        """select count(*)::bigint, min(puzzle_id), max(puzzle_id),
                  sum(rating)::bigint, sum(nb_plays)::bigint
             from public.puzzles where source_version = %s""",
        (source_version,),
    )
    count, minimum, maximum, rating_sum, plays_sum = cursor.fetchone()
    return {"count": count, "minimum": minimum, "maximum": maximum, "ratingSum": rating_sum, "playsSum": plays_sum}


def run(args: argparse.Namespace) -> dict[str, object]:
    validate_staging_target(args.database_url, args.project_ref)
    import psycopg

    sqlite_connection = sqlite3.connect(f"file:{args.sqlite.resolve()}?mode=ro", uri=True)
    sqlite_connection.execute("pragma query_only = on")
    checkpoint = load_checkpoint(args.checkpoint, args.source_version, args.sqlite.stat().st_size)
    started = time.perf_counter()
    batches = 0
    inserted_total = 0
    try:
        with psycopg.connect(args.database_url, connect_timeout=10, application_name="caissa-puzzle-import", autocommit=True) as postgres:
            with postgres.cursor() as cursor:
                cursor.execute("select to_regclass('public.puzzles')")
                if cursor.fetchone()[0] is None:
                    raise RuntimeError("public.puzzles does not exist on the staging target")
                cursor.execute("create temporary table caissa_puzzle_batch (like public.puzzles including defaults) on commit preserve rows")
                while True:
                    batch = read_batch(sqlite_connection, str(checkpoint["lastPuzzleId"]), args.batch_size)
                    if not batch:
                        break
                    with postgres.transaction():
                        cursor.execute("truncate pg_temp.caissa_puzzle_batch")
                        columns = ",".join(COPY_COLUMNS)
                        with cursor.copy(f"copy pg_temp.caissa_puzzle_batch ({columns}) from stdin") as copy:
                            for row in batch:
                                copy.write_row(postgres_row(row, args.source_version))
                        cursor.execute(
                            f"""insert into public.puzzles ({columns})
                                 select {columns} from pg_temp.caissa_puzzle_batch
                                 on conflict (puzzle_id) do nothing"""
                        )
                        inserted_total += cursor.rowcount
                    checkpoint.update({
                        "lastPuzzleId": batch[-1][0],
                        "processed": int(checkpoint["processed"]) + len(batch),
                        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    })
                    save_checkpoint(args.checkpoint, checkpoint)
                    batches += 1
                    print(json.dumps({"batch": batches, "processed": checkpoint["processed"], "inserted": inserted_total, "lastPuzzleId": checkpoint["lastPuzzleId"]}), flush=True)
                    if args.max_batches and batches >= args.max_batches:
                        break
                local = local_aggregate(sqlite_connection)
                remote = remote_aggregate(cursor, args.source_version)
    finally:
        sqlite_connection.close()

    complete = int(checkpoint["processed"]) == local["count"]
    verified = complete and remote == local
    return {
        "sourceVersion": args.source_version,
        "projectRef": args.project_ref,
        "batchesThisRun": batches,
        "processed": checkpoint["processed"],
        "insertedThisRun": inserted_total,
        "complete": complete,
        "verified": verified,
        "local": local,
        "remote": remote,
        "seconds": round(time.perf_counter() - started, 3),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sqlite", type=Path)
    parser.add_argument("--database-url", default=os.environ.get("CAISSA_PUZZLE_STAGING_DATABASE_URL", ""))
    parser.add_argument("--project-ref", default=os.environ.get("CAISSA_PUZZLE_STAGING_PROJECT_REF", ""))
    parser.add_argument("--source-version", default="2026-09-10")
    parser.add_argument("--checkpoint", type=Path)
    parser.add_argument("--batch-size", type=int, default=25_000)
    parser.add_argument("--max-batches", type=int, default=0, help="Stop cleanly after N batches; zero means all")
    args = parser.parse_args()
    if not args.sqlite.is_file():
        parser.error(f"SQLite catalog does not exist: {args.sqlite}")
    if not 100 <= args.batch_size <= 100_000:
        parser.error("batch size must be between 100 and 100000")
    if not args.checkpoint:
        args.checkpoint = args.sqlite.with_name(args.sqlite.name + ".postgres-import-checkpoint.json")
    try:
        result = run(args)
    except (OSError, ValueError, RuntimeError) as error:
        parser.error(str(error))
    print(json.dumps(result, indent=2))
    return 0 if result["verified"] or not result["complete"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
