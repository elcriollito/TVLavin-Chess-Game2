#!/usr/bin/env python3
"""Build a resumable, verified D1 catalog artifact from the local SQLite source."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sqlite3
import sys
import time
from pathlib import Path
from typing import Iterable, Sequence

try:
    from tools.puzzles.build_d1_trial_sample import quality_tier, quote, shuffle_key
except ModuleNotFoundError:  # Direct script execution adds tools/puzzles, not the repository root.
    from build_d1_trial_sample import quality_tier, quote, shuffle_key


SCHEMA_VERSION = 1
SOURCE_VERSION = "2026-09-10"
MAX_SQL_BYTES = 5_000_000_000
MAX_D1_BYTES = 8_000_000_000
MAX_STATEMENT_BYTES = 80_000
DEFAULT_PUZZLE_BATCH = 50_000
DEFAULT_RELATION_BATCH = 250_000

PUZZLE_COLUMNS = (
    "puzzle_id, fen, moves, rating, rating_deviation, popularity, nb_plays, "
    "themes, game_url, opening_tags, daily_date"
)


def hash_file(path: Path, chunk_size: int = 8 * 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(chunk_size):
            digest.update(chunk)
    return digest.hexdigest()


def replace_file(source: Path, destination: Path, attempts: int = 10) -> None:
    """Replace a generated file despite transient Windows scanner locks."""
    for attempt in range(attempts):
        try:
            os.replace(source, destination)
            return
        except PermissionError:
            if attempt + 1 == attempts:
                raise
            time.sleep(0.05 * (attempt + 1))


def atomic_json(path: Path, value: object) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    replace_file(temporary, path)


def schema_sql() -> str:
    schema = (Path(__file__).resolve().parents[2] / "cloudflare-puzzles-worker" / "schema.sql").read_text(
        encoding="utf-8"
    )
    return schema.replace("create table ", "create table if not exists ")


def row_sql(row: Sequence[object]) -> str:
    return "(" + ",".join(quote(value) for value in row) + ")"


def write_sql_shard(path: Path, table: str, rows: Iterable[Sequence[object]], verb: str = "insert or ignore") -> dict[str, object]:
    temporary = path.with_suffix(path.suffix + ".tmp")
    digest = hashlib.sha256()
    size = 0
    statements = 0
    row_count = 0
    maximum_statement = 0

    def emit(stream, value: str) -> None:
        nonlocal size
        encoded = value.encode("utf-8")
        stream.write(encoded)
        digest.update(encoded)
        size += len(encoded)

    prefix = f"{verb} into {table} values\n"
    with temporary.open("wb") as stream:
        batch: list[str] = []
        batch_bytes = len(prefix.encode("utf-8")) + 2
        for row in rows:
            literal = row_sql(row)
            literal_bytes = len(literal.encode("utf-8"))
            separator_bytes = 2 if batch else 0
            if batch and batch_bytes + separator_bytes + literal_bytes > MAX_STATEMENT_BYTES:
                statement = prefix + ",\n".join(batch) + ";\n"
                emit(stream, statement)
                statements += 1
                maximum_statement = max(maximum_statement, len(statement.encode("utf-8")))
                batch = []
                batch_bytes = len(prefix.encode("utf-8")) + 2
            batch.append(literal)
            batch_bytes += separator_bytes + literal_bytes
            row_count += 1
        if batch:
            statement = prefix + ",\n".join(batch) + ";\n"
            emit(stream, statement)
            statements += 1
            maximum_statement = max(maximum_statement, len(statement.encode("utf-8")))
    replace_file(temporary, path)
    return {
        "file": path.name,
        "table": table,
        "rows": row_count,
        "statements": statements,
        "bytes": size,
        "sha256": digest.hexdigest(),
        "maximumStatementBytes": maximum_statement,
    }


def initial_state(source: Path) -> dict[str, object]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "sourceVersion": SOURCE_VERSION,
        "sourcePath": str(source.resolve()),
        "sourceBytes": source.stat().st_size,
        "stage": "puzzles",
        "puzzleCursor": "",
        "themeCursor": ["", ""],
        "openingCursor": ["", ""],
        "nextShard": {"puzzles": 1, "themes": 1, "openings": 1},
        "artifacts": [],
    }


def open_source(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(f"file:{path.resolve().as_posix()}?mode=ro", uri=True)
    connection.execute("pragma query_only = on")
    connection.execute("pragma temp_store = memory")
    return connection


def open_candidate(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(path)
    connection.execute("pragma journal_mode = wal")
    connection.execute("pragma synchronous = normal")
    connection.execute("pragma temp_store = memory")
    connection.execute("pragma cache_size = -262144")
    connection.executescript(schema_sql())
    return connection


def register_artifact(state: dict[str, object], artifact: dict[str, object]) -> None:
    artifacts = list(state["artifacts"])
    artifacts = [item for item in artifacts if item["file"] != artifact["file"]]
    artifacts.append(artifact)
    state["artifacts"] = artifacts


def emit_progress(stage: str, artifact: dict[str, object], started: float) -> None:
    print(json.dumps({
        "stage": stage,
        "file": artifact["file"],
        "rows": artifact["rows"],
        "bytes": artifact["bytes"],
        "elapsedSeconds": round(time.perf_counter() - started, 1),
    }), flush=True)


def puzzle_rows(source: sqlite3.Connection, cursor: str, limit: int) -> list[tuple[object, ...]]:
    return source.execute(
        f"select {PUZZLE_COLUMNS} from puzzles where puzzle_id > ? order by puzzle_id limit ?",
        (cursor, limit),
    ).fetchall()


def canonical_target_rows(rows: Sequence[Sequence[object]]) -> list[tuple[object, ...]]:
    return [tuple(row) + (SOURCE_VERSION,) for row in rows]


def relation_rows(
    source: sqlite3.Connection,
    relation_table: str,
    tag_column: str,
    cursor: Sequence[str],
    limit: int,
) -> list[tuple[object, ...]]:
    return source.execute(
        f"""
        select r.{tag_column}, r.puzzle_id, p.rating, p.rating_deviation,
               p.popularity, p.nb_plays
          from {relation_table} r join puzzles p on p.puzzle_id = r.puzzle_id
         where (r.{tag_column}, r.puzzle_id) > (?, ?)
         order by r.{tag_column}, r.puzzle_id
         limit ?
        """,
        (cursor[0], cursor[1], limit),
    ).fetchall()


def target_pool_rows(dimension: str, rows: Sequence[Sequence[object]]) -> list[tuple[object, ...]]:
    return [
        (
            f"{dimension}:{tag}:q{quality_tier(int(deviation), int(popularity), int(plays))}:b{int(rating) // 100}",
            shuffle_key(str(puzzle_id)),
            puzzle_id,
            rating,
        )
        for tag, puzzle_id, rating, deviation, popularity, plays in rows
    ]


def source_summary(source: sqlite3.Connection) -> dict[str, object]:
    integrity = source.execute("pragma integrity_check").fetchone()[0]
    if integrity != "ok":
        raise RuntimeError(f"source integrity check failed: {integrity}")
    puzzle_count = source.execute("select count(1) from puzzles").fetchone()[0]
    theme_count = source.execute("select count(1) from puzzle_themes").fetchone()[0]
    opening_count = source.execute("select count(1) from puzzle_openings").fetchone()[0]
    theme_tags = source.execute("select count(distinct theme) from puzzle_themes").fetchone()[0]
    opening_tags = source.execute("select count(distinct opening_tag) from puzzle_openings").fetchone()[0]
    missing_game_urls = source.execute(
        "select count(1) from puzzles where coalesce(length(trim(game_url)), 0) = 0"
    ).fetchone()[0]
    invalid_game_urls = source.execute(
        "select count(1) from puzzles where game_url not like 'https://lichess.org/%'"
    ).fetchone()[0]
    return {
        "integrityCheck": integrity,
        "puzzles": puzzle_count,
        "themeRelations": theme_count,
        "openingRelations": opening_count,
        "themeTags": theme_tags,
        "openingTags": opening_tags,
        "missingGameUrls": missing_game_urls,
        "invalidGameUrls": invalid_game_urls,
    }


def verify_candidate(candidate: sqlite3.Connection, source: dict[str, object]) -> dict[str, object]:
    counts = {
        "puzzles": candidate.execute("select count(1) from puzzles").fetchone()[0],
        "poolEntries": candidate.execute("select count(1) from puzzle_pool_entries").fetchone()[0],
        "poolCounts": candidate.execute("select count(1) from puzzle_pool_counts").fetchone()[0],
        "metadata": candidate.execute("select count(1) from catalog_metadata").fetchone()[0],
        "gameUrls": candidate.execute(
            "select count(1) from puzzles where game_url like 'https://lichess.org/%'"
        ).fetchone()[0],
        "themePoolKeys": candidate.execute(
            "select count(1) from puzzle_pool_counts where pool_key like 'theme:%'"
        ).fetchone()[0],
        "openingPoolKeys": candidate.execute(
            "select count(1) from puzzle_pool_counts where pool_key like 'opening:%'"
        ).fetchone()[0],
        "themeTags": candidate.execute(
            """
            select count(distinct substr(pool_key, 7, instr(substr(pool_key, 7), ':q') - 1))
              from puzzle_pool_counts where pool_key like 'theme:%'
            """
        ).fetchone()[0],
        "openingTags": candidate.execute(
            """
            select count(distinct substr(pool_key, 9, instr(substr(pool_key, 9), ':q') - 1))
              from puzzle_pool_counts where pool_key like 'opening:%'
            """
        ).fetchone()[0],
    }
    expected_pool_entries = int(source["themeRelations"]) + int(source["openingRelations"])
    if counts["puzzles"] != source["puzzles"]:
        raise RuntimeError(f"candidate puzzle count mismatch: {counts['puzzles']} != {source['puzzles']}")
    if counts["poolEntries"] != expected_pool_entries:
        raise RuntimeError(f"candidate pool count mismatch: {counts['poolEntries']} != {expected_pool_entries}")
    if counts["gameUrls"] != source["puzzles"]:
        raise RuntimeError("candidate does not preserve every Lichess GameUrl")
    if counts["themeTags"] != source["themeTags"] or counts["openingTags"] != source["openingTags"]:
        raise RuntimeError("candidate tag coverage does not match the source")
    integrity = candidate.execute("pragma integrity_check").fetchone()[0]
    if integrity != "ok":
        raise RuntimeError(f"candidate integrity check failed: {integrity}")
    counts["integrityCheck"] = integrity
    return counts


def build(args: argparse.Namespace) -> dict[str, object]:
    started = time.perf_counter()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    state_path = output / "build-state.json"
    candidate_path = output / "caissa-puzzles-2026-09-10.sqlite3"
    manifest_path = output / "manifest.json"
    if manifest_path.exists() and not args.verify:
        raise SystemExit(f"completed manifest already exists: {manifest_path}; use --verify")

    if state_path.exists():
        state = json.loads(state_path.read_text(encoding="utf-8"))
        if state["sourcePath"] != str(args.database.resolve()) or state["sourceBytes"] != args.database.stat().st_size:
            raise SystemExit("build state belongs to a different source database")
    else:
        if candidate_path.exists():
            raise SystemExit(f"candidate exists without resumable state: {candidate_path}")
        state = initial_state(args.database)
        atomic_json(state_path, state)

    source = open_source(args.database)
    candidate = open_candidate(candidate_path)
    try:
        schema_path = output / "00000-schema-and-metadata.sql"
        if not any(item["file"] == schema_path.name for item in state["artifacts"]):
            metadata = (
                ("schema_version", str(SCHEMA_VERSION)),
                ("source_version", SOURCE_VERSION),
                ("catalog_role", "immutable-public-puzzle-catalog"),
            )
            schema_body = schema_sql() + "\n" + "\n".join(
                f"insert or replace into catalog_metadata values ({quote(key)},{quote(value)});"
                for key, value in metadata
            ) + "\n"
            schema_path.write_text(schema_body, encoding="utf-8", newline="\n")
            candidate.executemany("insert or replace into catalog_metadata values (?,?)", metadata)
            candidate.commit()
            artifact = {
                "file": schema_path.name,
                "table": "schema+catalog_metadata",
                "rows": len(metadata),
                "statements": schema_body.count(";"),
                "bytes": schema_path.stat().st_size,
                "sha256": hash_file(schema_path),
                "maximumStatementBytes": max(len(part.encode("utf-8")) for part in schema_body.split(";")),
            }
            register_artifact(state, artifact)
            atomic_json(state_path, state)
            emit_progress("schema", artifact, started)

        while state["stage"] == "puzzles":
            rows = puzzle_rows(source, str(state["puzzleCursor"]), args.puzzle_batch)
            if not rows:
                state["stage"] = "themes"
                atomic_json(state_path, state)
                break
            target = canonical_target_rows(rows)
            shard = int(state["nextShard"]["puzzles"])
            path = output / f"10000-puzzles-{shard:05d}.sql"
            artifact = write_sql_shard(path, "puzzles", target)
            candidate.executemany("insert or ignore into puzzles values (?,?,?,?,?,?,?,?,?,?,?,?)", target)
            candidate.commit()
            register_artifact(state, artifact)
            state["puzzleCursor"] = str(rows[-1][0])
            state["nextShard"]["puzzles"] = shard + 1
            atomic_json(state_path, state)
            emit_progress("puzzles", artifact, started)

        relation_stages = (
            ("themes", "puzzle_themes", "theme", "theme", "themeCursor", "20000"),
            ("openings", "puzzle_openings", "opening_tag", "opening", "openingCursor", "30000"),
        )
        for stage, table, column, dimension, cursor_key, prefix in relation_stages:
            while state["stage"] == stage:
                cursor = list(state[cursor_key])
                rows = relation_rows(source, table, column, cursor, args.relation_batch)
                if not rows:
                    state["stage"] = "openings" if stage == "themes" else "counts"
                    atomic_json(state_path, state)
                    break
                target = target_pool_rows(dimension, rows)
                shard = int(state["nextShard"][stage])
                path = output / f"{prefix}-{stage}-{shard:05d}.sql"
                artifact = write_sql_shard(path, "puzzle_pool_entries", target)
                candidate.executemany(
                    "insert or ignore into puzzle_pool_entries values (?,?,?,?)", target
                )
                candidate.commit()
                register_artifact(state, artifact)
                state[cursor_key] = [str(rows[-1][0]), str(rows[-1][1])]
                state["nextShard"][stage] = shard + 1
                atomic_json(state_path, state)
                emit_progress(stage, artifact, started)

        if state["stage"] == "counts":
            candidate.execute("delete from puzzle_pool_counts")
            candidate.execute(
                "insert into puzzle_pool_counts select pool_key, count(1) from puzzle_pool_entries group by pool_key"
            )
            candidate.commit()
            counts = candidate.execute(
                "select pool_key, entry_count from puzzle_pool_counts order by pool_key"
            ).fetchall()
            artifact = write_sql_shard(
                output / "40000-pool-counts.sql",
                "puzzle_pool_counts",
                counts,
                verb="insert or replace",
            )
            register_artifact(state, artifact)
            state["stage"] = "verify"
            atomic_json(state_path, state)
            emit_progress("counts", artifact, started)

        source_info = source_summary(source)
        if source_info["missingGameUrls"] or source_info["invalidGameUrls"]:
            raise RuntimeError(f"source GameUrl validation failed: {source_info}")
        if state["stage"] == "verify":
            candidate.execute("pragma wal_checkpoint(truncate)")
            candidate.execute("vacuum")
            candidate.commit()
        verification = verify_candidate(candidate, source_info)
        candidate.close()
        candidate = None

        artifacts = sorted(state["artifacts"], key=lambda item: item["file"])
        sql_bytes = sum(int(item["bytes"]) for item in artifacts)
        sql_rows = sum(int(item["rows"]) for item in artifacts)
        combined = hashlib.sha256()
        for artifact in artifacts:
            combined.update(bytes.fromhex(str(artifact["sha256"])))
        candidate_bytes = candidate_path.stat().st_size
        thresholds = {
            "sqlLimitBytes": MAX_SQL_BYTES,
            "d1PlanningLimitBytes": MAX_D1_BYTES,
            "sqlWithinLimit": sql_bytes <= MAX_SQL_BYTES,
            "d1WithinPlanningLimit": candidate_bytes <= MAX_D1_BYTES,
            "maximumStatementBytes": max(int(item["maximumStatementBytes"]) for item in artifacts),
            "statementLimitBytes": 100_000,
        }
        manifest = {
            "schemaVersion": SCHEMA_VERSION,
            "catalogVersion": SOURCE_VERSION,
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "source": {
                "file": args.database.name,
                "bytes": args.database.stat().st_size,
                "sha256": hash_file(args.database),
                **source_info,
            },
            "candidate": {
                "file": candidate_path.name,
                "bytes": candidate_bytes,
                "sha256": hash_file(candidate_path),
                **verification,
            },
            "sql": {
                "artifacts": artifacts,
                "artifactCount": len(artifacts),
                "bytes": sql_bytes,
                "logicalRows": sql_rows,
                "artifactDigestSha256": combined.hexdigest(),
            },
            "thresholds": thresholds,
            "estimatedRowsWrittenUpperBound": sql_rows + 16,
            "resumable": True,
            "elapsedSeconds": round(time.perf_counter() - started, 1),
        }
        atomic_json(manifest_path, manifest)
        state["stage"] = "complete"
        atomic_json(state_path, state)
        if not all((thresholds["sqlWithinLimit"], thresholds["d1WithinPlanningLimit"], thresholds["maximumStatementBytes"] <= 100_000)):
            raise SystemExit("artifact exceeds a production safety threshold; inspect manifest before continuing")
        return manifest
    finally:
        if candidate is not None:
            candidate.close()
        source.close()


def verify_existing(args: argparse.Namespace) -> dict[str, object]:
    manifest_path = args.output.resolve() / "manifest.json"
    if not manifest_path.is_file():
        raise SystemExit(f"manifest not found: {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for artifact in manifest["sql"]["artifacts"]:
        path = args.output.resolve() / artifact["file"]
        if path.stat().st_size != artifact["bytes"] or hash_file(path) != artifact["sha256"]:
            raise SystemExit(f"artifact verification failed: {path}")
    candidate = args.output.resolve() / manifest["candidate"]["file"]
    if candidate.stat().st_size != manifest["candidate"]["bytes"] or hash_file(candidate) != manifest["candidate"]["sha256"]:
        raise SystemExit(f"candidate verification failed: {candidate}")
    manifest["verifiedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--puzzle-batch", type=int, default=DEFAULT_PUZZLE_BATCH)
    parser.add_argument("--relation-batch", type=int, default=DEFAULT_RELATION_BATCH)
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    if not args.database.is_file():
        parser.error(f"database does not exist: {args.database}")
    if not 1_000 <= args.puzzle_batch <= 250_000:
        parser.error("--puzzle-batch must be between 1,000 and 250,000")
    if not 10_000 <= args.relation_batch <= 1_000_000:
        parser.error("--relation-batch must be between 10,000 and 1,000,000")
    result = verify_existing(args) if args.verify else build(args)
    print(json.dumps(result, indent=2), flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("build interrupted; rerun the same command to resume", file=sys.stderr)
        raise SystemExit(130)
