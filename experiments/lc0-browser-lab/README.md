# CAISSA EAE-008 isolated Lc0 browser lab

This experiment is intentionally separate from the production Engine Arena. It has its own localhost
server, route root, content-security policy, and COOP/COEP headers. Nothing here is registered in the
production engine registry or navigation.

## Reproduce on Windows

From this directory in PowerShell:

```powershell
.\scripts\build-runtime.ps1 -ProvisionToolchain
npm run test:contracts
npm run test:browser
```

The build script clones the pinned `jalpp/lc0.js` commit into a temporary work root, installs and
activates Emscripten 3.1.64, installs Meson 1.8.3 and Ninja 1.11.1.4 in a temporary virtual
environment, builds Lc0, fetches and verifies the pinned Maia network, stages ONNX Runtime Web's
CPU/WASM files, and bundles the lab.

Generated runtime, network, dependency, and test-output directories are ignored by Git. Their exact
local hashes are written to `.artifacts/manifest.actual.json` by `prepare-assets.mjs`.

## Run manually

```powershell
npm run serve
```

Open `http://127.0.0.1:8789`. Do not serve the files through the production CAISSA server: the lab
requires its dedicated `COOP: same-origin` and `COEP: require-corp` response headers.

Only the pinned runtime and pinned network are accepted. There is no upload or arbitrary-engine path.
