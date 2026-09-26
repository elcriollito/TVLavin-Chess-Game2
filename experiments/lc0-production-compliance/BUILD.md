# Reproduce the certified Lc0 browser appliance

## Supported host

The certified build used 64-bit Windows, PowerShell, Git, Node.js/npm, Python,
and the Emscripten SDK. Network access is required only to obtain the pinned
public toolchain packages and the separately distributed Maia network.

Pinned inputs:

- Lc0 `v0.33.0-dev+git.482bb4a`, commit
  `482bb4a830287b726ebe7d42f14ab7f5f17c18a0`
- Emscripten `3.1.64`
- Meson `1.8.3`
- Ninja `1.11.1.4`
- esbuild `0.28.1`
- ONNX Runtime Web `1.27.0`
- `SOURCE_DATE_EPOCH=1789992000`

## Reconstruct from this archive

Extract the archive into an empty directory. The complete pinned source is in
`source/`; no original developer worktree is required. Verify all entries in
`manifest.json`, then apply the patches from the extracted directory in this
exact order:

```powershell
$source = (Resolve-Path .\source).Path
git -C $source init
git -c core.autocrlf=false -C $source add --force --all
git -C $source update-index --chmod=+x -- build.sh install_openSUSE_lc0.sh `
  js/build.sh scripts/bumpversion.py scripts/compile_proto.py `
  scripts/gen_py_bindings.py src/neural/backends/dx/shaders/dxc_helper.py
git -C $source -c user.name=archive -c user.email=archive.invalid commit -m baseline
git -C $source apply --check ..\patches\0001-browser-stop-signal.patch
git -C $source apply ..\patches\0001-browser-stop-signal.patch
git -C $source apply --check ..\patches\0002-cooperative-exit.patch
git -C $source apply ..\patches\0002-cooperative-exit.patch
git -C $source apply --check ..\patches\0003-opt-in-native-uci-trace.patch
git -C $source apply ..\patches\0003-opt-in-native-uci-trace.patch
```

`source-git-tree.json` records the original mode and Git object ID for every
source member. After staging the extracted files and restoring the seven
executable modes above, `git write-tree` must equal
`45e2b5939f7794f6a4e478ed81fed5fd869a91fd`. The archive builder disables
`core.autocrlf` while exporting the snapshot so its bytes equal the pinned Git
objects on Windows as well as Unix.

The package also carries the build driver, bundler, verifier, lockfile, runtime
manifest template, worker source, and relay client source under
`caissa-build/`. Place those files at their documented CAISSA paths, or run the
equivalent commands from a clean checkout of the certified CAISSA commit.
`stage-production-inputs.ps1` performs the required lab-to-appliance copy and
verifies every source and destination byte against the compliance manifest; no
undocumented manual file copy is required.

The CAISSA-owned adapter delta is recorded separately at
`caissa-client-patches/0001-tc1r1-stop-bestmove-idempotency.patch`. The
archive's `reference-runtime/` directory contains the exact tc1r1 generated
client and manifest used for byte-for-byte comparison.

## Build commands

From `experiments/lc0-browser-lab` in the reconstructed CAISSA layout:

```powershell
$work = Join-Path $env:TEMP 'caissa-lc0-eae015a-repro'
.\scripts\build-runtime.ps1 -WorkRoot $work -ProvisionToolchain
$packageRoot = (Resolve-Path ..\..\..).Path
& "$packageRoot\packaging\stage-production-inputs.ps1" `
  -LabArtifacts (Resolve-Path .\.artifacts).Path `
  -EngineArtifacts (Join-Path $packageRoot 'caissa-build\experiments\lc0-preview-relay\engine\artifacts') `
  -ManifestPath (Join-Path $packageRoot 'corresponding-source.json') `
  -CaissaBuildRoot (Join-Path $packageRoot 'caissa-build')
$env:EAE015A_RELAY_ORIGIN = 'https://eae017-relay-elcriollitos-projects.vercel.app'
$env:EAE015A_MAIN_ORIGIN = 'https://eae017-main-elcriollitos-projects.vercel.app'
node .\scripts\build-production-appliance.mjs
node .\scripts\verify-production-appliance.mjs
```

For a clean rebuild that reuses an already provisioned copy of these exact
tool versions, pass `-ToolchainRoot` and `-PythonEnvironmentRoot`. Do not use a
directory junction for the Emscripten SDK on Windows: Emscripten's system
library cache canonicalizes the physical path, and a junction alias can make
its generated relative libc paths invalid. The default provisioning behavior
and generated runtime are unchanged by these optional path parameters.

`build-runtime.ps1` generates the Meson cross-file with
`System.Text.UTF8Encoding($false)`. This BOM-free UTF-8 encoding is mandatory:
a UTF-8 BOM caused Meson to reject the first section header. The script pins
`SOURCE_DATE_EPOCH` because Lc0 embeds its compile date. The appliance bundler
sets esbuild `absWorkingDir` to the CAISSA repository root because esbuild's
source comments otherwise vary with the build directory. It also pins
esbuild's `nodePaths` to the lab's lockfile-installed `node_modules`, avoiding
an undocumented dependency on a developer checkout's root dependencies. The
staging step also reproduces the certified resolution graph by placing the
pinned `chess.js@1.4.0` package at the reconstructed CAISSA root. The certified
client contains separate root and lab module instances; deduplicating them is
functional but not byte-identical.

The expected output is the eight files listed under `runtimeArtifacts` in
`corresponding-source.json`. Generate `release-manifest.json` with
`build-production-appliance.mjs`; its certified SHA-256 is
`9980a755a44b3d704f70505a803b6dd112c97a39853260bc648499b5bed4fd45`.
The generated `client.js` must be 212,443 bytes with SHA-256
`61555ff04e76ea804940f728552188905e9e544f3109368ca2878ca26b0f8809`.
The verifier must report 8 artifacts, 24,793,636 total artifact bytes, and a
successful tamper self-test. Compare every byte count and SHA-256 against the
published manifest; do not silently accept a merely functional rebuild.
