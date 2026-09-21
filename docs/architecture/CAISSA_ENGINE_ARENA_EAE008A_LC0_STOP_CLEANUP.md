# CAISSA Engine Arena EAE-008A — Lc0 stop and cleanup experiment

Date: 2026-09-21. Scope: **isolated browser lab only**. The failed EAE-008 commit is
`e00226c1af98056078cb37644fed466d91b70a2f`, preserved by the annotated
`engine-arena-expansion-eae008-lab-failed` tag. Work is on
`experiment/lc0-eae008a-stop-cleanup`; no Lc0 Arena provider, selector, navigation,
production COOP/COEP/CSP, merge, or deployment is part of this experiment.

## Root cause and input path

The pinned `jalpp/lc0.js` source (`482bb4a830287b726ebe7d42f14ab7f5f17c18a0`,
upstream-related [PR 2432](https://github.com/LeelaChessZero/lc0/pull/2432)) uses
`EM_ASYNC_JS lc0web_get_line` in `src/engine_loop.cc`. It awaits the worker's
`lc0web_get_line` queue, then calls `UciLoop::ProcessLine`. Its browser-specific
`Search::StartThreads` in `src/search/classic/search.cc` instead invokes
`SearchWorker::RunBlocking()` on that same UCI/worker event-loop thread. During
`go infinite`, browser `postMessage('stop')` is correctly framed, but the worker
cannot receive it and the UCI loop cannot dequeue it until search returns. The
original infinite search cannot return without a stop. This is the prototype's
single-thread browser adaptation, not an incorrect CAISSA newline or a suppressed
bestmove. Native Lc0 normally uses separate search/watchdog threads; a direct
restoration of that native path was tested but failed because the JS inference/ORT
session bridge is bound to the parent worker global, not the pthread global.

The small source patch `0001-browser-stop-signal.patch` adds an Emscripten-only
one-shot `lc0web_take_stop()` check at a safe classic-search iteration boundary.
The parent sets a `SharedArrayBuffer`/`Atomics` flag on `stop` or `quit`, while
still posting the original UCI command. The running search consumes the flag and
calls `Search::Stop()`, resulting in exactly one bestmove; afterward the UCI loop
dequeues the queued `stop` and remains usable. A new `go` resets the one-shot
flag. This is an **out-of-band early interrupt followed by normal queued UCI
delivery**. It does not make the UCI parser concurrent, and the UCI `stop`
handler itself is reached *after* the stopping bestmove. The bounded test validates
the stopped move with `chess.js`, checks `readyok`, and makes another legal search
on the same runtime.

`0003-opt-in-native-uci-trace.patch` instruments exact C++ UCI dispatch,
search start/return, and bestmove production/output. It calls the worker's trace
hook, which posts timestamps only in `trace-uci` test mode. The wrapper separately
timestamps browser sends and received stdout; the worker timestamps message
receipt, queue dequeue, stop-flag consumption, cleanup request, and runtime exit.
Performance origins differ between browser and worker, so compare causal event
order, not raw cross-context millisecond values. A representative observed order:

```text
browser: position startpos, go infinite
worker: receive/dequeue go infinite → C++ UCI loop receives go → search begins
browser: stop
worker: search-stop-requested → bestmove-generated → bestmove-emitted
browser: receives bestmove → sends isready
worker: receives/dequeues queued stop → C++ UCI loop receives stop
worker: receives/dequeues isready → C++ UCI loop receives isready → readyok
browser: bounded next search succeeds → cleanup request
worker: receives/dequeues quit → C++ UCI loop receives quit → loop exit
worker: runtime-exit(0) → ORT session release → terminated acknowledgement
```

The browser worker's `stop` message can itself be received only after the
search yields; the shared flag is visible during search independently of that
message. The representative trace also shows no browser console/page errors.

## Cooperative cleanup and ownership

The baseline build kept its Emscripten runtime alive after `main`/UCI return.
Simply adding `-sEXIT_RUNTIME=1` was tested and did not reliably produce
`Module.onExit` after a searched `quit`; the wrapper timed out and killed the
parent. `0002-cooperative-exit.patch` calls `emscripten_force_exit(0)` **after**
`RunEngine` and its local engine destructor have returned. `-sEXIT_RUNTIME=1`
includes the runtime shutdown machinery. Emscripten then invokes its generated
`PThread.terminateAllThreads()` and `Module.onExit`. This is native runtime
teardown, not a CAISSA parent `Worker.terminate()` call. Emscripten's
[pthreads documentation](https://emscripten.org/docs/porting/pthreads),
[module lifecycle](https://emscripten.org/docs/api_reference/module), and
[`emscripten_force_exit` reference](https://emscripten.org/docs/api_reference/emscripten.h.html)
describe the respective pool, exit, and shutdown semantics.

The generated experimental `lc0.js` contains `pthreadPoolSize = 4`, preallocates
four `em-pthread` workers loading that script, and has
`PThread.terminateAllThreads()` on the runtime-exit path. `PROXY_TO_PTHREAD` is
not enabled; `main` runs in the parent lab worker. The four persistent workers
at the failed baseline's last snapshot were the Emscripten pool, not four Lc0
search workers and not four ORT workers. Lc0's browser search runs blocking on
the parent worker with `--threads=1`. ORT Web 1.27.0 is configured with WASM/CPU,
`numThreads=1`, `proxy=false`. The parent worker owns the loaded inference
session; it explicitly calls `InferenceSession.release()` after native exit,
clears its session/computation map, acknowledges zero pthreads, then closes.
The `lc0web_computation` global is not available inside Emscripten pthreads,
which is why simply enabling native search threads was not an equivalent fix.

The wrapper's normal protocol is `stop` (if active) → bestmove → `quit` → C++
engine return → Emscripten runtime/pthread exit → ORT session release → parent
worker close. It waits at most three seconds for an acknowledgement that includes
`nativeExit: true` and zero tracked pthreads. Only timeout or a worker crash
uses emergency `Worker.terminate()`, incrementing `forcedTerminations`; it never
counts as cooperative certification. Network-loading cancellation may finish
without having created a worker at all. A deliberately injected worker error
necessarily uses the emergency path; externally observed Chromium worker
targets returned to baseline afterward.

## Reproducibility and evidence

`experiments/lc0-browser-lab/scripts/build-runtime.ps1` checks out the exact
source commit in a separate clean work root, configures pinned Emscripten 3.1.64,
Meson 1.8.3 and Ninja 1.11.1.4, then applies three auditable source patches
before compilation. It retains SIMD, pthreads, Asyncify, memory growth, JS
backend, and the existing `--threads=1`, minibatch and NN-cache settings.
The only linker-setting addition is `-sEXIT_RUNTIME=1`; no WebGPU, alternate
backend, neural network, or strength tuning was introduced. The staging script
checks actual artifact sizes/hashes against `lab-manifest.json`. The Maia 1100
network remains SHA-256
`e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4`.
Generated binaries, weights, and browser output are ignored, not committed.

Windows/Chromium headless lab results with the final rebuilt artifact:

| Gate | Result |
| --- | --- |
| Active `go infinite → stop → isready → go nodes 1` on one runtime | 20/20, legal stopped and restarted moves; READY afterward; no restart needed |
| Fresh active-search full lifecycles | 20/20 cooperative acknowledgements; 0 normal forced parent terminations |
| Worker high-water mark | 5 per lifecycle (one parent, four Emscripten pool workers) |
| After **each** lifecycle | wrapper parent/pthread count 0; independent CDP dedicated-worker targets returned to baseline |
| 20 evolving legal searches with same Maia network | 20/20 independently legal moves |
| Immediate stop, double stop, stop→quit, go→quit, isready→terminate, active terminate | One bestmove where expected, no duplicate; ordinary cleanup acknowledged, no forced kill |
| Active search→injected worker error | Emergency force termination (expected); targets eventually baseline; not a cooperative success |
| Active search→page reload/lab teardown | Chromium worker targets returned to baseline |
| Failure injection and rapid initialization cancellation | Safe final state; external workers eventually baseline |
| Lab contract suite | 4/4 |

The exact browser run logs summarize stop latency, worker peaks, per-cycle
cleanup, and each race. No monotonic worker growth, late READY transition,
resurrected runtime, or orphan worker target was observed in these bounded
checks. This is not a claim about exact WASM heap/ORT allocator memory release,
unobserved OS threads, other browsers, devices, or indefinite soak behavior.

Focused Arena provider registry, Runtime Manager, and Generation Cup unit
checks passed **33/33**. Generation Cup Chromium browser checks passed **5/5**.
All executable changes remain below `experiments/lc0-browser-lab/`; the root
`.gitattributes` addition only preserves LF line endings for reproducible lab
patches. Production Arena code and headers are unchanged.

**Verdict: `LC0_LIFECYCLE_CERTIFIED` for this isolated pinned Chromium lab.**
The next step, if desired, is an **EAE-009 isolated integration design review**,
not immediate Arena integration or deployment.
