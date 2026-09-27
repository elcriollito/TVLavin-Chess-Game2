import csv
import tempfile
import unittest
from pathlib import Path

from tools.puzzles.build_catalog import COLUMNS, build_catalog, parse_args
from tools.puzzles.export_postgres_copy import export


class CatalogBuilderTest(unittest.TestCase):
    def test_plain_csv_fixture_preserves_every_column_and_builds_indexes(self):
        rows = [
            {
                "PuzzleId": "abc12",
                "FEN": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                "Moves": "e2e4 e7e5",
                "Rating": "1800",
                "RatingDeviation": "75",
                "Popularity": "90",
                "NbPlays": "1200",
                "Themes": "fork opening short fork",
                "GameUrl": "https://lichess.org/example#1",
                "OpeningTags": "Kings_Pawn_Game",
                "DailyDate": "",
            },
            {
                "PuzzleId": "xyz89",
                "FEN": "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
                "Moves": "g1f3 b8c6 f1b5",
                "Rating": "2100",
                "RatingDeviation": "80",
                "Popularity": "85",
                "NbPlays": "900",
                "Themes": "pin middlegame long",
                "GameUrl": "https://lichess.org/example#3",
                "OpeningTags": "Sicilian_Defense Sicilian_Defense_Open",
                "DailyDate": "1607774862751",
            },
        ]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "fixture.csv"
            database = root / "catalog.sqlite3"
            manifest_path = root / "manifest.json"
            sample_path = root / "sample.json"
            with source.open("w", encoding="utf-8", newline="") as stream:
                writer = csv.DictWriter(stream, fieldnames=COLUMNS)
                writer.writeheader()
                writer.writerows(rows)

            args = parse_args(
                [
                    str(source),
                    str(database),
                    "--expected-count",
                    "2",
                    "--sample-size",
                    "2",
                    "--manifest",
                    str(manifest_path),
                    "--sample",
                    str(sample_path),
                ]
            )
            manifest = build_catalog(args)

            self.assertEqual(manifest["verification"]["puzzleCount"], 2)
            self.assertEqual(manifest["verification"]["columns"], COLUMNS)
            self.assertTrue(database.is_file())
            self.assertTrue(manifest_path.is_file())
            self.assertTrue(sample_path.is_file())

            import sqlite3

            connection = sqlite3.connect(database)
            try:
                self.assertEqual(connection.execute("select count(*) from puzzles").fetchone()[0], 2)
                self.assertEqual(
                    connection.execute("select puzzle_id from puzzle_themes where theme = 'fork'").fetchone()[0],
                    "abc12",
                )
                self.assertEqual(
                    connection.execute(
                        "select themes from puzzles where puzzle_id = 'abc12'"
                    ).fetchone()[0],
                    "fork opening short fork",
                )
                self.assertEqual(
                    connection.execute(
                        "select puzzle_id from puzzle_openings where opening_tag = 'Sicilian_Defense'"
                    ).fetchone()[0],
                    "xyz89",
                )
                self.assertEqual(connection.execute("pragma integrity_check").fetchone()[0], "ok")
            finally:
                connection.close()

            import io

            copy_stream = io.StringIO()
            self.assertEqual(export(database, "2026-09-10", copy_stream), 2)
            copy_rows = list(csv.reader(io.StringIO(copy_stream.getvalue())))
            self.assertEqual(copy_rows[0][-1], "source_version")
            self.assertEqual(copy_rows[1][7], '{"fork","opening","short","fork"}')
            self.assertEqual(copy_rows[1][9], '{"Kings_Pawn_Game"}')
            self.assertEqual(copy_rows[1][-1], "2026-09-10")


if __name__ == "__main__":
    unittest.main()
