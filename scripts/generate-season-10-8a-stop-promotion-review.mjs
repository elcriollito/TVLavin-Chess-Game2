import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChessRulesFacade } from '../js/endgame-trainer/chess-rules-facade.js';
import { fetchRemoteTablebase, normalizeTablebaseResponse, REMOTE_PROVIDER, sha256 } from './endgame-remote-tablebase.mjs';
import { runEngineReview } from './endgame-engine-review.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packetDirectory = join(root, 'endgame-pools/private/multi-move-review-packets');
const graphDirectory = join(root, 'endgame-pools/private/multi-move-tablebase');
const evidenceDirectory = join(root, 'endgame-pools/private/evidence');
const identityPath = join(root, 'endgame-pools/private/toolchain/stockfish-18-windows-x64-avx2.json');
const policyPath = join(root, 'endgame-pools/private/toolchain/engine-review-policy-1.0.0.json');
const writeJson = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
const canonicalFen = fen => fen.split(' ').slice(0, 4).join(' ');

export const CANDIDATE_ID = 'rule-square-a-pawn-catch-stop-promotion';
export const INITIAL_FEN = 'k7/8/8/8/p7/8/8/3K4 w - - 0 1';
export const DESIGNATED_PAWN = Object.freeze({ color: 'black', origin: 'a4', promotionSquare: 'a1' });
export const MAXIMUM_EXPLORED_PLY = 14;
export const ALLOWED_DECISIONS = Object.freeze([
  'approve-stop-promotion-pilot', 'approve-with-tree-corrections',
  'approve-with-policy-corrections', 'approve-with-objective-correction',
  'requires-more-tablebase-evidence', 'requires-more-engine-evidence',
  'requires-new-position', 'reject-multi-move-candidate', 'defer'
]);
export const CANDIDATES = Object.freeze([
  {
    candidateId: CANDIDATE_ID, family: 'king-catches-pawn', fen: INITIAL_FEN,
    learnerSide: 'white', designatedOpponentPawn: DESIGNATED_PAWN, pieceCount: 3,
    sourceType: 'private-generated-variant',
    sourceReference: 'ku:endgames:pawn-foundations:rule-of-the-square/pos:rule-square:a-pawn-white-king-outside',
    naturalness: 'high', objectiveClarity: 'high', humanReviewComplexity: 'low',
    runtimeArtifactSize: 'small', recommendation: 'recommended'
  },
  {
    candidateId: 'central-opposition-blockade-stop-promotion', family: 'opposition-blockade',
    fen: '8/8/8/4k3/4p3/8/4K3/8 w - - 0 1', learnerSide: 'white',
    designatedOpponentPawn: { color: 'black', origin: 'e4', promotionSquare: 'e1' }, pieceCount: 3,
    sourceType: 'private-generated-candidate', sourceReference: null,
    naturalness: 'medium', objectiveClarity: 'medium', humanReviewComplexity: 'medium',
    runtimeArtifactSize: 'medium', recommendation: 'rejected-objective-success-ambiguous'
  },
  {
    candidateId: 'rook-pawn-corner-fortress-stop-promotion', family: 'rook-pawn-exception',
    fen: '8/8/8/8/8/pk6/8/1K6 w - - 0 1', learnerSide: 'white',
    designatedOpponentPawn: { color: 'black', origin: 'a3', promotionSquare: 'a1' }, pieceCount: 3,
    sourceType: 'private-generated-candidate', sourceReference: null,
    naturalness: 'high', objectiveClarity: 'high', humanReviewComplexity: 'medium',
    runtimeArtifactSize: 'small', recommendation: 'rejected-disguised-one-move-boundary'
  }
]);

const reviewTemplate = () => Object.fromEntries([
  'reviewDecision', 'reviewRationale', 'reviewerReference', 'reviewRevision',
  'approvedObjectiveId', 'approvedObjectiveVersion', 'approvedInitialFen',
  'approvedLearnerSide', 'approvedDesignatedOpponentPawn', 'approvedFirstMoves',
  'approvedSubsequentLearnerMoves', 'approvedOpponentPolicy', 'approvedTieBreakRule',
  'approvedSuccessCondition', 'approvedFailureCondition', 'approvedPromotionSemantics',
  'approvedMaximumPly', 'approvedTechnicalFailureBehavior', 'approvedHintStages',
  'approvedFeedback', 'reviewedPositionDigest', 'reviewedTablebaseTreeDigest',
  'reviewedEngineEvidenceDigest', 'reviewedPacketDigest'
].map(key => [key, null]));

function validateMove(fen, move) {
  const rules = ChessRulesFacade.fromFen(fen);
  const applied = rules.move(move.uci);
  if (applied.san !== move.san || rules.fen() !== move.resultingFen) throw new Error('graph-move-invalid');
}

async function evidenceFor(fen, candidateId, fetchImpl, cache) {
  const key = canonicalFen(fen);
  if (cache.has(key)) return cache.get(key);
  const response = await fetchRemoteTablebase(fen, { fetchImpl });
  const evidence = normalizeTablebaseResponse({
    positionId: `${candidateId}:${sha256(key).slice(-16)}`, fen,
    positionContentDigest: sha256({ candidateId, fen: key }),
    body: response.body, httpStatus: response.httpStatus, retrievedAt: null
  });
  evidence.moves.forEach(move => validateMove(fen, move));
  cache.set(key, evidence);
  return evidence;
}

const pawnExists = fen => ChessRulesFacade.fromFen(fen).pieces().some(piece =>
  piece.color === 'black' && piece.type === 'p' && ['a4', 'a3', 'a2'].includes(piece.square));
const promoted = fen => ChessRulesFacade.fromFen(fen).pieces().some(piece =>
  piece.color === 'black' && piece.square === 'a1' && piece.type !== 'p');

function chooseLearnerMove(evidence) {
  const preserving = evidence.moves.filter(move => evidence.wdlPreservingMoves.includes(move.uci));
  const optimal = preserving.filter(move => evidence.dtzOptimalMoves.includes(move.uci));
  return [...(optimal.length ? optimal : preserving)].sort((a, b) =>
    Math.abs(a.dtz ?? 999) - Math.abs(b.dtz ?? 999) || a.uci.localeCompare(b.uci))[0];
}

function chooseOpponentMove(evidence, policyId) {
  const preserving = evidence.moves.filter(move => evidence.wdlPreservingMoves.includes(move.uci));
  if (policyId === 'wdl-dtz-uci') {
    const optimal = preserving.filter(move => evidence.dtzOptimalMoves.includes(move.uci));
    return [...(optimal.length ? optimal : preserving)].sort((a, b) => a.uci.localeCompare(b.uci))[0];
  }
  if (policyId === 'maximum-resistance') return [...preserving].sort((a, b) =>
    Math.abs(b.dtz ?? 0) - Math.abs(a.dtz ?? 0) || a.uci.localeCompare(b.uci))[0];
  const pawnPushes = preserving.filter(move => move.uci.startsWith('a'));
  return [...(pawnPushes.length ? pawnPushes : preserving)].sort((a, b) => a.uci.localeCompare(b.uci))[0];
}

function classifyMoves(evidence, side) {
  return Object.fromEntries(evidence.moves.map(move => {
    const preserving = evidence.wdlPreservingMoves.includes(move.uci);
    return [move.uci, {
      classification: preserving
        ? (side === 'white' ? 'candidate-defensive-progress' : 'candidate-opponent-reply')
        : (side === 'white' ? 'objective-failure-candidate' : 'opponent-error-outside-policy'),
      status: 'unapproved-human-review-required',
      resultingCategory: move.resultingCategory,
      resultingFen: move.resultingFen
    }];
  }));
}

async function buildGraph(fetchImpl) {
  const cache = new Map();
  const initial = await evidenceFor(INITIAL_FEN, CANDIDATE_ID, fetchImpl, cache);
  const firstMoves = initial.wdlPreservingMoves;
  const policies = ['wdl-dtz-uci', 'maximum-resistance', 'authored-deterministic-tree'];
  const lines = [];
  for (const firstMove of firstMoves) for (const policyId of policies) {
    let fen = INITIAL_FEN;
    const plies = [];
    const seen = new Set();
    for (let ply = 1; ply <= MAXIMUM_EXPLORED_PLY; ply += 1) {
      const key = canonicalFen(fen);
      if (seen.has(key)) {
        lines.push({ lineId: `${firstMove}-${policyId}`, firstMove, policyId, plies, terminal: 'repetition-risk' });
        break;
      }
      seen.add(key);
      const evidence = await evidenceFor(fen, CANDIDATE_ID, fetchImpl, cache);
      const side = ChessRulesFacade.fromFen(fen).sideToMove();
      const selected = ply === 1
        ? evidence.moves.find(move => move.uci === firstMove)
        : side === 'white' ? chooseLearnerMove(evidence) : chooseOpponentMove(evidence, policyId);
      if (!selected) {
        lines.push({ lineId: `${firstMove}-${policyId}`, firstMove, policyId, plies, terminal: 'no-policy-move' });
        break;
      }
      plies.push({
        ply, side, fen: evidence.positionFen, category: evidence.category,
        dtz: evidence.dtz ?? null, dtm: evidence.dtm ?? null,
        legalMoves: evidence.moves, wdlPreservingMoves: evidence.wdlPreservingMoves,
        dtzOptimalMoves: evidence.dtzOptimalMoves, moveClassifications: classifyMoves(evidence, side),
        proposedMove: selected, proposalStatus: 'unapproved-human-review-required',
        evidenceDigest: evidence.evidenceDigest, requestDigest: evidence.requestDigest,
        responseDigest: evidence.responseDigest
      });
      fen = selected.resultingFen;
      if (promoted(fen)) {
        lines.push({ lineId: `${firstMove}-${policyId}`, firstMove, policyId, plies, terminal: 'opposing-pawn-promoted' });
        break;
      }
      if (!pawnExists(fen)) {
        lines.push({ lineId: `${firstMove}-${policyId}`, firstMove, policyId, plies, terminal: 'designated-pawn-captured' });
        break;
      }
      if (ply === MAXIMUM_EXPLORED_PLY)
        lines.push({ lineId: `${firstMove}-${policyId}`, firstMove, policyId, plies, terminal: 'maximum-ply' });
    }
  }
  const states = [...cache.values()].sort((a, b) => a.positionFen.localeCompare(b.positionFen));
  const base = {
    graphSchemaVersion: '1.0.0', candidateId: CANDIDATE_ID, initialFen: INITIAL_FEN,
    designatedOpponentPawn: DESIGNATED_PAWN, maximumExploredPly: MAXIMUM_EXPLORED_PLY,
    pruningRules: [
      'expand three initial WDL-preserving learner moves',
      'after the first move follow one deterministic learner choice per opponent-policy line',
      'retain and classify every locally validated provider move at every expanded node',
      'stop on pawn capture, promotion, repetition, missing policy move, or ply bound'
    ],
    states, lines
  };
  return { ...base, graphDigest: sha256(base) };
}

async function compareCandidates(fetchImpl) {
  const records = [];
  for (const candidate of CANDIDATES) {
    const evidence = await evidenceFor(candidate.fen, candidate.candidateId, fetchImpl, new Map());
    records.push({
      ...candidate, theoreticalResult: evidence.category, tablebaseCategory: evidence.category,
      dtz: evidence.dtz ?? null, dtm: evidence.dtm ?? null,
      initialWdlPreservingMoves: evidence.wdlPreservingMoves,
      initialDtzOptimalMoves: evidence.dtzOptimalMoves,
      branchingComplexity: evidence.moves.length,
      riskOfRepetition: candidate.family === 'opposition-blockade' ? 'medium' : 'low',
      riskOfAmbiguousSuccess: candidate.family === 'opposition-blockade' ? 'high' : 'low',
      suitabilityScore: candidate.candidateId === CANDIDATE_ID ? 92 :
        candidate.family === 'rook-pawn-exception' ? 68 : 61,
      evidenceDigest: evidence.evidenceDigest
    });
  }
  return records;
}

async function buildEngineEvidence(executable) {
  const [identity, policy] = await Promise.all([
    readFile(identityPath, 'utf8').then(JSON.parse),
    readFile(policyPath, 'utf8').then(JSON.parse)
  ]);
  const result = await runEngineReview({ executable, identity, policy, fen: INITIAL_FEN });
  const base = {
    evidenceSchemaVersion: '1.0.0', evidenceType: 'stockfish-secondary-comparison',
    candidateId: CANDIDATE_ID, fen: INITIAL_FEN, engineIdentity: result.engineIdentity,
    analysisPolicy: result.analysisPolicy, bestMove: result.bestMove, candidates: result.candidates,
    authority: 'secondary-to-tablebase', approvalStatus: 'unapproved-human-review-required'
  };
  return { ...base, evidenceDigest: sha256(base) };
}

export async function generateStopPromotionReview({
  fetchImpl = fetch, executable, write = true
} = {}) {
  if (!executable) throw new Error('stockfish-executable-required');
  const candidateComparison = await compareCandidates(fetchImpl);
  const candidateStateGraph = await buildGraph(fetchImpl);
  const stockfishEvidence = await buildEngineEvidence(executable);
  const recommended = candidateComparison.find(candidate => candidate.candidateId === CANDIDATE_ID);
  const positionDigest = sha256({
    candidateId: CANDIDATE_ID, fen: INITIAL_FEN, learnerSide: 'white',
    designatedOpponentPawn: DESIGNATED_PAWN, candidateObjective: 'stop-promotion@candidate-1.0.0'
  });
  const packetBase = {
    packetSchemaVersion: '1.0.0',
    packetId: `caissa-multi-move-review:${CANDIDATE_ID}:stop-promotion@candidate-1.0.0`,
    positionId: CANDIDATE_ID, sourceType: recommended.sourceType,
    sourceReference: recommended.sourceReference, initialFen: INITIAL_FEN,
    learnerSide: 'white', designatedOpponentPawn: DESIGNATED_PAWN,
    candidateObjective: {
      objectiveId: 'stop-promotion', objectiveVersion: 'candidate-1.0.0',
      description: 'Stop the designated black a-pawn from promoting.',
      status: 'unapproved-human-review-required'
    },
    existingHumanApproval: {
      exactPositionApproved: false, objectiveApproved: false, policyApproved: false,
      relatedKnowledgeConcept: 'rule-of-the-square', scopeExtensionPermittedWithoutNewReview: false
    },
    candidateSearchReport: {
      repositorySources: ['pools 1.0.0 and 1.1.0', 'Knowledge Units and releases', 'authoring sources', 'private evidence and packets', 'tests and Trainer fixtures'],
      generatedPrivately: true, candidateCount: candidateComparison.length
    },
    candidateComparison, recommendedCandidateId: CANDIDATE_ID,
    recommendationStatus: 'unapproved-human-review-required',
    recommendationRationale: 'Three-piece exact coverage, clear pawn-square lesson, three defensive first moves, compact capture terminal, and a truthful losing boundary.',
    positionDigest,
    tablebaseEvidence: {
      provider: REMOTE_PROVIDER, localTablebaseVerified: false,
      stateCount: candidateStateGraph.states.length,
      requestCount: candidateStateGraph.states.length,
      treeDigest: candidateStateGraph.graphDigest,
      authority: 'theoretical-results-within-complete-three-piece-coverage'
    },
    stockfishEvidence,
    candidateStateGraph,
    candidateLines: candidateStateGraph.lines,
    opponentPolicyCandidates: [
      { policyId: 'wdl-dtz-uci', algorithm: 'preserve WDL; prefer provider DTZ optimum; lexicographic UCI tie-break', reproducible: true, runtimeNetworkRequired: false, artifactSize: 'small', pedagogicalClarity: 'medium', naturalness: 'medium', repetitionRisk: 'low', difficulty: 'medium', failureBehavior: 'neutral technical-unavailable when no bound reply exists' },
      { policyId: 'maximum-resistance', algorithm: 'preserve WDL; maximize absolute DTZ; lexicographic UCI tie-break', reproducible: true, runtimeNetworkRequired: false, artifactSize: 'small', pedagogicalClarity: 'medium', naturalness: 'medium-low', repetitionRisk: 'medium', difficulty: 'higher', failureBehavior: 'neutral technical-unavailable when no bound reply exists' },
      { policyId: 'authored-deterministic-tree', algorithm: 'human selects from locally validated WDL-preserving replies; UCI is explicit per node', reproducible: true, runtimeNetworkRequired: false, artifactSize: 'small', pedagogicalClarity: 'high', naturalness: 'high', repetitionRisk: 'human-review-dependent', difficulty: 'human-selected', failureBehavior: 'neutral technical-unavailable for unknown node' }
    ].map(policy => ({ ...policy, status: 'unapproved-human-review-required' })),
    successConditionCandidates: [
      { id: 'designated-pawn-captured', clarity: 'high', deterministicEvaluability: 'high', prematureSuccessRisk: 'none', runtimeRequirements: 'board state only', educationalValue: 'high', edgeCases: 'capture must remove the designated pawn identity', underpromotion: 'not applicable before capture', stalemate: 'capture to bare kings is insufficient-material draw, not stalemate' },
      { id: 'promotion-impossible', clarity: 'medium', deterministicEvaluability: 'requires bounded exact authored classification', prematureSuccessRisk: 'medium', runtimeRequirements: 'approved offline state map', educationalValue: 'medium', edgeCases: 'must distinguish temporary blockade from permanent stop', underpromotion: 'all legal promotion types must be impossible', stalemate: 'may qualify only if explicitly approved' },
      { id: 'approved-defensive-terminal', clarity: 'human-authored', deterministicEvaluability: 'high after approval', prematureSuccessRisk: 'human-review-dependent', runtimeRequirements: 'terminal allowlist', educationalValue: 'potentially high', edgeCases: 'terminal must bind exact FEN', underpromotion: 'must be addressed by terminal review', stalemate: 'must be explicitly classified' }
    ].map(item => ({ ...item, status: 'unapproved-human-review-required' })),
    failureConditionCandidates: [
      ['opposing-pawn-promotes', 'objective-failure'],
      ['theoretical-draw-becomes-loss', 'objective-failure'],
      ['designated-pawn-becomes-unstoppable', 'objective-failure-candidate-requires-exact-bound'],
      ['learner-king-leaves-stopping-square', 'authored-concept-miss-unless-loss-proven'],
      ['maximum-ply-reached', 'unapproved-boundary'],
      ['repetition', 'unapproved-boundary'],
      ['legal-off-route-but-holding', 'authored-concept-miss'],
      ['technical-evaluator-unavailable', 'neutral-technical-failure']
    ].map(([id, classification]) => ({ id, classification, status: 'unapproved-human-review-required' })),
    promotionSemantics: {
      queen: 'promotion legally occurring is candidate objective failure',
      rook: 'promotion legally occurring is candidate objective failure',
      bishop: 'promotion legally occurring is candidate objective failure',
      knight: 'promotion legally occurring is candidate objective failure',
      resultDifference: 'none may be ignored; the stop objective is not satisfied after any promotion',
      successTiming: 'candidate success occurs before promotion, preferably on designated-pawn capture',
      allowOpponentPromotionMove: 'candidate policy question; forced-promotion proof may end earlier only if human-approved',
      candidateFailureTrigger: 'legal promotion occurs; earlier unstoppable classification remains an unapproved alternative',
      status: 'unapproved-human-review-required'
    },
    maximumPlyCandidates: {
      shortestPracticalSuccess: Math.min(...candidateStateGraph.lines.filter(line => line.terminal === 'designated-pawn-captured').map(line => line.plies.length)),
      longestResistantSuccess: Math.max(...candidateStateGraph.lines.filter(line => line.terminal === 'designated-pawn-captured').map(line => line.plies.length)),
      minimumPractical: 7, recommended: 10, maximumSafe: 14,
      repetitionBoundary: 'terminate or retry neutrally at first repeated canonical FEN',
      fiftyMoveRuleRelevant: false, status: 'unapproved-human-review-required'
    },
    hintCandidates: [
      'Use the square of the pawn and bring the king into its path.',
      'Move toward the a-file before the pawn advances too far.',
      'Reveal the candidate learner move for the current node.'
    ].map((text, index) => ({ stage: index + 1, text, status: 'unapproved-human-review-required' })),
    feedbackCandidates: Object.fromEntries(Object.entries({
      correctDefensiveProgress: 'Good. The king stays inside the pawn’s stopping route.',
      pawnCaptured: 'The designated pawn is captured.',
      promotionPrevented: 'The approved evidence shows that the designated pawn can no longer promote.',
      offRoute: 'That legal move may still hold, but it leaves the proposed instructional route.',
      defenseLost: 'The bounded tablebase evidence shows that the pawn can no longer be stopped.',
      opponentAdvance: 'The pawn advances along the selected candidate policy.',
      technicalUnavailable: 'The position could not be verified. This is not learner failure.',
      retry: 'The reviewed position has been restored.',
      successSummary: 'You stopped the designated pawn without allowing promotion.'
    }).map(([key, text]) => [key, { text, status: 'unapproved-human-review-required' }])),
    openQuestions: [
      'Is the generated variant educationally natural enough to approve?',
      'Which first and subsequent defensive moves should form the authored route?',
      'Which opponent policy and tie-break should be approved?',
      'Should success require capture or allow an earlier exact terminal?',
      'Should failure trigger only on legal promotion or earlier exact unstopability?',
      'How should a legal off-route drawing move be retried?',
      'Which ply bound, hints, and feedback should be approved?'
    ],
    allowedHumanDecisions: ALLOWED_DECISIONS,
    reviewTemplate: reviewTemplate()
  };
  const packet = { ...packetBase, packetDigest: sha256(packetBase) };
  if (write) {
    await Promise.all([mkdir(packetDirectory, { recursive: true }), mkdir(graphDirectory, { recursive: true }), mkdir(evidenceDirectory, { recursive: true })]);
    await writeJson(join(graphDirectory, `${CANDIDATE_ID}-state-graph.json`), candidateStateGraph);
    await writeJson(join(evidenceDirectory, `${CANDIDATE_ID}.stockfish-18.json`), stockfishEvidence);
    await writeJson(join(packetDirectory, `${CANDIDATE_ID}.json`), packet);
    await writeFile(join(packetDirectory, `${CANDIDATE_ID}.md`), markdown(packet), 'utf8');
  }
  return packet;
}

function markdown(packet) {
  const candidates = packet.candidateComparison.map(candidate =>
    `| ${candidate.candidateId} | \`${candidate.fen}\` | ${candidate.tablebaseCategory} | ${candidate.dtz} | ${candidate.dtm} | ${candidate.suitabilityScore} | ${candidate.recommendation} |`).join('\n');
  const lines = packet.candidateLines.map(line =>
    `- **${line.lineId}** — ${line.plies.map(ply => ply.proposedMove.san).join(' ')} — ${line.terminal}`).join('\n');
  return `# Stop-Promotion Candidate Human Review Handoff

> Every objective, move, policy, terminal, hint, feedback item, and ply value is **UNAPPROVED — HUMAN REVIEW REQUIRED**.

## Candidate comparison

| Candidate | FEN | WDL category | DTZ | DTM | Score | Disposition |
|---|---|---:|---:|---:|---:|---|
${candidates}

## Recommended candidate

- ID: \`${packet.positionId}\`
- FEN: \`${packet.initialFen}\`
- Learner: White
- Designated pawn: black pawn from a4 toward a1
- Position digest: \`${packet.positionDigest}\`
- Remote provider: ${packet.tablebaseEvidence.provider.providerId}@${packet.tablebaseEvidence.provider.providerVersion}
- Local Syzygy verification: no
- Graph states: ${packet.tablebaseEvidence.stateCount}
- Graph digest: \`${packet.tablebaseEvidence.treeDigest}\`
- Engine digest: \`${packet.stockfishEvidence.evidenceDigest}\`

## Candidate lines

${lines}

## Human decisions required

${packet.openQuestions.map(question => `- ${question}`).join('\n')}

Complete every null field in \`reviewTemplate\` and bind all reviewed digests. Nothing in this packet is human approval.

Packet digest: \`${packet.packetDigest}\`
`;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const packet = await generateStopPromotionReview({ executable: argument('--engine') });
  console.log(`Generated ${packet.packetId} (${packet.tablebaseEvidence.stateCount} states, ${packet.packetDigest}).`);
}
