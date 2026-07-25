# Season 10.3 — Verified Content and Artifact Integrity

## 1. Baseline

Implementation began on clean `main` at `8d311bf490a0de19891c1688c483a1ae379bc032`, equal to `origin/main`.

## 2. Season 10.2 audit

The private-source → deterministic-builder → immutable-artifact → allowlisted-consumer boundary is sound. Its FNV-1a value detects compatibility drift but is not cryptographic.

## 3. Trust model

Human review, chess evidence, artifact integrity, runtime compatibility, learner score, and competitive trust are separate. A browser digest proves consistency with the published manifest, not that the client or score is globally trustworthy.

## 4. Editorial workflow

Workflow `1.0.0` supports draft, author-reviewed, chess-review-required, chess-reviewed, verification-required, verified, editorially-approved, publish-ready, published, rejected, and retired. Transitions are policy decisions rather than an automatic linear ladder.

## 5. Review roles

Private stable role references distinguish content author, chess reviewer, editorial approver, builder, and publication. They are repository identities, not learner accounts or public personal data.

## 6. Approval invalidation

The review digest covers FEN, objective/evaluator, expected move, alternatives, hints, and provenance for every position. Mutation makes the bundle stale and blocks the builder.

## 7. Engine-review architecture

`scripts/endgame-engine-review.mjs` is a private UCI runner with fixed depth/MultiPV inputs, timeout, engine identity, and normalized result boundary. It never edits authored answers, hints, alternatives, or feedback. No approved CLI engine executable was available, so no engine evidence was asserted.

## 8. Tablebase architecture

The adapter accepts an offline Syzygy-compatible probe, supports at most seven pieces, and records exact FEN identity, tool/version, WDL, supported DTZ, and best moves. It has no production network dependency. No local Syzygy files/probe existed, so all current tablebase claims remain false.

## 9. Verification evidence

Private evidence schema `1.0.0` supports legality, authored-answer-legality, engine-review, tablebase, human-chess-review, and editorial-approval records bound to position, input, and output fingerprints.

## 10. Public verification summaries

Public artifacts expose only legal/rules/editorial counts plus truthful engine/tablebase counts. Reviewer references, notes, raw UCI, raw probes, paths, and timestamps remain private.

## 11. FNV compatibility fingerprint

`epool-fnv1a32-7f150692` remains the unchanged debug/compatibility identity of pool `1.0.0`. It is not a security primitive.

## 12. SHA-256 digest

The manifest records `sha256-edf0ca70dccbafb2638e2661213e82d600214402aa7c3f305d4f836c87ba7984` for the unchanged parsed artifact.

## 13. Canonical serialization

Digest input is recursively key-sorted JSON, arrays retain authored order, strings retain JSON Unicode semantics, no whitespace is present, and the file newline is excluded. The external digest avoids self-reference and preserves the old artifact bytes.

## 14. Manifest contract

Manifest `1.0.0` declares exact ID/version/path, compatibility fingerprint, SHA-256 digest, count, objectives, safe verification summary, publication state, and signature posture. It contains no timestamp or `latest`.

## 15. Signature-ready architecture

The manifest declares intended `Ed25519`, nullable `keyId`, and `signatureStatus: unsigned`. A future signer would sign `manifestDigest` and add signature/signedAt outside digest input under an approved key lifecycle.

## 16. Runtime integrity checks

The consumer checks manifest digest, unsigned status, membership, exact runtime path, pool ID/version, FNV fingerprint, and SHA-256 through Web Crypto. If Web Crypto is unavailable, it retains manifest/registry compatibility checks without pretending cryptographic verification.

## 17. Objective eligibility matrix

The private matrix covers only-move, authored-move, win, draw, promote, stop-promotion, hold, convert, defend, select-plan, and assessment with evaluator, verification, engine/tablebase, alternatives, multi-move, score, PB, leaderboard, and season disposition.

## 18. New evaluators

None. Without reproducible engine or tablebase evidence, adding win/draw/promote/stop-promotion would weaken trust or incorrectly reduce a multi-move goal to its first move.

## 19. Multi-move boundary

No controller was introduced. A future subordinate item controller must own learner/opponent turns and terminal proof without replacing the session orchestrator or Board API.

## 20. Opponent policies

No opponent policy was activated. Future permitted policies are versioned authored reply, deterministic line, offline tablebase-optimal, or engine-fixed-settings; technical failure remains neutral.

## 21. Pool versioning

`caissa-king-pawn-decisions@1.0.0` remains byte-identical. Because learner content and runtime contract did not change, no artificial `1.1.0` was issued. The external manifest adds integrity without rewriting history.

## 22. Security dependency triage

`npm audit` reports nine advisories: one moderate, seven high, one critical. Direct packages are Clerk 2.29.5 (server auth), adm-zip 0.5.16 (archive processing), sharp 0.34.5 (build/image), and ws 8.19.0 (server/realtime). Transitives are Clerk shared/js-cookie, js-dos/lodash, Stripe/qs, and Cheerio/undici. Browser Quick Challenge imports none. Clerk and ws are potentially production-reachable; adm-zip depends on untrusted ZIP inputs; sharp/Cheerio are tooling; js-dos/lodash is a separate public feature. Fixed versions and compatibility must be assessed in a dedicated security change. No advisory was suppressed and no breaking auto-fix ran.

## 23. Browser verification

Playwright covers Chromium, Firefox, and WebKit: V1, V2, Guided precedence, manifest load, valid completion, tampered digest, hints, reveal, Continue, Modes, keyboard, responsive widths, zoom, and reduced motion.

## 24. Accessibility manual plan/results

Automated keyboard and Axe checks cover entry, Start, objective text, board input, incorrect/hint/reveal/Continue, progress, summary, Modes, Escape, focus return, and unavailable state. NVDA, Narrator, VoiceOver, and a human screen-reader operator were unavailable; therefore no manual screen-reader or WCAG claim is made. Deferred script: traverse the preceding flow with speech logging, verify live-region timing/verbosity and square announcements, then repeat NVDA+Firefox/Chromium and Narrator+Edge.

## 25. Performance

Release validation records local Windows/Node build, SHA, manifest, browser-load, transition, and memory observations. They are environment observations, not cross-platform guarantees. Exact authored moves initialize no Worker.

## 26. Error handling

Incomplete/stale reviews block build. Engine unavailable/version mismatch and tablebase unavailable/unsupported/invalid results are explicit. Manifest/digest/version/path mismatch blocks Start, re-enables retry, and creates no score, evidence, or persistence. Unsigned is accepted only because registry and manifest explicitly agree; unknown signing keys are reserved for the future signed contract.

## 27. Public artifact boundary

Only pool JSON, manifest, registry, integrity/consumer/validator modules, and runtime code are public. Sources, reviews, objective matrix, raw evidence, scripts, docs, tests, Playwright, keys, and diagnostics are excluded.

## 28. Rollback

Revert the consumer manifest dependency and generated registry, leaving immutable pool `1.0.0` untouched. Removing `trainerV2=1` remains immediate product rollback with no migration.

## 29. Known limitations

No engine-reviewed or tablebase-certified current position, no signature/key infrastructure, no manual screen-reader matrix, local unverified score/timer, no pause/recovery/PB, and unresolved npm advisories.

## 30. Endgame Run readiness

Classification: `architecture-ready`. Integrity and review foundations exist, but verified objective diversity, deterministic multi-move opponents, timer/pause trust, recovery, accessibility evidence, security remediation, and PB policy are insufficient for a technical or production run.

## 31. Recommended Season 10.4 task

Provision a pinned licensed Stockfish CLI and offline Syzygy set in an isolated verification environment, produce reproducible evidence for a new pool version, establish managed Ed25519 signing, and complete a human screen-reader matrix before implementing an Endgame Run pilot.
