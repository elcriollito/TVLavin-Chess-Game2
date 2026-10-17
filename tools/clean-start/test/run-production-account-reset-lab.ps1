[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$workspace = (Resolve-Path (Join-Path $repo '..')).Path
$labLeaf = 'tmp-clean-start-pg-lab'
$labDir = Join-Path $workspace $labLeaf
$pgBin = 'C:\Program Files\PostgreSQL\17\bin'
$port = 55439
$started = $false

function Invoke-Checked([string]$Executable, [string[]]$Arguments, [string]$Failure) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw $Failure }
}

if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
    throw "Port $port is already in use"
}
if (Test-Path -LiteralPath $labDir) { throw "Lab path already exists: $labDir" }
New-Item -ItemType Directory -Path $labDir | Out-Null

try {
    Invoke-Checked "$pgBin\initdb.exe" @('-D', $labDir, '-U', 'caissa_lab', '-A', 'trust', '--no-locale', '--encoding=UTF8') 'initdb failed'
    Invoke-Checked "$pgBin\pg_ctl.exe" @('-D', $labDir, '-l', "$labDir\postgres.log", '-o', "-h 127.0.0.1 -p $port", '-w', 'start') 'pg_ctl start failed'
    $started = $true
    Invoke-Checked "$pgBin\createdb.exe" @('-h', '127.0.0.1', '-p', "$port", '-U', 'caissa_lab', 'caissa_reset_lab') 'createdb failed'

    $base = @('-X', '-w', '-h', '127.0.0.1', '-p', "$port", '-U', 'caissa_lab', '-d', 'caissa_reset_lab', '-v', 'ON_ERROR_STOP=1')
    Invoke-Checked "$pgBin\psql.exe" ($base + @('-f', (Join-Path $repo 'tools\clean-start\test\production-account-reset-lab-fixture.sql'))) 'fixture failed'
    Invoke-Checked "$pgBin\psql.exe" ($base + @('-v', 'project_ref=jczauvkfkweuvdpurpem', '-f', (Join-Path $repo 'tools\clean-start\production-account-preflight.sql'))) 'preflight failed'

    $labSystemId = (& "$pgBin\psql.exe" @($base + @('-Atc', 'select system_identifier from pg_control_system()'))).Trim()
    if ($LASTEXITCODE -ne 0 -or $labSystemId -notmatch '^\d+$') { throw 'lab system identifier query failed' }

    $manifest = '{"users":1,"public_identities":1,"identity_bindings":1,"identity_challenges":1,"identity_audit":1,"credit_events":1,"credit_reservations":1,"economic_usage_events":1,"stripe_events":1,"entitlements":1,"puzzle_progress":1,"puzzle_attempts":1,"scanner_scans":1,"scanner_failures":1,"scanner_feedback":1,"insight_datasets":1,"insight_reports":1,"library_positions":1,"library_collections":1,"online_games":0,"online_events":0,"online_challenges":0,"online_tickets":0,"online_presence":0}'
    $manifestB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($manifest))
    $retainUntil = (Get-Date).ToUniversalTime().AddDays(14).ToString('yyyy-MM-ddTHH:mm:ssZ')
    $resetVariables = @(
        '-v', 'project_ref=jczauvkfkweuvdpurpem',
        '-v', 'confirmation=RESET_ALL_CAISSA_PRODUCTION_ACCOUNTS_jczauvkfkweuvdpurpem',
        '-v', "expected_manifest_b64=$manifestB64",
        '-v', ('backup_sha256=' + ('a' * 64)),
        '-v', ('restore_attestation_sha256=' + ('b' * 64)),
        '-v', 'backup_locator=gs://caissa-synthetic-lab/fixture',
        '-v', "retain_until=$retainUntil"
    )
    $resetSource = Join-Path $repo 'tools\clean-start\production-account-reset.sql'

    # The exact Production script must fail closed on a synthetic cluster even
    # when its schema, ledger, manifest, and operator-supplied project ref match.
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $guardOutput = (& "$pgBin\psql.exe" @($base + $resetVariables + @('-f', $resetSource)) 2>&1 | Out-String)
        $guardExit = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorAction
    }
    if ($guardExit -eq 0 -or $guardOutput -notmatch 'CAISSA_CLEAN_START_WRONG_CLUSTER') {
        throw 'Production cluster identity guard did not fail closed in the lab'
    }
    $remainingUsers = (& "$pgBin\psql.exe" @($base + @('-Atc', 'select count(*) from public.users'))).Trim()
    if ($LASTEXITCODE -ne 0 -or $remainingUsers -ne '1') { throw 'wrong-cluster guard changed lab account rows' }

    # Exercise the remaining destructive contract against the disposable lab
    # by producing a temporary derived copy pinned to this lab cluster only.
    $derivedReset = Join-Path $labDir 'production-account-reset-lab-derived.sql'
    $derivedText = [IO.File]::ReadAllText($resetSource).
        Replace('7581440907192989109', $labSystemId).
        Replace("current_database() <> 'postgres'", "current_database() <> 'caissa_reset_lab'")
    [IO.File]::WriteAllText($derivedReset, $derivedText, [Text.UTF8Encoding]::new($false))
    Invoke-Checked "$pgBin\psql.exe" ($base + $resetVariables + @('-f', $derivedReset)) 'reset failed'
    Invoke-Checked "$pgBin\psql.exe" ($base + @('-f', (Join-Path $repo 'tools\clean-start\production-account-postflight.sql'))) 'postflight failed'
    Invoke-Checked "$pgBin\psql.exe" ($base + @('-f', (Join-Path $repo 'tools\clean-start\test\production-account-reset-lab-assertions.sql'))) 'assertions failed'
} finally {
    if ($started) {
        & "$pgBin\pg_ctl.exe" -D $labDir -m fast -w stop | Out-Null
    }
    $resolvedWorkspace = (Resolve-Path $workspace).Path.TrimEnd('\')
    $resolvedLab = (Resolve-Path $labDir -ErrorAction SilentlyContinue).Path
    if ($resolvedLab) {
        if (-not $resolvedLab.StartsWith($resolvedWorkspace + '\') -or (Split-Path $resolvedLab -Leaf) -ne $labLeaf) {
            throw "Refusing to remove unexpected lab path: $resolvedLab"
        }
        Remove-Item -LiteralPath $resolvedLab -Recurse -Force
    }
}

Write-Output 'LOCAL_POSTGRES_LAB_STOPPED_AND_REMOVED'
