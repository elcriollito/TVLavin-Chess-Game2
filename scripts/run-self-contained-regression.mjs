import { execFileSync, spawnSync } from 'node:child_process';
import process from 'node:process';
import { cleanGeneratedOutputs, discoverSelfContainedTests } from './regression-contracts.mjs';

const root=process.cwd();
cleanGeneratedOutputs(root);
const tracked=execFileSync('git',['ls-files'],{cwd:root,encoding:'utf8'})
  .split(/\r?\n/).filter(Boolean);
const tests=discoverSelfContainedTests(tracked);
if(!tests.length)throw new Error('self-contained-test-discovery-empty');

console.log(`Self-contained regression: ${tests.length} versioned test files`);
console.log('SKIP — external worker integration requires WORKER_URL');
console.log('Run: npm run test:integration:worker');
console.log('SKIP — FICS integration requires local gateway at 127.0.0.1:8787');
console.log('Run: FICS_GATEWAY_URL=http://127.0.0.1:8787 npm run test:integration:fics');
console.log('SKIP — deliberate live tablebase test requires explicit network opt-in');
console.log('Run: npm run test:endgame-remote-tablebase:live');

const result=spawnSync(process.execPath,['--test',...tests],{
  cwd:root,stdio:'inherit',env:process.env
});
process.exitCode=result.status??1;
