import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { assertDeepFrozen, assertJsonSafe, assertNoDangerousKeys } from './helpers/contract-assertions.js';

const root=process.cwd();
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name)]);
const testFiles=walk(path.join(root,'tests/play')).filter(file=>file.endsWith('.test.js'));

test('coverage manifest declares every required subsystem with an exact status',()=>{
    const manifest=fs.readFileSync(path.join(root,'docs/audits/PLAY_UNIT_TEST_COVERAGE.md'),'utf8');
    const required=['Routing','Mode state','FairPlay','Bots','Coach','Players','GameLifecycle','Results','Clocks','GameRecord','EvaluationRail','PostGame','Mentor','Worker','Lazy loading','Event lifecycle','Performance','Visual and themes','Accessibility'];
    for(const subsystem of required)assert.match(manifest,new RegExp(`\\\\| ${subsystem.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&')} \\\\|`),subsystem);
    const rows=manifest.split('\n').filter(line=>line.startsWith('| ')&&!line.startsWith('| Subsystem')&&!line.startsWith('|---'));
    assert.equal(rows.length,required.length);
    for(const row of rows)assert.match(row,/\| (complete|partial|blocked|external|manual-only) \|$/);
});

test('every authoritative manifest test file exists and Play unit tests have no skips',()=>{
    const manifest=fs.readFileSync(path.join(root,'docs/audits/PLAY_UNIT_TEST_COVERAGE.md'),'utf8');
    for(const match of manifest.matchAll(/`([^`]+\.test\.js)`/g)){
        const candidates=testFiles.filter(file=>file.replaceAll('\\','/').endsWith(`/tests/play/${match[1]}`)||file.replaceAll('\\','/').endsWith(`/play/${match[1]}`));
        assert.ok(candidates.length>0,match[1]);
    }
    for(const file of testFiles){
        const source=fs.readFileSync(file,'utf8');
        assert.doesNotMatch(source,/\b(?:test|describe)\.skip\b|\bskip\s*:/,path.relative(root,file));
    }
});

test('unit test titles are unique and descriptive',()=>{
    const titles=new Map();
    for(const file of testFiles){
        const source=fs.readFileSync(file,'utf8');
        for(const match of source.matchAll(/\btest\s*\(\s*(['"`])([^\n]+?)\1/g)){
            assert.ok(match[2].trim().length>=8,`${path.relative(root,file)}: ${match[2]}`);
            const locations=titles.get(match[2])||[];locations.push(path.relative(root,file));titles.set(match[2],locations);
        }
    }
    const duplicates=[...titles].filter(([,files])=>files.length>1);
    assert.deepEqual(duplicates,[]);
});

test('Play fixtures remain test-only and production files do not reference them',()=>{
    const fixtures=walk(path.join(root,'tests/play/fixtures')).filter(file=>file.endsWith('.js'));
    assert.equal(fixtures.length,5);
    const production=walk(root).filter(file=>file.endsWith('.js')&&!file.includes(`${path.sep}tests${path.sep}`)&&!file.includes(`${path.sep}node_modules${path.sep}`)&&!file.includes(`${path.sep}.git${path.sep}`));
    for(const file of production){
        const source=fs.readFileSync(file,'utf8');
        assert.doesNotMatch(source,/tests[\\/]play[\\/]fixtures|fake-worker-lifecycle|mentor-summary-fixtures|knowledge-integration-fixtures/,path.relative(root,file));
    }
});

test('shared contract assertions expose strict immutable JSON-safe diagnostics',()=>{
    const value=Object.freeze({schemaVersion:'1.0.0',nested:Object.freeze({count:1})});
    assertDeepFrozen(value,'fixture');
    assertJsonSafe(value,'fixture');
    assertNoDangerousKeys(value,'fixture');
    assert.throws(()=>assertDeepFrozen({nested:{}},'mutable'),/must be frozen/);
    assert.throws(()=>assertJsonSafe({handler(){}},'unsafe'),/not JSON-safe/);
});

test('package scripts provide one complete unit owner and preserve regression ownership',()=>{
    const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
    assert.equal(pkg.scripts['test:play:unit'],'node --test tests/play/*.test.js tests/play/*/*.test.js');
    assert.equal(pkg.scripts['test:play:unit:consolidation'],'node --test tests/play/unit-coverage-manifest.test.js');
    assert.ok(pkg.scripts['test:regression']);
    assert.ok(pkg.scripts['test:play']);
});
