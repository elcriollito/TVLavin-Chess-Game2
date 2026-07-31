import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLAY_INTEGRATION_SCENARIOS } from '../browser/fixtures/play-integration-scenarios.js';
import { assertDeepFrozen, assertJsonSafe, assertNoDangerousKeys } from './helpers/contract-assertions.js';

test('integration scenario catalog is complete, unique, immutable, and JSON-safe',()=>{
    assert.equal(PLAY_INTEGRATION_SCENARIOS.length,18);
    assertDeepFrozen(PLAY_INTEGRATION_SCENARIOS,'scenarios');
    assertJsonSafe(PLAY_INTEGRATION_SCENARIOS,'scenarios');
    assertNoDangerousKeys(PLAY_INTEGRATION_SCENARIOS,'scenarios');
    assert.equal(new Set(PLAY_INTEGRATION_SCENARIOS.map(s=>s.scenarioId)).size,18);
});

test('every scenario has bounded deterministic lifecycle and resource expectations',()=>{
    for(const scenario of PLAY_INTEGRATION_SCENARIOS){
        assert.match(scenario.scenarioId,/^[a-z][a-z0-9-]{2,63}$/);
        assert.match(scenario.entryRoute,/^\/play(?:\/[a-z]+)?\?simplified=1$/);
        assert.ok(scenario.modules.length>=2,scenario.scenarioId);
        assert.ok(scenario.expectedStates.length>=2,scenario.scenarioId);
        assert.equal(scenario.expectedResources.boards,1,scenario.scenarioId);
        assert.equal(scenario.expectedResources.workersMax,1,scenario.scenarioId);
        assert.ok(scenario.expectedTerminalState);
        assert.ok(scenario.expectedNavigation);
    }
});

test('integration manifest binds every scenario to exact browser evidence',()=>{
    const manifest=fs.readFileSync('docs/audits/PLAY_INTEGRATION_TEST_COVERAGE.md','utf8');
    for(const scenario of PLAY_INTEGRATION_SCENARIOS){
        assert.match(manifest,new RegExp(`\\\\| ${scenario.scenarioId} \\\\|`),scenario.scenarioId);
    }
    assert.doesNotMatch(manifest,/covered elsewhere/i);
});

test('integration fixtures are test-only and contain no credentials or external service URLs',()=>{
    const fixture='tests/browser/fixtures/play-integration-scenarios.js';
    const source=fs.readFileSync(fixture,'utf8');
    assert.doesNotMatch(source,/https?:\/\/|password|secret|api[_-]?key|token\s*:/i);
    const productionFiles=fs.readdirSync('js',{recursive:true,withFileTypes:true})
        .filter(entry=>entry.isFile()&&entry.name.endsWith('.js'))
        .map(entry=>path.join(entry.parentPath||entry.path,entry.name));
    for(const file of productionFiles)assert.doesNotMatch(fs.readFileSync(file,'utf8'),/play-integration-scenarios/,file);
});

test('integration browser sources contain no hidden focus or order controls',()=>{
    const files=fs.readdirSync('tests/browser').filter(name=>name.startsWith('play-')&&name.endsWith('.spec.js'));
    for(const file of files){
        const source=fs.readFileSync(path.join('tests/browser',file),'utf8');
        assert.doesNotMatch(source,/\btest\.only\b|\bdescribe\.only\b/,file);
    }
});

test('package integration command owns the consolidated cross-browser layer',()=>{
    const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
    assert.equal(pkg.scripts['test:play:integration'],'playwright test tests/browser/play-integration-consolidation.spec.js');
    assert.ok(pkg.scripts['test:play']);
    assert.ok(pkg.scripts['test:play:unit']);
});
