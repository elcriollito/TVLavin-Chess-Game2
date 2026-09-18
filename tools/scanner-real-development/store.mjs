import { mkdir, open, readFile, readdir, rename, stat, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { ANNOTATION_SCHEMA, SOURCE_ROOT, deriveIndexes, hash, validateAnnotation, validateManifest,
  validateSplitIsolation } from './core.mjs';

const inside = (parent, target) => {
  const rel = relative(resolve(parent), resolve(target));
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
};
const revision = (record) => record ? hash(Buffer.from(JSON.stringify(record))) : null;
const requireCondition = (condition, reason) => { if (!condition) throw new Error(reason); };

async function atomicWrite(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${basename(path)}.writing`);
  const file = await open(temporary, 'w');
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
  await rename(temporary, path);
  try {
    const directory = await open(dirname(path), 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  } catch (error) {
    if (!['EINVAL', 'EPERM', 'EISDIR', 'EBADF'].includes(error.code)) throw error;
  }
}

async function checkpointedWrite(path, text, kind) {
  const folder = join(dirname(path), 'checkpoints');
  await mkdir(folder, { recursive: true });
  const names = (await readdir(folder)).map((name) => Number(new RegExp(`^${kind}-(\\d+)\\.json$`).exec(name)?.[1]))
    .filter((number) => Number.isSafeInteger(number)).sort((a, b) => b - a);
  const next = (names[0] ?? -1) + 1;
  await atomicWrite(join(folder, `${kind}-${next}.json`), text);
  await atomicWrite(path, text);
  for (const old of names.slice(2)) await unlink(join(folder, `${kind}-${old}.json`));
}

async function recover(path, kind, validate, fallback) {
  try { return { value: validate(JSON.parse(await readFile(path, 'utf8'))), recovered: null }; }
  catch (error) {
    if (error.code === 'ENOENT') return { value: fallback(), recovered: null };
    const folder = join(dirname(path), 'checkpoints');
    let names = [];
    try { names = await readdir(folder); } catch (reason) { if (reason.code !== 'ENOENT') throw reason; }
    const ordered = names.map((name) => ({ name, number: Number(new RegExp(`^${kind}-(\\d+)\\.json$`).exec(name)?.[1]) }))
      .filter((item) => Number.isSafeInteger(item.number)).sort((a, b) => b.number - a.number);
    for (const item of ordered) {
      try {
        const value = validate(JSON.parse(await readFile(join(folder, item.name), 'utf8')));
        return { value, recovered: item.name };
      } catch { /* Continue to older valid checkpoint. */ }
    }
    throw new Error(`${kind}-corrupt-no-valid-checkpoint: ${error.message}`);
  }
}

export function createDevelopmentStore({ manifest, manifestSha256, protectedCatalog,
  sourceRoot = SOURCE_ROOT, outputPath, repoRoot }) {
  validateManifest(manifest, protectedCatalog);
  requireCondition(/^[A-F0-9]{64}$/.test(manifestSha256), 'manifest-sha-required');
  const target = resolve(outputPath);
  requireCondition(!inside(sourceRoot, target) && !inside(repoRoot, target), 'annotation-output-must-be-external');
  const workspacePath = join(dirname(target), 'real-development-v0.1.workspace.json');
  const sampleById = new Map(manifest.samples.map((item) => [item.sampleId, item]));
  const empty = () => ({ schemaVersion: ANNOTATION_SCHEMA, corpusVersion: manifest.corpusVersion,
    manifestSha256, sourceRole: 'development-only', finalBenchmarkUseAllowed: false, samples: [] });
  const validate = (value) => {
    requireCondition(value?.schemaVersion === ANNOTATION_SCHEMA && value.corpusVersion === manifest.corpusVersion
      && value.manifestSha256 === manifestSha256 && value.sourceRole === 'development-only'
      && value.finalBenchmarkUseAllowed === false && Array.isArray(value.samples), 'annotation-corpus-identity-mismatch');
    const ids = new Set();
    for (const record of value.samples) {
      const sample = sampleById.get(record.sampleId);
      requireCondition(sample && !ids.has(record.sampleId), 'annotation-id-invalid-or-duplicate');
      ids.add(record.sampleId);
      validateAnnotation(record, sample);
    }
    validateSplitIsolation(manifest, value);
    return value;
  };
  const defaultWorkspace = () => ({ schemaVersion: 'caissa-scanner-real-development-workspace/1',
    manifestSha256, lastActiveSampleId: manifest.samples.find((item) => item.governanceStatus !== 'excluded-exact-duplicate')?.sampleId || null,
    incompleteOnly: false });
  const validateWorkspace = (value) => {
    requireCondition(value?.schemaVersion === 'caissa-scanner-real-development-workspace/1'
      && value.manifestSha256 === manifestSha256 && typeof value.incompleteOnly === 'boolean'
      && (value.lastActiveSampleId === null || sampleById.has(value.lastActiveSampleId)),
    'workspace-corpus-identity-mismatch');
    return value;
  };
  let queue = Promise.resolve();
  const enqueue = (fn) => {
    const current = queue.then(fn);
    queue = current.catch(() => {});
    return current;
  };
  const readState = async () => {
    const annotations = await recover(target, 'annotations', validate, empty);
    const workspace = await recover(workspacePath, 'workspace', validateWorkspace, defaultWorkspace);
    return { annotations: annotations.value, workspace: workspace.value,
      recovery: [annotations.recovered, workspace.recovered].filter(Boolean) };
  };
  const saveRecord = (record, expectedRevision) => enqueue(async () => {
    const source = sampleById.get(record?.sampleId);
    requireCondition(source, 'unknown-development-sample');
    validateAnnotation(record, source);
    const path = join(sourceRoot, source.sourceFilename);
    requireCondition(basename(path) === source.sourceFilename, 'unsafe-source-filename');
    const before = await stat(path);
    requireCondition(hash(await readFile(path)) === source.sourceSha256, 'source-checksum-mismatch');
    const after = await stat(path);
    requireCondition(before.size === after.size && before.mtimeMs === after.mtimeMs, 'source-changed-during-save');
    const current = await readState();
    const prior = current.annotations.samples.find((item) => item.sampleId === record.sampleId);
    requireCondition(revision(prior) === expectedRevision, 'record-changed-reload-required');
    requireCondition(prior?.status !== 'human-verified' || record.status === 'human-verified',
      'human-verified-truth-protected');
    const next = { ...current.annotations, samples: [...current.annotations.samples.filter((item) =>
      item.sampleId !== record.sampleId), record].sort((a, b) => a.sampleId.localeCompare(b.sampleId)) };
    validate(next);
    await checkpointedWrite(target, `${JSON.stringify(next, null, 2)}\n`, 'annotations');
    return { record, revision: revision(record), annotations: next, indexes: deriveIndexes(manifest, next) };
  });
  const savePosition = (sampleId, incompleteOnly) => enqueue(async () => {
    requireCondition(sampleById.has(sampleId) && typeof incompleteOnly === 'boolean', 'invalid-workspace-position');
    const current = await readState();
    const next = { ...current.workspace, lastActiveSampleId: sampleId, incompleteOnly };
    await checkpointedWrite(workspacePath, `${JSON.stringify(next, null, 2)}\n`, 'workspace');
    return next;
  });
  return { outputPath: target, workspacePath, readState, saveRecord, savePosition, revision };
}
