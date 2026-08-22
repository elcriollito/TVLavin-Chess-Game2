#!/usr/bin/env python3
"""Archive selected PGN Mentor player collections inside CAISSA.

The upstream player downloads are ZIP files. This importer downloads only the
explicitly allowlisted players in data/pgn/pgnmentor-player-import.json,
validates/extracts one PGN from each ZIP, writes immutable-ish provenance
metadata, and generates the browser catalog against CAISSA-local paths.
"""
from __future__ import annotations

import hashlib
import io
import json
import re
import shutil
import tempfile
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "data/pgn/pgnmentor-player-import.json"
OUTPUT_DIR = ROOT / "public/data/pgn/players/pgnmentor"
MANIFEST_PATH = OUTPUT_DIR / "manifest.json"
CLIENT_CATALOG = ROOT / "js/pgn-replayer/pgn-mentor-player-catalog.js"
MAX_ZIP_BYTES = 20 * 1024 * 1024
MAX_PGN_BYTES = 30 * 1024 * 1024
MAX_COMPRESSION_RATIO = 120
MIN_BYTES = 100
USER_AGENT = "CAISSA-Chess-PGN-Archive/1.0 (+https://www.caissa-chess.org/)"
EVENT_RE = re.compile(br'^\[Event\s+"', re.MULTILINE)
SAFE_SLUG_RE = re.compile(r"[a-z0-9-]+")


def fetch_bytes(url: str, limit: int) -> bytes:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/zip, application/octet-stream;q=0.9, */*;q=0.1",
        },
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        declared = int(response.headers.get("Content-Length") or 0)
        if declared > limit:
            raise RuntimeError(f"declared size exceeds {limit} bytes: {url}")
        data = response.read(limit + 1)
    if len(data) > limit:
        raise RuntimeError(f"download exceeds {limit} bytes: {url}")
    return data


def extract_single_pgn(zip_bytes: bytes, expected_file: str, title: str) -> bytes:
    if not zip_bytes.startswith(b"PK"):
        raise RuntimeError(f"{title}: upstream response is not a ZIP archive")
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as archive:
        members = [item for item in archive.infolist() if not item.is_dir() and item.filename.lower().endswith(".pgn")]
        if not members:
            raise RuntimeError(f"{title}: ZIP contains no PGN file")
        exact = [item for item in members if Path(item.filename).name.casefold() == expected_file.casefold()]
        member = exact[0] if exact else (members[0] if len(members) == 1 else None)
        if member is None:
            raise RuntimeError(f"{title}: ZIP contains multiple unexpected PGN files")
        if member.file_size > MAX_PGN_BYTES:
            raise RuntimeError(f"{title}: extracted PGN exceeds {MAX_PGN_BYTES} bytes")
        compressed = max(member.compress_size, 1)
        if member.file_size > 2 * 1024 * 1024 and member.file_size / compressed > MAX_COMPRESSION_RATIO:
            raise RuntimeError(f"{title}: suspicious ZIP compression ratio")
        if Path(member.filename).name != member.filename.replace("\\", "/").split("/")[-1]:
            raise RuntimeError(f"{title}: unsafe ZIP member path")
        data = archive.read(member)
    return data


def validate_pgn(data: bytes, title: str) -> int:
    if len(data) < MIN_BYTES:
        raise RuntimeError(f"{title}: PGN is unexpectedly small ({len(data)} bytes)")
    if b"\x00" in data:
        raise RuntimeError(f"{title}: NUL byte found")
    if b"[Event " not in data or b"[White " not in data or b"[Black " not in data:
        raise RuntimeError(f"{title}: required PGN tags are missing")
    games = len(EVENT_RE.findall(data))
    if games < 1:
        raise RuntimeError(f"{title}: no PGN games detected")
    return games


def local_slug(album_id: str) -> str:
    prefix = "pgnmentor-"
    if not album_id.startswith(prefix):
        raise RuntimeError(f"unexpected album id: {album_id}")
    slug = album_id[len(prefix):]
    if not SAFE_SLUG_RE.fullmatch(slug):
        raise RuntimeError(f"unsafe album slug: {slug}")
    return slug


def js_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def write_client_catalog(records: list[dict]) -> None:
    entries = []
    for record in records:
        entries.append(
            "        { id: %s, title: %s, details: %s, games: %d, source: %s }"
            % (
                js_string(record["id"]),
                js_string(record["title"]),
                js_string(f'{record["games"]:,} games · CAISSA physical archive'),
                record["games"],
                js_string(record["localPath"]),
            )
        )
    array_text = ",\n".join(entries)
    content = f"""(function () {{
    'use strict';

    const MENTOR_PLAYER_ALBUMS = Object.freeze([\n{array_text}\n    ]);
    const albumRoot = document.querySelector('[data-pgn-albums]');
    const fileInput = document.querySelector('[data-pgn-file]');
    if (!albumRoot || !fileInput) return;

    let selectedAlbumId = null;
    let syntheticImport = false;
    let renderQueued = false;

    function createAlbumCard(album) {{
        const item = document.createElement('div');
        item.setAttribute('role', 'listitem');
        item.dataset.mentorPlayerAlbumItem = album.id;
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'pgn-album-card';
        card.dataset.mentorPlayerAlbumId = album.id;
        card.dataset.albumKind = 'player-premium';
        card.dataset.creditCost = '1';
        card.setAttribute('aria-current', String(album.id === selectedAlbumId));
        const icon = document.createElement('i');
        icon.className = 'fas fa-chess-knight';
        icon.setAttribute('aria-hidden', 'true');
        const copy = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = album.title;
        const details = document.createElement('small');
        details.textContent = album.details;
        copy.append(title, details);
        const badge = document.createElement('span');
        badge.className = 'pgn-album-badge';
        badge.dataset.access = 'available';
        badge.textContent = '1 credit';
        card.append(icon, copy, badge);
        item.append(card);
        return item;
    }}

    function renderCatalog() {{
        renderQueued = false;
        const existingIds = new Set([...albumRoot.querySelectorAll('[data-mentor-player-album-id]')].map(card => card.dataset.mentorPlayerAlbumId));
        for (const album of MENTOR_PLAYER_ALBUMS) {{
            if (existingIds.has(album.id)) continue;
            albumRoot.append(createAlbumCard(album));
        }}
        albumRoot.querySelectorAll('[data-mentor-player-album-id]').forEach(card => {{
            card.setAttribute('aria-current', String(card.dataset.mentorPlayerAlbumId === selectedAlbumId));
        }});
        if (selectedAlbumId) albumRoot.querySelector('[data-album-id="local-import"]')?.closest('[role="listitem"]')?.remove();
    }}

    function queueRender() {{
        if (renderQueued) return;
        renderQueued = true;
        queueMicrotask(renderCatalog);
    }}

    new MutationObserver(queueRender).observe(albumRoot, {{ childList: true }});

    albumRoot.addEventListener('click', async event => {{
        const card = event.target.closest('[data-mentor-player-album-id]');
        if (!card) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const album = MENTOR_PLAYER_ALBUMS.find(item => item.id === card.dataset.mentorPlayerAlbumId);
        if (!album) return;
        selectedAlbumId = album.id;
        renderCatalog();
        card.disabled = true;
        try {{
            const response = await fetch(album.source, {{ credentials: 'same-origin', cache: 'force-cache', headers: {{ Accept: 'text/plain' }} }});
            if (!response.ok) throw new Error('The collection is temporarily unavailable.');
            const bytes = await response.arrayBuffer();
            if (bytes.byteLength > 10 * 1024 * 1024) throw new Error('This collection exceeds the 10 MiB replayer safety limit.');
            const transfer = new DataTransfer();
            transfer.items.add(new File([bytes], `${{album.title}}.pgn`, {{ type: 'application/x-chess-pgn' }}));
            syntheticImport = true;
            try {{
                fileInput.files = transfer.files;
                fileInput.dispatchEvent(new Event('change', {{ bubbles: true }}));
            }} finally {{
                syntheticImport = false;
            }}
        }} catch (error) {{
            selectedAlbumId = null;
            renderCatalog();
            const message = document.querySelector('[data-pgn-message]');
            if (message) {{
                message.textContent = error?.message || 'The collection could not be opened.';
                message.dataset.tone = 'error';
                message.hidden = false;
            }}
        }} finally {{
            card.disabled = false;
        }}
    }}, true);

    fileInput.addEventListener('change', () => {{
        if (!syntheticImport) {{
            selectedAlbumId = null;
            queueRender();
        }}
    }}, true);

    renderCatalog();
}})();
"""
    CLIENT_CATALOG.write_text(content, encoding="utf-8", newline="\n")


def main() -> None:
    spec = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    base_url = spec["source"]
    albums = spec["albums"]
    if len(albums) != 16:
        raise RuntimeError(f"expected exactly 16 selected PGN Mentor players, found {len(albums)}")

    records: list[dict] = []
    seen_ids: set[str] = set()
    seen_zips: set[str] = set()

    with tempfile.TemporaryDirectory(prefix="caissa-pgnmentor-players-") as temp_name:
        temp_dir = Path(temp_name)
        for index, album in enumerate(albums, start=1):
            album_id = album["id"]
            title = album["title"]
            expected_file = album["file"]
            zip_name = album["zip"]
            if album_id in seen_ids or zip_name in seen_zips:
                raise RuntimeError(f"duplicate selected player: {title}")
            seen_ids.add(album_id)
            seen_zips.add(zip_name)

            zip_url = urllib.parse.urljoin(base_url, urllib.parse.quote(zip_name, safe=""))
            zip_bytes = fetch_bytes(zip_url, MAX_ZIP_BYTES)
            pgn_bytes = extract_single_pgn(zip_bytes, expected_file, title)
            games = validate_pgn(pgn_bytes, title)
            slug = local_slug(album_id)
            filename = f"{slug}.pgn"
            (temp_dir / filename).write_bytes(pgn_bytes)
            pgn_sha = hashlib.sha256(pgn_bytes).hexdigest()
            zip_sha = hashlib.sha256(zip_bytes).hexdigest()
            records.append({
                "id": album_id,
                "title": title,
                "sourceFile": expected_file,
                "sourceZip": zip_name,
                "sourceUrl": zip_url,
                "localPath": f"/data/pgn/players/pgnmentor/{filename}",
                "bytes": len(pgn_bytes),
                "sourceZipBytes": len(zip_bytes),
                "games": games,
                "sha256": pgn_sha,
                "sourceZipSha256": zip_sha,
                "credits": 1,
            })
            print(f"[{index:02d}/16] {title}: {games} games, {len(pgn_bytes):,} bytes, sha256={pgn_sha[:12]}…")

        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        for old_file in OUTPUT_DIR.glob("*.pgn"):
            old_file.unlink()
        for file in temp_dir.glob("*.pgn"):
            shutil.copy2(file, OUTPUT_DIR / file.name)

    total_bytes = sum(record["bytes"] for record in records)
    manifest = {
        "schemaVersion": 1,
        "collection": "CAISSA PGN Mentor Player Additions",
        "sourceDirectory": base_url,
        "importedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "collectionCount": len(records),
        "totalBytes": total_bytes,
        "runtimeDependencyOnSource": False,
        "credits": 1,
        "provenanceNote": "Selected historical/championship player archives extracted from PGN Mentor ZIP downloads. CAISSA serves local copies at runtime. Verify source/reuse and commercial rights separately before enforcing paid access.",
        "albums": records,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    write_client_catalog(records)
    print(f"Archived {len(records)} PGN Mentor player collections ({total_bytes:,} bytes).")
    print(f"Manifest: {MANIFEST_PATH}")
    print(f"Client catalog: {CLIENT_CATALOG}")


if __name__ == "__main__":
    main()
