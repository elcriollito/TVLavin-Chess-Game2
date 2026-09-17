import { createHash } from 'node:crypto';

export const DATASET_VERSION = 'scanner-piece-dataset-v0.1';
export const CLASSES = Object.freeze(['empty', 'P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k']);
export const PIECE_TYPES = Object.freeze(['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']);
export const ROLES = Object.freeze(['TRAINING-ELIGIBLE', 'EVALUATION-ONLY', 'REFERENCE-ONLY']);
export const EXCLUDED_SAMPLE_ID = 'cv-success-005-puzzle-diagram-no-kings';
const TYPES = { P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king' };
const styles = new Set(['classic', 'outline', 'solid', 'geometric', 'stylized', 'book', 'mobile', 'broadcast', 'unknown']);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex').toUpperCase();
export const sha256 = hash;
export const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
export const labelParts = (classLabel) => {
  if (!CLASSES.includes(classLabel)) throw new Error(`invalid class ${classLabel}`);
  return classLabel === 'empty' ? { occupancy: 'empty', color: null, pieceType: null }
    : { occupancy: 'occupied', color: classLabel === classLabel.toUpperCase() ? 'white' : 'black', pieceType: TYPES[classLabel.toUpperCase()] };
};

export function validateCatalog(catalog) {
  if (catalog?.schemaVersion !== 'caissa-scanner-piece-set-catalog/1' || !Array.isArray(catalog.pieceSets)) throw new Error('invalid piece-set catalog');
  const ids = new Set();
  for (const set of catalog.pieceSets) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(set.pieceSetId || '') || ids.has(set.pieceSetId)) throw new Error('duplicate or invalid pieceSetId');
    ids.add(set.pieceSetId);
    if (!set.displayName || !set.sourceType || !set.platformFamily || !set.pieceFamilyGroup || !styles.has(set.style)
      || !set.sourceReference || !set.assetStatus || !ROLES.includes(set.trainingRole)
      || !Array.isArray(set.pieceAvailability) || !Array.isArray(set.colorVariants)
      || typeof set.redistributionAllowed !== 'boolean' || typeof set.trainingAllowed !== 'boolean'
      || typeof set.evaluationOnly !== 'boolean' || !set.license || !('licenseUrl' in set)) throw new Error(`${set.pieceSetId}: missing provenance/rights metadata`);
    if (set.pieceAvailability.some((piece) => !PIECE_TYPES.includes(piece))
      || set.colorVariants.some((color) => !['white', 'black'].includes(color))
      || new Set(set.pieceAvailability).size !== set.pieceAvailability.length
      || new Set(set.colorVariants).size !== set.colorVariants.length) throw new Error(`${set.pieceSetId}: invalid availability`);
    if (set.trainingRole === 'TRAINING-ELIGIBLE' && (!set.trainingAllowed || set.evaluationOnly
      || set.assetStatus !== 'available' || set.pieceAvailability.length !== 6 || set.colorVariants.length !== 2
      || /unknown|unverified|pending/i.test(set.license))) throw new Error(`${set.pieceSetId}: unlicensed or incomplete training family`);
    if (set.trainingRole === 'EVALUATION-ONLY' && (!set.evaluationOnly || set.trainingAllowed)) throw new Error(`${set.pieceSetId}: evaluation role conflict`);
    if (set.trainingRole === 'REFERENCE-ONLY' && (set.trainingAllowed || set.evaluationOnly)) throw new Error(`${set.pieceSetId}: reference role conflict`);
    if (set.sourceType === 'project-authored-procedural' && set.trainingRole === 'TRAINING-ELIGIBLE'
      && set.sourceReference !== 'generator:caissa-procedural-geometry-v1') throw new Error('unknown procedural generator');
  }
  return catalog;
}

export function validateThemes(catalog) {
  if (catalog?.schemaVersion !== 'caissa-scanner-board-themes/1' || !Array.isArray(catalog.themes)) throw new Error('invalid board themes');
  const ids = new Set();
  for (const theme of catalog.themes) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(theme.boardThemeId || '') || ids.has(theme.boardThemeId)
      || !/^(digital|print|textured)$/.test(theme.family)
      || !/^#[0-9a-fA-F]{6}$/.test(theme.light) || !/^#[0-9a-fA-F]{6}$/.test(theme.dark)
      || !['none', 'grain', 'hatch'].includes(theme.texture)) throw new Error('invalid or duplicate board theme');
    ids.add(theme.boardThemeId);
  }
  return catalog;
}

export function validatePlatformCoverage(coverage) {
  if (coverage?.schemaVersion !== 'caissa-scanner-platform-coverage/1' || !Array.isArray(coverage.platforms)
    || coverage.platforms.length !== 9) throw new Error('invalid priority-platform coverage matrix');
  const seen = new Set();
  for (const platform of coverage.platforms) {
    if (!platform.platformFamily || seen.has(platform.platformFamily) || !platform.note
      || ['directTrainingAssetAvailable', 'evaluationSampleAvailable', 'styleRepresentedIndirectly', 'missing']
        .some((field) => typeof platform[field] !== 'boolean')) throw new Error('invalid platform coverage row');
    seen.add(platform.platformFamily);
  }
  return coverage;
}

export function seededRandom(seed) {
  if (!Number.isSafeInteger(seed) || seed < 0) throw new Error('seed must be a nonnegative safe integer');
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function buildSyntheticPlan(catalog, themes, seed) {
  validateCatalog(catalog); validateThemes(themes);
  const random = seededRandom(seed);
  const samples = [];
  const augmentationIds = ['clean', 'low-contrast', 'soft-blur', 'print-fade', 'highlight', 'coordinate'];
  for (const set of catalog.pieceSets.filter((item) => item.trainingRole === 'TRAINING-ELIGIBLE')) {
    if (set.sourceType !== 'project-authored-procedural') throw new Error(`${set.pieceSetId}: generator unavailable for acquired assets`);
    for (const theme of themes.themes) for (const squareTone of ['light', 'dark']) {
      // One of each occupied class plus twelve varied empties: 1:1 occupancy and equal per-piece support.
      for (const classLabel of [...CLASSES.slice(1), ...Array(12).fill('empty')]) {
        const variant = samples.filter((item) => item.pieceSetId === set.pieceSetId
          && item.boardThemeId === theme.boardThemeId && item.squareTone === squareTone && item.classLabel === classLabel).length;
        const labelId = classLabel === 'empty' ? 'empty' : `${classLabel === classLabel.toUpperCase() ? 'white' : 'black'}-${classLabel.toUpperCase()}`;
        const id = `syn-${set.pieceSetId}-${theme.boardThemeId}-${squareTone}-${labelId}-${variant}`;
        const augmentationId = augmentationIds[Math.floor(random() * augmentationIds.length)];
        const renderingSeed = Math.floor(random() * 0x100000000);
        const target = labelParts(classLabel);
        const hardCaseTags = [
          ...(target.pieceType && ['bishop', 'knight', 'queen'].includes(target.pieceType) ? ['bishop-knight-queen-type'] : []),
          ...(target.pieceType === 'king' ? ['king-color'] : []),
          ...(augmentationId === 'low-contrast' ? ['low-contrast-generated'] : []),
          ...(theme.family === 'print' ? ['print-generated'] : [])
        ];
        samples.push({ sampleId: id, classLabel, ...labelParts(classLabel), pieceSetId: set.pieceSetId,
          pieceFamilyGroup: set.pieceFamilyGroup, boardThemeId: theme.boardThemeId, boardThemeFamily: theme.family,
          squareTone, sourceType: set.sourceType, sourceFamilyGroup: set.pieceFamilyGroup,
          sourceImageId: id, squareName: null,
          augmentationId, augmentationFamily: id, renderingSeed, hardCaseTags,
          split: 'train', trainingRole: set.trainingRole,
          license: set.license, width: 128, height: 128, imageFormat: 'svg', imageFile: `tiles/${id}.svg` });
      }
    }
  }
  return samples;
}

export function validateSampleManifest(samples) {
  if (!Array.isArray(samples)) throw new Error('samples required');
  const ids = new Set(), hashes = new Map();
  const exclusiveGroups = ['sourceImageId', 'sourceFamilyGroup', 'pieceFamilyGroup', 'boardThemeFamily', 'augmentationFamily', 'platformSession'];
  const seenGroups = Object.fromEntries(exclusiveGroups.map((group) => [group, new Map()]));
  for (const sample of samples) {
    if (!sample.sampleId || ids.has(sample.sampleId)) throw new Error('duplicate sample ID');
    ids.add(sample.sampleId);
    if (!CLASSES.includes(sample.classLabel) || !ROLES.includes(sample.trainingRole)
      || !['train', 'validation', 'test'].includes(sample.split)
      || sample.occupancy !== labelParts(sample.classLabel).occupancy
      || sample.color !== labelParts(sample.classLabel).color
      || sample.pieceType !== labelParts(sample.classLabel).pieceType
      || !Array.isArray(sample.hardCaseTags)
      || !sample.sourceImageId || !sample.sourceFamilyGroup || !sample.pieceFamilyGroup || !sample.boardThemeFamily
      || !sample.augmentationFamily || !sample.license || !sample.sourceType) throw new Error(`${sample.sampleId}: invalid tile metadata`);
    if (sample.trainingRole !== 'TRAINING-ELIGIBLE' && sample.split === 'train') throw new Error(`${sample.sampleId}: non-training source in train split`);
    if (sample.trainingRole === 'EVALUATION-ONLY' && sample.split !== 'test') throw new Error(`${sample.sampleId}: real evaluation must remain test-only`);
    if (sample.imageFile && (!Number.isInteger(sample.width) || sample.width < 64
      || !Number.isInteger(sample.height) || sample.height < 64
      || !/^[A-F0-9]{64}$/.test(sample.imageSha256 || ''))) throw new Error(`${sample.sampleId}: broken image metadata`);
    if (!sample.imageFile && sample.trainingRole === 'EVALUATION-ONLY'
      && !/^[A-F0-9]{64}$/.test(sample.sourceImageSha256 || '')) throw new Error(`${sample.sampleId}: missing source image hash`);
    for (const group of exclusiveGroups) {
      if (!sample[group]) continue;
      const prior = seenGroups[group].get(sample[group]);
      if (prior && prior !== sample.split) throw new Error(`${group} leakage: ${sample[group]}`);
      seenGroups[group].set(sample[group], sample.split);
    }
    if (sample.imageSha256) {
      const prior = hashes.get(sample.imageSha256);
      if (prior && prior !== sample.split) throw new Error('exact-byte cross-split leakage');
      if (prior) throw new Error('duplicate image bytes in dataset');
      hashes.set(sample.imageSha256, sample.split);
    }
  }
  return samples;
}

const counts = (samples, value) => Object.fromEntries([...new Set(samples.map(value))].sort()
  .map((key) => [key, samples.filter((sample) => value(sample) === key).length]));
export function qualityReport(manifest, catalog, themes, coverage = null) {
  validateSampleManifest(manifest.samples);
  if (coverage) validatePlatformCoverage(coverage);
  const train = manifest.samples.filter((sample) => sample.split === 'train');
  const real = manifest.samples.filter((sample) => sample.trainingRole === 'EVALUATION-ONLY');
  const white = train.filter((sample) => sample.color === 'white').length;
  const black = train.filter((sample) => sample.color === 'black').length;
  const occupied = white + black, empty = train.length - occupied;
  const availableFamilies = catalog.pieceSets.filter((set) => set.trainingRole === 'TRAINING-ELIGIBLE');
  const warnings = [];
  if (availableFamilies.length < 15) warnings.push('fewer-than-15-training-eligible-piece-families');
  if (availableFamilies.length < 3) warnings.push('no-credible-whole-family-validation-and-test-holdouts');
  if (white !== black) warnings.push('white-black-imbalance');
  if (empty !== occupied) warnings.push('empty-occupied-imbalance');
  const occupiedClassCounts = CLASSES.slice(1).map((label) => train.filter((sample) => sample.classLabel === label).length);
  if (Math.max(...occupiedClassCounts) - Math.min(...occupiedClassCounts) > 1) warnings.push('occupied-class-imbalance');
  if (real.length !== 1984) warnings.push('real-evaluation-square-count-not-1984');
  if (real.some((sample) => sample.pieceSetId === 'unknown-real-family')) warnings.push('real-piece-families-not-attributed');
  warnings.push('perceptual-near-duplicate-audit-pending');
  const sourceCategories = counts(real, (sample) => sample.sourceCategory || 'unknown');
  const hardSubsets = {
    bishopKnightQueen: real.filter((sample) => ['bishop', 'knight', 'queen'].includes(sample.pieceType)).length,
    kingColor: real.filter((sample) => sample.pieceType === 'king').length,
    whiteKingE1Candidates: real.filter((sample) => sample.hardCaseTags.includes('white-king-e1-candidate-unconfirmed')).length,
    lowContrast: real.filter((sample) => sample.difficultyTags?.some((tag) => /low-contrast|degraded|fading|old-newspaper/.test(tag))).length,
    printed: real.filter((sample) => /print/.test(sample.sourceCategory || '')).length,
    mobileWeb: real.filter((sample) => /digital|photo/.test(sample.sourceCategory || '')).length,
    broadcast: real.filter((sample) => sample.sourceCategory === 'livestream').length
  };
  return {
    schemaVersion: 'caissa-scanner-piece-dataset-quality/1', datasetVersion: DATASET_VERSION,
    manifestSha256: hash(stableJson(manifest)), catalogSha256: manifest.catalogSha256,
    boardThemeCatalogSha256: manifest.boardThemeCatalogSha256,
    platformCoverageSha256: manifest.platformCoverageSha256 || null, totalSamples: manifest.samples.length,
    countsByClass: counts(manifest.samples, (sample) => sample.classLabel),
    trainCountsByClass: counts(train, (sample) => sample.classLabel),
    testCountsByClass: counts(real, (sample) => sample.classLabel),
    countsByColor: counts(manifest.samples, (sample) => sample.color || 'empty'),
    testCountsByColor: counts(real, (sample) => sample.color || 'empty'),
    countsByPieceType: counts(manifest.samples, (sample) => sample.pieceType || 'empty'),
    testCountsByPieceType: counts(real, (sample) => sample.pieceType || 'empty'),
    countsByPieceSet: counts(manifest.samples, (sample) => sample.pieceSetId),
    countsBySourceFamily: counts(manifest.samples, (sample) => sample.sourceFamilyGroup),
    countsBySourceCategory: sourceCategories,
    countsByBoardTheme: counts(manifest.samples, (sample) => sample.boardThemeId),
    countsByRole: counts(manifest.samples, (sample) => sample.trainingRole),
    countsBySplit: counts(manifest.samples, (sample) => sample.split),
    trainBalance: { occupied, empty, white, black }, hardSubsets,
    holdoutFamilies: { train: [...new Set(train.map((sample) => sample.pieceFamilyGroup))].sort(),
      validation: [...new Set(manifest.samples.filter((sample) => sample.split === 'validation').map((sample) => sample.pieceFamilyGroup))].sort(),
      test: [...new Set(manifest.samples.filter((sample) => sample.split === 'test').map((sample) => sample.pieceFamilyGroup))].sort() },
    licenseSummary: counts(catalog.pieceSets, (set) => `${set.trainingRole}:${set.assetStatus}`),
    platformCoverage: coverage?.platforms || null,
    warnings, trainingReadiness: availableFamilies.length < 15
      || !manifest.samples.some((sample) => sample.split === 'validation')
      || !manifest.samples.some((sample) => sample.split === 'test' && sample.trainingRole === 'TRAINING-ELIGIBLE')
      ? 'NEEDS MORE PIECE-SET DIVERSITY'
      : real.some((sample) => sample.pieceSetId === 'unknown-real-family')
        ? 'NEEDS MORE LICENSING / PROVENANCE WORK' : 'READY FOR BASELINE TRAINING'
  };
}
