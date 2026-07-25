# Season 10.2 Curated Endgame Pool System

## 1. Baseline

Season 10.2 began on clean `main` at `f9b82360defb003dafd495a6b47d9f94784ad84a`, equal to `origin/main`. The authorized project remains `tv-lavin-chess-game2`. Season 10.0 and 10.1 architecture are normative.

## 2. Season 10.1 audit

Season 10.1 mounts V2 only for exact `trainerV2=1`, while Guided Study parameters retain V1 priority. It creates one board, no engine Worker, one ephemeral five-item orchestrator, authored one-ply evaluation, preview scoring, native Modes dialog, and no progress/evidence writes.

## 3. Authoring architecture

Ownership is separated:

`endgame-pools/authoring/pools/*.json → validator → deterministic builder → public/data/endgame-pools/<pool>/<version>.json → allowlisted browser consumer → orchestrator`

Authoring JSON is private and editable. Published JSON is immutable runtime content. Session state remains separate and mutable in memory.

## 4. Source schema

Position schema `1.0.0` includes stable identity, title/theme, FEN/turn, objective/evaluator, authored answer and alternatives, hints, feedback, difficulty, verification, eligibility, provenance, concept mappings, and private editorial review. It contains no session result.

## 5. Verification states

The vocabulary permits draft, legality-verified, rules-verified, engine-reviewed, tablebase-verified, editorially-approved, published, and retired without claiming they are a mandatory linear ladder. Separate booleans record legal FEN, legal answer, evaluator compatibility, engine review, tablebase verification, editorial approval, and publication eligibility.

`tablebaseVerified=true` requires a real reference. The initial reviewed pool has zero tablebase-verified and zero engine-reviewed positions.

## 6. Runtime validator

`curated-pool-validator.js` validates schema/contract versions, IDs, duplicates, FEN, kings, adjacency, terminal state, turn, objective/evaluator pairing, answer and alternative legality, SAN/LAN normalization, hints, difficulty, verification, score eligibility, provenance, membership, and fingerprint. It returns versioned structured errors and can fail closed.

## 7. Deterministic builder

`scripts/build-endgame-pools.mjs` reads private JSON, validates, normalizes FEN and moves, strips editorial metadata, computes the compatibility fingerprint, writes canonical key-sorted JSON, and generates the browser registry. `--check` fails for stale output.

## 8. Published artifact contract

Pool schema and contract remain `1.0.0`. Artifacts declare ID/version, copy/theme/difficulty, objectives, ordered membership/count, verification summary, scoring/PB/leaderboard eligibility, repeat/selection policies, provenance summary, positions, and fingerprint.

## 9. Immutability

Published paths contain explicit pool ID and semantic version. The consumer recursively freezes validated artifacts. Existing version bytes must never be edited after publication.

## 10. Versioning

A correction requires a new pool version, fingerprint, changelog entry, and compatibility decision. No `latest` alias exists. Score comparison across versions remains forbidden.

## 11. Fingerprints

`epool-fnv1a32-*` is a deterministic compatibility checksum over canonical artifact content excluding the fingerprint field. It detects accidental or cached drift against the registry. It is not cryptographic trust, anti-cheat, or protection from a malicious browser user.

## 12. Provenance

Every reviewed position references the exact immutable Knowledge release, Unit/activity, and position. Published provenance excludes private review notes but keeps traceable source identity.

## 13. Objective eligibility

`only-move` accepts one authored legal move. `authored-move` accepts one expected move plus explicitly authored alternatives. Both are one-ply and use `authored-exact-legal-move`. Win, draw, promote, and stop-promotion remain deferred because robust multi-move result evaluators are not present.

## 14. Accepted alternatives

Alternatives are normalized independently to LAN/SAN, checked legal, deduplicated against the expected move and each other, and accepted only from authoring data. Runtime Stockfish never invents alternatives.

## 15. Hint authoring

Hints are ordered authored stages with text, independence effect, score percentage, and answer-reveal flag. Season 10.2 uses one authored clue followed by the existing synthesized Reveal answer. No LLM or engine PV creates learner copy.

## 16. Difficulty metadata

Bands are foundation, developing, or intermediate. Basis is explicitly `editorial-estimate`; calculation depth, concept count, and only-move status are transparent signals, not empirical calibration or false precision.

## 17. Scoring eligibility

Every position and the pool allow preview score only. Personal Best and future leaderboard eligibility are false. Learner copy remains “Local practice score.”

## 18. Quick Challenge integration

The page preloads the exact allowlisted artifact, and the existing Start Challenge action validates/selects five positions and starts the session. The orchestrator receives only a validated published pool and selected positions, never authoring source paths.

## 19. Cache behavior

The registry pins exact ID/version/fingerprint/URL. The consumer uses one promise cache per immutable pool and `force-cache`; failures clear the cache for safe retry. No arbitrary query path or downgrade is accepted. A future Daily Challenge must record an exact registry ID/version/fingerprint.

## 20. Browser validation

Playwright runs the complete V2 flow against the local production server using its isolated Chromium, Firefox, and WebKit builds. Coverage includes flag entry, pointer and keyboard moves, incorrect feedback, hint/reveal, Continue/completion, Modes, Escape, V1, Guided precedence, responsive widths, zoom, reduced motion, and axe.

## 21. Accessibility validation

Automated axe scans cover the visible V2 shell and Modes dialog. Keyboard tests cover Start, a legal board move, modal open/Escape, and focus return. Tests check text feedback, labels, live region markup, 44px targets, zoom 200%, mobile overflow, and reduced motion. This is not a WCAG conformance or screen-reader certification.

## 22. Security limitations

Allowlisted registry selection, exact versions, content fingerprints, structured validation, legal-move normalization, text-safe rendering, and state generations defend compatibility and accidental alteration. All client code remains user-controllable and cannot confer competitive trust.

## 23. Error handling

Missing pool, HTTP failure, invalid version/fingerprint/content, invalid position, unsupported objective, and load interruption fail closed. Learners receive concise unavailable copy. Orchestrator unavailable/recovering states remain neutral to score, streak, evidence, and persistence.

## 24. Performance

The reviewed artifact is approximately 16 KB uncompressed. Build/validation and browser board-ready timings are measured in release validation, not asserted as universal product guarantees. The runtime fetches a pool once, creates one board, and creates no Worker.

## 25. Public artifact boundary

Published pool JSON, registry, consumer, and runtime validator are public runtime requirements. `endgame-pools/authoring/`, scripts, tests, Playwright configuration, and architecture documents are excluded by both release builder and Vercel ignore rules.

## 26. Technical-pilot migration

`caissa-quick-challenge-technical-pilot@1.0.0` remains byte-identical in its historical module and tests. Its legacy `qc10.1:*` fingerprint was not builder-derived, so rebuilding it under the same identity would be a silent mutation. It is no longer the default pool.

## 27. New reviewed pool

`caissa-king-pawn-decisions@1.0.0` contains ten released authored decisions covering opposition, key squares, king support, reserve tempo, breakthrough, outside passer, majority, simplification, king activity, and fixed weakness.

## 28. Testing

Focused suites cover authoring defects, chess legality, deterministic output, fingerprint/membership drift, public/private boundaries, allowlisting/cache/selection, orchestrator alternatives and failures, and real browser/accessibility behavior. The complete repository regression remains the release floor.

## 29. Rollback

Immediate UI rollback removes `trainerV2=1`. Runtime rollback restores the prior page/orchestrator imports and leaves the reviewed artifact unused. No persisted session or data migration exists. Historical pilot code remains available.

## 30. Known limitations

Positions are legal, rules-compatible, editorially approved from immutable released activities, and one-ply authored; they are not tablebase-certified, empirically calibrated, rated, tamper-proof, or suitable for PB/leaderboard comparison. Manual screen-reader and inclusive user testing remain outstanding.

## 31. Season 10.3 readiness

The pool system can supply exact immutable versions to future finite sessions. Season 10.3 should first define multi-item timer/pause trust, score compatibility, local storage consent, and objective evaluators. Endgame Run, PB, and leaderboards require separate authorization and must not infer trust from this browser checksum.
