import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createPieceRecord } from '../tools/scanner-piece-label-annotator/piece-label-core.js';
import { createPieceStore, readPieceManifestDetailed, recordRevision } from '../tools/scanner-piece-label-annotator/store.js';
import { verifySourceImage } from '../tools/scanner-piece-label-annotator/catalog.js';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const labelsWith = (index, piece) => {
  const labels = Array(64).fill('empty');
  labels[index] = piece;
  return labels;
};

async function fixture() {
  const folder = await mkdtemp(join(tmpdir(), 'caissa-piece-hotfix-'));
  const sourcePath = join(folder, 'board.png');
  const sourceBytes = Buffer.from('immutable-2d-board-fixture');
  await writeFile(sourcePath, sourceBytes);
  const sample = { sampleId: 'fixture-board', sourceFilename: 'board.png', sourcePath,
    sourceSha256: sha(sourceBytes), cornerManifestSha256: 'C'.repeat(64), difficultyTags: [] };
  const catalog = { samples: [sample], v01CornerManifestSha256: 'C'.repeat(64),
    v03CornerManifestSha256: 'D'.repeat(64), duplicateAliases: [], outOfScope: [] };
  const outputPath = join(folder, 'truth', 'piece-labels-v0.1.json');
  const store = createPieceStore({ outputPath, catalog });
  const draft = (labels = labelsWith(0, 'p'), orientation = 'white-at-bottom') =>
    createPieceRecord(sample, { labels, boardOrientation: orientation, status: 'draft' });
  const verified = (labels = labelsWith(0, 'p')) => createPieceRecord(sample, {
    labels, boardOrientation: 'white-at-bottom', status: 'verified',
    humanVerifiedBy: 'Alexander', confirmation: 'I reviewed all 64 squares'
  });
  const cleanup = async () => { assert.ok(resolve(folder).startsWith(resolve(tmpdir()))); await rm(folder, { recursive: true, force: true }); };
  return { folder, sample, catalog, outputPath, store, draft, verified, sourcePath, sourceBytes, cleanup };
}

test('autosave writes remain atomic, fsynced, and bounded to three rotating checkpoints', async () => {
  const x = await fixture();
  try {
    let revision = null;
    for (let index = 0; index < 22; index++) {
      const record = x.draft(labelsWith(index % 64, 'p'));
      const saved = await x.store.saveRecord(record, revision);
      revision = recordRevision(saved.record);
    }
    const main = JSON.parse(await readFile(x.outputPath, 'utf8'));
    assert.equal(main.samples.length, 1);
    assert.equal(main.samples[0].labels[21], 'p');
    const files = await readdir(join(x.folder, 'truth', 'checkpoints'));
    assert.deepEqual(files.sort(), ['manifest-19.json', 'manifest-20.json', 'manifest-21.json']);
    assert.equal(await verifySourceImage(x.sample, { fresh: true }), x.sample.sourceSha256);
    assert.deepEqual(await readFile(x.sourcePath), x.sourceBytes);
  } finally { await x.cleanup(); }
});

test('truncated canonical manifest recovers newest valid checkpoint without resetting truth', async () => {
  const x = await fixture();
  try {
    const first = x.draft(labelsWith(0, 'P'));
    await x.store.saveRecord(first, null);
    const second = x.draft(labelsWith(8, 'N'), 'black-at-bottom');
    await x.store.saveRecord(second, recordRevision(first));
    await writeFile(x.outputPath, '{"truncated":');
    const recovered = await readPieceManifestDetailed(x.outputPath, x.catalog);
    assert.equal(recovered.recovery.status, 'recovered-from-backup');
    assert.equal(recovered.value.samples[0].labels[8], 'N');
    assert.equal(recovered.value.samples[0].boardOrientation, 'black-at-bottom');
    assert.equal((await readFile(x.outputPath, 'utf8')), '{"truncated":');
    await x.store.saveRecord(x.draft(labelsWith(9, 'B')), recordRevision(second));
    assert.equal((await x.store.read()).samples[0].labels[9], 'B');
  } finally { await x.cleanup(); }
});

test('verified truth resists empty drafts, while an explicit working edit survives restart and reconfirmation', async () => {
  const x = await fixture();
  try {
    const original = x.verified(labelsWith(60, 'K'));
    await x.store.saveRecord(original, null);
    const originalBytes = await readFile(x.outputPath);
    await assert.rejects(() => x.store.saveRecord(x.draft(Array(64).fill('empty')), recordRevision(original)),
      /verified-record-protected/);
    assert.deepEqual(await readFile(x.outputPath), originalBytes);
    const edit = x.draft(labelsWith(61, 'Q'));
    await x.store.saveVerifiedDraft(edit, recordRevision(original));
    const restarted = createPieceStore({ outputPath: x.outputPath, catalog: x.catalog });
    const state = await restarted.readState();
    assert.equal(state.manifest.samples[0].annotation.status, 'verified');
    assert.equal(state.manifest.samples[0].labels[60], 'K');
    assert.equal(state.workspace.verifiedDrafts[0].record.labels[61], 'Q');
    const confirmation = x.verified(labelsWith(61, 'Q'));
    await restarted.saveRecord(confirmation, recordRevision(original));
    const after = await restarted.readState();
    assert.equal(after.manifest.samples[0].labels[61], 'Q');
    assert.equal(after.workspace.verifiedDrafts.length, 0);
    assert.equal(after.manifest.samples[0].annotation.status, 'verified');
  } finally { await x.cleanup(); }
});

test('workspace cursor survives restart and rejects stale revision from another tab', async () => {
  const x = await fixture();
  try {
    const first = x.draft();
    await x.store.saveRecord(first, null);
    await x.store.savePosition(x.sample.sampleId, true);
    const restarted = createPieceStore({ outputPath: x.outputPath, catalog: x.catalog });
    const state = await restarted.readState();
    assert.equal(state.workspace.lastActiveSampleId, x.sample.sampleId);
    assert.equal(state.workspace.incompleteOnly, true);
    const second = x.draft(labelsWith(1, 'q'));
    await restarted.saveRecord(second, recordRevision(first));
    await assert.rejects(() => x.store.saveRecord(x.draft(labelsWith(2, 'r')), recordRevision(first)),
      /record-changed-reload-required/);
    assert.equal((await restarted.read()).samples[0].labels[1], 'q');
  } finally { await x.cleanup(); }
});

test('damaged workspace without a checkpoint reports metadata loss but preserves canonical draft', async () => {
  const x = await fixture();
  try {
    const draft = x.draft(labelsWith(12, 'N'));
    await x.store.saveRecord(draft, null);
    await writeFile(x.store.workspacePath, '{"truncated":');
    const restarted = createPieceStore({ outputPath: x.outputPath, catalog: x.catalog });
    const state = await restarted.readState();
    assert.equal(state.recovery[0].status, 'workspace-corrupt-no-checkpoint');
    assert.equal(state.manifest.samples[0].labels[12], 'N');
    assert.equal(state.manifest.samples[0].annotation.status, 'draft');
  } finally { await x.cleanup(); }
});

test('source metadata change invalidates cached SHA and blocks further autosave', async () => {
  const x = await fixture();
  try {
    await verifySourceImage(x.sample);
    await x.store.saveRecord(x.draft(), null);
    const before = await readFile(x.outputPath);
    await writeFile(x.sourcePath, Buffer.from('changed-source-image'));
    await assert.rejects(() => x.store.saveRecord(x.draft(labelsWith(1, 'p'))), /source-checksum-mismatch/);
    assert.deepEqual(await readFile(x.outputPath), before);
  } finally { await x.cleanup(); }
});
