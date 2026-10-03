# Insights Phase 1 — account reports and analysis correctness

Historical base: `45de5ca2e0f4b3e711a6c39209fcd9caed7b6106`. Phase 1 was integrated with `origin/main` at `c43197a89a6511ee22e0813884823e69822ad954` without replacing the intervening Home, onboarding, Yahoo Quiet Drag or Arena Quiet Drag work. This implements INS-001 through INS-005. Production publication remains gated on Alex's visual and account testing.

## Resulting behavior

- Select the player by exact PGN name or imported provider username. Results follow that player's color; unfinished, foreign and ambiguous games remain separate.
- Legal PGN replay preserves starting FEN, promotions, castling and en passant. Invalid games are excluded before charging the existing local-import credit.
- Color filtering precedes the report count. Each batch owns one review engine from the existing registry and uses attributed adapter requests. Play callbacks and board state are untouched.
- Principal MultiPV scores, signed mover-perspective losses, mate transitions, real coverage, timeout and cancellation replace the old absolute-swing and capture-value heuristics.
- Unsupported skill/style claims were removed. The report now combines PGN facts, an explicitly defined sample spider and concrete coaching positions with their evidence limits.
- Coach Reports save only after a server-confirmed account write. Failed saves remain exportable and retry with the same operation ID.
- Private account history supports list, stable pagination, recovery and explicit per-report deletion. Start Fresh clears the working draft and preserves saved reports.
- Legacy unowned local PGN data is only offered for explicit recovery. It is never automatically assigned to the signed-in account.

## Persistence and access

`insight_datasets` holds bounded source PGN, selected subject and import provenance. `insight_reports` holds immutable snapshots and summaries. Ownership is resolved from a verified Clerk subject to `public.users.id` on the server. Every query is owner-scoped; a composite foreign key prevents cross-owner dataset references.

Both tables use forced RLS and have no browser grants or policies. Only the server service role can select, insert and delete. UPDATE is not granted. Save and delete RPCs are SECURITY INVOKER, have an empty search path, and deny anonymous/authenticated execution. The Supabase advisor notice about no RLS policy is intentional for this server-only model; see [the advisor definition](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Staging exposed a concrete privilege defect during authenticated acceptance: `FOR KEY SHARE`/`FOR UPDATE` inside the SECURITY INVOKER RPCs implicitly required the deliberately withheld UPDATE grant. Migration `20261003190000_insights_rpc_invoker_privileges.sql` removes those row locks while retaining the per-owner transaction advisory lock and composite owner foreign key. The fresh-install migration is aligned, UPDATE remains revoked, and a real `SET LOCAL ROLE service_role` save/delete probe now guards the deployed privilege model.

The server reparses legal games and rebuilds W/D/L, coverage and moments from the supplied evaluation structure. `structurally_validated` does **not** certify browser engine execution. No report is promoted to a verified chess profile or Mentor signal.

## Limits and method

100 games, 1 MiB source PGN, 1000 plies per game and 10000 total plies per dataset; at most 50 games per report; 2 MiB report request/snapshot; 20 reports per history page. The engine preset is Stockfish 18 Lite, principal line, depth 12. New reports allow 10 seconds per position and a 30 minute batch budget, replacing the 2.5-second/3-minute policy that truncated Alex's review. Completed evaluations at the same depth can be resumed only against the identical source PGN, selected player and import metadata. Old immutable snapshots remain readable under their original policy. Unevaluated moves remain in the denominator. Critical candidates require a loss of at least 120 centipawns or a forced-mate transition. Endgame uses explicit material thresholds; opening uses fullmove <= 15. Phases with no opportunities are not ranked as strengths.

This is a versioned browser estimate, not a calibrated accuracy score or certified chess skill profile. Rating trends use the PGN's actual ratings and dates, with different platform/time-control pools kept separate.

## Approved report redesign — implementation, 2026-10-03

Alex approved the visual mockup after requesting Chessvia-inspired report content and retention of CAISSA's spider. The report opens inline in Insights under the latest-report status. The hero is the single report-generation entry. Import, configuration and active progress remain dialogs; saved history is a separate disclosure.

- Time-control and player-color filters recalculate the report's selected sample. Results include completed-game W/D/L, queen trade and both castling sides, points per completed game, ratings by date, opening outcomes, opponent ratings and recorded ending reasons. Missing fields remain unavailable; ordinary decisive results do not establish resignation or timeout. Opening labels use PGN names, trusted opening metadata or a confirmed line in the existing CAISSA ECO catalog.
- The eight spider axes are Tactics, Strategy, Opening, Endgame, Defense, Aggression, Precision and Consistency. Their definitions and sample sizes are disclosed. Move-quality axes require five comparable own moves; Consistency requires three qualifying games. Aggression measures forcing-move frequency rather than skill. Missing axes remain gaps, not invented zero scores.
- Coaching identifies the player's exact game and numbered SAN move, legally replays an engine alternative and the opponent's reply, explains the consequence, and proposes a thinking habit and seven-day practice plan. Contradictory estimates that name the played move as the best move are explicitly marked for verification. A game link uses the existing Analyzer handoff and opens the position before the reviewed move.
- Progress includes the selected game, processed/total recorded positions and a runtime estimate. Partial batches can continue missing positions without weakening depth or silently reporting full coverage.
- Immutable saves, same-operation Retry, owner-change cancellation/clearing, history recovery and Start Fresh semantics remain intact. Existing saved PGNs are reparsed to expose the new metadata without mutating their snapshots. No database migration is required for this report redesign.

Current local validation: `npm run test:insights` 76/76, `npm run test:home` 64/64, Insights syntax checks pass, and auth/open-redirect/Analyzer/FICS/handoff/performance regressions 89/89. Preview publication and real-browser acceptance of this revision remain pending at this checkpoint; prior browser and SQL evidence below belongs to the earlier Phase 1 revision.

The Preview-only `/api/insights/engine-check?report=1` acceptance surface uses the real report components and ten explicitly synthetic legal games with the published Stockfish engine. It never reads account data, charges credits or persists an account report; it remains 404 outside Preview. It supplements, and does not replace, Alex's authenticated manual review.

## Earlier Phase 1 validation and real acceptance

- `npm run test:insights`: 56/56 pass, including the audited data/engine defects, the real attributed UCI contract, cancellation/account changes, private API access, immutable retry, truthful save states, legal replay and the service-role privilege repair.
- `npm run lint:insights`: passes.
- `npm run test:home`: 64/64 pass.
- Auth registration, membership and open-redirect regressions: 51/51 pass after changing Clerk v6 completion routing to supported force-redirect options.
- Isolated browser regressions: 32/32 pass for Home, onboarding, Yahoo Quiet Drag and Arena Quiet Drag.
- `tests/fixtures/insights-staging-acceptance.sql`: 10/10 assertions pass against `CAISSA-READER-STAGING`, covering real idempotency, immutable conflicts, owner FK, foreign deletion, owner retrieval, shared/orphan dataset lifecycle, private/server grants and RPC execution as `service_role`. All fixture data is rolled back.
- Supabase security/performance advisors show no warning/error attributable to the new tables/functions.
- The browser engine check remains Preview-only at `/api/insights/engine-check`; production and development return 404.
- Real cloud-browser WASM acceptance passed on the integrated preview: runtime identity `Stockfish 18 Lite WASM`; all five legal positions evaluated at depth 12; both selected-player moves covered; the selected White player's `0-1` game counted as one loss and zero wins. Runtime was 866 ms. This proves the published engine/adapter integration, not engine-score calibration.
- Desktop and 390 x 844 viewport checks passed: Insights loads independently of Play, dialogs open/close, the exact-player field remains visible, controls are usable and no blocking overflow was found. Alex's visual approval remains pending.

## Authenticated staging evidence

Stable branch preview: `https://tv-lavin-chess-game2-git-feat-insi-8d6c53-elcriollitos-projects.vercel.app/insights`. Branch-scoped Preview variables point only to Supabase project `aqizagaskicotorfpwfn`; production project `jczauvkfkweuvdpurpem` was not touched. `/api/insights/status` returns `authConfigured: true`, `storageConfigured: true`, and `previewUsesStaging: true`. The Supabase secret remains server-only and is not recorded here.

Two dedicated Clerk Development accounts were synchronized to different canonical `public.users.id` values. Account A imported a legal four-ply PGN, selected `Caissa Test A`, produced one loss with 2/2 own moves covered and one forced-mate candidate, and persisted one dataset plus one report. The initial service failure remained visibly unsaved with Retry/Export; after the privilege migration, Retry saved the same operation. A reload and a later sign-out/sign-in recovered and opened the same server report. Account B listed zero reports while A's rows remained unchanged. Signing out changed history to the signed-out prompt. Anonymous report requests return 401 with private/no-store handling.

The SQL acceptance additionally proves same-operation idempotency, different-payload conflict without mutation, rejection of B using A's dataset, equivalent foreign/not-found deletion behavior, deletion of only the owner's synthetic report, preservation of a shared dataset and removal of an orphan dataset.

An invalid local PGN was rejected in the browser as `No valid games found in PGN`; both synthetic accounts remained at five staging credits with zero credit events. The unrelated staging baseline currently has no `public.consume_credits(text, integer, text)` RPC, so a valid Insight emits a pre-existing credit-consume 500 even though the Phase 1 report flow completes. This closure does not create, bypass or modify that out-of-scope credit subsystem.

## Release boundary

The migrations were applied only in staging. They must be applied to production after review and before publishing the feature. Preview report APIs explicitly reject a production database connection. Preview requires its Clerk test verifier and staging Supabase server credentials; `/api/insights/status` exposes only booleans to verify this boundary without leaking keys or user data.

Manual review gate, in order: (1) inspect desktop and mobile copy/layout; (2) import your own small non-sensitive PGN and confirm the exact player/color; (3) generate, wait for `Saved to your account`, reload and reopen it; (4) use Start Fresh and confirm saved history remains; (5) delete only the synthetic report you choose. Do not merge or deploy to production until Alex approves the preview and the separate staging credit-baseline gap is dispositioned.
