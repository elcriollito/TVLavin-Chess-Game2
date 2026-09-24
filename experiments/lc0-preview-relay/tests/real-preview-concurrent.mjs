import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.env.EAE012_LIVE_PREVIEW !== '1') throw new Error('EAE012_LIVE_PREVIEW_REQUIRED');
const script = fileURLToPath(new URL('./real-preview-smoke.mjs', import.meta.url));

function run(index) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn(process.execPath, [script], { env: {
      ...process.env, EAE012_CYCLES: '1', EAE012_SEARCH_MODE: 'infinite'
    }, windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      const ended = Date.now();
      if (code !== 0) return reject(new Error(`session ${index}: ${stderr.slice(-3000)}`));
      const line = stdout.split('\n').find(value => value.startsWith('EAE012_REAL_PREVIEW_SMOKE '));
      if (!line) return reject(new Error(`session ${index}: missing report`));
      resolve({ index, started, ended, report: JSON.parse(line.slice('EAE012_REAL_PREVIEW_SMOKE '.length)) });
    });
  });
}

const sessions = await Promise.all([run(1), run(2)]);
for (const item of sessions) {
  assert.equal(item.report.mainStream.bestmoves, 1);
  assert.equal(item.report.engine.workers, 0);
  assert.equal(item.report.cleanup.pthreadWorkers, 0);
  assert.equal(item.report.cleanup.forcedTerminations, 0);
  assert.deepEqual(item.report.pageErrors, []);
}
assert.notEqual(sessions[0].report.runtime.runtimeInstanceId,
  sessions[1].report.runtime.runtimeInstanceId);
const overlapMs = Math.min(...sessions.map(item => item.ended)) -
  Math.max(...sessions.map(item => item.started));
assert.ok(overlapMs > 0, 'sessions did not overlap');
console.log(`EAE012_CONCURRENT ${JSON.stringify({ count: sessions.length, overlapMs,
  maxWorkers: sessions.map(item => item.report.engine.maxWorkers),
  totalPeakWorkers: sessions.reduce((sum, item) => sum + item.report.engine.maxWorkers, 0),
  cleanupWorkers: sessions.map(item => item.report.engine.workers),
  forced: sessions.map(item => item.report.cleanup.forcedTerminations) })}`);
