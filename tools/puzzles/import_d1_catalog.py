#!/usr/bin/env python3
"""Import a verified CAISSA puzzle artifact into one versioned remote D1 database."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Iterable


EXPECTED_DATABASE_PREFIX = "caissa-puzzles-"
FORBIDDEN_DATABASE_NAMES = {"caissa-openingdb", "caissa-production-do-not-delete"}


def replace_file(source: Path, destination: Path, attempts: int = 10) -> None:
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


def hash_file(path: Path, chunk_size: int = 8 * 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(chunk_size):
            digest.update(chunk)
    return digest.hexdigest()


def metric_number(meta: dict[str, Any], key: str) -> float:
    value = meta.get(key, 0)
    if value is None:
        return 0
    return float(value)


def result_items(payload: Any) -> list[dict[str, Any]]:
    """Normalize Wrangler's list/object result envelopes without hiding errors."""
    if isinstance(payload, list):
        items: list[dict[str, Any]] = []
        for entry in payload:
            if not isinstance(entry, dict) or entry.get("success") is False:
                raise RuntimeError(f"D1 command failed: {entry!r}")
            if "meta" in entry or "success" in entry:
                items.append(entry)
                continue
            result = entry.get("results", entry.get("result", []))
            if isinstance(result, list):
                items.extend(item for item in result if isinstance(item, dict))
            elif isinstance(result, dict):
                items.append(result)
        return items
    if isinstance(payload, dict):
        if payload.get("success") is False:
            raise RuntimeError(f"D1 command failed: {payload!r}")
        result = payload.get("results", payload.get("result", payload))
        if isinstance(result, list):
            return [item for item in result if isinstance(item, dict)]
        if isinstance(result, dict):
            return [result]
    raise RuntimeError("Wrangler returned an unexpected JSON envelope")


def summarize(payload: Any) -> dict[str, float | int]:
    rows_read = 0.0
    rows_written = 0.0
    duration_ms = 0.0
    statements = 0
    for item in result_items(payload):
        meta = item.get("meta") if isinstance(item.get("meta"), dict) else {}
        rows_read += metric_number(meta, "rows_read")
        rows_written += metric_number(meta, "rows_written")
        duration_ms += metric_number(meta, "duration")
        statements += 1
    return {
        "statements": statements,
        "rowsRead": int(rows_read),
        "rowsWritten": int(rows_written),
        "d1DurationMs": round(duration_ms, 4),
    }


def parse_wrangler_json(output: str) -> Any:
    """Extract Wrangler's JSON even when Windows/npm prefixes progress or OSC text."""
    cleaned = re.sub(r"\x1b\][^\x07]*(?:\x07|\x1b\\)", "", output)
    cleaned = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", cleaned)
    decoder = json.JSONDecoder()
    starts = [match.start() for match in re.finditer(r"(?m)^\s*[\[{]", cleaned)]
    for preferred in (list, dict):
        for start in starts:
            candidate = cleaned[start:].lstrip()
            try:
                payload, _end = decoder.raw_decode(candidate)
            except json.JSONDecodeError:
                continue
            if isinstance(payload, preferred):
                return payload
    raise json.JSONDecodeError("no JSON value found", cleaned, 0)


def wrangler_json(database: str, config: Path, *, file: Path | None = None, command: str | None = None) -> Any:
    if (file is None) == (command is None):
        raise ValueError("provide exactly one of file or command")
    npx = shutil.which("npx.cmd" if os.name == "nt" else "npx")
    if not npx:
        raise RuntimeError("npx is not available on PATH")
    arguments = [
        npx, "wrangler", "d1", "execute", database,
        "--remote", "--yes", "--json", "--config", str(config),
    ]
    arguments.extend(["--file", str(file)] if file else ["--command", " ".join(str(command).split())])
    completed = subprocess.run(arguments, capture_output=True, text=True, encoding="utf-8", check=False)
    if completed.returncode:
        raise RuntimeError(
            f"Wrangler failed with exit code {completed.returncode}: "
            f"{completed.stderr.strip() or completed.stdout.strip()}"
        )
    try:
        return parse_wrangler_json(completed.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Wrangler did not return JSON: {completed.stdout[-1000:]}") from error


def artifact_order(manifest: dict[str, Any]) -> Iterable[dict[str, Any]]:
    return sorted(manifest["sql"]["artifacts"], key=lambda artifact: artifact["file"])


def validate_manifest(manifest: dict[str, Any], artifact_dir: Path) -> None:
    thresholds = manifest.get("thresholds", {})
    required = (
        thresholds.get("sqlWithinLimit") is True,
        thresholds.get("d1WithinPlanningLimit") is True,
        int(thresholds.get("maximumStatementBytes", 100_001)) <= int(thresholds.get("statementLimitBytes", 100_000)),
    )
    if not all(required):
        raise RuntimeError("artifact manifest does not pass all production thresholds")
    for artifact in artifact_order(manifest):
        path = artifact_dir / artifact["file"]
        if not path.is_file() or path.stat().st_size != int(artifact["bytes"]):
            raise RuntimeError(f"artifact missing or wrong size: {path}")
        if hash_file(path) != artifact["sha256"]:
            raise RuntimeError(f"artifact hash mismatch: {path}")


def checkpoint_template(database: str, manifest: dict[str, Any]) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "database": database,
        "catalogVersion": manifest["catalogVersion"],
        "artifactDigestSha256": manifest["sql"]["artifactDigestSha256"],
        "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "completed": [],
        "metrics": {"statements": 0, "rowsRead": 0, "rowsWritten": 0, "d1DurationMs": 0.0, "wallSeconds": 0.0},
    }


def update_metrics(total: dict[str, Any], current: dict[str, Any], wall_seconds: float) -> None:
    for key in ("statements", "rowsRead", "rowsWritten"):
        total[key] = int(total.get(key, 0)) + int(current[key])
    total["d1DurationMs"] = round(float(total.get("d1DurationMs", 0)) + float(current["d1DurationMs"]), 4)
    total["wallSeconds"] = round(float(total.get("wallSeconds", 0)) + wall_seconds, 3)


def verification_sql(catalog_version: str) -> str:
    safe_version = catalog_version.replace("'", "''")
    return f"""
select
  (select count(1) from puzzles) as puzzles,
  (select count(1) from puzzle_pool_entries) as pool_entries,
  (select count(1) from puzzle_pool_counts) as pool_counts,
  (select count(1) from puzzles where game_url like 'https://lichess.org/%') as game_urls,
  (select count(1) from catalog_metadata where key = 'source_version' and value = '{safe_version}') as version_rows;
""".strip()


def verification_queries(catalog_version: str) -> dict[str, str]:
    safe_version = catalog_version.replace("'", "''")
    return {
        "puzzles": "select count(1) as value from puzzles",
        "pool_entries": "select count(1) as value from puzzle_pool_entries",
        "pool_counts": "select count(1) as value from puzzle_pool_counts",
        "game_urls": "select count(1) as value from puzzles where game_url like 'https://lichess.org/%'",
        "version_rows": (
            "select count(1) as value from catalog_metadata "
            f"where key = 'source_version' and value = '{safe_version}'"
        ),
    }


def first_row(payload: Any) -> dict[str, Any]:
    for item in result_items(payload):
        results = item.get("results")
        if isinstance(results, list) and results and isinstance(results[0], dict):
            return results[0]
        if all(key in item for key in ("puzzles", "pool_entries")):
            return item
    raise RuntimeError("D1 verification returned no result row")


def run(args: argparse.Namespace) -> dict[str, Any]:
    normalized = args.database.lower()
    if normalized in FORBIDDEN_DATABASE_NAMES or not normalized.startswith(EXPECTED_DATABASE_PREFIX):
        raise SystemExit("refusing a database outside the versioned caissa-puzzles-* namespace")
    artifact_dir = args.manifest.resolve().parent
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    validate_manifest(manifest, artifact_dir)

    if args.checkpoint.exists():
        checkpoint = json.loads(args.checkpoint.read_text(encoding="utf-8"))
        expected_identity = (args.database, manifest["catalogVersion"], manifest["sql"]["artifactDigestSha256"])
        actual_identity = (checkpoint.get("database"), checkpoint.get("catalogVersion"), checkpoint.get("artifactDigestSha256"))
        if actual_identity != expected_identity:
            raise SystemExit("checkpoint belongs to another database or artifact")
    else:
        checkpoint = checkpoint_template(args.database, manifest)
        atomic_json(args.checkpoint, checkpoint)

    completed = set(checkpoint["completed"])
    imported_now = 0
    for artifact in artifact_order(manifest):
        name = artifact["file"]
        if name in completed:
            continue
        started = time.perf_counter()
        payload = wrangler_json(args.database, args.config, file=artifact_dir / name)
        wall_seconds = time.perf_counter() - started
        current = summarize(payload)
        checkpoint["completed"].append(name)
        update_metrics(checkpoint["metrics"], current, wall_seconds)
        checkpoint["lastCompletedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        atomic_json(args.checkpoint, checkpoint)
        imported_now += 1
        print(json.dumps({"file": name, "artifactRows": artifact["rows"], **current, "wallSeconds": round(wall_seconds, 3)}), flush=True)
        if args.max_artifacts and imported_now >= args.max_artifacts:
            return checkpoint

    expected = {
        "puzzles": int(manifest["candidate"]["puzzles"]),
        "pool_entries": int(manifest["candidate"]["poolEntries"]),
        "pool_counts": int(manifest["candidate"]["poolCounts"]),
        "game_urls": int(manifest["candidate"]["gameUrls"]),
        "version_rows": 1,
    }
    actual: dict[str, int] = {}
    verification_metrics: dict[str, Any] = {
        "statements": 0,
        "rowsRead": 0,
        "rowsWritten": 0,
        "d1DurationMs": 0.0,
        "wallSeconds": 0.0,
    }
    for key, query in verification_queries(manifest["catalogVersion"]).items():
        verification_started = time.perf_counter()
        payload = wrangler_json(args.database, args.config, command=query)
        verification_wall_seconds = time.perf_counter() - verification_started
        actual[key] = int(first_row(payload).get("value", -1))
        update_metrics(verification_metrics, summarize(payload), verification_wall_seconds)
    if actual != expected:
        raise RuntimeError(f"remote verification mismatch: {actual} != {expected}")
    checkpoint["remoteVerification"] = actual
    checkpoint["verificationMetrics"] = verification_metrics
    checkpoint["completedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    checkpoint["complete"] = True
    atomic_json(args.checkpoint, checkpoint)
    return checkpoint


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--database", required=True)
    parser.add_argument("--config", type=Path, default=Path("cloudflare-puzzles-worker/wrangler.toml"))
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--max-artifacts", type=int, default=0, help="Stop after N new artifacts; zero imports all")
    args = parser.parse_args()
    if not args.manifest.is_file():
        parser.error(f"manifest does not exist: {args.manifest}")
    if not args.config.is_file():
        parser.error(f"Wrangler config does not exist: {args.config}")
    args.checkpoint = args.checkpoint.resolve()
    args.checkpoint.parent.mkdir(parents=True, exist_ok=True)
    result = run(args)
    print(json.dumps(result, indent=2), flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("import interrupted; rerun the same command to resume", file=sys.stderr)
        raise SystemExit(130)
