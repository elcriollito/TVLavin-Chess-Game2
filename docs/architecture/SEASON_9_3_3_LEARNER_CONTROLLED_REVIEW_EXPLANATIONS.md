# Season 9.3.3 — Learner-Controlled Review Explanations

## System audit

Season 9.3.2 stores bounded local events, evidence, progress summaries, consent,
deduplication and import provenance in `caissa:learning-progress:v1`.
`review-suggested` previously followed any `remediation-needed` evidence and
had only a generic progress message. Review reasons and dismissals did not
exist. The immutable release contains direct prerequisite, remediation,
contrast, recommendation, progression and related relationships. Unit shards
retain authored relationship reasons; graph indexes expose only type and ID.

The Endgame Curriculum recommendation and Training Memory systems remain
separate and unchanged.

## Terminology and contract

A review trigger is an objective evidence pattern. A review explanation is the
deterministic local template describing it. A review target is either the same
unit or one direct authored relationship. A review action is learner-controlled.
Dismissal hides without deleting or resolving. Evidence clearing deletes only
the supporting evidence. Resolution requires later qualifying evidence.

`review-explanation` v1 contains a deterministic ID, release and unit IDs,
trigger, evidence and source-event IDs, hint and attempt summaries, recency,
closed learner-safe template fields, one target, dismissal/resolution state,
derivation v1 and a local-only notice. It contains no HTML, copied Knowledge
prose, score, rank, diagnosis or executable content.

## Triggers, thresholds and priority

Priority is categorical presentation order, not a numeric learner score:

1. `misconception-evidence-present`: one explicit unresolved misconception.
2. `assessment-unsuccessful`: two unresolved unsuccessful assessments.
3. `repeated-final-hint-dependence`: two final-answer guided successes.
4. `repeated-decision-process-hint-dependence`: two decision-process guided
   successes.
5. `guided-success-without-independent-success`: one guided success with no
   later independent or unhinted assessment success.
6. `assessment-not-yet-attempted`: authored assessment exists and there is
   actual practice or two explored positions, but no assessment event.

A unit opening, one hint, one unsuccessful attempt, navigation, elapsed time or
inactivity cannot trigger review. Stale-practice, transfer and prerequisite
triggers are deferred until the product records objective evidence for them.

Later independent, assessment or transfer success resolves older hint and
unsuccessful patterns. An assessment event resolves assessment-not-attempted.
Opening, viewing, dismissing or waiting does not resolve anything.

## Language and graph policy

Templates are factual, respectful, concise and actionable. They describe saved
attempts, never learner identity or general ability. “Weak”, scores,
probabilities, comparison, completion and Mastery claims are prohibited.

Misconception and unsuccessful-assessment triggers may use the first direct
authored remediation edge with a valid target and reason. Other triggers review
the same unit. Prerequisite and contrast targeting remain reserved for explicit
future evidence. There is no prose parsing, inferred edge, transitive traversal,
embedding, ranking or Recommendation Engine call. At most one primary target is
shown.

## Dismissal, clearing and progress

Dismissal is unit-scoped and persists only while local consent is enabled. It
keeps evidence and progress. It reappears only when qualifying evidence newer
than the dismissal produces a current explanation. Restore removes dismissal.

Clearing supporting evidence requires confirmation. The store rereads live
consent, verifies every evidence ID and unit/release scope, removes only those
records, removes source events only when no remaining evidence references them,
recalculates progress and commits one validated envelope. Consent, other units,
Knowledge, accounts and Trainer Memory are untouched.

Progress now requires either an unresolved explicit misconception or two
unresolved remediation records for `review-suggested`. Later qualifying success
resolves the display precedence. `assessed`, `practicing` and `explored` remain
facts; none implies Mastery.

## Store, import/export and multi-tab

Explanations are derived on read; no cache or explanation prose is stored.
Storage schema v2 adds only `reviewDismissals`. A pure v1-to-v2 migration
preserves all Season 9.3.2 records. The export format advances to v2 for
dismissals, while the importer continues to accept v1. Consent remains excluded.
Unknown triggers, malformed times, invalid IDs and orphan unit dismissals are
rejected. Merge chooses the later valid dismissal deterministically.

Existing reread-before-write and browser `storage` events handle dismissal,
restore, clearing, new evidence and revocation across tabs. No second
synchronization system exists.

## UI, privacy and security

Guided Study owns a restrained Review panel with the trigger explanation,
authored/fallback target reason, bounded evidence summary, Review now, Dismiss,
Restore, Clear evidence and “Why am I seeing this?”. Review now uses a pinned
release and stable unit ID; clicking it creates no learning evidence.

Review processing is local and has no backend, account, analytics, cloud or AI
call. It stores no personal diagnosis, Knowledge prose, browser history,
duration, clicks, rating or global profile. Template and import validation
reject HTML, unknown vocabularies, unsupported targets, prototype-shaped input,
orphan references and consent bypass.

## Architectural boundaries and public artifact

There are no Mastery writes, Recommendation ranking/mutation, Training Memory
writes, Knowledge Unit changes, taxonomy changes or immutable release changes.
Only the runtime derivation module, local-store integration and learner UI enter
the audited public artifact. This architecture document, tests, fixtures,
authoring sources and diagnostics remain excluded.

Season 9.3.4 should add authored assessment interaction to Guided Study so
learners can resolve review explanations directly, without ranking or Mastery
inference.
