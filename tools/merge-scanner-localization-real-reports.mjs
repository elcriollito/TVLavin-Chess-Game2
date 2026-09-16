import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalizationReport } from '../scanner/recognition/benchmark/localization-real-evaluator.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function argument(name, fallback) {
  const prefix = `--${name}=`;
  return resolve(process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || fallback);
}

const developmentPath = argument('development', join(repoRoot, 'artifacts/scanner-localization-hard-v0.1/hardened-development-localization-v0.1.json'));
const holdoutPath = argument('holdout', join(repoRoot, 'artifacts/scanner-localization-hard-v0.1/hardened-holdout-localization-v0.1.json'));
const outputPath = argument('output', join(repoRoot, 'artifacts/scanner-localization-hard-v0.1/hardened-localization-v0.1.json'));
const manifestPath = join(repoRoot, 'scanner/recognition/benchmark/manifests/scanner-localization-hard-v0.1.json');
const [manifest, development, holdout] = await Promise.all([manifestPath, developmentPath, holdoutPath]
  .map(async (path) => JSON.parse(await readFile(path, 'utf8'))));

for (const report of [development, holdout]) {
  if (report.corpusVersion !== manifest.corpusVersion
      || report.annotationManifestSha256 !== manifest.annotationManifest.sha256
      || report.sourceManifestSha256 !== manifest.sourceManifest.sha256) {
    throw new Error('Cannot merge reports from different immutable corpus identities.');
  }
}
if (development.detector.localizerVersion !== holdout.detector.localizerVersion
    || development.detector.implementationCheckpoint !== holdout.detector.implementationCheckpoint) {
  throw new Error('Cannot merge reports from different detector identities.');
}
if (development.samples.some((sample) => sample.split !== 'development')
    || holdout.samples.some((sample) => sample.split !== 'holdout')
    || development.samples.length !== 10 || holdout.samples.length !== 4) {
  throw new Error('Expected exactly 10 development and 4 holdout samples.');
}

const report = createLocalizationReport({
  manifest,
  annotationSha256: development.annotationManifestSha256,
  detector: {
    ...development.detector,
    label: 'hardened',
    splitEvaluated: 'development-then-holdout-once',
    mergedFrom: [developmentPath, holdoutPath].map((path) => basename(path))
  },
  samples: [...development.samples, ...holdout.samples]
});
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${outputPath}\n`);
process.stdout.write(`${JSON.stringify(report.metrics, null, 2)}\n`);
