# CAISSA Engine Arena EAE-008 - Isolated Lc0 Browser Lab

Date: 2026-09-20

Authoritative baseline: `98b027ae3f09876007b94b9d1983cc00c8774781`

Boundary: isolated browser experiment only. No production provider, selector, navigation, global
header, authentication, payment, merge, or deployment change is part of this checkpoint.

## Executive result

The pinned prototype loads a real Lc0 WebAssembly runtime, verifies and loads a small Maia neural
network, completes `uci` and `isready`, and returns independently validated legal moves. Twenty
evolving-position searches passed. Ten ordinary initialize/search/terminate cycles each
acknowledged cleanup with zero wrapper-reported workers and returned Chromium's worker target count
to its baseline.

The required stop/restart gate failed. While `go infinite` is active, the worker event loop does not
consume the posted `stop` command. It therefore cannot acknowledge the subsequent cleanup request.
After a three-second cleanup timeout, the wrapper must force-terminate the parent worker; its last
observable state still reports four pthread workers. Chromium subsequently removes the worker
targets, but this is forced browser cleanup rather than a clean Lc0 stop and resource release.

**Verdict: `LC0_LAB_FAILED`**

The result is useful feasibility evidence, but the runtime does not satisfy the EAE-008 lifecycle
contract and must not be registered in production Arena.

## Source and build

| Item | Pinned value |
| --- | --- |
| Browser prototype repository | `https://github.com/jalpp/lc0.js.git` |
| Prototype/upstream-related PR | `LeelaChessZero/lc0#2432` |
| Source commit | `482bb4a830287b726ebe7d42f14ab7f5f17c18a0` |
| Runtime UCI version | `Lc0 v0.33.0-dev+git.482bb4a` |
| Runtime author | `The LCZero Authors.` |
| Source license | GPL-3.0-or-later |
| Emscripten | 3.1.64 |
| Meson | 1.8.3 |
| Ninja | 1.11.1.4 |
| esbuild | 0.28.1 |
| ONNX Runtime Web | 1.27.0 |

The source state was rechecked before the build. Commit `482bb4a...` remains the head of the
directly associated `jalpp/lc0.js` experimental branch and the head recorded for PR 2432. The PR is
closed and unmerged. The earlier PR 2072 also remains unmerged. No opaque prebuilt Lc0 binary was
used.

The reproducible Windows build entry point is
`experiments/lc0-browser-lab/scripts/build-runtime.ps1`. It creates a detached clean checkout in a
temporary work root, provisions the pinned toolchain, builds there, verifies/stages local artifacts,
and bundles the lab. Generated runtime, network, dependency, and test-output directories are
ignored by Git.

Relevant C++ and linker configuration:

- release, static build; BLAS and GoogleTest disabled;
- Emscripten pthread dependency inherited from the pinned prototype;
- `-msimd128`, `-fexceptions`, and Emscripten zlib port;
- Asyncify enabled with a 65,536-byte Asyncify stack;
- 1,048,576-byte stack and memory growth enabled;
- modular ES module output with Web/worker/Node environments;
- BigInt WebAssembly integration and `FS` exported;
- Lc0 `--backend=js`, `--threads=1`, `--minibatch-size=1`, and `--nncache=2000`;
- ONNX Runtime Web execution providers restricted to `wasm`, with one ORT thread;
- no WebGPU path.

Emscripten warns that pthreads combined with memory growth can make non-WASM code slow. That warning
is retained as a prototype limitation.

## Network

| Item | Value |
| --- | --- |
| Identity | CSSLab Maia 1100 v1.0 |
| Repository | `https://github.com/CSSLab/maia-chess` |
| Source tag/commit | v1.0 / `37de81e2bef89336e03266b3b5f7e1155ba68f5d` |
| Asset | `maia-1100.pb.gz` |
| Source URL | `https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-1100.pb.gz` |
| License | GPL-3.0 |
| Format | Lc0 protobuf gzip |
| Size | 1,313,193 bytes |
| SHA-256 | `e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4` |
| Search setting | `go nodes 1` for bounded functional tests |

The Maia repository publishes the weights, identifies the project as GPL-licensed, and recommends
one-node Lc0 searches for Maia-style play. The lab checks both exact byte count and SHA-256 before it
creates the runtime worker. A mismatch fails closed.

## Artifact manifest

These generated files are local test inputs and are not committed. The staging script verifies them
and writes an actual local manifest.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `lc0.js` | 254,746 | `b07dc929d686d0d3b2485038367857df63cf6d8dfb25c2fc53972c3fa2c70c6b` |
| `lc0.wasm` | 9,369,488 | `9c8bc3da3b5100d93c5d1a7d357d6a5520971785126684c5a0d3ad337b3b7485` |
| `lc0.worker.mjs` | 299 | `7e6dad4bca61807357acfcb3789c781deaca3e20214ccd76dd82ddcb0be0a153` |
| `ort-wasm-simd-threaded.wasm` | 13,479,978 | `d1ab1b94b16a65b29d710d0b587b29e7bed336827577623913479b8afe8113e6` |
| `ort-wasm-simd-threaded.mjs` | 24,180 | `0a1e718d99c41b22c21f2520ff4f9e883a6b5533856e398d21816ee8eb8185d3` |
| `maia-1100.pb.gz` | 1,313,193 | `e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4` |

## Environment

Certification ran headlessly with Playwright 1.62.0 and Chrome for Testing 153.0.8010.12 on
Windows 11 Pro 10.0.26200. The dedicated local server used `127.0.0.1:8789` and returned:

- `Cross-Origin-Opener-Policy: same-origin`;
- `Cross-Origin-Embedder-Policy: require-corp`;
- `Cross-Origin-Resource-Policy: same-origin`;
- a lab-only restrictive Content Security Policy.

Observed capability checks:

| Capability | Result |
| --- | --- |
| Secure context | true |
| `crossOriginIsolated` | true |
| `SharedArrayBuffer` | available |
| WebAssembly | available |
| Atomics/pthread prerequisite | available |
| Pinned SIMD/pthread module validation | passed |
| Pinned module compilation | passed, 37.87 ms representative run |

No production server or middleware header was changed.

## Runtime and timing

The truthful experimental identity is:

`Lc0 v0.33.0-dev+git.482bb4a / 482bb4a830287b726ebe7d42f14ab7f5f17c18a0 / onnxruntime-web-wasm-cpu / CSSLab Maia 1100 v1.0 / e1cf1cd0...e9619c4`

Representative primary-run measurements:

| Measurement | Result |
| --- | ---: |
| Runtime WASM | 9,369,488 bytes |
| Runtime module compile | 37.87 ms |
| Network load and hash | 42.50 ms |
| Lc0 script/runtime load | 40.62 ms |
| `uciok` | 1,435.63 ms |
| `readyok` | 1.25 ms |
| Total worker initialization | 1,477.55 ms |
| First `bestmove` | `e2e4`, 240.84 ms |
| Maximum live workers | 5: one parent plus four pthread workers |

The browser's first initialization includes compilation and worker startup. Later one-node search
latencies varied substantially under the repeated lifecycle run; they are functional observations,
not a strength or performance benchmark.

## Tests

### Functional search

- UCI `id name`, `id author`, options, `uciok`, and `readyok`: passed.
- Start-position bounded search: passed with legal `e2e4`.
- Twenty evolving deterministic legal positions: 20/20 passed.
- Independent move validation: `chess.js` 1.4.0 accepted every returned UCI move.
- Lost readiness or fake READY state during the bounded run: none observed.

### Ordinary lifecycle and orphan-worker observation

Ten complete ordinary cycles each performed initialize, ready, bounded search, and terminate.
Every cycle reached a maximum of five workers, acknowledged cleanup, reported zero workers after
termination, and returned the independently observed Chromium worker-target count to its baseline
before the next cycle. No monotonically increasing worker count was observed in this bounded path.

### Stop/restart and active termination

The required `go infinite -> stop -> ready -> go again` sequence failed at `stop`. No stopping
`bestmove` arrived within 2.5 seconds. Because the worker's event loop is occupied by the active
search, the same path cannot process its cooperative termination message. The wrapper waited three
seconds, received no cleanup acknowledgement, force-terminated the parent, and retained the last
observable count of four pthreads. Chromium later returned its externally visible worker count to
baseline, but the engine did not prove orderly search stop, backend release, or pthread cleanup.

This is a hard lifecycle failure, not a timing warning. Restart was not attempted after the failed
stop because the runtime never returned to READY.

### Failure injection

| Case | Result |
| --- | --- |
| Wrong network hash | Failed closed before worker creation |
| Missing network | Failed closed on HTTP 404 |
| Runtime initialization failure | Failed; no fake READY |
| UCI timeout | Timed out; cleanup acknowledged |
| Ready timeout | Timed out; cleanup acknowledged |
| Worker crash | Crash observed; parent force-terminated |
| Terminate during initialization | Ended TERMINATED with zero wrapper workers |
| Ten rapid initialize/terminate sequences | All ended TERMINATED with zero wrapper workers |
| Stop during active search | Failed; no response and no cooperative cleanup acknowledgement |

After the failure-injection suite settled, Chromium's externally observed matching worker targets
returned to baseline. This does not cure the active-search cleanup failure described above.

## Security and isolation

The lab serves only pinned local artifacts, accepts only GET/HEAD, contains no upload or arbitrary
engine path, and uses a restrictive lab-only CSP. It does not provide remote compute, authentication,
billing, a local bridge, or user-provided executable support. Its build, runtime, network,
dependencies, and browser output are kept below `experiments/lc0-browser-lab/`; generated large
artifacts are ignored.

Contract tests verify that Lc0 is absent from `EngineRegistry.listArenaProviders()`, production
navigation, and production headers. Stockfish provider/runtime source files are unchanged.

## Resource-observation limits

Worker targets and wrapper counts are observable. Exact WebAssembly heap reclamation, browser
process memory, native pthread memory, and ONNX Runtime internal allocation release are not exposed
reliably enough here to report exact figures. No GPU path exists in this lab. Mobile browsers and
physical devices were not certified. The Windows/Chromium result must not be generalized to Safari,
Firefox, mobile, or low-memory devices.

## Current Arena regression boundary

The focused production checks cover the provider registry, Runtime Manager, and Generation Cup.
They verify the existing Stockfish 2019 MV, Stockfish 2019 MV Lite profile, Stockfish 18 Lite, and
Stockfish 19 Lite identities and lifecycle behavior. EAE-008 adds no Lc0 production provider and
changes no production headers.

- Provider registry, Runtime Manager, and Generation Cup unit suite: 33/33 passed.
- Generation Cup Chromium suite, served from this worktree on a dedicated local port: 5/5 passed.
- Isolated lab contract suite: 4/4 passed.
- Isolated lab Chromium diagnostic suite: 4/4 passed. The suite passes by asserting the observed
  stop/cleanup failure as a required diagnostic outcome; it does not certify that gate as working.

## Recommendation

Do not begin production integration or EAE-009. If Alexander elects to continue, the next task
should be a narrowly scoped EAE-008A runtime-remediation spike against the pinned prototype (or a
newer credible upstream revision) whose first gate is asynchronous UCI input during active search,
followed by cooperative stop, backend release, pthread cleanup acknowledgement, and the same
ten-cycle external worker-target test. If that architectural defect cannot be fixed upstream or in
a small auditable patch, stop the browser Lc0 track.
