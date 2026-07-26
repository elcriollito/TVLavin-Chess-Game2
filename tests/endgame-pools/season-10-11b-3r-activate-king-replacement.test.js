import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ChessRulesFacade } from '../../js/endgame-trainer/chess-rules-facade.js';
import {
  ALLOWED_DECISIONS, CANDIDATES, INITIAL_FEN, MAXIMUM_EXPLORED_PLY,
  POSITION_ID, TARGETS
} from '../../scripts/generate-season-10-11b-3r-activate-king-replacement.mjs';
import { sha256 } from '../../scripts/endgame-remote-tablebase.mjs';
import { isProtectedPublicPath } from '../../scripts/build-public-release.mjs';

const read = async path => readFile(new URL(`../../${path}`, import.meta.url));
const json = async path => JSON.parse(await read(path));
const digest = async path => createHash('sha256').update(await read(path)).digest('hex');
const stem = `${POSITION_ID}-activate-king`;
const packetPath = `endgame-pools/private/multi-move-review-packets/${stem}.json`;
const graphPath = `endgame-pools/private/multi-move-review-graphs/${stem}.graph.json`;
const tablebasePath = `endgame-pools/private/multi-move-review-evidence/${stem}-tablebase.json`;
const enginePath = `endgame-pools/private/multi-move-review-evidence/${stem}-engine.json`;
const adjudicationPath = 'endgame-pools/private/human-adjudications/season-10.11b-activate-king-requires-new-position.json';
const packet = await json(packetPath);
const graph = await json(graphPath);

test('replacement discovery has three legal exact candidates and one unapproved recommendation', () => {
  assert.equal(CANDIDATES.length, 3);
  assert.equal(CANDIDATES.filter(candidate => candidate.recommendation === 'recommended-unapproved').length, 1);
  for (const candidate of CANDIDATES) {
    const rules = ChessRulesFacade.fromFen(candidate.fen);
    assert.equal(rules.sideToMove(), candidate.learnerSide);
    assert.equal(rules.pieces().length, candidate.pieceCount);
    assert.ok(candidate.pieceCount >= 3 && candidate.pieceCount <= 7);
  }
  assert.equal(packet.positionId, POSITION_ID);
  assert.equal(packet.initialFen, INITIAL_FEN);
  assert.deepEqual(packet.designatedTargets, TARGETS);
  assert.ok(packet.candidateComparison.every(candidate =>
    candidate.theoreticalResult === 'win' && candidate.immediateSuccessMoveCount === 0));
});

test('recommended objective cannot succeed immediately and proposed lines are genuinely multi-move', () => {
  const initial = ChessRulesFacade.fromFen(INITIAL_FEN);
  for (const move of initial.legalMoves()) {
    const rules = ChessRulesFacade.fromFen(INITIAL_FEN);
    const uci = typeof move === 'string' ? move : move.uci;
    rules.move(uci);
    const pieces = rules.pieces();
    const completed = pieces.some(piece => piece.type === 'k' && piece.color === 'white' && piece.square === 'c4')
      && pieces.some(piece => piece.type === 'p' && piece.color === 'white' && piece.square === 'd3');
    assert.equal(completed, false, uci);
  }
  assert.equal(graph.lines.length, 3);
  for (const line of graph.lines) {
    assert.ok(line.plies.length >= 4 && line.plies.length <= MAXIMUM_EXPLORED_PLY);
    assert.equal(line.terminal, 'candidate-success-terminal-unapproved');
  }
  assert.deepEqual(
    graph.lines.find(line => line.policyId === 'authored-deterministic-tree').plies.map(ply => ply.proposedMove.san),
    ['Kb2', 'Kg6', 'Kb3', 'Kf5', 'Kc4']
  );
});

test('premature pawn advance truthfully changes the exact win to a draw', () => {
  const initial = graph.states.find(state => state.positionFen === INITIAL_FEN);
  const push = initial.moves.find(move => move.uci === 'd3d4');
  assert.equal(initial.category, 'win');
  assert.equal(push.san, 'd4');
  assert.equal(push.resultingCategory, 'draw');
  for (const uci of initial.wdlPreservingMoves) assert.notEqual(uci, 'd3d4');
  for (const candidate of packet.candidateComparison) {
    assert.ok(candidate.legalInitialMoves.length >= 5);
    assert.ok(candidate.wdlPreservingMoves.length >= 3);
    assert.ok(candidate.evidenceDigest);
  }
});

test('expanded graph evidence is complete, bounded, digest-bound, and locally replayable', () => {
  const { graphDigest, ...base } = graph;
  assert.equal(graphDigest, sha256(base));
  assert.equal(graph.maximumExploredPly, 12);
  for (const state of graph.states) {
    for (const field of ['positionContentDigest', 'requestDigest', 'responseDigest', 'evidenceDigest'])
      assert.ok(state[field], `${state.positionFen}:${field}`);
    for (const move of state.moves) {
      const rules = ChessRulesFacade.fromFen(state.positionFen);
      const applied = rules.move(move.uci);
      assert.equal(applied.san, move.san);
      assert.equal(rules.fen(), move.resultingFen);
    }
  }
});

test('packet has exact unapproved semantics, hints, feedback, null fields, and allowlist', () => {
  const { packetDigest, ...base } = packet;
  assert.equal(packetDigest, sha256(base));
  assert.deepEqual(packet.allowedHumanDecisions, [...ALLOWED_DECISIONS]);
  assert.equal(Object.keys(packet.reviewTemplate).length, 26);
  assert.ok(Object.values(packet.reviewTemplate).every(value => value === null));
  assert.deepEqual(packet.successConditionCandidates.map(item => item.id), [
    'approved-king-activation-board-event', 'exact-theoretical-result-terminal', 'human-authored-terminal'
  ]);
  assert.deepEqual(packet.failureConditionCandidates.map(item => item.classification), [
    'objective-failure', 'chess-result-failure', 'objective-miss-result-preserved',
    'authored-concept-miss', 'technical-unavailable'
  ]);
  assert.equal(packet.hintCandidates.length, 3);
  assert.deepEqual(packet.hintCandidates.map(hint => hint.independentSuccessEligibilityAfterUse), [true, true, false]);
  assert.deepEqual(Object.keys(packet.feedbackCandidates), [
    'correctProgress', 'acceptedAlternative', 'authoredConceptMiss',
    'objectiveMissResultPreserved', 'chessResultFailure', 'objectiveFailure',
    'opponentReply', 'success', 'technicalUnavailable', 'retry', 'summary'
  ]);
  for (const collection of [
    packet.opponentPolicyCandidates, packet.successConditionCandidates,
    packet.failureConditionCandidates, packet.hintCandidates, Object.values(packet.feedbackCandidates)
  ]) assert.ok(collection.every(item => item.status === 'unapproved-human-review-required'));
});

test('historical rejection is separately immutable and original rejected packet is untouched', async () => {
  const decision = await json(adjudicationPath);
  const { adjudicationDigest, ...base } = decision;
  assert.equal(adjudicationDigest, sha256(base));
  assert.equal(decision.reviewDecision, 'requires-new-position');
  assert.equal(decision.reviewerReference, 'reviewer:alexander:season-10.11b-activate-king');
  assert.equal(decision.reviewRevision, 1);
  assert.equal(decision.originalPacketMutated, false);
  assert.equal(decision.rejectedBinding.packetDigest, 'sha256-0c2535abc7b9c1fff10faf980473a4377fa6eb33e02c6f815177f604f6e9930f');
  const rejected = await json('endgame-pools/private/multi-move-review-packets/king-activation-support-region-activate-king.json');
  assert.equal(rejected.packetDigest, decision.rejectedBinding.packetDigest);
});

test('new packet, graph, evidence, decision, architecture, script, and test remain private', () => {
  for (const path of [
    packetPath, graphPath, tablebasePath, enginePath, adjudicationPath,
    'docs/architecture/SEASON_10_11B_3R_ACTIVATE_KING_REPLACEMENT_REVIEW_PACKET.md',
    'scripts/generate-season-10-11b-3r-activate-king-replacement.mjs',
    'tests/endgame-pools/season-10-11b-3r-activate-king-replacement.test.js'
  ]) assert.equal(isProtectedPublicPath(path), true, path);
});

test('approved artifacts, adjudicated packets, runtime, visuals, pools, manifest, and Knowledge are byte-identical', async () => {
  const expected = {
    'public/data/endgame-pilots/kp-coordinate-support-promote/1.0.0.json': '4b3a0ef4560a1c0a46f0b6bdfc615ef8860cec2c8b0bf8de8261b2c67a6847e3',
    'public/data/endgame-pilots/rule-square-a-pawn-catch-stop-promotion/1.0.0.json': 'c8551583e41fce5ff7256fe09048c57a9ece382afec06c0c58d92fcd6e5bd33d',
    'public/data/endgame-runs/endgame-run-technical-two-item/1.0.0.json': '814668ca1df164e5c775529a8bcff3153e50c5495dc785b82ea9c3ab0473ad7c',
    'public/data/endgame-pools/caissa-king-pawn-decisions/1.0.0.json': '7324ffada9e27a07a64a7e30960e1f69dadd110844f3ad97e4967364a2c91d23',
    'public/data/endgame-pools/caissa-king-pawn-decisions/1.1.0.json': 'b1c5b7aa638944793e4bca4900e4c88fdd8affb7943fc58d77934c7c68e8b514',
    'public/data/endgame-pools/manifest-1.0.0.json': '9af9d3c21760db2dc202fa6565e392a4208de44b9f867682f3755ba7505f2b03',
    'js/endgame-trainer/v2/endgame-run.js': '7537d771bfb1c78267ef02d026ca407672505d31b434ad8cb643a0ef6ac460e3',
    'endgame-trainer.html': '34d510728cb5ee21cb7ee6617c1950b5f1ae69953a2c529a9e44e9fb3b6a8cb3',
    'css/endgame-trainer.css': '88a8ff330231a42d5dce727fe1a3ecd325f8e0496c7f5c28bb7b8463f34efdb9',
    'knowledge/releases/rel-58b238dfdda8f295fdab023cead6bf069aceefbee74a64a5cd71af2202480a84/release.json': '73a6138c39df72eb1a898e819b155f74c809e8b12d7cf3ee32f39914220b41da'
  };
  for (const [path, expectedDigest] of Object.entries(expected))
    assert.equal(await digest(path), expectedDigest, path);

  const identities = await Promise.all([
    json('public/data/endgame-pilots/kp-coordinate-support-promote/1.0.0.json'),
    json('public/data/endgame-pilots/rule-square-a-pawn-catch-stop-promotion/1.0.0.json'),
    json('public/data/endgame-runs/endgame-run-technical-two-item/1.0.0.json'),
    json('public/data/endgame-pools/caissa-king-pawn-decisions/1.0.0.json'),
    json('public/data/endgame-pools/caissa-king-pawn-decisions/1.1.0.json')
  ]);
  assert.deepEqual(identities.map(item => item.contentFingerprint), [
    'epilot-fnv1a32-f5f5df1f', 'epilot-fnv1a32-52fddf30',
    'erun-fnv1a32-1a41792e', 'epool-fnv1a32-7f150692', 'epool-fnv1a32-920ee3e2'
  ]);
});
