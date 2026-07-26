import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildRunArtifact } from '../../scripts/build-season-10-9-endgame-run.mjs';
import { EndgameRunController, loadEndgameRun, shouldActivateEndgameRun } from '../../js/endgame-trainer/v2/endgame-run.js';

const files = new Map();
for (const path of [
  '/data/endgame-runs/endgame-run-technical-two-item/1.0.0.json',
  '/data/endgame-pilots/kp-coordinate-support-promote/1.0.0.json',
  '/data/endgame-pilots/rule-square-a-pawn-catch-stop-promotion/1.0.0.json'
]) files.set(path, JSON.parse(await readFile(new URL(`../../public${path}`, import.meta.url), 'utf8')));
const fetchImpl = async url => ({ ok: files.has(url), json: async () => structuredClone(files.get(url)) });
const intent = uci => ({ from: uci.slice(0,2), to: uci.slice(2,4), ...(uci[4] ? { promotion: uci[4] } : {}) });
const promote = ['e5f6','e4e5','e5e6','e6e7','e7e8q'];
const stop = ['d1c2','c2b1','b1a1','a1a2'];

test('run artifact is immutable, exact, deterministic, and contains no private fields', async () => {
  assert.deepEqual(buildRunArtifact(), files.get('/data/endgame-runs/endgame-run-technical-two-item/1.0.0.json'));
  const artifact = await loadEndgameRun({ fetchImpl });
  assert.equal(artifact.runId, 'endgame-run-technical-two-item');
  assert.deepEqual(artifact.items.map(item => item.objectiveId), ['promote','stop-promotion']);
  assert.equal(artifact.contentFingerprint, 'erun-fnv1a32-1a41792e');
  assert.equal(artifact.contentDigest, 'sha256-2c9166f00b04c6c7fcf8540c9388bfe9d1b27d56f21d17b7beead5c549724229');
  assert.doesNotMatch(JSON.stringify(artifact), /reviewer|rationale|tablebaseTree|Stockfish|private/i);
});
test('run gate is exact, hidden, injection-safe, and preserves Guided precedence', () => {
  const valid = '?trainerV2=1&multiMovePilot=1&endgameRun=1';
  assert.equal(shouldActivateEndgameRun(valid), true);
  for (const search of [
    '?trainerV2=1&multiMovePilot=1&endgameRun=true',
    `${valid}&run=x`, `${valid}&pilot=kp-coordinate-support-promote@1.0.0`,
    `${valid}&fen=x`, `${valid}&studyUnit=x`
  ]) assert.equal(shouldActivateEndgameRun(search), false);
});
test('two verified item controllers run sequentially and aggregate one local summary', async () => {
  const run = new EndgameRunController({ fetchImpl });
  assert.equal(run.getState().status, 'run-configured');
  assert.equal(await run.load(), true); assert.equal(run.getState().status, 'run-ready');
  assert.equal(await run.start(), true); assert.equal(run.getState().currentItemIndex, 0);
  for (const move of promote) assert.equal(await run.submitMove(intent(move)), true);
  assert.equal(run.getState().status, 'run-item-complete');
  assert.equal(await run.continue(), true); assert.equal(run.getState().currentItemIndex, 1);
  for (const move of stop) assert.equal(await run.submitMove(intent(move)), true);
  assert.equal(await run.continue(), true);
  assert.equal(run.getState().status, 'run-summary');
  assert.equal(run.getState().summary.independentSuccessCount, 2);
  assert.equal(run.getState().itemResults.length, 2);
});
test('retry item, drawing objective miss, retry run, duplicate continue, and exit are guarded', async () => {
  const run = new EndgameRunController({ fetchImpl });
  await run.load(); await run.start();
  await run.submitMove(intent('e5d5'));
  assert.equal(run.retryItem(), true); assert.equal(run.getState().itemResults.length, 0);
  for (const move of promote) await run.submitMove(intent(move));
  const firstContinue = run.continue();
  assert.equal(await run.continue(), false); assert.equal(await firstContinue, true);
  await run.submitMove(intent('d1d2'));
  assert.equal(run.getState().itemState.result, 'objective-miss-while-drawing');
  await run.continue();
  assert.equal(run.getState().summary.objectiveMissWhileDrawingCount, 1);
  assert.equal(await run.retryRun(), true); assert.equal(run.getState().currentItemIndex, 0);
  assert.deepEqual(run.getState().itemResults, []);
  assert.equal(run.exit(), true); assert.equal(run.getState().status, 'run-abandoned');
  assert.deepEqual(run.getState().itemResults, []);
});
test('run artifact or item integrity failure is neutral and fails the whole run closed', async () => {
  const badFetch = async url => {
    const value = structuredClone(files.get(url));
    if (url.includes('endgame-runs')) value.itemCount = 3;
    return { ok: true, json: async () => value };
  };
  const run = new EndgameRunController({ fetchImpl: badFetch });
  assert.equal(await run.load(), false);
  assert.equal(run.getState().status, 'run-technical-unavailable');
  assert.equal(run.getState().technicalUnavailable, true);
  assert.deepEqual(run.getState().itemResults, []);
});
