# Season 9.3.1 Learning Evidence, Consent, and Progress Contracts

## Current-system audit

The existing Endgame Trainer progress store uses `caissa:endgame-trainer:progress:v1`. It records prepared and started sessions, terminal outcomes, recent session FENs, curriculum selections and completion counters, bounded pilot events, and Training Memory v1. Training Memory retains up to 1,000 sanitized training sessions and derives theme summaries from outcomes, hints, elapsed time, and move classifications. Its current “mastery” score and labels are trainer heuristics, not conclusions against released Knowledge Unit mastery criteria.

Training Memory also derives a weakest-theme recommendation. The curriculum independently recommends the first lesson not marked complete. These mechanisms consume existing trainer state and are not evidence-backed Knowledge recommendations. They remain unchanged.

The Endgame Trainer writes automatically during its existing free-practice, guided-training, and Essential Canon workflows. Guided Study from the Endgame Library is different: it loads the store because it shares the page shell, but its read-only initialization does not call progress, curriculum, Training Memory, mastery, or recommendation writes.

Other local persistence includes game and product preferences in `localStorage`, Game Library/opening assets in IndexedDB, and transient opening-database caches in `sessionStorage`. Authentication state, cookies, navigation preferences, and general product use are not learning-progress consent.

Training Memory export/import is explicitly version 1 and sanitizes session records. Knowledge learning events, evidence, and progress must not be merged into that format silently. A future format requires a separate version, validator, migration policy, and learner choice.

## Terminology and separation

- **Interaction event:** a factual, minimized record of an allowed learner action.
- **Educational evidence:** a deterministic interpretation of validated events.
- **Progress:** a learner-facing participation or assessment state.
- **Mastery:** a stronger future conclusion against authored criteria and sufficient varied evidence.
- **Recommendation signal:** an explainable future input backed by evidence and, where relevant, an authored graph relationship.
- **Consent state:** the learner's explicit choice about local learning-data storage.

These are separate versioned objects. Knowledge Units remain educational truth; interaction events never modify them.

## Consent model

Consent contract v1 supports `unknown`, `declined`, and `local-progress-enabled`. Its sole scope is `knowledge-learning-progress`, its only future storage mode is local device storage, and the allowed future categories are validated events, evidence, and progress summaries.

Unknown and declined states prohibit persistent learning writes. Enabled state makes only the documented categories eligible; it does not itself perform a write. Grant and revocation timestamps must be consistent with state. Revocation can request clear-data behavior. Sign-in, cookies, opening a unit, reading an explanation, and using Guided Study do not imply consent.

Season 9.3.1 provides a contained Guided Study progress preview. The choice is not preselected, does not block the lesson, and is not located in Play Game Options or a recreated global Settings modal. Enabling it affects only the current tab's in-memory interpretation. The UI explicitly says that this release persists nothing.

## Interaction-event contract

Event schema v1 includes stable event/session IDs, timestamp, explicit release and unit IDs, optional learning-object/position/prompt/assessment references, classification, minimal interaction detail, consent state at event time, persistence eligibility, local-only marker, and a stable-references-only minimization marker.

The initial vocabulary is:

- Administrative: study session started/ended and return to Library.
- Observational: unit opened, position selected, explanation viewed.
- Practice: coaching prompt advanced, hint requested, answer submitted.
- Evaluative: assessment evaluated.

Scroll, hover, focus, mouse movement, unrelated navigation, authentication activity, arbitrary keystrokes, full UI state, authored prose, and unnecessary FEN duplication are excluded.

Runtime validation rejects unknown fields, malformed or duplicate IDs, unsupported releases/units, unknown position/learning-object/assessment references, invalid hint levels, executable values, and persistence eligibility without enabled consent.

## Educational-evidence contract

Evidence schema v1 retains its own ID, released unit context, optional criterion, categorical type, source-event IDs, verification/evaluator category, observed behavior, hint dependence, attempt/variety context, timestamp, and learner-readable explanation.

Derivation is pure and deterministic:

- unit open, explanation view, and position selection produce exposure only;
- prompt advance, answer submission, and hint request produce participation;
- a correct authored assessment without a hint can produce assessment success;
- a correct response with guidance produces guided success;
- incorrect assessed work can produce remediation-needed evidence.

Strong evidence cannot be derived from observational events. UI code does not declare mastery evidence.

## Evidence strength and hint dependence

The categorical scale is exposure, participation, guided success, independent success, assessment success, transfer success, misconception, and remediation needed. Season 9.3.1 introduces no weighted score.

Hint dependence distinguishes none, observation, concept, directional, decision-process, and final-answer. Requesting a hint is not negative. A correct response after a final-answer hint cannot be independent success. Repeated advanced-hint dependence may support a future explainable remediation signal, never punishment.

## Progress contract

Progress schema v1 states are `not-started`, `explored`, `practicing`, `assessed`, and `review-suggested`. The record contains release/unit IDs, first and recent activity, session count, positions explored, learning objects attempted, assessment-evidence count, explanation, local-only marker, consent scope, and reset semantics.

Opening or reading moves progress at most to explored. Participation can produce practicing; valid assessment evidence can produce assessed; remediation evidence can suggest review. The object cannot contain mastered, mastery, completed, or Knowledge content fields.

## Mastery boundary

Season 9.3.1 does not write or display Knowledge mastery. A future mastery consumer must evaluate authored criteria, sufficient evidence quantity, varied positions, independent performance, transfer, recency, hint dependence, and unresolved misconceptions. Existing trainer theme labels are not migrated or interpreted as Knowledge mastery.

## Recommendation boundary

Season 9.3.1 defines diagnostic signal categories only: continue current unit, review prerequisite, revisit misconception, attempt assessment, practice transfer, and study related unit. A signal requires source evidence, target unit, explanation, and optionally an authored relationship. There is no ranking, personalization, persistence, or mutation of the existing Recommendation Engine. Raw clicks cannot create a recommendation.

## Training Memory boundary

Training Memory may eventually consume explicitly approved, compatible summaries through a separate adapter. It is not educational truth and must reject unconsented records, unsupported versions, copied lesson prose, and mutable/draft references. Guided Study does not write to it in this season. Training Memory v1 behavior and export/import remain unchanged.

## Storage decision, minimization, and retention

Real persistence is deferred. The existing store is unsuitable because it couples trainer completion, heuristic mastery, recommendations, and session history. Although a separate consent-gated store is feasible, its migration, revocation, retention, import/export, and cross-tab contracts require validation before value justifies risk.

The Guided Study proof keeps validated events only in memory for the current tab. It stores nothing across refresh, sends no cloud request, uses no account identity, and retains no raw event indefinitely. Revocation clears the in-memory preview and blocks future persistence eligibility. There is no persistent clear-unit or clear-all operation because there is no Season 9.3.1 learning store.

Future persistence should retain only evidence needed for explainability and a compact progress summary, with bounded recent validated events. It should prefer stable IDs over FEN, moves, durations, and authored text. Exact duration or move history needs an explicit assessment justification.

## Guided Study dry run and learner transparency

Guided Study creates validated in-memory events for session start, unit open, explanation view, position selection, coaching-prompt advance, return to Library, and session end. Events use the pinned release and stable released IDs. The normal read-only board, prompts, return behavior, error states, no-write guarantee, and no-AI guarantee remain intact.

The learner panel explains that the preview is optional, tab-local, clearable, not persisted, not synced, and not mastery. Declining leaves the lesson fully usable. Enabling shows a plain-language derived state without technical logs.

## Security and public boundary

The runtime contract and learner UI are public browser code. Internal architecture documentation, tests, fixtures, and diagnostics remain excluded by the audited release builder. Events reject executable values and arbitrary payload fields. There is no backend, database, account storage, AI provider, debug endpoint, or public inspector.

## Deferred Season 9.3.2 work

Season 9.3.2 should design a separate consent-gated local store with atomic consent checks before every write, bounded retention, clear-unit and clear-all operations, explicit migration/rejection, cross-tab behavior, and a separately versioned export/import format. It should then test whether evidence quantity and diversity are sufficient before considering a diagnostic mastery-readiness consumer. Persistent mastery and personalized recommendations remain later decisions.
