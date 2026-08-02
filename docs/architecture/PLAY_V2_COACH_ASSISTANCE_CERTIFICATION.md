# Play v2 Coach Assistance Certification

Status: `locally-assistance-certified` (automated, internal only). Contract: `PlayV2CoachAssistancePolicy@1.0.0`. Season 11.5.2 automated acceptance passes; human/device gates remain pending.

## Supported behavior

Coach is chess with bounded assistance, not Academy, lessons, curriculum, Mentor, Guided Replay, Endgame Training, autoplay, or an answer oracle. It owns no board, move, clock, lifecycle, record, Worker, engine, persistence, transport, or analytics; certified Games remains sole owner.

Levels are Light (high confidence, 30-second cooldown, 8/game), Standard (medium, 20 seconds, 12/game), and More Help (medium, 12 seconds, 16/game). Each allows one presentation per turn and on-request help. Focuses are Balanced, Tactics, Safety, and Time Awareness, prioritizing only opponent-threat, forcing-moves, king-safety, or low-time. They never alter opponent strength or moves. The only timing is On request. Unsupported After move was removed; Critical moments is not offered.

Permitted categories are king safety, forcing moves, vulnerable piece, opponent threat, low time, and material change. Exact moves/squares, candidates, PV, mate sequences, commands, future positions, and evaluations are prohibited. The complete six-key copy set is in the [pending human review packet](evidence/PLAY_V2_COACH_ASSISTANCE_REVIEW_PACKET.json).

## Sanitizer, frequency, and suppression

The sanitizer rejects unknown or answer-shaped properties and emits only event/generation/turn identity, allowlisted category, bounded severity/confidence, timing, message key, and suppression booleans. Presentation receives fixed copy by key; raw engine objects never enter UI. Help performs no engine request and commits no move.

Suppression is fail-closed for malformed/raw data, stale generation, terminal/PostGame, route/mode teardown, non-request timing, promotion, opponent work, low confidence, low-confidence opening prompts, repeated category, repeated turn, cooldown, and game cap. Dismissal is keyboard-operable; teardown invalidates generations; no silent retries exist.

## Quality evidence

`PlayV2CoachAssistanceCorpus@1.0.0` contains 12 repository-authored synthetic fixtures covering hanging piece, king exposure, tactical opportunity, unsafe forcing move, quiet position, forced move, promotion, check, low time, terminal, ambiguous, and no action. Every fixture records FEN, side, event, configuration, allowed category, prohibited disclosures, suppression expectation, and provenance. No proprietary lesson corpus was used.

Results: allowed-category accuracy 100%; prohibited-answer leakage 0; stale, duplicate, and terminal presentation rates 0; suppression correctness 100%; reproducibility 100%; quiet/no-action false positives 0. Move commits, best-move/PV disclosures, Training Memory writes, and Mastery writes are 0.

Limitations: synthetic categories prove policy behavior, not engine classification accuracy; low-time UI integration is not clock-derived; automation cannot establish human copy judgment. Human review remains pending without an invented reviewer.

## Accessibility, privacy, and readiness

One polite atomic live region owns announcements. Help is named; cooldown/unavailable states are announced per activation; dismissal is a native button; focus is not moved; fields are labelled. Chromium/WebKit accessibility, forced-colors, reduced-motion, contrast, reflow, and responsive automation are required. Physical devices and named screen readers remain pending.

No service, prompt transport, identity bridge, profiling, cookie, storage, persistent history, PGN/FEN upload, logging, FICS, educational dependency, Training Memory/Mastery write, or analytics transport was added. `publicReady = false`; Games and Bots readiness remain independent.
