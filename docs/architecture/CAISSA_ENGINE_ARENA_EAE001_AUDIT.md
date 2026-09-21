# CAISSA Engine Arena EAE-001 architecture audit

Status: pre-implementation audit

Baseline: `origin/main` at `a6473ce0269dc78628de86b010f15a2667db8fcf`

Scope: Arena runtime architecture and runtime-identity truthfulness only

## Current architecture map

| Concern | Current implementation | Audit result |
| --- | --- | --- |
| Engine registry | `js/engine-registry.js` exposes `EngineRegistry.ENGINES`, `list()`, `get()`, and `createEngine()` | Arena metadata is nominally centralized, but Arena copies and reshapes it and also contains fallback lists. `createEngine()` silently resolves an unknown ID to Stockfish. |
| Arena provider definitions | `ENGINES` entries for Stockfish 2019 MV, its Lite search profile, Fairy-Stockfish, Arasan, Rodent III, and Texel | Metadata is incomplete and uses `enabled`/`notes` rather than an explicit availability and capability contract. Lite is a separate entry even though it shares the same runtime asset. |
| Worker creation | `EngineRegistry.createEngine()` constructs `EngineAdapter`; `CaissaArena.createEngineInstance()` can then fall back to a raw `EngineAdapter` or legacy `StockfishEngine` | Multiple construction paths make the requested provider and loaded runtime separable. |
| Worker reuse | `CaissaArena.initEngines()` reconciles white, black, and evaluator workers by adapter `id` and `workerPath` | Workers are reused through moves, evaluation updates, standings updates, and tab changes. Selection changes replace only the affected worker. |
| Worker termination | `EngineAdapter.terminate()` invalidates its generation, timers, callbacks, and worker; Arena `destroyEngines()` owns all three workers | Explicit termination is clean. Failed startup terminates the failed generation. Arena does not destroy workers on Match/Tournament/Game tab changes. |
| UCI handshake | `EngineAdapter.start()` sends `uci`, waits up to 4 seconds for `uciok`, configures options, sends `isready`, and waits up to 4 seconds for `readyok` | Ordering and bounded timeouts already exist. |
| UCI identity parsing | `EngineAdapter.handleMessage()` parses `id name` and `id author` | Exact validation exists only when `expectedUci` is configured. Legacy Arena Stockfish has no expectation, so `uciok` alone marks its identity validated. |
| Availability checks | Arena uses `enabled !== false && workerPath`; Match and Tournament both call `isEngineRunnable()` | The UI paths share a predicate inside Arena, but provider availability is not an explicit registry service and fallback lists duplicate availability truth. |
| Match selection | `renderEngineSelectors()`, `selectEngine()`, and `state.whiteEngine` / `state.blackEngine` in `js/caissa-arena.js` | Options are derived from Arena's copied list. Unavailable reasons come from copied `notes`/`reason`. |
| Tournament selection | `renderTournamentEngineList()` and `getSelectedTournamentEngines()` in `js/caissa-arena.js` | It uses the same copied list and predicate as Match, but separately renders availability. |
| Analyze providers | `ANALYZE_ENGINES` and the role provider model in `js/engine-registry.js`; Analyze creates `stockfish-18-lite` in `js/analyze-section.js` | Stockfish 18 is already isolated to Analyze plus separately gated Play infrastructure. It is intentionally absent from Arena. |
| Stockfish 18 architecture | Versioned single-threaded worker/WASM assets under `assets/vendor/stockfish/18.0.0`; exact `expectedUci`; role resolver and inactive/gated gameplay provider | This is a useful identity-validation precedent. EAE-001 must not activate it in Arena. |
| Worker assets | Arena's runnable profiles both use `/engine/stockfish-working.js`; placeholders reference absent or unsuitable WASM workers; Analyze uses versioned SF18 JS/WASM assets | No new assets are needed for this phase. |
| WASM loading | The legacy Arena worker is asm.js. Analyze's SF18 worker loads its adjacent WASM asset. Fairy-Stockfish is a threaded WASM placeholder. | Runtime type and asset requirements need to become provider metadata. |
| Cross-origin isolation | Vercel sets COOP `same-origin-allow-popups`, not the COOP/COEP pair required for cross-origin isolation | Threaded Fairy-Stockfish remains unavailable. EAE-001 does not change headers. |
| Mobile constraints | Arena uses responsive layout code, while the current single-threaded legacy worker is browser/mobile compatible | Provider metadata does not currently state mobile compatibility. No mobile-specific engine substitution exists or should be added. |
| Lazy loading | Registry loading is metadata-only. Worker construction starts when Arena is entered because `onEnter()` calls `prewarmEngines()`; selector rendering alone does not construct a worker | Current eager-on-Arena-entry prewarming is retained for v2.0 continuity. Provider construction is already a seam for future selection/start-time lazy loading. |
| Prewarming | `prewarmEngines()` starts/reconciles white, black, and evaluator workers and loops if selections changed during startup | It preserves worker continuity, but readiness currently proves only adapter ID/path equality, not provider/UCI identity equality. |
| Profiles | Stockfish 2019 MV and Stockfish 2019 MV Lite are two registry entries sharing one worker; the difference is default search depth | The new model should explicitly associate both entries with one runtime and distinct profiles. UCI cannot distinguish these application-level profiles. |
| Existing identity tests | `tests/play/engine-adapter-readiness.test.js` covers exact SF18 identity and mismatch; Engine18 suites exercise real identities; Arena browser tests compare selected IDs to adapter IDs | There is no Arena legacy identity expectation, immutable runtime identity record, session unavailability behavior, or historical Arasan/prewarmed-Stockfish regression test. |

## Pre-change lifecycle

```text
Arena entry
  -> copy EngineRegistry.list()
  -> render Match and Tournament selectors
  -> prewarm selected white, black, evaluator
  -> create EngineAdapter (with fallback construction paths)
  -> Worker(workerPath)
  -> uci
  -> parse optional id name / id author
  -> uciok
  -> validate only when expectedUci happens to exist
  -> configure + isready
  -> readyok
  -> adapter ready
  -> Arena compares adapter id/path with selection
  -> Match or Tournament may start
```

## Risks to remove

1. `EngineRegistry.createEngine(id)` uses `get(id) || get('stockfish')`; an unknown requested provider can therefore create Stockfish.
2. `CaissaArena` embeds two hardcoded fallback lists and has raw-adapter/legacy-engine construction fallbacks.
3. Legacy Arena providers do not require `id name` and `id author`, so their UCI identity is not proved before READY.
4. Arena instance matching checks configured adapter IDs and asset paths, not a validated runtime record.
5. Startup failure is local to an adapter and is not reflected as session-wide provider unavailability in both selectors.

## Target for EAE-001/EAE-002

`EngineRegistry` will own one Arena provider collection, effective session availability, provider-specific runtime identity expectations, capabilities, runtime/profile relationships, and the sole Arena construction seam. Match and Tournament will query that same collection and availability service. `EngineAdapter` will expose a frozen runtime snapshot containing the runtime instance ID, provider/request IDs, UCI name/author, asset, creation time, validation state, and status. Arena will start a competition only when both participant snapshots are READY, identity-validated, and equal to their selected providers. Any mismatch or startup failure will terminate that worker, mark the provider unavailable for the session, update both selector surfaces, and never substitute another provider.

The current eager-on-Arena-entry prewarm policy remains unchanged in this checkpoint to preserve certified startup behavior and worker continuity. The provider factory remains lazy and does not construct assets during registry or selector rendering, which is the required seam for future Stockfish 18/19 providers.
