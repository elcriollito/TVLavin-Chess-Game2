import { createHash } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, stat, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { emptyManifest, serializeManifest, validateManifest, validatePieceRecord } from './piece-label-core.js';
import { verifySourceImage } from './catalog.js';

const WORKSPACE_SCHEMA = 'caissa-scanner-piece-workspace/1';
const CHECKPOINT_COUNT = 3;
const HASH = /^[A-F0-9]{64}$/;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex').toUpperCase();
export const recordRevision = (record) => record ? sha(JSON.stringify(record)) : null;

function workspacePathFor(outputPath) {
  const name = basename(outputPath);
  return join(dirname(outputPath), `${name.replace(/\.json$/i, '')}.workspace.json`);
}

function defaultWorkspace(catalog, manifest) {
  return {
    schemaVersion: WORKSPACE_SCHEMA,
    corpusIdentity: emptyManifest(catalog).corpusIdentity,
    lastActiveSampleId: manifest.samples.at(-1)?.sampleId || catalog.samples[0]?.sampleId || null,
    incompleteOnly: false,
    verifiedDrafts: []
  };
}

function validateWorkspace(workspace, catalog) {
  if (workspace?.schemaVersion !== WORKSPACE_SCHEMA
      || workspace.corpusIdentity?.v01CornerManifestSha256 !== catalog.v01CornerManifestSha256
      || workspace.corpusIdentity?.v03CornerManifestSha256 !== catalog.v03CornerManifestSha256
      || typeof workspace.incompleteOnly !== 'boolean'
      || !Array.isArray(workspace.verifiedDrafts)
      || (workspace.lastActiveSampleId !== null
        && !catalog.samples.some((sample) => sample.sampleId === workspace.lastActiveSampleId))) {
    throw new Error('workspace-schema-or-corpus-invalid');
  }
  const seen = new Set();
  for (const entry of workspace.verifiedDrafts) {
    const sample = catalog.samples.find((item) => item.sampleId === entry?.record?.sampleId);
    if (!sample || seen.has(sample.sampleId) || !HASH.test(entry.baseVerifiedSha256 || '')) {
      throw new Error('workspace-verified-draft-invalid');
    }
    seen.add(sample.sampleId);
    validatePieceRecord(entry.record, sample);
    if (entry.record.annotation.status !== 'draft') throw new Error('workspace-draft-must-be-unverified');
  }
  return workspace;
}

async function atomicWrite(target, bytes) {
  const folder = dirname(target);
  await mkdir(folder, { recursive: true });
  const temporary = join(folder, `.${basename(target)}.writing`);
  const handle = await open(temporary, 'w');
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
  await rename(temporary, target);
  // Directory sync is not supported consistently on Windows; file sync and same-folder rename are required.
  try {
    const directory = await open(folder, 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  } catch (error) {
    if (!['EINVAL', 'EPERM', 'EISDIR', 'EBADF'].includes(error.code)) throw error;
  }
}

async function checkpointedWrite(target, bytes, kind) {
  const folder = join(dirname(target), 'checkpoints');
  await mkdir(folder, { recursive: true });
  const pattern = new RegExp(`^${kind}-(\\d+)\\.json$`);
  const sequences = (await readdir(folder)).map((name) => Number(pattern.exec(name)?.[1]))
    .filter((value) => Number.isSafeInteger(value) && value >= 0).sort((a, b) => b - a);
  const next = (sequences[0] ?? -1) + 1;
  if (!Number.isSafeInteger(next)) throw new Error('checkpoint-sequence-exhausted');
  await atomicWrite(join(folder, `${kind}-${next}.json`), bytes);
  for (const sequence of sequences.slice(CHECKPOINT_COUNT - 1)) {
    await unlink(join(folder, `${kind}-${sequence}.json`));
  }
  await atomicWrite(target, bytes);
}

async function candidatesFor(target, kind, includeLegacyHistory) {
  const result = [];
  const folders = [{ path: join(dirname(target), 'checkpoints'), prefix: `${kind}-`, rank: 1 }];
  if (includeLegacyHistory) folders.push({ path: join(dirname(target), 'history'), prefix: `${basename(target)}.`, rank: 0 });
  for (const folder of folders) {
    let names;
    try { names = await readdir(folder.path); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    for (const name of names) {
      if (!name.startsWith(folder.prefix) || !name.endsWith('.json')) continue;
      const sequence = folder.rank ? Number(new RegExp(`^${kind}-(\\d+)\\.json$`).exec(name)?.[1]) : null;
      if (folder.rank && !Number.isSafeInteger(sequence)) continue;
      const path = join(folder.path, name);
      result.push({ path, rank: folder.rank, sequence, mtimeMs: (await stat(path)).mtimeMs });
    }
  }
  return result.sort((a, b) => b.rank - a.rank || (a.rank ? b.sequence - a.sequence : b.mtimeMs - a.mtimeMs)
    || a.path.localeCompare(b.path));
}

async function readValidated(target, validate, fallback, kind, includeLegacyHistory = false) {
  let mainError;
  try { return { value: validate(JSON.parse(await readFile(target, 'utf8'))), recovery: null }; }
  catch (error) { mainError = error; }
  const candidates = await candidatesFor(target, kind, includeLegacyHistory);
  for (const candidate of candidates) {
    try {
      return { value: validate(JSON.parse(await readFile(candidate.path, 'utf8'))),
        recovery: { status: 'recovered-from-backup', path: candidate.path,
          reason: mainError.code === 'ENOENT' ? 'main-missing' : 'main-invalid' } };
    } catch { /* Reject a corrupt or stale checkpoint and try the next one. */ }
  }
  if (mainError.code === 'ENOENT') return { value: fallback(), recovery: null };
  if (kind === 'workspace') return { value: fallback(),
    recovery: { status: 'workspace-corrupt-no-checkpoint', path: target, reason: String(mainError.message) } };
  throw new Error(`manifest-corrupt-no-valid-checkpoint: ${mainError.message}`);
}

export async function readPieceManifestDetailed(outputPath, catalog) {
  return readValidated(outputPath, (value) => validateManifest(value, catalog),
    () => emptyManifest(catalog), 'manifest', true);
}

export async function readPieceManifest(outputPath, catalog) {
  return (await readPieceManifestDetailed(outputPath, catalog)).value;
}

async function readWorkspaceDetailed(path, catalog, manifest) {
  const result = await readValidated(path, (value) => validateWorkspace(value, catalog),
    () => defaultWorkspace(catalog, manifest), 'workspace');
  const verifiedById = new Map(manifest.samples.filter((record) => record.annotation.status === 'verified')
    .map((record) => [record.sampleId, record]));
  const validDrafts = result.value.verifiedDrafts.filter((entry) =>
    recordRevision(verifiedById.get(entry.record.sampleId)) === entry.baseVerifiedSha256);
  return { value: { ...result.value, verifiedDrafts: validDrafts }, recovery: result.recovery,
    ignoredStaleDrafts: result.value.verifiedDrafts.length - validDrafts.length };
}

export function createPieceStore({ outputPath, catalog }) {
  const destination = resolve(outputPath);
  const workspacePath = workspacePathFor(destination);
  if (catalog.samples.some((sample) => resolve(sample.sourcePath) === destination)) {
    throw new Error('output-overlaps-source-image');
  }
  for (const corpusRoot of catalog.protectedCorpusRoots || []) {
    const inside = relative(resolve(corpusRoot), destination);
    if (inside === '' || (inside !== '..' && !inside.startsWith(`..${sep}`) && !isAbsolute(inside))) {
      throw new Error('output-inside-immutable-corpus');
    }
  }
  let queue = Promise.resolve();
  const enqueue = (operation) => {
    const work = queue.then(operation);
    queue = work.catch(() => {});
    return work;
  };
  const readState = async () => {
    const main = await readPieceManifestDetailed(destination, catalog);
    const workspace = await readWorkspaceDetailed(workspacePath, catalog, main.value);
    return { manifest: main.value, workspace: workspace.value,
      recovery: [main.recovery, workspace.recovery].filter(Boolean),
      ignoredStaleDrafts: workspace.ignoredStaleDrafts };
  };
  const read = async () => (await readState()).manifest;
  const savePosition = (sampleId, incompleteOnly) => enqueue(async () => {
    if (!catalog.samples.some((item) => item.sampleId === sampleId) || typeof incompleteOnly !== 'boolean') {
      throw new Error('invalid-workspace-position');
    }
    const current = await readState();
    const workspace = { ...current.workspace, lastActiveSampleId: sampleId, incompleteOnly };
    await checkpointedWrite(workspacePath, `${JSON.stringify(workspace, null, 2)}\n`, 'workspace');
    return workspace;
  });
  const saveVerifiedDraft = (record, expectedRevision) => enqueue(async () => {
    const sample = catalog.samples.find((item) => item.sampleId === record?.sampleId);
    if (!sample || record.annotation.status !== 'draft') throw new Error('invalid-verified-draft');
    validatePieceRecord(record, sample);
    await verifySourceImage(sample);
    const current = await readState();
    const verified = current.manifest.samples.find((item) => item.sampleId === sample.sampleId);
    if (verified?.annotation.status !== 'verified' || recordRevision(verified) !== expectedRevision) {
      throw new Error('verified-record-changed-reload-required');
    }
    const workspace = { ...current.workspace, lastActiveSampleId: sample.sampleId,
      verifiedDrafts: [...current.workspace.verifiedDrafts.filter((item) => item.record.sampleId !== sample.sampleId),
        { baseVerifiedSha256: expectedRevision, record }] };
    await checkpointedWrite(workspacePath, `${JSON.stringify(workspace, null, 2)}\n`, 'workspace');
    return { manifest: current.manifest, workspace, workingDraft: record };
  });
  const saveRecord = (record, expectedRevision) => enqueue(async () => {
    const sample = catalog.samples.find((item) => item.sampleId === record?.sampleId);
    if (!sample) throw new Error('unknown-piece-sample');
    validatePieceRecord(record, sample);
    await verifySourceImage(sample, { fresh: record.annotation.status === 'verified' });
    const current = await readState();
    const oldRecord = current.manifest.samples.find((item) => item.sampleId === sample.sampleId);
    if (expectedRevision !== undefined && recordRevision(oldRecord) !== expectedRevision) {
      throw new Error('record-changed-reload-required');
    }
    if (oldRecord?.annotation.status === 'verified' && record.annotation.status !== 'verified') {
      throw new Error('verified-record-protected');
    }
    const next = { ...current.manifest,
      samples: [...current.manifest.samples.filter((item) => item.sampleId !== sample.sampleId), record] };
    await checkpointedWrite(destination, serializeManifest(next, catalog), 'manifest');
    if (record.annotation.status === 'verified') {
      const workspace = { ...current.workspace,
        verifiedDrafts: current.workspace.verifiedDrafts.filter((item) => item.record.sampleId !== sample.sampleId) };
      if (workspace.verifiedDrafts.length !== current.workspace.verifiedDrafts.length) {
        await checkpointedWrite(workspacePath, `${JSON.stringify(workspace, null, 2)}\n`, 'workspace');
      }
    }
    return { manifest: next, record };
  });
  const save = async (record) => (await saveRecord(record)).manifest;
  return { outputPath: destination, workspacePath, read, readState, save, saveRecord, saveVerifiedDraft, savePosition };
}
