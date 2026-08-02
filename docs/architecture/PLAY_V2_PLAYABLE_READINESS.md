# Play v2 First Playable State

> Season 11.5.2: Coach is `locally-assistance-certified` by deterministic automation. Public exposure remains prohibited pending human content, physical-device, and named-screen-reader review. Games and Bots certification remain independent.

Status: **Season 11.3.2 accepted locally**

Contract: `PlayV2PlayableReadiness@1.0.0`

> Season 11.4.2A update: Bots Worker certification is now
> `local-production-build-ready`. Play v2 bootstrap, readiness probes, setup and
> profile selection create zero Workers; an accepted Bots Play action may create
> one. This does not change `publicReady = false`, deployment status, or the
> pending physical-device gate. Evidence is in
> [`PLAY_V2_BOT_WORKER_READINESS.md`](./PLAY_V2_BOT_WORKER_READINESS.md).

Public exposure: **none**. Games alone receives local readiness. Bots remains internal and uncertified; Coach, Mentor, and Players remain blocked.

## State model

| State | Meaning and permitted action |
| --- | --- |
| `booting` | Passive probes are running for at most 2,000ms; Play is disabled and no game work starts. |
| `ready` | Every required Games probe passed; one Play action is enabled. |
| `starting` | One start owns a 2,000ms deadline; duplicate activation is rejected. |
| `playing` | The existing certified Games lifecycle committed successfully. |
| `postgame` | Gameplay is stopped and its finalized result is available. |
| `recoverable-error` | A concise message and one keyboard-operable Retry are available; valid selections remain. |
| `unavailable` | Play is disabled permanently for the controller instance; there is no fallback. |

Transitions are explicit and fail closed. Polling uses the existing board readiness cadence of 50ms. Boot and start timers have cancellation and stale-token rejection. No retry is automatic and the single Retry cannot be repeated.

## Required Games probes

Before Play can enable, the controller proves: authorized internal/QA entry contract; mounted shell; exactly one primary board; operational board facade; admitted Games mode; certified timed preset; valid color; local engine provider; creatable isolated opponent session; local clock owner; chess.js rules authority; idle/startable lifecycle; GameRecord owner; clean PostGame owner; opaque Analyze handoff owner; sole CTA gate; no Games Worker requirement; honest local-only/no fallback; FICS, educational, and Players fallback prohibition; and disabled analytics transport.

Probes are capability reads only. They do not move a piece, start/configure a clock, resolve Random, create an engine session, build a GameRecord, create an Analyze handoff, access persistence, perform network work, or load a blocked mode.

## Mode classification

| Mode | Classification |
| --- | --- |
| Games | required; locally ready only after every probe passes |
| Bots | uncertified; never inherits Games readiness; Worker certification remains Season 11.4 |
| Coach | blocked and never probed/loaded as recovery |
| Mentor | blocked and never probed/loaded as recovery |
| Players | blocked and never probed/loaded as recovery |

## CTA and initialization ownership

The existing Games panel owns the only CTA and delegates readiness state to the new passive controller. The existing compatibility boundary remains the one start command, and `newGame` remains the initializer. A board-unavailable initializer now returns an explicit rejection rather than a false accepted result. Readiness never becomes a board, chess, engine, clock, lifecycle, record, PostGame, or navigation owner.

Pointer, keyboard, touch, and direct programmatic calls converge on the same `beginStart` transition. Random resolves only after that transition. Failure ends `starting`, preserves selections, exposes Retry, and leaves no active clock or accepted game. New Game rotates the lifecycle session before setup readiness is evaluated again.

## Failure matrix

Every required probe has deterministic failure coverage: entry/shell, board count/API, mode, preset, color, opponent provider/session, clock, rules, lifecycle, GameRecord, PostGame, Analyze, CTA, mode-specific Worker rule, fallback policies, and analytics state. Additional coverage exercises malformed input, probe exception, delayed boot, start deadline, duplicate start, stale completion, cancellation/route exit, retry exhaustion, command rejection, refresh, deep link, back/forward, and re-entry.

All failures keep Play disabled until truthful recovery. They create no partial game or GameRecord, start no clock, accept no opponent work, create no Worker, expose no internal error, and invoke no FICS, educational, Players, Legacy Play, or provider fallback.

## Accessibility

The bounded status node is a polite live region and is the CTA description. Booting has one stable message; recoverable failure has a concise announcement and a native Retry button; unavailable has a stable explanation. Existing focus-on-success, visible focus, touch targets, forced colors, reduced motion, zoom/reflow, promotion, and PostGame automation remain authoritative.

No physical device or named screen-reader certification is claimed. The documented square-by-square board keyboard limitation and generic legacy modal focus-trap characterization remain outside this readiness contract.

## Security and privacy

The contract adds no storage, cookie, identity, telemetry, analytics transport, PGN upload, external health check, WebSocket, Worker, or network destination. Errors contain bounded reason codes rather than raw exceptions, paths, configuration, or flags. Readiness fails closed locally.

## Acceptance evidence and limitations

Unit evidence covers every state, transition axis, all required probes, the complete failure matrix, timing, cancellation, stale results, one retry, hostile input, and static ownership. Chromium evidence covers authorized/deep entry, passive ready, missing-clock recovery, command failure, refresh, back/forward, route exit/re-entry, PostGame, accessibility, and existing Games certification. The three existing isolation/entry contracts and deterministic generated document remain mandatory acceptance owners.

Remaining public-beta gates are physical-device/assistive-technology work, Bots/Worker certification, feedback, public authorization, monitoring, and rollback exercises. Play v2 is not publicly released.
