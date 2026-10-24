import { createHash } from 'node:crypto';
import { basename, join, resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';

import { buildReports, validateTruthSample } from './baseline-scoring.mjs';
import { FROZEN_FIELD_CORPUS_SHA256 } from './cohort.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;

const args = Object.fromEntries(process.argv.slice(2).map((item) => {
  const [key, ...rest] = item.replace(/^--/, '').split('=');
  return [key, rest.join('=')];
}));

for (const required of ['truth', 'browser', 'private-root', 'audit', 'output-dir']) {
  if (!args[required]) throw new Error(`missing-required-argument:${required}`);
}

const privateRoot = resolve(args['private-root']);
const truthPath = resolve(args.truth);
const browserPath = resolve(args.browser);
const auditPath = resolve(args.audit);
const outputDir = resolve(args['output-dir']);
const [truthBytes, browserBytes, auditBytes] = await Promise.all([
  readFile(truthPath), readFile(browserPath), readFile(auditPath)
]);
const truthManifest = JSON.parse(truthBytes);
const browserDiagnostics = JSON.parse(browserBytes);
const auditReport = JSON.parse(auditBytes);

if (auditReport.certifiedSource?.sha256 !== FROZEN_FIELD_CORPUS_SHA256
  || auditReport.certifiedSource?.preserved !== true) throw new Error('certified-beta-field-v0.1-not-preserved');
if (truthManifest.corpus !== 'caissa-scanner-localization-field-hard-v0.1') throw new Error('truth-corpus-invalid');
if (truthManifest.samples?.length !== 12 || truthManifest.progress?.completed !== 12
  || truthManifest.progress?.total !== 12) throw new Error('truth-record-count-invalid');
if (browserDiagnostics.runtime !== 'chromium-browser-production-decode-and-worker'
  || browserDiagnostics.sampleCount !== 12) throw new Error('browser-baseline-contract-invalid');
const seenHashes = new Set();
for (const sample of truthManifest.samples) {
  validateTruthSample(sample);
  const filename = basename(sample.originalFile);
  const imagePath = join(privateRoot, 'originals', filename);
  const imageBytes = await readFile(imagePath);
  const actualHash = sha256(imageBytes);
  if (actualHash !== sample.sourceHash || actualHash !== sample.originalSha256) {
    throw new Error(`${sample.sampleId}:source-hash-mismatch`);
  }
  if (seenHashes.has(actualHash)) throw new Error(`${sample.sampleId}:duplicate-source-hash`);
  seenHashes.add(actualHash);
}

const reports = buildReports({
  truthManifest,
  browserDiagnostics,
  auditReport,
  truthSha256: sha256(truthBytes),
  browserSha256: sha256(browserBytes)
});

const outputs = [
  ['baseline-scoring.json', reports.baseline],
  ['candidate-analysis.json', reports.candidateAnalysis],
  ['corner-error-report.json', reports.cornerErrorReport],
  ['failure-taxonomy.json', reports.failureReport],
  ['counterfactual-analysis.json', reports.counterfactual]
];
for (const [name, report] of outputs) {
  await writeFile(join(outputDir, name), serialize(report), { flag: 'wx' });
}

console.log(JSON.stringify({
  outputDir,
  truthSha256: reports.baseline.truthSha256,
  browserDiagnosticsSha256: reports.baseline.browserDiagnosticsSha256,
  independent: reports.baseline.independentAdmitted,
  all12: reports.baseline.all12Diagnostics,
  files: outputs.map(([name]) => name),
  sourceImagesCommitted: false,
  privatePathsCommitted: false
}));
