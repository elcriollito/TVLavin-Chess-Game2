import csv
import sqlite3
import tempfile
import unittest
from pathlib import Path

from tools.puzzles.build_catalog import COLUMNS, build_catalog, parse_args
from tools.puzzles.export_postgres_copy import export
from tools.puzzles.import_postgres import (
    load_checkpoint,
    postgres_row,
    read_batch,
    save_checkpoint,
    validate_staging_target,
)


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

    def test_resumable_import_helpers_are_idempotent_and_reject_production(self):
        production_url = "postgresql://postgres.jczauvkfkweuvdpurpem:secret@aws.pooler.supabase.com/postgres"
        for misleading_ref in ("jczauvkfkweuvdpurpem", "aws", "postgres"):
            with self.assertRaisesRegex(ValueError, "production project|exactly 20"):
                validate_staging_target(production_url, misleading_ref)

        branch_ref = "abcdefghijklmnopqrst"
        validate_staging_target(
            f"postgresql://postgres.{branch_ref}:secret@aws.pooler.supabase.com/postgres",
            branch_ref,
        )
        validate_staging_target(
            f"postgresql://postgres:secret@db.{branch_ref}.supabase.co/postgres",
            branch_ref,
        )
        with self.assertRaisesRegex(ValueError, "does not match"):
            validate_staging_target(
                "postgresql://postgres.zyxwvutsrqponmlkjihg:secret@aws.pooler.supabase.com/postgres",
                branch_ref,
            )

        self.assertEqual(
            postgres_row(("abc12", "fen", "a1a2 a2a3", 1800, 75, 90, 1000, "fork fork pin", "url", "A A", ""), "2026-09-10")[7:],
            (["fork", "pin"], "url", ["A"], None, "2026-09-10"),
        )

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            database = root / "resume.sqlite3"
            connection = sqlite3.connect(database)
            try:
                connection.execute("create table puzzles(puzzle_id text primary key, fen text, moves text, rating integer, rating_deviation integer, popularity integer, nb_plays integer, themes text, game_url text, opening_tags text, daily_date text)")
                connection.executemany("insert into puzzles values (?,?,?,?,?,?,?,?,?,?,?)", [
                    ("aaa01", "fen", "a1a2 a2a3", 1800, 75, 90, 1000, "fork", "url", "", ""),
                    ("bbb02", "fen", "b1b2 b2b3", 1800, 75, 90, 1000, "pin", "url", "", ""),
                ])
                connection.commit()
                self.assertEqual([row[0] for row in read_batch(connection, "", 1)], ["aaa01"])
                self.assertEqual([row[0] for row in read_batch(connection, "aaa01", 10)], ["bbb02"])
            finally:
                connection.close()

            checkpoint_path = root / "checkpoint.json"
            checkpoint = load_checkpoint(checkpoint_path, "2026-09-10", database.stat().st_size)
            checkpoint.update({"lastPuzzleId": "aaa01", "processed": 1})
            save_checkpoint(checkpoint_path, checkpoint)
            self.assertEqual(load_checkpoint(checkpoint_path, "2026-09-10", database.stat().st_size)["processed"], 1)


if __name__ == "__main__":
    unittest.main()
