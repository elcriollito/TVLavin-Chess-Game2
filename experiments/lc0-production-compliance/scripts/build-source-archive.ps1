[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$SourceCheckout,
  [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
$sourceCommit = '482bb4a830287b726ebe7d42f14ab7f5f17c18a0'
$certifiedRcCommit = 'daf3404fbfaf9401783875626bb7eed403c0d9c4'
$rc3BaselineCommit = '639d9e391c2e81589091c471964b536af3ea1e1c'
$v011SourceCommit = '91501bdc406783232f03b17d43ef0b2672f64c63'
$rc3ManifestSha256 = '648daa880e131ebe0b83784b68ce63abb50eee571c0328158cc8a94a7f444d3d'
$archiveName = 'caissa-lc0-browser-corresponding-source-v0.1.2.zip'
$fixedTimestamp = [DateTimeOffset]::FromUnixTimeSeconds(1789992000)
$complianceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$repositoryRoot = (Resolve-Path (Join-Path $complianceRoot '..\..')).Path
$sourceRoot = (Resolve-Path -LiteralPath $SourceCheckout).Path

if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path $repositoryRoot '.public-release\lc0-browser-source-v0.1.2'
}
[System.IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null
$outputRoot = (Resolve-Path -LiteralPath $OutputDirectory).Path
$stageRoot = Join-Path $outputRoot '.stage-caissa-lc0-browser-source-v0.1.2'
$archivePath = Join-Path $outputRoot $archiveName
$checksumPath = "$archivePath.sha256"

if ((& git -C $sourceRoot rev-parse HEAD).Trim() -ne $sourceCommit) {
  throw "Source checkout is not pinned to $sourceCommit"
}
if (& git -C $sourceRoot status --porcelain) {
  throw 'Source checkout is dirty.'
}
if (-not $stageRoot.StartsWith($outputRoot, [StringComparison]::OrdinalIgnoreCase) -or
    (Split-Path $stageRoot -Leaf) -ne '.stage-caissa-lc0-browser-source-v0.1.2') {
  throw 'Unsafe staging path.'
}

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

function Copy-BundleFile([string]$Source, [string]$Destination) {
  $parent = Split-Path $Destination -Parent
  [System.IO.Directory]::CreateDirectory($parent) | Out-Null
  $text = [System.IO.File]::ReadAllText($Source)
  Write-Utf8NoBom $Destination ($text.Replace("`r`n", "`n").Replace("`r", "`n"))
}

function Copy-CaissaBuildFile([string]$RelativePath, [string]$Destination) {
  $source = Join-Path $repositoryRoot $RelativePath
  if (Test-Path -LiteralPath $source) {
    Copy-BundleFile $source $Destination
    return
  }
  $content = (& git -C $repositoryRoot show "${v011SourceCommit}:$($RelativePath.Replace('\', '/'))") -join "`n"
  if ($LASTEXITCODE) { throw "Unable to recover pinned v0.1.1 build input: $RelativePath" }
  $parent = Split-Path $Destination -Parent
  [System.IO.Directory]::CreateDirectory($parent) | Out-Null
  Write-Utf8NoBom $Destination ($content + "`n")
}

if (Test-Path -LiteralPath $stageRoot) {
  Remove-Item -LiteralPath $stageRoot -Recurse -Force
}
[System.IO.Directory]::CreateDirectory($stageRoot) | Out-Null

try {
  $sourceStage = Join-Path $stageRoot 'source'
  [System.IO.Directory]::CreateDirectory($sourceStage) | Out-Null
  $sourceTar = Join-Path $outputRoot '.lc0-source-snapshot.tar'
  & git -c core.autocrlf=false -C $sourceRoot archive --format=tar --output=$sourceTar $sourceCommit
  if ($LASTEXITCODE) { throw 'Unable to archive the pinned Lc0 source.' }
  & tar -xf $sourceTar -C $sourceStage
  if ($LASTEXITCODE) { throw 'Unable to extract the pinned Lc0 source snapshot.' }
  Remove-Item -LiteralPath $sourceTar -Force

  $sourceEntries = @()
  foreach ($line in (& git -C $sourceRoot ls-tree -r $sourceCommit)) {
    if ($line -notmatch '^(\d+) (\S+) ([0-9a-f]+)\t(.+)$') {
      throw "Unable to parse source tree entry: $line"
    }
    $sourceEntries += [ordered]@{
      path = $Matches[4]
      mode = $Matches[1]
      type = $Matches[2]
      gitObject = $Matches[3]
    }
  }
  $sourceTree = [ordered]@{
    repository = 'https://github.com/jalpp/lc0.js.git'
    commit = $sourceCommit
    tree = (& git -C $sourceRoot rev-parse "$sourceCommit^{tree}").Trim()
    note = 'Git modes and object IDs for exact reconstruction after ZIP extraction.'
    entries = $sourceEntries
  }
  Write-Utf8NoBom (Join-Path $stageRoot 'source-git-tree.json') (($sourceTree | ConvertTo-Json -Depth 10) + "`n")

  $rootFiles = @{
    'README.md' = 'README.md'
    'BUILD.md' = 'BUILD.md'
    'THIRD_PARTY_NOTICES.md' = 'THIRD_PARTY_NOTICES.md'
    'LICENSES\lc0-GPL-3.0-or-later.txt' = 'COPYING-LC0.txt'
    'LICENSES\maia-GPL-3.0.txt' = 'LICENSE-MAIA.txt'
    'LICENSES\onnxruntime-MIT.txt' = 'LICENSE-ONNX-RUNTIME.txt'
    'LICENSES\emscripten.txt' = 'LICENSE-EMSCRIPTEN.txt'
    'LICENSES\chess.js-BSD-2-Clause.txt' = 'LICENSE-CHESSJS.txt'
    'network\maia-1100.json' = 'network\maia-1100.json'
  }
  foreach ($item in $rootFiles.GetEnumerator()) {
    Copy-BundleFile (Join-Path $complianceRoot $item.Key) (Join-Path $stageRoot $item.Value)
  }

  foreach ($patch in Get-ChildItem -LiteralPath (Join-Path $repositoryRoot 'experiments\lc0-browser-lab\patches') -Filter '*.patch') {
    Copy-BundleFile $patch.FullName (Join-Path $stageRoot "patches\$($patch.Name)")
    Copy-BundleFile $patch.FullName (Join-Path $stageRoot "caissa-build\experiments\lc0-browser-lab\patches\$($patch.Name)")
  }

  $buildFiles = @{
    'experiments\lc0-browser-lab\scripts\build-runtime.ps1' = 'caissa-build\experiments\lc0-browser-lab\scripts\build-runtime.ps1'
    'experiments\lc0-browser-lab\scripts\build-lab.mjs' = 'caissa-build\experiments\lc0-browser-lab\scripts\build-lab.mjs'
    'experiments\lc0-browser-lab\scripts\prepare-assets.mjs' = 'caissa-build\experiments\lc0-browser-lab\scripts\prepare-assets.mjs'
    'experiments\lc0-browser-lab\scripts\build-production-appliance.mjs' = 'caissa-build\experiments\lc0-browser-lab\scripts\build-production-appliance.mjs'
    'experiments\lc0-browser-lab\scripts\verify-production-appliance.mjs' = 'caissa-build\experiments\lc0-browser-lab\scripts\verify-production-appliance.mjs'
    'experiments\lc0-browser-lab\package.json' = 'caissa-build\experiments\lc0-browser-lab\package.json'
    'experiments\lc0-browser-lab\package-lock.json' = 'caissa-build\experiments\lc0-browser-lab\package-lock.json'
    'experiments\lc0-browser-lab\lab-manifest.json' = 'caissa-build\experiments\lc0-browser-lab\lab-manifest.json'
    'experiments\lc0-browser-lab\src\lc0-worker.js' = 'caissa-build\experiments\lc0-browser-lab\src\lc0-worker.js'
    'experiments\lc0-browser-lab\src\index.html' = 'caissa-build\experiments\lc0-browser-lab\src\index.html'
    'experiments\lc0-browser-lab\src\lab-app.js' = 'caissa-build\experiments\lc0-browser-lab\src\lab-app.js'
    'experiments\lc0-browser-lab\src\lab-runtime.js' = 'caissa-build\experiments\lc0-browser-lab\src\lab-runtime.js'
    'experiments\lc0-browser-lab\src\lab.css' = 'caissa-build\experiments\lc0-browser-lab\src\lab.css'
    'experiments\lc0-preview-relay\engine\client-source.js' = 'caissa-build\experiments\lc0-preview-relay\engine\client-source.js'
    'experiments\lc0-preview-relay\engine\release-manifest.template.json' = 'caissa-build\experiments\lc0-preview-relay\engine\release-manifest.template.json'
    'experiments\lc0-production-compliance\scripts\build-source-archive.ps1' = 'packaging\build-source-archive.ps1'
    'experiments\lc0-production-compliance\scripts\stage-production-inputs.ps1' = 'packaging\stage-production-inputs.ps1'
  }
  foreach ($item in $buildFiles.GetEnumerator()) {
    Copy-CaissaBuildFile $item.Key (Join-Path $stageRoot $item.Value)
  }

  $deltaPaths = @(
    'experiments/lc0-preview-relay/engine/client-source.js',
    'experiments/lc0-browser-lab/src/lc0-worker.js'
  )
  $deltaText = (& git -C $repositoryRoot diff --no-ext-diff --full-index $rc3BaselineCommit $certifiedRcCommit -- $deltaPaths) -join "`n"
  if ($LASTEXITCODE -or -not $deltaText) { throw 'Unable to generate the RC3 CAISSA source delta.' }
  $deltaPath = Join-Path $stageRoot 'rc3-provenance\rc3-caissa-source-delta.patch'
  [System.IO.Directory]::CreateDirectory((Split-Path $deltaPath -Parent)) | Out-Null
  Write-Utf8NoBom $deltaPath ($deltaText + "`n")

  $runtimeManifestSource = Join-Path $repositoryRoot `
    'experiments\lc0-preview-relay\engine\dist\assets\lc0\eae015b2-lc0-0.33.0-maia1100-r3\release-manifest.json'
  if (-not (Test-Path -LiteralPath $runtimeManifestSource)) {
    throw 'Generate the certified RC3 appliance before packaging corresponding source.'
  }
  $runtimeManifestHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $runtimeManifestSource).Hash.ToLowerInvariant()
  if ($runtimeManifestHash -ne $rc3ManifestSha256) { throw 'RC3 runtime manifest integrity mismatch.' }
  Copy-BundleFile $runtimeManifestSource (Join-Path $stageRoot 'runtime\release-manifest.json')

  $provenance = [ordered]@{
    schemaVersion = 1
    releaseId = 'lc0-browser-source-v0.1.2'
    baselineSourcePackage = [ordered]@{
      releaseId = 'lc0-browser-source-v0.1.1'
      caissaSourceCommit = $v011SourceCommit
      runtimeManifestSha256 = '492c6749989f429c269725d6d2761d4687c8096ca437f5651189fcfbe4ffbb9f'
    }
    certifiedRc = [ordered]@{
      commit = $certifiedRcCommit
      runtimeReleaseId = 'eae015b2-lc0-0.33.0-maia1100-r3'
      runtimeManifestSha256 = $rc3ManifestSha256
    }
    changedSources = @(
      [ordered]@{
        path = 'caissa-build/experiments/lc0-preview-relay/engine/client-source.js'
        sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $repositoryRoot $deltaPaths[0])).Hash.ToLowerInvariant()
        generatedArtifact = 'client.js'
        commits = @(
          '9d2b7dbad2a9cba6ff07ec2da743bf206a915625',
          'a409a37e1a9fa1bfdb7a456071e83d3d446e539d',
          'cd5b065174f76402a0ac289f25d8cb285a20a94e',
          '94138d7af503ce93feb7c33e0dcc5a729582e320'
        )
      },
      [ordered]@{
        path = 'caissa-build/experiments/lc0-browser-lab/src/lc0-worker.js'
        sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $repositoryRoot $deltaPaths[1])).Hash.ToLowerInvariant()
        generatedArtifact = 'lc0-worker.js'
        commits = @('94138d7af503ce93feb7c33e0dcc5a729582e320')
      }
    )
    deltaPatch = [ordered]@{
      path = 'rc3-provenance/rc3-caissa-source-delta.patch'
      fromCommit = $rc3BaselineCommit
      toCommit = $certifiedRcCommit
      sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $deltaPath).Hash.ToLowerInvariant()
    }
  }
  Write-Utf8NoBom (Join-Path $stageRoot 'rc3-provenance\rc3-provenance.json') `
    (($provenance | ConvertTo-Json -Depth 20) + "`n")

  $sourceManifest = Get-Content -Raw -LiteralPath (Join-Path $complianceRoot 'corresponding-source.json') | ConvertFrom-Json
  $sourceManifest.sourceArchiveSha256 = $null
  $sourceManifest.sourceArchiveBytes = $null
  $sourceManifest.publicVerification.httpStatus = $null
  $sourceManifest.publicVerification.contentLength = $null
  $sourceManifest.publicVerification.downloadedSha256 = $null
  $sourceManifest.publicVerification.archiveExtracted = $false
  $sourceManifest | Add-Member -Force NoteProperty archiveEnvelopeIntegrity 'See the detached .sha256 release asset and repository manifest; an archive cannot embed its own final digest.'
  Write-Utf8NoBom (Join-Path $stageRoot 'corresponding-source.json') (($sourceManifest | ConvertTo-Json -Depth 20) + "`n")

  $entries = @()
  foreach ($file in Get-ChildItem -LiteralPath $stageRoot -Recurse -File | Sort-Object FullName) {
    $relative = $file.FullName.Substring($stageRoot.Length + 1).Replace('\', '/')
    $entries += [ordered]@{
      path = $relative
      bytes = $file.Length
      sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $file.FullName).Hash.ToLowerInvariant()
    }
  }
  $contentManifest = [ordered]@{
    schemaVersion = 1
    releaseId = 'lc0-browser-source-v0.1.2'
    generatedFromCaissaCommit = $certifiedRcCommit
    lc0Commit = $sourceCommit
    sourceDateEpoch = 1789992000
    scope = 'Every archive file except manifest.json itself.'
    files = $entries
  }
  Write-Utf8NoBom (Join-Path $stageRoot 'manifest.json') (($contentManifest | ConvertTo-Json -Depth 20) + "`n")

  $forbiddenNames = Get-ChildItem -LiteralPath $stageRoot -Recurse -Force | Where-Object {
    $_.Name -match '^\.env($|\.)|\.pem$|\.p12$|\.pfx$|id_rsa|credentials'
  }
  if ($forbiddenNames) { throw "Forbidden secret-bearing filename detected: $($forbiddenNames.FullName -join ', ')" }
  $secretPatterns = '-----BEGIN [A-Z ]*PRIVATE KEY-----|sk_(?:live|test)_[A-Za-z0-9]+|gh[opsu]_[A-Za-z0-9]{20,}|eyJhbGciOi[J][A-Za-z0-9._-]+'
  foreach ($file in Get-ChildItem -LiteralPath $stageRoot -Recurse -File) {
    $text = [System.IO.File]::ReadAllText($file.FullName)
    if ($text -match $secretPatterns) { throw "Potential secret detected in $($file.FullName)" }
  }

  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
  $stream = [System.IO.File]::Open($archivePath, [System.IO.FileMode]::CreateNew)
  try {
    $zip = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create, $false)
    try {
      foreach ($file in Get-ChildItem -LiteralPath $stageRoot -Recurse -File | Sort-Object FullName) {
        $relative = $file.FullName.Substring($stageRoot.Length + 1).Replace('\', '/')
        $entry = $zip.CreateEntry($relative, [System.IO.Compression.CompressionLevel]::Optimal)
        $entry.LastWriteTime = $fixedTimestamp
        $input = [System.IO.File]::OpenRead($file.FullName)
        $output = $entry.Open()
        try { $input.CopyTo($output) } finally { $output.Dispose(); $input.Dispose() }
      }
    } finally { $zip.Dispose() }
  } finally { $stream.Dispose() }

  $archive = Get-Item -LiteralPath $archivePath
  $sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash.ToLowerInvariant()
  Write-Utf8NoBom $checksumPath "$sha256  $archiveName`n"
  [ordered]@{ archive = $archivePath; bytes = $archive.Length; sha256 = $sha256; files = $entries.Count + 1 } | ConvertTo-Json
} finally {
  if (Test-Path -LiteralPath $stageRoot) {
    Remove-Item -LiteralPath $stageRoot -Recurse -Force
  }
}
