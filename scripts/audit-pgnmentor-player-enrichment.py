#!/usr/bin/env python3
"""Compare selected PGN Mentor player archives with CAISSA local albums.

This is deliberately report-only. Remote player PGNs are downloaded to memory,
normalized into conservative mainline fingerprints, compared with CAISSA's
physical player archives, and discarded. No remote player PGN is written into
public runtime storage and no merge is performed.
"""
from __future__ import annotations

import hashlib
import io
import json
import re
import urllib.parse
import urllib.request
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGETS_PATH = ROOT / "data/pgn/pgnmentor-enrichment-targets.json"
REPORT_PATH = ROOT / "data/pgn/pgnmentor-player-enrichment-report.json"
MAX_ZIP_BYTES = 32 * 1024 * 1024
MAX_PGN_BYTES = 40 * 1024 * 1024
MAX_COMPRESSION_RATIO = 150
USER_AGENT = "CAISSA-Chess-PGN-Enrichment-Audit/1.0 (+https://www.caissa-chess.org/)"
EVENT_START_RE = re.compile(br'(?m)^\[Event\s+"')
TAG_RE = re.compile(r'^\[([A-Za-z0-9_]+)\s+"((?:\\.|[^"\\])*)"\]\s*$', re.MULTILINE)
BRACE_COMMENT_RE = re.compile(r'\{.*?\}', re.DOTALL)
SEMICOLON_COMMENT_RE = re.compile(r';[^\r\n]*')
NAG_RE = re.compile(r'\$\d+')
MOVE_NUMBER_RE = re.compile(r'(?<!\S)\d+\.(?:\.\.)?')
RESULT_RE = re.compile(r'(?<!\S)(?:1-0|0-1|1/2-1/2|\*)(?!\S)')
WHITESPACE_RE = re.compile(r'\s+')


def fetch_bytes(url: str, limit: int) -> bytes:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/zip, application/octet-stream;q=0.9, */*;q=0.1",
        },
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        declared = int(response.headers.get("Content-Length") or 0)
        if declared > limit:
            raise RuntimeError(f"declared size exceeds {limit} bytes: {url}")
        data = response.read(limit + 1)
    if len(data) > limit:
        raise RuntimeError(f"download exceeds {limit} bytes: {url}")
    return data


def extract_single_pgn(zip_bytes: bytes, title: str) -> tuple[bytes, str]:
    if not zip_bytes.startswith(b"PK"):
        raise RuntimeError(f"{title}: upstream response is not a ZIP archive")
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as archive:
        members = [item for item in archive.infolist() if not item.is_dir() and item.filename.lower().endswith(".pgn")]
        if len(members) != 1:
            raise RuntimeError(f"{title}: expected exactly one PGN in ZIP, found {len(members)}")
        member = members[0]
        leaf = member.filename.replace("\\", "/").split("/")[-1]
        if leaf != member.filename.replace("\\", "/"):
            raise RuntimeError(f"{title}: nested ZIP member paths are not accepted")
        if member.file_size > MAX_PGN_BYTES:
            raise RuntimeError(f"{title}: extracted PGN exceeds {MAX_PGN_BYTES} bytes")
        compressed = max(member.compress_size, 1)
        if member.file_size > 2 * 1024 * 1024 and member.file_size / compressed > MAX_COMPRESSION_RATIO:
            raise RuntimeError(f"{title}: suspicious compression ratio")
        return archive.read(member), leaf


def split_games(data: bytes) -> list[bytes]:
    starts = [match.start() for match in EVENT_START_RE.finditer(data)]
    if not starts:
        return []
    starts.append(len(data))
    return [data[starts[index]:starts[index + 1]] for index in range(len(starts) - 1)]


def strip_variations(text: str) -> str:
    output: list[str] = []
    depth = 0
    for char in text:
        if char == '(':
            depth += 1
            continue
        if char == ')':
            if depth:
                depth -= 1
            continue
        if depth == 0:
            output.append(char)
    return ''.join(output)


def headers_from_game(text: str) -> dict[str, str]:
    headers: dict[str, str] = {}
    for key, value in TAG_RE.findall(text):
        headers[key] = value.replace('\\"', '"').strip()
    return headers


def normalize_mainline(game_bytes: bytes) -> tuple[str | None, dict[str, str]]:
    text = game_bytes.decode("utf-8", errors="replace")
    headers = headers_from_game(text)
    movetext = re.sub(r'(?m)^\s*\[[^\r\n]*\]\s*$', ' ', text)
    movetext = BRACE_COMMENT_RE.sub(' ', movetext)
    movetext = SEMICOLON_COMMENT_RE.sub(' ', movetext)
    movetext = strip_variations(movetext)
    movetext = NAG_RE.sub(' ', movetext)
    movetext = MOVE_NUMBER_RE.sub(' ', movetext)
    movetext = RESULT_RE.sub(' ', movetext)
    movetext = movetext.replace('0-0-0', 'O-O-O').replace('0-0', 'O-O')
    tokens = []
    for raw_token in WHITESPACE_RE.split(movetext.strip()):
        token = raw_token.strip()
        if not token:
            continue
        token = re.sub(r'[!?]+$', '', token)
        if token and token not in {'--', '...'}:
            tokens.append(token)
    if len(tokens) < 4:
        return None, headers
    normalized = ' '.join(tokens)
    result = headers.get('Result', '').strip()
    digest = hashlib.sha256(f"{normalized}|{result}".encode('utf-8')).hexdigest()
    return digest, headers


def fingerprint_collection(data: bytes) -> dict:
    games = split_games(data)
    fingerprints: list[str] = []
    malformed = 0
    years = Counter()
    for game in games:
        fingerprint, headers = normalize_mainline(game)
        if not fingerprint:
            malformed += 1
            continue
        fingerprints.append(fingerprint)
        date = headers.get('Date', '')
        year = date[:4]
        if year.isdigit():
            years[year] += 1
    counts = Counter(fingerprints)
    return {
        "records": len(games),
        "fingerprints": set(counts),
        "validFingerprints": len(fingerprints),
        "uniqueFingerprints": len(counts),
        "duplicateRecordsByFingerprint": sum(count - 1 for count in counts.values() if count > 1),
        "malformedForFingerprinting": malformed,
        "yearMin": min(years, default=None),
        "yearMax": max(years, default=None),
    }


def main() -> None:
    spec = json.loads(TARGETS_PATH.read_text(encoding="utf-8"))
    base_url = spec["source"]
    targets = spec["targets"]
    if len(targets) != 12:
        raise RuntimeError(f"expected 12 enrichment audit targets, found {len(targets)}")

    results = []
    for index, target in enumerate(targets, start=1):
        title = target["title"]
        local_path = ROOT / target["localPath"]
        if not local_path.is_file():
            raise RuntimeError(f"{title}: local CAISSA archive missing: {target['localPath']}")
        local_bytes = local_path.read_bytes()
        local = fingerprint_collection(local_bytes)

        zip_url = urllib.parse.urljoin(base_url, urllib.parse.quote(target["mentorZip"], safe=""))
        zip_bytes = fetch_bytes(zip_url, MAX_ZIP_BYTES)
        mentor_bytes, member_name = extract_single_pgn(zip_bytes, title)
        mentor = fingerprint_collection(mentor_bytes)

        local_set = local.pop("fingerprints")
        mentor_set = mentor.pop("fingerprints")
        matches = local_set & mentor_set
        mentor_only = mentor_set - local_set
        local_only = local_set - mentor_set
        denominator = max(len(mentor_set), 1)
        overlap_pct = round((len(matches) / denominator) * 100, 2)

        record = {
            "id": target["id"],
            "title": title,
            "localPath": "/" + target["localPath"].replace("public/", ""),
            "localBytes": len(local_bytes),
            "localSha256": hashlib.sha256(local_bytes).hexdigest(),
            "mentorSourceZip": target["mentorZip"],
            "mentorSourceUrl": zip_url,
            "mentorZipBytes": len(zip_bytes),
            "mentorZipSha256": hashlib.sha256(zip_bytes).hexdigest(),
            "mentorPgnMember": member_name,
            "mentorPgnBytes": len(mentor_bytes),
            "mentorPgnSha256": hashlib.sha256(mentor_bytes).hexdigest(),
            "local": local,
            "mentor": mentor,
            "moveSequenceMatches": len(matches),
            "mentorOnlyCandidateAdditions": len(mentor_only),
            "localOnly": len(local_only),
            "mentorOverlapPercent": overlap_pct,
            "mergePerformed": False,
        }
        results.append(record)
        print(
            f"[{index:02d}/12] {title}: local={local['records']}, mentor={mentor['records']}, "
            f"matches={len(matches)}, mentor-only={len(mentor_only)}, overlap={overlap_pct}%"
        )

    report = {
        "schemaVersion": 1,
        "report": "CAISSA PGN Mentor Player Enrichment Audit",
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "sourceDirectory": base_url,
        "targetCount": len(results),
        "mergePerformed": False,
        "remotePlayerRuntimeExposure": False,
        "fingerprintMethod": "SHA-256 of normalized mainline movetext plus Result; comments, variations, NAGs, move numbers and annotations removed. Candidate additions require parser validation before any future merge.",
        "commercialRightsStatus": "unverified",
        "totals": {
            "localRecords": sum(item["local"]["records"] for item in results),
            "mentorRecords": sum(item["mentor"]["records"] for item in results),
            "moveSequenceMatches": sum(item["moveSequenceMatches"] for item in results),
            "mentorOnlyCandidateAdditions": sum(item["mentorOnlyCandidateAdditions"] for item in results),
            "localOnly": sum(item["localOnly"] for item in results),
        },
        "players": results,
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    print(f"Report written to {REPORT_PATH}")
    print("No PGN Mentor player source file was persisted or merged.")


if __name__ == "__main__":
    main()
