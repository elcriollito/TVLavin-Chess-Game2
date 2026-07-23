# Season 9.0.5 — Pawn Structure Transformation Cluster

## Outcome and scope

Season 9.0.5 expands the immutable library from five to nine published
Knowledge Units. It adds no UI, runtime integration, schema, release mechanism,
or learner-state behavior. Knowledge Units remain the educational source of
truth; the eight new positions are evidence selected to serve those units.

The cluster follows king-and-pawn foundations because it changes the learner's
question from “Can the king reach the critical square?” to “Which structural
transformation changes the position?”

## Final units and boundaries

1. **Preserve a reserve tempo** teaches a stored harmless pawn move, move-order
   transfer, and its relationship to opposition and zugzwang. It is foundational
   because irreversible pawn moves occur in ordinary endings, not only advanced
   studies. It extends opposition by changing when the geometry occurs; it does
   not reteach opposition or catalogue every zugzwang.
2. **Use the protected passed pawn** teaches the passer, its supporting base,
   enemy-king restriction, and king improvement. Its value is support and
   restriction, not automatic promotion.
3. **Create an outside passed pawn** teaches distance, diversion, chase and
   return routes, and opposite-wing penetration. Its value is spatial
   separation, not mutual support.
4. **Break through the pawn chain** teaches forcing contact moves, sacrificial
   deflection, candidate comparison, and the surviving passer. A breakthrough
   differs from an ordinary sacrifice because the calculated transformation
   forces a pawn to inherit a clear route. It is the culmination because it
   combines structural recognition with exact move order and pawn-race checks.

Protected and outside passers are siblings and explicit contrasts. Neither is
an automatic win: support bases can fall, kings can return, and other-wing
targets may be inaccessible.

## Graph and learner paths

Genuine prerequisites are deliberately narrow:

- Direct opposition → Preserve a reserve tempo.
- Activate the king → Use the protected passed pawn.
- The pawn’s square → Create an outside passed pawn.
- Protected passed pawn + Outside passed pawn → Break through the pawn chain.

The passer units contrast support/restriction with distance/diversion. Both
recommend breakthrough. Earlier opposition and pawn-square units recommend
reserve-tempo and outside-passer study respectively. Remediation returns early
tempo errors to opposition, race errors to the pawn’s square, unsupported
advances to king activation or supported conversion, and false sacrifices to
the two passer units. Breakthrough does not depend on every earlier unit.

The progression is structural recognition, candidate identification, concrete
calculation, and finally deliberate transformation.

## Exact truths and heuristics

Legal moves, side to move, pawn contacts, support geometry, and authored
principal sequences are exact within their positions. The clean breakthrough
line is structurally verified through the surviving passer. No tablebase or
engine result is claimed.

Practical rules are qualified. Reserve flexibility is *usually* useful; a
protected passer *often* restricts; an outside passer distracts *when* chase and
return calculations work; and forcing breaks deserve early examination
*provided* replies and the final race verify the idea. Each unit includes a
contrast or near-miss position that exposes an important exception.

## Instructional and assessment design

Each unit contains exactly two materially different positions: one clean
demonstration and one contrast. Each also contains a demonstration, guided
practice, independent exercise, check, and assessment; breakthrough adds a
review item. Mastery criteria use observable actions and three-of-four or
four-of-five thresholds.

Six deterministic hint stages progress through observation, structural
recognition, candidate identification, calculation direction, decision-process
recall, and reflection. Early prompts direct attention without naming the final
move. Existing Coaching, Training Memory, Mastery, Recommendation, and future
Academy compatibility are metadata-only; no engine behavior changed.

## Taxonomy and verification responsibility

Taxonomy `1.2.0` adds five reusable themes: `pawn-structure`, `passed-pawns`,
`zugzwang`, `diversion`, and `pawn-breakthrough`. Existing tempo, opposition,
pawn-race, pawn-support, king-activity, and skill values are reused.

Automated validation checks structure, taxonomy, graph integrity, FEN legality,
side to move, and legal principal lines. Human editorial review remains
responsible for instructional clarity, meaningful position selection, the
truth of explanations beyond the encoded line, originality, and copyright.
English is ready; no other translation is claimed.

## Release and limitations

The release snapshot contains nine published units and preserves the immutable
one-unit and five-unit releases. Its exact release ID and repository fingerprint
are recorded by the generated release metadata.

The cluster is not yet exposed in a visible consumer. Engine/tablebase outcome
verification is not represented, so verified claims intentionally stop at
legality, structure, and the stated principal sequences.

The recommended next bounded cluster is **multi-pawn weakness and majority
planning**: create and attack a pawn majority, identify backward or isolated
pawn targets, and choose between fixing and transforming weaknesses.
