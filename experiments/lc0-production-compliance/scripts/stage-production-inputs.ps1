[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$LabArtifacts,
  [Parameter(Mandatory = $true)]
  [string]$EngineArtifacts,
  [Parameter(Mandatory = $true)]
  [string]$ManifestPath,
  [Parameter(Mandatory = $true)]
  [string]$CaissaBuildRoot
)

$ErrorActionPreference = 'Stop'
$sourceRoot = (Resolve-Path -LiteralPath $LabArtifacts).Path
[System.IO.Directory]::CreateDirectory($EngineArtifacts) | Out-Null
$targetRoot = (Resolve-Path -LiteralPath $EngineArtifacts).Path
$manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
$expected = @{}
foreach ($artifact in $manifest.runtimeArtifacts) {
  $expected[$artifact.filename] = $artifact
}

$files = @(
  @{ Source = 'runtime\lc0.js'; Target = 'runtime\lc0.js' },
  @{ Source = 'runtime\lc0.wasm'; Target = 'runtime\lc0.wasm' },
  @{ Source = 'runtime\lc0.worker.mjs'; Target = 'runtime\lc0.worker.mjs' },
  @{ Source = 'ort\ort-wasm-simd-threaded.mjs'; Target = 'ort\ort-wasm-simd-threaded.mjs' },
  @{ Source = 'ort\ort-wasm-simd-threaded.wasm'; Target = 'ort\ort-wasm-simd-threaded.wasm' },
  @{ Source = 'network\maia-1100.pb.gz'; Target = 'network\maia-1100.pb.gz' }
)

foreach ($file in $files) {
  $source = Join-Path $sourceRoot $file.Source
  $target = Join-Path $targetRoot $file.Target
  $name = Split-Path $source -Leaf
  $record = $expected[$name]
  if (-not $record) { throw "Missing manifest record for $name" }
  $sourceItem = Get-Item -LiteralPath $source
  $sourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $source).Hash.ToLowerInvariant()
  if ($sourceItem.Length -ne $record.bytes -or $sourceHash -ne $record.sha256) {
    throw "Source integrity mismatch for $name"
  }
  [System.IO.Directory]::CreateDirectory((Split-Path $target -Parent)) | Out-Null
  Copy-Item -LiteralPath $source -Destination $target -Force
  $targetItem = Get-Item -LiteralPath $target
  $targetHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash.ToLowerInvariant()
  if ($targetItem.Length -ne $record.bytes -or $targetHash -ne $record.sha256) {
    throw "Staged integrity mismatch for $name"
  }
}

$labRoot = Split-Path $sourceRoot -Parent
$chessSource = Join-Path $labRoot 'node_modules\chess.js'
$chessPackage = Get-Content -Raw -LiteralPath (Join-Path $chessSource 'package.json') | ConvertFrom-Json
if ($chessPackage.version -ne '1.4.0') { throw 'Expected chess.js 1.4.0.' }
[System.IO.Directory]::CreateDirectory((Join-Path $CaissaBuildRoot 'node_modules')) | Out-Null
$chessTarget = Join-Path $CaissaBuildRoot 'node_modules\chess.js'
Copy-Item -LiteralPath $chessSource -Destination $chessTarget -Recurse -Force
$sourceModule = Join-Path $chessSource 'dist\esm\chess.js'
$targetModule = Join-Path $chessTarget 'dist\esm\chess.js'
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $sourceModule).Hash -ne
    (Get-FileHash -Algorithm SHA256 -LiteralPath $targetModule).Hash) {
  throw 'Root chess.js staging integrity mismatch.'
}

Write-Output "Staged and verified $($files.Count) certified appliance inputs and chess.js 1.4.0."
