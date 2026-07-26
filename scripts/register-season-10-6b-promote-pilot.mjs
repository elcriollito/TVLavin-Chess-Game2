import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeCompatibilityFingerprint } from '../js/endgame-trainer/v2/curated-pool-validator.js';
import { sha256 } from './endgame-remote-tablebase.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packetPath = join(root, 'endgame-pools/private/multi-move-review-packets/kp-coordinate-support-promote.json');
const graphPath = join(root, 'endgame-pools/private/multi-move-tablebase/kp-coordinate-support-promote-state-graph.json');
const bundlePath = join(root, 'endgame-pools/private/human-adjudications/season-10.6b-promote-pilot.json');
const publicPath = join(root, 'public/data/endgame-pilots/kp-coordinate-support-promote/1.0.0.json');
export const APPROVAL = Object.freeze({
  reviewDecision: 'approve-promote-pilot', reviewerReference: 'reviewer:alexander:season-10.6b', reviewRevision: 1,
  reviewedPositionDigest: 'sha256-f3f4e62ebd3e24d345fc77f6f525078c0d2088f7287992084c241658f3bb02ef',
  reviewedTablebaseTreeDigest: 'sha256-db8beb46b80d68fa9858211e4a33e969d826f4da6a4f9b17c57bd2f477d8ef85',
  reviewedEngineEvidenceDigest: 'sha256-cb084ed8a7447805f970132d4d5f6c2c369ef00a03d87edf0dd395ebbc3f05a0',
  reviewedPacketDigest: 'sha256-c7b361fe87f990990974c606e3a1029b54e395f57a2873f1539dabaf00cf8a10',
  reviewRationale: `The position is approved for a hidden multi-move promote technical pilot because
it is legal, theoretically winning, small enough for exact verification, and
pedagogically suitable for teaching king coordination with a passed pawn.

The approved first moves are Ke6 and Kf6. Both preserve the theoretical win and
lead to short, understandable promotion routes. The authored deterministic tree
is selected instead of a dynamic DTZ or engine policy because it is reproducible,
requires no runtime network or engine, and gives the learner a stable educational
experience.

The designated white e-pawn must be promoted to a queen for objective success.
A learner move is an objective failure only when the approved bounded evidence
proves that the theoretical win has changed to a draw or loss, the designated
pawn is lost, promotion becomes impossible, or the 12-ply limit is reached
without queen promotion.

A legal move that preserves the theoretical win but leaves the approved
instructional route is an authored-concept miss, not a chess loss. The learner
must receive truthful feedback and be allowed to retry from the approved node.

The maximum length is 12 plies because the approved routes finish within 9 or
11 plies and the limit provides sufficient margin without allowing the exercise
to become unnecessarily long.

All opponent replies are explicitly authored from validated tablebase-supported
moves. Runtime network access, live tablebase requests, Stockfish execution,
persistent scoring, Personal Best, leaderboard, Knowledge writes, Training
Memory writes, Mastery writes, Recommendation writes, and cloud persistence are
not approved.

Hints and feedback are approved only for this technical pilot. A next-move reveal
removes independent-success eligibility. Technical failures are always neutral
and must never be recorded as learner failure.

This approval is bound to the reviewed position, tablebase tree, Stockfish
evidence, and review packet digests supplied for
kp-coordinate-support-promote@1.0.0. Any change to those bindings requires a new
human-review revision.`
});
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const without = (value, key) => Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));

export function validateApproval({ packet, graph, approval = APPROVAL }) {
  if (!approval.reviewRationale?.trim()) throw new Error('missing-rationale');
  if (approval.reviewDecision !== 'approve-promote-pilot') throw new Error('invalid-decision');
  const initial = graph.states.find(state => state.positionFen === packet.initialFen);
  const actual = {
    reviewedPositionDigest: initial?.positionContentDigest,
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
    const classifications = Object.fromEntries(learner.state.moves.map(move => [
      move.uci, sequence[index] === move.uci ? 'approved' :
        learner.state.wdlPreservingMoves.includes(move.uci) ? 'authored-concept-miss' : 'objective-failure'
    ]));
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
  const bundleBase = { bundleSchemaVersion: '1.0.0', bundleId: 'season-10.6b-promote-pilot', ...approval };
  const bundle = { ...bundleBase, bundleDigest: sha256(bundleBase) };
  const branches = [
    buildBranch('ke6', 'Ke6', ['e5e6','c7b6','e4e5','b6a5','e6d5','a5a4','e5e6','a4a3','e6e7','a3a2','e7e8q'], graph, packet.initialFen),
    buildBranch('kf6', 'Kf6', ['e5f6','c7b6','e4e5','b6a5','e5e6','a5a4','e6e7','a4a3','e7e8q'], graph, packet.initialFen)
  ];
  const artifactBase = {
    schemaVersion: '1.0.0', pilotId: 'kp-coordinate-support-promote', pilotVersion: '1.0.0',
    label: 'Multi-Move Technical Pilot', trustLabel: 'Local technical practice',
    objective: { id: 'promote', version: '1.0.0', label: 'Promote the e-pawn', learnerSide: 'white',
      designatedPawn: { color: 'white', origin: 'e4' }, success: 'designated-pawn-queen-promotion',
      maximumPly: 12 },
    initialFen: packet.initialFen,
    opponentPolicy: { id: 'authored-deterministic-tree', version: '1.0.0', runtimeNetworkRequired: false },
    branches,
    hints: [
      'Keep the king in front of the pawn and escort it toward promotion.',
      'Improve the king first, then advance the pawn while keeping the defending king away.',
      'Reveal the approved learner move for the current position.'
    ],
    feedback: {
      progress: 'Good. The king stays ahead of the pawn and the promotion route remains winning.',
      conceptMiss: 'That move may preserve the position, but it leaves the approved escorting route. Try the move that keeps the king in front of the pawn.',
      failure: 'That move gives up the forced promotion. Retry from the previous position.',
      opponent: 'Black follows the approved resisting route.',
      success: 'Promoted. You escorted the pawn safely to the eighth rank.',
      technical: 'The pilot could not verify the position. Your attempt was not counted.',
      retry: 'The position has been reset to the start.'
    },
    resultLabels: ['independent-success','hint-assisted-success','objective-failure','technical-unavailable','abandoned'],
    persistence: 'none', timer: 'none', scoring: 'local-result-only',
    provenance: { sourcePoolId: 'caissa-king-pawn-decisions', sourcePoolVersion: '1.1.0', positionId: 'kp-coordinate-support' },
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
