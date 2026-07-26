import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { getPrivateObjectiveArtifact, PRIVATE_OBJECTIVE_ARTIFACT_IDS } from '../../js/endgame-trainer/v2/private-objective-artifacts.js';
import { loadMultiMovePilot, MultiMovePilotController, shouldActivateMultiMovePilot } from '../../js/endgame-trainer/v2/multi-move-pilot.js';

const approvalDir = 'endgame-pools/private/human-approvals';
const expected = {
  'convert-material-advantage': ['approve-objective-pilot','reviewer:alexander:season-10.11b-conversion','sha256-d85d14b5c333b92df5dd5a4509ab025e8022045fb74a9eb73d85e1063c269a28'],
  'hold-draw': ['approve-with-objective-correction','reviewer:alexander:season-10.11b-hold-draw','sha256-10d353a1f7576d9311826b9c0d17bf3f09d4e648053b2892d5ef6ebceddd38f8'],
  'activate-king': ['approve-objective-pilot','reviewer:alexander:season-10.11b-activate-king-replacement','sha256-f3f79097b81528f3e4e1ba9622ca1eba2242902f65355ea7b6667dafb79921e6']
};
const canonicalDigest = value => `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

test('three complete exact human approvals are canonical and bound', () => {
  const files = fs.readdirSync(approvalDir).filter(file => file.endsWith('.approval.json'));
  assert.equal(files.length, 3);
  for (const file of files) {
    const record = JSON.parse(fs.readFileSync(`${approvalDir}/${file}`));
    const [decision, reviewer, digest] = expected[record.approvedObjectiveId];
    assert.equal(record.reviewDecision, decision);
    assert.equal(record.reviewerReference, reviewer);
    assert.equal(record.reviewRevision, 1);
    assert.equal(record.humanApproved, true);
    assert.equal(record.cryptographicallySigned, false);
    assert.equal(Object.keys(record.approvedFeedback).length, 11);
    assert.equal(record.approvedHintStages.length, 3);
    assert.equal(record.approvedHintStages[2].independentSuccessEligibilityAfterUse, false);
    assert.equal(JSON.stringify(record).includes(':null'), false);
    assert.equal(canonicalDigest(record), digest);
    const artifact = getPrivateObjectiveArtifact(`${record.approvedObjectiveId}@1.0.0`);
    assert.equal(artifact.humanApprovalBinding.digest, digest);
    assert.deepEqual(artifact.sourceEvidenceBinding, [
      record.reviewedPositionDigest, record.reviewedTablebaseTreeDigest,
      record.reviewedEngineEvidenceDigest, record.reviewedPacketDigest
    ]);
  }
});

test('private selector is closed, offline and fails neutral', async () => {
  for (const id of PRIVATE_OBJECTIVE_ARTIFACT_IDS) {
    const search = `?trainerV2=1&multiMovePilot=1&objectiveArtifact=${id}`;
    assert.equal(shouldActivateMultiMovePilot(search), true);
    let fetched = 0;
    const artifact = await loadMultiMovePilot({ search, fetchImpl: async () => { fetched += 1; } });
    assert.equal(fetched, 0);
    assert.equal(artifact.opponentPolicy.runtimeNetworkRequired, false);
    assert.equal(artifact.opponentPolicy.runtimeEngineRequired, false);
    assert.equal(artifact.opponentPolicy.persistence, false);
  }
  await assert.rejects(loadMultiMovePilot({ search: '?trainerV2=1&multiMovePilot=1&objectiveArtifact=unknown@1.0.0' }), /pilot-not-allowed/);
  await assert.rejects(loadMultiMovePilot({ search: '?trainerV2=1&multiMovePilot=1&objectiveArtifact=' }), /pilot-not-allowed/);
  await assert.rejects(loadMultiMovePilot({ search: '?trainerV2=1&multiMovePilot=1&objectiveArtifact=activate-king@1.0.0&objectiveArtifact=hold-draw@1.0.0' }), /pilot-not-allowed/);
});

test('all three authored routes execute to exact success offline', async () => {
  const routes = {
    'convert-material-advantage@1.0.0': ['c4d5','d3c4','c4d4'],
    'hold-draw@1.0.0': ['a2a3','a3a4','a4a5','a5a6'],
    'activate-king@1.0.0': ['c1b2','b2b3','b3c4']
  };
  for (const [id, moves] of Object.entries(routes)) {
    const artifact = getPrivateObjectiveArtifact(id);
    const controller = new MultiMovePilotController({ artifact });
    await controller.start();
    for (const uci of moves) await controller.submitMove({ from: uci.slice(0,2), to: uci.slice(2,4) });
    assert.equal(controller.getState().phase, 'objective-success', id);
  }
});

test('runtime rejects an artifact whose approval digest does not match', () => {
  const artifact = getPrivateObjectiveArtifact('activate-king@1.0.0');
  artifact.humanApprovalBinding.digest = `sha256-${'0'.repeat(64)}`;
  assert.throws(() => new MultiMovePilotController({ artifact }), /invalid-pilot/);
});
