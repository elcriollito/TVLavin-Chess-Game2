from __future__ import annotations

import unittest

from tools.puzzles.benchmark_d1_candidate import pool_key, quality_tier, shuffle_key


class D1CandidateHelpersTest(unittest.TestCase):
    def test_quality_tiers_are_disjoint(self) -> None:
        self.assertEqual(quality_tier(100, 80, 500), 2)
        self.assertEqual(quality_tier(100, 80, 100), 1)
        self.assertEqual(quality_tier(101, 100, 10_000), 0)

    def test_shuffle_key_is_stable_and_javascript_safe(self) -> None:
        key = shuffle_key("4TN7E")
        self.assertEqual(key, shuffle_key("4TN7E"))
        self.assertGreaterEqual(key, 0)
        self.assertLess(key, 2**53)

    def test_pool_key_carries_every_index_dimension(self) -> None:
        self.assertEqual(pool_key("opening", "Sicilian_Defense", 2, 17), "opening:Sicilian_Defense:q2:b17")


if __name__ == "__main__":
    unittest.main()
