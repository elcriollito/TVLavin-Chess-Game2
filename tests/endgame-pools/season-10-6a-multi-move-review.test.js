import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ChessRulesFacade } from '../../js/endgame-trainer/chess-rules-facade.js';
import { sha256 } from '../../scripts/endgame-remote-tablebase.mjs';

const packetPath = new URL('../../endgame-pools/private/multi-move-review-packets/kp-coordinate-support-promote.json', import.meta.url);
const graphPath = new URL('../../endgame-pools/private/multi-move-tablebase/kp-coordinate-support-promote-state-graph.json', import.meta.url);
const read = async path => JSON.parse(await readFile(path, 'utf8'));

test('private packet binds the exact candidate and both approved first moves', async () => {
  const packet = await read(packetPath);
  assert.equal(packet.initialFen, '8/2k5/8/4K3/4P3/8/8/8 w - - 0 1');
  assert.deepEqual(packet.existingHumanApproval.approvedFirstMoves, ['Ke6', 'Kf6']);
  assert.deepEqual(new Set(packet.candidateStateGraph.lines.map(line => line.firstMove)), new Set(['e5e6', 'e5f6']));
});

test('every graph move is locally legal and produces the bound FEN', async () => {
  const graph = await read(graphPath);
  for (const state of graph.states) for (const move of state.moves) {
    const rules = ChessRulesFacade.fromFen(state.positionFen);
    assert.equal(rules.move(move.uci).san, move.san);
    assert.equal(rules.fen(), move.resultingFen);
  }
});

test('graph and packet digests are stable', async () => {
  const packet = await read(packetPath);
  const graph = await read(graphPath);
  const { graphDigest, ...graphBase } = graph;
  const { packetDigest, ...packetBase } = packet;
  assert.equal(graphDigest, sha256(graphBase));
  assert.equal(packetDigest, sha256(packetBase));
});

test('all human fields are empty and all machine copy remains unapproved', async () => {
  const packet = await read(packetPath);
  assert.ok(Object.values(packet.reviewTemplate).every(value => value === null));
  assert.ok(packet.hintCandidates.every(item => item.status === 'unapproved-human-review-required'));
  assert.ok(Object.values(packet.feedbackCandidates).every(item => item.status === 'unapproved-human-review-required'));
  assert.ok(packet.opponentPolicyCandidates.every(item => item.status === 'unapproved-human-review-required'));
});

test('public immutable pool and manifest identities remain exact', async () => {
  const [one, next, manifest] = await Promise.all([
    read(new URL('../../public/data/endgame-pools/caissa-king-pawn-decisions/1.0.0.json', import.meta.url)),
    read(new URL('../../public/data/endgame-pools/caissa-king-pawn-decisions/1.1.0.json', import.meta.url)),
    read(new URL('../../public/data/endgame-pools/manifest-1.0.0.json', import.meta.url))
  ]);
  assert.equal(one.contentFingerprint, 'epool-fnv1a32-7f150692');
  assert.equal(next.contentFingerprint, 'epool-fnv1a32-920ee3e2');
  assert.equal(manifest.pools.length, 2);
});
