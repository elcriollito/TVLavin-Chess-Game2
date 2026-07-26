import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChessRulesFacade } from '../js/endgame-trainer/chess-rules-facade.js';
import { fetchRemoteTablebase, normalizeTablebaseResponse, REMOTE_PROVIDER, sha256 } from './endgame-remote-tablebase.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(root, 'endgame-pools/private/multi-move-review-packets');
const evidenceDirectory = join(root, 'endgame-pools/private/multi-move-tablebase');
const enginePath = join(root, 'endgame-pools/private/evidence/caissa-king-pawn-decisions-1.1.0.stockfish-18.json');
export const INITIAL_FEN = '8/2k5/8/4K3/4P3/8/8/8 w - - 0 1';
export const APPROVED_FIRST_MOVES = Object.freeze(['e5e6', 'e5f6']);
export const ALLOWED_DECISIONS = Object.freeze([
  'approve-promote-pilot', 'approve-with-tree-corrections', 'approve-with-policy-corrections',
  'approve-with-objective-correction', 'requires-more-tablebase-evidence',
  'requires-more-engine-evidence', 'requires-new-position',
  'reject-multi-move-candidate', 'defer'
]);
const MAXIMUM_EXPLORED_PLY = 18;
const canonicalKey = fen => fen.split(' ').slice(0, 4).join(' ');
const writeJson = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');

function chooseLearnerMove(evidence) {
  const preserving = evidence.moves.filter(move => evidence.wdlPreservingMoves.includes(move.uci));
  return preserving.find(move => move.uci.length === 5) ??
    preserving.find(move => !move.san.startsWith('K')) ??
    [...preserving].sort((a, b) => a.uci.localeCompare(b.uci))[0];
}

function chooseOpponentMove(evidence, policyId) {
  const preserving = evidence.moves.filter(move => evidence.wdlPreservingMoves.includes(move.uci));
  if (policyId === 'wdl-dtz-uci') {
    const optimal = preserving.filter(move => evidence.dtzOptimalMoves.includes(move.uci));
    return [...(optimal.length ? optimal : preserving)].sort((a, b) => a.uci.localeCompare(b.uci))[0];
  }
  if (policyId === 'maximum-resistance') {
    return [...preserving].sort((a, b) =>
      Math.abs(b.dtz ?? 0) - Math.abs(a.dtz ?? 0) || a.uci.localeCompare(b.uci))[0];
  }
  return [...preserving].sort((a, b) => a.uci.localeCompare(b.uci))[0];
}

function validateMove(fen, move) {
  const rules = ChessRulesFacade.fromFen(fen);
  const applied = rules.move(move.uci);
  if (applied.san !== move.san || rules.fen() !== move.resultingFen) throw new Error('graph-move-invalid');
}

async function getEvidence(fen, fetchImpl, cache) {
  const key = canonicalKey(fen);
  if (cache.has(key)) return cache.get(key);
  const response = await fetchRemoteTablebase(fen, { fetchImpl });
  const evidence = normalizeTablebaseResponse({
    positionId: `kp-coordinate-support-promote:${sha256(key).slice(-16)}`,
    fen, positionContentDigest: sha256({ candidate: 'kp-coordinate-support-promote', fen: key }),
    body: response.body, httpStatus: response.httpStatus, retrievedAt: null
  });
  evidence.moves.forEach(move => validateMove(fen, move));
  cache.set(key, evidence);
  return evidence;
}

function reviewTemplate() {
  return Object.fromEntries([
    'reviewDecision', 'reviewRationale', 'reviewerReference', 'reviewRevision',
    'approvedObjectiveId', 'approvedObjectiveVersion', 'approvedInitialFen', 'approvedLearnerSide',
    'approvedFirstMoves', 'approvedSubsequentLearnerMoves', 'approvedOpponentPolicy',
    'approvedTieBreakRule', 'approvedSuccessCondition', 'approvedFailureCondition',
    'approvedMaximumPly', 'approvedTechnicalFailureBehavior', 'approvedHintStages',
    'approvedFeedback', 'reviewedPositionDigest', 'reviewedTablebaseTreeDigest',
    'reviewedEngineEvidenceDigest', 'reviewedPacketDigest'
  ].map(key => [key, null]));
}

export async function generateMultiMoveReview({ fetchImpl = fetch, write = true } = {}) {
  const engineCollection = JSON.parse(await readFile(enginePath, 'utf8'));
  const engine = engineCollection.records.find(record => record.positionId === 'kp-coordinate-support');
  if (!engine) throw new Error('engine-evidence-missing');
  const policies = [
    { policyId: 'wdl-dtz-uci', label: 'Candidate A — WDL then DTZ then UCI', benefit: 'Exact and compact.', risk: 'DTZ play may look unnatural.' },
    { policyId: 'maximum-resistance', label: 'Candidate B — Maximum resistance', benefit: 'Tests conversion technique longer.', risk: 'Can produce repetitive king movement.' },
    { policyId: 'authored-deterministic-tree', label: 'Candidate C — Authored deterministic tree', benefit: 'Human can choose the clearest defense.', risk: 'Requires explicit human selection of every reply.' }
  ];
  const evidenceCache = new Map();
  const lines = [];
  for (const firstMove of APPROVED_FIRST_MOVES) for (const policy of policies) {
    let fen = INITIAL_FEN;
    const plies = [];
    for (let ply = 1; ply <= MAXIMUM_EXPLORED_PLY; ply += 1) {
      const evidence = await getEvidence(fen, fetchImpl, evidenceCache);
      let selected;
      if (ply === 1) selected = evidence.moves.find(move => move.uci === firstMove);
      else selected = ChessRulesFacade.fromFen(fen).sideToMove() === 'white'
        ? chooseLearnerMove(evidence) : chooseOpponentMove(evidence, policy.policyId);
      if (!selected) break;
      plies.push({
        ply, side: ChessRulesFacade.fromFen(fen).sideToMove(), fen,
        category: evidence.category, dtz: evidence.dtz ?? null,
        legalMoves: evidence.moves, wdlPreservingMoves: evidence.wdlPreservingMoves,
        dtzOptimalMoves: evidence.dtzOptimalMoves, proposedMove: selected,
        proposalStatus: ply === 1 ? 'previously-human-approved-first-move' : 'unapproved-human-review-required',
        evidenceDigest: evidence.evidenceDigest
      });
      fen = selected.resultingFen;
      if (selected.uci.length === 5) break;
    }
    lines.push({
      lineId: `${firstMove}-${policy.policyId}`, firstMove, policyId: policy.policyId,
      plies, terminal: plies.at(-1)?.proposedMove.uci.length === 5 ? 'legal-promotion' : 'maximum-ply-or-no-candidate'
    });
  }
  const states = [...evidenceCache.values()].sort((a, b) => a.positionFen.localeCompare(b.positionFen));
  const graphBase = {
    graphSchemaVersion: '1.0.0', initialFen: INITIAL_FEN, maximumExploredPly: MAXIMUM_EXPLORED_PLY,
    boundary: 'six-policy-lines-two-approved-first-moves; each expanded node retains every locally validated provider move',
    states, lines
  };
  const candidateStateGraph = { ...graphBase, graphDigest: sha256(graphBase) };
  const packetBase = {
    packetSchemaVersion: '1.0.0',
    packetId: 'caissa-multi-move-review:kp-coordinate-support:promote@1.0.0',
    positionId: 'kp-coordinate-support', sourcePoolId: 'caissa-king-pawn-decisions',
    sourcePoolVersion: '1.1.0', initialFen: INITIAL_FEN, learnerSide: 'white',
    candidateObjective: { objectiveId: 'promote', objectiveVersion: 'candidate-1.0.0', status: 'unapproved-human-review-required' },
    existingHumanApproval: {
      reviewerReference: 'reviewer:alexander:season-10.5b', scope: 'first learner move and forward pawn-escort concept only',
      approvedFirstMoves: ['Ke6', 'Kf6'], excludesLaterMovesAndPolicy: true
    },
    tablebaseEvidence: {
      provider: REMOTE_PROVIDER, localTablebaseVerified: false, stateCount: states.length,
      treeDigest: candidateStateGraph.graphDigest
    },
    stockfishEvidence: {
      engine: 'Stockfish 18', policy: 'caissa-engine-review-standard@1.0.0',
      classification: engine.resultClassification, bestMove: engine.bestMove,
      multiPv: engine.multiPv, evidenceDigest: engine.evidenceDigest,
      authority: 'secondary-to-tablebase-within-three-piece-coverage'
    },
    candidateStateGraph,
    opponentPolicyCandidates: policies.map(policy => ({
      ...policy, status: 'unapproved-human-review-required', reproducible: true,
      runtimeNetworkRequired: false, runtimeDataSize: 'bounded-state-graph',
      verificationRequirement: 'exact graph digest plus local move validation',
      failureBehavior: 'missing reply is neutral technical-unavailable'
    })),
    successConditionCandidates: [
      { id: 'legal-promotion', status: 'unapproved-human-review-required', deterministic: true, learnerClarity: 'high', prematureSuccessRisk: 'none', runtimeComplexity: 'low' },
      { id: 'forced-promotion', status: 'unapproved-human-review-required', deterministic: true, learnerClarity: 'medium', prematureSuccessRisk: 'yes', runtimeComplexity: 'high' },
      { id: 'approved-conversion-position', status: 'unapproved-human-review-required', deterministic: true, learnerClarity: 'medium', prematureSuccessRisk: 'depends-on-human-terminal', runtimeComplexity: 'medium' }
    ],
    failureConditionCandidates: [
      'tablebase result changes from win to draw or loss', 'designated pawn is lost',
      'promotion becomes impossible', 'approved maximum ply is reached',
      'authored-concept miss (not automatically learner failure)',
      'technical evaluator failure (always neutral)'
    ].map(label => ({ label, status: 'unapproved-human-review-required' })),
    maximumPlyCandidates: { minimumPractical: 9, recommended: 12, maximumSafe: 18, status: 'unapproved-human-review-required', fiftyMoveRuleRelevant: false },
    hintCandidates: [
      'Keep the king in front of the pawn and deny the defending king access.',
      'Improve the king before advancing the pawn.',
      'Reveal the next approved learner move.'
    ].map((text, index) => ({ stage: index + 1, text, status: 'unapproved-human-review-required' })),
    feedbackCandidates: Object.fromEntries(Object.entries({
      correctProgress: 'Good. The king and pawn remain coordinated.',
      objectiveDamaging: 'That legal move changes the conversion path; compare the king and pawn coordination.',
      theoreticalWinLost: 'The tablebase result no longer preserves the win.',
      opponentReply: 'The defending king follows the selected deterministic policy.',
      success: 'Promotion achieved.',
      technical: 'The pilot could not verify the next state. This does not count as learner failure.',
      retry: 'The initial position has been restored.'
    }).map(([key, text]) => [key, { text, status: 'unapproved-human-review-required' }])),
    openQuestions: [
      'Which opponent policy and tie-break should be approved?',
      'Which subsequent learner moves belong to the pedagogical tree?',
      'Which success and failure definitions should govern the pilot?',
      'What maximum ply, hints, and feedback should be approved?',
      'Should repetition be a concept miss, failure, or bounded retry condition?'
    ],
    allowedHumanDecisions: ALLOWED_DECISIONS,
    reviewTemplate: reviewTemplate()
  };
  const packet = { ...packetBase, packetDigest: sha256(packetBase) };
  if (write) {
    await Promise.all([mkdir(outputDirectory, { recursive: true }), mkdir(evidenceDirectory, { recursive: true })]);
    await writeJson(join(outputDirectory, 'kp-coordinate-support-promote.json'), packet);
    await writeFile(join(outputDirectory, 'kp-coordinate-support-promote.md'), markdown(packet), 'utf8');
    await writeJson(join(evidenceDirectory, 'kp-coordinate-support-promote-state-graph.json'), candidateStateGraph);
  }
  return packet;
}

function markdown(packet) {
  const lines = packet.candidateStateGraph.lines.map(line =>
    `- **${line.lineId}** (${line.terminal}): ${line.plies.map(ply => `${ply.proposedMove.san} [${ply.proposalStatus}]`).join(' ')}`).join('\n');
  return `# Multi-Move Human Review Packet — Coordinate Support / Promote

> Every proposal after the first learner move is **UNAPPROVED — HUMAN REVIEW REQUIRED**.

## Candidate

- FEN: \`${packet.initialFen}\`
- Learner: White
- Existing approval: Ke6 or Kf6 as the first move only
- Remote provider: ${packet.tablebaseEvidence.provider.providerId}@${packet.tablebaseEvidence.provider.providerVersion}
- Local tablebase verified: no
- Explored states: ${packet.tablebaseEvidence.stateCount}
- Graph digest: \`${packet.tablebaseEvidence.treeDigest}\`

## Candidate lines

${lines}

## Policy candidates

${packet.opponentPolicyCandidates.map(p => `- **${p.label}** — ${p.benefit} Risk: ${p.risk} **UNAPPROVED**`).join('\n')}

## Success candidates

${packet.successConditionCandidates.map(p => `- ${p.id}: clarity ${p.learnerClarity}; complexity ${p.runtimeComplexity}. **UNAPPROVED**`).join('\n')}

## Failure candidates

${packet.failureConditionCandidates.map(p => `- ${p.label}. **UNAPPROVED**`).join('\n')}

## Ply recommendation

Minimum ${packet.maximumPlyCandidates.minimumPractical}; recommended ${packet.maximumPlyCandidates.recommended}; maximum safe ${packet.maximumPlyCandidates.maximumSafe}. **UNAPPROVED**.

## Human handoff

Complete every null field in \`reviewTemplate\`, bind the four reviewed digests, and choose one allowlisted decision. Machine evidence is not approval.

Packet digest: \`${packet.packetDigest}\`
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const packet = await generateMultiMoveReview();
  console.log(`Generated ${packet.packetId} (${packet.tablebaseEvidence.stateCount} states, ${packet.packetDigest}).`);
}
