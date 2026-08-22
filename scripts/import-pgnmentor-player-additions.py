#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import io
import json
import re
import shutil
import tempfile
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / 'data/pgn/pgnmentor-player-additions.json'
OUTPUT = ROOT / 'public/data/pgn/players-mentor'
MANIFEST = OUTPUT / 'manifest.json'
MAX_ZIP_BYTES = 12 * 1024 * 1024
MAX_PGN_BYTES = 20 * 1024 * 1024
EVENT_RE = re.compile(br'^\[Event\s+"', re.MULTILINE)
UA = 'CAISSA-Chess-PGN-Archive/1.0 (+https://www.caissa-chess.org/)'


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/zip,*/*;q=0.1'})
    with urllib.request.urlopen(req, timeout=90) as r:
        declared = int(r.headers.get('Content-Length') or 0)
        if declared > MAX_ZIP_BYTES:
            raise RuntimeError(f'zip too large: {url}')
        data = r.read(MAX_ZIP_BYTES + 1)
    if len(data) > MAX_ZIP_BYTES:
        raise RuntimeError(f'zip exceeded limit: {url}')
    return data


def slug(album_id: str) -> str:
    prefix = 'pgnmentor-'
    if not album_id.startswith(prefix):
        raise RuntimeError(f'bad id: {album_id}')
    value = album_id[len(prefix):]
    if not re.fullmatch(r'[a-z0-9-]+', value):
        raise RuntimeError(f'unsafe slug: {value}')
    return value


def extract_single_pgn(data: bytes, title: str) -> bytes:
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        members = [m for m in zf.infolist() if not m.is_dir() and m.filename.lower().endswith('.pgn')]
        if len(members) != 1:
            raise RuntimeError(f'{title}: expected one PGN in zip, found {len(members)}')
        member = members[0]
        if member.file_size > MAX_PGN_BYTES:
            raise RuntimeError(f'{title}: expanded PGN exceeds limit')
        pgn = zf.read(member)
    if len(pgn) > MAX_PGN_BYTES or b'\x00' in pgn:
        raise RuntimeError(f'{title}: invalid PGN payload')
    if b'[Event ' not in pgn or b'[White ' not in pgn or b'[Black ' not in pgn:
        raise RuntimeError(f'{title}: missing PGN tags')
    return pgn


def main() -> None:
    cfg = json.loads(CATALOG.read_text(encoding='utf-8'))
    albums = cfg['albums']
    if len(albums) != 16:
        raise RuntimeError(f'expected 16 additions, found {len(albums)}')
    records = []
    with tempfile.TemporaryDirectory(prefix='caissa-pgnmentor-') as temp_name:
        temp = Path(temp_name)
        for i, album in enumerate(albums, 1):
            url = cfg['source'] + album['file']
            pgn = extract_single_pgn(fetch(url), album['title'])
            games = len(EVENT_RE.findall(pgn))
            if games != int(album['expectedGames']):
                raise RuntimeError(f"{album['title']}: expected {album['expectedGames']} games, got {games}")
            filename = slug(album['id']) + '.pgn'
            (temp / filename).write_bytes(pgn)
            records.append({
                'id': album['id'], 'title': album['title'], 'sourceUrl': url,
                'localPath': f'/data/pgn/players-mentor/{filename}',
                'bytes': len(pgn), 'games': games, 'sha256': hashlib.sha256(pgn).hexdigest(),
                'access': 'available', 'credits': 1,
            })
            print(f'[{i:02d}/16] {album["title"]}: {games} games, {len(pgn):,} bytes')

        OUTPUT.mkdir(parents=True, exist_ok=True)
        for old in OUTPUT.glob('*.pgn'):
            old.unlink()
        for file in temp.glob('*.pgn'):
            shutil.copy2(file, OUTPUT / file.name)
        MANIFEST.write_text(json.dumps({
            'schemaVersion': 1,
            'collection': 'CAISSA PGN Mentor Player Additions',
            'sourceDirectory': cfg['source'],
            'importedAt': datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            'collectionCount': len(records),
            'runtimeDependencyOnSource': False,
            'provenanceNote': 'Archived from PGN Mentor player downloads. Verify reuse/commercial rights separately before monetization.',
            'albums': records,
        }, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
