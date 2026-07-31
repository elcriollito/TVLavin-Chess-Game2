# Play Completion and PostGame Analytics Audit

Versions: `PlayGameCompletionPayload@1.0.0`, `PlayPostGameActionPayload@1.0.0`, `PlayCompletionAnalytics@1.0.0`, `PlayPostGameAnalytics@1.0.0`, dispatcher `1.2.0`, privacy policy `1.2.0`.

## Terminal ownership audit

| Path | Owner | Authoritative evidence | Analytics category | Failure evidence | Privacy risk |
|---|---|---|---|---|---|
| Checkmate, resignation, timeout | GameLifecycle plus normalized GameRecord | completed lifecycle and validated completed record | completed plus fixed termination | missing/corrupt normalized result | score, clock, moves |
| Stalemate, repetition, fifty-move, insufficient material, agreement | rules/result normalization plus GameRecord | validated draw record | draw plus fixed termination | unknown normalization | score or PGN leakage |
| Abort/reset | lifecycle/result owner | validated `aborted` record only | aborted | no explicit abort evidence | inventing abort semantics |
| Disconnect/provider result | provider authority | provider-confirmed normalized record | provider-owned/aborted as owned | provider unavailable | identity/provider payload |
| Engine/terminal processing failure | lifecycle/record construction | explicit technical failure or failed normalization | technical-failure/failed | invalid record | exception/engine output |
| New Game, mode switch, disposal | existing lifecycle owner | explicit abort evidence only | none unless owner records abort | stale context | false abort |
| Duplicate/stale terminal | PostGame record correlation | current accepted record only | suppressed/ignored | old record/session | persistent game ID |

Current Simplified Play emits analytics from the accepted `GameRecord` consumed by `PostGameExperience`; it does not infer terminal truth from UI text. GameRecord remains the normalized result owner, GameLifecycle remains terminal owner, and PostGame remains presentation/action owner.

## Taxonomy and mappings

Completion events are `play_game_completed`, `play_game_aborted`, and `play_game_completion_failed`. PostGame events are `play_postgame_shown`, `play_postgame_action_selected`, `play_postgame_action_succeeded`, `play_postgame_action_failed`, and `play_postgame_action_blocked`.

Results map only to white-win, black-win, draw, no-result, or unknown. Terminations map only to checkmate, resignation, timeout, stalemate, repetition, fifty-move, insufficient-material, draw-agreement, disconnect, aborted, provider-owned, technical-failure, or unknown. Raw score/result/termination strings never enter an event.

Duration boundaries are: `[0, 60s)` under-1-minute; `[60s, 3m)` 1-to-3-minutes; `[3m, 10m)` 3-to-10-minutes; `[10m, 30m)` 10-to-30-minutes; `30m+` over-30-minutes. Untimed and provider-owned are explicit. Missing authoritative duration is unavailable; no timestamp or exact duration is retained.

Opponent and assistance reuse the approved game-start categories. PostGame actions are rematch, analyze, mentor-review, guided-replay, mentor-summary, pgn-copy, pgn-download, new-game, back, or unknown. States are selected, succeeded, failed, blocked, deduplicated, stale, unavailable, or unknown. Fixed failure reasons contain no exception, token, filename, browser, or content data.

## Evidence and action boundaries

One completion is observed after record validation and before the already-owned PostGame presentation. `play_postgame_shown` requires the existing `show()` operation to succeed. Action selection occurs after the existing availability check; success/failure/blocked is emitted only from the operation returned by the current Rematch, Analyze, Mentor, Guided Replay, Summary, clipboard, download, or New Game owner. Analytics exposes no action method and cannot invoke any action.

Rematch emits a PostGame choice/outcome independently from the separate game-start attempt. Analyze records no handoff token or game content. Mentor/Replay/Summary record only broad action outcomes. PGN actions record neither PGN, filename, headers, clipboard contents, nor object URL. New Game records its PostGame action without fabricating completion or a later game-start success.

## Correlation, deduplication, and retention

Completion and action sequences are positive monotonic page-memory integers. Missing start correlation is represented by zero. Completion records and pending action records are oldest-first bounded to eight. The existing PostGame duplicate-record guard prevents lifecycle/render duplication; shown sequences suppress rerender/restore duplication. Every action record accepts one terminal outcome; missing/replaced/disposed outcomes are stale and ignored. No correlation value persists or crosses sessions.

## Privacy, consent, transport, and resources

Prohibited data includes identity/names/ratings; raw score, result, or termination; exact duration/timestamps/clocks; moves, PGN, FEN, positions; evaluation/mate/PV; game/session/lifecycle/Worker IDs; Analyze handoff; filename/clipboard content; Mentor/Summary/Knowledge content; provider result/payload; URL/query; errors/stacks.

No authoritative Play analytics consent exists. Transport, persistence, cookies, external sinks, retries, and account integration remain disabled. The shared local QA buffer is validated, redacted, capped at 50, and visible only by explicit QA inspection. Observers add no listeners, timers, Workers, sockets, boards, lifecycle changes, FairPlay changes, or product actions. Future delivery requires Season 10.13.5 governance.

## Verification

Focused unit/static tests cover exact contracts, enums, hostile keys, mappings, boundaries, completion/abort/failure, shown deduplication, action outcomes, stale handling, privacy, transport absence, and resource neutrality. Browser tests cover authoritative checkmate/PostGame presentation and content-free action outcomes across Chromium, Firefox, and WebKit. Existing lifecycle, record, PostGame, Analyze, Mentor, clocks, responsive, accessibility, Play, and repository regression gates remain authoritative.
