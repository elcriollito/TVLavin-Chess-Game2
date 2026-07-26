import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChessRulesFacade } from '../js/endgame-trainer/chess-rules-facade.js';
import { fetchRemoteTablebase, normalizeTablebaseResponse, REMOTE_PROVIDER, sha256 } from './endgame-remote-tablebase.mjs';
import { runEngineReview } from './endgame-engine-review.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packetDir = join(root, 'endgame-pools/private/multi-move-review-packets');
const graphDir = join(root, 'endgame-pools/private/multi-move-review-graphs');
const evidenceDir = join(root, 'endgame-pools/private/multi-move-review-evidence');
const adjudicationDir = join(root, 'endgame-pools/private/human-adjudications');
const identityPath = join(root, 'endgame-pools/private/toolchain/stockfish-18-windows-x64-avx2.json');
const policyPath = join(root, 'endgame-pools/private/toolchain/engine-review-policy-1.0.0.json');
const STATUS = 'unapproved-human-review-required';
const writeJson = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
const canonicalFen = fen => fen.split(' ').slice(0, 4).join(' ');

export const POSITION_ID = 'king-leads-pawn-to-c4-support';
export const INITIAL_FEN = '8/7k/8/8/8/3P4/8/2K5 w - - 0 1';
export const TARGETS = Object.freeze({
  king: { color: 'white', requiredSquare: 'c4' },
  pawn: { color: 'white', requiredSquare: 'd3' },
  theoreticalResult: 'win',
  mission: 'Bring the king to c4 before advancing the d-pawn while preserving the win.'
});
export const MAXIMUM_EXPLORED_PLY = 12;
export const ALLOWED_DECISIONS = Object.freeze([
  'approve-objective-pilot', 'approve-with-tree-corrections', 'approve-with-policy-corrections',
  'approve-with-objective-correction', 'requires-more-tablebase-evidence',
  'requires-more-engine-evidence', 'requires-new-position', 'reject-multi-move-candidate', 'defer'
]);

export const CANDIDATES = Object.freeze([
  {
    positionId: POSITION_ID, fen: INITIAL_FEN, learnerSide: 'white', pieceCount: 3,
    sourceType: 'controlled-private-variant-of-repository-knowledge-position',
    sourceReference: 'ku:endgames:pawn-foundations:activate-the-king/pos:activate-king:clean',
    targetSquare: 'c4', naturalness: 'high', instructionalClarity: 'high',
    objectiveAmbiguityRisk: 'low', recommendation: 'recommended-unapproved', suitabilityScore: 96
  },
  {
    positionId: 'king-leads-pawn-to-c4-support-closer-defender', fen: '8/8/7k/8/8/3P4/8/2K5 w - - 0 1',
    learnerSide: 'white', pieceCount: 3, sourceType: 'controlled-private-variant',
    sourceReference: 'derived-from:ku:endgames:pawn-foundations:activate-the-king',
    targetSquare: 'c4', naturalness: 'high', instructionalClarity: 'high',
    objectiveAmbiguityRisk: 'low', recommendation: 'alternate-not-recommended-near-duplicate',
    suitabilityScore: 90
  },
  {
    positionId: 'king-leads-e-pawn-to-f4-support', fen: 'k7/8/8/8/8/4P3/8/5K2 w - - 0 1',
    learnerSide: 'white', pieceCount: 3, sourceType: 'controlled-private-variant-of-repository-knowledge-position',
    sourceReference: 'ku:endgames:pawn-foundations:activate-the-king/pos:activate-king:contrast',
    targetSquare: 'f4', naturalness: 'high', instructionalClarity: 'high',
    objectiveAmbiguityRisk: 'low', recommendation: 'alternate-not-recommended-mirrored-concept',
    suitabilityScore: 86
  }
]);

const reviewTemplate = () => Object.fromEntries([
  'reviewDecision', 'reviewRationale', 'reviewerReference', 'reviewRevision',
  'approvedObjectiveId', 'approvedObjectiveVersion', 'approvedInitialFen',
  'approvedLearnerSide', 'approvedDesignatedTargets', 'approvedFirstMoves',
  'approvedSubsequentLearnerMoves', 'approvedOpponentPolicy', 'approvedTieBreakRule',
  'approvedSuccessCondition', 'approvedFailureCondition', 'approvedObjectiveMissSemantics',
  'approvedPromotionSemantics', 'approvedStalemateSemantics', 'approvedMaximumPly',
  'approvedTechnicalFailureBehavior', 'approvedHintStages', 'approvedFeedback',
  'reviewedPositionDigest', 'reviewedTablebaseTreeDigest',
  'reviewedEngineEvidenceDigest', 'reviewedPacketDigest'
].map(key => [key, null]));

function validateMove(fen, move) {
  const rules = ChessRulesFacade.fromFen(fen);
  const side = rules.sideToMove();
  const applied = rules.move(move.uci);
  if (applied.san !== move.san || rules.fen() !== move.resultingFen || rules.sideToMove() === side)
    throw new Error(`invalid-provider-transition:${move.uci}`);
}

async function evidenceFor(fen, positionId, fetchImpl, cache) {
  const key = canonicalFen(fen);
  if (cache.has(key)) return cache.get(key);
  const response = await fetchRemoteTablebase(fen, { fetchImpl });
  const evidence = normalizeTablebaseResponse({
    positionId: `${positionId}:${sha256(key).slice(-16)}`, fen,
    positionContentDigest: sha256({ positionId, normalizedFen: key }),
    body: response.body, httpStatus: response.httpStatus, retrievedAt: null
  });
  evidence.moves.forEach(move => validateMove(fen, move));
  cache.set(key, evidence);
  return evidence;
}

const optimalMoves = evidence => evidence.moves.filter(move => evidence.wdlPreservingMoves.includes(move.uci));
const squareDistance = (from, to) => Math.max(
  Math.abs(from.charCodeAt(0) - to.charCodeAt(0)),
  Math.abs(Number(from[1]) - Number(to[1]))
);

function learnerMove(evidence) {
  const choices = optimalMoves(evidence).filter(move => !move.uci.startsWith('d3'));
  return [...choices].sort((a, b) =>
    squareDistance(a.uci.slice(2, 4), 'c4') - squareDistance(b.uci.slice(2, 4), 'c4')
    || Math.abs(a.dtz ?? 999) - Math.abs(b.dtz ?? 999)
    || a.uci.localeCompare(b.uci))[0];
}

function opponentMove(evidence, policyId) {
  const choices = optimalMoves(evidence);
  const dtz = choices.filter(move => evidence.dtzOptimalMoves.includes(move.uci));
  if (policyId === 'wdl-dtz-uci')
    return [...(dtz.length ? dtz : choices)].sort((a, b) => a.uci.localeCompare(b.uci))[0];
  if (policyId === 'maximum-resistance')
    return [...choices].sort((a, b) => Math.abs(b.dtz ?? 0) - Math.abs(a.dtz ?? 0) || a.uci.localeCompare(b.uci))[0];
  return [...choices].sort((a, b) => a.uci.localeCompare(b.uci))[0];
}

function success(fen, selectedMove) {
  const pieces = ChessRulesFacade.fromFen(fen).pieces();
  return selectedMove.resultingCategory === 'loss'
    && pieces.some(piece => piece.color === 'white' && piece.type === 'k' && piece.square === 'c4')
    && pieces.some(piece => piece.color === 'white' && piece.type === 'p' && piece.square === 'd3');
}

function classifications(evidence) {
  const learner = ChessRulesFacade.fromFen(evidence.positionFen).sideToMove() === 'white';
  return Object.fromEntries(evidence.moves.map(move => {
    const resultPreserved = evidence.wdlPreservingMoves.includes(move.uci);
    let classification = 'candidate-opponent-reply';
    if (learner && !resultPreserved) classification = 'chess-result-failure';
    if (learner && resultPreserved && move.uci.startsWith('d3')) classification = 'objective-miss-result-preserved-candidate';
    if (learner && resultPreserved && !move.uci.startsWith('d3')) classification = 'authored-concept-miss-or-accepted-alternative-requires-review';
    return [move.uci, {
      classification, resultingCategory: move.resultingCategory,
      resultingFen: move.resultingFen, status: STATUS
    }];
  }));
}

async function buildGraph(fetchImpl) {
  const cache = new Map();
  const lines = [];
  for (const policyId of ['wdl-dtz-uci', 'maximum-resistance', 'authored-deterministic-tree']) {
    let fen = INITIAL_FEN;
    const seen = new Set();
    const plies = [];
    let terminal = 'maximum-ply-boundary';
    for (let ply = 1; ply <= MAXIMUM_EXPLORED_PLY; ply += 1) {
      const key = canonicalFen(fen);
      if (seen.has(key)) { terminal = 'repetition-boundary'; break; }
      seen.add(key);
      const evidence = await evidenceFor(fen, POSITION_ID, fetchImpl, cache);
      const side = ChessRulesFacade.fromFen(fen).sideToMove();
      const selected = side === 'white' ? learnerMove(evidence) : opponentMove(evidence, policyId);
      if (!selected) { terminal = 'technical-unavailable-or-uncovered'; break; }
      plies.push({
        ply, normalizedFen: evidence.positionFen, sideToMove: side,
        learnerPerspectiveResult: evidence.category === 'win' ? 'win' : evidence.category === 'draw' ? 'draw' : 'loss',
        theoreticalCategory: evidence.category, legalMoves: evidence.moves,
        wdlPreservingMoves: evidence.wdlPreservingMoves, dtzOptimalMoves: evidence.dtzOptimalMoves,
        moveClassifications: classifications(evidence), proposedMove: selected,
        positionContentDigest: evidence.positionContentDigest,
        requestDigest: evidence.requestDigest, responseDigest: evidence.responseDigest,
        evidenceDigest: evidence.evidenceDigest
      });
      fen = selected.resultingFen;
      if (success(fen, selected)) { terminal = 'candidate-success-terminal-unapproved'; break; }
    }
    lines.push({ lineId: `${POSITION_ID}:${policyId}`, policyId, plies, terminal });
  }
  const states = [...cache.values()].sort((a, b) => a.positionFen.localeCompare(b.positionFen));
  const base = {
    graphSchemaVersion: '1.0.0', positionId: POSITION_ID,
    objectiveFamily: 'activate-king', initialFen: INITIAL_FEN,
    designatedTargets: TARGETS, maximumExploredPly: MAXIMUM_EXPLORED_PLY,
    pruningRules: [
      'retain all legal moves and exact WDL classifications at every expanded state',
      'expand one target-aware learner continuation and one deterministic opponent reply per policy',
      'stop at exact proposed terminal, repetition, 12 plies, missing evidence, or uncovered state',
      'no route, policy, classification, or terminal is human-approved'
    ],
    states, lines, approvalStatus: STATUS
  };
  return { ...base, graphDigest: sha256(base) };
}

async function compareCandidates(fetchImpl) {
  const result = [];
  for (const candidate of CANDIDATES) {
    const evidence = await evidenceFor(candidate.fen, candidate.positionId, fetchImpl, new Map());
    const immediateSuccessMoves = evidence.moves.filter(move => move.uci.slice(2, 4) === candidate.targetSquare);
    result.push({
      ...candidate, theoreticalResult: evidence.category, dtz: evidence.dtz ?? null,
      dtm: evidence.dtm ?? null, legalInitialMoves: evidence.moves,
      wdlPreservingMoves: evidence.wdlPreservingMoves,
      dtzOptimalMoves: evidence.dtzOptimalMoves,
      branchingComplexity: evidence.moves.length,
      shortestSuccessLine: candidate.positionId === POSITION_ID ? 5 : 'candidate-analysis-only',
      longestResistantLine: candidate.positionId === POSITION_ID ? 7 : 'candidate-analysis-only',
      repetitionRisk: 'low-with-bounded-graph',
      immediateSuccessMoveCount: immediateSuccessMoves.length,
      evidenceDigest: evidence.evidenceDigest
    });
  }
  return result;
}

async function buildEngineEvidence(executable) {
  const [identity, policy] = await Promise.all([
    readFile(identityPath, 'utf8').then(JSON.parse),
    readFile(policyPath, 'utf8').then(JSON.parse)
  ]);
  const result = await runEngineReview({ executable, identity, policy, fen: INITIAL_FEN });
  const base = {
    evidenceSchemaVersion: '1.0.0', evidenceType: 'stockfish-secondary-comparison',
    positionId: POSITION_ID, fen: INITIAL_FEN,
    engineIdentity: result.engineIdentity, analysisPolicy: result.analysisPolicy,
    bestMove: result.bestMove, candidates: result.candidates,
    authority: 'secondary-only-tablebase-is-theoretical-authority',
    approvalStatus: STATUS
  };
  return { ...base, evidenceDigest: sha256(base) };
}

function historicalDecision() {
  const base = {
    adjudicationSchemaVersion: '1.0.0',
    adjudicationId: 'season-10.11b-activate-king-requires-new-position@1',
    reviewDecision: 'requires-new-position',
    reviewerReference: 'reviewer:alexander:season-10.11b-activate-king',
    reviewRevision: 1,
    decisionBasis: 'The proposed multi-move objective could be completed immediately with Kb3 or Kc3.',
    rejectedBinding: {
      positionId: 'king-activation-support-region',
      initialFen: '8/7k/8/8/8/3P4/2K5/8 w - - 0 1',
      positionDigest: 'sha256-6b694d3f4c3abdb822b6789b8f0d60afb7547bb4283f11c40b722b2cf1a7c297',
      treeDigest: 'sha256-949cd346baac5804d90abf79bd338cd80bbaa05865766eeab3cedc0978913b6e',
      engineDigest: 'sha256-47cc1a45fcf3b57ed69bfe06f86df0d6123f0bea83275beb8fa1175b3ba93008',
      packetDigest: 'sha256-0c2535abc7b9c1fff10faf980473a4377fa6eb33e02c6f815177f604f6e9930f'
    },
    originalPacketMutated: false, replacementApprovalGranted: false
  };
  return { ...base, adjudicationDigest: sha256(base) };
}

const policies = () => [
  ['wdl-dtz-uci', 'Preserve WDL, prefer DTZ optimum, then UCI.', 'stable but may choose an unnatural defensive route'],
  ['maximum-resistance', 'Preserve WDL, maximize absolute DTZ, then UCI.', 'longer and potentially less natural'],
  ['authored-deterministic-tree', 'Use only human-selected moves from the validated graph.', 'clearest proposed teaching route']
].map(([policyId, algorithm, analysis]) => ({
  policyId, algorithm, analysis, objectiveStability: 'requires-human-review',
  runtimeNetworkRequired: false, dependsOnOpponentError: false, status: STATUS
}));

const successes = () => [
  {
    id: 'approved-king-activation-board-event',
    proposedRequirements: ['white king on c4', 'white pawn remains on d3', 'tablebase win preserved', 'approved authored node reached'],
    clarity: 'high', prematureSuccessRisk: 'low', determinism: 'high',
    edgeCases: 'off-route arrival and pawn movement require exact classification',
    educationalValue: 'high', artifactComplexity: 'small', runtimeRequirements: 'offline approved graph',
    accessibilityWording: 'Bring the king to c4 before advancing the pawn.'
  },
  {
    id: 'exact-theoretical-result-terminal', proposedRequirements: ['tablebase win preserved at approved terminal'],
    clarity: 'medium', prematureSuccessRisk: 'high because the initial position is already winning',
    determinism: 'high', edgeCases: 'winning alone does not prove king activation',
    educationalValue: 'low', artifactComplexity: 'small', runtimeRequirements: 'offline approved graph',
    accessibilityWording: 'Reach the reviewed winning position.'
  },
  {
    id: 'human-authored-terminal', proposedRequirements: ['exact reviewed FEN allowlist'],
    clarity: 'medium', prematureSuccessRisk: 'human-review-dependent', determinism: 'high after approval',
    edgeCases: 'every terminal FEN needs review', educationalValue: 'potentially high',
    artifactComplexity: 'medium', runtimeRequirements: 'offline terminal allowlist',
    accessibilityWording: 'Reach the reviewed support position.'
  }
].map(item => ({ ...item, status: STATUS }));

const failures = () => [
  ['objective-failure', 'The approved activation mission is no longer achievable.'],
  ['chess-result-failure', 'The initial win becomes a draw or loss.'],
  ['objective-miss-result-preserved', 'The win remains, but the pawn advanced before the approved king-support event.'],
  ['authored-concept-miss', 'The win remains and the learner can recover to the proposed route.'],
  ['technical-unavailable', 'Evidence is missing or the state is outside the approved graph; always neutral.']
].map(([classification, meaning]) => ({ classification, meaning, exactEvidenceRequired: true, status: STATUS }));

const hints = () => [
  { stage: 1, text: 'Let the king lead the pawn; advancing the pawn now gives up the win.', independentSuccessEligibilityAfterUse: true },
  { stage: 2, text: 'Route the king from c1 toward c4 while the pawn stays on d3.', independentSuccessEligibilityAfterUse: true },
  { stage: 3, text: 'Reveal the proposed learner move for this reviewed node.', independentSuccessEligibilityAfterUse: false }
].map(item => ({ ...item, status: STATUS }));

const feedback = () => Object.fromEntries([
  ['correctProgress', 'The king moves closer to c4 while the winning route remains intact.'],
  ['acceptedAlternative', 'This king route also keeps the position winning.'],
  ['authoredConceptMiss', 'The position still wins, but this route delays the proposed king activation.'],
  ['objectiveMissResultPreserved', 'The position still wins, but the pawn moved before the proposed support position was reached.'],
  ['chessResultFailure', 'That move gives up the win and allows a draw.'],
  ['objectiveFailure', 'The proposed king-support mission can no longer be completed.'],
  ['opponentReply', 'The opposing king follows the selected review route.'],
  ['success', 'The king reached c4 with the pawn still on d3 and the win preserved.'],
  ['technicalUnavailable', 'This position could not be classified safely. This is not learner failure.'],
  ['retry', 'The last reviewed position has been restored.'],
  ['summary', 'The king led the pawn to the support square before the pawn advanced.']
].map(([key, text]) => [key, { text, status: STATUS }]));

function markdown(packet) {
  const rows = packet.candidateComparison.map(candidate =>
    `| ${candidate.positionId} | \`${candidate.fen}\` | ${candidate.theoreticalResult} | ${candidate.dtz} | ${candidate.dtm} | ${candidate.immediateSuccessMoveCount} | ${candidate.recommendation} |`).join('\n');
  return `# Activate-king replacement candidate review

> **UNAPPROVED — HUMAN REVIEW REQUIRED.** This packet does not implement or approve runtime content.

## Candidate comparison

| Candidate | FEN | Result | DTZ | DTM | Immediate success moves | Disposition |
|---|---|---:|---:|---:|---:|---|
${rows}

## Recommended replacement

- Position: \`${packet.positionId}\`
- FEN: \`${packet.initialFen}\`
- Mission: ${packet.designatedTargets.mission}
- Proposed authored line: ${packet.candidateLines.find(line => line.policyId === 'authored-deterministic-tree').plies.map(ply => ply.proposedMove.san).join(' ')}
- Position digest: \`${packet.positionDigest}\`
- Graph digest: \`${packet.tablebaseEvidence.graphDigest}\`
- Engine digest: \`${packet.stockfishEvidence.evidenceDigest}\`

No legal first move completes the c4 support event. The premature pawn push \`d4\` changes the exact result from win to draw.

Every field in \`reviewTemplate\` remains null and must be supplied by a human reviewer.

Packet digest: \`${packet.packetDigest}\`
`;
}

export async function generateSeason1011B3R({ executable, fetchImpl = fetch, write = true } = {}) {
  if (!executable) throw new Error('stockfish-executable-required');
  const [candidateComparison, candidateStateGraph, stockfishEvidence] = await Promise.all([
    compareCandidates(fetchImpl), buildGraph(fetchImpl), buildEngineEvidence(executable)
  ]);
  const positionDigest = sha256({
    positionId: POSITION_ID, initialFen: INITIAL_FEN, learnerSide: 'white',
    designatedTargets: TARGETS, objective: 'activate-king@replacement-candidate-1.0.0'
  });
  const packetBase = {
    packetSchemaVersion: '1.0.0',
    packetId: `caissa-multi-move-review:${POSITION_ID}:activate-king@replacement-candidate-1.0.0`,
    positionId: POSITION_ID, objectiveFamily: 'activate-king',
    sourceType: CANDIDATES[0].sourceType, sourceReference: CANDIDATES[0].sourceReference,
    initialFen: INITIAL_FEN, learnerSide: 'white', designatedTargets: TARGETS,
    candidateObjective: {
      objectiveId: 'activate-king', objectiveVersion: 'replacement-candidate-1.0.0',
      description: TARGETS.mission, status: STATUS
    },
    supersedesRejectedCandidate: {
      positionId: 'king-activation-support-region',
      decision: 'requires-new-position', adjudicationRevision: 1,
      originalPacketDigest: 'sha256-0c2535abc7b9c1fff10faf980473a4377fa6eb33e02c6f815177f604f6e9930f'
    },
    existingHumanApproval: {
      exactPositionApproved: false, objectiveApproved: false, policyApproved: false,
      replacementApproved: false, scopeExtensionPermittedWithoutNewReview: false
    },
    candidateSearchReport: {
      repositorySearchedFirst: true, generatedOnlyAfterRepositorySearch: true,
      sources: ['Knowledge Units', 'Endgame Trainer positions', 'pools', 'fixtures', 'private packets and evidence'],
      candidateCount: candidateComparison.length, minimumMet: true
    },
    candidateComparison, recommendationRationale:
      'The c1/d3/h7 geometry is an exact win, no legal first move reaches c4, the proposed route takes multiple learner decisions, and the natural premature push d4 changes the win to a draw.',
    positionDigest,
    tablebaseEvidence: {
      provider: REMOTE_PROVIDER, localSyzygyVerified: false, rawResponsesStored: false,
      runtimeNetworkRequired: false, stateCount: candidateStateGraph.states.length,
      maximumExploredPly: MAXIMUM_EXPLORED_PLY, graphDigest: candidateStateGraph.graphDigest,
      completeForExpandedStates: true
    },
    stockfishEvidence, candidateStateGraph, candidateLines: candidateStateGraph.lines,
    opponentPolicyCandidates: policies(), successConditionCandidates: successes(),
    recommendedSuccessCandidate: 'approved-king-activation-board-event',
    failureConditionCandidates: failures(),
    edgeCaseAnalysis: {
      promotion: 'not success; pawn movement before the proposed support event is a candidate objective miss or failure',
      stalemate: 'not inferred as success and requires exact reviewed classification',
      repetition: 'neutral boundary and retry candidate',
      fiftyMoveRule: 'not practically relevant within 12 plies',
      maximumPly: 'neutral uncompleted boundary pending review',
      outsideGraph: 'technical-unavailable and always neutral',
      status: STATUS
    },
    maximumPlyCandidates: {
      minimumPractical: 5, recommended: 8, maximum: 12,
      extraordinaryFourteenPlyJustification: null, status: STATUS
    },
    hintCandidates: hints(), feedbackCandidates: feedback(),
    openQuestions: [
      'Which first and subsequent king routes should be approved?',
      'Which opponent policy and exact terminal FENs should be approved?',
      'Should an early pawn push that still wins be an objective miss or authored-concept miss?'
    ],
    allowedHumanDecisions: ALLOWED_DECISIONS, reviewTemplate: reviewTemplate()
  };
  const packet = { ...packetBase, packetDigest: sha256(packetBase) };
  const tablebaseCollectionBase = {
    evidenceCollectionSchemaVersion: '1.0.0', positionId: POSITION_ID,
    provider: REMOTE_PROVIDER, localSyzygyVerified: false,
    rawProviderResponsesIncluded: false, states: candidateStateGraph.states
  };
  const tablebaseCollection = { ...tablebaseCollectionBase, collectionDigest: sha256(tablebaseCollectionBase) };
  const adjudication = historicalDecision();
  if (write) {
    await Promise.all([packetDir, graphDir, evidenceDir, adjudicationDir].map(path => mkdir(path, { recursive: true })));
    const stem = `${POSITION_ID}-activate-king`;
    await Promise.all([
      writeJson(join(packetDir, `${stem}.json`), packet),
      writeFile(join(packetDir, `${stem}.md`), markdown(packet), 'utf8'),
      writeJson(join(graphDir, `${stem}.graph.json`), candidateStateGraph),
      writeJson(join(evidenceDir, `${stem}-tablebase.json`), tablebaseCollection),
      writeJson(join(evidenceDir, `${stem}-engine.json`), stockfishEvidence),
      writeJson(join(adjudicationDir, 'season-10.11b-activate-king-requires-new-position.json'), adjudication)
    ]);
  }
  return { packet, tablebaseCollection, adjudication };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await generateSeason1011B3R({ executable: argument('--engine') });
  console.log(`Generated ${result.packet.packetId} (${result.packet.tablebaseEvidence.stateCount} states, ${result.packet.packetDigest}).`);
}
