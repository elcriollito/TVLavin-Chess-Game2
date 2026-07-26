import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeCompatibilityFingerprint } from '../js/endgame-trainer/v2/curated-pool-validator.js';
import { sha256 } from './endgame-remote-tablebase.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packetPath = join(root, 'endgame-pools/private/multi-move-review-packets/rule-square-a-pawn-catch-stop-promotion.json');
const graphPath = join(root, 'endgame-pools/private/multi-move-tablebase/rule-square-a-pawn-catch-stop-promotion-state-graph.json');
const bundlePath = join(root, 'endgame-pools/private/human-adjudications/season-10.8b-stop-promotion-pilot.json');
const publicPath = join(root, 'public/data/endgame-pilots/rule-square-a-pawn-catch-stop-promotion/1.0.0.json');
export const APPROVAL = Object.freeze({
  reviewDecision: 'approve-stop-promotion-pilot',
  reviewerReference: 'reviewer:alexander:season-10.8b',
  reviewRevision: 1,
  reviewedPositionDigest: 'sha256-b565e2f59641eb28ba6a3862874f89efb72230d16a15ef693724dd18b6fdd417',
  reviewedTablebaseTreeDigest: 'sha256-529b22e9b815518b563df735bdc6c00c39a6d3cef974dcf100eb70dc2e911ad9',
  reviewedEngineEvidenceDigest: 'sha256-e04bb999b390650a201c69a524dbcc0ca1fc66568fdc5c4b04121f4afab26d90',
  reviewedPacketDigest: 'sha256-2800982f81697f3e5de7db223411b85f2b8215a11c245839d344f884a045d555',
  reviewRationale: `The position is approved for a hidden stop-promotion multi-move technical
pilot because it is legal, naturally illustrates the rule of the square,
has exact three-piece tablebase coverage, and ends with a clear capture
terminal.

Kc1 and Kc2 are approved first moves because both place the white king on
a direct stopping route and lead through compact, understandable lines to
the capture of the designated black a-pawn. Kd2 is not approved for this
training objective. Although it preserves the theoretical draw, bounded
evidence shows that it may allow the pawn to promote. The exercise evaluates
whether promotion is stopped, not merely whether the chess position remains
drawn.

The authored deterministic tree is approved because it makes the pawn advance
immediately, presents the intended rule-of-the-square lesson clearly, is fully
reproducible, and requires no runtime engine, tablebase, backend, or random
selection.

Success requires the white king to capture the designated a-pawn before it
promotes. The exercise does not terminate merely because the king enters the
pawn’s square; the learner must complete the defensive technique.

Objective failure occurs when approved bounded evidence proves that the pawn
can no longer be stopped before promotion, when the theoretical draw changes
to a loss, when the pawn legally promotes to any piece, or when the approved
10-ply limit or repetition boundary is reached without capture. A move may
therefore fail this objective while the chess position remains theoretically
drawn, and the feedback must state that distinction truthfully.

Any legal promotion to queen, rook, bishop, or knight fails the stop-promotion
objective regardless of the resulting WDL. A legal drawing move outside the
approved route is an authored-concept miss only when bounded evidence still
shows that the pawn can be stopped. Uncovered states are technical-unavailable,
never learner failure.

Hints and feedback are approved only for this hidden pilot. A next-move reveal
removes independent-success eligibility. Technical failures remain neutral and
must create no score penalty, Knowledge evidence, Training Memory, Mastery,
Recommendation, persistence, Personal Best, or leaderboard result.

This approval is bound to the reviewed position, tablebase tree, Stockfish
evidence, and packet digests for
rule-square-a-pawn-catch-stop-promotion@1.0.0. Any change requires a new human
review revision.`
});
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const without = (value, key) => Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));

export function validateApproval({ packet, graph, approval = APPROVAL }) {
  if (!approval.reviewRationale?.trim()) throw new Error('missing-rationale');
  if (approval.reviewDecision !== 'approve-stop-promotion-pilot') throw new Error('invalid-decision');
  const actual = {
    reviewedPositionDigest: packet.positionDigest,
    reviewedTablebaseTreeDigest: graph.graphDigest,
    reviewedEngineEvidenceDigest: packet.stockfishEvidence.evidenceDigest,
    reviewedPacketDigest: packet.packetDigest
  };
  for (const [key, value] of Object.entries(actual)) if (approval[key] !== value) throw new Error(`stale-${key}`);
  if (graph.graphDigest !== sha256(without(graph, 'graphDigest')) ||
      packet.packetDigest !== sha256(without(packet, 'packetDigest'))) throw new Error('source-digest-invalid');
  return true;
}

function applyMove(fen, uci, graph) {
  const state = graph.states.find(item => item.positionFen === fen);
  const move = state?.moves.find(item => item.uci === uci);
  if (!move) throw new Error(`approved-tree-move-missing:${uci}`);
  return { state, move };
}

function buildBranch(id, first, sequence, graph, initialFen) {
  let fen = initialFen;
  const nodes = [];
  for (let index = 0; index < sequence.length; index += 2) {
    const learner = applyMove(fen, sequence[index], graph);
    const classifications = Object.fromEntries(learner.state.moves.map(move => {
      let classification = sequence[index] === move.uci ? 'approved' :
        learner.state.wdlPreservingMoves.includes(move.uci) ? 'authored-concept-miss' : 'objective-failure';
      if (learner.state.positionFen === initialFen && move.uci === 'd1d2') classification = 'objective-miss-while-drawing';
      return [move.uci, classification];
    }));
    fen = learner.move.resultingFen;
    const opponentUci = sequence[index + 1] ?? null;
    let opponent = null;
    if (opponentUci) {
      opponent = applyMove(fen, opponentUci, graph).move;
      fen = opponent.resultingFen;
    }
    nodes.push({
      nodeId: `${id}-${nodes.length + 1}`, fen: learner.state.positionFen,
      approvedLearnerMove: { uci: learner.move.uci, san: learner.move.san, resultingFen: learner.move.resultingFen },
      deviationClassifications: classifications,
      opponentReply: opponent ? { uci: opponent.uci, san: opponent.san, resultingFen: opponent.resultingFen } : null
    });
  }
  return { branchId: id, firstMove: first, nodes };
}

export async function registerAndBuild({ approval = APPROVAL, write = true } = {}) {
  const [packet, graph] = await Promise.all([read(packetPath), read(graphPath)]);
  validateApproval({ packet, graph, approval });
  const bundleBase = { bundleSchemaVersion: '1.0.0', bundleId: 'season-10.8b-stop-promotion-pilot', ...approval };
  const bundle = { ...bundleBase, bundleDigest: sha256(bundleBase) };
  const branches = [
    buildBranch('kc1', 'Kc1', ['d1c1','a4a3','c1b1','a3a2','b1a1','a8a7','a1a2'], graph, packet.initialFen),
    buildBranch('kc2', 'Kc2', ['d1c2','a4a3','c2b1','a3a2','b1a1','a8a7','a1a2'], graph, packet.initialFen)
  ];
  const artifactBase = {
    schemaVersion: '1.0.0', pilotId: 'rule-square-a-pawn-catch-stop-promotion', pilotVersion: '1.0.0',
    label: 'Multi-Move Technical Pilot', trustLabel: 'Local technical practice',
    objective: { id: 'stop-promotion', version: '1.0.0', label: 'Stop the a-pawn', learnerSide: 'white',
      designatedPawn: { color: 'black', origin: 'a4', promotionSquare: 'a1' },
      success: 'designated-opponent-pawn-capture-before-promotion', maximumPly: 10,
      promotionFailurePieces: ['queen','rook','bishop','knight'] },
    initialFen: packet.initialFen,
    opponentPolicy: { id: 'authored-deterministic-tree', version: '1.0.0', runtimeNetworkRequired: false },
    branches,
    hints: [
      'Use the square of the pawn and bring the king into its path.',
      'Move toward the a-file before the pawn advances too far.',
      'Reveal the approved learner move for the current node.'
    ],
    feedback: {
      progress: 'Good. Your king stays inside the pawn’s stopping route.',
      conceptMiss: 'That legal move may still draw, but it leaves the approved route for stopping the pawn. Return to the previous position and stay inside the pawn’s square.',
      objectiveMissWhileDrawing: 'That move may still draw the game, but it no longer stops the designated pawn from promoting. The training objective has been missed.',
      failure: 'That move leaves the pawn unstoppable and also loses the theoretical draw.',
      opponent: 'Black advances the a-pawn.',
      success: 'Captured. The pawn can no longer promote.',
      promotionPrevented: 'You reached the stopping route. Complete the defense by capturing the pawn.',
      technical: 'The position could not be verified. This is not learner failure.',
      retry: 'The reviewed position has been restored.',
      successSummary: 'You entered the pawn’s square, caught it, and stopped promotion.'
    },
    failureSemantics: ['pawn-unstoppable','draw-to-loss','designated-pawn-promotion','maximum-ply','repetition-boundary'],
    resultLabels: ['independent-success','hint-assisted-success','objective-failure','objective-miss-while-drawing','technical-unavailable','abandoned'],
    persistence: 'none', timer: 'none', scoring: 'local-result-only',
    provenance: { source: 'bounded-human-approved-three-piece-tablebase-tree' },
    verificationSummary: { humanApproved: true, remoteTablebaseEvidence: true, localTablebaseVerified: false,
      stockfishEvidenceAvailable: true, runtimeNetworkRequired: false }
  };
  const contentFingerprint = computeCompatibilityFingerprint(artifactBase).replace('epool-', 'epilot-');
  const contentDigest = sha256(artifactBase);
  const artifact = { ...artifactBase, contentFingerprint, contentDigest };
  if (write) {
    await Promise.all([mkdir(dirname(bundlePath), { recursive: true }), mkdir(dirname(publicPath), { recursive: true })]);
    await writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`);
    await writeFile(publicPath, `${JSON.stringify(artifact)}\n`);
  }
  return { bundle, artifact };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { bundle, artifact } = await registerAndBuild();
  console.log(`${artifact.pilotId}@${artifact.pilotVersion} ${artifact.contentFingerprint} ${artifact.contentDigest} ${bundle.bundleDigest}`);
}
