# Play v2 Games Quick Play Certification

> Season 11.6.1: Games uses the shared `PlayV2PostGamePolicy@1.0.0` result-first surface. Certified lifecycle, clock, record, Rematch, New Game, PGN, and Analyze ownership remains unchanged; see `PLAY_V2_RESULT_FIRST_POSTGAME_CERTIFICATION.md`.

Status: **locally certified under the internal beta gate**  
Season: **11.3.1**  
Date: **2026-08-01**  
Public exposure: **none**

## Verdict

Games satisfies the local Quick Play lifecycle represented by the seven certified presets and the existing local-engine runtime. This certification does not make Play v2 public, does not certify Bots or Worker, and does not claim physical-device validation.

The certified setup is deliberately small: choose one of `1+0`, `2+1`, `3+0`, `3+2`, `5+0`, `10+0`, or `15+10`; choose White, Random, or Black; activate one Play action. `No limit` is not a Quick Play preset. Random is resolved once with `crypto.getRandomValues` before the existing compatibility command.

## Authoritative ownership

| Concern | Owner | Certification observation |
| --- | --- | --- |
| rules, position, SAN, legal move, terminal rules | `App.game` backed by chess.js | accepted moves alone mutate the position; checkmate, stalemate, repetition, insufficient material, and the fifty-move counter are read from this authority |
| board input and orientation | existing chessboard callbacks and board adapter | drag and tap converge on the same move path; Black flips once; promotion is finalized before the move is committed |
| opponent response | existing engine request plus `CaissaEngineRequestIsolation` | one attributed response is accepted only for the current session and FEN; session rotation rejects stale work |
| clock | `CaissaClockService` | one monotonic RAF owner; charges the active side, adds increment once after a completed legal move, clamps at zero, and cancels on stop/reset/dispose |
| lifecycle observation | `CaissaGameLifecycle` | passive snapshots only; `idle -> completed` admits a completed-on-load or the bounded clock-stop/terminal-status transition without becoming a state writer |
| record | `CaissaGameRecord` | immutable completed record; completed Quick Play PGN gains names, date, result, termination, and exact base-plus-increment metadata |
| persistence | `CaissaGameRecordPersistence` | local completed history only after explicit consent; malformed data is isolated |
| PostGame | beta-only `post-game-core.js` | result, reason, opponent, Rematch, New Game, PGN actions, consent-save, and Analyze only |
| Analyze | `CaissaAnalyzeHandoff` and separate Analyze section | completed record crosses via an opaque session-storage token; PGN and FEN never enter the URL |

No competing chess, clock, opponent, record, persistence, PostGame, or Analyze owner was introduced.

## Lifecycle audit trace

1. **Setup:** Games exposes seven clocked presets and three colors. Draft changes do not start a game.
2. **Start:** the busy guard and compatibility validator admit one `startNewGame` command. Board, engine-isolation session, lifecycle session, record inputs, and clock configuration are reset once.
3. **First move:** chess.js accepts or rejects the attempted move. Rejection changes neither history nor clock. Tap and drag use the same commit path.
4. **Opponent response:** input is bounded by turn and active state. One isolated engine request is tied to its session and FEN; stale responses fail closed.
5. **Clock switch:** the service charges elapsed monotonic time, adds the configured Fischer increment once to the mover, switches active color, and rejects a duplicate move token.
6. **Promotion:** a legal promotion target opens the existing chooser. `q`, `r`, `b`, and `n` are the only accepted pieces. No move, opponent response, or increment occurs until choice finalization. The clock continues during selection. The modal is choice-required for Play; no fabricated default is applied.
7. **Terminal:** checkmate, stalemate, threefold repetition, insufficient material, fifty-move rule, resignation, and timeout map to explicit results/reasons. Generic draw offers and draw-agreement UI are absent. Finalization stops clock/opponent work before PostGame becomes actionable.
8. **PostGame:** one clean beta card shows the outcome and playing continuations only.
9. **Rematch/New Game:** Rematch starts one fresh game with the same resolved color and exact time control. New Game stops pending work and returns to setup without starting; selections reset to `1+0` and White.
10. **PGN:** the immutable completed record contains SAN, names, date, result, termination, promotion SAN where applicable, final position, and `TimeControl` as `base+increment`. Copy and download use that finalized record; save is local and consent-gated.
11. **Analyze:** a valid completed game creates an opaque bounded handoff. Repeated entry is safe; Back restores PostGame while clocks and opponent work remain stopped.

## Error and teardown matrix

| Condition | Behavior |
| --- | --- |
| board unavailable at start | reports that the board is loading and does not invent an alternate board/provider |
| engine unavailable or request rejected | no opponent move is fabricated; the current game remains the only position owner |
| illegal/rejected move | no position, history, clock switch, increment, record, or opponent request |
| stale async response | rejected by session/FEN attribution after new game, rematch, navigation, or position change |
| clock configuration/tick failure | structured rejection; no second timer or interval fallback |
| exit during opponent work | session rotation prevents stale acceptance; no FICS or network opponent fallback |
| retry start | panel busy guard blocks immediate duplicate activation; a later explicit Play starts one fresh session |
| New Game while work is pending | clock stops and engine isolation rotates before setup is restored |
| Rematch | one fresh session, same resolved color and exact base/increment, new record identity |
| Analyze | only completed record; opaque token; no active clock/opponent |
| malformed saved record | persistence rejects or isolates it and does not hydrate PostGame from it |

## Accessibility and responsive evidence

Native radio inputs and buttons provide keyboard operation, checked/disabled semantics, visible focus, and a single primary action. Start moves focus to the board. PostGame is programmatically focused on display. Promotion uses the existing modal focus management and labeled piece controls. Automated Chromium coverage exercises keyboard-accessible controls, announcements, promotion, PostGame, and action reachability across `320x568`, `375x667`, `390x844`, `412x915`, `768x1024`, `1024x768`, `1366x768`, and `1440x900`.

No named phone, tablet, browser/assistive-technology pairing, touch hardware, throttled physical device, or background/foreground OS clock behavior was physically tested. Those remain public-beta readiness gaps and are not implied by responsive emulation.

## Boundary and rollout state

- The exact internal gate remains `CAISSA_PLAY_V2_BETA_STAGE=internal` for `/play/beta`, `/play/beta/games`, and `/play/beta/bots`.
- `/play` remains Legacy Play, the homepage remains CAISSA Classic, default hosting remains fail-closed, and no navigation/SEO promotion was added.
- Games adds no FICS import, reference, provider, identity, rating, presence, matchmaking, challenge, or fallback. Legacy FICS and Classic owners are unchanged.
- Games and beta PostGame add no class, lesson, Academy, Endgame Trainer/Library, curriculum, Knowledge Unit, recommendation, or educational promotion surface.
- Analyze remains an external completed-game continuation. Mentor, Coach, and Players remain absent. Players remains blocked.
- Analytics transport remains disabled. Worker/Bots certification is unchanged and explicitly outside this certification.

## Remaining gaps before public beta

Physical-device and assistive-technology testing remains required. Extended background-tab clock behavior and low-resource engine-failure observation require device evidence. Bots and Worker require their own certification. Public feedback transport, staged public authorization, monitoring, and rollback drills remain future rollout tasks. None requires weakening the Games ownership or product boundaries certified here.
