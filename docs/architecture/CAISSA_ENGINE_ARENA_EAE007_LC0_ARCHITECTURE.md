# CAISSA Engine Arena EAE-007 — Lc0 Browser Architecture

Date: 2026-09-20

Certified baseline: `c1dbea812e335a3488d5eb070ccffdaa0fc56c74`

Research boundary: architecture and source audit only; no provider, runtime, network, UI,
security-header, production asset, merge, or deployment change.

## Executive decision

**Verdict: `LC0_BROWSER_EXPERIMENTAL_ONLY`**

A real Lc0 search and neural-network inference stack can be assembled for browsers. Two upstream
experiments demonstrate the intended shape: Lc0 search compiled to WebAssembly, UCI over a worker,
Lc0 weights converted to ONNX, and inference through ONNX Runtime Web with WebGPU preferred and
WASM as a fallback. That is useful feasibility evidence, but it is not a supported Lc0 browser
distribution or a production-quality CAISSA participant.

The decisive gaps are upstream maturity, reproducible artifacts, browser/backend coverage, network
provenance, measured resource behavior, and lifecycle cleanup. The strongest successor prototype is
closed and unmerged, has no approving review, pins an old Emscripten toolchain, requires
cross-origin-isolated pthread WebAssembly, and has no authoritative runtime or network release.
CAISSA is not currently cross-origin isolated. Exposing Lc0 now would therefore make availability,
identity, or compatibility claims that the project cannot substantiate.

The next step should be a separate, non-production EAE-008 laboratory on an isolated origin. It
must reproduce an exact source commit and small, licensed network, establish integrity hashes, and
measure UCI, legal-play, responsiveness, memory, device-loss, and cleanup behavior. It must not add
Lc0 to the Arena registry until those gates pass.

## 1. Upstream status

As of 2026-09-20:

- The latest stable official release is Lc0 `v0.32.1` (`fd71a2d`, released 2025-11-23).
- The current prerelease is `v0.33.0-rc0` (`9f45ea4`, released 2026-09-05).
- Official releases provide native Android, Windows, Linux, and macOS packages with native CPU/GPU
  backends. They do not provide a supported browser/WASM package.
- The official 2026 project list still describes a JavaScript/WASM backend as a proposed 175-hour
  project. It says several prototypes have almost worked but none has been productionized, and it
  identifies PR 2072 as the latest attempt at the time of writing.

Relevant upstream work:

| Work | State | What it establishes | What it does not establish |
| --- | --- | --- | --- |
| PR 2072, `zamfofex:js-backend`, head `3dddc38` | Open, unmerged, one commit, no approval | Lc0 can call ONNX Runtime Web from an Emscripten build; author reported useful operation on browsers with WebGPU and a capable GPU | Supported build, broad compatibility, release artifacts, lifecycle/resource certification |
| PR 2432, `jalpp/lc0.js:lc0js`, head `482bb4a830287b726ebe7d42f14ab7f5f17c18a0` | Closed unmerged on 2026-07-31, eight commits, no review | Worker/UCI wrapper, real ONNX Runtime Web inference, WebGPU-first/WASM fallback design, Node UCI test harness, explicit browser deployment notes | Upstream adoption, reviewed artifacts, current-toolchain build, browser test matrix, network release, production cleanup |

PR 2432's author closed it with the explanation that the work was not a priority for Lc0's
developers. It is the most concrete successor found, but remains a non-authoritative fork.

## 2. What “Lc0” consists of

Lc0 is not a Stockfish-style single WASM asset. A truthful participant has three independently
identifiable layers.

### Engine/search

The C++ engine owns the UCI frontend, position/history handling, move generation, and neural-guided
search. Search expands positions, prepares input planes, batches pending leaf evaluations, consumes
policy and value/WDL (and optionally moves-left) outputs, and selects a move. UCI is the control
protocol; a successful `uci`/`isready` exchange does not prove which inference backend or network is
actually in use.

### Neural inference backend

The backend turns batches of input planes into neural outputs. Official Lc0 supports several native
families, selected with `--backend` and backend options:

- CUDA/cuDNN for NVIDIA GPUs;
- ONNX execution providers, including CPU, CUDA, TensorRT, ROCm, and DirectML;
- Apple Metal;
- DNNL or OpenBLAS/BLAS CPU paths;
- experimental SYCL where built.

Backend selection materially changes compatibility, memory use, batching behavior, and performance.
The documented defaults also show that Lc0 is designed around resources rather than a tiny fixed
worker: two search threads, a 200,000-entry neural cache, minibatch 256, and maximum prefetch 32 are
defaults, all configurable. A browser profile would require measured, bounded values rather than
blindly inheriting native defaults.

### Network weights/model

The network is a separate chess model and part of the participant's identity. Lc0 protobuf networks
carry architecture and head metadata and may contain encoded weights or an embedded serialized ONNX
model, but not both. Common weight encodings include `LINEAR16`, `FLOAT16`, and `BFLOAT16`.
Compatibility depends on the network architecture, Lc0 reader/converter, backend, and browser
execution provider.

The official size guidance illustrates the browser cost:

| Network class | Typical compressed/download size | Official GPU-memory guidance |
| --- | ---: | ---: |
| Very small | at most 10 MB | device-dependent |
| Small | 30–40 MB | about 1.6 GB |
| Medium | 140–155 MB | about 1.8 GB |
| Large | 160–190 MB | about 2.4–2.6 GB |
| Very large | 330–380 MB | about 4 GB |

These are upstream classes, not CAISSA browser measurements. Runtime allocations, converted ONNX
data, intermediate tensors, cache, search tree, WASM heap, and GPU buffers add to the transferred
file size. Lowering minibatch is an upstream mitigation for out-of-memory failures, not evidence
that a device will be stable.

## 3. Browser option assessment

| Option | Feasibility and maturity | Performance expectation | Security/hosting impact | Mobile position | Decision |
| --- | --- | --- | --- | --- | --- |
| A. Lc0 WASM + CPU inference | Technically possible. Lc0 search can compile to WASM and ONNX Runtime Web's WASM backend has broad browser coverage. No supported upstream Lc0 browser build exists. | Suitable first for very small/quantized models and bounded nodes. Standard 30–40 MB networks plus search are likely slow and memory-heavy; must measure. SIMD helps. Threads require isolation. | Same-origin runtime/network hosting, WASM CSP permission, integrity checks, worker lifecycle. Multi-threaded WASM requires `SharedArrayBuffer`, COOP, and COEP. | Broad API compatibility does not imply usable speed or memory. Single-thread fallback needs a separate proven build. Treat phones/tablets as unsupported until physical-device results exist. | Experimental only |
| B. Lc0 WASM + WebGPU | The most promising direct-browser inference path. Raw WebGPU is capability-detectable, but ONNX Runtime Web's WebGPU execution provider remains experimental and its documented support matrix is narrower than raw WebGPU availability. | Expected best direct-browser throughput on a capable discrete/integrated GPU. Startup compilation, model upload, GPU memory, thermal throttling, device loss, and operator fallback must be measured. | HTTPS/secure context, CSP and same-origin assets, explicit adapter/device failure handling. WebGPU itself does not require COOP/COEP, but the audited pthread search build does. | Android support is device/browser-specific. Safari/iOS and Firefox raw WebGPU progress does not establish ONNX Runtime Web/Lc0 compatibility. Fail closed unless the exact stack passes. | Experimental only |
| C. Lc0 WASM + ONNX Runtime Web | This is the architecture used by both upstream experiments. ORT can select WebGPU then WASM and provides the necessary inference API. WebGPU is experimental; GPU providers support only an operator subset. | WebGPU fast path may be usable; WASM fallback may be materially slower and is not equivalent capability. Conversion time and model/operator compatibility are additional startup gates. | Adds a sizable third-party runtime and WASM workers, CSP and asset-path constraints, supply-chain/version pinning, model validation, cache/integrity work, and possibly COOP/COEP for threads. | ORT's documented WebGPU coverage does not include every Safari/iOS/Firefox combination. A “WASM fallback” label cannot imply acceptable mobile performance without evidence. | Best experimental architecture, not production-ready |
| D. Adapt upstream browser prototype | PR 2432 provides a credible source starting point: worker UCI, real model conversion/inference, `webgpu` then `wasm`, and test scripts. It is closed, unmerged, unreviewed, and not released. | Unknown in CAISSA. Its Node test has a 120-second timeout and uses ORT WASM; that verifies a harness design, not browser responsiveness or match play. | Requires cross-origin isolation because its engine is built with pthreads. Pins Emscripten 3.1.64. Asset-directory layout is coupled. Parent-worker termination notes incomplete pthread shutdown. | Author reported Chrome/Edge/Firefox testing, but there is no authoritative matrix or mobile evidence. | Source for a lab only |
| E. Remote Lc0 service | Technically the most controllable way to offer one certified Lc0/network identity across clients. Native Lc0 backends are mature, and browser constraints disappear. This task does not implement it. | Server hardware can provide predictable inference; network latency and queue time replace local startup/GPU variability. | Requires authenticated API/WSS, per-user/session limits, admission control, queues, engine isolation, egress controls, cleanup, observability, privacy policy, and DoS/abuse defenses. GPU capacity and idle/peak utilization create continuing cost. | Most consistent client coverage, but mobile networks add latency/disconnection risk. | Production fallback if direct-browser lab fails or broad support is required |

### Browser-support interpretation

Capability detection must test the complete stack, not user-agent strings:

1. secure context;
2. `navigator.gpu` presence;
3. successful adapter and device creation;
4. exact ONNX execution-provider/session creation;
5. exact network load and a known inference;
6. Lc0 UCI identity, readiness, and a legal move;
7. cleanup after normal stop, device loss, OOM, navigation, and failure.

Chrome/Edge desktop are the sensible first laboratory target. The official ONNX Runtime Web matrix
documents WebGPU for Chrome/Edge on Windows and macOS and for Chrome/Edge on Android, while marking
the provider experimental. Firefox and Safari have shipped or previewed raw WebGPU on more platforms,
but raw API availability is not proof that the current ORT model/operator stack works. iOS also
inherits WebKit constraints regardless of the browser brand. No browser should receive a fake CPU
fallback label when only WebGPU has met the operational gate.

## 4. Network delivery, cache, and provenance

### Candidate delivery model

The preferred experimental shape is a separately fetched, immutable network rather than bundling
weights into the application shell:

- keep initial CAISSA navigation and current engines unchanged;
- load only after the user enters an explicitly experimental laboratory and passes capability checks;
- serve an immutable URL containing a version/hash, with explicit byte length and MIME type;
- stream/fetch with cancellation and verify SHA-256 before creating a session;
- cache the verified response through Cache Storage or IndexedDB under a schema/version key;
- revalidate metadata and integrity before reuse;
- provide a deliberate cache-eviction path and handle quota failure truthfully.

Browser cacheability is technically straightforward, but quota, private browsing, eviction, partial
downloads, and duplicate in-memory copies make it non-guaranteed. A service worker or CDN response
must preserve the headers needed by the chosen isolation policy. Mobile bandwidth messaging must
show exact bytes before download.

### Required immutable provenance record

A future CAISSA network record must contain, at minimum:

```text
networkId
sourceUrl
trainingLineage (when published)
license and redistribution basis
sha256
compressedBytes and servedBytes
format/encoding
network architecture and heads
compatible Lc0 versions/commit
compatible conversion path and inference backend
```

The official training portal is an authoritative source for network/run identifiers and architecture
metadata, but a candidate still needs a separately verified redistribution license, exact downloaded
bytes, and hash. The protobuf schema having a `license` field does not prove that every downloadable
network has a clear or identical license. No network was selected or downloaded during EAE-007.

## 5. CAISSA provider-model fit

The current registry already represents most cross-engine facts: provider/family/version/license,
UCI protocol, runtime/execution, worker/WASM paths, profile, options, availability, identity
expectation, capabilities, and resource metadata including bytes, threads, isolation, mobile support,
and estimated weight class.

Do not add a broad set of speculative flat fields. The smallest justified future extension is:

```js
{
  engineClass: 'neural',
  neural: {
    inferenceBackend: 'onnx-web-webgpu',
    network: {
      id: '...',
      source: '...',
      sha256: '...',
      bytes: 0,
      format: 'lc0-protobuf',
      license: '...'
    }
  }
}
```

Existing `capabilities.requiresCrossOriginIsolation`, `capabilities.mobileCompatible`, and
`resource.estimatedWeightClass` should continue to carry those concerns. `gpuRequired` or
`webGpuRecommended` should be added only if policy code will enforce the distinction; availability
must instead expose the exact failed capability.

A validated runtime identity must become the immutable tuple:

```text
provider ID
requested engine ID
Lc0 source version/commit
UCI-reported name and author
inference backend actually selected
network ID and verified SHA-256
runtime instance ID
```

“Lc0 0.32.1” alone is not a complete participant identity.

## 6. Runtime Manager implications

Lc0 can conceptually retain the current `white`, `black`, and `evaluator` ownership model and the
`acquire → initialize → validate → ready → think → stop → reuse → terminate` lifecycle. The present
manager's fail-closed identity checks, generation guards, replacement-before-construction, and final
termination are the correct foundation. Production support would nevertheless require these
extensions without weakening Stockfish behavior:

- staged asynchronous initialization diagnostics: runtime fetch, network fetch, integrity check,
  WASM compile, backend/device creation, model conversion/session creation, UCI, and ready;
- an `AbortSignal`/generation-owned cancellation path that aborts fetches and session/device creation,
  not merely ignores a late result;
- separate timeouts and truthful error codes for network, compile, backend, UCI, and ready stages;
- provider-specific identity validation that includes the selected backend and verified network hash;
- explicit handling for WebGPU adapter denial, device loss, out-of-memory, ORT session failure, and
  incompatible operators, all of which make the provider unavailable rather than trigger relabeling;
- idempotent destruction of search, ORT session, GPU buffers, network/model buffers, parent worker,
  and every pthread worker on replacement, section exit, tab close, and failure;
- an enforceable heavy-runtime lease/budget rather than assuming all three roles can coexist.

Three Lc0 instances (`white`, `black`, and `evaluator`) must not be inferred safe merely because the
role model permits them. Until measurements prove otherwise, a desktop experiment should permit at
most one Lc0 heavy runtime and should keep the evaluator on an existing certified provider. Mobile
should report Lc0 unavailable/experimental, not silently create a smaller or different identity.

## 7. CAISSA security and hosting audit

Current production configuration sends `Cross-Origin-Opener-Policy: same-origin-allow-popups` and
does not send `Cross-Origin-Embedder-Policy`. Therefore CAISSA is not cross-origin isolated and the
audited pthread prototype cannot start. Its own deployment instructions require:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

That is a major product/security decision. `COOP: same-origin` changes browsing-context relationships
and can conflict with authentication or payment popup flows. COEP also requires every embedded
cross-origin resource to satisfy CORS/CORP. Cross-origin isolation is fixed by the top-level navigation,
so entering Arena through a client-side route cannot enable it after the page loads.

CAISSA's general CSP allows same-origin/blob workers but does not currently grant
`'wasm-unsafe-eval'` on the main application response. A narrow existing engine-asset route does have
a WASM-specific policy; that does not automatically authorize a future Lc0 route, ORT workers, or
network fetch. Any future design must inventory the generated files and establish the minimum
route-specific `script-src`, `worker-src`, and `connect-src` policy. It must not loosen CSP site-wide
by default.

A separate experimental origin is safer than changing the main application headers: it can be fully
isolated, host immutable same-origin runtime/model assets, avoid popup dependencies, and communicate
only through a deliberately designed boundary. Even that arrangement requires threat review of model
parsing, decompression/conversion bombs, untrusted URLs, GPU denial of service, cache poisoning,
dependency integrity, worker escape assumptions, and cleanup.

No COOP, COEP, or CSP setting was changed in this task.

## 8. Isolated successor-source audit

To determine whether a credible implementation existed, EAE-007 cloned the PR 2432 successor branch
to a temporary directory outside the CAISSA repository. Exact audited head:

```text
repository: https://github.com/jalpp/lc0.js.git
branch: lc0js
commit: 482bb4a830287b726ebe7d42f14ab7f5f17c18a0
```

Observed directly in source:

- `worker.js` imports `onnxruntime-web/all`, creates an inference session with ordered providers
  `['webgpu', 'wasm']`, accepts Lc0 `.pb`/`.pb.gz` bytes, and provides policy/value/WDL/MLH outputs to
  the C++ search bridge.
- `main.js` supplies string UCI input/output through a module worker.
- The build uses Emscripten, SIMD, Asyncify, memory growth, and web/worker/node output. Meson links the
  threads dependency; the README states the resulting engine is a pthread build with shared memory.
- Browser deployment requires `SharedArrayBuffer`, COOP `same-origin`, COEP `require-corp`, a hard
  top-level navigation, and a fixed relative asset tree for the engine, WASM, and pthread bootstraps.
- The README pins Emscripten 3.1.64 because newer versions reportedly produced unsupported WASI imports
  in Chrome and Firefox. That pin is a reproducibility and maintenance risk.
- The Node test drives `uci`, `isready`, `position startpos`, and bounded `go nodes` using ORT WASM,
  but a successful Node run would not certify browser WebGPU, isolation, responsiveness, or cleanup.
- `finish()` terminates the parent worker, while a source comment says it should instead send a message
  so the engine can also end its pthread workers. That is insufficient for CAISSA's zero-orphan gate.

No build was attempted: Emscripten, Meson, and Ninja are not installed in the audit environment; no
authoritative prebuilt artifact exists; and a lawful, compatible, fully provenanced test network was
not identified. More importantly, running the browser build would require the security-header change
that this task expressly forbids. No runtime, model, binary, or fork entered the CAISSA worktree.

This source audit is not an EAE-008 execution prototype. Consequently the conditional
`CAISSA_ENGINE_ARENA_EAE008_LC0_BROWSER_SPIKE.md` deliverable was not created, and no startup timing,
UCI identity, bestmove, or cleanup result is claimed.

## 9. Operational acceptance gates for a future lab

Do not set arbitrary pass numbers before measurement. Capture distributions and failure modes on each
supported device class, then establish budgets from evidence. A future laboratory must record:

- exact source/toolchain/dependency commits and reproducible artifact SHA-256/bytes;
- exact network provenance, compatibility, SHA-256, and bytes;
- cold and warm runtime fetch, network fetch, compile, conversion, session, `uciok`, and `readyok` time;
- backend actually selected and truthful UCI identity;
- repeated legal `bestmove` responses under a small controlled nodes limit, plus `stop` behavior;
- main-thread responsiveness/long tasks while starting and thinking;
- WASM heap, JS heap where observable, GPU allocation/failure signals, cache quota, and network copies;
- normal cleanup, replacement cleanup, rapid start/stop, navigation cleanup, device loss, OOM, fetch
  cancellation, malformed network, operator incompatibility, and reload/cache recovery;
- final zero live parent workers, pthread workers, manager records, sessions, devices, and runtime IDs;
- separate desktop Chrome/Edge measurements and separate physical Android, iPadOS, and iOS results;
- Safari and Firefox qualification only after the exact ORT/network stack passes there.

A one-move success remains a prototype result, not production readiness or a chess-strength claim.

## 10. Remote-compute alternative

If CAISSA requires Lc0 for a broad audience before the browser stack matures, the honest architecture
is:

```text
Browser → authenticated CAISSA API/WSS → admission/queue → isolated native Lc0 session → result
```

The server would pin both Lc0 and network identity, enforce bounded search, and return attributable
UCI/events. Its risk model must include GPU acquisition and idle cost, capacity planning, concurrent
white/black/evaluator demand, queue deadlines, per-user and per-IP limits, authentication, replay and
abuse controls, DoS protection, process/container isolation, outbound-network denial, crash and idle
cleanup, telemetry/redaction, regional latency, disconnect semantics, privacy/retention, and provider
lock-in. This is operationally heavier than browser compute and was not implemented.

Remote compute should become the recommendation if either (a) the laboratory cannot meet direct-browser
cleanup and responsiveness gates, or (b) product requirements demand dependable Safari/iOS/mobile
coverage. It is not necessary to declare direct-browser research impossible today.

## 11. Recommended architecture and next task

Do not register or advertise Lc0 in Match or Tournament. Preserve all current Stockfish providers and
the Generation Cup baseline.

Recommended next task: **EAE-008 — isolated Lc0 browser laboratory**, only after approving the
security boundary and a network provenance packet. Use a dedicated cross-origin-isolated origin,
Chrome/Edge desktop as the first target, exact PR 2432 successor commit or a reviewed upstream
replacement, a reproducible pinned build, and one genuinely small compatible network with explicit
redistribution rights. Implement only the nine-step harness (initialize, load, UCI, ready, position,
bounded go, legal bestmove, stop, full terminate) and the failure/cleanup matrix above. Do not touch
the production registry or Arena UI.

If that laboratory cannot prove full pthread/session/device cleanup, truthful backend selection, and
stable repeated legal play, stop direct-browser work and evaluate a costed remote-compute decision
packet.

## 12. Current Arena QA and change inventory

The existing Arena was rerun from this branch after the research document was added:

- `node --test tests/arena-engine-provider.test.js tests/arena-runtime-manager.test.js` — 27 passed,
  0 failed. This covers registry contracts, UCI/runtime identity, fail-closed generation mismatch,
  Runtime Manager ownership/reuse/replacement, stale initialization, and bounded cleanup.
- `npx playwright test tests/browser/arena-generation-cup.spec.js --project=chromium` — 5 passed,
  0 failed in 41.1 seconds when served from this worktree on an isolated port. This covers all six
  Generation Cup pairings, truthful identity and worker budgets, portrait/landscape transitions,
  automatic draw and stop behavior, and injected Stockfish 19 startup failure cleanup.

An initial browser invocation was invalid because the shared Playwright configuration reused an
unrelated server already listening on port 8000; its rendered registry visibly lacked Stockfish 18
and 19. That invocation was stopped and is not counted as product evidence. The clean isolated-port
rerun above is the applicable result.

No engine JavaScript, WASM, NNUE, Lc0 runtime, ONNX runtime, network weights, registry entry, Runtime
Manager code, UI, CSP, COOP, or COEP configuration changed. The only repository deliverable is this
architecture document.

## Sources

Primary and authoritative sources, accessed 2026-09-20:

- [Official Lc0 releases](https://github.com/LeelaChessZero/lc0/releases)
- [Official Lc0 download guidance](https://draft.lczero.org/play/download/)
- [Official Lc0 repository and build/backend documentation](https://github.com/LeelaChessZero/lc0)
- [Official 2026 project list: JS/WASM backend](https://draft.lczero.org/contribute/gsoc/2026/)
- [Official Lc0 options](https://draft.lczero.org/dev/wiki/lc0-options/)
- [Official Lc0 network-size guidance](https://lczero.org/dev/wiki/networks/)
- [Official Lc0 training network portal](https://training.lczero.org/networks/1)
- [Official `net.proto` schema](https://github.com/LeelaChessZero/lc0-common/blob/master/proto/net.proto)
- [Official Lc0 weight-format tool documentation](https://github.com/LeelaChessZero/lc0-training/blob/master/docs/weights_tool.md)
- [Lc0 PR 2072: simple JS backend](https://github.com/LeelaChessZero/lc0/pull/2072)
- [Lc0 PR 2432: `lc0.js` successor](https://github.com/LeelaChessZero/lc0/pull/2432)
- [ONNX Runtime Web JavaScript documentation and support matrix](https://onnxruntime.ai/docs/get-started/with-javascript/web.html)
- [ONNX Runtime WebGPU documentation](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html)
- [ONNX Runtime Web environment flags and thread/isolation requirements](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html)
- [ONNX Runtime Web build variants](https://onnxruntime.ai/docs/build/web.html)
- [ONNX Runtime Web performance diagnosis](https://onnxruntime.ai/docs/tutorials/web/performance-diagnosis.html)
- [Chrome WebGPU platform overview](https://developer.chrome.com/docs/web-platform/webgpu/overview)
- [MDN WebGPU secure-context and availability reference](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)
- [MDN SharedArrayBuffer security requirements](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)
