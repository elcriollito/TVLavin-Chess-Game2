import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildPrivateFiveItemRunArtifact } from '../../scripts/build-season-10-11d-private-five-item-run.mjs';
import { PRIVATE_FIVE_ITEM_RUN_BASE } from '../../js/endgame-trainer/v2/private-five-item-run-manifest.js';
import {
  PRIVATE_FIVE_ITEM_RUN_DESCRIPTOR, PrivateFiveItemRunController, loadPrivateFiveItemRun,
  shouldActivatePrivateFiveItemRun, validatePrivateFiveItemRunManifest, validatePrivateFiveItemRunSearch
} from '../../js/endgame-trainer/v2/private-five-item-run.js';

const publicFiles = new Map();
for (const path of [
  '/data/endgame-pilots/kp-coordinate-support-promote/1.0.0.json',
  '/data/endgame-pilots/rule-square-a-pawn-catch-stop-promotion/1.0.0.json'
]) publicFiles.set(path, JSON.parse(await readFile(new URL(`../../public${path}`, import.meta.url), 'utf8')));
const fetchImpl = async url => ({ ok: publicFiles.has(url), json: async () => structuredClone(publicFiles.get(url)) });
const valid = '?trainerV2=1&multiMovePilot=1&privateEndgameRun=five-item';
const intent = uci => ({ from: uci.slice(0,2), to: uci.slice(2,4), ...(uci[4] ? { promotion: uci[4] } : {}) });
const routes = [
  ['e5f6','e4e5','e5e6','e6e7','e7e8q'],
  ['d1c2','c2b1','b1a1','a1a2'],
  ['c4d5','d3c4','c4d4'],
  ['a2a3','a3a4','a4a5','a5a6'],
  ['c1b2','b2b3','b3c4']
];
const expectedIds = [
  'kp-coordinate-support-promote@1.0.0','rule-square-a-pawn-catch-stop-promotion@1.0.0',
  'convert-material-advantage@1.0.0','hold-draw@1.0.0','activate-king@1.0.0'
];

test('private manifest is exact, canonical, deterministic and contains five bindings only', async () => {
  const generated = buildPrivateFiveItemRunArtifact();
  assert.equal(generated.runId, 'five-item-private-endgame-run');
  assert.equal(generated.runVersion, '1.0.0');
  assert.equal(generated.itemCount, 5);
  assert.deepEqual(generated.orderedItems.map(item => `${item.artifactId}@${item.artifactVersion}`), expectedIds);
  assert.equal(new Set(expectedIds).size, 5);
  assert.equal(generated.contentFingerprint, 'eprivrun-fnv1a32-c4aafa8e');
  assert.equal(generated.contentDigest, 'sha256-f50657b6f20b7f5bfd819ff9c32a84a0bf5e46ce6b4068dbb2fdea1f711e0fb9');
  assert.equal(generated.canonicalByteLength, 2862);
  assert.equal(generated.persistencePolicy, 'none');
  assert.equal(generated.analyticsPolicy, 'disabled');
  assert.equal(generated.runtimeEligibility, 'private-flag-only');
  assert.equal(generated.completionPolicy, 'all-five-items-must-reach-approved-success');
  assert.doesNotMatch(JSON.stringify(generated), /timestamp|retrievedAt|deployment|commit|C:\\|ALEXANDER|uuid/i);
  assert.deepEqual(generated, buildPrivateFiveItemRunArtifact());
  const loaded = await loadPrivateFiveItemRun({ fetchImpl, search: valid });
  assert.deepEqual(loaded.manifest, structuredClone(PRIVATE_FIVE_ITEM_RUN_BASE));
});

test('strict private flag and all mixed modes fail closed', async () => {
  assert.equal(shouldActivatePrivateFiveItemRun(valid), true);
  assert.equal(validatePrivateFiveItemRunSearch(valid), true);
  for (const search of [
    '?trainerV2=1&multiMovePilot=1&privateEndgameRun=',
    '?trainerV2=1&multiMovePilot=1&privateEndgameRun=unknown',
    `${valid}&privateEndgameRun=five-item`, `${valid}&objectiveArtifact=activate-king@1.0.0`,
    `${valid}&endgameRun=1`, '?trainerV2=1&multiMovePilot=1&objectiveArtifact=x&endgameRun=1',
    `${valid}&filename=x`, `${valid}&url=https://example.com`
  ]) {
    assert.equal(shouldActivatePrivateFiveItemRun(search), true);
    assert.throws(() => validatePrivateFiveItemRunSearch(search));
    await assert.rejects(loadPrivateFiveItemRun({ fetchImpl, search }));
  }
});

test('five approved successes advance only after manual Continue and produce ephemeral summary', async () => {
  const run = new PrivateFiveItemRunController({ fetchImpl });
  assert.equal(await run.load(valid), true); assert.equal(await run.start(), true);
  for (let index=0; index<routes.length; index++) {
    assert.equal(run.getState().currentItemIndex,index);
    for (const move of routes[index]) await run.submitMove(intent(move));
    assert.equal(run.getState().status,'item-success');
    assert.equal(run.getState().currentItemIndex,index);
    assert.equal(await run.continue(),true);
  }
  const state=run.getState();
  assert.equal(state.status,'run-success');
  assert.deepEqual(state.completedItemIndexes,[0,1,2,3,4]);
  assert.equal(state.summary.independentCompletion,true);
  assert.deepEqual(state.summary.items.map(item=>item.completed),[true,true,true,true,true]);
  run.exit(); assert.deepEqual(run.getState().completedItemIndexes,[]);
});

test('pedagogical misses remain on the current item and preserve prior completions', async () => {
  const run = new PrivateFiveItemRunController({ fetchImpl });
  await run.load(valid); await run.start();
  for (const move of routes[0]) await run.submitMove(intent(move)); await run.continue();
  for (const move of routes[1]) await run.submitMove(intent(move)); await run.continue();
  await run.submitMove(intent('e4d5'));
  assert.equal(run.getState().currentItemIndex,2);
  assert.equal(run.getState().status,'active');
  assert.match(run.getState().itemState.feedback,/remains winning/);
  assert.deepEqual(run.getState().completedItemIndexes,[0,1]);
});

test('Stage 3 is sticky across item retry and full restart restores independence', async () => {
  const run = new PrivateFiveItemRunController({ fetchImpl });
  await run.load(valid); await run.start();
  run.hint(); run.hint(); assert.equal(run.getState().runIndependentSuccessEligible,true);
  run.hint(); assert.equal(run.getState().runIndependentSuccessEligible,false);
  await run.submitMove(intent('e5d5')); run.retryCurrent();
  assert.equal(run.getState().runIndependentSuccessEligible,false);
  await run.restart();
  assert.equal(run.getState().runIndependentSuccessEligible,true);
  assert.deepEqual(run.getState().completedItemIndexes,[]);
});

test('restart current preserves run independence and completed items while technical boundary is neutral', async () => {
  const run = new PrivateFiveItemRunController({ fetchImpl });
  await run.load(valid); await run.start();
  for (const move of routes[0]) await run.submitMove(intent(move)); await run.continue();
  run.hint(); run.hint(); run.hint();
  assert.equal(await run.restartCurrent(), true);
  assert.deepEqual(run.getState().completedItemIndexes, [0]);
  assert.equal(run.getState().runIndependentSuccessEligible, false);
  assert.equal(run.reportTechnicalUnavailable(), true);
  assert.equal(run.getState().status, 'technical-unavailable');
  assert.deepEqual(run.getState().completedItemIndexes, [0]);
  assert.equal(await run.retryTechnical(valid), true);
  assert.equal(run.getState().status, 'active');
});

test('technical boundary abandons a pending opponent reply and prevents stale mutation', async () => {
  let release;
  const delay = () => new Promise(resolve => { release = resolve; });
  const run = new PrivateFiveItemRunController({ fetchImpl, delay });
  await run.load(valid); await run.start();
  const pending = run.submitMove(intent('e5f6'));
  while (!release) await new Promise(resolve => setImmediate(resolve));
  assert.equal(run.getState().itemState.phase, 'opponent-evaluating');
  assert.equal(run.reportTechnicalUnavailable(), true);
  release(); await pending;
  assert.equal(run.getState().status, 'technical-unavailable');
  assert.equal(run.getState().itemState, null);
  assert.deepEqual(run.getState().completedItemIndexes, []);
});

test('manifest mutations and artifact binding failures are neutral and block partial start', async () => {
  for (const mutate of [
    manifest => manifest.orderedItems.reverse(),
    manifest => manifest.orderedItems.pop(),
    manifest => manifest.orderedItems.push(structuredClone(manifest.orderedItems[0])),
    manifest => manifest.orderedItems.push({ artifactId:'sixth',artifactVersion:'1.0.0' }),
    manifest => { manifest.orderedItems[0].artifactId='unknown'; }
  ]) {
    const manifest=structuredClone(PRIVATE_FIVE_ITEM_RUN_BASE); mutate(manifest); manifest.itemCount=manifest.orderedItems.length;
    await assert.rejects(validatePrivateFiveItemRunManifest(manifest));
  }
  const badFetch = async url => {
    const value=structuredClone(publicFiles.get(url));
    if(url.includes('kp-coordinate')) value.contentDigest=`sha256-${'0'.repeat(64)}`;
    return {ok:true,json:async()=>value};
  };
  const run=new PrivateFiveItemRunController({fetchImpl:badFetch});
  assert.equal(await run.load(valid),false);
  assert.equal(run.getState().status,'technical-unavailable');
  assert.deepEqual(run.getState().completedItemIndexes,[]);
});
