import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { APPROVAL, registerAndBuild, validateApproval } from '../../scripts/register-season-10-6b-promote-pilot.mjs';
const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const packet = await read('../../endgame-pools/private/multi-move-review-packets/kp-coordinate-support-promote.json');
const graph = await read('../../endgame-pools/private/multi-move-tablebase/kp-coordinate-support-promote-state-graph.json');
test('exact human approval registers against four current bindings', () => assert.equal(validateApproval({ packet, graph }), true));
test('missing rationale, invalid decision, and stale digests fail closed', () => {
  assert.throws(() => validateApproval({ packet, graph, approval: { ...APPROVAL, reviewRationale: '' } }), /missing-rationale/);
  assert.throws(() => validateApproval({ packet, graph, approval: { ...APPROVAL, reviewDecision: 'defer' } }), /invalid-decision/);
  for (const key of ['reviewedPositionDigest','reviewedTablebaseTreeDigest','reviewedEngineEvidenceDigest','reviewedPacketDigest'])
    assert.throws(() => validateApproval({ packet, graph, approval: { ...APPROVAL, [key]: 'sha256-stale' } }), /stale-/);
});
test('bundle and artifact are deterministic and public data excludes private fields', async () => {
  const a=await registerAndBuild({write:false}),b=await registerAndBuild({write:false});assert.deepEqual(a,b);
  const text=JSON.stringify(a.artifact);assert.ok(!text.includes('reviewer:')&&!text.includes('reviewRationale'));
  assert.equal(a.artifact.branches.length,2);assert.equal(a.artifact.objective.maximumPly,12);
});
