import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSyntheticPlan, DATASET_VERSION, qualityReport, sha256, stableJson,
  validateCatalog, validateSampleManifest, validateThemes } from '../scanner/recognition/datasets/pieces/dataset-core.js';
import { renderSyntheticSvg, validateGeneratedSvg } from '../scanner/recognition/datasets/pieces/synthetic-svg.js';
import { loadVerifiedRealEvaluation } from '../scanner/recognition/datasets/pieces/real-evaluation.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const outputArgument = arg('output-dir');
if (!outputArgument) throw new Error('Provide a new isolated --output-dir outside the repository; generated tiles are not committed.');
const outputDir = resolve(outputArgument);
const relativeOutput = relative(root, outputDir);
if (!relativeOutput.startsWith('..') && !isAbsolute(relativeOutput)) throw new Error('generated tiles must stay outside the repository');
if (existsSync(outputDir)) throw new Error('output directory already exists; refuse to overwrite generated data');
const reportOut = arg('report-out');
if (reportOut && existsSync(resolve(reportOut))) throw new Error('report-out already exists; refuse to overwrite');
const seed = Number(arg('seed', '306'));
const truthPath = resolve(arg('truth', join(root, '..', 'caissa_scanner_piece_labels_v0_1', 'piece-labels-v0.1.json')));
const corpusV01 = resolve(arg('corpus-v01', join(root, '..', 'caissa_scanner_real_localization_corpus_v0_1')));
const corpusV03 = resolve(arg('corpus-v03', join(root, '..', 'caissa_scanner_real_localization_corpus_v0_3')));
const inside = (target, directory) => {
  const path = relative(directory, target);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
};
const protectedRoots = [corpusV01, corpusV03, dirname(truthPath)];
if (protectedRoots.some((directory) => inside(outputDir, directory)
  || (reportOut && inside(resolve(reportOut), directory)))) {
  throw new Error('generated output must not modify certified source corpora or truth workspace');
}
const catalogPath = join(root, 'scanner/recognition/datasets/piece-sets/catalog-v1.json');
const themesPath = join(root, 'scanner/recognition/datasets/pieces/catalog/board-themes-v1.json');
const coveragePath = join(root, 'scanner/recognition/datasets/pieces/catalog/platform-coverage-v1.json');
const catalogBytes = await readFile(catalogPath), themesBytes = await readFile(themesPath);
const coverageBytes = await readFile(coveragePath);
const catalog = validateCatalog(JSON.parse(catalogBytes));
const themes = validateThemes(JSON.parse(themesBytes));
const coverage = JSON.parse(coverageBytes);
const real = await loadVerifiedRealEvaluation({ truthPath, corpusV01, corpusV03, repoRoot: root });
const synthetic = buildSyntheticPlan(catalog, themes, seed);
if (new Set(synthetic.map((sample) => sample.imageFile.toLowerCase())).size !== synthetic.length) {
  throw new Error('case-insensitive generated image filename collision');
}
const themeById = new Map(themes.themes.map((theme) => [theme.boardThemeId, theme]));
const imageBytes = new Map();
for (const sample of synthetic) {
  const svg = renderSyntheticSvg(sample, themeById.get(sample.boardThemeId));
  sample.imageSha256 = sha256(svg);
  validateGeneratedSvg(svg, sample.imageSha256, sha256);
  imageBytes.set(sample.sampleId, svg);
}
const manifest = {
  schemaVersion: 'caissa-scanner-piece-dataset/1', datasetVersion: DATASET_VERSION, seed,
  catalogSha256: sha256(catalogBytes), boardThemeCatalogSha256: sha256(themesBytes),
  platformCoverageSha256: sha256(coverageBytes),
  truthManifestSha256: real.truthManifestSha256,
  realEvaluation: { boardCount: real.sourceBoardCount, squareCount: real.tiles.length,
    exactByteAliasesExcluded: real.aliasCount, excludedEdgeCase: real.excludedEdgeCase,
    sourcePixelsCommitted: false, trainingPermitted: false },
  splitPolicy: 'whole-piece-family/source-image/augmentation-family/platform-session; real truth test-only; no tile-random split',
  augmentationPolicy: 'bounded v0.1 SVG clean/low-contrast/soft-blur/print-fade/highlight/coordinate; no identity-changing transform',
  syntheticFormat: { format: 'SVG RGB', width: 128, height: 128, grayscaleForced: false },
  samples: [...synthetic, ...real.tiles]
};
validateSampleManifest(manifest.samples);
const report = qualityReport(manifest, catalog, themes, coverage);
if (sha256(await readFile(truthPath)) !== real.truthManifestSha256) throw new Error('truth changed during generation');
await mkdir(join(outputDir, 'tiles'), { recursive: true });
for (const sample of synthetic) {
  const imagePath = join(outputDir, sample.imageFile);
  await writeFile(imagePath, imageBytes.get(sample.sampleId), { flag: 'wx' });
  if (sha256(await readFile(imagePath)) !== sample.imageSha256) throw new Error(`${sample.sampleId}: generated image changed on disk`);
}
await writeFile(join(outputDir, 'dataset-manifest.json'), stableJson(manifest), { flag: 'wx' });
await writeFile(join(outputDir, 'quality-report.json'), stableJson(report), { flag: 'wx' });
if (reportOut) {
  const target = resolve(reportOut);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, stableJson(report), { flag: 'wx' });
}
process.stdout.write(`${JSON.stringify({ outputDir, manifestSha256: report.manifestSha256,
  syntheticTiles: synthetic.length, realEvaluationTiles: real.tiles.length,
  readiness: report.trainingReadiness, warnings: report.warnings }, null, 2)}\n`);
