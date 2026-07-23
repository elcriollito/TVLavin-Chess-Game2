# Season 9.0.4 — Editorial Authoring Pipeline and First Knowledge Cluster

Status: implemented production cluster

## Infrastructure boundary

The repository, taxonomy, hashing, immutable snapshot, verification, and reader
contracts are sufficient. This increment adds no signing, catalog, channel,
search, storage, transport, UI, or runtime integration. Season 9 now spends its
complexity budget on authored educational meaning and review.

## Cluster and boundaries

The five-unit pawn-ending foundation is:

1. **The pawn’s square** — recognize catchability geometry and tempo.
2. **Activate the king** — compare king improvement with an irreversible pawn
   move while checking tactical exceptions.
3. **Recognize direct opposition** — recognize exact king geometry plus turn.
4. **Reach the key squares** — identify the destination that king geometry is
   meant to reach.
5. **Convert with king support** — integrate target, access, pawn timing, and
   recalculation into independent move order.

Each answers a distinct learner question: Can the king catch the pawn? What
should the king influence? Who yields access? Where should the king arrive?
Which piece should move now? Combining them into one lesson would blur
recognition, planning, geometry, destination, and integration assessments.

Breakthrough, reserve tempi, corresponding squares, shouldering, and specialized
passed-pawn concepts are deferred. They either require multi-pawn structures or
deeper calculation and would branch before foundational coordination is secure.

## Progression and graph

The instructional motion is recognition → planning → pattern understanding →
guided target application → independent coordination.

The pawn’s square is related/preparatory to king activation, not a hard
prerequisite. Direct opposition requires activation. Key squares requires
activation and direct opposition. Supported conversion requires activation and
key squares; opposition is useful but not universally required for every
conversion geometry.

Progression and recommendation edges guide the normal route. Remediation sends
route failures from opposition to activation, blocked target access from key
squares to opposition, and premature conversion decisions to key squares or
activation. The key-square contrast with opposition records the essential
boundary: opposition is king geometry; a key square is a destination.

## Position and truth policy

Each new unit has one clean demonstration and one transfer or contrast. Positions
change the learner’s reasoning task, not merely the board file. FEN, turn, role,
concepts, legal principal idea, and educational verification boundary are
explicit.

Exact claims are limited to legal moves, king adjacency, direct-opposition
geometry, turn, and the declared structure. “Activate before pushing” and
move-order guidance are practical heuristics with stated race, capture,
promotion, entry, and structural exceptions. No tablebase result, forced win,
or uniqueness is invented.

## Authoring and editorial model

`knowledge/AUTHORING.md` is the operational standard. The scaffold returns a
visible empty draft shape plus active taxonomy values; it never writes files or
generates content. The editorial report summarizes objective metadata only.

Lifecycle is draft → editorial review → chess verification → educational
verification → approved → published → deprecated. Current schema lifecycle and
editorial/verification fields already represent these gates; no schema change
is needed.

Automated validation owns required arrays, taxonomy/schema/version integrity,
FEN and side-to-move structure, legal principal sequences, unique position and
learning-object IDs, graph targets/cycles/reasons, published prerequisites,
locales, provenance declarations, and artifact freshness.

Humans own concept boundaries, theoretical truth, instructional usefulness,
position purpose, prose clarity, exception quality, difficulty, originality,
copyright assessment, and whether observable mastery tasks validly measure the
idea.

## Mastery, coaching, and recommendations

Mastery criteria name observable diagram/task behavior, varied samples, success
thresholds, and hint limits. Knowledge declares the criterion; Training Memory
will later record evidence.

Each new unit authors five ordered deterministic prompts: observation, recall,
direction, decision process, reflection. The flat prompt array is sufficient
when governed by this convention; extending the schema only for stage labels
would add complexity without new capability.

Integration metadata declares concepts, theme links, criterion IDs, next units,
remediation units, and Academy compatibility. It does not alter Coaching,
Memory, Mastery, or Recommendation behavior.

## Originality and localization

All explanations, sequences, prompts, exercises, and positions were independently
constructed for CAISSA around universal chess ideas. No commercial text,
annotations, or curated diagram sequence was copied. Provenance notes and
copyright/originality declarations are mandatory.

Only complete reviewed `en-US` content is declared. Locale-neutral identity and
structure permit later translation without duplicating graph or chess truth.

## Publication

The existing unit receives content version `1.1.0` solely for new graph
relationships; the historical release retains its `1.0.0` payload. Taxonomy
`1.1.0` adds only vocabulary required by the cluster.

Publication sequence:

1. validate taxonomy and all five source units;
2. run editorial report and tests;
3. regenerate working manifest and graph;
4. build a new immutable snapshot;
5. independently verify and reproduce it;
6. query all five units and graph/facets through the reader;
7. retain and re-verify the one-unit historical release.

## Current limitations and next educational work

Repository validation cannot prove prose originality, theoretical outcomes, or
pedagogical effectiveness. Coaching stage semantics are an authoring convention,
not schema fields. Public provenance remains intentionally absent from runtime
payloads because private workflow and public attribution share one editorial
object.

The next cluster should add pawn-tempo and multi-pawn structure concepts—
reserve tempi, protected/outside passed pawns, and breakthrough—only after a
separate boundary review prevents overlap with this king-coordination cluster.
