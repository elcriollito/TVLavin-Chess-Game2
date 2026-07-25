# Season 9.3.4 — Authored Independent Practice and Assessment

## Release activity audit

The pinned release contains 17 units and 86 learning objects: 17 demonstrations, 17 checks for understanding, 16 guided-practice prompts, 16 exercises, 16 assessment descriptors, and 4 review items. Its 33 positions all contain valid FEN, side to move, expected concepts, and authored principal ideas. Roles are 16 clean demonstrations, 14 contrasts, two transfers, and one recognition example.

Only three exercises are objectively runtime-evaluable without changing Knowledge: Convert with King Support, Key Squares, and Fix Pawn Weakness. Each asks the learner to choose a move, references a verified position, and has exactly one legal authored principal move. The remaining 83 objects stay read-only. In particular, assessment descriptors have only IDs and aggregate criterion IDs; they have no prompt, position, response contract, or answer key.

Released data contains no stable choice answers, accepted alternatives, or explicit misconception mappings. Transfer roles are explicit on two positions, but neither is linked to an eligible independent exercise. Season 9.3.4 does not infer any of these missing contracts.

## Runtime contracts and eligibility

Runtime activity, attempt, and evaluation contracts are version `1.0.0`. Activities retain stable release, unit, source-object and position references; concise authored prompts; a move response type; retry and hint policies; exact SAN evaluator identity; evidence mappings; and approved feedback template IDs. They do not copy full unit prose or accept executable values or HTML.

Eligibility is pure and deterministic. A published schema-v1 unit is eligible only when an exercise:

1. explicitly asks the learner to choose;
2. references a structurally and educationally verified position;
3. has exactly one authored principal move;
4. uses the supported move evaluator.

Unsupported objects remain readable, and the UI explains why no activity action is available.

## Evaluation and feedback

The evaluator loads the released FEN through the existing chess rules facade, checks side to move and legality, and compares from/to/promotion identity with the authored SAN move. Illegal input is invalid rather than a misconception. A different legal move is unsuccessful. No engine, equivalence inference, transitive graph lookup, free-text grading, or AI is used.

Feedback comes from a closed deterministic template set. It is learner-safe, explains whether the move was invalid, unsuccessful, independently successful, or successful after answer reveal, and never claims completion or Mastery.

## Practice modes and evidence

An eligible activity starts in independent mode. The first qualifying correct submission without answer-revealing help yields `independent-success`. The learner may reveal the authored answer without penalty; a subsequent correct response yields `guided-success`, never independent success. Two unsuccessful evaluations of the same activity yield one `remediation-needed` record under the existing evidence pipeline. One wrong or illegal move never creates misconception evidence.

The released guided prompts remain Guided Study support, but are not mislabeled as objectively evaluated guided activities. Assessments and transfer evaluation remain unavailable because the pinned release lacks sufficient contracts. No activity emits evidence when opened, selected, or launched from Review now.

## Attempts, review, consent, and persistence

The domain evaluator returns a minimized attempt record containing stable identities, attempt number, timestamps, bounded SAN response, hint dependence, and optional review source. Persistence continues to use retained evaluative interaction events rather than duplicating attempts in another collection.

Qualifying `independent-success` participates in the existing evidence-based review resolution rules. Review launch alone does nothing. Unrelated evidence and review reasons remain intact.

Unknown or declined consent keeps events and evidence in the current session. Enabled consent persists approved evaluative events through `caissa:learning-progress:v1`. Revocation blocks subsequent writes. Existing storage-event synchronization propagates saved evidence and review changes. Envelope schema v2 and export format v2 remain sufficient, so no migration or import format change is made.

## Security and data minimization

The trusted domain layer validates activity IDs, release references, position state, SAN length, attempt identity, timestamps, hint levels, evaluator type, and authored answer legality. UI-submitted success is never trusted. Imported evidence remains subject to the existing event/evidence traceability validators.

Only stable references, result, hint dependence, attempt number, response type, and ordering timestamps are persisted. Full lessons, mouse behavior, timing detail, engine analysis, diagnoses, rankings, and account identity are excluded.

## Product boundaries

This work does not modify immutable Knowledge, the repository fingerprint, taxonomy, Mastery, Recommendation Engine, Training Memory, cloud storage, or Endgame Trainer V2. Architecture documentation, tests, and audit details are excluded from the public artifact. Only the runtime adapter and its browser consumers are shipped.

## Season 10 readiness and authoring gap

The runtime proves the move-evaluation path, consent boundary, guided-versus-independent distinction, retry behavior, and review-resolution integration. A future authored release must add item-level assessment prompts, position references, stable answers, accepted alternatives, explicit misconception mappings, and independently evaluable transfer activities before CAISSA can truthfully enable assessment-success, transfer-success, or misconception evidence from the UI.
