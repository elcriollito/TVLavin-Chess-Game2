# Season 10.5B — Human Adjudication and Pool 1.1.0

## 1. Baseline

Season 10.5B began on clean `main` at
`ebb00ab0bfe57c1566d6b7897735856d59bf2f5f`, equal to `origin/main`.

## 2. Season 10.5A audit

All eight unresolved packets, their original authored-content bindings,
Stockfish 18 evidence digests, remote tablebase evidence digests, and packet
digests were present and internally consistent.

## 3. Human reviewer authorization

The authorized private reference is `reviewer:alexander:season-10.5b`, revision
`1`. It is present only in protected authoring records and never in runtime
artifacts.

## 4. Decision-registration contract

The deterministic registration command validates unresolved packet state,
decision allowlist, exact reviewer reference/revision, nonempty rationale, and
all three reviewed evidence digests. Duplicate, forged, incomplete, or stale
registration fails closed.

## 5. Digest binding

Every registered decision binds the original position-content digest, engine
evidence digest, remote evidence digest, and packet digest. The bundle digest
excludes no decision data and contains no timestamp.

## 6. Eight adjudications

Safe king and restrained approach gained approved alternatives. Key-square and
breakthrough positions became explicitly authored objectives. Outside passer,
opposition, coordinate support, and pawn majority received the exact approved
primary-move or objective corrections.

## 7. Authoring changes

Exactly eight positions changed. No FEN, provenance, membership, scoring
eligibility, or unrelated position changed.

## 8. Objective changes

Six previous `only-move` positions now use `authored-move`. Safe king and
restrained approach already used that objective. The two engine-confirmed
historical positions retain `only-move`.

## 9. Accepted alternatives

Only the approved alternatives are included. Every move is legal, normalized to
LAN/SAN by the existing rules facade, unique within its position, and verified
against archived tablebase move evidence where the human rationale claims WDL
preservation.

## 10. Hint and feedback changes

Opposition, coordinate support, and majority transformation use the exact
approved hints and feedback. Other learner copy changed only where explicitly
required to express an authored objective.

## 11. Pool versioning

`caissa-king-pawn-decisions@1.1.0` is a new immutable score cohort with ten
positions. It declares content-compatible runtime behavior but prohibits score
comparison across versions. There is no `latest` alias.

## 12. Preservation of 1.0.0

The published `1.0.0` bytes, fingerprint
`epool-fnv1a32-7f150692`, and digest
`sha256-edf0ca70dccbafb2638e2661213e82d600214402aa7c3f305d4f836c87ba7984`
remain unchanged and addressable.

## 13. New fingerprint

Pool `1.1.0` uses `epool-fnv1a32-920ee3e2`.

## 14. New SHA-256

The canonical pool digest is
`sha256-09ff74d66ec02dca23b8faa844baabf452fab316b5ee08abc256b3787805859f`
and is pinned by the manifest and registry.

## 15. Manifest update

Manifest schema remains `1.0.0`; it contains explicit entries for both versions,
with exact paths, fingerprints, digests, counts, objective types, and safe
verification summaries.

## 16. Engine rereview

All ten revised-source positions were analyzed with the pinned Stockfish 18
identity and `caissa-engine-review-standard@1.0.0` policy. Evidence is private
and bound to revised position content. It did not modify approved content.

## 17. Remote evidence reuse

All FENs and the provider request contract are unchanged. The eight archived
responses were therefore reused without network calls. A deterministic private
reuse collection binds each original response/request digest to revised content
and verifies every approved move against provider moves and WDL-preserving
moves. This remains remote evidence; local tablebase verification is zero.

## 18. Public verification summary

Public metadata reports legality/rules/editorial approval, eight human
adjudications, ten available engine records, eight human-reviewed engine
evidence bindings, eight remote evidence records, and zero local tablebase
verification. Legacy `engineReviewedCount` remains zero because it is not used
as a blanket engine-confirmation claim.

## 19. Quick Challenge default

The allowlisted default is exactly
`caissa-king-pawn-decisions@1.1.0`. Version `1.0.0` remains allowlisted for
historical retrieval; arbitrary or `latest` selection remains unavailable.

## 20. Runtime compatibility

V2 remains opt-in and uses one board, no engine Worker, five unique deterministic
positions, in-memory session state, local preview score, and no learner evidence
or persistence writes. V1, Guided Study, Board API, and session schema `2.0.0`
are unchanged.

## 21. Accessibility

Objectives and feedback remain textual. Approved alternatives use the existing
live-region success flow; legal non-authored moves receive instructional rather
than universal-loss feedback. Keyboard, focus, Modes, responsive, and Axe gates
remain required. No manual screen-reader claim is made.

## 22. Security

Canonical serialization, allowlisted decisions/reviewer/version, exact digest
comparison, legal-move normalization, immutable version paths, manifest
verification, and private-path exclusion protect the release. Browser code
contains no reviewer or evidence data.

## 23. Public/private boundary

Only the two runtime pools, manifest, registry, safe summaries, learner copy,
alternatives, and public provenance are public. Adjudications, rationale,
reviewer reference, packets, engine/tablebase evidence, authoring, scripts,
tests, and documentation remain protected.

## 24. Testing

Focused contracts cover registration failures, exact edits, unchanged
positions, move legality, version identities, evidence reuse, public summaries,
default selection, reproducibility, and exclusions. Full Node, three-browser,
Axe, Knowledge, syntax, lint, build, and production smoke gates apply.

## 25. Rollback

Runtime rollback changes the default descriptor back to explicit `1.0.0`.
Both artifacts remain immutable and no stored session or learner data migration
exists.

## 26. Risks

Production remains unsigned, local Syzygy coverage remains zero, Stockfish is
bounded depth evidence, remote eight-piece coverage is partial, and human
screen-reader testing remains outstanding.

## 27. Endgame Run readiness

Classification is `verification-infrastructure-ready`. There is still no
trustworthy multi-move item, deterministic opponent policy, competitive timer,
Personal Best trust model, local tablebase inventory, or human accessibility
evidence.

## 28. Recommended Season 10.6 task

Provision checksummed local Syzygy coverage and author one separately reviewed
multi-move conversion objective with deterministic opponent/evaluator and
accessibility behavior before considering an Endgame Run technical pilot.
