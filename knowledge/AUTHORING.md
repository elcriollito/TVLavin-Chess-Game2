# CAISSA Knowledge Unit authoring standard

## Unit boundary and naming

A unit owns one reusable idea that can be stated in one sentence, recognized in
more than one position, practiced independently, and assessed observably. Split
units when the learner must answer a different decision question. Do not split
mere examples, exceptions, or hint stages into separate units.

Use a permanent `ku:<domain>:<family>:<concept>` ID and a concise domain-scoped
slug. Titles name the learner-facing idea. Summaries state its practical use.
Explanations establish meaning, scope, importance, and exceptions. Key ideas
are durable truths; practical rules are bounded shortcuts, never absolute
result claims.

## Instruction

- Learning objectives use observable verbs such as identify, compare, choose,
  distinguish, or explain.
- Misconceptions describe plausible wrong reasoning and its boundary.
- Decision processes contain a short reusable sequence, not a move list.
- Coaching prompts are ordered: observation, concept recall, direction,
  decision process, reflective explanation. Early prompts do not reveal moves.
- Reflection asks why the decision worked or which condition would change it.
- Mastery criteria state a task family, success threshold, variation, and hint
  allowance. Units never store learner performance.

## Positions and learning objects

Foundational units normally use two to four positions. Every position needs a
distinct job: clean demonstration, recognition, contrast/near-miss, transfer,
exception, or assessment. Prefer minimal legal geometry. Do not create cosmetic
file-shift duplicates or positions whose point depends on hidden engine truth.

FEN, side to move, expected concepts, position role, and verification boundary
are explicit. Principal sequences must be legal and state their instructional
purpose. Structural validation proves legality; human chess review owns
theoretical and educational claims.

- A demonstration explains before testing.
- Guided practice supplies a prompt or decision step.
- An exercise requires an independent action.
- A check asks for a concise concept distinction.
- An assessment supplies mastery evidence.
- A review item supports later recall.

Published foundational units contain at least a demonstration, guided practice,
exercise, check, and assessment or review.

## Graph and integrations

Prerequisites are only concepts genuinely required to understand the unit.
Progression indicates a sensible continuation. Recommendation declares an
authored next or reinforcing option. Remediation points to the missing concept
that explains a likely failure. Contrast is used only when comparing boundaries
clarifies both units. Every explicit edge has a specific reason.

Integration metadata is declarative. It may expose stable concept/theme IDs,
ordered prompt intent, mastery criterion IDs, next/remediation IDs, and Academy
compatibility. It never performs coaching, records memory, calculates mastery,
or ranks recommendations.

## Classification and localization

Choose the narrowest active taxonomy values. Difficulty describes concept and
calculation burden; learner level describes assumed prior capability. New
vocabulary requires taxonomy review rather than an invented production string.

English `en-US` is currently the complete default locale. Identity, taxonomy,
positions, and graph data remain locale-neutral. Never declare a translation
available or ready until its entire payload has been reviewed.

## Originality and provenance

Research may establish universal chess facts. Authors then reconstruct
positions, organization, explanations, prompts, and exercises independently.
Record what inspired the work when applicable. Do not copy prose, annotations,
diagram collections, commercial sequencing, or source-specific phrasing.
Copyright and originality review is required even when no source is cited.

## Editorial lifecycle

1. **Draft** — author owns scope, skeleton, original content, and candidate
   positions. Proposed taxonomy is permitted only under explicit draft checks.
2. **Editorial review** — curriculum reviewer checks boundaries, clarity,
   progression, difficulty, localization readiness, and overlap.
3. **Chess verification** — chess reviewer checks legality, side to move,
   sequences, bounded claims, exceptions, and position purpose.
4. **Educational verification** — reviewer checks explanation-before-
   assessment, misconceptions, coaching progression, and observable mastery.
5. **Approved** — owner resolves review findings; automated repository checks,
   provenance, originality, and graph targets are complete.
6. **Published** — release owner changes status only after all reviews are
   approved/verified and regenerates working and immutable release artifacts.
7. **Deprecated** — history remains; reason, effective date, and replacement
   guidance are recorded.

Automation checks structure and integrity. Humans remain responsible for chess
truth, educational usefulness, originality, appropriate difficulty, and prose.

## Review checklist

Educational:

- one primary concept and measurable outcome;
- non-overlapping scope and accurate prerequisites;
- explanation precedes application and assessment;
- misconceptions, decision process, coaching, reflection, and mastery present.

Chess:

- legal positions, matching side to move, legal sequences;
- each position demonstrates its declared concept and distinct role;
- no unsupported forced-result language; practical exceptions acknowledged.

Originality:

- original wording, sequence, positions, and exercise organization;
- inspiration references and consultation notes recorded;
- no copied annotations, collections, or suspicious source phrasing.

Technical/publication:

- active taxonomy, supported schema/version, unique IDs/slugs;
- valid published graph targets and reasons;
- locale metadata, reviewer, verification, provenance, copyright, originality;
- `npm run knowledge:validate`, tests, and release reproduction pass.

Use `createDraftKnowledgeUnitScaffold` only to expose the empty contract and
active vocabulary. It intentionally supplies no educational prose or chess
material. `npm run knowledge:editorial:report` gives objective repository
visibility without claiming subjective approval.

## Evaluable activity items

Published schema `1.1.0` units include `activityItems`. Every item needs an
explicit prompt, supported response type, source learning-object and position,
authored answer, deterministic feedback, evidence mapping, and review
resolution. Exact moves and alternatives must be legal from the referenced
FEN. Choice and plan-choice options use stable IDs; labels are not answer
identity.

Misconception mappings point to a specific response, an existing localized
misconception by index, and a valid resolution activity. An ordinary wrong
answer is not a misconception. Assessments prohibit final-answer reveal before
submission. Transfer is explicit and materially different, never inferred from
a cosmetic FEN change.

Do not author free-text grading, hidden engine answers, generated alternatives,
decorative trivia, or Mastery claims. Increment `contentVersion` and
`editorial.updatedAt` whenever evaluable content changes.
