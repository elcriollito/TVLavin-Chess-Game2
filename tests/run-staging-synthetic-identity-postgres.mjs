import { spawnSync } from 'node:child_process';
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
const sourceTest = path.join(repositoryRoot, 'tests', 'staging-synthetic-identity-postgres.sql');
const maintenanceDatabase = process.env.PGDATABASE || 'postgres';
const testDatabase = `caissa_staging_fixture_${process.pid}_${Date.now()}`.slice(0, 63);
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'caissa-staging-fixture-'));

function runPsql(args, { capture = false, database = maintenanceDatabase } = {}) {
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
    return capture ? result.stdout.trim() : '';
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

    const renderedArtifactPath = path.join(temporaryDirectory, 'staging-artifact.local.sql');
    const renderedTestPath = path.join(temporaryDirectory, 'staging-test.local.sql');
    const renderedArtifact = fs.readFileSync(sourceArtifact, 'utf8')
        .replaceAll('7678069749886157684', localSystemIdentifier)
        .replaceAll(
            "pg_catalog.current_database() <> 'postgres'",
            `pg_catalog.current_database() <> '${testDatabase}'`
        );
    fs.writeFileSync(renderedArtifactPath, renderedArtifact);

    const portableArtifactPath = renderedArtifactPath.replaceAll('\\', '/');
    const renderedTest = fs.readFileSync(sourceTest, 'utf8').replace(
        /^\\ir \.\.\/(.+)$/gm,
        (_line, relativePath) => {
            if (relativePath === 'supabase/staging-only/20261023211619_caissa_staging_synthetic_identity_provisioning.sql') {
                return `\\ir '${portableArtifactPath}'`;
            }
            const absolutePath = path.join(repositoryRoot, relativePath).replaceAll('\\', '/');
            return `\\ir '${absolutePath}'`;
        }
    );
    fs.writeFileSync(renderedTestPath, renderedTest);

    runPsql(['-f', renderedTestPath], { database: testDatabase });
} finally {
    try {
        runPsql(['-c', `drop database if exists "${testDatabase}" with (force)`]);
    } finally {
        fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
}
