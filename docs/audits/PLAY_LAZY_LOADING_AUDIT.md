# Play Lazy-Loading Audit

Audit version: 1.1.0. Scope: both primary SPA entry documents.

| Resource group | Current load before 10.11.2 | Boot required | Trigger | Dependencies | Approx. local bytes | Decision | Risk |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| Board libraries, adapter, CSS and piece assets | synchronous / browser image demand | yes | boot | jQuery, chess.js, Chessboard.js | critical | eager | High: first render |
| Route controller, shell, GamesPanel | synchronous | yes | boot/current route | App compatibility and board | 61 KB | eager | High: Quick Play |
| Engine adapter and Worker lifecycle | synchronous | yes | Games | fixed engine registry | 61 KB | eager | High: ownership/readiness |
| EvaluationRail, visual tokens/components, accessibility | synchronous/blocking CSS | yes | boot | shell markup | 61 KB | eager | High: first interaction and truthful neutral state |
| Bot catalog, presets, session and panel | synchronous | no | QA Bots mode | ordered five-script group | 23 KB | deferred | Medium |
| Coach catalog, policies, detectors, session and panel | synchronous | no | QA Coach mode | ordered twelve-script group | 65 KB | deferred | Medium |
| Players presence, challenge, human-readiness and panel | synchronous | no | QA Players mode | ordered 28-script group | 117 KB | deferred | Medium; QA gate required |
| PostGame base actions | synchronous | yes | game completion | GameRecord and persistence | 43 KB | eager | High: result/action availability |
| Mentor foundation and educational/replay/summary modules | synchronous | no for initial play | explicit PostGame actions | six ordered incremental Mentor groups | 155 KB | deferred | High: action cancellation and API readiness |
| Guided Replay stylesheet | blocking | no | replay action | Mentor replay view | 2 KB | deferred with Guided Replay | Medium |
| Analyze session and deep analysis | synchronous | no for Play | Analyze route/action | navigation, engine registry | 77 KB | deferred as independently owned route group | High: direct-route compatibility |
| Arena, Classic, FICS, Spectator | synchronous/deferred attributes as existing | not Play boot, but global application-owned | their routes | independent controllers | large | unchanged | High: outside Play loader ownership |
| Endgame | separate document | no | Endgame route | separate application | n/a | unchanged | None for Play boot |

## Entry-point findings

- Both documents had 149 external script registrations and identical Play ordering.
- No duplicate Play feature registration was found between the two documents themselves;
  each is a separate entry point.
- Bot, Coach, and Players modules install global namespaces but perform no game/Worker
  creation at parse time. Their dependency order is explicit and safe for sequential
  same-origin insertion.
- The shell previously constructed all four panels at activation even when Games was the
  current route. It now constructs Games immediately and creates a deferred panel only
  after its exact QA mode resolves.
- Route tokens prevent a completed stale mode load from mounting into a newer mode.
- Board CSS, shell CSS, visual tokens, accessibility, navigation, modals, Classic, FICS,
  Arena, and Worker ownership remain outside the selected migration.
- Mentor foundation, analysis, Critical Moments, Guided Replay, Knowledge, and Summary
  are separate dependency groups. Review loads only foundation and technical-analysis
  preparation; later actions extend the same graph without reinserting shared scripts.
- Analyze remains independently owned. Navigation requests its fixed session/section
  group before route entry, including direct URL restoration and opaque PostGame handoff.
- Bot/Coach/Players images are CSS/icon or metadata-driven; no new initial image request
  is introduced. Secondary-image registration remains available through the fixed
  registry without speculative fetch.

## Security and failure boundaries

Definitions are a frozen production manifest. Public callers provide only a resource ID,
never a URL or callback. The loader accepts fixed same-origin `js/` and `css/` sources,
loads dependencies sequentially, reuses concurrent promises, permits one explicit retry,
and exposes immutable payload-free state. QA-only resources fail unavailable without the
QA capability. Failure leaves Games mounted and displays a bounded unavailable status.
