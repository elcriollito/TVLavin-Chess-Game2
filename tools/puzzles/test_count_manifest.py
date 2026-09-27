import sqlite3
import unittest

from tools.puzzles.build_count_manifest import build_manifest


class FullCountManifestTest(unittest.TestCase):
    def test_overlapping_themes_quality_and_rating_edge(self):
        db = sqlite3.connect(":memory:")
        db.execute("create table puzzles (rating integer, rating_deviation integer, popularity integer, nb_plays integer, themes text)")
        db.executemany("insert into puzzles values (?,?,?,?,?)", [
            (1800, 50, 90, 600, "fork pin"),
            (1900, 50, 90, 150, "fork equality"),
            (2000, 150, 90, 600, "pin"),
        ])
        manifest = build_manifest(db, {"Motifs": ["fork", "pin"], "Goals": ["equality"]})
        self.assertEqual(manifest["puzzles"], 3)
        motifs = manifest["counts"]["category:Motifs"]
        self.assertEqual(motifs["total"], 3)  # fork + pin is one puzzle at 1800
        self.assertEqual(motifs["ranges"]["1800:normal:standard"], 1)
        self.assertEqual(motifs["ranges"]["1800:normal:relaxed"], 2)
        self.assertEqual(manifest["counts"]["theme:fork"]["total"], 2)
        self.assertEqual(manifest["counts"]["theme:equality"]["ranges"]["1800:normal:relaxed"], 1)


if __name__ == "__main__":
    unittest.main()
