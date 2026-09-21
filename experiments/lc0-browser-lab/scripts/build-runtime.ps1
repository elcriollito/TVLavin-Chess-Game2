[CmdletBinding()]
param(
  [string]$WorkRoot = (Join-Path $env:TEMP 'caissa-lc0-eae008-repro'),
  [switch]$ProvisionToolchain
)

$ErrorActionPreference = 'Stop'
$sourceCommit = '482bb4a830287b726ebe7d42f14ab7f5f17c18a0'
$emscriptenVersion = '3.1.64'
$mesonVersion = '1.8.3'
$ninjaVersion = '1.11.1.4'
$labRoot = Split-Path $PSScriptRoot -Parent
$sourceRoot = Join-Path $WorkRoot 'lc0.js'
$emsdkRoot = Join-Path $WorkRoot 'emsdk'
$venvRoot = Join-Path $WorkRoot 'pyenv'

New-Item -ItemType Directory -Path $WorkRoot -Force | Out-Null
if (!(Test-Path -LiteralPath (Join-Path $sourceRoot '.git'))) {
  & git clone --filter=blob:none https://github.com/jalpp/lc0.js.git $sourceRoot
  if ($LASTEXITCODE) { throw 'Lc0 source clone failed.' }
}
& git -C $sourceRoot fetch origin $sourceCommit
if ($LASTEXITCODE) { throw 'Lc0 source fetch failed.' }
& git -C $sourceRoot checkout --detach $sourceCommit
if ($LASTEXITCODE) { throw 'Lc0 source checkout failed.' }
if (& git -C $sourceRoot status --porcelain) { throw 'Lc0 source checkout is dirty; use a clean work root.' }

if ($ProvisionToolchain -and !(Test-Path -LiteralPath (Join-Path $emsdkRoot '.git'))) {
  & git clone --depth 1 https://github.com/emscripten-core/emsdk.git $emsdkRoot
  if ($LASTEXITCODE) { throw 'emsdk clone failed.' }
}
$emsdkCommand = Join-Path $emsdkRoot 'emsdk.bat'
if (!(Test-Path -LiteralPath $emsdkCommand)) { throw "emsdk not found at $emsdkRoot; rerun with -ProvisionToolchain." }
if ($ProvisionToolchain) {
  & cmd /c "`"$emsdkCommand`" install $emscriptenVersion"
  if ($LASTEXITCODE) { throw 'Emscripten installation failed.' }
}
& cmd /c "`"$emsdkCommand`" activate $emscriptenVersion"
if ($LASTEXITCODE) { throw 'Emscripten activation failed.' }

if (!(Test-Path -LiteralPath (Join-Path $venvRoot 'Scripts\python.exe'))) {
  & python -m venv $venvRoot
}
$venvPython = Join-Path $venvRoot 'Scripts\python.exe'
& $venvPython -m pip install --disable-pip-version-check "meson==$mesonVersion" "ninja==$ninjaVersion"
if ($LASTEXITCODE) { throw 'Meson/Ninja installation failed.' }

$emsdkPython = (Get-ChildItem (Join-Path $emsdkRoot 'python') -Filter python.exe -Recurse | Select-Object -First 1).FullName
$emscriptenRoot = (Resolve-Path (Join-Path $emsdkRoot 'upstream\emscripten')).Path
function Posix([string]$value) { return $value.Replace('\', '/') }
$pythonPath = Posix $emsdkPython
$emRoot = Posix $emscriptenRoot
$crossFile = Join-Path $WorkRoot 'wasm32-emscripten-windows.ini'
$crossFileText = @"
[host_machine]
system = 'emscripten'
cpu_family = 'wasm32'
cpu = 'wasm32'
endian = 'little'

[binaries]
c = ['$pythonPath', '$emRoot/emcc.py']
cpp = ['$pythonPath', '$emRoot/em++.py']
ar = ['$pythonPath', '$emRoot/emar.py']
strip = ['$pythonPath', '$emRoot/emstrip.py']

[built-in options]
cpp_args = ['--use-port=zlib', '-fexceptions', '-msimd128']
cpp_link_args = [
  '--use-port=zlib',
  '-fexceptions',
  '-sASYNCIFY', '-sASYNCIFY_STACK_SIZE=65536',
  '-sSTACK_SIZE=1048576',
  '-sMODULARIZE', '-sEXPORT_ES6',
  '-sDEFAULT_LIBRARY_FUNCS_TO_INCLUDE=`$stringToNewUTF8',
  '-sALLOW_MEMORY_GROWTH',
  '-sWASM_BIGINT',
  '-sENVIRONMENT=web,worker,node',
  '-sEXPORTED_RUNTIME_METHODS=["FS"]'
  ]
"@
Set-Content -LiteralPath $crossFile -Value $crossFileText -Encoding utf8

$meson = Join-Path $venvRoot 'Scripts\meson.exe'
$buildRoot = Join-Path $sourceRoot 'js\build-caissa-eae008'
$setupArgs = @('setup', '--buildtype=release', '-Ddefault_library=static', '--prefer-static', "--cross-file=$crossFile", '-Dblas=false', '-Dgtest=false')
if (Test-Path -LiteralPath (Join-Path $buildRoot 'build.ninja')) { $setupArgs += '--reconfigure' }
$setupArgs += @($buildRoot, $sourceRoot)
& $meson @setupArgs
if ($LASTEXITCODE) { throw 'Meson setup failed.' }
& $meson compile -C $buildRoot lc0
if ($LASTEXITCODE) { throw 'Lc0 browser build failed.' }

Push-Location $labRoot
try {
  & npm install
  if ($LASTEXITCODE) { throw 'Lab dependency installation failed.' }
  & node scripts/prepare-assets.mjs --runtime-dir $buildRoot
  if ($LASTEXITCODE) { throw 'Lab asset preparation failed.' }
  & npm run build
  if ($LASTEXITCODE) { throw 'Lab bundle failed.' }
} finally { Pop-Location }

Write-Output "EAE-008 runtime prepared from $sourceCommit at $buildRoot"
