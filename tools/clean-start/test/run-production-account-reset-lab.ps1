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

function Invoke-JsonPreflight([string]$Database, [string]$Preflight) {
    $args = @(
        '-X', '-w', '-qAt', '-h', '127.0.0.1', '-p', "$port", '-U', 'caissa_lab',
        '-d', $Database, '-v', 'ON_ERROR_STOP=1', '-v', 'project_ref=jczauvkfkweuvdpurpem',
        '-f', $Preflight
    )
    $raw = (& "$pgBin\psql.exe" @args | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $raw.StartsWith('{')) { throw "preflight failed for $Database" }
    return ($raw | ConvertFrom-Json)
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
    $fixture = Join-Path $repo 'tools\clean-start\test\production-account-reset-lab-fixture.sql'
    $preflightSource = Join-Path $repo 'tools\clean-start\production-account-preflight.sql'
    Invoke-Checked "$pgBin\psql.exe" ($base + @('-f', $fixture)) 'fixture failed'

    $preflight = Invoke-JsonPreflight 'caissa_reset_lab' $preflightSource
    $manifest = $preflight.counts | ConvertTo-Json -Compress -Depth 20
    $manifestB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($manifest))

    # Prove a custom-format synthetic backup restores to an isolated database
    # with exactly the same manifest before the destructive rehearsal begins.
    $dumpPath = Join-Path $labDir 'synthetic-account-backup.dump'
    Invoke-Checked "$pgBin\pg_dump.exe" @(
        '-h', '127.0.0.1', '-p', "$port", '-U', 'caissa_lab', '-d', 'caissa_reset_lab',
        '--format=custom', '--no-owner', '--no-privileges', '--file', $dumpPath
    ) 'synthetic backup failed'
    Invoke-Checked "$pgBin\createdb.exe" @('-h', '127.0.0.1', '-p', "$port", '-U', 'caissa_lab', 'caissa_restore_lab') 'restore database creation failed'
    Invoke-Checked "$pgBin\pg_restore.exe" @(
        '-h', '127.0.0.1', '-p', "$port", '-U', 'caissa_lab', '-d', 'caissa_restore_lab',
        '--exit-on-error', '--no-owner', '--no-privileges', $dumpPath
    ) 'synthetic restore failed'
    $restoredPreflight = Invoke-JsonPreflight 'caissa_restore_lab' $preflightSource
    $restoredManifest = $restoredPreflight.counts | ConvertTo-Json -Compress -Depth 20
    if ($restoredManifest -cne $manifest) { throw 'synthetic restore manifest diverged' }
    Invoke-Checked "$pgBin\dropdb.exe" @('-h', '127.0.0.1', '-p', "$port", '-U', 'caissa_lab', 'caissa_restore_lab') 'restore database cleanup failed'

    $labSystemId = (& "$pgBin\psql.exe" @($base + @('-Atc', 'select system_identifier from pg_control_system()'))).Trim()
    if ($LASTEXITCODE -ne 0 -or $labSystemId -notmatch '^\d+$') { throw 'lab system identifier query failed' }

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

    # Exercise the remaining destructive contract against the disposable lab.
    # Only the derived temporary copy is repinned to the lab's certified graph.
    $derivedReset = Join-Path $labDir 'production-account-reset-lab-derived.sql'
    $derivedText = [IO.File]::ReadAllText($resetSource).
        Replace('7581440907192989109', $labSystemId).
        Replace("current_database() <> 'postgres'", "current_database() <> 'caissa_reset_lab'").
        Replace('fk_edge_count <> 56', "fk_edge_count <> $($preflight.counts.account_fk_edge_count)").
        Replace('fk_relation_count <> 35', "fk_relation_count <> $($preflight.counts.account_fk_relation_count)").
        Replace("fk_fingerprint <> '7eaa482811ddab5b65dc4637f461307b'", "fk_fingerprint <> '$($preflight.counts.account_fk_fingerprint)'").
        Replace("(actual_manifest->>'users')::bigint <> 14", "(actual_manifest->>'users')::bigint <> $($preflight.counts.users)").
        Replace("(actual_manifest->>'caissa_public_identities')::bigint <> 14", "(actual_manifest->>'caissa_public_identities')::bigint <> $($preflight.counts.caissa_public_identities)").
        Replace("(actual_manifest->>'users_credits_total')::bigint <> 65", "(actual_manifest->>'users_credits_total')::bigint <> $($preflight.counts.users_credits_total)")
    [IO.File]::WriteAllText($derivedReset, $derivedText, [Text.UTF8Encoding]::new($false))

    # A same-snapshot manifest is not allowed to widen the certified account
    # scope. Add a second user, recapture a matching manifest, and prove that
    # the independent baseline pin still aborts before deletion.
    Invoke-Checked "$pgBin\psql.exe" ($base + @('-c', "insert into public.users(id,clerk_id,credits) values ('10000000-0000-4000-8000-000000000002','clerk-subject-2',0)")) 'baseline drift fixture creation failed'
    $expandedPreflight = Invoke-JsonPreflight 'caissa_reset_lab' $preflightSource
    $expandedManifest = $expandedPreflight.counts | ConvertTo-Json -Compress -Depth 20
    $expandedManifestB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($expandedManifest))
    $expandedVariables = $resetVariables.Clone()
    $expandedVariables[5] = "expected_manifest_b64=$expandedManifestB64"
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $baselineOutput = (& "$pgBin\psql.exe" @($base + $expandedVariables + @('-f', $derivedReset)) 2>&1 | Out-String)
        $baselineExit = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorAction
    }
    if ($baselineExit -eq 0 -or $baselineOutput -notmatch 'CAISSA_CLEAN_START_CERTIFIED_BASELINE_DIVERGED') {
        throw 'certified account baseline did not fail closed'
    }
    $remainingUsers = (& "$pgBin\psql.exe" @($base + @('-Atc', 'select count(*) from public.users'))).Trim()
    if ($LASTEXITCODE -ne 0 -or $remainingUsers -ne '2') { throw 'baseline drift guard changed lab account rows' }
    Invoke-Checked "$pgBin\psql.exe" ($base + @('-c', "delete from public.users where clerk_id='clerk-subject-2'")) 'baseline drift fixture cleanup failed'

    # A new account FK must abort before any delete, even if its table is empty.
    Invoke-Checked "$pgBin\psql.exe" ($base + @('-c', 'create table public.lab_drift(id uuid primary key,user_id uuid references public.users(id) on delete cascade)')) 'drift fixture creation failed'
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $driftOutput = (& "$pgBin\psql.exe" @($base + $resetVariables + @('-f', $derivedReset)) 2>&1 | Out-String)
        $driftExit = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorAction
    }
    if ($driftExit -eq 0 -or $driftOutput -notmatch 'CAISSA_CLEAN_START_ACCOUNT_FK_GRAPH_DIVERGED') {
        throw 'account FK graph drift did not fail closed'
    }
    $remainingUsers = (& "$pgBin\psql.exe" @($base + @('-Atc', 'select count(*) from public.users'))).Trim()
    if ($LASTEXITCODE -ne 0 -or $remainingUsers -ne '1') { throw 'graph drift guard changed lab account rows' }
    Invoke-Checked "$pgBin\psql.exe" ($base + @('-c', 'drop table public.lab_drift')) 'drift fixture cleanup failed'

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

Write-Output 'LOCAL_POSTGRES_BACKUP_RESTORE_RESET_LAB_PASS'
Write-Output 'LOCAL_POSTGRES_LAB_STOPPED_AND_REMOVED'
