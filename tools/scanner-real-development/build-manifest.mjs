import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANNOTATION_ROOT, SOURCE_ROOT, auditInventory, hash, inventorySources, protectedSources, summary }
  from './core.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const parent = resolve(repoRoot, '..');
const manifestPath = join(repoRoot, 'scanner/recognition/datasets/real-development/real-development-v0.1.json');
const reportPath = join(repoRoot, 'scanner/recognition/datasets/real-development/audit-v0.1.json');

export async function build({ sourceRoot = SOURCE_ROOT,
  corpusV01 = join(parent, 'caissa_scanner_real_localization_corpus_v0_1'),
  corpusV03 = join(parent, 'caissa_scanner_real_localization_corpus_v0_3'),
  truthPath = join(parent, 'caissa_scanner_piece_labels_v0_1/piece-labels-v0.1.json'),
  write = false } = {}) {
  const protectedCatalog = await protectedSources({ repoRoot, corpusV01, corpusV03, truthPath });
  const inventory = await inventorySources(sourceRoot);
  const manifest = auditInventory(inventory, protectedCatalog);
  const report = { ...summary(manifest), protectedUniqueSourceCount: protectedCatalog.sources.length,
    protectedFinalSourceCount: protectedCatalog.protectedFinalHashes.size,
    unsupportedFiles: inventory.unsupported,
    exactDuplicates: manifest.samples.filter((item) => item.duplicateOf).map((item) => ({
      sampleId: item.sampleId, duplicateOf: item.duplicateOf, protectedSourceId: item.protectedSourceId })),
    reviewCandidates: manifest.samples.filter((item) => item.governanceStatus === 'review-required').map((item) => ({
      sampleId: item.sampleId, possibleNearProtected: item.possibleNearProtected,
      possibleNearPeers: item.possibleNearPeers })) };
  if (write) {
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  return { manifest, report, manifestPath, reportPath, sourceRoot, annotationRoot: ANNOTATION_ROOT,
    manifestSha256: hash(Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build({ write: process.argv.includes('--write') }).then((result) => {
    process.stdout.write(`${JSON.stringify({ ...result.report, manifestPath: result.manifestPath,
      manifestSha256: result.manifestSha256 }, null, 2)}\n`);
  }).catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
}
