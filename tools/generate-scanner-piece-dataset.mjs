import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { buildSyntheticPlan, DATASET_VERSION, qualityReport, sha256, stableJson,
  validateCatalog, validateSampleManifest, validateThemes } from '../scanner/recognition/datasets/pieces/dataset-core.js';
import { renderSyntheticSvg, validateGeneratedSvg } from '../scanner/recognition/datasets/pieces/synthetic-svg.js';
import { verifyAssetCatalog } from '../scanner/recognition/datasets/pieces/asset-integrity.js';
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
const assetAudit = await verifyAssetCatalog(catalog, root);
if (assetAudit.exactDuplicates.length) throw new Error('cross-family exact asset duplicates require review');
const real = await loadVerifiedRealEvaluation({ truthPath, corpusV01, corpusV03, repoRoot: root });
const synthetic = buildSyntheticPlan(catalog, themes, seed);
if (new Set(synthetic.map((sample) => sample.imageFile.toLowerCase())).size !== synthetic.length) {
  throw new Error('case-insensitive generated image filename collision');
}
const themeById = new Map(themes.themes.map((theme) => [theme.boardThemeId, theme]));
const setById = new Map(catalog.pieceSets.map((set) => [set.pieceSetId, set]));
const piecePngs = new Map();
for (const set of catalog.pieceSets.filter((item) => item.sourceType === 'open-source-asset')) {
  for (const symbol of Object.keys(set.assetChecksums)) piecePngs.set(`${set.pieceSetId}/${symbol}`,
    await readFile(join(root, set.assetPath, 'normalized', `${symbol}.png`)));
}
const imageBytes = new Map();
for (const sample of synthetic) {
  const symbol = sample.classLabel === 'empty' ? null : `${sample.color === 'white' ? 'w' : 'b'}${sample.classLabel.toUpperCase()}`;
  const set = setById.get(sample.pieceSetId);
  const svg = renderSyntheticSvg(sample, themeById.get(sample.boardThemeId),
    set.sourceType === 'open-source-asset' && symbol ? piecePngs.get(`${set.pieceSetId}/${symbol}`) : null);
  const bytes = sample.imageFormat === 'svg' ? Buffer.from(svg) : await sharp(Buffer.from(svg))
    .toFormat(sample.augmentationId === 'jpeg-roundtrip' ? 'jpeg' : 'webp', { quality: 84 })
    .toBuffer().then((lossy) => sharp(lossy).png().toBuffer());
  sample.imageSha256 = sha256(bytes);
  if (sample.imageFormat === 'svg') validateGeneratedSvg(svg, sample.imageSha256, sha256);
  else {
    const info = await sharp(bytes).metadata();
    if (info.format !== 'png' || info.width !== 128 || info.height !== 128) throw new Error(`${sample.sampleId}: invalid roundtrip PNG`);
  }
  imageBytes.set(sample.sampleId, bytes);
}
const manifest = {
  schemaVersion: 'caissa-scanner-piece-dataset/2', datasetVersion: DATASET_VERSION, seed,
  catalogSha256: sha256(catalogBytes), boardThemeCatalogSha256: sha256(themesBytes),
  platformCoverageSha256: sha256(coverageBytes),
  truthManifestSha256: real.truthManifestSha256,
  realEvaluation: { boardCount: real.sourceBoardCount, squareCount: real.tiles.length,
    exactByteAliasesExcluded: real.aliasCount, excludedEdgeCase: real.excludedEdgeCase,
    sourcePixelsCommitted: false, trainingPermitted: false },
  splitPolicy: 'whole-piece-family/source-image/augmentation-family/platform-session; shared board themes; real truth test-only; no tile-random split',
  augmentationPolicy: 'bounded v0.2 SVG backgrounds/effects plus Sharp JPEG/WebP lossy roundtrip to PNG; no identity-changing transform',
  syntheticFormat: { format: 'SVG RGB or PNG after lossy roundtrip', width: 128, height: 128, grayscaleForced: false },
  samples: [...synthetic, ...real.tiles]
};
const seenImages = new Map();
for (const sample of synthetic) {
  const prior = seenImages.get(sample.imageSha256);
  if (prior) throw new Error(`duplicate generated image bytes: ${prior} and ${sample.sampleId}`);
  seenImages.set(sample.imageSha256, sample.sampleId);
}
validateSampleManifest(manifest.samples);
const report = qualityReport(manifest, catalog, themes, coverage, assetAudit);
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
