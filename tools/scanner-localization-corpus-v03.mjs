import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

export const CORPUS_ID = 'scanner-localization-hard-v0.3';
export const STARTER_FILE = 'manifest-starter-v0.3.json';
export const FOLDERS = Object.freeze(['originals', 'references', 'hard-negatives']);
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PREVIOUS_MANIFEST = join(ROOT, 'scanner/recognition/benchmark/manifests/scanner-localization-hard-v0.1.json');
const DEFAULT_STAGING = 'C:/Users/ALEXANDER/Alexander Projects/caissa_scanner_real_localization_corpus_v0_3_staging';
const DEFAULT_CERTIFIED = 'C:/Users/ALEXANDER/Alexander Projects/caissa_scanner_real_localization_corpus_v0_3';
const NEGATIVE_CATEGORIES = Object.freeze([
  'math-notebook', 'checkers-board', 'grid-paper', 'grid-paper',
  'grid-paper', 'math-notebook', 'checker-pattern', 'math-notebook',
  'math-notebook', 'generic-rectangular-layout', 'generic-rectangular-layout',
  'checkers-board', 'checker-pattern'
]);

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

export async function inventoryFolder(root, folder) {
  const entries = await readdir(join(root, folder), { withFileTypes: true });
  if (entries.some((entry) => !entry.isFile())) throw new Error(`${folder}: non-file entry present`);
  const seenNames = new Set();
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const filename = entry.name;
    const lowerName = filename.toLowerCase();
    if (seenNames.has(lowerName)) throw new Error(`${folder}: duplicate filename ${filename}`);
    seenNames.add(lowerName);
    const extension = filename.match(/\.(jpe?g|png)$/i)?.[1]?.toLowerCase();
    if (!extension) throw new Error(`${folder}: unsupported image extension ${filename}`);
    const path = join(root, folder, filename);
    const bytes = await readFile(path);
    if (!bytes.length) throw new Error(`${folder}: zero-byte image ${filename}`);
    let metadata;
    try {
      metadata = await sharp(bytes, { failOn: 'error' }).metadata();
      await sharp(bytes, { failOn: 'error' }).raw().toBuffer();
    } catch (error) {
      throw new Error(`${folder}: unreadable image ${filename}: ${error.message}`);
    }
    if (!Number.isSafeInteger(metadata.width) || !Number.isSafeInteger(metadata.height)
        || metadata.width <= 0 || metadata.height <= 0) throw new Error(`${folder}: invalid dimensions ${filename}`);
    files.push({ folder, filename, sha256: sha256(bytes), width: metadata.width,
      height: metadata.height, bytes: bytes.length, detectedFormat: metadata.format,
      extensionFormatMismatch: (extension === 'png' ? 'png' : 'jpeg') !== metadata.format });
  }
  return files;
}

export function duplicateGroups(files) {
  const hashes = new Map();
  for (const file of files) {
    const group = hashes.get(file.sha256) || [];
    group.push(`${file.folder}/${file.filename}`);
    hashes.set(file.sha256, group);
  }
  return [...hashes].filter(([, names]) => names.length > 1)
    .map(([hash, filenames]) => ({ sha256: hash, filenames }));
}

export async function inventoryStaging(root) {
  const folders = {};
  for (const folder of FOLDERS) folders[folder] = await inventoryFolder(root, folder);
  const allFiles = FOLDERS.flatMap((folder) => folders[folder]);
  return { folders, duplicateGroups: duplicateGroups(allFiles) };
}

function requireSequence(files, folder, pattern, count) {
  if (files.length !== count) throw new Error(`${folder}: expected ${count}, found ${files.length}`);
  const map = new Map();
  for (const file of files) {
    const match = pattern.exec(file.filename);
    if (!match) throw new Error(`${folder}: cannot pair ${file.filename}`);
    const number = Number(match[1]);
    if (map.has(number)) throw new Error(`${folder}: ambiguous number ${number}`);
    map.set(number, file);
  }
  for (let number = 1; number <= count; number += 1) {
    if (!map.has(number)) throw new Error(`${folder}: unpaired number ${number}`);
  }
  return map;
}

export async function buildStarterManifest(inventory) {
  const originals = requireSequence(inventory.folders.originals, 'originals', /^sample_(\d{3})_original\.jpg$/i, 33);
  const references = requireSequence(inventory.folders.references, 'references', /^sample_(\d{3})_chessvision\.png$/i, 33);
  const negatives = requireSequence(inventory.folders['hard-negatives'], 'hard-negatives', /^hard-negatives(\d{3})\.jpe?g$/i, 13);
  const prior = JSON.parse(await readFile(PREVIOUS_MANIFEST, 'utf8'));
  const priorByHash = new Map(prior.samples.map((sample) => [sample.sha256, sample.sampleId]));
  const samples = [];
  for (let number = 1; number <= 33; number += 1) {
    const original = originals.get(number);
    const reference = references.get(number);
    const priorSampleId = priorByHash.get(original.sha256) || null;
    samples.push({
      sampleId: `real-v03-positive-${String(number).padStart(3, '0')}`,
      filename: original.filename,
      originalFile: `originals/${original.filename}`,
      originalSha256: original.sha256,
      sourceWidth: original.width,
      sourceHeight: original.height,
      sourceBytes: original.bytes,
      detectedFormat: original.detectedFormat,
      extensionFormatMismatch: original.extensionFormatMismatch,
      boardPresent: true,
      annotationStatus: 'pending',
      provenance: 'user-provided-internal-evaluation',
      humanVerifiedBy: 'Alexander',
      difficultyTags: [],
      split: null,
      referenceSystem: 'Chessvision',
      referenceOutcome: 'unknown',
      referenceScreenshot: `references/${reference.filename}`,
      referenceSha256: reference.sha256,
      referenceWidth: reference.width,
      referenceHeight: reference.height,
      referenceBytes: reference.bytes,
      referenceDetectedFormat: reference.detectedFormat,
      referenceExtensionFormatMismatch: reference.extensionFormatMismatch,
      pieceSetFamily: null,
      pieceSetStyle: 'unknown',
      boardThemeFamily: null,
      classifierFailureTypes: [],
      leakageGroup: priorSampleId ? 'v0.1-exact-byte-overlap' : null,
      priorCorpusSampleId: priorSampleId
    });
  }
  for (let number = 1; number <= 13; number += 1) {
    const source = negatives.get(number);
    const category = NEGATIVE_CATEGORIES[number - 1];
    samples.push({
      sampleId: `real-v03-negative-${String(number).padStart(3, '0')}`,
      filename: source.filename,
      originalFile: `hard-negatives/${source.filename}`,
      originalSha256: source.sha256,
      sourceWidth: source.width,
      sourceHeight: source.height,
      sourceBytes: source.bytes,
      detectedFormat: source.detectedFormat,
      extensionFormatMismatch: source.extensionFormatMismatch,
      boardPresent: false,
      annotationStatus: 'verified-negative',
      provenance: 'user-provided-internal-evaluation',
      humanVerifiedBy: 'Alexander',
      difficultyTags: [category, 'grid-like-distractor'],
      negativeCategory: category,
      split: null,
      referenceSystem: null,
      referenceOutcome: null,
      referenceScreenshot: null,
      leakageGroup: null
    });
  }
  return {
    schemaVersion: 'caissa-scanner-localization-starter/3',
    corpus: CORPUS_ID,
    corpusVersion: CORPUS_ID,
    status: 'annotation-pending',
    creationPolicy: 'byte-preserving-copy-from-user-staging; stable-number-pairing; no-split; no-inferred-reference-outcome',
    counts: { samples: 46, positives: 33, negatives: 13, references: 33 },
    exactDuplicateGroups: inventory.duplicateGroups,
    samples
  };
}

export function validateStarterManifest(manifest, inventory) {
  const errors = [];
  if (manifest.schemaVersion !== 'caissa-scanner-localization-starter/3' || manifest.corpus !== CORPUS_ID) errors.push('schema-or-corpus');
  if (manifest.samples?.length !== 46 || manifest.counts?.positives !== 33
      || manifest.counts?.negatives !== 13 || manifest.counts?.references !== 33) errors.push('counts');
  const seenIds = new Set();
  const sourcePaths = new Set();
  const referencePaths = new Set();
  let positiveCount = 0;
  let negativeCount = 0;
  const indexed = new Map(FOLDERS.flatMap((folder) => inventory.folders[folder])
    .map((file) => [`${file.folder}/${file.filename}`, file]));
  for (const sample of manifest.samples || []) {
    if (seenIds.has(sample.sampleId)) errors.push(`${sample.sampleId}:duplicate-id`);
    seenIds.add(sample.sampleId);
    const source = indexed.get(sample.originalFile);
    if (!source || source.folder === 'references') errors.push(`${sample.sampleId}:source-role`);
    else if (sample.filename !== source.filename || sample.originalSha256 !== source.sha256
        || sample.sourceWidth !== source.width || sample.sourceHeight !== source.height
        || sample.sourceBytes !== source.bytes || sample.detectedFormat !== source.detectedFormat
        || sample.extensionFormatMismatch !== source.extensionFormatMismatch) errors.push(`${sample.sampleId}:source-integrity`);
    if (sourcePaths.has(sample.originalFile)) errors.push(`${sample.sampleId}:source-reused`);
    sourcePaths.add(sample.originalFile);
    if (sample.split !== null || !Array.isArray(sample.difficultyTags)
        || sample.provenance !== 'user-provided-internal-evaluation') errors.push(`${sample.sampleId}:metadata`);
    if (sample.boardPresent === true) {
      positiveCount += 1;
      const number = sample.sampleId.match(/^real-v03-positive-(\d{3})$/)?.[1];
      if (!number || sample.originalFile !== `originals/sample_${number}_original.jpg`
          || sample.referenceScreenshot !== `references/sample_${number}_chessvision.png`) {
        errors.push(`${sample.sampleId}:pairing-invalid`);
      }
      if (sample.annotationStatus !== 'pending' || sample.groundTruth?.playableBoardCorners
          || !sample.originalFile.startsWith('originals/') || !sample.referenceScreenshot?.startsWith('references/')
          || sample.referenceSystem !== 'Chessvision' || sample.referenceOutcome !== 'unknown') errors.push(`${sample.sampleId}:positive-state`);
      const reference = indexed.get(sample.referenceScreenshot);
      if (!reference || reference.folder !== 'references' || sample.referenceSha256 !== reference.sha256
          || sample.referenceWidth !== reference.width || sample.referenceHeight !== reference.height
          || sample.referenceBytes !== reference.bytes || sample.referenceDetectedFormat !== reference.detectedFormat
          || sample.referenceExtensionFormatMismatch !== reference.extensionFormatMismatch) errors.push(`${sample.sampleId}:reference-integrity`);
      if (referencePaths.has(sample.referenceScreenshot)) errors.push(`${sample.sampleId}:reference-reused`);
      referencePaths.add(sample.referenceScreenshot);
    } else if (sample.boardPresent === false) {
      negativeCount += 1;
      const number = sample.sampleId.match(/^real-v03-negative-(\d{3})$/)?.[1];
      if (!number || !sample.originalFile.match(new RegExp(`^hard-negatives/hard-negatives${number}\\.jpe?g$`, 'i'))) {
        errors.push(`${sample.sampleId}:negative-mapping-invalid`);
      }
      if (sample.annotationStatus !== 'verified-negative' || sample.groundTruth?.playableBoardCorners
          || !sample.originalFile.startsWith('hard-negatives/') || sample.referenceScreenshot !== null
          || !sample.negativeCategory || !sample.difficultyTags.includes(sample.negativeCategory)) errors.push(`${sample.sampleId}:negative-state`);
    } else errors.push(`${sample.sampleId}:board-present-invalid`);
  }
  if (sourcePaths.size !== 46 || referencePaths.size !== 33 || positiveCount !== 33 || negativeCount !== 13
      || indexed.size !== 79) errors.push('mapping-coverage');
  if (JSON.stringify(manifest.exactDuplicateGroups) !== JSON.stringify(inventory.duplicateGroups)) errors.push('duplicate-audit');
  if (errors.length) throw new Error(errors.join(', '));
  return { sampleCount: sourcePaths.size, referenceCount: referencePaths.size };
}

export function serializeStarter(manifest) { return `${JSON.stringify(manifest, null, 2)}\n`; }

export async function certify({ staging = DEFAULT_STAGING, certified = DEFAULT_CERTIFIED, create = false } = {}) {
  staging = resolve(staging);
  certified = resolve(certified);
  if (staging === certified) throw new Error('staging-and-certified-paths-must-differ');
  const inventory = await inventoryStaging(staging);
  const manifest = await buildStarterManifest(inventory);
  validateStarterManifest(manifest, inventory);
  const manifestText = serializeStarter(manifest);
  const manifestSha256 = sha256(Buffer.from(manifestText));
  if (create) {
    try { await stat(certified); throw new Error(`certified target already exists: ${certified}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await mkdir(certified);
    for (const folder of FOLDERS) {
      await mkdir(join(certified, folder));
      for (const file of inventory.folders[folder]) {
        await copyFile(join(staging, folder, file.filename), join(certified, folder, file.filename), constants.COPYFILE_EXCL);
      }
    }
    await writeFile(join(certified, STARTER_FILE), manifestText, { flag: 'wx' });
    await writeFile(join(certified, 'README.md'), `# CAISSA Scanner real localization corpus v0.3\n\nLocal, private evaluation evidence. Do not redistribute. Source: ${staging}\n\n33 original board images, 33 Chessvision comparison screenshots, and 13 verified non-chess distractors. Only originals/ are positive localization inputs. Hard-negatives/ are board-absent inputs. References/ are comparison evidence, never localization input or ground truth.\n\nStarter manifest: ${STARTER_FILE}\nSHA-256: ${manifestSha256}\n\nPositive corners remain pending; split is unassigned. Open this folder with the dev-only annotator and mark TL, TR, BR, BL of each playable 8x8 field. Do not edit the starter manifest or source images.\n`, { flag: 'wx' });
    const copied = await inventoryStaging(certified);
    validateStarterManifest(manifest, copied);
    const copiedManifest = await readFile(join(certified, STARTER_FILE));
    if (sha256(copiedManifest) !== manifestSha256) throw new Error('copied-manifest-checksum-mismatch');
  } else {
    const existingManifest = await readFile(join(certified, STARTER_FILE));
    if (sha256(existingManifest) !== manifestSha256) throw new Error('certified-manifest-checksum-mismatch');
    const copied = await inventoryStaging(certified);
    validateStarterManifest(manifest, copied);
    for (const folder of FOLDERS) {
      if (inventory.folders[folder].length !== copied.folders[folder].length) throw new Error(`${folder}: staging/certified count differs`);
      for (let i = 0; i < inventory.folders[folder].length; i += 1) {
        if (inventory.folders[folder][i].filename !== copied.folders[folder][i].filename
            || inventory.folders[folder][i].sha256 !== copied.folders[folder][i].sha256) throw new Error(`${folder}: staging/certified bytes differ`);
      }
    }
  }
  return { staging, certified, manifestSha256, counts: manifest.counts,
    exactDuplicateGroups: inventory.duplicateGroups,
    extensionFormatMismatches: FOLDERS.flatMap((folder) => inventory.folders[folder])
      .filter((file) => file.extensionFormatMismatch).map((file) => `${file.folder}/${file.filename}:${file.detectedFormat}`),
    priorOverlap: manifest.samples.filter((sample) => sample.priorCorpusSampleId).map((sample) => ({ sampleId: sample.sampleId, priorCorpusSampleId: sample.priorCorpusSampleId })) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const create = process.argv.includes('--create');
  const stagingArg = process.argv.find((arg) => arg.startsWith('--staging='));
  const certifiedArg = process.argv.find((arg) => arg.startsWith('--certified='));
  certify({ create, staging: stagingArg?.slice(10), certified: certifiedArg?.slice(12) })
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
}
