#!/usr/bin/env python3
"""One-time archival import of curated SmallChess player PGN collections.

Downloads the allowlisted source catalog into CAISSA-owned static storage,
validates every file, writes hashes/provenance metadata, and switches the
PGN album catalog from the temporary runtime proxy to local CAISSA paths.
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
CATALOG_PATH = ROOT / "data/pgn/smallchess-player-import.json"
OUTPUT_DIR = ROOT / "public/data/pgn/players"
MANIFEST_PATH = OUTPUT_DIR / "manifest.json"
ALBUM_JS = ROOT / "js/pgn-replayer/pgn-album-catalog.js"
MAX_BYTES = 10 * 1024 * 1024
MIN_BYTES = 100
USER_AGENT = "CAISSA-Chess-PGN-Archive/1.0 (+https://www.caissa-chess.org/)"
EVENT_RE = re.compile(br'^\[Event\s+"', re.MULTILINE)


def fetch_bytes(url: str) -> bytes:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/plain, application/x-chess-pgn;q=0.9, */*;q=0.1",
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
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
    if b"[Event " not in data or b"[White " not in data or b"[Black " not in data:
        raise RuntimeError(f"{title}: missing required PGN tags")
    games = len(EVENT_RE.findall(data))
    if games < 1:
        raise RuntimeError(f"{title}: no PGN games detected")
    return games


def local_filename(album_id: str) -> str:
    prefix = "smallchess-"
    if not album_id.startswith(prefix):
        raise RuntimeError(f"unexpected album id: {album_id}")
    slug = album_id[len(prefix):]
    if not re.fullmatch(r"[a-z0-9-]+", slug):
        raise RuntimeError(f"unsafe album slug: {slug}")
    return f"{slug}.pgn"


def switch_catalog_to_local() -> None:
    text = ALBUM_JS.read_text(encoding="utf-8")
    proxy_line = "const response = await fetch(`/api/pgn/smallchess?file=${encodeURIComponent(album.file)}`, { credentials: 'same-origin', cache: 'force-cache', headers: { Accept: 'text/plain' } });"
    local_lines = "const localSource = `/data/pgn/players/${album.id.replace(/^smallchess-/, '')}.pgn`;\n            const response = await fetch(localSource, { credentials: 'same-origin', cache: 'force-cache', headers: { Accept: 'text/plain' } });"
    if proxy_line in text:
        text = text.replace(proxy_line, local_lines, 1)
        ALBUM_JS.write_text(text, encoding="utf-8", newline="\n")
    elif "const localSource = `/data/pgn/players/" not in text:
        raise RuntimeError("album catalog did not contain the expected proxy or local source code")


def main() -> None:
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    base_url = catalog["source"]
    albums = catalog["albums"]
    if len(albums) != 65:
        raise RuntimeError(f"expected exactly 65 curated albums, found {len(albums)}")

    seen_ids: set[str] = set()
    seen_files: set[str] = set()
    records: list[dict] = []

    with tempfile.TemporaryDirectory(prefix="caissa-pgn-import-") as temp_name:
        temp_dir = Path(temp_name)
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
            filename = local_filename(album_id)
            (temp_dir / filename).write_bytes(data)
            digest = hashlib.sha256(data).hexdigest()
            records.append(
                {
                    "id": album_id,
                    "title": title,
                    "sourceFile": source_file,
                    "sourceUrl": source_url,
                    "localPath": f"/data/pgn/players/{filename}",
                    "bytes": len(data),
                    "games": games,
                    "sha256": digest,
                }
            )
            print(f"[{index:02d}/65] {title}: {games} games, {len(data):,} bytes, sha256={digest[:12]}…")

        total_bytes = sum(record["bytes"] for record in records)
        manifest = {
            "schemaVersion": 1,
            "collection": "CAISSA Player PGN Archive",
            "sourceDirectory": base_url,
            "importedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            "collectionCount": len(records),
            "totalBytes": total_bytes,
            "runtimeDependencyOnSource": False,
            "provenanceNote": "Archived from the public SmallChess /Games directory. CAISSA serves these local copies at runtime. Verify source/reuse rights separately before monetization.",
            "albums": records,
        }

        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        for old_file in OUTPUT_DIR.glob("*.pgn"):
            old_file.unlink()
        for file in temp_dir.glob("*.pgn"):
            shutil.copy2(file, OUTPUT_DIR / file.name)
        MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")

    switch_catalog_to_local()
    print(f"Imported {len(records)} collections ({total_bytes:,} bytes) into {OUTPUT_DIR}")
    print(f"Manifest: {MANIFEST_PATH}")
    print("PGN Replayer album catalog switched to CAISSA-local runtime paths.")


if __name__ == "__main__":
    main()
