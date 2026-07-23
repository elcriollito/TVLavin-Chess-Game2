# Season 9.0.6 — Pawn Majorities and Structural Weaknesses

## Regression baseline

The preflight reproduced one failure in
`tests/endgame-trainer/endgame-trainer-page.test.js`: the standalone-link
coverage still expected “Help Videos.” Commit `c646b57` intentionally replaced
the old playlist link with the official channel label “CAISSA Chess YouTube”
and refined the feedback label. Production destinations and navigation
behavior were correct. Updating the two obsolete expected labels was therefore
test maintenance, not a feature or runtime change. The complete suite then
passed 677 of 677 tests.

## Model and boundaries

Model A was selected:

1. **Mobilize a pawn majority** — count a local majority, test mobility, choose
   the candidate pawn, calculate exchanges, and verify the resulting race.
2. **Fix the target before attacking** — identify escape mechanisms, restrain
   advance or exchange, and approach without releasing counterplay.
3. **Exploit an isolated pawn** — classify absent neighboring pawn support,
   restrain activity, and test whether king access makes it attackable.
4. **Exploit a backward pawn** — classify unsafe advance within a neighboring
   pawn structure, use the weak front square, and calculate liberating breaks.

Isolated and backward pawns remain separate because their exact definitions,
defensive resources, and attack plans differ. An isolated pawn lacks friendly
pawns on adjacent files; a backward pawn may have adjacent pawns but cannot
advance safely. Combining them would blur classification and overload one unit.

Fix-versus-transform is the culminating cross-cluster decision process,
represented throughout the instruction and in the backward-pawn review object.
This avoids a general pawn-weakness encyclopedia while requiring learners to
compare restraint with a concrete structural break.

## Progression and overlap control

The learner moves from count, to classify, to fix, to attack or transform.
Majority play is a sibling structural plan rather than a prerequisite for
weakness exploitation. It does not duplicate outside passers: the majority unit
teaches creating a passer through local exchanges, while the outside-passer
unit teaches distance and diversion. Fixing does not duplicate protected
passers: it stabilizes an enemy target rather than preserving a friendly
restriction anchor. Liberating breaks relate to breakthrough calculation but
do not treat every freeing move as a sacrificial breakthrough.

Minimal prerequisites are:

- The pawn’s square → Mobilize a pawn majority.
- Activate the king → Fix the target before attacking.
- Fix the target before attacking → each isolated- and backward-pawn unit.

The pawn’s-square and king-activation units recommend the new cluster.
Remediation returns race errors to the pawn’s square, premature attacks to king
activation or fixing, and unsound transformation claims to breakthrough.
Isolated and backward units carry reciprocal contrast edges.

## Exact facts and practical heuristics

Pawn counts, neighboring-file support, legal moves, side to move, advance
availability, and principal sequences are exact in the authored positions.
Whether a target is exploitable and whether transformation is preferable are
position-dependent evaluations. Heuristics are qualified: mobile majorities are
often useful; fixed weaknesses are usually easier to attack; isolated pawns can
be compensated by activity; backward pawns can be liberated; and king activity
or pawn races can override static labels.

Each unit has one clean demonstration and one materially different contrast.
Automated verification covers FEN, side to move, structure, graph integrity,
and principal-line legality. No engine or tablebase result is claimed. Human
review remains responsible for explanatory truth beyond the encoded sequence,
instructional clarity, originality, and copyright.

## Mastery, coaching, and taxonomy

Each unit provides two observable thresholds, testing classification plus plan
selection in four-of-five or three-of-four tasks. Six deterministic coaching
stages cover observation, classification, candidate identification,
calculation direction, process recall, and reflection without revealing the
first move early.

Taxonomy `1.3.0` adds `pawn-majority`, `fixed-weakness`, `restraint`,
`isolated-pawn`, and `backward-pawn`. Existing pawn-structure, passed-pawn,
pawn-race, king-activity, planning, calculation, and breakthrough values are
reused.

## Testing, release, and limitations

Serial knowledge testing is authoritative and deterministic. Parallel execution
on Windows can intermittently fail an atomic temporary-directory rename when
snapshot tests overlap; serial runs pass and immutable releases verify and
reproduce without corruption. No production source is changed by the race.

The new immutable release contains thirteen units and preserves the one-, five-,
and nine-unit releases byte-for-byte. Exact release identity is recorded in its
generated `release.json`.

The library remains deliberately disconnected from visible trainer UI. The next
bounded cluster should cover **pawn exchanges and favorable simplification**:
when to exchange pawns, preserve tension, create a distant target, or enter a
favorable king ending—without entering rook-endgame technique prematurely.
