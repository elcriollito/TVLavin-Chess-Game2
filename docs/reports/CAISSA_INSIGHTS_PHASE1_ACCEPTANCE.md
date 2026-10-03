# Insights Phase 1 — account reports and analysis correctness

Base: `45de5ca2e0f4b3e711a6c39209fcd9caed7b6106`. Implements the next functional step from Phase 0: INS-001 through INS-005. Production publication remains gated on Alex's visual and account testing.

## Resulting behavior

- Select the player by exact PGN name or imported provider username. Results follow that player's color; unfinished, foreign and ambiguous games remain separate.
- Legal PGN replay preserves starting FEN, promotions, castling and en passant. Invalid games are excluded before charging the existing local-import credit.
- Color filtering precedes the report count. Each batch owns one review engine from the existing registry and uses the adapter's attributed requests. Play callbacks and board state are untouched.
- Principal MultiPV scores, signed mover-perspective losses, mate transitions, real coverage, timeout and cancellation replace the old absolute-swing and capture-value heuristics.
- The decorative skill radar and unsupported tactical-strength claims have been removed. The initial surface shows PGN facts and candidate positions with their evidence limits.
- Coach Reports auto-save only after a server-confirmed account write. Failed saves remain exportable and retry with the same operation ID.
- Private account history supports list, stable pagination, recovery and explicit per-report deletion. Start Fresh clears the working draft and preserves saved reports.
- Legacy unowned local PGN data is only offered for explicit recovery, followed by player selection. It is never automatically assigned to the signed-in account.

## Persistence and access

`insight_datasets` holds bounded source PGN, selected subject and import provenance. `insight_reports` holds immutable snapshots and summaries. Ownership is resolved from a verified Clerk subject to `public.users.id` on the server. Every query is owner-scoped; a composite foreign key prevents cross-owner dataset references.

Both tables use forced RLS and have no browser grants or policies. Only the server service role can select, insert and delete. UPDATE is not granted. Save and delete RPCs are SECURITY INVOKER, have an empty search path, and deny anonymous/authenticated execution. The informational Supabase advisor notice about no RLS policy is intentional for this server-only access model; see [the advisor definition](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

The server reparses legal games and rebuilds W/D/L, coverage and moments from the supplied evaluation structure. `structurally_validated` does **not** certify browser engine execution. No report is promoted to a verified chess profile or Mentor signal.

## Limits and method

100 games, 1 MiB source PGN, 1000 plies per game and 10000 total plies per dataset; at most 50 games per report; 2 MiB report request/snapshot; 20 reports per history page. The engine preset is Stockfish 18 Lite, principal line, depth 12, 2.5 seconds per position and a 3 minute batch budget. Unevaluated moves remain in the denominator. Critical candidates require a loss of at least 120 centipawns or a forced-mate transition. Endgame uses explicit material thresholds; opening uses fullmove <= 15. Phases with no opportunities are not ranked as strengths.

This is a versioned browser estimate, not a calibrated accuracy score, recurring tactical-pattern classifier, trends model or chess DNA.

## Automatic validation

- `npm run test:insights`: 53 tests pass, covering the audited data/engine defects, cancellation and account changes, private API access, immutable retry, truthful save states, source provenance and legal replay.
- `npm run lint:insights`: passes.
- `tests/fixtures/insights-staging-acceptance.sql`: passed against `CAISSA-READER-STAGING`. Nine assertions cover real database idempotency, immutability, owner FK, foreign deletion, owner retrieval, shared/orphan dataset lifecycle and private/server grants. All synthetic data was rolled back.
- Supabase security/performance advisors reviewed after migration; no warning/error attributable to these new tables/functions.
- Browser/WASM smoke and deployment verification are recorded below when completed.

## Release boundary

The migration has been rehearsed only in staging. It must be applied to production after review and before publishing the feature. Preview report APIs explicitly reject a production database connection. Preview requires its Clerk test verifier and staging Supabase server credentials; `/api/insights/status` exposes only configuration booleans to verify this boundary without leaking keys or user data.

Manual acceptance: import a small sample, choose the player/color, generate, confirm “Saved to your account,” reload, open the report in a clean authenticated browser, check account B cannot see it, Start Fresh, then delete one saved report. Desktop/mobile layout, copy and real signed-in preview account recovery remain Alex's review gate. No user credits or Puzzle ratings are used for automatic QA.
