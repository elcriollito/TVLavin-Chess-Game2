# Season 10.4 — Verification Infrastructure and Run Readiness

## 1. Baseline

Clean `main` at `ba4289f0bb4e1ba2607cfd93f7b09f85397e6e86`, equal to `origin/main`; Vercel project `tv-lavin-chess-game2`.

## 2. Season 10.3 audit

Review binding, private evidence, SHA-256, unsigned manifest, Web Crypto, objective matrix, and public/private boundaries matched architecture. The engine and tablebase adapters were previously non-operational.

## 3. Trust infrastructure

Repository code, external executables, verification assets, private keys, public trust metadata, and learner runtime are distinct. Private tools never become runtime dependencies.

## 4. Stockfish provisioning

The explicit Windows script downloads official stable Stockfish 18 x64 AVX2 from GitHub release `sf_18`, verifies archive SHA-256 `6f6c272ebd6ea594377715235c8a7326f75940ef4f4f856f45106028fe6ae900`, and extracts only into a caller-selected external directory. GPL-3.0 applies. The local install is `%LOCALAPPDATA%\CAISSA\verification\stockfish-18`; binary and archive are absent from Git, CI, Vercel, and public release.

## 5. Engine identity

Identity `stockfish-18-windows-x64-avx2` pins name `Stockfish 18`, release, platform, architecture, archive and binary digests, UCI options, and policy. Binary SHA-256 is `c86215fa1977d53b82ed854540a4c7b025be4cd042276c85ba3de53fb9118911`.

## 6. Analysis policy

`caissa-engine-review-standard@1.0.0`: depth 18, MultiPV 3, Threads 1, Hash 64 MB, Ponder false, 30-second timeout. Runner waits for `uciok` and `readyok`, rejects identity/checksum/platform/output failures, and sends quit or kills on failure.

## 7. Real engine review

All 10 positions were analyzed with the pinned binary. Results: 2 confirmed, 4 require human review, and 4 authored answers questioned. Engine evidence does not edit or approve content. Existing `1.0.0` stays immutable and publicly `engineReviewed=0`; discrepancies block competitive reuse and require human review/new version.

## 8. Engine evidence

Private normalized records contain exact position digest, engine identity, policy, best move, depth-18 MultiPV, score, PV, nodes, selective depth, duration, classification, and evidence digest. No raw endless UCI log is committed.

## 9. Syzygy strategy

Target is 3–5 pieces, approximately 1 GB from the Sesse Syzygy mirror, authoring-only. Six/seven-piece storage is not approved. Adapter maximum seven is not installed coverage. Git, frontend, Vercel, and normal CI are forbidden asset locations.

## 10. Syzygy provisioning

The private Node utility accepts an explicit directory and reviewed inventory of HTTPS URLs plus SHA-256, verifies every file, and reports installed coverage. It never runs in production. No checksum inventory/assets were approved in this environment, so installed coverage is zero.

## 11. Tablebase probing

No real probe ran. All public `tablebaseVerified` values remain false. Missing directory/table, checksum drift, unsupported count, and invalid probe results are explicit failures.

## 12. Disagreement handling

Engine/tablebase disagreement, nonoptimal authored moves, equivalent tablebase moves, and false only-move claims create private discrepancies and require human chess review. Objective-dependent disputes block a corrected/new publication; historical bytes are not silently rewritten.

## 13. Key-management decision

Options considered: offline local, CI/GitHub secret, Vercel server secret, external/hardware signer, and defer. Selected model is external offline signing until owner, rotation, backup, revocation, and incident-response governance are approved. CI/Vercel secrets were rejected for current production.

## 14. Signing procedure

`sign-endgame-manifest.mjs` requires an external PKCS#8 Ed25519 private-key path, explicit key ID, input manifest, and output. It recomputes canonical signed-manifest digest and signs that digest. Production signing was not run.

## 15. Public key registry

The runtime registry is intentionally empty. Entries support allowlisted key ID, Ed25519 SPKI base64, active/retiring/revoked/test-only status, and optional validity. No production key exists.

## 16. Signature verification

Web Crypto verifies canonical digest, allowlisted key, status, algorithm, validity, and Ed25519 signature. Tests reject unknown, revoked, invalid, and unsigned cases. Signed manifests cannot silently fall back when Web Crypto is unavailable.

## 17. Signature limitations

A signature proves possession of a private key and manifest integrity. It does not prove chess truth, review correctness, browser integrity, fair play, or global score trust.

## 18. Accessibility human protocol

The private protocol covers V2 entry, regions/headings, Start, objective/turn, board, correct/incorrect, hint/reveal, Continue/progress, Modes/Escape/focus, summary/replay/exit, and neutral digest failure with structured issue severity.

## 19. Accessibility results

No human screen-reader operator or supported automation interface was available. Existing keyboard, focus, live-region, responsive, and Axe automation remains evidence; no NVDA/Narrator/VoiceOver or WCAG claim is made.

## 20. Multi-move objective spike

Not implemented. Engine discrepancies and absent tablebase proof make promote/stop-promotion untrustworthy. Quick Challenge remains exact authored practice.

## 21. Opponent policy

None activated. A future spike should prefer offline tablebase-optimal, then an authored deterministic reply tree; technical failure must be neutral.

## 22. Item state machine

No runtime controller was added. The proposed subordinate configured/loading/learner/opponent/evaluating/success/failure/unavailable/abandoned states remain architecture only.

## 23. npm audit triage

Initial audit: 9 (1 moderate, 7 high, 1 critical). Critical Clerk shared middleware bypass was not reachable because CAISSA uses direct `verifyToken`, not Clerk middleware; related organization/billing/reverification paths are absent. Safe within-major updates to `@clerk/backend@2.33.6` and `ws@8.21.1` remove Clerk/shared/js-cookie/ws advisories. Remaining 5: direct `adm-zip@0.5.16` (downloaded ZIP memory allocation; production tool path, upgrade 0.6.0 carries 0.x risk), transitive `lodash@4.17.23` under js-dos (template/unset misuse not found in CAISSA), transitive `qs@6.14.1` under Stripe (server dependency; fixed via major supplier update), direct dev `sharp@0.34.5` (favicon tooling; major 0.35), and transitive dev `undici@7.20.0` under Cheerio (test/build parsing). These require separate updates and regression rather than forced migration.

## 24. Performance

Windows 11, x64, Node 24.12.0: first engine startup plus depth-18 review about 0.9 s; full 10-position review 8.2–8.3 s; pool build-check median 72.54 ms; ephemeral Ed25519 signing/verification means 0.1350/0.2104 ms. Local browser observations were Chromium 71/35 ms, Firefox 77/62 ms, and WebKit 226/146 ms for challenge start/next-item transition. Chromium reported zero heap delta at the sampled points; the other engines do not expose that nonstandard metric. Every engine observed one board and zero Workers. No engine initializes in learner Quick Challenge.

## 25. Error handling

Missing binary, checksum/platform/version mismatch, UCI timeout, malformed result, crash, Syzygy inventory/download/checksum/coverage/probe errors, missing/invalid key, unknown/revoked key, invalid signature, unsigned manifest, and technical runtime failure are typed. No trust claim is silently downgraded.

## 26. Private exclusions

External binary/archive, Syzygy assets/indexes, engine/tablebase evidence, reviews, private keys, audit JSON, accessibility report, scripts, tests, traces, screenshots, videos, and architecture remain outside public deployment.

## 27. Endgame Run readiness

Classification: `architecture-ready`. Engine verification is operational, but the current pool has unresolved discrepancies; tablebases, production signing, human screen-reader evidence, multi-move evaluator, deterministic opponent, pause/recovery, and PB policy are absent.

## 28. Rollback

Private tooling and dependency pins can be reverted without data migration. Production manifest remains unsigned and unchanged; V2 remains opt-in.

## 29. Known limitations

No installed Syzygy files, no real tablebase evidence, no managed production key/signature, no human accessibility run, no multi-move objective, current pool not engine-approved, and five npm advisories remain.

## 30. Recommended Season 10.5 task

Human-review the eight engine discrepancies and author a new pool version, approve a checksummed 3–5-piece Syzygy inventory, establish owner-controlled offline Ed25519 rotation/revocation, execute NVDA/Narrator testing, and only then consider a private promote/stop-promotion spike.
