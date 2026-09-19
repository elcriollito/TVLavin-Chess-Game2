import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { extractCanonicalTiles } from '../tools/build-scanner-piece-dataset-v05.mjs';
import { certify } from '../tools/certify-scanner-real-development-v02.mjs';

const root = resolve(import.meta.dirname, '..');
const folder = join(root, 'scanner/recognition/datasets/real-development');
const classes = new Set(['empty', 'P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k']);
const stable = (value) => `${JSON.stringify(value, null, 2)}\n`;
const certification = certify();

test('41-board certification is deterministic and bound to immutable human truth', async () => {
  const first = await certification;
  const second = await certify();
  assert.deepEqual(first.report, second.report);
  assert.equal(stable(first.certified), await readFile(join(folder, 'real-development-v0.2-certified.json'), 'utf8'));
  assert.equal(stable(first.indexes), await readFile(join(folder, 'real-development-v0.2-indexes.json'), 'utf8'));
  assert.equal(stable(first.report), await readFile(join(folder, 'certification-v0.2.json'), 'utf8'));
  assert.match(first.report.annotationTruthSha256, /^[A-F0-9]{64}$/);
  assert.match(first.report.sourceManifestSha256, /^[A-F0-9]{64}$/);
});

test('every certified board has valid corners, explicit orientation and exactly 64 canonical labels', async () => {
  const { certified, report } = await certification;
  assert.equal(certified.samples.length, 41);
  assert.equal(report.humanVerified, 41);
  assert.equal(report.pending + report.malformedRecords + report.invalidPieceLabels, 0);
  for (const sample of certified.samples) {
    assert.equal(sample.humanVerified, true);
    assert.equal(sample.corners.length, 4);
    assert.ok(['white-at-bottom', 'black-at-bottom'].includes(sample.orientation));
    assert.equal(sample.labels.length, 64);
    assert.ok(sample.labels.every((label) => classes.has(label)));
    assert.match(sample.cornerRevision, /^[A-F0-9]{64}$/);
  }
});

test('protected leakage is zero and held near candidates are distinct but inseparable', async () => {
  const { certified, report } = await certification;
  assert.equal(report.protectedLeakageAdmitted, 0);
  const ids = ['dev-real-v0.1-021', 'dev-real-v0.1-023', 'dev-real-v0.1-024'];
  const samples = certified.samples.filter((item) => ids.includes(item.sampleId));
  assert.equal(samples.length, 3);
  assert.equal(new Set(samples.map((item) => item.placementFen)).size, 3);
  assert.equal(new Set(samples.map((item) => item.sourceSha256)).size, 3);
  assert.equal(new Set(samples.map((item) => item.sourceGroup)).size, 1);
  assert.equal(new Set(samples.map((item) => item.split)).size, 1);
  assert.ok(report.nearDuplicateDecisions.every((item) => item.decision === 'ADMIT DEVELOPMENT'
    && item.possibleNearProtected.length === 0));
});

test('source-aware split and square indexes contain only development truth', async () => {
  const { certified, indexes, report } = await certification;
  assert.deepEqual(report.splitCounts, { trainDevelopment: 28, validation: 13 });
  assert.equal(indexes.empty.length, 1818);
  assert.equal(indexes.occupied.length, 806);
  assert.equal(indexes.empty.length + indexes.occupied.length, 41 * 64);
  assert.ok([...indexes.empty, ...indexes.occupied].every((item) =>
    ['train-development', 'validation'].includes(item.split) && /^[A-F0-9]{64}$/.test(item.sourceHash)));
  const groupSplits = new Map();
  for (const sample of certified.samples.filter((item) => item.sourceGroup || item.sessionGroup)) {
    for (const group of new Set([sample.sourceGroup, sample.sessionGroup].filter(Boolean))) {
      const prior = groupSplits.get(group);
      assert.ok(!prior || prior === sample.split);
      groupSplits.set(group, sample.split);
    }
  }
  assert.equal(indexes.bNqHard.length, report.pieceClassSupport.B + report.pieceClassSupport.b
    + report.pieceClassSupport.N + report.pieceClassSupport.n
    + report.pieceClassSupport.Q + report.pieceClassSupport.q);
});

test('human metadata is preserved without fabricated capture or source categories', async () => {
  const { report } = await certification;
  assert.deepEqual(report.captureTypeCounts, { unknown: 41 });
  assert.deepEqual(report.sourceCategoryCounts, { unknown: 41 });
  assert.equal(report.subtypeTagCounts['photo-of-screen'], 38);
  assert.equal(report.subtypeTagCounts.livestream, 15);
  assert.equal(Object.values(report.platformCounts).reduce((sum, value) => sum + value, 0), 41);
});

test('v0.5 real tile extraction consumes rectifier ArrayBuffers without zero filling', () => {
  const rgba = new Uint8ClampedArray(512 * 512 * 4);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const offset = (y * 512 + x) * 4;
    rgba[offset] = x % 256; rgba[offset + 1] = y % 256; rgba[offset + 2] = (x + y) % 256; rgba[offset + 3] = 255;
  }
  const white = extractCanonicalTiles(rgba.buffer, 'white-at-bottom');
  const black = extractCanonicalTiles(rgba.buffer, 'black-at-bottom');
  assert.equal(white.length, 64);
  assert.ok(white.every((tile) => tile.some((value) => value !== 0)));
  assert.deepEqual(black[63], white[0]);
});
