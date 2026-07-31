# Play Manual Chess QA

Version: `ManualPlayQA@1.0.0`

Execution time: `2026-07-31T14:42:42-04:00`

Repository baseline: `db85284096a6b4d585a50adb4084221e48c8499b` (`main`, 50 ahead/0 behind `origin/main`)

Scope: Season 10.12.5 local manual observation and deterministic browser-assisted chess QA. This is not release authorization.

## Result contract

The only valid scenario results are `pass`, `fail`, `blocked`, `not-run`, `external`, `physical-device`, and `manual-certification`. The test-only source of truth is `tests/play/manual-play-qa-manifest.js`. Every record carries prerequisites, steps, expected result, actual result, evidence, notes, severity, priority, defect ID, and retest result. A non-pass is never counted as a local pass.

## Environment record

| ID | OS | Browser | Viewport | Input | Theme | Cache | Type | Tester | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| ENV-DESKTOP | Windows 11 Pro 10.0.26200, 64-bit | Playwright Chromium 151.0.7922.34 | 1440x900 | Synthetic mouse plus keyboard, manually observed output | CAISSA Dark and Light | Fresh isolated browser context; onboarding flag only | Desktop emulation, headless | Codex local QA observer | Five raw local screenshots visually inspected; focused browser command output |
| ENV-COMPACT | Windows 11 Pro 10.0.26200, 64-bit | Playwright Chromium 151.0.7922.34 | 390x844 and 844x390 | Touch-capability emulation plus separate keyboard session | CAISSA Light | Fresh isolated browser context; onboarding flag only | Compact emulation, not a physical device | Codex local QA observer | Compact raw screenshot visually inspected; geometry and Axe output |
| ENV-MATRIX | Windows 11 Pro 10.0.26200, 64-bit | Playwright Chromium, Firefox, and WebKit | 320x568, 390x844, 768x1024, 1024x768, 1440x900, landscape, constrained height, 200% reflow | Browser automation with human-observable assertions | Dark, Light, System | Isolated contexts | Emulated profiles | Codex local QA observer | Season 10.12 responsive, accessibility, theme, and regression browser gates |

Serve method: repository `node server.js` through the Playwright-managed local static web server at `127.0.0.1:8000`. QA entry: `/play/games?simplified=1`. External network services were not substituted into this environment.

The raw screenshots were local transient evidence under `test-results/manual-play-qa/`. They were inspected without editing and then removed by the established generated-output cleanup gate. Written observations and command results are the retained evidence.

## Execution procedures

### Navigation and entry

1. Open `/`, confirm the Classic section is active, then open unflagged Legacy Play and confirm the Simplified shell is absent.
2. Open `/play/games?simplified=1`, move across Games, Bots, Coach, and Players with visible tabs and keyboard arrows.
3. Confirm non-QA Players does not become available, use direct Analyze/Help/Settings/About entry paths, then use Back, Forward, and refresh.
4. Observe the board count, selected tab, context panel, route, and sidebar after each transition.

### Board and chess rules

1. Start local Games, make `e2-e4`, attempt illegal `e2-e5`, and inspect history for exactly one accepted move.
2. Load the test-only castling and en-passant positions, perform the public move action, and compare SAN and resulting position.
3. Load the promotion position, inspect the visible modal, choose queen then independently exercise rook, bishop, and knight choices.
4. Load checkmate, stalemate, insufficient-material, and custom-FEN positions and compare runtime/visible terminal state.
5. Do not inject public history for repetition or the fifty-move rule; retain both as known blocked characterizations.

Subjective observation: at desktop size the board dominates the visual hierarchy and move interaction is direct. At compact size it remains the first major object, with the setup panel following in a predictable scroll. No board jump, duplicate move, or visually competing primary action was observed.

### Clocks and lifecycle

1. Select 1+0, 3+2, 5+0, and an available longer control; start each game and inspect initial values and active side.
2. Make a move and inspect side switch/increment. Enter promotion and inspect pause/resume.
3. Exercise deterministic timeout/terminal evidence, then confirm no negative or continuing clock.
4. Use Rematch and New Game and compare fresh clock, session, history, board, Worker, listener, and lifecycle state.

### Modes, terminal flow, and handoffs

1. In Games, inspect configuration language, one primary CTA, start, rail, New Game, terminal card, and Rematch.
2. In Bots, wait for the truthful lazy state, select/change a Bot, start, make a move, inspect one response and retained Rematch identity. Treat strength only as a calibration observation.
3. In Coach, inspect learner/focus/assistance controls, start, observe bounded intervention copy, and scan for move/PV leakage.
4. In Players, inspect production-blocked language, disabled Find Match, provider authority, frozen rail, and zero human-game starts while retaining an active machine game.
5. Produce a controlled checkmate, inspect result/winner/termination and one PostGame card, then exercise Copy PGN, Download PGN, Analyze, Mentor request, Rematch, and New Game.
6. Confirm Analyze uses an opaque token, restores the same source, survives Back/refresh, and does not expose PGN/FEN in the URL.
7. Confirm Mentor/Replay/Summary actions remain explicit, correlated, bounded, hidden-answer safe, and do not write Memory or Mastery. No unrestricted generated review quality is claimed.

### Themes, accessibility, and responsive behavior

1. Switch Dark, Light, and System during the same session; compare board, rail, primary CTA, focus ring, geometry, and retained game state.
2. Keyboard through mode tabs, setup controls, primary CTA, dialogs, PostGame, Mentor, and Replay actions; inspect visible/unclipped focus and restoration.
3. Inspect 320x568, 390x844, 768x1024, 1024x768, 1440x900, mobile landscape, constrained height, and 200% reflow for board visibility, reachable controls, clipping, overflow, dialogs, PostGame, and Mentor/Replay.
4. Record screen-reader certification and physical-device work separately because neither was available.

## Scenario records

| ID | Area | Result | Actual observation | Evidence | Defect | Retest |
|---|---|---|---|---|---|---|
| NAV-01 | Navigation | pass | Defaults, QA gating, modes, direct entry, history navigation, and refresh remained stable. | Written observation and focused browser suites | none | not-required |
| BOARD-01 | Board | pass | One responsive board remained visible through move, flip, resize, theme, and route transitions. | Desktop/compact captures and adapter evidence | none | not-required |
| RULE-01 | Rules | pass | Legal move accepted, illegal move rejected, exactly one move recorded. | Controlled browser observation | none | not-required |
| RULE-02 | Rules | pass | Castling/en-passant behavior and illegal king-transit protection matched chess rules. | Controlled FEN characterization | none | not-required |
| RULE-03 | Rules | pass | Queen and all three underpromotion choices remained reachable and correct. | Promotion modal capture and browser evidence | none | not-required |
| RULE-04 | Rules | pass | Checkmate, stalemate, insufficient material, custom FEN, and side-to-move were coherent. | Controlled terminal evidence | none | not-required |
| RULE-05 | Rules | blocked | Public UI has no deterministic repetition-history injection. | Existing characterization boundary | none | accepted-limitation |
| RULE-06 | Rules | blocked | Public UI has no deterministic fifty-move history injection. | Existing characterization boundary | none | accepted-limitation |
| CLOCK-01 | Clocks | pass | Required controls initialized, switched, incremented, stopped, and reset without negative/double decrement. | ClockService and browser evidence | none | not-required |
| GAMES-01 | Games | pass | Configuration was understandable, board-first, and offered one clear primary start action. | Desktop/compact captures | none | not-required |
| BOTS-01 | Bots | pass | Loading and identity were truthful; one response and retained Rematch configuration were observed. | Smoke and Bots browser suite | none | not-required |
| COACH-01 | Coach | pass | Controls/messages were readable and no move or PV leaked. | Smoke and Coach browser suite | none | not-required |
| PLAYERS-01 | Players | pass | Production blocker/provider authority were explicit; evaluation was frozen and human starts stayed zero. | Players capture and invariant gate | none | not-required |
| FAIR-01 | FairPlay | pass | Human readiness exposed no numeric/mate/stale evaluation. | Rail observation and invariant gate | none | not-required |
| POST-01 | PostGame | pass | Result, winner, termination, actions, and single-card ownership were correct. | Checkmate capture and PostGame suite | none | not-required |
| REMATCH-01 | Rematch | pass | Mode/configuration retained with fresh session and bounded resources. | Lifecycle/PostGame suites | none | not-required |
| NEW-01 | New Game | pass | Search/state/history/clock/PostGame reset without stale work. | Lifecycle browser evidence | none | not-required |
| PGN-01 | PGN | pass | Copy/download used correct bounded game data and one cleaned object URL. | PostGame side-effect evidence | none | not-required |
| ANALYZE-01 | Analyze | pass | Opaque same-game handoff, Back/refresh, and runtime isolation held. | Smoke and handoff suite | none | not-required |
| MENTOR-01 | Mentor | pass | Explicit request was correlated/deduplicated and failure-safe; foundation scope remained truthful. | Smoke and Mentor pipeline suites | none | not-required |
| REPLAY-01 | Guided Replay | pass | Attempts, reveal, navigation, focus, and hidden-answer boundaries held. | Guided Replay browser suite | none | not-required |
| SUMMARY-01 | Mentor Summary | pass | Same-game bounded concepts remained coherent and readable at desktop/compact sizes. | Summary fixtures/responsive evidence | none | not-required |
| THEME-01 | Themes | pass | Dark/Light/System preserved state and geometry; light primary control remained readable. | Captures, WCAG assertion, theme suite | none | not-required |
| A11Y-01 | Accessibility | pass | Keyboard routes/actions and visible focus remained usable; no serious Axe issue. | Keyboard observation and Axe | none | not-required |
| A11Y-02 | Accessibility | manual-certification | No named screen reader was available; certification was not claimed. | Environment record | none | pending |
| RESP-01 | Responsive | pass | All required emulated profiles remained board-first and reachable without horizontal overflow. | Responsive matrix and captures | none | not-required |
| DEVICE-01 | Physical device | physical-device | No real phone/tablet was available; emulation was not relabeled. | Environment record | none | pending |
| EXT-01 | External Worker | external | `WORKER_URL` unavailable; deterministic local Worker coverage passed. | Environment record | none | pending |
| EXT-02 | FICS | external | Gateway unavailable; no live opponent/presence/challenge was fabricated. | Environment record | none | pending |
| EXT-03 | Tablebase | external | Network opt-in unavailable; no live result was fabricated. | Environment record | none | pending |

Counts: 30 total; 23 pass; 0 fail; 2 blocked accepted limitations; 0 not-run; 3 external; 1 physical-device; 1 manual-certification.

## Defect log

| ID | Scenario | Severity | Summary | Reproducible | Owner | Status | Retest |
|---|---|---|---|---|---|---|---|
| none | all local scenarios | none | No local blocker, critical, major, minor, or cosmetic defect was opened. | not-applicable | Play QA | closed-no-defect | not-required |

No production fix was made in Season 10.12.5. Therefore no defect retest was required.

## Automated evidence

- Pre-QA hard invariants: 6 manifest/helper tests and 1 Chromium invariant test passed.
- Pre-QA compact smoke: Chromium, Firefox, and WebKit passed.
- Pre-QA static guards: 5 passed.
- Manual observation harness: 3 Chromium sessions passed.
- The immediately preceding clean commit's consolidated regression result remained applicable because no production source changed.
- Final documentation/checklist validation, focused protection gates, and repository regression are required before commit.

## Blockers and release impact

Local deterministic blockers: none. The two public-history scenarios are existing accepted characterization limitations and did not produce a false pass.

External gates: deployed Worker URL, configured FICS gateway, and opt-in live tablebase remain pending.

Physical/manual gates: real phone/tablet validation and named screen-reader certification remain pending. Safe-area/notch, browser-chrome, virtual-keyboard, and assistive-technology behavior were not certified.

Season 10.12.5 does not authorize release. Simplified Play remains QA-only, Players remains production-blocked, Legacy Play remains default, Classic remains the default landing, and runtime ownership is unchanged.
