# Reproduce the runtime appliance

Run on Windows PowerShell from `experiments/lc0-browser-lab` in a clean clone of
the CAISSA commit that contains this bundle.

```powershell
$work = Join-Path $env:TEMP 'caissa-lc0-eae015a-repro'
.\scripts\build-runtime.ps1 -WorkRoot $work -ProvisionToolchain
$env:EAE015A_RELAY_ORIGIN = 'https://eae015a-lc0-relay-elcriollitos-projects.vercel.app'
$env:EAE015A_MAIN_ORIGIN = 'https://eae015a-main-elcriollitos-projects.vercel.app'
node .\scripts\build-production-appliance.mjs
node .\scripts\verify-production-appliance.mjs
```

The source commit, Emscripten, Meson, Ninja, esbuild, ONNX Runtime Web, and
`SOURCE_DATE_EPOCH=1789992000` are pinned by `build-runtime.ps1`,
`package-lock.json`, and `lab-manifest.json`. The fixed epoch prevents Lc0's
compile-date string from changing the WebAssembly hash. Apply patches in
lexical order. Do not manually edit the cloned Lc0 tree or generated artifacts.

The expected release-manifest SHA-256 is
`492c6749989f429c269725d6d2761d4687c8096ca437f5651189fcfbe4ffbb9f`.
Verification must report 8 artifacts, 24,785,017 total bytes, and a successful
tamper self-test.
