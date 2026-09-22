# CAISSA Engine Arena EAE-005 — Runtime Manager

Baseline: `2bf5308b95f8efa786fa7ad063e8162049a4866a`

## Pre-change lifecycle audit

Before EAE-005, `caissa-arena.js` directly stored `whiteEngineInstance`,
`blackEngineInstance`, and `evaluatorEngine`. `initEngines()` reconciled those fields and called the
shared registry factory; `destroyEngines()` directly terminated them. `EngineAdapter` was and
remains the only code that constructs a native `Worker`, performs the UCI identity barrier, sends
commands, owns its worker-generation guard, and performs native termination.

The audited paths were:

| Event | Pre-EAE-005 behavior |
| --- | --- |
| Arena entry | Render, mount board, then prewarm selected White, Black, and the legacy full evaluator. |
| Selector rendering | Metadata only; no SF18/SF19 construction. |
| Participant selection | Update selection and call `prewarmEngines`; `initEngines` reconciled raw fields. |
| Match start | Reuse/prewarm, send `ucinewgame` and `isready`, validate selected identities, then search. |
| Match stop | Stop searches, directly terminate all three fields, clear fields. |
| Participant replacement | Directly terminate a mismatched role and construct its replacement. |
| Tournament transition | Change selected configs; the next Match start reconciled both participant fields. |
| Tournament completion | End competition but retained ready instances until explicit stop/exit. |
| Manual draw | Stop all three searches, record the draw, then schedule the next pairing. |
| Game tab switch | Presentation only; retained the same instances. |
| Arena exit | Cancel search/timer and destroy all three instances. |
| Worker crash | Adapter invalidated its generation, terminated the worker, cleared READY, and notified registry/UI. |
| UCI/ready timeout | Adapter failed closed and terminated the exact provider instance. |
| Identity mismatch | Adapter rejected before READY and terminated without fallback. |
| Evaluator | Independently constructed as legacy `stockfish`, but stored beside participant fields. |

Direct native worker construction remains only in `EngineAdapter.start()`. Native termination and
`stop`/`quit` transport remain adapter responsibilities. Arena runtime ownership now flows only
through `ArenaRuntimeManager`.

## Ownership and roles

`ArenaRuntimeManager` owns exactly three possible roles:

- `white`
- `black`
- `evaluator`

Each live record binds one role, provider ID, immutable requested identity, adapter instance,
acquisition generation, worker asset, UCI runtime identity, resource profile, and lifecycle state.
`CaissaArena.whiteEngineInstance`, `blackEngineInstance`, and `evaluatorEngine` are read-only
compatibility getters into the manager; they are no longer independent storage locations.

Normal play is bounded to three Arena workers. Self-play still acquires two independent participant
instances and runtime IDs. The application-level legacy worker outside Arena is not an Arena-owned
resource and is reported separately in browser accounting.

## State machine

The normalized manager states are:

`CREATED → INITIALIZING → READY ↔ THINKING → STOPPING → IDLE`

Any owned state can terminate through its allowed transition; creation/initialization/active states
can enter `FAILED`. A terminated record is removed and cannot return to READY. Adapter booleans are
still used for low-level UCI transport, but Arena diagnostics expose the normalized role state.

Provider and requested-provider properties are made non-writable when acquired. Adapter runtime
identity snapshots remain frozen. Role generations ensure a late startup or callback from a
replaced instance cannot overwrite its successor.

## Acquisition, reuse, and replacement

`acquire(role, providerId)` follows these rules:

1. Reject unknown, disabled, or malformed providers.
2. Reuse an in-flight acquisition for the same role/provider.
3. Reuse an already READY instance only when its validated provider, requested identity, and worker
   asset still match.
4. For a changed provider, terminate and remove the old role before constructing the replacement.
5. Start through `EngineRegistry.createArenaEngine`, validate identity, and publish READY only for
   the current acquisition generation.
6. A stale completion terminates itself and returns no ownership.

Tournament pairings use the same policy. Same-role/same-provider workers may be reused; changed
roles are deterministically replaced. Visible labels never own or mutate runtime identity.

## STOP versus TERMINATE

- **STOP** cancels active calculation and retains a reusable, identifiable worker in `IDLE`.
- **TERMINATE** stops if necessary, sends UCI `quit`, performs native worker termination, invalidates
  the acquisition generation, and deletes the live role record.

Policy by operation:

| Operation | Policy |
| --- | --- |
| Pause | STOP all Arena roles; Resume reuses them. |
| Match stop | TERMINATE all roles. |
| Manual draw | STOP all roles, record result, reuse/replace during next pairing. |
| Tournament transition | `ucinewgame` + `isready`; reuse same provider or TERMINATE/replace changed provider. |
| Tournament completion | STOP all roles for inspection/reuse. |
| Participant replacement | TERMINATE changed participant only. |
| Arena exit | TERMINATE all roles and invalidate pending starts. |
| Runtime failure | TERMINATE and remove only the failed role; competition cleanup STOPs surviving roles. |

Every reused game calls `ucinewgame`, then awaits `readyok` for White, Black, and evaluator before
play. Position commands and searches occur only after that reset.

## Evaluator lifecycle and failure isolation

The evaluator is a separate `evaluator` role using the full Stockfish 2019 MV provider. Participant
replacement does not replace it. Evaluation and infinite-analysis searches update only evaluator
state. Evaluator failure removes only its role and clears evaluation readiness; participant
identity records remain intact. Participant failure removes only that participant record, moves the
competition to deterministic stopped/error state, and stops surviving searches without relabeling
or corrupting them.

Constructor exceptions, WASM/worker errors, identity mismatch, `uciok`/`readyok` timeout, malformed
providers, runtime exceptions, and replacement during initialization all end with no failed live
record and no false READY state. The manager retains only bounded timing diagnostics and one latest
failure diagnostic per role; these are historical diagnostics, not active runtime records.

## Resource policy

Resource metadata is factual vendored/configuration data, not a browser-memory claim:

| Provider/profile | Worker bytes | WASM bytes | Hash | Threads | Weight |
| --- | ---: | ---: | ---: | ---: | --- |
| Stockfish 2019 MV | 1,579,996 | 0 (ASM.js) | Not configured by provider | 1 | light |
| Stockfish 2019 MV Lite profile | 1,579,996 | 0 (ASM.js) | Not configured by provider | 1 | light |
| Stockfish 18 Lite | 20,680 | 7,295,411 | 16 MiB | 1 | heavy |
| Stockfish 19 Lite | 21,415 | 1,787,571 | 16 MiB | 1 | light |

All four profiles are single-worker, mobile-compatible, and require no cross-origin isolation.
`getResourceSnapshot()` reports live roles, states, runtime IDs, assets, known configured Hash total,
whether that estimate is complete, unique WASM/worker assets, acquisition timings, failures, and
bounded termination timings, failures, and peak live Arena workers. It is a development/test
diagnostic and has no user-facing UI.

Selector rendering never acquires a worker. Browser HTTP/WASM caching may retain downloaded bytes;
that is distinct from a live worker and is intentionally left to the browser. No custom WASM cache
is introduced.

## Mobile policy and limitations

Portrait 390×844 and landscape 844×390 use the same three-role limit and lazy acquisition policy.
Inactive providers are metadata only. Selection switching and Tournament transitions must replace
in place without accumulating workers, and tab switching must not affect ownership.

The resource snapshot does not claim exact heap, native, or NNUE memory because current browser
tooling does not expose reliable per-worker measurements. The qualitative weight class describes
vendored transfer/runtime payload, not playing strength or measured RAM.
