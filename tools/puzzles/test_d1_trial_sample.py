from __future__ import annotations

import io
import sqlite3
import unittest
from collections import Counter

from tools.puzzles.build_d1_trial_sample import pool_rows, quote, write_insert_batches


class D1TrialSampleTest(unittest.TestCase):
    def test_pool_rows_are_deduplicated_and_counted(self) -> None:
        connection = sqlite3.connect(":memory:")
        connection.executescript(
            """
            create table selected(puzzle_id text primary key) without rowid;
            create table puzzles(
              puzzle_id text primary key,
              rating integer not null,
              rating_deviation integer not null,
              popularity integer not null,
              nb_plays integer not null,
              themes text not null,
              opening_tags text not null
            ) without rowid;
            insert into selected values ('4TN7E');
            insert into puzzles values(
              '4TN7E', 1837, 80, 95, 600,
              'fork fork equality', 'Sicilian_Defense Sicilian_Defense'
            );
            """
        )
        counts: Counter[str] = Counter()

        rows = list(pool_rows(connection, counts))

        self.assertEqual(len(rows), 3)
        self.assertEqual(len({(row[0], row[2]) for row in rows}), 3)
        self.assertEqual(sum(counts.values()), 3)
        self.assertIn("theme:fork:q2:b18", counts)
        self.assertIn("theme:equality:q2:b18", counts)
        self.assertIn("opening:Sicilian_Defense:q2:b18", counts)

    def test_sql_writer_batches_and_escapes_values(self) -> None:
        stream = io.StringIO()

        count = write_insert_batches(
            stream,
            "catalog_metadata",
            (("author", "Lichess's catalog"), ("nullable", None)),
            batch_size=1,
        )

        self.assertEqual(count, 2)
        self.assertEqual(stream.getvalue().count("insert into catalog_metadata"), 2)
        self.assertIn("'Lichess''s catalog'", stream.getvalue())
        self.assertEqual(quote(None), "null")


if __name__ == "__main__":
    unittest.main()
