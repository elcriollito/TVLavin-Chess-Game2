const sharedPolicy = Object.freeze({
  runtimeNetworkRequired: false,
  runtimeEngineRequired: false,
  runtimeTablebaseRequired: false,
  persistence: false,
  scoring: false
});

const feedback = {
  conversion: {
    progress: 'Good. The favorable exchange is complete and your king is entering the center.',
    acceptedAlternative: 'That move also preserves the win, but this exercise follows the approved conversion route.',
    conceptMiss: 'The position still wins, but this leaves the approved conversion route. Return to the previous position and continue.',
    objectiveMissResultPreserved: 'The position remains winning, but the approved c-pawn capture and conversion mechanism was not demonstrated.',
    failure: 'That move gives up the verified win.',
    objectiveFailure: 'The approved conversion mission can no longer be completed.',
    opponent: 'Black follows the reviewed defensive route while your king approaches the center.',
    success: 'Material converted. You removed the central blocker, activated the king, and preserved the win.',
    technical: 'The position could not be classified safely. This is not learner failure.',
    retry: 'The last approved position has been restored.',
    summary: 'You used the favorable pawn exchange to clear the center and activate the king.'
  },
  draw: {
    progress: 'Good. The pawn advances while the draw remains secure.',
    acceptedAlternative: 'That move also holds the draw, but this exercise follows the pawn-liquidation route.',
    conceptMiss: 'The position is still drawn, but this leaves the approved liquidation route. Return to the previous position and continue.',
    objectiveMissResultPreserved: 'The draw remains intact, but the required rook-pawn liquidation was not demonstrated.',
    failure: 'That move gives up the verified draw.',
    objectiveFailure: 'The approved liquidation route can no longer be completed.',
    opponent: "Black's king approaches the rook pawn while preserving the draw.",
    success: 'Draw held. The rook pawn was liquidated safely, leaving insufficient material.',
    technical: 'The position could not be classified safely. This is not learner failure.',
    retry: 'The last approved position has been restored.',
    summary: 'You preserved the draw and liquidated the rook pawn without disturbing the defensive balance.'
  },
  activation: {
    progress: 'Good. Your king is approaching the support square while the winning route remains intact.',
    acceptedAlternative: 'That king route also keeps the position winning, but this exercise follows the b2-b3-c4 route.',
    conceptMiss: 'The position still wins, but this move leaves the approved activation route. Return to the previous position and continue.',
    objectiveMissResultPreserved: 'The position remains winning, but the pawn advanced before the approved support event.',
    failure: 'That move gives up the verified win and allows a draw.',
    objectiveFailure: 'The approved king-support mission can no longer be completed.',
    opponent: "Black's king approaches while your king continues toward the support square.",
    success: 'King activated. You reached c4 with the pawn still on d3 and preserved the win.',
    technical: 'The position could not be classified safely. This is not learner failure.',
    retry: 'The last approved position has been restored.',
    summary: 'You let the king lead the pawn and reached the support square before advancing.'
  }
};

const hints = {
  conversion: ['Look for a favorable pawn exchange that removes the central blocker.', 'Choose the capture that opens a direct route for your king toward the center.', 'Reveal the approved learner move for the current node.'],
  draw: ['The position is already drawn. Look for a simple way to remove the last pawn without creating unnecessary complications.', 'Advance the rook pawn one square at a time while keeping your king stable.', 'Reveal the approved learner move for the current node.'],
  activation: ['Let the king lead the pawn. Advancing the pawn now gives up the win.', 'Guide the king along the b2-b3-c4 route while the pawn stays on d3.', 'Reveal the approved learner move for the current node.']
};

const node = (move, san, resultingFen, reply, replySan, replyFen, classifications, terminal = false) => ({
  approvedLearnerMove: { uci: move, san, resultingFen },
  opponentReply: reply ? { uci: reply, san: replySan, resultingFen: replyFen } : null,
  deviationClassifications: classifications,
  terminal
});

const artifacts = [
  {
    artifactSchemaVersion: '1.0.0', artifactId: 'convert-material-advantage@1.0.0',
    pilotId: 'convert-material-advantage', pilotVersion: '1.0.0',
    positionId: 'favorable-simplification-open-king-route',
    initialFen: '8/8/5k2/3p4/2P1P3/3K4/8/8 w - - 0 1',
    learnerSide: 'white', mission: 'Convert the material advantage with the c-pawn capture and king activation.',
    objective: { id: 'convert-material-advantage', version: '1.0.0', label: 'Convert the material advantage', maximumPly: 8 },
    opponentPolicy: { id: 'authored-deterministic-tree@1.0.0', ...sharedPolicy },
    branches: [{ branchId: 'approved-route', firstMove: 'cxd5', nodes: [
      node('c4d5', 'cxd5', '8/8/5k2/3P4/4P3/3K4/8/8 b - - 0 1', 'f6e7', 'Ke7', '8/4k3/8/3P4/4P3/3K4/8/8 w - - 1 2',
        { c4d5: 'approved', e4d5: 'objective-miss-result-preserved', c4c5: 'chess-result-failure', e4e5: 'chess-result-failure', d3c2: 'authored-concept-miss', d3d2: 'authored-concept-miss', d3e2: 'authored-concept-miss', d3c3: 'authored-concept-miss', d3e3: 'authored-concept-miss' }),
      node('d3c4', 'Kc4', '8/4k3/8/3P4/2K1P3/8/8/8 b - - 2 2', 'e7d6', 'Kd6', '8/8/3k4/3P4/2K1P3/8/8/8 w - - 3 3',
        { d3c4: 'approved', d3c3: 'authored-concept-miss', d3d4: 'authored-concept-miss', d3e3: 'authored-concept-miss', d3c2: 'authored-concept-miss', d3d2: 'authored-concept-miss', d3e2: 'authored-concept-miss', e4e5: 'authored-concept-miss' }),
      node('c4d4', 'Kd4', '8/8/3k4/3P4/3KP3/8/8/8 b - - 4 3', 'd6c7', 'Kc7', '8/2k5/8/3P4/3KP3/8/8/8 w - - 5 4',
        { c4d4: 'approved', c4b3: 'authored-concept-miss', c4c3: 'authored-concept-miss', c4d3: 'authored-concept-miss', c4b4: 'authored-concept-miss', c4b5: 'authored-concept-miss', c4c5: 'authored-concept-miss', e4e5: 'authored-concept-miss' }, true)
    ] }],
    terminalConditions: { requiredFen: '8/2k5/8/3P4/3KP3/8/8/8 w - - 5 4' },
    feedback: feedback.conversion, hints: hints.conversion,
    humanApprovalBinding: { digest: 'sha256-d85d14b5c333b92df5dd5a4509ab025e8022045fb74a9eb73d85e1063c269a28' },
    sourceEvidenceBinding: ['sha256-58c212529abfe98326f32b40de0ed1737302514b5bda04f47b567fc0ef19a8aa','sha256-9550b394b9b804dc935c6748d25676f2f1775f559c35a2006d00b3fd79512454','sha256-72411f7c2425c17cabb8aa2cd69102d13fe54e5d2e458f7d4fe9cd6477fa5533','sha256-fdc77958dd1f4adfb8fc531ab132ccc4cb66959e1fe892b90e508c36ef39589b']
  },
  {
    artifactSchemaVersion: '1.0.0', artifactId: 'hold-draw@1.0.0', pilotId: 'hold-draw', pilotVersion: '1.0.0',
    positionId: 'rook-pawn-liquidation', initialFen: '8/8/4k3/8/4K3/8/P7/8 w - - 0 1', learnerSide: 'white',
    mission: 'Preserve the draw through safe rook-pawn liquidation.',
    objective: { id: 'hold-draw', version: '1.0.0', label: 'Hold the draw', maximumPly: 10 },
    opponentPolicy: { id: 'authored-deterministic-tree@1.0.0', ...sharedPolicy },
    branches: [{ branchId: 'approved-route', firstMove: 'a3', nodes: [
      node('a2a3','a3','8/8/4k3/8/4K3/P7/8/8 b - - 0 1','e6d6','Kd6','8/8/3k4/8/4K3/P7/8/8 w - - 1 2',
        { a2a3:'approved',a2a4:'objective-miss-result-preserved',e4d3:'objective-miss-result-preserved',e4e3:'objective-miss-result-preserved',e4f3:'objective-miss-result-preserved',e4d4:'objective-miss-result-preserved',e4f4:'objective-miss-result-preserved',e4d5:'objective-miss-result-preserved',e4e5:'objective-miss-result-preserved',e4f5:'objective-miss-result-preserved' }),
      node('a3a4','a4','8/8/3k4/8/P3K3/8/8/8 b - - 0 2','d6c5','Kc5','8/8/8/2k5/P3K3/8/8/8 w - - 1 3',
        { a3a4:'approved',e4d3:'authored-concept-miss',e4e3:'authored-concept-miss',e4f3:'authored-concept-miss',e4d4:'authored-concept-miss',e4f4:'authored-concept-miss',e4d5:'authored-concept-miss',e4e5:'authored-concept-miss',e4f5:'authored-concept-miss' }),
      node('a4a5','a5','8/8/8/P1k5/4K3/8/8/8 b - - 0 3','c5b5','Kb5','8/8/8/Pk6/4K3/8/8/8 w - - 1 4',
        { a4a5:'approved',e4d3:'authored-concept-miss',e4e3:'authored-concept-miss',e4f3:'authored-concept-miss',e4d4:'authored-concept-miss',e4f4:'authored-concept-miss',e4d5:'authored-concept-miss',e4e5:'authored-concept-miss',e4f5:'authored-concept-miss' }),
      node('a5a6','a6','8/8/P7/1k6/4K3/8/8/8 b - - 0 4','b5a6','Kxa6','8/8/k7/8/4K3/8/8/8 w - - 0 5',
        { a5a6:'approved',e4d3:'authored-concept-miss',e4e3:'authored-concept-miss',e4f3:'authored-concept-miss',e4d4:'authored-concept-miss',e4f4:'authored-concept-miss',e4d5:'authored-concept-miss',e4e5:'authored-concept-miss',e4f5:'authored-concept-miss' }, true)
    ] }],
    terminalConditions: { requiredFen: '8/8/k7/8/4K3/8/8/8 w - - 0 5' }, feedback: feedback.draw, hints: hints.draw,
    humanApprovalBinding: { digest: 'sha256-10d353a1f7576d9311826b9c0d17bf3f09d4e648053b2892d5ef6ebceddd38f8' },
    sourceEvidenceBinding: ['sha256-9cb54a040b9f403c41573210f5a463e53004dce066b209249e1db47a33580af1','sha256-da2dcf8744dc5cd9f2a968ed23f4ebddac2cdfe6cf3325c2968bf331341eed48','sha256-d64d360e8f9c16840d2b63053b008806dd95a8c1d8488639c2fc3a2d7b7d11ac','sha256-0d9f313349a135d92505ea8241a3fd4898eff8ca255e350ff4d6b6dff9599f39']
  },
  {
    artifactSchemaVersion: '1.0.0', artifactId: 'activate-king@1.0.0', pilotId: 'activate-king', pilotVersion: '1.0.0',
    positionId: 'king-leads-pawn-to-c4-support', initialFen: '8/7k/8/8/8/3P4/8/2K5 w - - 0 1', learnerSide: 'white',
    mission: 'Bring the white king to c4 before advancing the d-pawn while preserving the verified win.',
    objective: { id: 'activate-king', version: '1.0.0', label: 'Activate the king', maximumPly: 8 },
    opponentPolicy: { id: 'authored-deterministic-tree@1.0.0', ...sharedPolicy },
    branches: [{ branchId: 'approved-route', firstMove: 'Kb2', nodes: [
      node('c1b2','Kb2','8/7k/8/8/8/3P4/1K6/8 b - - 1 1','h7g6','Kg6','8/8/6k1/8/8/3P4/1K6/8 w - - 2 2',
        { c1b2:'approved',c1c2:'accepted-alternative-result-preserved',c1d2:'accepted-alternative-result-preserved',c1b1:'authored-concept-miss',c1d1:'authored-concept-miss',d3d4:'chess-result-failure' }),
      node('b2b3','Kb3','8/8/6k1/8/8/1K1P4/8/8 b - - 3 2','g6f5','Kf5','8/8/8/5k2/8/1K1P4/8/8 w - - 4 3',
        { b2b3:'approved',b2c3:'accepted-alternative-result-preserved',b2a3:'authored-concept-miss',b2a2:'authored-concept-miss',b2c2:'authored-concept-miss',d3d4:'chess-result-failure',b2a1:'chess-result-failure',b2b1:'chess-result-failure',b2c1:'chess-result-failure' }),
      node('b3c4','Kc4','8/8/8/5k2/2K5/3P4/8/8 b - - 5 3',null,null,null,
        { b3c4:'success',b3b4:'accepted-alternative-result-preserved',b3c3:'authored-concept-miss',d3d4:'chess-result-failure',b3a2:'chess-result-failure',b3b2:'chess-result-failure',b3c2:'chess-result-failure',b3a3:'chess-result-failure',b3a4:'chess-result-failure' }, true)
    ] }],
    terminalConditions: { requiredFen: '8/8/8/5k2/2K5/3P4/8/8 b - - 5 3' }, feedback: feedback.activation, hints: hints.activation,
    humanApprovalBinding: { digest: 'sha256-f3f79097b81528f3e4e1ba9622ca1eba2242902f65355ea7b6667dafb79921e6' },
    sourceEvidenceBinding: ['sha256-2300d646206254ff076ad829f368b6316fb44514802d3bfab1ff3f258eb8214f','sha256-30bc29f005b681528a3858b5f1f648ac107a0f0d0b8e743926e62ec9c3993387','sha256-bc41fcee494ef9d9711a2a07b2b82765df4f02a72e6b18c14a68b30cacf7d9f9','sha256-78f1d981fa283b6146bcd3ee65633fe9f2649617264891c234b2982e9cc3c596']
  }
].map(item => Object.freeze({ ...item, privacy: 'private-technical-inspector', runtimeEligibility: true }));

const REGISTRY = new Map(artifacts.map(item => [item.artifactId, item]));
export const PRIVATE_OBJECTIVE_ARTIFACT_IDS = Object.freeze([...REGISTRY.keys()]);
export const PRIVATE_OBJECTIVE_APPROVAL_DIGESTS = Object.freeze(Object.fromEntries(
  artifacts.map(item => [item.artifactId, item.humanApprovalBinding.digest])
));
export const PRIVATE_OBJECTIVE_CONTENT_INTEGRITY = Object.freeze({
  'convert-material-advantage@1.0.0': Object.freeze({ fingerprint: 'eobjective-fnv1a32-796c6d4c', digest: 'sha256-85bb414f4cfd76ed43ddf0328f288d2abca2df33ff6c052cfd502bb3ef528db6' }),
  'hold-draw@1.0.0': Object.freeze({ fingerprint: 'eobjective-fnv1a32-d1d02d11', digest: 'sha256-ffb2bdaab1ef4ffc84d5ebadd528e47564c55c2edf3d1ee740bc3613e7302081' }),
  'activate-king@1.0.0': Object.freeze({ fingerprint: 'eobjective-fnv1a32-f2b249ef', digest: 'sha256-cfb7e1708a5d3ba8c861408ce6c6be84476492607ecf555bde762e1413ccd50a' })
});
export function getPrivateObjectiveArtifact(id) {
  const artifact = REGISTRY.get(id);
  return artifact ? structuredClone(artifact) : null;
}
