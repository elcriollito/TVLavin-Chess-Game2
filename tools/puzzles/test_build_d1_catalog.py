from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
from unittest import mock
from pathlib import Path

from tools.puzzles.build_d1_catalog import main, replace_file


class BuildD1CatalogTest(unittest.TestCase):
    def test_replace_file_retries_transient_windows_scanner_lock(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / "source.tmp"
            destination = Path(temporary) / "destination.json"
            source.write_text("{}", encoding="utf-8")
            with mock.patch(
                "tools.puzzles.build_d1_catalog.os.replace",
                side_effect=[PermissionError("scanner lock"), None],
            ) as replace, mock.patch("tools.puzzles.build_d1_catalog.time.sleep") as sleep:
                replace_file(source, destination)
            self.assertEqual(replace.call_count, 2)
            sleep.assert_called_once_with(0.05)

    def test_builds_and_verifies_resumable_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source.sqlite3"
            output = root / "output"
            connection = sqlite3.connect(source)
            connection.executescript(
                """
                create table puzzles(
                  puzzle_id text primary key, fen text not null, moves text not null,
                  rating integer not null, rating_deviation integer not null,
                  popularity integer not null, nb_plays integer not null,
                  themes text not null, game_url text not null,
                  opening_tags text not null, daily_date text not null
                ) without rowid;
                create table puzzle_themes(
                  theme text not null, puzzle_id text not null,
                  primary key(theme, puzzle_id)
                ) without rowid;
                create table puzzle_openings(
                  opening_tag text not null, puzzle_id text not null,
                  primary key(opening_tag, puzzle_id)
                ) without rowid;
                insert into puzzles values
                  ('00001','8/8/8/8/8/8/8/K6k w - - 0 1','a1a2',1800,80,90,600,
                   'fork equality','https://lichess.org/abc/white#1','Sicilian_Defense',''),
                  ('00002','8/8/8/8/8/8/8/K6k b - - 0 1','h1h2',1900,90,85,120,
                   'equality','https://lichess.org/def/black#2','','');
                insert into puzzle_themes values
                  ('equality','00001'),('equality','00002'),('fork','00001');
                insert into puzzle_openings values ('Sicilian_Defense','00001');
                """
            )
            connection.close()

            with mock.patch(
                "sys.argv",
                ["build_d1_catalog.py", str(source), str(output), "--puzzle-batch", "1000", "--relation-batch", "10000"],
            ):
                self.assertEqual(main(), 0)

            manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["source"]["puzzles"], 2)
            self.assertEqual(manifest["candidate"]["poolEntries"], 4)
            self.assertEqual(manifest["candidate"]["gameUrls"], 2)
            self.assertEqual(manifest["candidate"]["integrityCheck"], "ok")
            self.assertTrue(manifest["thresholds"]["sqlWithinLimit"])

            with mock.patch(
                "sys.argv",
                ["build_d1_catalog.py", str(source), str(output), "--verify"],
            ):
                self.assertEqual(main(), 0)


if __name__ == "__main__":
    unittest.main()
