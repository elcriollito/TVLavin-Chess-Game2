# Season 10.11A — Five-item content expansion review packets

## 1–4. Baseline, prior decision, current state, and target

Season 10.11A began from clean `main` at `d535b73300085dd03c6706e50b957fbd32c50f09`, equal to `origin/main`. Season 10.10 deferred public release. The hidden technical run remains the fixed two-item `promote` then `stop-promotion` session. This phase prepares three additional private candidates for a possible five-item preview; it does not change that run.

## 5–7. Balance principles, repository search, and method

The search favored distinct objective contracts, geometry, and terminal semantics over three variations of a pawn chase. Knowledge Units, existing private evidence, curated pools, and Trainer tests were searched before generating anything. Three legal, tablebase-covered repository candidates were compared per family. Exactly one recommendation—not approval—was selected for each family.

## 8–9. Conversion

The candidates were favorable central simplification, clean king-supported conversion, and an offset-defender king-supported conversion. `favorable-simplification-open-king-route` is recommended because its five-piece capture and structural transition differ materially from the existing pure-promotion pilot.

## 10–11. Hold draw

The candidates were direct opposition, key-square denial, and a rook-pawn fortress. `direct-opposition-hold-draw` is recommended because it preserves an exact draw through repeated king decisions and does not reduce the lesson to catching the designated pawn. The fortress was rejected as too close to `stop-promotion`.

## 12–13. Activate king

The candidates were a queenside support-region position, its mirrored form, and a separated-wing second-target position. `king-activation-support-region` is recommended with an explicit proposed target: the White king reaches b3 or c3 while preserving the win. The explicit region addresses the family’s otherwise high ambiguity risk.

## 14–16. Exact evidence, engine comparison, and graphs

Every expanded state was retrieved through `lichess-syzygy-remote@1.0.0`. The record is honestly remote; no local Syzygy verification is claimed. Every returned UCI move, SAN string, side transition, and resulting FEN was replayed through `ChessRulesFacade`. Raw provider responses are not stored.

Stockfish 18 was provisioned externally from the pinned official release, checksum-verified, and run at depth 18 with MultiPV 3, one thread, 64 MB hash, and pondering disabled. It is secondary evidence for naturalness and ambiguity only; tablebase evidence remains theoretical authority.

Each recommended position has a deterministic graph bounded at 14 plies. All legal moves are retained and classified at expanded nodes, while breadth is bounded by expanding one continuation for each of three policy proposals. Repetition, unavailable-policy, proposed-success, and maximum-ply boundaries are explicit.

## 17–20. Policies, success, failure, and misses

Packets compare WDL→DTZ→UCI, maximum resistance, and an authored deterministic tree. None is approved. Success proposals cover a concrete board event, an exact-result terminal, and a human-authored terminal. Failure proposals distinguish objective failure, chess-result failure, result-preserving objective miss, recoverable authored-concept miss, and neutral technical unavailability. Promotion and stalemate are explicit unresolved review questions.

## 21–23. Bounds, hints, and feedback

The candidate range is 6–14 plies, with 12 proposed for review. Each packet offers three static hint stages: conceptual, board-specific, and current-node move reveal. The reveal removes independent-success eligibility. All hints and all concise feedback variants are marked `unapproved-human-review-required`.

## 24. Human-review boundary

Every human review and approval field is `null`. Recommendations, Stockfish output, tablebase classifications, and generated routes confer no approval. A reviewer must bind the exact position, graph, engine, and packet digests.

## 25. Aggregate five-item analysis

The private aggregate contains the existing two items plus conversion, hold-draw, and activate-king candidates. It reports five objective contracts, a 3/2 offensive-or-foundational to defensive balance, distinct starting geometry and terminal proposals, and an unresolved all-White learner-side imbalance. It is not a run artifact.

## 26–30. Integrity, security, and release boundary

The promote, stop-promotion, and two-item run identities remain byte-identical. Season 10.9 runtime, Season 10.7 visuals, navigation, Modes, V1, Guided Study, Quick Challenge, pools, manifest, and Knowledge are unchanged. There is no runtime engine, tablebase, Worker, persistence, scoring, telemetry, or account dependency. Packets, graphs, evidence, aggregate analysis, generator, tests, and this document are protected private paths and are excluded from deployment.

## 31. Tests

Focused tests verify candidate legality and count, exact families, designated targets, graph bounds and replay legality, stable digests, null human fields, strict decision allowlists, unapproved proposals, five-item ordering and balance, immutable public artifacts, and protected-path classification. Existing regression, syntax, public-audit, pool, Knowledge, navigation, and browser checks remain the release gates.

## 32. Known limitations

The proposed activation terminal and all authored routes need human review. The future set has no Black learner item. Graphs deliberately compare bounded deterministic continuations rather than exhaustively expanding every reachable state. Remote evidence availability remains an authoring-time dependency only.

## 33–34. Season 10.11B and Limited Preview gap

Season 10.11B may register exact human decisions only after a reviewer supplies rationale, revisions, approved semantics, and all digest bindings for each packet. Limited Preview still requires three approvals, any requested tree or policy corrections, accessibility and privacy/observability review inherited from Season 10.10, runtime implementation in a separately authorized phase, and a new readiness decision.
