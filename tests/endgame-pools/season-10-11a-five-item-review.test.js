import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ChessRulesFacade } from '../../js/endgame-trainer/chess-rules-facade.js';
import { ALLOWED_DECISIONS, FAMILIES } from '../../scripts/generate-season-10-11a-five-item-review.mjs';
import { sha256 } from '../../scripts/endgame-remote-tablebase.mjs';
import { isProtectedPublicPath } from '../../scripts/build-public-release.mjs';

const read = async path => readFile(new URL(`../../${path}`, import.meta.url));
const json = async path => JSON.parse(await read(path));
const digest = async path => createHash('sha256').update(await read(path)).digest('hex');
const stems = [
  'favorable-simplification-open-king-route-convert-material-advantage',
  'direct-opposition-hold-draw-hold-draw',
  'king-activation-support-region-activate-king'
];
const packetPaths = stems.map(stem => `endgame-pools/private/multi-move-review-packets/${stem}.json`);
const graphPaths = stems.map(stem => `endgame-pools/private/multi-move-tablebase/${stem}-state-graph.json`);
const packets = await Promise.all(packetPaths.map(json));

test('three objective families have three legal covered candidates and one recommendation each', () => {
  assert.deepEqual(FAMILIES.map(family => family.objectiveFamily), [
    'convert-material-advantage', 'hold-draw', 'activate-king'
  ]);
  for (const family of FAMILIES) {
    assert.equal(family.candidates.length, 3);
    assert.equal(family.candidates.filter(item => item.disposition === 'recommended-unapproved').length, 1);
    assert.equal(family.candidates.some(item => item.positionId === family.recommendedId), true);
    for (const candidate of family.candidates) {
      const rules = ChessRulesFacade.fromFen(candidate.fen);
      assert.equal(rules.sideToMove(), candidate.learnerSide);
      assert.equal(rules.pieces().length, candidate.pieceCount);
      assert.ok(candidate.pieceCount <= 7, candidate.positionId);
    }
    assert.ok(Object.keys(family.designatedTargets).length > 0);
  }
});

test('packets are digest-bound and leave all human decisions null', () => {
  for (const packet of packets) {
    const { packetDigest, ...base } = packet;
    assert.equal(packetDigest, sha256(base));
    assert.equal(packet.packetSchemaVersion, '1.0.0');
    assert.equal(packet.recommendationStatus, undefined);
    assert.equal(packet.existingHumanApproval.exactPositionApproved, false);
    assert.deepEqual(packet.allowedHumanDecisions, [...ALLOWED_DECISIONS]);
    assert.equal(Object.keys(packet.reviewTemplate).length, 26);
    for (const [field, value] of Object.entries(packet.reviewTemplate))
      assert.equal(value, null, `${packet.positionId}:${field}`);
    for (const collection of [
      packet.opponentPolicyCandidates, packet.successConditionCandidates,
      packet.failureConditionCandidates, packet.hintCandidates,
      Object.values(packet.feedbackCandidates)
    ]) assert.ok(collection.every(item => item.status === 'unapproved-human-review-required'));
  }
});

test('bounded graphs contain deterministic normalized evidence and locally legal moves', async () => {
  for (const path of graphPaths) {
    const graph = await json(path);
    const { graphDigest, ...base } = graph;
    assert.equal(graphDigest, sha256(base));
    assert.equal(graph.maximumExploredPly, 14);
    assert.equal(graph.lines.length, 3);
    assert.ok(graph.lines.every(line => line.plies.length <= 14));
    for (const state of graph.states) {
      assert.ok(state.evidenceDigest);
      for (const move of state.moves) {
        const rules = ChessRulesFacade.fromFen(state.positionFen);
        const applied = rules.move(move.uci);
        assert.equal(applied.san, move.san);
        assert.equal(rules.fen(), move.resultingFen);
      }
    }
  }
});

test('Stockfish is secondary, checksum-bound, stable evidence', async () => {
  for (const packet of packets) {
    const evidence = packet.stockfishEvidence;
    const { evidenceDigest, ...base } = evidence;
    assert.equal(evidenceDigest, sha256(base));
    assert.equal(evidence.engineIdentity.engineName, 'Stockfish 18');
    assert.equal(evidence.analysisPolicy.depth, 18);
    assert.equal(evidence.analysisPolicy.uciOptions.MultiPV, 3);
    assert.match(evidence.authority, /^secondary-only/);
    assert.equal(evidence.approvalStatus, 'unapproved-human-review-required');
  }
});

test('private five-item analysis has exact ordering, distinct FENs, and complete balance fields', async () => {
  const analysis = await json('endgame-pools/private/endgame-run-readiness/five-item-content-expansion-candidate-set-1.0.0.json');
  const { analysisDigest, ...base } = analysis;
  assert.equal(analysisDigest, sha256(base));
  assert.equal(analysis.proposedItems.length, 5);
  assert.deepEqual(analysis.proposedItems.slice(0, 2).map(item => item.id), [
    'kp-coordinate-support-promote', 'rule-square-a-pawn-catch-stop-promotion'
  ]);
  assert.deepEqual(analysis.proposedItems.slice(2).map(item => item.id), packets.map(packet => packet.positionId));
  assert.ok(analysis.objectiveCount >= 3);
  assert.equal(analysis.duplicateFenGeometry, false);
  for (const field of [
    'offensiveDefensiveBalance', 'conversionCoverage', 'foundationalTechniqueCoverage',
    'sideToMoveBalance', 'averagePieceCount', 'difficultyDistribution', 'terminalDiversity',
    'humanReviewWorkload', 'implementationWorkload', 'limitedPreviewReadinessIfApproved'
  ]) assert.ok(analysis[field], field);
});

test('existing item and run artifacts remain byte-identical', async () => {
  const expected = {
    'public/data/endgame-pilots/kp-coordinate-support-promote/1.0.0.json': '4b3a0ef4560a1c0a46f0b6bdfc615ef8860cec2c8b0bf8de8261b2c67a6847e3',
    'public/data/endgame-pilots/rule-square-a-pawn-catch-stop-promotion/1.0.0.json': 'c8551583e41fce5ff7256fe09048c57a9ece382afec06c0c58d92fcd6e5bd33d',
    'public/data/endgame-runs/endgame-run-technical-two-item/1.0.0.json': '814668ca1df164e5c775529a8bcff3153e50c5495dc785b82ea9c3ab0473ad7c'
  };
  for (const [path, value] of Object.entries(expected)) assert.equal(await digest(path), value, path);
  const artifacts = await Promise.all(Object.keys(expected).map(json));
  assert.deepEqual(artifacts.map(item => item.contentFingerprint), [
    'epilot-fnv1a32-f5f5df1f', 'epilot-fnv1a32-52fddf30', 'erun-fnv1a32-1a41792e'
  ]);
  assert.deepEqual(artifacts.map(item => item.contentDigest), [
    'sha256-076a58b2983d66d7f8035ebfb2b52946cb88e92c444cb59bafc9c140455117c6',
    'sha256-d0e482faf45c08a10db2d98f0328a2639292107c6ecf68ac56adf00505745f22',
    'sha256-2c9166f00b04c6c7fcf8540c9388bfe9d1b27d56f21d17b7beead5c549724229'
  ]);
});

test('all Season 10.11A material is protected from public builds', () => {
  for (const path of [
    ...packetPaths, ...graphPaths,
    ...stems.map(stem => `endgame-pools/private/evidence/${stem}.stockfish-18.json`),
    'endgame-pools/private/endgame-run-readiness/five-item-content-expansion-candidate-set-1.0.0.json',
    'docs/architecture/SEASON_10_11A_FIVE_ITEM_CONTENT_EXPANSION_REVIEW_PACKETS.md',
    'scripts/generate-season-10-11a-five-item-review.mjs',
    'tests/endgame-pools/season-10-11a-five-item-review.test.js'
  ]) assert.equal(isProtectedPublicPath(path), true, path);
});

test('runtime, visuals, navigation, pools, manifest, and Knowledge remain byte-identical', async () => {
  const expected = {
    'js/endgame-trainer/v2/endgame-run.js': '7537d771bfb1c78267ef02d026ca407672505d31b434ad8cb643a0ef6ac460e3',
    'js/endgame-trainer/v2/endgame-run-page.js': '217f8184743dbdd6a3ff7a8ef56a2d66cf336c03081d9665d367868e63576bd1',
    'js/endgame-trainer/v2/endgame-trainer-v2-page.js': '56f7896e7e35fcb4d526273c5320faf344c549f23e5a1bbbd4aadced0d60fd84',
    'endgame-trainer.html': '34d510728cb5ee21cb7ee6617c1950b5f1ae69953a2c529a9e44e9fb3b6a8cb3',
    'css/endgame-trainer.css': '88a8ff330231a42d5dce727fe1a3ecd325f8e0496c7f5c28bb7b8463f34efdb9',
    'js/caissa-primary-navigation.js': '886da3695f13be58f0b54c88f14bd50a217878291dddaca256b3eca233a94317',
    'public/data/endgame-pools/caissa-king-pawn-decisions/1.0.0.json': '7324ffada9e27a07a64a7e30960e1f69dadd110844f3ad97e4967364a2c91d23',
    'public/data/endgame-pools/caissa-king-pawn-decisions/1.1.0.json': 'b1c5b7aa638944793e4bca4900e4c88fdd8affb7943fc58d77934c7c68e8b514',
    'public/data/endgame-pools/manifest-1.0.0.json': '9af9d3c21760db2dc202fa6565e392a4208de44b9f867682f3755ba7505f2b03',
    'knowledge/releases/rel-58b238dfdda8f295fdab023cead6bf069aceefbee74a64a5cd71af2202480a84/release.json': '73a6138c39df72eb1a898e819b155f74c809e8b12d7cf3ee32f39914220b41da'
  };
  for (const [path, value] of Object.entries(expected)) assert.equal(await digest(path), value, path);
});
