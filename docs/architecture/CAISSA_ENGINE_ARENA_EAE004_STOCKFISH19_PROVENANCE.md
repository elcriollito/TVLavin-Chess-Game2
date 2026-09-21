# CAISSA Engine Arena EAE-004 — Stockfish 19 Provenance

Audit baseline: `6c9dc36737b4d377585d8119efc0c6b5fc5efc67`

This record was created before Stockfish 19 assets were added to CAISSA. The repository-wide audit
found no existing Stockfish 19 provider, worker, WASM, package dependency, fixture, cached vendor
manifest, license, or notice. The existing versioned browser runtime ended at Stockfish 18 Lite.

## Selected source chain

| Layer | Exact source |
| --- | --- |
| Official engine | `official-stockfish/Stockfish` release `sf_19`, commit `edb0d9db6731067ec50ce619ff372b463bc4dd5d` |
| Browser/WASM port | `nmrugg/stockfish.js` release `v19.0.0`, tag commit `9cb3e5066d48f1a35d792afeda36eff37ae60570` |
| Published package | npm `stockfish@19.0.0`, package git head `54fde71d90c7c403964f6cacef48f7bbec495df1` |
| Package tarball | `https://registry.npmjs.org/stockfish/-/stockfish-19.0.0.tgz` |
| npm integrity | `sha512-jDyYLbqNpboQcMs5HodTHI2CrKL74zkQWb1+sgoNXw5HI6avTblW4G0X7afFt3BBOc6VbTSkOV64EUxm/DWSpg==` |
| Tarball SHA-256 | `b1579b00ca456768c637bd5e5313830fb535ade04e87a5da53182c0a5eb6e05d` |
| License | GNU GPL version 3 (`Copying.txt`) |

The npm files and the direct GitHub `v19.0.0` release assets were downloaded independently to a
temporary audit directory and were byte-identical. CAISSA vendors only the selected runtime pair,
the package license, and a local provenance manifest; the 161 MB package tarball and unused Full,
threaded, and ASM builds are not added.

## Selected browser profile

The selected profile is the upstream-recommended **Lite single-threaded** browser build:

| Property | Audited value |
| --- | --- |
| Worker artifact | `stockfish-19-lite-single.js` |
| Worker bytes / SHA-256 | 21,415 / `d3344124ab067fb0b90ee77873bb8e9fbf5fc01bc525fe714b0f942581e889e6` |
| WASM artifact | `stockfish-19-lite-single.wasm` |
| WASM bytes / SHA-256 | 1,787,571 / `57ac2d72312aba346760e3f173f687a8c211208e97a87268436f7f0e10bb5387` |
| License artifact | `Copying.txt` |
| License bytes / SHA-256 | 35,821 / `0b383d5a63da644f628d99c33976ea6487ed89aaa59f0b3257992deac1171e6b` |
| Runtime type | Same-origin Web Worker plus WebAssembly |
| Threads | Single-threaded; UCI reports minimum 1, maximum 1 |
| Hash | UCI default 16 MiB |
| NNUE | Supported; Lite network `nn-61e7af4bb97d.nnue` is embedded in the WASM build |
| Separate network asset | None |
| Cross-origin isolation | Not required by this single-threaded build |
| Expected UCI name | `Stockfish 19 Lite WASM` |
| Expected UCI author | `the Stockfish developers (see AUTHORS file)` |

The direct pre-vendoring probe completed `uci → uciok → isready → readyok` and produced the exact
identity and option bounds above.

## Selection and security decision

The Full single-threaded build is approximately 99 MB, and the threaded builds require a different
cross-origin isolation/CORS posture. They are not appropriate for CAISSA's first Stockfish 19
profile. The 1.79 MB Lite single-threaded WASM build is the smallest truthful production-safe
profile, uses the same trusted browser project as CAISSA Stockfish 18, and requires no CSP, COOP,
COEP, `SharedArrayBuffer`, or global worker-policy change.

Planned versioned destination:

- `/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.js`
- `/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.wasm`
- `/assets/vendor/stockfish/19.0.0/Copying.txt`
- `/assets/vendor/stockfish/19.0.0/provenance.json`

The Arena display name must be **Stockfish 19 Lite**. The provider identity rule must require the
Stockfish 19 major version and Lite WASM profile while allowing legitimate trailing build metadata;
Stockfish 18 Lite and Stockfish 2019 MV must not satisfy it.
