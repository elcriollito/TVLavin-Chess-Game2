import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() && !['node_modules', '.git', '.vercel'].includes(entry.name)
        ? walk(path.join(dir, entry.name)) : entry.isFile() ? [path.join(dir, entry.name)] : []);

test('protected architecture, dependencies, and lockfile remain outside this regression change', () => {
    const changed = execFileSync('git', ['diff', '--name-only', 'f94d689c7a4d38363149fd168e672811298c016b'], { encoding: 'utf8' }).replaceAll('\\', '/');
    for (const file of [
        'docs/architecture/PLAY_CURRENT_STATE_AUDIT.md',
        'docs/architecture/CAISSA_SIMPLIFIED_PLAY_ARCHITECTURE.md',
        'docs/architecture/PLAY_MIGRATION_AND_COMPATIBILITY_PLAN.md', 'package-lock.json'
    ]) assert(!changed.includes(file), file);
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const baseline = JSON.parse(execFileSync('git', ['show', 'f94d689c7a4d38363149fd168e672811298c016b:package.json'], { encoding: 'utf8' }));
    assert.deepEqual(pkg.dependencies, baseline.dependencies);
    assert.deepEqual(pkg.devDependencies, baseline.devDependencies);
});

test('only the three documented browser characterization skips exist and no only marker exists', () => {
    const browser = walk(path.join(root, 'tests/browser')).filter(file => file.endsWith('.spec.js'));
    const skips = [];
    for (const file of browser) {
        const source = fs.readFileSync(file, 'utf8');
        assert.doesNotMatch(source, /\b(?:test|describe)\.only\b/, path.relative(root, file));
        for (const match of source.matchAll(/\btest\.skip\s*\(\s*(['"`])([^\n]+?)\1/g)) skips.push(match[2]);
    }
    assert.deepEqual(skips.sort(), [
        'modal focus trap and visible-focus styling — no reliable legacy focus-trap contract',
        'repetition and fifty-move Play sequences — legacy Play has no public history injection',
        'square-by-square keyboard chess play — adapter currently provides board-level focus only'
    ].sort());
});

test('test fixtures do not leak into production registration', () => {
    const production = ['index.html', 'app.js', ...walk(path.join(root, 'js')).filter(file => file.endsWith('.js'))];
    for (const file of production) {
        const source = fs.readFileSync(file, 'utf8');
        assert.doesNotMatch(source, /tests[\\/]play[\\/]|tests[\\/]browser[\\/]|play-regression-manifest/, path.relative(root, file));
    }
});

test('static gate owns generated artifact cleanup through the repository contract', () => {
    const runner = fs.readFileSync(path.join(root, 'scripts/run-play-static-guards.mjs'), 'utf8');
    const contract = fs.readFileSync(path.join(root, 'scripts/regression-contracts.mjs'), 'utf8');
    assert.match(runner, /cleanGeneratedOutputs\(process\.cwd\(\)\)/);
    for (const relative of ['playwright-report', 'test-results', 'coverage', 'tmp']) {
        assert(contract.includes(relative), relative);
    }
});

test('regression sources contain no arbitrary network target, inline handler, or production registration', () => {
    const files = [
        'scripts/run-play-regression.mjs', 'scripts/run-play-static-guards.mjs', 'scripts/play-regression-result.mjs',
        'tests/play/play-regression-manifest.js',
        'tests/browser/regression-play-hard-invariants.spec.js', 'tests/browser/regression-play-smoke.spec.js'
    ];
    for (const file of files) {
        const source = fs.readFileSync(file, 'utf8');
        assert.doesNotMatch(source, /https?:\/\//, file);
        assert.doesNotMatch(source, /on(?:click|load|error)\s*=/i, file);
    }
});
