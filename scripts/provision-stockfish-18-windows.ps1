param(
    [Parameter(Mandatory = $true)]
    [string]$TargetDirectory
)

$ErrorActionPreference = 'Stop'
$resolvedTarget = [System.IO.Path]::GetFullPath($TargetDirectory)
$url = 'https://github.com/official-stockfish/Stockfish/releases/download/sf_18/stockfish-windows-x86-64-avx2.zip'
$archiveSha256 = '6f6c272ebd6ea594377715235c8a7326f75940ef4f4f856f45106028fe6ae900'
$archive = Join-Path $resolvedTarget 'stockfish-windows-x86-64-avx2.zip'
$extract = Join-Path $resolvedTarget 'extracted'

New-Item -ItemType Directory -Force -Path $resolvedTarget | Out-Null
if (-not (Test-Path -LiteralPath $archive)) {
    Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing
}
$actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $archiveSha256) { throw "stockfish-archive-checksum-mismatch:$actual" }
if (-not (Test-Path -LiteralPath $extract)) {
    Expand-Archive -LiteralPath $archive -DestinationPath $extract
}
$executable = Get-ChildItem -LiteralPath $extract -Recurse -Filter 'stockfish-windows-x86-64-avx2.exe' |
    Select-Object -First 1
if (-not $executable) { throw 'stockfish-executable-missing' }
[pscustomobject]@{
    source = $url
    archiveSha256 = $archiveSha256
    executable = $executable.FullName
    binarySha256 = (Get-FileHash -LiteralPath $executable.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    repositoryPolicy = 'externally-provisioned-private-tool'
} | ConvertTo-Json
