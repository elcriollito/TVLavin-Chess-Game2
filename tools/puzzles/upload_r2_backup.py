#!/usr/bin/env python3
"""Upload the verified puzzle source, manifest, and SQL backup to dedicated R2."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


EXPECTED_BUCKET = "caissa-puzzles"
MAX_WRANGLER_OBJECT_BYTES = 300 * 1024 * 1024


def replace_file(source: Path, destination: Path, attempts: int = 10) -> None:
    for attempt in range(attempts):
        try:
            os.replace(source, destination)
            return
        except PermissionError:
            if attempt + 1 == attempts:
                raise
            time.sleep(0.05 * (attempt + 1))


def hash_file(path: Path, chunk_size: int = 8 * 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(chunk_size):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_json(path: Path, value: object) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    replace_file(temporary, path)


def upload(bucket: str, key: str, path: Path, content_type: str) -> float:
    npx = shutil.which("npx.cmd" if os.name == "nt" else "npx")
    if not npx:
        raise RuntimeError("npx is not available on PATH")
    started = time.perf_counter()
    completed = subprocess.run(
        [
            npx, "wrangler", "r2", "object", "put", f"{bucket}/{key}",
            "--remote", "--file", str(path), "--content-type", content_type,
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )
    if completed.returncode:
        raise RuntimeError(
            f"R2 upload failed for {key}: {completed.stderr.strip() or completed.stdout.strip()}"
        )
    return time.perf_counter() - started


def objects(manifest: dict[str, Any], artifact_dir: Path, source: Path, prefix: str):
    yield {
        "key": f"{prefix}/source/{source.name}",
        "path": source,
        "bytes": source.stat().st_size,
        "sha256": hash_file(source),
        "contentType": "application/zstd",
    }
    manifest_path = artifact_dir / "manifest.json"
    yield {
        "key": f"{prefix}/manifest.json",
        "path": manifest_path,
        "bytes": manifest_path.stat().st_size,
        "sha256": hash_file(manifest_path),
        "contentType": "application/json",
    }
    for artifact in sorted(manifest["sql"]["artifacts"], key=lambda item: item["file"]):
        path = artifact_dir / artifact["file"]
        yield {
            "key": f"{prefix}/d1-sql/{path.name}",
            "path": path,
            "bytes": int(artifact["bytes"]),
            "sha256": artifact["sha256"],
            "contentType": "application/sql",
        }


def run(args: argparse.Namespace) -> dict[str, Any]:
    if args.bucket != EXPECTED_BUCKET:
        raise SystemExit(f"refusing bucket {args.bucket!r}; backup target must be {EXPECTED_BUCKET!r}")
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    if not all((
        manifest.get("thresholds", {}).get("sqlWithinLimit") is True,
        manifest.get("thresholds", {}).get("d1WithinPlanningLimit") is True,
        manifest.get("source", {}).get("integrityCheck") == "ok",
        manifest.get("candidate", {}).get("integrityCheck") == "ok",
    )):
        raise SystemExit("manifest has not passed the full production build gate")
    artifact_dir = args.manifest.resolve().parent
    planned = list(objects(manifest, artifact_dir, args.source.resolve(), args.prefix.strip("/")))
    for item in planned:
        path = item["path"]
        if not path.is_file() or path.stat().st_size != item["bytes"] or hash_file(path) != item["sha256"]:
            raise RuntimeError(f"local backup object failed verification: {path}")
        if item["bytes"] > MAX_WRANGLER_OBJECT_BYTES:
            raise RuntimeError(f"object exceeds Wrangler's single-object safety limit: {path}")

    if args.checkpoint.exists():
        checkpoint = json.loads(args.checkpoint.read_text(encoding="utf-8"))
        if checkpoint.get("bucket") != args.bucket or checkpoint.get("prefix") != args.prefix.strip("/"):
            raise SystemExit("checkpoint belongs to another R2 target")
    else:
        checkpoint = {
            "schemaVersion": 1,
            "bucket": args.bucket,
            "prefix": args.prefix.strip("/"),
            "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "uploaded": [],
            "bytes": 0,
        }
        atomic_json(args.checkpoint, checkpoint)

    completed = {item["key"] for item in checkpoint["uploaded"]}
    uploaded_now = 0
    for item in planned:
        if item["key"] in completed:
            continue
        elapsed = upload(args.bucket, item["key"], item["path"], item["contentType"])
        record = {key: item[key] for key in ("key", "bytes", "sha256")}
        record["wallSeconds"] = round(elapsed, 3)
        checkpoint["uploaded"].append(record)
        checkpoint["bytes"] = int(checkpoint["bytes"]) + int(item["bytes"])
        checkpoint["lastCompletedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        atomic_json(args.checkpoint, checkpoint)
        uploaded_now += 1
        print(json.dumps(record), flush=True)
        if args.max_objects and uploaded_now >= args.max_objects:
            return checkpoint
    checkpoint["complete"] = True
    checkpoint["completedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    atomic_json(args.checkpoint, checkpoint)
    return checkpoint


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("source", type=Path)
    parser.add_argument("--bucket", default=EXPECTED_BUCKET)
    parser.add_argument("--prefix", default="catalogs/2026-09-10")
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--max-objects", type=int, default=0)
    args = parser.parse_args()
    for path in (args.manifest, args.source):
        if not path.is_file():
            parser.error(f"file does not exist: {path}")
    args.checkpoint = args.checkpoint.resolve()
    args.checkpoint.parent.mkdir(parents=True, exist_ok=True)
    print(json.dumps(run(args), indent=2), flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("R2 upload interrupted; rerun the same command to resume", file=sys.stderr)
        raise SystemExit(130)
