import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChessRulesFacade } from '../js/endgame-trainer/chess-rules-facade.js';
import { fetchRemoteTablebase, normalizeTablebaseResponse, REMOTE_PROVIDER, sha256 } from './endgame-remote-tablebase.mjs';
import { runEngineReview } from './endgame-engine-review.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packetDir = join(root, 'endgame-pools/private/multi-move-review-packets');
const graphDir = join(root, 'endgame-pools/private/multi-move-tablebase');
const evidenceDir = join(root, 'endgame-pools/private/evidence');
const readinessDir = join(root, 'endgame-pools/private/endgame-run-readiness');
const identityPath = join(root, 'endgame-pools/private/toolchain/stockfish-18-windows-x64-avx2.json');
const policyPath = join(root, 'endgame-pools/private/toolchain/engine-review-policy-1.0.0.json');
const canonicalFen = fen => fen.split(' ').slice(0, 4).join(' ');
const writeJson = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
const STATUS = 'unapproved-human-review-required';

export const ALLOWED_DECISIONS = Object.freeze([
  'approve-objective-pilot', 'approve-with-tree-corrections', 'approve-with-policy-corrections',
  'approve-with-objective-correction', 'requires-more-tablebase-evidence',
  'requires-more-engine-evidence', 'requires-new-position', 'reject-multi-move-candidate', 'defer'
]);

const common = {
  sourceType: 'repository-knowledge-position',
  learnerSide: 'white',
  underpromotionRelevance: 'terminal-dependent',
  stalemateRelevance: 'must-be-reviewed',
  fiftyMoveRelevance: false
};

export const FAMILIES = Object.freeze([
  {
    objectiveFamily: 'convert-material-advantage',
    description: 'Convert a verified structural advantage through favorable simplification and continued king-and-pawn technique.',
    recommendedId: 'favorable-simplification-open-king-route',
    designatedTargets: { structuralEvent: 'favorable central capture', terminal: 'approved winning conversion terminal' },
    targetSquares: [],
    candidates: [
      { ...common, positionId: 'favorable-simplification-open-king-route', fen: '8/8/5k2/3p4/2P1P3/3K4/8/8 w - - 0 1', sourceReference: 'ku:endgames:pawn-exchanges:favorable-king-ending/pos:favorable-ending:open-king-route', pieceCount: 5, naturalness: 'high', instructionalClarity: 'high', objectiveAmbiguityRisk: 'low', score: 94, disposition: 'recommended-unapproved' },
      { ...common, positionId: 'king-support-central-pawn', fen: '8/4k3/8/3K4/4P3/8/8/8 w - - 0 1', sourceReference: 'ku:endgames:pawn-foundations:convert-with-king-support/pos:convert-support:clean', pieceCount: 3, naturalness: 'high', instructionalClarity: 'high', objectiveAmbiguityRisk: 'medium', score: 82, disposition: 'not-recommended-duplicates-promote-semantics' },
      { ...common, positionId: 'king-support-offset-defender', fen: '8/2k5/8/4K3/4P3/8/8/8 w - - 0 1', sourceReference: 'ku:endgames:pawn-foundations:convert-with-king-support/pos:convert-support:contrast', pieceCount: 3, naturalness: 'high', instructionalClarity: 'medium', objectiveAmbiguityRisk: 'medium', score: 78, disposition: 'not-recommended-three-piece-promote-overlap' }
    ]
  },
  {
    objectiveFamily: 'hold-draw',
    description: 'Preserve an exact draw through repeated opposition and key-square denial decisions.',
    recommendedId: 'direct-opposition-hold-draw',
    designatedTargets: { result: 'draw', defensiveConcept: 'opposition and king-entry denial' },
    targetSquares: [],
    candidates: [
      { ...common, positionId: 'direct-opposition-hold-draw', fen: '8/8/4k3/8/4K3/8/P7/8 w - - 0 1', sourceReference: 'ku:endgames:pawn-foundations:direct-opposition/pos:direct-opposition:clean', pieceCount: 3, naturalness: 'high', instructionalClarity: 'high', objectiveAmbiguityRisk: 'medium', score: 91, disposition: 'recommended-unapproved' },
      { ...common, positionId: 'key-square-denial-hold-draw', fen: '8/3k4/8/8/3P4/3K4/8/8 w - - 0 1', sourceReference: 'ku:endgames:pawn-foundations:key-squares/pos:key-squares:clean', pieceCount: 3, naturalness: 'high', instructionalClarity: 'medium', objectiveAmbiguityRisk: 'high', score: 75, disposition: 'not-recommended-attacker-side-to-move' },
      { ...common, positionId: 'rook-pawn-corner-fortress', fen: '8/8/8/8/8/pk6/8/1K6 w - - 0 1', sourceReference: 'private-generated-candidate', pieceCount: 3, naturalness: 'high', instructionalClarity: 'high', objectiveAmbiguityRisk: 'low', score: 69, disposition: 'not-recommended-overlaps-stop-promotion' }
    ]
  },
  {
    objectiveFamily: 'activate-king',
    description: 'Activate the king into the proposed b3/c3 support region before completing the pawn conversion.',
    recommendedId: 'king-activation-support-region',
    designatedTargets: { piece: 'white king', squares: ['b3', 'c3'], authoredTerminal: 'king reaches the proposed support region while the tablebase win is preserved' },
    targetSquares: ['b3', 'c3'],
    candidates: [
      { ...common, positionId: 'king-activation-support-region', fen: '8/7k/8/8/8/3P4/2K5/8 w - - 0 1', sourceReference: 'ku:endgames:pawn-foundations:activate-the-king/pos:activate-king:clean', pieceCount: 3, naturalness: 'high', instructionalClarity: 'high', objectiveAmbiguityRisk: 'medium', score: 89, disposition: 'recommended-unapproved' },
      { ...common, positionId: 'king-activation-mirrored-region', fen: 'k7/8/8/8/8/4P3/5K2/8 w - - 0 1', sourceReference: 'ku:endgames:pawn-foundations:activate-the-king/pos:activate-king:contrast', pieceCount: 3, naturalness: 'high', instructionalClarity: 'medium', objectiveAmbiguityRisk: 'medium', score: 81, disposition: 'not-recommended-mirrored-duplicate' },
      { ...common, positionId: 'second-target-king-entry', fen: '8/8/4k3/8/P2K3P/8/8/8 w - - 0 1', sourceReference: 'ku:endgames:pawn-exchanges:second-distant-target/pos:second-target:separated-wings', pieceCount: 4, naturalness: 'high', instructionalClarity: 'medium', objectiveAmbiguityRisk: 'high', score: 73, disposition: 'not-recommended-target-region-needs-more-authoring' }
    ]
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
  const beforeSide = rules.sideToMove();
  const applied = rules.move(move.uci);
  if (applied.san !== move.san || rules.fen() !== move.resultingFen || rules.sideToMove() === beforeSide)
    throw new Error(`invalid-provider-transition:${fen}:${move.uci}`);
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

const preserving = evidence => evidence.moves.filter(move => evidence.wdlPreservingMoves.includes(move.uci));
function policyMove(evidence, policyId) {
  const choices = preserving(evidence);
  const optimal = choices.filter(move => evidence.dtzOptimalMoves.includes(move.uci));
  if (policyId === 'wdl-dtz-uci') return [...(optimal.length ? optimal : choices)].sort((a, b) => a.uci.localeCompare(b.uci))[0];
  if (policyId === 'maximum-resistance') return [...choices].sort((a, b) => Math.abs(b.dtz ?? 0) - Math.abs(a.dtz ?? 0) || a.uci.localeCompare(b.uci))[0];
  return [...choices].sort((a, b) => Math.abs(a.dtz ?? 999) - Math.abs(b.dtz ?? 999) || a.uci.localeCompare(b.uci))[0];
}

function successReached(family, fen, ply) {
  const rules = ChessRulesFacade.fromFen(fen);
  if (family.objectiveFamily === 'activate-king')
    return rules.pieces().some(piece => piece.color === 'white' && piece.type === 'k' && family.targetSquares.includes(piece.square));
  if (family.objectiveFamily === 'convert-material-advantage')
    return ply >= 6 && rules.pieces().filter(piece => piece.type === 'p' && piece.color === 'black').length === 0;
  return ply >= 8;
}

function classify(evidence, learnerSide, objectiveFamily) {
  const side = ChessRulesFacade.fromFen(evidence.positionFen).sideToMove();
  return Object.fromEntries(evidence.moves.map(move => {
    const keepsResult = evidence.wdlPreservingMoves.includes(move.uci);
    const learner = side === learnerSide;
    return [move.uci, {
      classification: !learner ? 'candidate-opponent-reply'
        : keepsResult ? 'result-preserved-objective-status-requires-human-review'
          : objectiveFamily === 'hold-draw' ? 'chess-result-failure-candidate' : 'win-to-draw-or-loss-candidate',
      status: STATUS, resultingCategory: move.resultingCategory, resultingFen: move.resultingFen
    }];
  }));
}

async function buildGraph(family, candidate, fetchImpl) {
  const cache = new Map();
  const lines = [];
  const policies = ['wdl-dtz-uci', 'maximum-resistance', 'authored-deterministic-tree'];
  for (const policyId of policies) {
    let fen = candidate.fen;
    const plies = [];
    const seen = new Set();
    let terminal = 'maximum-ply-boundary';
    for (let ply = 1; ply <= 14; ply += 1) {
      const key = canonicalFen(fen);
      if (seen.has(key)) { terminal = 'repetition-boundary'; break; }
      seen.add(key);
      const evidence = await evidenceFor(fen, candidate.positionId, fetchImpl, cache);
      const selected = policyMove(evidence, policyId);
      if (!selected) { terminal = 'technical-boundary-no-policy-move'; break; }
      plies.push({
        ply, normalizedFen: evidence.positionFen,
        sideToMove: ChessRulesFacade.fromFen(fen).sideToMove(),
        theoreticalCategory: evidence.category, legalMoves: evidence.moves,
        wdlPreservingMoves: evidence.wdlPreservingMoves,
        candidateLearnerMoves: ChessRulesFacade.fromFen(fen).sideToMove() === candidate.learnerSide ? evidence.wdlPreservingMoves : [],
        candidateOpponentReplies: ChessRulesFacade.fromFen(fen).sideToMove() !== candidate.learnerSide ? evidence.wdlPreservingMoves : [],
        moveClassifications: classify(evidence, candidate.learnerSide, family.objectiveFamily),
        proposedMove: selected, terminalClassification: null, evidenceDigest: evidence.evidenceDigest
      });
      fen = selected.resultingFen;
      if (successReached(family, fen, ply)) { terminal = 'candidate-success-terminal-unapproved'; break; }
    }
    lines.push({ lineId: `${candidate.positionId}:${policyId}`, policyId, plies, terminal });
  }
  const states = [...cache.values()].sort((a, b) => a.positionFen.localeCompare(b.positionFen));
  const base = {
    graphSchemaVersion: '1.0.0', positionId: candidate.positionId,
    objectiveFamily: family.objectiveFamily, initialFen: candidate.fen,
    maximumExploredPly: 14,
    pruningRules: [
      'retain every legal provider move and its truthful WDL classification at each expanded node',
      'expand one deterministic continuation per policy to bound breadth',
      'stop at proposed objective terminal, repetition, unavailable move, or 14 plies',
      'all proposed terminals and routes remain unapproved pending human review'
    ],
    states, lines, approvalStatus: STATUS
  };
  return { ...base, graphDigest: sha256(base) };
}

async function candidateComparison(family, fetchImpl) {
  const records = [];
  for (const candidate of family.candidates) {
    const evidence = await evidenceFor(candidate.fen, candidate.positionId, fetchImpl, new Map());
    records.push({
      ...candidate, objectiveFamily: family.objectiveFamily,
      theoreticalResult: evidence.category, tablebaseCategory: evidence.category,
      dtz: evidence.dtz ?? null, dtm: evidence.dtm ?? null,
      initialLegalMoves: evidence.moves.map(move => move.uci),
      initialWdlPreservingMoves: evidence.wdlPreservingMoves,
      initialDtzOptimalMoves: evidence.dtzOptimalMoves,
      shortestProposedSuccessLine: 'requires bounded graph for recommended candidate',
      longestResistantLine: 'requires bounded graph for recommended candidate',
      branchingComplexity: evidence.moves.length, repetitionRisk: 'bounded-review-required',
      artifactSizeEstimate: candidate.pieceCount <= 3 ? 'small' : 'medium',
      humanReviewComplexity: candidate.objectiveAmbiguityRisk === 'high' ? 'high' : 'medium',
      evidenceDigest: evidence.evidenceDigest
    });
  }
  return records;
}

async function engineEvidence(candidate, executable) {
  const [identity, policy] = await Promise.all([
    readFile(identityPath, 'utf8').then(JSON.parse),
    readFile(policyPath, 'utf8').then(JSON.parse)
  ]);
  const result = await runEngineReview({ executable, identity, policy, fen: candidate.fen });
  const base = {
    evidenceSchemaVersion: '1.0.0', evidenceType: 'stockfish-secondary-comparison',
    positionId: candidate.positionId, fen: candidate.fen, engineIdentity: result.engineIdentity,
    analysisPolicy: result.analysisPolicy, bestMove: result.bestMove, candidates: result.candidates,
    authority: 'secondary-only-tablebase-remains-theoretical-authority',
    pedagogicalUse: 'identify natural alternatives and possible objective ambiguity',
    approvalStatus: STATUS
  };
  return { ...base, evidenceDigest: sha256(base) };
}

const policyCandidates = () => [
  ['wdl-dtz-uci', 'Preserve WDL, prefer provider DTZ optimum, then lexicographic UCI.', 'medium', 'medium'],
  ['maximum-resistance', 'Preserve WDL, maximize absolute DTZ, then lexicographic UCI.', 'medium-low', 'high'],
  ['authored-deterministic-tree', 'Select only human-reviewed moves from the locally validated state graph.', 'high', 'human-selected']
].map(([policyId, algorithm, pedagogicalNaturalness, difficulty]) => ({
  policyId, algorithm, reproducible: true, artifactSize: 'small',
  pedagogicalNaturalness, objectivePressure: 'requires-human-review',
  repetitionRisk: 'bounded', runtimeNetworkRequired: false, ambiguityRisk: 'requires-human-review',
  difficulty, teachesIntendedConcept: 'unapproved-human-judgment-required', status: STATUS
}));

function successCandidates(family) {
  const concrete = family.objectiveFamily === 'activate-king' ? 'white-king-reaches-b3-or-c3'
    : family.objectiveFamily === 'convert-material-advantage' ? 'black-central-pawn-captured'
      : 'approved-defensive-board-event';
  return [concrete, 'exact-theoretical-result-terminal', 'human-authored-terminal'].map((id, index) => ({
    id, clarity: index === 0 ? 'high' : 'medium', deterministicEvaluation: 'high-after-approval',
    prematureSuccessRisk: index === 2 ? 'human-review-dependent' : 'medium',
    edgeCases: 'promotion, stalemate, repetition, and off-route result preservation require explicit classification',
    runtimeRequirements: 'approved offline state graph only', educationalValue: 'high',
    artifactComplexity: 'small-to-medium', accessibilityWording: 'board event described without color-only cues', status: STATUS
  }));
}

const failureCandidates = () => [
  ['objective-failure', 'approved mission becomes unreachable'],
  ['chess-result-failure', 'win becomes draw or loss, or draw becomes loss'],
  ['objective-miss-result-preserved', 'result remains acceptable but the proposed mission is missed'],
  ['authored-concept-miss', 'legal off-route move remains recoverable'],
  ['technical-unavailable', 'artifact cannot classify safely; always neutral']
].map(([classification, meaning]) => ({ classification, meaning, status: STATUS }));

const feedback = () => Object.fromEntries([
  ['correctProgress', 'This move makes progress toward the proposed goal.'],
  ['acceptedAlternative', 'This alternative preserves the required result.'],
  ['authoredConceptMiss', 'The result may still be safe, but this leaves the proposed route.'],
  ['objectiveMissResultPreserved', 'The position remains viable, but the proposed exercise goal was missed.'],
  ['chessResultFailure', 'The required theoretical result is no longer preserved.'],
  ['objectiveFailure', 'The proposed mission can no longer be completed.'],
  ['opponentReply', 'The reply continues the selected review line.'],
  ['success', 'The proposed board objective has been reached.'],
  ['technicalUnavailable', 'This position could not be classified safely. This is not learner failure.'],
  ['retry', 'The last approved review node has been restored.'],
  ['summary', 'Review the king route, pawn structure, and resulting position.']
].map(([key, text]) => [key, { text, status: STATUS }]));

function markdown(packet) {
  const rows = packet.candidateComparison.map(c =>
    `| ${c.positionId} | \`${c.initialFen ?? c.fen}\` | ${c.tablebaseCategory} | ${c.dtz} | ${c.score} | ${c.disposition} |`).join('\n');
  const lines = packet.candidateLines.map(line =>
    `- **${line.policyId}**: ${line.plies.map(p => p.proposedMove.san).join(' ')} — ${line.terminal}`).join('\n');
  return `# ${packet.objectiveFamily} candidate review packet

> Every objective, route, policy, terminal, hint, feedback item, and ply bound is **UNAPPROVED — HUMAN REVIEW REQUIRED**.

## Candidate comparison

| Position | FEN | Category | DTZ | Score | Disposition |
|---|---|---:|---:|---:|---|
${rows}

## Recommendation (not approval)

- Position: \`${packet.positionId}\`
- FEN: \`${packet.initialFen}\`
- Graph digest: \`${packet.tablebaseEvidence.treeDigest}\`
- Engine digest: \`${packet.stockfishEvidence.evidenceDigest}\`
- Position digest: \`${packet.positionDigest}\`

${packet.recommendationRationale}

## Bounded candidate lines

${lines}

All fields in \`reviewTemplate\` must be supplied by a human reviewer and bound to the displayed digests.

Packet digest: \`${packet.packetDigest}\`
`;
}

async function buildPacket(family, executable, fetchImpl) {
  const candidate = family.candidates.find(item => item.positionId === family.recommendedId);
  const [comparison, graph, stockfishEvidence] = await Promise.all([
    candidateComparison(family, fetchImpl), buildGraph(family, candidate, fetchImpl),
    engineEvidence(candidate, executable)
  ]);
  const positionDigest = sha256({
    positionId: candidate.positionId, initialFen: candidate.fen,
    learnerSide: candidate.learnerSide, designatedTargets: family.designatedTargets,
    objectiveFamily: family.objectiveFamily
  });
  const packetBase = {
    packetSchemaVersion: '1.0.0',
    packetId: `caissa-multi-move-review:${candidate.positionId}:${family.objectiveFamily}@candidate-1.0.0`,
    positionId: candidate.positionId, objectiveFamily: family.objectiveFamily,
    sourceType: candidate.sourceType, sourceReference: candidate.sourceReference,
    initialFen: candidate.fen, learnerSide: candidate.learnerSide,
    designatedTargets: family.designatedTargets,
    candidateObjective: { objectiveId: family.objectiveFamily, objectiveVersion: 'candidate-1.0.0', description: family.description, status: STATUS },
    existingHumanApproval: {
      exactPositionApproved: false, objectiveApproved: false, policyApproved: false,
      sourceKnowledgeApprovalExtendsToMultiMove: false, scopeExtensionPermittedWithoutNewReview: false
    },
    candidateSearchReport: {
      repositorySearchedFirst: true,
      sources: ['Knowledge Units', 'private packets and evidence', 'curated pools', 'Trainer fixtures and tests'],
      candidateCount: comparison.length, minimumPerFamilyMet: comparison.length >= 2,
      recommendedCandidateId: candidate.positionId, recommendationIsApproval: false
    },
    candidateComparison: comparison.map(item => ({
      ...item,
      shortestProposedSuccessLine: item.positionId === candidate.positionId ? Math.min(...graph.lines.map(line => line.plies.length)) : item.shortestProposedSuccessLine,
      longestResistantLine: item.positionId === candidate.positionId ? Math.max(...graph.lines.map(line => line.plies.length)) : item.longestResistantLine
    })),
    recommendationRationale: family.objectiveFamily === 'convert-material-advantage'
      ? 'Recommended because a five-piece favorable simplification is distinct from the existing pure promotion pilot and retains exact coverage.'
      : family.objectiveFamily === 'hold-draw'
        ? 'Recommended because opposition defense preserves a draw over repeated decisions without reducing the mission to catching one pawn.'
        : 'Recommended because the proposed b3/c3 region makes king activation objectively observable while exact winning evidence remains available.',
    positionDigest,
    tablebaseEvidence: {
      provider: REMOTE_PROVIDER, localTablebaseVerified: false, rawResponsesPublished: false,
      runtimeNetworkRequired: false, stateCount: graph.states.length, requestCount: graph.states.length,
      treeDigest: graph.graphDigest, completeForBoundedExpandedStates: true
    },
    stockfishEvidence, candidateStateGraph: graph, candidateLines: graph.lines,
    opponentPolicyCandidates: policyCandidates(), successConditionCandidates: successCandidates(family),
    failureConditionCandidates: failureCandidates(),
    objectiveMissSemantics: {
      resultPreserved: 'A legal move may preserve WDL while missing the proposed instructional mission.',
      authoredConceptMiss: 'A recoverable off-route move is not automatically chess-result failure.',
      technicalUnavailable: 'Always neutral and never learner failure.', status: STATUS
    },
    promotionSemantics: {
      relevance: family.objectiveFamily === 'hold-draw' ? 'possible downstream edge case' : 'possible conversion terminal',
      queen: 'requires-human-review', rook: 'requires-human-review',
      bishop: 'requires-human-review', knight: 'requires-human-review', status: STATUS
    },
    stalemateSemantics: {
      candidateClassification: 'must be explicitly reviewed as objective success, result preservation, or objective miss',
      neverInferSuccess: true, status: STATUS
    },
    maximumPlyCandidates: {
      shortestSuccessLine: Math.min(...graph.lines.map(line => line.plies.length)),
      longestRecommendedAuthoredLine: graph.lines.find(line => line.policyId === 'authored-deterministic-tree').plies.length,
      longestResistantLine: Math.max(...graph.lines.map(line => line.plies.length)),
      minimumPracticalBound: 6, recommendedBound: 12, maximumSafeBound: 14,
      repetitionBoundary: 'neutral retry at first repeated canonical FEN',
      fiftyMoveRelevant: false, status: STATUS
    },
    hintCandidates: [
      { stage: 1, text: `Consider the central idea of ${family.objectiveFamily.replaceAll('-', ' ')}.`, independentSuccessEligibilityAfterUse: true },
      { stage: 2, text: 'Compare the king route with the pawn structure and the opponent’s entry squares.', independentSuccessEligibilityAfterUse: true },
      { stage: 3, text: 'Reveal the proposed learner move stored for the current reviewed node.', independentSuccessEligibilityAfterUse: false }
    ].map(item => ({ ...item, persistenceEffect: 'none', status: STATUS })),
    feedbackCandidates: feedback(),
    openQuestions: [
      'Is this exact position and objective suitable for a multi-move pilot?',
      'Which learner alternatives and opponent policy should be approved?',
      'Which terminal, miss semantics, ply bound, hints, and feedback should be approved?'
    ],
    allowedHumanDecisions: ALLOWED_DECISIONS, reviewTemplate: reviewTemplate()
  };
  return { ...packetBase, packetDigest: sha256(packetBase) };
}

function aggregate(packets) {
  const proposed = [
    { id: 'kp-coordinate-support-promote', objective: 'promote', role: 'offensive', learnerSide: 'white', pieceCount: 3 },
    { id: 'rule-square-a-pawn-catch-stop-promotion', objective: 'stop-promotion', role: 'defensive', learnerSide: 'white', pieceCount: 3 },
    ...packets.map(packet => ({
      id: packet.positionId, objective: packet.objectiveFamily,
      role: packet.objectiveFamily === 'hold-draw' ? 'defensive' : 'offensive-or-foundational',
      learnerSide: packet.learnerSide,
      pieceCount: packet.candidateComparison.find(item => item.positionId === packet.positionId).pieceCount
    }))
  ];
  const base = {
    analysisSchemaVersion: '1.0.0',
    analysisId: 'five-item-content-expansion-candidate-set-1.0.0',
    status: STATUS, isRunArtifact: false, publicReleaseAuthorized: false,
    proposedItems: proposed, objectiveCount: new Set(proposed.map(item => item.objective)).size,
    offensiveDefensiveBalance: { offensiveOrFoundational: 3, defensive: 2 },
    conversionCoverage: 'promote plus distinct favorable-simplification conversion candidate',
    foundationalTechniqueCoverage: 'king activation and opposition',
    duplicateConcepts: ['promotion remains adjacent to conversion but uses distinct five-piece simplification geometry'],
    duplicateFenGeometry: false,
    sideToMoveBalance: { white: 5, black: 0, concern: 'future human review should consider learner-side diversity' },
    learnerColorBalance: { white: 5, black: 0, concern: 'not balanced' },
    averagePieceCount: proposed.reduce((sum, item) => sum + item.pieceCount, 0) / proposed.length,
    averagePlyLengthEstimate: 10,
    difficultyDistribution: { foundational: 2, intermediate: 3 },
    hintDistribution: 'three proposed stages on each new candidate; existing pilots unchanged',
    terminalDiversity: ['queen promotion', 'opponent-pawn capture', 'winning simplification terminal', 'draw preservation', 'king support region'],
    mobileSuitability: 'compact three-to-five-piece boards; no runtime work authorized',
    runtimeArtifactSizeEstimate: 'small-to-medium if later approved and compiled',
    humanReviewWorkload: 'three exact packets and bounded graphs',
    implementationWorkload: 'future phase only; no runtime implementation in 10.11A',
    limitedPreviewReadinessIfApproved: 'candidate set appears balanced by mission, but all three exact packets require human approval',
    currentRunIntegrity: 'unchanged two-item run remains authoritative'
  };
  return { ...base, analysisDigest: sha256(base) };
}

function aggregateMarkdown(value) {
  return `# Five-item content expansion candidate set 1.0.0

> Private planning analysis only. It is not a run artifact and grants no approval.

- Candidate objectives: ${value.objectiveCount}
- Offensive/foundational vs defensive: ${value.offensiveDefensiveBalance.offensiveOrFoundational}/${value.offensiveDefensiveBalance.defensive}
- Average piece count: ${value.averagePieceCount}
- Learner-color balance: ${value.learnerColorBalance.white} White / ${value.learnerColorBalance.black} Black (open concern)
- Future readiness: ${value.limitedPreviewReadinessIfApproved}
- Current public and hidden two-item runtime: unchanged

Analysis digest: \`${value.analysisDigest}\`
`;
}

export async function generateSeason1011A({ executable, fetchImpl = fetch, write = true } = {}) {
  if (!executable) throw new Error('stockfish-executable-required');
  const packets = [];
  for (const family of FAMILIES) packets.push(await buildPacket(family, executable, fetchImpl));
  const readiness = aggregate(packets);
  if (write) {
    await Promise.all([packetDir, graphDir, evidenceDir, readinessDir].map(path => mkdir(path, { recursive: true })));
    for (const packet of packets) {
      const stem = `${packet.positionId}-${packet.objectiveFamily}`;
      await Promise.all([
        writeJson(join(packetDir, `${stem}.json`), packet),
        writeFile(join(packetDir, `${stem}.md`), markdown(packet), 'utf8'),
        writeJson(join(graphDir, `${stem}-state-graph.json`), packet.candidateStateGraph),
        writeJson(join(evidenceDir, `${stem}.stockfish-18.json`), packet.stockfishEvidence)
      ]);
    }
    await Promise.all([
      writeJson(join(readinessDir, 'five-item-content-expansion-candidate-set-1.0.0.json'), readiness),
      writeFile(join(readinessDir, 'five-item-content-expansion-candidate-set-1.0.0.md'), aggregateMarkdown(readiness), 'utf8')
    ]);
  }
  return { packets, readiness };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await generateSeason1011A({ executable: argument('--engine') });
  console.log(`Generated ${result.packets.length} Season 10.11A packets (${result.readiness.analysisDigest}).`);
}
