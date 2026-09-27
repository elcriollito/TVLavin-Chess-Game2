[CmdletBinding()]
param(
    [string]$DataRoot = (Join-Path $env:USERPROFILE 'CAISSA Data\Lichess\Puzzles\2026-09-10')
)

$ErrorActionPreference = 'Stop'
$sourceUrl = 'https://database.lichess.org/lichess_db_puzzle.csv.zst'
$themeCommit = '937d2f16e9381d53cd39a2f7bf680bee9ea9378c'
$openingCommit = 'c67912be581f0793dbaa776be5ccf111e01f88d9'
$references = Join-Path $DataRoot 'references'
New-Item -ItemType Directory -Path $references -Force | Out-Null

function Receive-VerifiedDownload {
    param([string]$Url, [string]$Destination)
    if (Test-Path -LiteralPath $Destination) {
        Write-Host "Already present: $Destination"
        return
    }
    $partial = "$Destination.part"
    & curl.exe --fail --location --continue-at - --output $partial $Url
    if ($LASTEXITCODE -ne 0) {
        throw "Download failed with curl exit code $LASTEXITCODE; partial retained at $partial"
    }
    Move-Item -LiteralPath $partial -Destination $Destination
}

Receive-VerifiedDownload $sourceUrl (Join-Path $DataRoot 'lichess_db_puzzle.csv.zst')
Receive-VerifiedDownload "https://raw.githubusercontent.com/lichess-org/lila/$themeCommit/translation/source/puzzleTheme.xml" `
    (Join-Path $references "puzzleTheme-$themeCommit.xml")
Receive-VerifiedDownload "https://codeload.github.com/lichess-org/chess-openings/tar.gz/$openingCommit" `
    (Join-Path $references "chess-openings-$openingCommit.tar.gz")
Receive-VerifiedDownload 'https://database.lichess.org/' `
    (Join-Path $references 'database.lichess.org.html')

Get-ChildItem -LiteralPath $DataRoot -File -Recurse |
    Select-Object FullName, Length, LastWriteTime
