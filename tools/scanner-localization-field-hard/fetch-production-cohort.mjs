import { createClient } from '@supabase/supabase-js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import sharp from 'sharp';
import { fingerprint, inventorySources, possibleNearDuplicate, protectedSources }
  from '../scanner-real-development/core.mjs';
import {
  buildInventory, CORPUS_VERSION, ownerScopeHash, publicManifest, pseudonym, sha256, stableSplit,
  validatePublicManifest
} from './cohort.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((item) => {
  const [key, ...rest] = item.replace(/^--/, '').split('=');
  return [key, rest.join('=')];
}));
const url = String(process.env.SUPABASE_URL || args.url || '').replace(/\/$/, '');
const key = process.env.SUPABASE_SECRET_KEY || '';
const cutoff = args.cutoff;
const scopeHash = String(args['scope-hash'] || '').toUpperCase();
const privateRoot = resolve(args['private-root'] || '');
const publicOutput = resolve(args['public-output'] || '');
if (!url || !key || !cutoff || !/^[A-F0-9]{12}$/.test(scopeHash) || !args['private-root'] || !args['public-output']) {
  throw new Error('Usage: SUPABASE_URL=... SUPABASE_SECRET_KEY=... node fetch-production-cohort.mjs '
    + '--cutoff=<ISO> --scope-hash=<12 hex> --private-root=<external-folder> --public-output=<repo-json>');
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  global: { headers: { 'User-Agent': 'caissa-scanner-localization-auditor/1.0' } }
});
async function table(name, columns) {
  const { data, error } = await supabase.from(name).select(columns).lte('submitted_at', cutoff).limit(1000);
  if (error) throw new Error(`${name}:${error.code || error.message}`);
  return data;
}

const [scans, feedback, failures] = await Promise.all([
  table('scanner_beta_scans', '*'),
  table('scanner_beta_feedback', '*'),
  table('scanner_beta_scan_failures', '*')
]);
const owners = [...new Set([...scans, ...feedback, ...failures].map((row) => row.user_id)
  .filter((owner) => owner && ownerScopeHash(owner) === scopeHash))];
if (owners.length !== 1) throw new Error(`account-scope-match-count-${owners.length}`);
const ownerId = owners[0];
const inventory = buildInventory({ scans, feedback, failures, ownerId, cutoff });

const repoRoot = resolve(import.meta.dirname, '../..');
const repoParent = resolve(repoRoot, '..');
const corpusV01 = join(repoParent, 'caissa_scanner_real_localization_corpus_v0_1');
const corpusV03 = join(repoParent, 'caissa_scanner_real_localization_corpus_v0_3');
const truthPath = join(repoParent, 'caissa_scanner_piece_labels_v0_1/piece-labels-v0.1.json');
const priorDevelopmentRoot = join(repoParent, 'caissa_scanner_real_development_cohort_v0_1');
const protectedCatalog = await protectedSources({ repoRoot, corpusV01, corpusV03, truthPath });
const priorDevelopment = await inventorySources(priorDevelopmentRoot);

await mkdir(join(privateRoot, 'originals'), { recursive: true });
const samples = [];
const privateRecords = [];
for (const record of inventory.records.filter((item) => item.evidenceAvailable)) {
  const match = /^supabase:\/\/scanner-beta-images\/(.+)$/.exec(record.private.storageReference);
  if (!match) throw new Error(`${record.recordKey}:private-storage-reference-invalid`);
  const { data, error } = await supabase.storage.from('scanner-beta-images').download(match[1]);
  if (error) throw new Error(`${record.recordKey}:storage-download:${error.message}`);
  const bytes = Buffer.from(await data.arrayBuffer());
  const imageSha256 = sha256(bytes);
  if (imageSha256 !== record.imageHash) throw new Error(`${record.recordKey}:download-hash-mismatch`);
  const metadata = await sharp(bytes, { failOn: 'error' }).metadata();
  const format = metadata.format === 'jpeg' ? 'jpg' : metadata.format;
  if (!['jpg', 'png', 'webp'].includes(format)) throw new Error(`${record.recordKey}:unsupported-format-${format}`);
  const fp = await fingerprint(bytes);
  const exactProtected = protectedCatalog.sources.find((item) => item.sourceSha256 === imageSha256);
  const exactPriorDevelopment = priorDevelopment.samples.find((item) => item.sourceSha256 === imageSha256);
  const nearProtected = exactProtected ? [] : protectedCatalog.sources.filter((item) => possibleNearDuplicate(fp, item.fingerprint));
  const nearPriorDevelopment = exactPriorDevelopment ? [] : priorDevelopment.samples
    .filter((item) => possibleNearDuplicate(fp, item.fingerprint));
  const sampleId = `field-hard-v0.1-${String(samples.length + 1).padStart(3, '0')}`;
  const filename = `${sampleId}.${format}`;
  const privatePath = join(privateRoot, 'originals', filename);
  await writeFile(privatePath, bytes, { flag: 'wx' });
  const governanceStatus = exactProtected || exactPriorDevelopment ? 'excluded-exact-duplicate'
    : nearProtected.length || nearPriorDevelopment.length ? 'review-required' : 'admitted';
  samples.push({
    sampleId,
    recordKey: record.recordKey,
    scanKey: record.scanKey,
    submittedAt: record.submittedAt,
    imageSha256,
    sourceBytes: bytes.length,
    sourceWidth: metadata.width,
    sourceHeight: metadata.height,
    detectedFormat: metadata.format,
    platform: record.platform,
    captureType: record.captureType,
    orientation: record.orientation,
    consentVerified: true,
    ownerVerified: true,
    privateStorageReferenceVerified: true,
    technicalRetry: false,
    protectedBenchmarkRestriction: false,
    exactProtectedDuplicate: exactProtected?.sampleId || null,
    exactPriorDevelopmentDuplicate: exactPriorDevelopment?.sampleId || null,
    possibleNearProtected: nearProtected.map((item) => item.sampleId),
    possibleNearPriorDevelopment: nearPriorDevelopment.map((item) => item.sampleId),
    fingerprint: fp,
    governanceStatus,
    groupKey: pseudonym(`${record.platform}:${record.captureType}:${record.submittedAt.slice(0, 10)}`, 'session-'),
    split: governanceStatus === 'admitted'
      ? stableSplit(`${record.platform}:${record.captureType}:${record.submittedAt.slice(0, 10)}`)
      : 'excluded',
    taxonomy: 'UNKNOWN',
    taxonomyEvidence: 'pending-human-image-audit',
    annotationStatus: 'pending-corners',
    privateImageLocator: filename,
    privatePath
  });
  privateRecords.push({
    sampleId,
    feedbackId: record.private.feedbackId,
    scanId: record.private.scanId,
    userId: record.private.userId,
    storageReference: record.private.storageReference,
    imageSha256,
    privatePath
  });
}

for (let index = 0; index < samples.length; index += 1) {
  for (let peer = index + 1; peer < samples.length; peer += 1) {
    if (samples[index].imageSha256 === samples[peer].imageSha256) {
      samples[peer].governanceStatus = 'excluded-exact-duplicate';
      samples[peer].split = 'excluded';
      samples[peer].duplicateOf = samples[index].sampleId;
    } else if (possibleNearDuplicate(samples[index].fingerprint, samples[peer].fingerprint)) {
      samples[index].possibleNearPeers ||= [];
      samples[peer].possibleNearPeers ||= [];
      samples[index].possibleNearPeers.push(samples[peer].sampleId);
      samples[peer].possibleNearPeers.push(samples[index].sampleId);
      if (samples[index].governanceStatus === 'admitted') samples[index].governanceStatus = 'review-required';
      if (samples[peer].governanceStatus === 'admitted') samples[peer].governanceStatus = 'review-required';
      samples[index].split = samples[index].governanceStatus === 'admitted' ? samples[index].split : 'review-required';
      samples[peer].split = samples[peer].governanceStatus === 'admitted' ? samples[peer].split : 'review-required';
    }
  }
}

const exclusions = inventory.records.filter((record) => !record.evidenceAvailable).map(({ private: _private, ...record }) => record);
const admitted = samples.filter((sample) => sample.governanceStatus === 'admitted');
const manifest = publicManifest({
  inventory,
  ownerHash: scopeHash,
  cutoff,
  samples,
  exclusions,
  deduplication: {
    exactWithinCohort: samples.filter((item) => item.duplicateOf).length,
    exactProtected: samples.filter((item) => item.exactProtectedDuplicate).length,
    exactPriorDevelopment: samples.filter((item) => item.exactPriorDevelopmentDuplicate).length,
    nearDuplicateReview: samples.filter((item) => item.governanceStatus === 'review-required').length,
    betaFieldSourceHashMatches: samples.length,
    sameSessionEvidence: 'client records contain no stable capture-session identifier'
  }
});
validatePublicManifest(manifest);
await mkdir(resolve(publicOutput, '..'), { recursive: true });
await writeFile(publicOutput, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
await writeFile(join(privateRoot, 'private-source-manifest.json'), `${JSON.stringify({
  schemaVersion: 'caissa-scanner-localization-field-hard-private-source/1',
  corpusVersion: CORPUS_VERSION,
  cutoff,
  accountScopeHash: scopeHash,
  records: privateRecords,
  excludedOrHeld: samples.filter((sample) => sample.governanceStatus !== 'admitted')
    .map((sample) => ({ sampleId: sample.sampleId, governanceStatus: sample.governanceStatus }))
}, null, 2)}\n`, { flag: 'wx' });

console.log(JSON.stringify({
  corpusVersion: CORPUS_VERSION,
  failureRecordsAudited: inventory.records.length,
  governedImagesDownloaded: samples.length,
  admitted: admitted.length,
  excludedOrHeldImages: samples.length - admitted.length,
  missingEvidenceRecords: exclusions.length,
  development: manifest.counts.development,
  heldOutValidation: manifest.counts.heldOutValidation,
  corpusSha256: manifest.corpusSha256,
  publicOutput,
  privateRoot
}));
