import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    PLAY_REGRESSION_EXTERNAL_GATES, PLAY_REGRESSION_MANUAL_GATES,
    PLAY_REGRESSION_MANIFEST_VERSION, PLAY_REGRESSION_SUBSYSTEMS
} from './play-regression-manifest.js';
import { createPlayRegressionResult } from '../../scripts/play-regression-result.mjs';

const statuses = new Set(['complete', 'partial', 'blocked', 'external', 'manual-only']);

test('regression manifest is versioned, immutable, complete, unique, and JSON-safe', () => {
    assert.match(PLAY_REGRESSION_MANIFEST_VERSION, /^\d+\.\d+\.\d+$/);
    assert(Object.isFrozen(PLAY_REGRESSION_SUBSYSTEMS));
    assert.equal(PLAY_REGRESSION_SUBSYSTEMS.length, 24);
    assert.equal(new Set(PLAY_REGRESSION_SUBSYSTEMS.map(item => item.subsystemId)).size, 24);
    assert.doesNotThrow(() => JSON.stringify(PLAY_REGRESSION_SUBSYSTEMS));
    for (const item of PLAY_REGRESSION_SUBSYSTEMS) {
        assert(statuses.has(item.status), item.subsystemId);
        assert(Object.isFrozen(item), item.subsystemId);
        assert(item.hardInvariant.length > 0, item.subsystemId);
        assert.equal(item.releaseImpact, 'blocking', item.subsystemId);
    }
});

test('every exact manifest test reference exists', () => {
    for (const subsystem of PLAY_REGRESSION_SUBSYSTEMS) {
        for (const file of [...subsystem.unit, ...subsystem.integration, ...subsystem.responsive, ...subsystem.staticGuards]) {
            assert(fs.existsSync(file), `${subsystem.subsystemId}: ${file}`);
        }
    }
});

test('external and manual gates are distinct, immutable, and have closure conditions', () => {
    assert.equal(PLAY_REGRESSION_EXTERNAL_GATES.length, 3);
    assert.equal(PLAY_REGRESSION_MANUAL_GATES.length, 3);
    assert(Object.isFrozen(PLAY_REGRESSION_EXTERNAL_GATES));
    assert(Object.isFrozen(PLAY_REGRESSION_MANUAL_GATES));
    for (const gate of [...PLAY_REGRESSION_EXTERNAL_GATES, ...PLAY_REGRESSION_MANUAL_GATES]) {
        assert(gate.owner && gate.closure);
    }
});

test('result contract is immutable, JSON-safe, and cannot falsely pass a failed suite', () => {
    const passed = createPlayRegressionResult({ suites: [{ suiteId: 'unit', status: 'passed', durationMs: 3 }] });
    assert.equal(passed.status, 'passed');
    assert(Object.isFrozen(passed) && Object.isFrozen(passed.suites));
    assert.doesNotThrow(() => JSON.stringify(passed));
    const failed = createPlayRegressionResult({ suites: [{ suiteId: 'unit', status: 'failed' }] });
    assert.equal(failed.status, 'failed');
    assert.equal(failed.failed, 1);
    assert.deepEqual(failed.blockers, ['required-local-suite-failed']);
});

test('package scripts preserve existing commands and define one maintainable regression chain', () => {
    const scripts = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts;
    assert.equal(scripts['test:play:regression'], 'node scripts/run-play-regression.mjs');
    assert.match(scripts['test:play:hard-invariants'], /regression-coverage-manifest.*regression-play-hard-invariants/);
    assert.equal(scripts['test:play:regression:smoke'], 'playwright test tests/browser/regression-play-smoke.spec.js');
    assert.equal(scripts['test:play:static-guards'], 'node scripts/run-play-static-guards.mjs');
    for (const key of ['test:play:unit', 'test:play:integration', 'test:play:responsive', 'test:play', 'test:regression']) assert(scripts[key]);
});

test('regression fixtures and result contracts are not registered by production', () => {
    for (const file of ['index.html', 'app.js', 'middleware.js']) {
        const source = fs.readFileSync(file, 'utf8');
        assert.doesNotMatch(source, /play-regression-manifest|play-regression-result|run-play-regression/);
    }
});
