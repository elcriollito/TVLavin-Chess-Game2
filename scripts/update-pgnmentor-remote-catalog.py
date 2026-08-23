#!/usr/bin/env python3
"""Snapshot PGN Mentor event/opening download names without exposing players."""
from __future__ import annotations

import hashlib
import json
import re
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[1]
SOURCE_PAGE = "https://www.pgnmentor.com/files.html"
CATALOG_PATH = ROOT / "data/pgn/pgnmentor-remote-catalog.json"
ALLOWLIST_PATH = ROOT / "api/pgn/pgnmentor-allowlist.js"
HISTORICAL_CATALOG_PATH = ROOT / "public/data/pgn/pgnmentor-historical-catalog.json"
USER_AGENT = "CAISSA-Chess-PGN-Catalog/1.0 (+https://www.caissa-chess.org/)"
MAX_PAGE_BYTES = 4 * 1024 * 1024

WORLD_CHAMPIONSHIP_LABELS = {
    "WorldChamp1886.pgn": "Steinitz vs Zukertort",
    "WorldChamp1889.pgn": "Steinitz vs Chigorin",
    "WorldChamp1890.pgn": "Steinitz vs Gunsberg",
    "WorldChamp1892.pgn": "Steinitz vs Chigorin",
    "WorldChamp1894.pgn": "Lasker vs Steinitz",
    "WorldChamp1896.pgn": "Lasker vs Steinitz",
    "WorldChamp1907.pgn": "Lasker vs Marshall",
    "WorldChamp1908.pgn": "Lasker vs Tarrasch",
    "WorldChamp1909.pgn": "Lasker vs Janowski",
    "WorldChamp1910a.pgn": "Lasker vs Schlechter",
    "WorldChamp1910b.pgn": "Lasker vs Janowski",
    "WorldChamp1921.pgn": "Capablanca vs Lasker",
    "WorldChamp1927.pgn": "Alekhine vs Capablanca",
    "WorldChamp1929.pgn": "Alekhine vs Bogoljubow",
    "WorldChamp1934.pgn": "Alekhine vs Bogoljubow",
    "WorldChamp1935.pgn": "Euwe vs Alekhine",
    "WorldChamp1937.pgn": "Alekhine vs Euwe",
    "WorldChamp1948.pgn": "World Championship Tournament",
    "WorldChamp1951.pgn": "Botvinnik vs Bronstein",
    "WorldChamp1954.pgn": "Botvinnik vs Smyslov",
    "WorldChamp1957.pgn": "Smyslov vs Botvinnik",
    "WorldChamp1958.pgn": "Botvinnik vs Smyslov",
    "WorldChamp1960.pgn": "Tal vs Botvinnik",
    "WorldChamp1961.pgn": "Botvinnik vs Tal",
    "WorldChamp1963.pgn": "Petrosian vs Botvinnik",
    "WorldChamp1966.pgn": "Petrosian vs Spassky",
    "WorldChamp1969.pgn": "Spassky vs Petrosian",
    "WorldChamp1972.pgn": "Fischer vs Spassky",
    "WorldChamp1978.pgn": "Karpov vs Korchnoi",
    "WorldChamp1981.pgn": "Karpov vs Korchnoi",
    "WorldChamp1984.pgn": "Karpov vs Kasparov",
    "WorldChamp1985.pgn": "Kasparov vs Karpov",
    "WorldChamp1986.pgn": "Kasparov vs Karpov",
    "WorldChamp1987.pgn": "Kasparov vs Karpov",
    "WorldChamp1990.pgn": "Kasparov vs Karpov",
    "WorldChamp2000.pgn": "Kramnik vs Kasparov",
    "WorldChamp2004.pgn": "Kramnik vs Leko",
    "WorldChamp2006.pgn": "Kramnik vs Topalov",
    "WorldChamp2007.pgn": "World Championship Tournament",
    "WorldChamp2008.pgn": "Anand vs Kramnik",
    "WorldChamp2010.pgn": "Anand vs Topalov",
    "WorldChamp2012.pgn": "Anand vs Gelfand",
    "WorldChamp2013.pgn": "Carlsen vs Anand",
    "WorldChamp2014.pgn": "Carlsen vs Anand",
    "WorldChamp2016.pgn": "Carlsen vs Karjakin",
    "WorldChamp2018.pgn": "Carlsen vs Caruana",
    "WorldChamp2021.pgn": "Carlsen vs Nepomniachtchi",
    "WorldChamp2023.pgn": "Ding Liren vs Nepomniachtchi",
    "WorldChamp2024.pgn": "Gukesh vs Ding Liren",
    "PCAChamp1993.pgn": "Kasparov vs Short",
    "PCAChamp1995.pgn": "Kasparov vs Anand",
    "FideChamp1993.pgn": "Karpov vs Timman",
    "FideChamp1996.pgn": "Karpov vs Kamsky",
    "FideChamp1998.pgn": "Karpov vs Anand",
    "FideChamp1999.pgn": "FIDE Knockout Championship",
    "FideChamp2000.pgn": "FIDE Knockout Championship",
    "FideChamp2002.pgn": "FIDE Knockout Championship",
    "FideChamp2004.pgn": "FIDE Knockout Championship",
    "FideChamp2005.pgn": "FIDE World Championship Tournament",
}


class LinkCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.events: set[str] = set()
        self.openings: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return
        href = dict(attrs).get("href")
        if not href:
            return
        path = unquote(urlparse(href).path).lstrip("/")
        if path.startswith("events/") and path.lower().endswith(".pgn"):
            name = Path(path).name
            if name and name not in {".", ".."}:
                self.events.add(name)
        elif path.startswith("openings/") and path.lower().endswith(".zip"):
            name = Path(path).name
            if name and name not in {".", ".."}:
                self.openings.add(name)


def fetch_page() -> bytes:
    request = urllib.request.Request(
        SOURCE_PAGE,
        headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        declared = int(response.headers.get("Content-Length") or 0)
        if declared > MAX_PAGE_BYTES:
            raise RuntimeError("PGN Mentor index exceeds safety limit")
        data = response.read(MAX_PAGE_BYTES + 1)
    if len(data) > MAX_PAGE_BYTES:
        raise RuntimeError("PGN Mentor index exceeds safety limit")
    return data


def js_array(name: str, values: list[str]) -> str:
    body = ",\n".join(f"    {json.dumps(value)}" for value in values)
    return f"export const {name} = new Set([\n{body}\n]);\n"


def source_update_label(page_text: str, section: str) -> str | None:
    match = re.search(rf"{re.escape(section)}\s+updated:\s*([A-Za-z]+\s+\d{{4}})", page_text, re.IGNORECASE)
    return match.group(1) if match else None


def event_year(filename: str) -> int:
    digits = "".join(char for char in filename if char.isdigit())
    return int(digits[:4]) if len(digits) >= 4 else 0


def championship_record(filename: str) -> dict | None:
    if filename.startswith("WorldChamp"):
        branch = "Undisputed World Championship"
        if 1993 <= event_year(filename) <= 2004:
            branch = "Classical World Championship"
    elif filename.startswith("PCAChamp"):
        branch = "PCA World Championship"
    elif filename.startswith("FideChamp"):
        branch = "FIDE World Championship"
    else:
        return None

    year = event_year(filename)
    label = WORLD_CHAMPIONSHIP_LABELS.get(filename, "World Championship")
    suffix = filename.removesuffix(".pgn").removeprefix("WorldChamp").removeprefix("PCAChamp").removeprefix("FideChamp")
    edition = ""
    if suffix and suffix[-1:].isalpha():
        edition = f" · Match {suffix[-1].upper()}"
    return {
        "id": f"world-championship-{filename.removesuffix('.pgn').lower()}",
        "year": year,
        "title": f"{year} — {label}",
        "details": f"{branch}{edition} · Remote PGN · Free",
        "file": filename,
        "kind": "world-championship",
        "access": "free",
    }


def qualifier_record(filename: str) -> dict | None:
    year = event_year(filename)
    stem = filename.removesuffix(".pgn")
    if filename.startswith("Candidates"):
        kind = "candidates"
        label = "Candidates Tournament"
        suffix = stem.removeprefix("Candidates")[4:]
        if suffix:
            label += f" · {suffix.upper()}"
    elif filename.startswith("WorldCup"):
        kind = "world-cup"
        label = "FIDE World Cup"
    elif filename.startswith("Interzonal"):
        kind = "interzonal"
        label = "Interzonal"
        suffix = stem.removeprefix("Interzonal")[4:]
        if suffix:
            label += f" · Group {suffix.upper()}"
    else:
        return None
    return {
        "id": f"qualifier-{stem.lower()}",
        "year": year,
        "title": f"{year} — {label}",
        "details": "World Championship qualification archive · Remote PGN · Free",
        "file": filename,
        "kind": kind,
        "access": "free",
    }


def build_historical_catalog(
    events: list[str],
    generated_at: str,
    source_updates: dict[str, str | None] | None = None,
    source_page: str = SOURCE_PAGE,
) -> dict:
    championships = [record for filename in events if (record := championship_record(filename))]
    qualifiers = [record for filename in events if (record := qualifier_record(filename))]
    kind_order = {"world-championship": 0, "candidates": 0, "world-cup": 1, "interzonal": 2}
    championships.sort(key=lambda item: (-item["year"], kind_order[item["kind"]], item["file"]))
    qualifiers.sort(key=lambda item: (-item["year"], kind_order[item["kind"]], item["file"]))
    return {
        "schemaVersion": 1,
        "sourcePage": source_page,
        "updatedAt": generated_at,
        "sourceUpdates": source_updates or {"players": None, "openings": None},
        "playerDirectoryExposed": False,
        "runtimePolicy": {
            "events": "remote-through-caissa-gateway",
            "players": "physical-caissa-archives-only",
        },
        "families": {
            "worldChampionships": championships,
            "qualifiers": qualifiers,
        },
        "counts": {
            "worldChampionships": len(championships),
            "qualifiers": len(qualifiers),
        },
    }


def write_historical_catalog(
    events: list[str], generated_at: str, source_updates: dict[str, str | None] | None = None
) -> None:
    catalog = build_historical_catalog(events, generated_at, source_updates)
    HISTORICAL_CATALOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    HISTORICAL_CATALOG_PATH.write_text(
        json.dumps(catalog, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def main() -> None:
    page = fetch_page()
    page_text = page.decode("utf-8", errors="replace")
    parser = LinkCollector()
    parser.feed(page_text)
    events = sorted(parser.events, key=str.casefold)
    openings = sorted(parser.openings, key=str.casefold)
    if len(events) < 100:
        raise RuntimeError(f"unexpectedly small event catalog: {len(events)}")
    if len(openings) < 100:
        raise RuntimeError(f"unexpectedly small opening catalog: {len(openings)}")

    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    digest = hashlib.sha256(page).hexdigest()
    source_updates = {
        "players": source_update_label(page_text, "Players"),
        "openings": source_update_label(page_text, "Openings"),
    }
    catalog = {
        "schemaVersion": 1,
        "sourcePage": SOURCE_PAGE,
        "generatedAt": generated_at,
        "sourcePageSha256": digest,
        "sourceUpdates": source_updates,
        "playerDirectoryExposed": False,
        "policy": {
            "events": "remote-through-caissa-gateway",
            "openings": "remote-zip-through-caissa-gateway; indexed/paged consumption required before public opening UX",
            "players": "not-exposed; CAISSA uses physical player archives instead",
            "commercialRightsStatus": "unverified"
        },
        "eventCount": len(events),
        "openingCount": len(openings),
        "events": events,
        "openings": openings,
    }
    CATALOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CATALOG_PATH.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")

    js = "// Generated by scripts/update-pgnmentor-remote-catalog.py. Do not hand-edit.\n"
    js += js_array("PGN_MENTOR_EVENT_FILES", events)
    js += "\n"
    js += js_array("PGN_MENTOR_OPENING_FILES", openings)
    ALLOWLIST_PATH.write_text(js, encoding="utf-8", newline="\n")
    write_historical_catalog(events, generated_at, source_updates)

    print(f"PGN Mentor remote catalog: {len(events)} events, {len(openings)} openings")
    print(f"Historical UI catalog: {HISTORICAL_CATALOG_PATH}")
    print(f"Source page sha256={digest}")


if __name__ == "__main__":
    main()
