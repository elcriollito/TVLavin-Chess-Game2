import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const psql = process.env.CAISSA_PSQL_PATH || 'psql';
const repositoryRoot = process.cwd();
const sourceArtifact = path.join(
    repositoryRoot,
    'supabase',
    'staging-only',
    '20261023211619_caissa_staging_synthetic_identity_provisioning.sql'
);
const sourceTeardown = path.join(
    repositoryRoot,
    'supabase',
    'staging-only',
    '20261023211620_caissa_staging_synthetic_identity_teardown.sql'
);
const sourceTest = path.join(repositoryRoot, 'tests', 'staging-synthetic-identity-postgres.sql');
const maintenanceDatabase = process.env.PGDATABASE || 'postgres';
const testDatabase = `caissa_staging_fixture_${process.pid}_${Date.now()}`.slice(0, 63);
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'caissa-staging-fixture-'));
let writerProcess;

function runPsql(args, {
    capture = false,
    database = maintenanceDatabase,
    includeStderr = false
} = {}) {
    const result = spawnSync(psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-d', database, ...args], {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: process.env,
        stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
    });

    if (result.error) throw result.error;
    if (result.status !== 0) {
        const detail = capture ? `${result.stdout || ''}${result.stderr || ''}`.trim() : '';
        throw new Error(`psql exited with status ${result.status}${detail ? `: ${detail}` : ''}`);
    }
    if (!capture) return '';
    return includeStderr
        ? `${result.stdout || ''}${result.stderr || ''}`.trim()
        : result.stdout.trim();
}

function assertHostedProjectGuardRejects(database) {
    const result = spawnSync(
        psql,
        ['-X', '-v', 'ON_ERROR_STOP=1', '-d', database, '-f', sourceArtifact],
        {
            cwd: repositoryRoot,
            encoding: 'utf8',
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe']
        }
    );
    if (result.error) throw result.error;
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    if (result.status === 0 || !output.includes('CAISSA_STAGING_PROJECT_MISMATCH')) {
        throw new Error('The hosted Staging project guard did not reject a different PostgreSQL cluster');
    }
}

function startPsql(args, { database = maintenanceDatabase } = {}) {
    const child = spawn(psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-d', database, ...args], {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const completion = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
    });
    return { child, completion };
}

async function waitForLifecycleLock(database, writer) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
        if (writer.child.exitCode !== null) {
            const result = await writer.completion;
            throw new Error(
                `Concurrent writer exited before acquiring the lifecycle lock: ${result.stderr || result.stdout}`.trim()
            );
        }
        const lockCount = runPsql(
            [
                '-A', '-t', '-c',
                `select pg_catalog.count(*) from pg_catalog.pg_locks l
                 join pg_catalog.pg_stat_activity a on a.pid = l.pid
                 where l.locktype = 'advisory'
                   and l.granted
                   and a.datname = pg_catalog.current_database()`
            ],
            { capture: true, database }
        );
        if (Number(lockCount) > 0) return;
        await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error('Concurrent writer did not acquire the fixture lifecycle lock');
}

try {
    runPsql(['-c', `create database "${testDatabase}"`]);
    assertHostedProjectGuardRejects(testDatabase);

    const localSystemIdentifier = runPsql(
        ['-A', '-t', '-c', 'select system_identifier::text from pg_catalog.pg_control_system()'],
        { capture: true, database: testDatabase }
    );
    if (!/^\d{10,30}$/.test(localSystemIdentifier)) {
        throw new Error('PostgreSQL returned an invalid local system identifier');
    }

    const renderForLocalCluster = source => source
        .replaceAll('7678069749886157684', localSystemIdentifier)
        .replaceAll(
            "pg_catalog.current_database() <> 'postgres'",
            `pg_catalog.current_database() <> '${testDatabase}'`
        );
    const renderedArtifactPath = path.join(temporaryDirectory, 'staging-artifact.local.sql');
    const renderedTeardownPath = path.join(temporaryDirectory, 'staging-teardown.local.sql');
    const renderedTestPath = path.join(temporaryDirectory, 'staging-test.local.sql');
    const renderedArtifact = renderForLocalCluster(fs.readFileSync(sourceArtifact, 'utf8'));
    const renderedTeardown = renderForLocalCluster(fs.readFileSync(sourceTeardown, 'utf8'));
    fs.writeFileSync(renderedArtifactPath, renderedArtifact);
    fs.writeFileSync(renderedTeardownPath, renderedTeardown);

    const portableArtifactPath = renderedArtifactPath.replaceAll('\\', '/');
    const portableTeardownPath = renderedTeardownPath.replaceAll('\\', '/');
    const renderedTest = fs.readFileSync(sourceTest, 'utf8').replace(
        /^\\ir \.\.\/(.+)$/gm,
        (_line, relativePath) => {
            if (relativePath === 'supabase/staging-only/20261023211619_caissa_staging_synthetic_identity_provisioning.sql') {
                return `\\ir '${portableArtifactPath}'`;
            }
            if (relativePath === 'supabase/staging-only/20261023211620_caissa_staging_synthetic_identity_teardown.sql') {
                return `\\ir '${portableTeardownPath}'`;
            }
            const absolutePath = path.join(repositoryRoot, relativePath).replaceAll('\\', '/');
            return `\\ir '${absolutePath}'`;
        }
    );
    fs.writeFileSync(renderedTestPath, renderedTest);

    const testOutput = runPsql(['-f', renderedTestPath], {
        capture: true,
        database: testDatabase,
        includeStderr: true
    });
    if (!testOutput.includes('CAISSA_STAGING_SYNTHETIC_IDENTITY_POSTGRES_PASS')) {
        throw new Error('The staging synthetic identity PostgreSQL test did not reach its pass marker');
    }
    process.stdout.write(`${testOutput}\n`);

    runPsql(['-f', renderedArtifactPath], { database: testDatabase });
    const concurrentAuthorization = `
        with authorized_fixture as materialized (
          select * from caissa_staging_private.authorize_synthetic_identity(
            '904ca814-04c6-8a0f-ae01-008de74af1cd',
            'A',
            'user_3TestSyntheticAlpha000000001',
            'a2000000-0000-4000-8000-000000000001',
            repeat('a', 64),
            'Approved concurrent synthetic fixture Alpha for teardown serialization certification.',
            pg_catalog.clock_timestamp() + interval '30 minutes',
            'user_3TestSyntheticAlpha000000001',
            'a2000000-0000-4000-8000-000000000001',
            repeat('a', 64),
            'user_3TestSyntheticBravo000000001',
            'b2000000-0000-4000-8000-000000000001',
            repeat('b', 64)
          )
        )
        select authorized_fixture.success, pg_catalog.pg_sleep(3)::text as held
        from authorized_fixture`;
    const writer = startPsql(['-A', '-t', '-c', concurrentAuthorization], {
        database: testDatabase
    });
    writerProcess = writer.child;
    await waitForLifecycleLock(testDatabase, writer);

    const rejectedTeardown = spawnSync(
        psql,
        ['-X', '-v', 'ON_ERROR_STOP=1', '-d', testDatabase, '-f', renderedTeardownPath],
        {
            cwd: repositoryRoot,
            encoding: 'utf8',
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe']
        }
    );
    if (rejectedTeardown.error) throw rejectedTeardown.error;
    const rejectedOutput = `${rejectedTeardown.stdout || ''}${rejectedTeardown.stderr || ''}`;
    if (
        rejectedTeardown.status === 0
        || !rejectedOutput.includes('CAISSA_STAGING_FIXTURE_AUTHORIZATIONS_NOT_EMPTY')
    ) {
        throw new Error('Concurrent teardown did not reject the newly committed authorization');
    }

    const writerResult = await writer.completion;
    writerProcess = undefined;
    if (writerResult.code !== 0 || !/^t\|/m.test(writerResult.stdout)) {
        throw new Error(
            `Concurrent authorization failed: ${writerResult.stderr || writerResult.stdout}`.trim()
        );
    }

    const preservedState = runPsql(
        [
            '-A', '-t', '-c',
            `select (
               pg_catalog.to_regnamespace('caissa_staging_private') is not null
               and (select pg_catalog.count(*) = 1
                    from caissa_staging_private.synthetic_identity_authorizations
                    where run_id = '904ca814-04c6-8a0f-ae01-008de74af1cd'
                      and fixture_slot = 'A')
             )::integer`
        ],
        { capture: true, database: testDatabase }
    );
    if (preservedState !== '1') {
        throw new Error('Rejected teardown did not preserve the schema and exact authorization row');
    }

    runPsql(
        [
            '-c',
            `delete from caissa_staging_private.synthetic_identity_authorizations
             where run_id = '904ca814-04c6-8a0f-ae01-008de74af1cd'
               and fixture_slot = 'A'
               and external_subject = 'user_3TestSyntheticAlpha000000001'
               and user_id = 'a2000000-0000-4000-8000-000000000001'
               and authorization_reference_hash = repeat('a', 64)`
        ],
        { database: testDatabase }
    );
    runPsql(['-f', renderedTeardownPath], { database: testDatabase });
    const namespaceCount = runPsql(
        [
            '-A', '-t', '-c',
            `select pg_catalog.count(*)
             from pg_catalog.pg_namespace
             where nspname = 'caissa_staging_private'`
        ],
        { capture: true, database: testDatabase }
    );
    if (namespaceCount !== '0') {
        throw new Error('Race-safe teardown did not restore the schema baseline');
    }
    process.stdout.write('CAISSA_STAGING_SYNTHETIC_IDENTITY_TEARDOWN_RACE_PASS\n');
} finally {
    if (writerProcess && writerProcess.exitCode === null) writerProcess.kill();
    try {
        runPsql(['-c', `drop database if exists "${testDatabase}" with (force)`]);
    } finally {
        fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
}
