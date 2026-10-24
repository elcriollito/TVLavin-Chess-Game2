import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { basename, join, resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

import {
  FIELD_HARD_CORPUS,
  FIELD_HARD_OUTPUT_FILE,
  FIELD_HARD_STARTER_FILE,
  mergeAnnotationManifest,
  serializeManifest
} from '../scanner-localization-annotator/annotator-core.js';

const HASH = /^[A-F0-9]{64}$/;

export function duplicateGroupFor(sampleId) {
  if (['field-hard-v0.1-007', 'field-hard-v0.1-008', 'field-hard-v0.1-009'].includes(sampleId)) {
    return 'held-lichess-white-session-001';
  }
  if (['field-hard-v0.1-011', 'field-hard-v0.1-012'].includes(sampleId)) {
    return 'held-lichess-black-session-002';
  }
  return null;
}

export function buildStarterSample({ source, audited, filename, width, height }) {
  if (!source?.sampleId || !HASH.test(source.imageSha256 || '') || !(width > 0) || !(height > 0)) {
    throw new Error('annotation-starter-sample-invalid');
  }
  if (!audited || audited.sampleId !== source.sampleId || audited.imageSha256 !== source.imageSha256) {
    throw new Error(`${source.sampleId}:audit-identity-mismatch`);
  }
  const held = audited.governanceStatus === 'review-required';
  return {
    sampleId: source.sampleId,
    originalFile: `originals/${filename}`,
    originalSha256: source.imageSha256,
    sourceHash: source.imageSha256,
    sourceWidth: width,
    sourceHeight: height,
    sourceDimensions: { width, height },
    provenance: 'consented-private-beta-field-localization-failure',
    permissionUseCategory: 'private-development-localization-evaluation-only',
    boardPresent: true,
    governanceStatus: audited.governanceStatus,
    duplicateGroup: duplicateGroupFor(source.sampleId),
    developmentRole: held ? 'held-duplicate-review' : audited.split,
    split: held ? null : audited.split,
    humanVerified: false,
    corners: null,
    annotationStatus: 'pending-human-corners',
    notes: 'Mark only the playable 8x8 field in TL, TR, BR, BL order. Model corners are intentionally omitted.'
  };
}

async function prepare({ privateRoot, auditPath }) {
  const sourceManifestPath = join(privateRoot, 'private-source-manifest.json');
  const privateSource = JSON.parse(await readFile(sourceManifestPath, 'utf8'));
  const audit = JSON.parse(await readFile(auditPath, 'utf8'));
  if (privateSource.corpusVersion !== FIELD_HARD_CORPUS || audit.corpusVersion !== FIELD_HARD_CORPUS) {
    throw new Error('field-hard-corpus-version-mismatch');
  }
  if (privateSource.records.length !== 12 || audit.samples.length !== 12) {
    throw new Error('expected-exactly-12-governed-images');
  }
  const auditedById = new Map(audit.samples.map((sample) => [sample.sampleId, sample]));
  const seenHashes = new Set();
  const samples = [];
  for (const source of privateSource.records) {
    const filename = basename(source.privatePath);
    const imagePath = join(privateRoot, 'originals', filename);
    const bytes = await readFile(imagePath);
    const actualHash = createHash('sha256').update(bytes).digest('hex').toUpperCase();
    if (actualHash !== source.imageSha256) throw new Error(`${source.sampleId}:source-hash-mismatch`);
    if (seenHashes.has(actualHash)) throw new Error(`${source.sampleId}:duplicate-source-hash`);
    seenHashes.add(actualHash);
    const metadata = await sharp(bytes, { failOn: 'error' }).metadata();
    samples.push(buildStarterSample({
      source,
      audited: auditedById.get(source.sampleId),
      filename,
      width: metadata.width,
      height: metadata.height
    }));
  }
  const starter = {
    schemaVersion: 'caissa-scanner-localization-field-hard-annotation-starter/1',
    corpus: FIELD_HARD_CORPUS,
    corpusVersion: FIELD_HARD_CORPUS,
    status: 'annotation-pending',
    sourceImagesPrivate: true,
    sourceImagesCommitted: false,
    cornerOrder: 'tl-tr-br-bl',
    truthAuthority: 'Alexander-human-verification-only',
    modelCornersIncluded: false,
    samples
  };
  const starterBytes = serializeManifest(starter);
  const starterHash = createHash('sha256').update(starterBytes).digest('hex').toUpperCase();
  const initialAnnotations = mergeAnnotationManifest(starter, new Map(), starterHash);
  await writeFile(join(privateRoot, FIELD_HARD_STARTER_FILE), starterBytes, { flag: 'wx' });
  await writeFile(join(privateRoot, FIELD_HARD_OUTPUT_FILE), serializeManifest(initialAnnotations), { flag: 'wx' });
  return {
    starter: join(privateRoot, FIELD_HARD_STARTER_FILE),
    truth: join(privateRoot, FIELD_HARD_OUTPUT_FILE),
    starterSha256: starterHash,
    progress: initialAnnotations.progress,
    heldDuplicateGroupImages: samples.filter((sample) => sample.developmentRole === 'held-duplicate-review').length
  };
}

const args = Object.fromEntries(process.argv.slice(2).map((item) => {
  const [key, ...rest] = item.replace(/^--/, '').split('=');
  return [key, rest.join('=')];
}));
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!args['private-root'] || !args.audit) {
    throw new Error('Usage: node prepare-annotation-batch.mjs --private-root=<external cohort> --audit=<audit-report.json>');
  }
  console.log(JSON.stringify(await prepare({
    privateRoot: resolve(args['private-root']),
    auditPath: resolve(args.audit)
  })));
}
