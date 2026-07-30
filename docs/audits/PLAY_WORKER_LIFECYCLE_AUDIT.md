# Play Worker Lifecycle Audit

Audit/schema version: 1.0.0. Scope: Season 10.11.1.

| Context | Owner | Worker source | Creation / reuse | Stop / terminate | Fallback | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| Legacy Play, Simplified Games, Bots, Coach | `play` (`App.engine`) | registry `engine/stockfish-working.js`; legacy wrapper fallback uses the same bundled file | application initialization; all Play modes reuse the application engine | replacement, New Game, and game-end cancellation; explicit replacement/page disposal terminates | truthful unavailable state, one bounded lifecycle retry | High: readiness previously began at `uciok`, before `readyok` |
| PostGame evaluation | `play`, separate request purpose | existing Play engine when FairPlay permits | post-game activation; reuse | request isolation cancels | feature unavailable | Medium: stale results require rejection |
| Mentor educational analysis | `mentor-analysis` | separately created registry engine | one controlled analysis run | cancel/timeout; owner dispose terminates | unavailable result | Low/medium |
| Analyze / imported analysis | `analyze` | separately created registry engine | Analyze-session demand | Analyze token cancellation; Analyze cleanup | Analyze-local unavailable | Low/medium |
| Arena | `arena` | registry-selected bundled engines | match start; match-owned instances | match pause/stop; Arena cleanup | failure is surfaced | Medium and intentionally multi-worker |
| Spectator | `spectator` | none | presentation-only FICS observation | n/a | presentation remains available | None |
| FICS | provider socket, no local engine | none | connection/authentication | n/a | provider connection state | None; live assistance is denied before dispatch |
| Tablebase | fetch client, no Worker | none | explicit query | abort where supported | local/unknown result | None |
| Endgame trainer | independent endgame owner | fixed same-origin bundled worker | trainer/probe demand | adapter/probe cleanup | diagnostic unavailable | Low; outside Play |
| Service/utility workers | offline/application owner | static registered scripts | page bootstrap | browser controlled | network path | Not engine workers |
| Test workers | `test` | in-memory fake constructors | per test | teardown enforced | scenario-controlled | Never registered by production HTML |

No production engine Worker is unowned. Separately packaged and legacy-client copies are
not loaded by the primary Play document. There is no CDN engine fallback in Play.

## Findings and adopted boundaries

- Play, Analyze, Arena, and Mentor ownership is separable and must not be merged.
- Engine adapters attach one message, error, and message-error handler per worker. The
  prior runtime had no common redacted inventory of handlers, timers, or generations.
- Request isolation already supplies bounded request IDs, position/session tokens,
  FairPlay denial before dispatch, and stale-response rejection.
- Engine attribution uses a stop/isready barrier, but adapter readiness previously used
  `uciok` plus an arbitrary delay rather than completing `readyok`.
- New Game and replacement searches stop active work. Players readiness creates and
  terminates no Worker. Visibility alone is not a safe disposal signal; page/owner
  disposal is.
- The new provider-independent lifecycle contract uses immutable, payload-free
  snapshots; explicit transitions; one initialization promise per generation; a
  latest-wins, one-active-request policy; idempotent stop/termination; stale-generation
  rejection; and a one-retry default fallback.
- Play cleanup is owner-scoped. It cannot terminate Analyze, Arena, Mentor, Spectator,
  FICS, or Endgame resources.
