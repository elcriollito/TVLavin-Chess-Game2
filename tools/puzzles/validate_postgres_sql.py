#!/usr/bin/env python3
"""Parse CAISSA puzzle SQL artifacts with PostgreSQL's grammar."""

from pathlib import Path

from pglast import parse_sql


FILES = [
    Path("supabase/migrations/20260927010607_caissa_puzzle_catalog_v1.sql"),
    Path("supabase/rehearsals/20260927010607_caissa_puzzle_catalog_v1_verify.sql"),
    Path("supabase/rollback/20260927010607_caissa_puzzle_catalog_v1_rollback.sql"),
]


def main() -> int:
    for path in FILES:
        statements = parse_sql(path.read_text(encoding="utf-8"))
        if not statements:
            raise ValueError(f"No PostgreSQL statements found in {path}")
        print(f"Parsed {len(statements)} statements: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
