import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { certifyProductionFieldSnapshot } from './production-field-certification.mjs';

const argument = (name) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const input = argument('input');
const output = argument('write');
const dryRun = process.argv.includes('--dry-run');

if (!input) throw new Error('INPUT_REQUIRED');
if (!dryRun && !output) throw new Error('WRITE_DIRECTORY_REQUIRED');

const snapshot = JSON.parse(await readFile(resolve(input), 'utf8'));
const certification = certifyProductionFieldSnapshot(snapshot);
if (!certification.summary.certificationReady) {
  throw new Error(`CERTIFICATION_HOLD_${certification.summary.validationErrors.join('_') || 'COUNT_RECONCILIATION'}`);
}

if (!dryRun) {
  const directory = resolve(output);
  await mkdir(directory, { recursive: true });
  for (const [name, artifact] of Object.entries(certification.artifacts)) {
    await writeFile(resolve(directory, name), `${JSON.stringify(artifact, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  }
}

process.stdout.write(`${JSON.stringify({
  corpusVersion: certification.summary.corpusVersion,
  cutoff: certification.summary.cutoff,
  corpusSha256: certification.summary.corpusSha256,
  certificationReady: certification.summary.certificationReady,
  decision: certification.summary.decision,
  logicalAttempts: certification.summary.allTime.logicalAttempts,
  completedSubmissions: certification.summary.allTime.completedSubmissions,
  pending: certification.summary.allTime.pending,
  dryRun,
  sourceImagesWritten: false
})}\n`);
