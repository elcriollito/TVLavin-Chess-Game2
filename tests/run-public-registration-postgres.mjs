import { spawn, spawnSync } from 'node:child_process';

const psql = process.env.CAISSA_PSQL_PATH || 'psql';
const root = process.cwd();
const maintenanceDatabase = process.argv[2] || process.env.CAISSA_TEST_DATABASE_URL || process.env.PGDATABASE || 'postgres';
const database = `caissa_registration_${process.pid}_${Date.now()}`.slice(0, 63);

function databaseTarget(name) {
    if (!/^postgres(?:ql)?:\/\//u.test(maintenanceDatabase)) return name;
    const target = new URL(maintenanceDatabase);
    target.pathname = `/${name}`;
    return target.toString();
}

function run(args, { target = maintenanceDatabase, capture = false } = {}) {
    const result = spawnSync(psql, ['-X', '-w', '-v', 'ON_ERROR_STOP=1', '-d', target, ...args], {
        cwd: root,
        encoding: 'utf8',
        env: process.env,
        stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${result.stdout || ''}${result.stderr || ''}`.trim());
    return `${result.stdout || ''}${result.stderr || ''}`;
}

function start(sql) {
    const child = spawn(psql, ['-X', '-w', '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-d', databaseTarget(database), '-c', sql], {
        cwd: root,
        encoding: 'utf8',
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', value => { stdout += value; });
    child.stderr.on('data', value => { stderr += value; });
    return new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', code => code === 0 ? resolve(stdout) : reject(new Error(stderr || stdout)));
    });
}

try {
    run(['-c', `create database "${database}"`]);
    const output = run(['-f', 'tests/public-registration-postgres.sql'], { target: databaseTarget(database), capture: true });
    if (!output.includes('CAISSA_PUBLIC_REGISTRATION_POSTGRES_PASS')) {
        throw new Error('PostgreSQL contract test did not reach its pass marker');
    }
    process.stdout.write(output);

    const first = start(`set role service_role; begin;
      select success,code from public.register_caissa_clerk_identity(
        'user_3ConcurrentRegistration001','concurrent@example.test','concurrent@example.test','legacy_development');
      select pg_catalog.pg_sleep(2); commit;`);
    await new Promise(resolve => setTimeout(resolve, 200));
    const second = start(`set role service_role;
      select success,code from public.register_caissa_clerk_identity(
        'user_3ConcurrentRegistration001','concurrent@example.test','concurrent@example.test','legacy_development');`);
    const [firstOutput, secondOutput] = await Promise.all([first, second]);
    if (!firstOutput.includes('t|REGISTRATION_COMPLETED')
        || !secondOutput.includes('t|REGISTRATION_ALREADY_COMPLETED')) {
        throw new Error(`Concurrent enrollment was not idempotent:\n${firstOutput}\n${secondOutput}`);
    }
    const count = run(['-A', '-t', '-c', `select count(*) from public.users where email='concurrent@example.test'`], {
        target: databaseTarget(database),
        capture: true
    }).trim();
    if (count !== '1') throw new Error(`Concurrent enrollment created ${count} users`);
    process.stdout.write('CAISSA_PUBLIC_REGISTRATION_CONCURRENCY_PASS\n');
} finally {
    run(['-c', `drop database if exists "${database}" with (force)`]);
}
