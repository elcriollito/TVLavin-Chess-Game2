# Season 9.3.2 — Consent-Based Local Learning Store

## Decision

Guided Study uses one dedicated `localStorage` envelope at
`caissa:learning-progress:v1`. The expected dataset is small (17 Knowledge
Units) and bounded. A synchronous whole-envelope replacement gives this
release a simple atomic commit boundary without the lifecycle and migration
complexity of IndexedDB.

This store is not Endgame Trainer Training Memory. It never reads, writes,
imports, exports, clears, or migrates `caissa:endgame-trainer:progress:v1`.
It has no account, Clerk, cloud-sync, Mastery, recommendation-ranking, or
Knowledge-content dependency.

## Contracts and envelope

The storage schema is v1. Consent, event, evidence, and learner-progress
contracts remain independently versioned at `1.0.0`. The envelope contains:

- creation and update times as canonical UTC ISO strings;
- the current local-device consent contract;
- immutable release references;
- progress keyed by immutable release and Knowledge Unit ID;
- bounded evidence, retained source events, and deduplication fingerprints;
- migration, retention, import-provenance, and integrity metadata.

It does not contain Knowledge prose, release payloads, UI state, HTML,
keystrokes, authentication data, account IDs, tokens, or executable values.
Historical release IDs are retained unchanged. The current runtime validates
new events only against its pinned release and released unit model.

## Consent and transaction boundary

Unknown and declined consent block every learning-record write. Explicit
`local-progress-enabled` consent permits only validated local categories.
Every append rereads the authoritative envelope immediately before commit, so
revocation in another tab stops the next write. The transaction then validates
the event and released references, derives evidence and progress with pure
contract functions, applies retention, validates the full envelope, and uses
one `setItem`. Failure preserves the previous raw value.

Disabling saving keeps existing records. “Disable and clear all” is a separate,
confirmed operation. Clear-unit and clear-all are permitted without enabling
consent; ordinary clear-all preserves the current consent state.

## Retention and deduplication

Limits are 17 progress summaries, 160 retained events, 240 evidence records,
500 event fingerprints, 20 import provenance entries, and 256 KiB per import.
When the event cap is reached, evaluative records are retained before practice
and observational records. Oldest lower-value records leave first. Evidence is
retained only while all source events remain, preserving traceability. Progress
summaries and consent are not removed by routine retention; summary counters
remain monotonic. Retention is storage management, not educational forgetting.

Stable event ID plus a canonical payload fingerprint provides durable
deduplication. An identical retry is a no-op. Reusing an ID with a different
payload is a deterministic conflict and does not write.

## Corruption, migration, and multi-tab behavior

Malformed JSON, future versions, invalid fields, broken integrity, invalid
consent, invalid references, duplicate IDs, orphan evidence, and impossible
timestamps are rejected without silently resetting the key. Guided Study
continues in memory and offers an explicit confirmed recovery clear. Quota and
storage failures preserve the last valid value.

Migrations are ordered pure transforms validated before commit. V1 is current.
The sole older fixture is an explicitly documented development-preview v0
shape (`previewDraft: true`) migrated to v1; it is not claimed as production
history. Unknown older and future schemas are refused.

Each write rereads storage. Browser `storage` events refresh summary and
consent, including immediate external revocation. Concurrent delivery of the
same event is deduplicated; conflicting IDs are rejected.

## Import and export

The JSON format is `caissa-learning-progress-export`, version 1. Consent is
excluded. Export includes only local learning progress, evidence, traceability
events, release references, deduplication records, and format integrity.
Preview performs no write. Merge requires currently enabled consent and an
explicit learner confirmation. Records merge deterministically by stable IDs;
conflicting event fingerprints abort the whole merge. Trainer Memory and
arbitrary JSON formats are rejected.

## Learner semantics

The UI distinguishes “Saved locally” from “Current session only” and shows only
positions explored, practice objects, assessment evidence, and last activity.
Allowed states remain Not started, Explored, Practicing, Assessed, and Review
suggested. No stored or displayed field claims Mastered, Completed, a mastery
percentage, rank, or recommendation mutation.
