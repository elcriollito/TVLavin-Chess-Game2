# Season 9.0.7 — Pawn Exchanges and Favorable Simplification

Season 9.0.7 follows structural-weakness study by teaching the learner to
compare the position before and after an irreversible pawn exchange. It adds
four units and no UI, runtime integration, schema, or release infrastructure.

## Units and boundaries

1. **Preserve useful pawn tension** concerns unresolved captures and structural
   options. It differs from reserve tempo: reserve tempo stores a waiting move
   to transfer move obligation, while tension preserves alternative structures.
   Tension helps when clarification releases the opponent; it becomes passive
   when waiting loses king access or a concrete favorable exchange.
2. **Exchange into a passed pawn** reconstructs capture and recapture orders,
   identifies the surviving passer, and verifies the race. Majority play
   mobilizes numerical superiority over time; this unit evaluates one concrete
   exchange transformation.
3. **Create a second distant target** remains specific to pawn endings and king
   routes. A second target is genuine only when separation prevents one route
   from covering both responsibilities in time. Two weaknesses are not
   automatically winning.
4. **Simplify into a favorable king ending** culminates the cluster by comparing
   the current position with the reconstructed king ending. Favorability
   requires measurable improvement in king access, opposition, key squares,
   reserve tempi, targets, or races—not merely fewer pawns.

The progression is option preservation, exchange calculation, target
multiplication, and irreversible transition.

## Before-and-after model

Authors and learners use the same bounded process: record pawn counts and
structure; list captures and advances; calculate recaptures; reconstruct the
resulting board; identify passers; recalculate king routes, opposition, key
squares, and reserve tempi; compare races; then decide.

Exact facts include legal sequences, pawn counts, passer status, side to move,
king distance, and encoded geometry. Guidance remains qualified: tension is
often useful when clarification helps the opponent, distant targets matter
when routes truly divide, and simplification is favorable only when the
resulting features improve. Every unit includes a contrast or near-miss.

## Graph, mastery, and coaching

Minimal prerequisites are majority → exchange-to-passer, outside passer →
second target, and king activation plus direct opposition → favorable king
ending. Tension and reserve tempo are related contrasts, not prerequisites.
Earlier reserve-tempo and majority units recommend the new cluster.
Remediation returns race errors to the pawn’s square and bad transitions to
king activation, opposition, or key squares.

Each unit has two threshold-based mastery criteria, two materially distinct
positions, all five core learning-object types, and six deterministic coaching
stages: observation, structural classification, candidate identification,
before-and-after calculation, process reminder, and reflection. The final unit
contains a bounded cross-cluster review comparing tension, capture order,
divided defense, and simplification.

## Taxonomy, verification, and release

Taxonomy `1.4.0` adds `pawn-tension`, `exchange-decision`, `capture-order`,
`divided-defense`, and `favorable-simplification`. Existing structure, passer,
race, king-activity, opposition, and key-square concepts are reused.

Automated checks verify FEN, side to move, legal principal lines, taxonomy,
graph integrity, and release reproducibility. No engine or tablebase result is
claimed. Human review remains responsible for instructional evaluation beyond
encoded facts, originality, and copyright.

The immutable release contains seventeen published units and preserves the
one-, five-, nine-, and thirteen-unit releases byte-for-byte. The library
remains disconnected from visible product surfaces.

With seventeen connected units across four mature pawn-ending clusters, the
recommended next milestone is a small read-only Endgame Library surface backed
exclusively by the immutable consumer API. It should expose browsing and unit
reading without learner-state writes, coaching changes, or training integration.
