import unittest

from tools.puzzles.import_d1_catalog import (
    first_row,
    parse_wrangler_json,
    result_items,
    summarize,
    verification_queries,
    verification_sql,
)


class ImportD1CatalogTests(unittest.TestCase):
    def test_summarizes_wrangler_envelope(self):
        payload = [
            {"success": True, "results": [], "meta": {"rows_read": 2, "rows_written": 7, "duration": 1.25}},
            {"success": True, "results": [], "meta": {"rows_read": 1, "rows_written": 3, "duration": 0.75}},
        ]
        self.assertEqual(
            summarize(payload),
            {"statements": 2, "rowsRead": 3, "rowsWritten": 10, "d1DurationMs": 2.0},
        )

    def test_extracts_verification_row(self):
        payload = [{"success": True, "results": [{"puzzles": 6, "pool_entries": 9}], "meta": {}}]
        self.assertEqual(first_row(payload), {"puzzles": 6, "pool_entries": 9})

    def test_rejects_failed_result(self):
        with self.assertRaises(RuntimeError):
            result_items([{"success": False, "errors": [{"message": "no"}]}])

    def test_verification_sql_escapes_version(self):
        self.assertIn("20''26", verification_sql("20'26"))
        self.assertIn("20''26", verification_queries("20'26")["version_rows"])
        self.assertTrue(all("\n" not in query for query in verification_queries("2026-09-10").values()))

    def test_extracts_json_after_wrangler_progress(self):
        output = "├ Checking upload\n│ done\n[\n  {\"success\": true, \"results\": [], \"meta\": {\"rows_written\": 3}}\n]\n\x1b]0;title\x07"
        self.assertEqual(parse_wrangler_json(output)[0]["meta"]["rows_written"], 3)


if __name__ == "__main__":
    unittest.main()
