import { spawnSync } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { createPlayRegressionResult } from './play-regression-result.mjs';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const commands = Object.freeze([
  ['unit', ['run', 'test:play:unit']],
  ['integration', ['run', 'test:play:integration']],
  ['responsive', ['run', 'test:play:responsive']],
  ['hard-invariants', ['run', 'test:play:hard-invariants']],
  ['cross-browser-smoke', ['run', 'test:play:regression:smoke']],
  ['full-play', ['run', 'test:play']],
  ['static-guards', ['run', 'test:play:static-guards']],
  ['repository', ['run', 'test:regression']]
]);

const baseline = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const runId = `play-regression-${Date.now()}`;
const suites = [];

for (const [suiteId, args] of commands) {
  console.log(`\n[play-regression] START ${suiteId}: npm ${args.join(' ')}`);
  const started = Date.now();
  const environment = { ...process.env, CI: '1' };
  const result = process.platform === 'win32'
    ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `npm ${args.join(' ')}`], {
        stdio: 'inherit', env: environment
      })
    : spawnSync(npm, args, { stdio: 'inherit', env: environment });
  const status = result.status === 0 ? 'passed' : 'failed';
  suites.push({ suiteId, status, durationMs: Date.now() - started });
  if (status === 'failed') {
    const summary = createPlayRegressionResult({ runId, baseline, suites, blockers: [`${suiteId}-failed`] });
    console.error(`[play-regression] RESULT ${JSON.stringify(summary)}`);
    process.exit(result.status ?? 1);
  }
  console.log(`[play-regression] PASS ${suiteId}`);
}

const summary = createPlayRegressionResult({
  runId, baseline, suites, skipped: 3,
  external: ['external-worker', 'fics-gateway', 'live-tablebase'],
  manual: ['manual-chess', 'physical-devices', 'screen-readers'],
  warnings: ['external-and-manual-gates-are-not-local-passes']
});
console.log(`[play-regression] RESULT ${JSON.stringify(summary)}`);
