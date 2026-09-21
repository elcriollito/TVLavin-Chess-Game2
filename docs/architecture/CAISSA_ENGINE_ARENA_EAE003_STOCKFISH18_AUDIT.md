# CAISSA Engine Arena EAE-003 — Stockfish 18 Runtime Audit

Audit baseline: `dfb144ebe8d0900e9c65d10381e77b8fe108547d`

This audit was completed before the Arena provider was changed. No engine was downloaded and no
runtime asset was modified.

## Existing CAISSA runtime

| Item | Audited value |
| --- | --- |
| Existing Analyze provider | `stockfish-18-lite` in `js/engine-registry.js` |
| Existing gated Play provider | `stockfish-18-gameplay`, derived from the Analyze assets |
| Worker entry | `/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.js` |
| WASM asset | `/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.wasm` |
| Build | Stockfish 18 Lite, browser WASM/NNUE, single-threaded |
| Reported UCI name | `Stockfish 18 Lite WASM` |
| Reported UCI author | `the Stockfish developers (see AUTHORS file)` |
| Existing defaults | `MultiPV=1`, `Hash=16`; gated gameplay also pins `Threads=1` |
| Default depth | 20 |
| Chess960 | Not exposed by this profile |
| License file | `assets/vendor/stockfish/18.0.0/Copying.txt` (GPLv3) |

The worker source contains no pthread or `SharedArrayBuffer` runtime path. Its existing certified
initialization is `Worker → uci → identity → uciok → MultiPV 1 → Hash 16 → Threads 1 → isready →
readyok`. The EAE-003 Arena profile preserves those limits; it does not claim a Full or threaded
build.

## Asset integrity and cost

| Asset | Checkout bytes | SHA-256 |
| --- | ---: | --- |
| `stockfish-18-lite-single.js` | 20,680 | `2c02445abf3a13af1c5cb5a2be80ef0d62c3b3e1903823a10b7d6ddb87a94a15` |
| same JS, normalized LF | 20,670 | `2278005057f381491f1c9bb3e44c9f5920b3a00bef9759e33cc6582769a1f1fe` |
| `stockfish-18-lite-single.wasm` | 7,295,411 | `a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1` |
| `Copying.txt` | 35,821 | `0b383d5a63da644f628d99c33976ea6487ed89aaa59f0b3257992deac1171e6b` |

The deterministic per-instance setting directly observable by CAISSA is a 16 MiB engine hash.
Each active participant is a separate Worker/WASM instance, so Stockfish 18 vs Stockfish 18 owns
two independent hashes and heaps. The browser does not expose reliable per-worker WASM heap
accounting on this non-cross-origin-isolated page; main-thread `performance.memory` would omit or
conflate worker/WASM allocations and is not reported as an exact measurement. The 7.30 MB payload,
16 MiB hash setting, worker count, construction, and termination are therefore the auditable
resource observations.

## Browser and security compatibility

- The assets are same-origin and are already allowlisted by `EngineAdapter`.
- The site CSP permits the existing same-origin worker. No CSP, COOP, COEP, or global header was
  changed for EAE-003.
- Cross-origin isolation is not required by this single-threaded build.
- Existing CAISSA preview evidence measured cold startup at 536.8 ms to `uciok` and 538.5 ms to
  `readyok` on desktop, and 552.0/553.9 ms under a 390×844 iPhone-style Chromium emulation.
- Before Arena integration, the current bundled asset passed its isolated real-worker lifecycle
  and six-position depth-10 MultiPV golden suite in Chromium (2 passed, 1 project skip).
- EAE-003 subsequently certifies real Arena play at desktop, 390×844 portrait, and 844×390
  landscape. These are browser-emulated mobile results, not physical-device thermal certification.

## Arena provider decision

The audited runtime is compatible with the current Arena browser environment. EAE-003 therefore
registers one Arena-only competition profile:

- Provider ID: `stockfish-18-lite`
- Display name: `Stockfish 18 Lite`
- Runtime ID: `stockfish-18-lite-single-runtime`
- Profile: `lite-single`
- Capabilities: NNUE and MultiPV supported; threading and Syzygy not supported; browser/mobile
  compatible; no cross-origin isolation required
- Identity expectation: Stockfish 18 Lite WASM name and Stockfish developer author patterns, with
  both fields required

The generic legacy engine catalog remains unchanged. Match and Tournament both consume the same
Arena registry entry and create it only through `EngineRegistry.createArenaEngine`.

## Lifecycle and loading behavior

Arena preserves its certified lifecycle: on section entry it prewarms only the default 2019 white,
black, and evaluator selections. Listing Stockfish 18 creates no Stockfish 18 worker. Selecting it
reconciles only the changed participant slot; the evaluator remains the legacy Stockfish provider.
Stockfish 18 vs Stockfish 18 creates two physical workers with different immutable
`runtimeInstanceId` values. Selection changes and Arena teardown terminate owned workers through
the existing adapter lifecycle.

An identity mismatch, UCI timeout, ready timeout, constructor failure, WASM/worker error, or
unexpected worker termination marks only the Stockfish 18 Arena runtime unavailable for the
session. It never falls back to, borrows, or relabels the Stockfish 2019 worker.
