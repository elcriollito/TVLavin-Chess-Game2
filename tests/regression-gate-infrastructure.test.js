import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cleanGeneratedOutputs, discoverSelfContainedTests, isGeneratedOutput,
  resolveOptionalIntegration, runOptionalIntegration
} from '../scripts/regression-contracts.mjs';

test('canonical discovery includes versioned tests and excludes generated outputs and live integrations',()=>{
  const found=discoverSelfContainedTests([
    'tests/unit.test.js','gateway/fics-cloudflare-worker/test/gateway-utils.test.js',
    '.vercel/output/static/tests/copied.test.js','coverage/test.test.js',
    'node_modules/package/test.test.js','playwright-report/test.test.js',
    'test-results/test.test.js','cloudflare-worker/test.js',
    'gateway/fics-cloudflare-worker/scripts/load-test.mjs',
    'tests/endgame-pools/remote-tablebase-live.test.js'
  ]);
  assert.deepEqual(found,[
    'gateway/fics-cloudflare-worker/test/gateway-utils.test.js','tests/unit.test.js'
  ]);
  for(const path of ['.vercel/output/a.test.js','coverage/a.test.js','test-results/a.test.js'])
    assert.equal(isGeneratedOutput(path),true);
});

test('cleanup is bounded to exact regenerable directories',()=>{
  const removed=[];
  cleanGeneratedOutputs(process.cwd(),(target,options)=>removed.push({target,options}));
  assert.equal(removed.length,7);
  assert.ok(removed.every(item=>item.target.startsWith(process.cwd())));
  assert.ok(removed.every(item=>item.options.recursive&&item.options.force));
});

test('missing external dependencies produce explicit skips with separate run instructions',()=>{
  for(const kind of ['worker','fics']){
    const result=runOptionalIntegration(kind,{environment:{},run:()=>assert.fail('must not run')});
    assert.equal(result.status,'skipped-external-dependency');assert.equal(result.exitCode,0);
    assert.match(result.contract.skip,/^SKIP — /);assert.match(result.contract.run,/test:integration:/);
  }
});

test('configured external integrations execute and preserve internal failures',()=>{
  const worker=resolveOptionalIntegration('worker',{WORKER_URL:'https://worker.example'});
  assert.equal(worker.configured,true);
  assert.deepEqual(runOptionalIntegration('worker',{
    environment:{WORKER_URL:'https://worker.example'},run:()=>0
  }),expectResult('worker','passed',0));
  const failed=runOptionalIntegration('fics',{
    environment:{FICS_GATEWAY_URL:'http://127.0.0.1:8787'},run:()=>7
  });
  assert.equal(failed.status,'failed');assert.equal(failed.exitCode,7);
});

function expectResult(kind,status,exitCode){
  return {status,exitCode,contract:resolveOptionalIntegration(kind,{
    WORKER_URL:'https://worker.example',FICS_GATEWAY_URL:'http://127.0.0.1:8787'
  })};
}
