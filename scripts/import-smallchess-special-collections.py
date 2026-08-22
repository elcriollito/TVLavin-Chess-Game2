#!/usr/bin/env python3
"""Archive the curated SmallChess tournament/special PGN catalog for CAISSA.

Free SEO collections are copied into public static storage. Master Database is
preserved separately as an archive-only premium source so the web UI does not
accidentally publish it as a free runtime asset. The repository itself is public,
so this archive is provenance/preservation, not a secure entitlement boundary.
"""
from __future__ import annotations

import hashlib
import json
import re
import shutil
import tempfile
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "data/pgn/smallchess-special-import.json"
FREE_DIR = ROOT / "public/data/pgn/free"
PREMIUM_DIR = ROOT / "data/pgn/premium-archive"
MANIFEST_PATH = ROOT / "data/pgn/special-collections-manifest.json"
FREE_MANIFEST_PATH = FREE_DIR / "manifest.json"
MAX_BYTES = 20 * 1024 * 1024
MIN_BYTES = 250
USER_AGENT = "CAISSA-Chess-PGN-Archive/1.1 (+https://www.caissa-chess.org/)"
EVENT_RE = re.compile(br'^\[Event\s+"', re.MULTILINE)
SAFE_ID_RE = re.compile(r"^smallchess-[a-z0-9-]+$")


def fetch_bytes(url: str) -> bytes:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/plain, application/x-chess-pgn;q=0.9, */*;q=0.1",
        },
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        declared = int(response.headers.get("Content-Length") or 0)
        if declared > MAX_BYTES:
            raise RuntimeError(f"declared size exceeds {MAX_BYTES} bytes: {url}")
        data = response.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise RuntimeError(f"download exceeds {MAX_BYTES} bytes: {url}")
    return data


def validate_pgn(data: bytes, title: str) -> int:
    if len(data) < MIN_BYTES:
        raise RuntimeError(f"{title}: file is unexpectedly small ({len(data)} bytes)")
    if b"\x00" in data:
        raise RuntimeError(f"{title}: NUL byte found")
    required = (b"[Event ", b"[White ", b"[Black ")
    if any(tag not in data for tag in required):
        raise RuntimeError(f"{title}: missing required PGN tags")
    games = len(EVENT_RE.findall(data))
    if games < 1:
        raise RuntimeError(f"{title}: no PGN games detected")
    return games


def slug_from_id(album_id: str) -> str:
    if not SAFE_ID_RE.fullmatch(album_id):
        raise RuntimeError(f"unsafe album id: {album_id}")
    return album_id.removeprefix("smallchess-")


def record_for(album: dict, source_url: str, data: bytes, games: int, runtime_path: str | None, archive_path: str) -> dict:
    return {
        "id": album["id"],
        "title": album["title"],
        "sourceFile": album["file"],
        "sourceUrl": source_url,
        "access": album["access"],
        "credits": int(album.get("credits") or 0),
        "runtime": album["runtime"],
        "runtimePath": runtime_path,
        "archivePath": archive_path,
        "bytes": len(data),
        "games": games,
        "sha256": hashlib.sha256(data).hexdigest(),
    }


def main() -> None:
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    base_url = catalog["source"]
    albums = catalog["albums"]
    if len(albums) != 12:
        raise RuntimeError(f"expected exactly 12 curated special albums, found {len(albums)}")

    seen_ids: set[str] = set()
    seen_files: set[str] = set()
    records: list[dict] = []

    with tempfile.TemporaryDirectory(prefix="caissa-special-pgn-") as temp_name:
        temp_root = Path(temp_name)
        temp_free = temp_root / "free"
        temp_premium = temp_root / "premium"
        temp_free.mkdir(parents=True)
        temp_premium.mkdir(parents=True)

        for index, album in enumerate(albums, start=1):
            album_id = album["id"]
            source_file = album["file"]
            title = album["title"]
            if album_id in seen_ids or source_file in seen_files:
                raise RuntimeError(f"duplicate catalog entry: {title}")
            seen_ids.add(album_id)
            seen_files.add(source_file)

            encoded = urllib.parse.quote(source_file, safe="")
            source_url = urllib.parse.urljoin(base_url, encoded)
            data = fetch_bytes(source_url)
            games = validate_pgn(data, title)
            slug = slug_from_id(album_id)
            filename = f"{slug}.pgn"

            if album["runtime"] == "public":
                destination = temp_free / filename
                runtime_path = f"/data/pgn/free/{filename}"
                archive_path = f"public/data/pgn/free/{filename}"
            elif album["runtime"] == "archive-only":
                destination = temp_premium / filename
                runtime_path = None
                archive_path = f"data/pgn/premium-archive/{filename}"
            else:
                raise RuntimeError(f"{title}: unsupported runtime mode {album['runtime']!r}")

            destination.write_bytes(data)
            records.append(record_for(album, source_url, data, games, runtime_path, archive_path))
            print(f"[{index:02d}/12] {title}: {games:,} games, {len(data):,} bytes")

        free_records = [record for record in records if record["access"] == "free"]
        premium_records = [record for record in records if record["access"] != "free"]
        if len(free_records) != 11 or len(premium_records) != 1:
            raise RuntimeError("expected 11 free collections and exactly 1 premium archive")
        if premium_records[0]["id"] != "smallchess-master-database" or premium_records[0]["credits"] != 5:
            raise RuntimeError("Master Database must remain the 5-credit premium archive")

        FREE_DIR.mkdir(parents=True, exist_ok=True)
        PREMIUM_DIR.mkdir(parents=True, exist_ok=True)
        for old_file in FREE_DIR.glob("*.pgn"):
            old_file.unlink()
        for old_file in PREMIUM_DIR.glob("*.pgn"):
            old_file.unlink()
        for file in temp_free.glob("*.pgn"):
            shutil.copy2(file, FREE_DIR / file.name)
        for file in temp_premium.glob("*.pgn"):
            shutil.copy2(file, PREMIUM_DIR / file.name)

    imported_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    manifest = {
        "schemaVersion": 1,
        "collection": "CAISSA Special PGN Archive",
        "sourceDirectory": base_url,
        "importedAt": imported_at,
        "collectionCount": len(records),
        "freeCollectionCount": len([r for r in records if r["access"] == "free"]),
        "premiumCollectionCount": len([r for r in records if r["access"] != "free"]),
        "totalBytes": sum(r["bytes"] for r in records),
        "pricing": {
            "freeSpecialCollections": 0,
            "masterDatabase": 5,
            "capablanca": 1,
            "playerCollectionTarget": 1,
        },
        "securityNote": "Master Database is not exposed as a CAISSA runtime URL by this import. Because this GitHub repository is public, repository storage alone is not a secure paid-content vault; migrate premium PGNs behind authenticated private storage before enforcing credit purchases.",
        "provenanceNote": "Archived from the public SmallChess /Games directory. Verify source/reuse and commercial rights separately before monetization.",
        "albums": records,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")

    public_manifest = {
        "schemaVersion": 1,
        "collection": "CAISSA Free PGN Collections",
        "importedAt": imported_at,
        "collectionCount": len([r for r in records if r["access"] == "free"]),
        "albums": [
            {
                key: record[key]
                for key in ("id", "title", "runtimePath", "bytes", "games", "sha256")
            }
            for record in records
            if record["access"] == "free"
        ],
    }
    FREE_MANIFEST_PATH.write_text(json.dumps(public_manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")

    print(f"Archived {len(records)} special collections ({manifest['totalBytes']:,} bytes).")
    print(f"Free runtime files: {len(public_manifest['albums'])} in {FREE_DIR}")
    print(f"Premium archive: {PREMIUM_DIR / 'master-database.pgn'}")
    print(f"Manifest: {MANIFEST_PATH}")


if __name__ == "__main__":
    main()
