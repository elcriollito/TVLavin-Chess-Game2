import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256, stableJson } from '../scanner/recognition/datasets/pieces/dataset-core.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
if (!arg('dataset-dir')) throw new Error('provide certified external --dataset-dir');
const metaBytes = await readFile(join(resolve(arg('dataset-dir')), 'synthetic-rgb64-v04.json'));
const config = JSON.parse(await readFile(join(root, 'scanner/recognition/classifier-revision/config-v0.2.json')));
const metadata = JSON.parse(metaBytes);
const catalog = JSON.parse(await readFile(join(root, 'scanner/recognition/datasets/piece-sets/catalog-v1.json')));
const synthetic = JSON.parse(await readFile(join(root, 'artifacts/scanner-piece-classifier-v0.2/synthetic-test-report.json')));
const real = JSON.parse(await readFile(join(root, 'artifacts/scanner-piece-classifier-v0.2/real-31-board-report.json')));
if (sha256(metaBytes) !== config.datasetMetadataSha256
  || metadata.pixelsSha256 !== config.datasetPixelsSha256
  || synthetic.stateSha256 !== real.stateSha256)
  throw new Error('king contrast cohort sources changed');
const scope = ['empty', 'B', 'R', 'Q', 'K', 'b', 'r', 'q', 'k'];
const scoped = metadata.records.filter((item) => scope.includes(item.classLabel));
const count = (rows, predicate) => rows.filter(predicate).length;
const styleByFamily = new Map(catalog.pieceSets.map((item) => [item.pieceSetId, item.style]));
const split = (name) => {
  const rows = scoped.filter((item) => item.split === name);
  const by = (key) => Object.fromEntries([...new Set(rows.map(key))].sort().map((value) =>
    [value, count(rows, (item) => key(item) === value)]));
  return { sampleCount: rows.length, sampleIdsSha256: sha256(Buffer.from(rows.map((item) => item.sampleId).sort().join('\n'))),
    byClass: by((item) => item.classLabel), byTone: by((item) => item.squareTone),
    byTheme: by((item) => item.boardThemeId), byCatalogStyle: by((item) => styleByFamily.get(item.pieceSetId)),
    screenEffectProxy: count(rows, (item) => /glare|moire|jpeg-roundtrip|webp-roundtrip|compression/.test(item.augmentationId)),
    printEffectProxy: count(rows, (item) => /print|hatched|speckle|yellowed|low-contrast/.test(`${item.augmentationId} ${item.boardThemeId}`)),
    lowContrastProxy: count(rows, (item) => /low-contrast/.test(`${item.augmentationId} ${item.boardThemeId}`)) };
};
const summarizeRows = (matrix) => {
  const indices = scope.map((label) => config.classOrder.indexOf(label));
  const support = indices.reduce((sum, index) => sum + matrix[index].reduce((a, b) => a + b, 0), 0);
  const correct = indices.reduce((sum, index) => sum + matrix[index][index], 0);
  return { support, accuracy13: correct / support,
    predictedK: indices.reduce((sum, index) => sum + matrix[index][6], 0),
    predictedk: indices.reduce((sum, index) => sum + matrix[index][12], 0),
    trueK: matrix[6].reduce((sum, value) => sum + value, 0),
    truek: matrix[12].reduce((sum, value) => sum + value, 0),
    emptyToK: matrix[0][6], emptyTok: matrix[0][12] };
};
const report = { schemaVersion: 'caissa-scanner-king-contrast-v02/1',
  cohortRule: 'all certified v0.4 synthetic tiles with truth empty/K/k/Q/q/B/b/R/r; no real pixels or truth in cohort construction',
  datasetMetadataSha256: config.datasetMetadataSha256, datasetPixelsSha256: config.datasetPixelsSha256,
  classScope: scope, bySplit: { train: split('train'), validation: split('validation'), test: split('test') },
  syntheticTestFromSingleFrozenPass: { raw: summarizeRows(synthetic.raw.confusionMatrix),
    calibrated: summarizeRows(synthetic.calibrated.confusionMatrix) },
  realAggregateDescriptiveOnly: { raw: summarizeRows(real.raw.confusionMatrix),
    calibrated: summarizeRows(real.calibrated.confusionMatrix) },
  coverageLimitations: 'Light/dark, ten board themes and catalog styles are explicit. Glare/moiré/compression are photographed-screen proxies, not real photographs. Catalog has no certified outline-versus-solid style label; do not claim that distinction as verified or infer a platform.' };
const path = join(root, 'artifacts/scanner-piece-classifier-v0.2/king-contrast-set.json');
await writeFile(path, stableJson(report), { flag: 'wx' });
process.stdout.write(`${JSON.stringify({ path, sha256: sha256(stableJson(report)),
  test: report.syntheticTestFromSingleFrozenPass, coverageLimitations: report.coverageLimitations }, null, 2)}\n`);
