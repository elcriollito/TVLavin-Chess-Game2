import { rmSync } from 'node:fs';
import path from 'node:path';

export const GENERATED_OUTPUT_PREFIXES=Object.freeze([
  '.vercel/','dist/','build/','coverage/','node_modules/',
  'playwright-report/','test-results/','tmp/'
]);

const normalize=value=>String(value).replaceAll('\\','/').replace(/^\.\/+/,'');

export function isGeneratedOutput(file){
  const candidate=normalize(file);
  return GENERATED_OUTPUT_PREFIXES.some(prefix=>candidate===prefix.slice(0,-1)||candidate.startsWith(prefix));
}

export function discoverSelfContainedTests(trackedFiles){
  return Object.freeze(trackedFiles.map(normalize).filter(file=>
    !isGeneratedOutput(file) &&
    ((file.startsWith('tests/')&&/\.test\.(?:js|mjs|cjs)$/.test(file))||
      /^gateway\/fics-cloudflare-worker\/test\/.+\.test\.js$/.test(file)) &&
    file!=='tests/endgame-pools/remote-tablebase-live.test.js'
  ).sort());
}

export function cleanGeneratedOutputs(root,remove=rmSync){
  const resolvedRoot=path.resolve(root);
  for(const relative of ['.vercel/output','dist','build','coverage','playwright-report','test-results','tmp']){
    const target=path.resolve(resolvedRoot,relative);
    if(!target.startsWith(`${resolvedRoot}${path.sep}`))throw new Error('generated-output-target-invalid');
    remove(target,{recursive:true,force:true});
  }
}

const INTEGRATIONS=Object.freeze({
  worker:Object.freeze({
    variable:'WORKER_URL',
    dependency:'deployed CAISSA game-fetcher Worker',
    command:Object.freeze(['cloudflare-worker/test.js']),
    skip:'SKIP — external worker integration requires WORKER_URL',
    run:'npm run test:integration:worker'
  }),
  fics:Object.freeze({
    variable:'FICS_GATEWAY_URL',
    dependency:'local or explicitly configured FICS gateway',
    command:Object.freeze(['gateway/fics-cloudflare-worker/scripts/load-test.mjs','5']),
    skip:'SKIP — FICS integration requires local gateway at 127.0.0.1:8787',
    run:'FICS_GATEWAY_URL=http://127.0.0.1:8787 npm run test:integration:fics'
  })
});

export function resolveOptionalIntegration(kind,environment={}){
  const contract=INTEGRATIONS[kind];
  if(!contract)throw new Error('optional-integration-unknown');
  const configured=typeof environment[contract.variable]==='string'&&environment[contract.variable].length>0;
  return Object.freeze({...contract,configured});
}

export function runOptionalIntegration(kind,{environment=process.env,run}={}){
  const contract=resolveOptionalIntegration(kind,environment);
  if(!contract.configured)return Object.freeze({status:'skipped-external-dependency',exitCode:0,contract});
  const exitCode=run(contract.command);
  return Object.freeze({status:exitCode===0?'passed':'failed',exitCode,contract});
}
