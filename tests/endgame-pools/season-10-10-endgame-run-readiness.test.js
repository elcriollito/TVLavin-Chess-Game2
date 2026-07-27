import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ALLOWED_DECISIONS, HUMAN_FIELDS, buildReadinessPacket, renderMarkdown } from '../../scripts/generate-season-10-10-endgame-run-readiness.mjs';
import { sha256 } from '../../scripts/endgame-remote-tablebase.mjs';
import { isProtectedPublicPath } from '../../scripts/build-public-release.mjs';

const read = async path => readFile(new URL(`../../${path}`, import.meta.url));
const json = async path => JSON.parse(await read(path));
const digest = async path => createHash('sha256').update(await read(path)).digest('hex');
const packetPath = 'endgame-pools/private/endgame-run-readiness/endgame-run-public-readiness-1.0.0.json';
const markdownPath = 'endgame-pools/private/endgame-run-readiness/endgame-run-public-readiness-1.0.0.md';
const packet = await json(packetPath);

test('readiness packet generation is deterministic, versioned, and digest-bound', async () => {
  const generated = buildReadinessPacket();
  assert.deepEqual(generated, packet);
  const { packetDigest, ...base } = packet;
  assert.equal(packetDigest, sha256(base));
  assert.equal(packet.packetSchemaVersion, '1.0.0');
  assert.equal(packet.packetId, 'endgame-run-public-readiness-1.0.0');
  assert.equal(packet.baselineCommit, 'bffc171f4fdb83e6f0218f9664b6d1e87e93d123');
  assert.equal(renderMarkdown(packet), new TextDecoder().decode(await read(markdownPath)));
});

test('all 25 readiness domains and the weighted scorecard are complete', () => {
  assert.equal(packet.readinessDomains.length, 25);
  for (const item of packet.readinessDomains) {
    for (const key of ['name','status','evidence','gap','severity','classification','recommendedAction','ownerCategory','approvalRequired'])
      assert.ok(item[key], `${item.name}:${key}`);
  }
  assert.equal(packet.scorecard.domains.reduce((sum,item) => sum + item.maximum, 0), 100);
  assert.equal(packet.scorecard.score, packet.scorecard.domains.reduce((sum,item) => sum + item.score, 0));
  assert.equal(packet.scorecard.mandatoryBlockerOverride, true);
  assert.equal(packet.scorecard.numericalScoreIsApproval, false);
});

test('mandatory blockers defer release regardless of numerical score', () => {
  assert.ok(packet.blockingIssues.length >= 10);
  assert.equal(packet.recommendedDecision.primary, 'defer-public-release');
  assert.deepEqual(packet.recommendedDecision.findings, [
    'requires-more-content','requires-accessibility-review','requires-privacy-observability-work'
  ]);
  assert.equal(packet.recommendedDecision.publicBeta, 'not-approved');
  assert.equal(packet.currentState.publicApproved, false);
});

test('human review is empty and allowed decisions are exact', () => {
  assert.deepEqual(packet.allowedHumanDecisions, [...ALLOWED_DECISIONS]);
  assert.deepEqual(Object.keys(packet.humanReviewTemplate), [...HUMAN_FIELDS]);
  for (const field of HUMAN_FIELDS) assert.equal(packet.humanReviewTemplate[field], null, field);
  assert.ok(packet.accessibilityReviewPlan.areas.every(item => item.status === 'not-reviewed' && item.reviewer === null));
});

test('current run identity, fixed item order, and technical limits are exact', () => {
  assert.equal(packet.runArtifactId, 'endgame-run-technical-two-item');
  assert.equal(packet.runArtifactVersion, '1.0.0');
  assert.deepEqual(packet.currentState.orderedItemIds, [
    'kp-coordinate-support-promote@1.0.0','rule-square-a-pawn-catch-stop-promotion@1.0.0'
  ]);
  assert.equal(packet.currentState.itemCount, 2);
  assert.equal(packet.currentState.runtimeModifiedByPacket, false);
});

test('packet, handoff, architecture, tests, and audits stay protected', () => {
  for (const path of [
    packetPath, markdownPath,
    'docs/architecture/SEASON_10_10_ENDGAME_RUN_PUBLIC_READINESS_DECISION_PACKET.md',
    'tests/endgame-pools/season-10-10-endgame-run-readiness.test.js',
    'scripts/generate-season-10-10-endgame-run-readiness.mjs'
  ]) assert.equal(isProtectedPublicPath(path), true, path);
});

test('Season 10.9 artifacts stay immutable while the Season 10.15 public shell baseline is pinned', async () => {
  const expected = {
    'js/endgame-trainer/v2/endgame-run.js': '7537d771bfb1c78267ef02d026ca407672505d31b434ad8cb643a0ef6ac460e3',
    'js/endgame-trainer/v2/endgame-run-page.js': '217f8184743dbdd6a3ff7a8ef56a2d66cf336c03081d9665d367868e63576bd1',
    'js/endgame-trainer/v2/endgame-trainer-v2-page.js': '56f5f200ed826ba5b9f0ec7cf0cd3a397d227fac3e18914666b46d5f2d0bd8ad',
    'js/endgame-trainer/v2/multi-move-pilot.js': '609a76496b6c52e7c12b23e376750da1f7ed36a285697c3885fbba41a483aa9e',
    'public/data/endgame-runs/endgame-run-technical-two-item/1.0.0.json': '814668ca1df164e5c775529a8bcff3153e50c5495dc785b82ea9c3ab0473ad7c',
    'public/data/endgame-pilots/kp-coordinate-support-promote/1.0.0.json': '4b3a0ef4560a1c0a46f0b6bdfc615ef8860cec2c8b0bf8de8261b2c67a6847e3',
    'public/data/endgame-pilots/rule-square-a-pawn-catch-stop-promotion/1.0.0.json': 'c8551583e41fce5ff7256fe09048c57a9ece382afec06c0c58d92fcd6e5bd33d',
    'endgame-trainer.html': 'd0eb90937635a47ef52f83c255df0d162767361e00ccb2652306de654ae5e9b8',
    'css/endgame-trainer.css': '41e821210cd6ee17ea4b8df66b785a2700bea45f5a0f665c8fc3af0dbf56012d',
    'public/data/endgame-pools/caissa-king-pawn-decisions/1.0.0.json': '7324ffada9e27a07a64a7e30960e1f69dadd110844f3ad97e4967364a2c91d23',
    'public/data/endgame-pools/caissa-king-pawn-decisions/1.1.0.json': 'b1c5b7aa638944793e4bca4900e4c88fdd8affb7943fc58d77934c7c68e8b514',
    'public/data/endgame-pools/manifest-1.0.0.json': '9af9d3c21760db2dc202fa6565e392a4208de44b9f867682f3755ba7505f2b03',
    'knowledge/releases/rel-58b238dfdda8f295fdab023cead6bf069aceefbee74a64a5cd71af2202480a84/release.json': '73a6138c39df72eb1a898e819b155f74c809e8b12d7cf3ee32f39914220b41da'
  };
  for (const [path, value] of Object.entries(expected)) assert.equal(await digest(path), value, path);
});
