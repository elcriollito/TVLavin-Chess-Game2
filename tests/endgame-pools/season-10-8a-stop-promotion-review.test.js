import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ChessRulesFacade } from '../../js/endgame-trainer/chess-rules-facade.js';
import { sha256, validateRemoteEligibility } from '../../scripts/endgame-remote-tablebase.mjs';
import { isProtectedPublicPath } from '../../scripts/build-public-release.mjs';

const packetPath = new URL('../../endgame-pools/private/multi-move-review-packets/rule-square-a-pawn-catch-stop-promotion.json', import.meta.url);
const graphPath = new URL('../../endgame-pools/private/multi-move-tablebase/rule-square-a-pawn-catch-stop-promotion-state-graph.json', import.meta.url);
const enginePath = new URL('../../endgame-pools/private/evidence/rule-square-a-pawn-catch-stop-promotion.stockfish-18.json', import.meta.url);
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const fileDigest = async path => createHash('sha256').update(await readFile(new URL(`../../${path}`, import.meta.url))).digest('hex');

test('recommended stop-promotion candidate is legal, explicit, and completely tablebase-covered', async () => {
  const packet = await read(packetPath);
  assert.equal(packet.positionId, 'rule-square-a-pawn-catch-stop-promotion');
  assert.equal(packet.initialFen, 'k7/8/8/8/p7/8/8/3K4 w - - 0 1');
  assert.equal(ChessRulesFacade.fromFen(packet.initialFen).sideToMove(), 'white');
  assert.deepEqual(packet.designatedOpponentPawn, { color: 'black', origin: 'a4', promotionSquare: 'a1' });
  assert.equal(ChessRulesFacade.fromFen(packet.initialFen).pieces().length, 3);
  assert.deepEqual(validateRemoteEligibility(packet.initialFen), {
    status: 'eligible', canonicalFen: packet.initialFen, pieceCount: 3
  });
  assert.equal(packet.tablebaseEvidence.localTablebaseVerified, false);
  assert.equal(packet.tablebaseEvidence.provider.completePieceCoverage, 7);
});

test('candidate comparison exposes three materially distinct and unapproved choices', async () => {
  const packet = await read(packetPath);
  assert.equal(packet.candidateComparison.length, 3);
  assert.deepEqual(packet.candidateComparison.map(item => item.family), [
    'king-catches-pawn', 'opposition-blockade', 'rook-pawn-exception'
  ]);
  assert.equal(packet.recommendedCandidateId, packet.positionId);
  assert.equal(packet.recommendationStatus, 'unapproved-human-review-required');
  assert.ok(packet.candidateComparison.every(item => item.pieceCount <= 7));
});

test('every state and move is locally legal and bound to exact normalized evidence', async () => {
  const graph = await read(graphPath);
  assert.equal(graph.states.length, 14);
  for (const state of graph.states) {
    assert.ok(ChessRulesFacade.fromFen(state.positionFen).pieces().length <= 3);
    assert.equal(state.localTablebaseVerified, false);
    for (const move of state.moves) {
      const rules = ChessRulesFacade.fromFen(state.positionFen);
      assert.equal(rules.move(move.uci).san, move.san);
      assert.equal(rules.fen(), move.resultingFen);
    }
  }
});

test('bounded graph is deterministic and separates capture success from promotion failure', async () => {
  const graph = await read(graphPath);
  assert.equal(graph.maximumExploredPly, 14);
  assert.equal(graph.lines.length, 9);
  assert.ok(graph.lines.every(line => line.plies.length <= graph.maximumExploredPly));
  assert.deepEqual(new Set(graph.lines.map(line => line.firstMove)), new Set(['d1c1', 'd1c2', 'd1d2']));
  assert.equal(graph.lines.filter(line => line.terminal === 'designated-pawn-captured').length, 6);
  assert.equal(graph.lines.filter(line => line.terminal === 'opposing-pawn-promoted').length, 3);
  const { graphDigest, ...base } = graph;
  assert.equal(graphDigest, sha256(base));
});

test('policy, success, failure, promotion, hint, and feedback proposals remain unapproved', async () => {
  const packet = await read(packetPath);
  assert.deepEqual(packet.opponentPolicyCandidates.map(item => item.policyId), [
    'wdl-dtz-uci', 'maximum-resistance', 'authored-deterministic-tree'
  ]);
  assert.equal(packet.successConditionCandidates.length, 3);
  assert.ok(packet.opponentPolicyCandidates.every(item => item.status === 'unapproved-human-review-required'));
  assert.ok(packet.successConditionCandidates.every(item => item.status === 'unapproved-human-review-required'));
  assert.ok(packet.failureConditionCandidates.every(item => item.status === 'unapproved-human-review-required'));
  assert.ok(packet.hintCandidates.every(item => item.status === 'unapproved-human-review-required'));
  assert.ok(Object.values(packet.feedbackCandidates).every(item => item.status === 'unapproved-human-review-required'));
  assert.deepEqual(['queen', 'rook', 'bishop', 'knight'].filter(key => packet.promotionSemantics[key]), ['queen', 'rook', 'bishop', 'knight']);
  assert.equal(packet.promotionSemantics.status, 'unapproved-human-review-required');
});

test('Stockfish remains secondary and highlights the objective/WDL distinction', async () => {
  const packet = await read(packetPath);
  const evidence = await read(enginePath);
  assert.equal(evidence.engineIdentity.engineName, 'Stockfish 18');
  assert.equal(evidence.analysisPolicy.depth, 18);
  assert.equal(evidence.analysisPolicy.multiPv, 3);
  assert.equal(evidence.bestMove, 'd1d2');
  assert.equal(evidence.authority, 'secondary-to-tablebase');
  assert.equal(evidence.approvalStatus, 'unapproved-human-review-required');
  const { evidenceDigest, ...base } = evidence;
  assert.equal(evidenceDigest, sha256(base));
  assert.equal(packet.stockfishEvidence.evidenceDigest, evidenceDigest);
});

test('packet digest is stable and every required human field is null', async () => {
  const packet = await read(packetPath);
  const { packetDigest, ...base } = packet;
  assert.equal(packetDigest, sha256(base));
  assert.equal(Object.keys(packet.reviewTemplate).length, 24);
  assert.ok(Object.values(packet.reviewTemplate).every(value => value === null));
  assert.equal(packet.allowedHumanDecisions.length, 9);
});

test('all Season 10.8A artifacts remain protected from public release', () => {
  for (const path of [
    'endgame-pools/private/multi-move-review-packets/rule-square-a-pawn-catch-stop-promotion.json',
    'endgame-pools/private/multi-move-review-packets/rule-square-a-pawn-catch-stop-promotion.md',
    'endgame-pools/private/multi-move-tablebase/rule-square-a-pawn-catch-stop-promotion-state-graph.json',
    'endgame-pools/private/evidence/rule-square-a-pawn-catch-stop-promotion.stockfish-18.json',
    'scripts/generate-season-10-8a-stop-promotion-review.mjs',
    'tests/endgame-pools/season-10-8a-stop-promotion-review.test.js',
    'docs/architecture/SEASON_10_8A_SECOND_MULTI_MOVE_OBJECTIVE_REVIEW_PACKET.md'
  ]) assert.equal(isProtectedPublicPath(path), true, path);
});

test('promote artifact and pools remain immutable while the Season 10.15 public shell baseline is pinned', async () => {
  const expected = {
    'public/data/endgame-pilots/kp-coordinate-support-promote/1.0.0.json': '4b3a0ef4560a1c0a46f0b6bdfc615ef8860cec2c8b0bf8de8261b2c67a6847e3',
    'js/endgame-trainer/v2/multi-move-pilot.js': '609a76496b6c52e7c12b23e376750da1f7ed36a285697c3885fbba41a483aa9e',
    'js/endgame-trainer/v2/multi-move-pilot-page.js': '2ed6f8f739de685b81f86256a37abcbaa001472583362e3e0d799f2684e399ac',
    'endgame-trainer.html': '1fbf3a48ed850ae43f5afc1b55ec5d716f40000c2f7ce69a9b36290f3093f747',
    'css/endgame-trainer.css': 'a0fccabde8b43e15b718515452db546dff70a43d37e6b4bccb6f1ae3abfb9f5e',
    'public/data/endgame-pools/caissa-king-pawn-decisions/1.0.0.json': '7324ffada9e27a07a64a7e30960e1f69dadd110844f3ad97e4967364a2c91d23',
    'public/data/endgame-pools/caissa-king-pawn-decisions/1.1.0.json': 'b1c5b7aa638944793e4bca4900e4c88fdd8affb7943fc58d77934c7c68e8b514',
    'public/data/endgame-pools/manifest-1.0.0.json': '9af9d3c21760db2dc202fa6565e392a4208de44b9f867682f3755ba7505f2b03'
  };
  for (const [path, digest] of Object.entries(expected)) assert.equal(await fileDigest(path), digest, path);
  const pilot = await read(new URL('../../public/data/endgame-pilots/kp-coordinate-support-promote/1.0.0.json', import.meta.url));
  assert.equal(pilot.contentFingerprint, 'epilot-fnv1a32-f5f5df1f');
  assert.equal(pilot.contentDigest, 'sha256-076a58b2983d66d7f8035ebfb2b52946cb88e92c444cb59bafc9c140455117c6');
});
