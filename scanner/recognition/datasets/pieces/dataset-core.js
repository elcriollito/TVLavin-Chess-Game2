import { createHash } from 'node:crypto';

export const DATASET_VERSION = 'scanner-piece-dataset-v0.3';
export const CLASSES = Object.freeze(['empty', 'P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k']);
export const PIECE_TYPES = Object.freeze(['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']);
export const ROLES = Object.freeze(['TRAINING-ELIGIBLE', 'EVALUATION-ONLY', 'REFERENCE-ONLY']);
export const EXCLUDED_SAMPLE_ID = 'cv-success-005-puzzle-diagram-no-kings';
const TYPES = { P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king' };
const styles = new Set(['classic', 'outline', 'solid', 'geometric', 'stylized', 'book', 'monochrome', 'mobile', 'broadcast', 'high-detail', 'ornamental', 'minimalist', 'blocky', 'unknown']);
const supportedAssetLicenses = { 'Apache-2.0': true, MIT: true, 'CC-BY-4.0': true,
  'CC0-1.0': false, 'Public-Domain-Dedication': false };
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
      || !['train', 'validation', 'test'].includes(set.datasetSplit)
      || /unknown|unverified|pending/i.test(set.license))) throw new Error(`${set.pieceSetId}: unlicensed or incomplete training family`);
    if (set.trainingRole === 'EVALUATION-ONLY' && (!set.evaluationOnly || set.trainingAllowed)) throw new Error(`${set.pieceSetId}: evaluation role conflict`);
    if (set.trainingRole === 'REFERENCE-ONLY' && (set.trainingAllowed || set.evaluationOnly)) throw new Error(`${set.pieceSetId}: reference role conflict`);
    if (set.sourceType === 'project-authored-procedural' && set.trainingRole === 'TRAINING-ELIGIBLE'
      && (set.sourceReference !== 'generator:caissa-procedural-geometry-v1'
        || set.sourceProject !== 'CAISSA Chess' || set.author !== 'CAISSA Chess'))
      throw new Error('unknown procedural generator');
    if (set.sourceType === 'open-source-asset' && (!set.sourceProject || !set.sourceUrl || !/^[a-f0-9]{40}$/.test(set.sourceVersion || '')
      || !set.author || !set.licenseTextPath || !/^[A-F0-9]{64}$/.test(set.licenseTextSha256 || '')
      || !set.sourceNoticePath || !/^[A-F0-9]{64}$/.test(set.sourceNoticeSha256 || '')
      || !set.assetPath || !set.assetChecksums || !/^[A-F0-9]{64}$/.test(set.familyChecksum || '')
      || !Object.hasOwn(supportedAssetLicenses, set.license)
      || set.attributionRequired !== supportedAssetLicenses[set.license] || !set.redistributionAllowed
      || Object.keys(set.assetChecksums).length !== 12
      || Object.values(set.assetChecksums).some((meta) => !/^[A-F0-9]{64}$/.test(meta.sourceSha256 || '')
        || !/^[A-F0-9]{64}$/.test(meta.normalizedSha256 || '') || meta.originalFormat !== 'svg'
        || meta.normalizedFormat !== 'png' || !meta.intrinsicWidth || !meta.intrinsicHeight || meta.alpha !== true)))
      throw new Error(`${set.pieceSetId}: incomplete acquired-asset provenance`);
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
      || ['directTrainingAssetAvailable', 'evaluationSampleAvailable', 'styleRepresentedIndirectly', 'missing',
        'trainingRepresentativeFamily', 'humanPieceTruth', 'localizationTruth']
        .some((field) => typeof platform[field] !== 'boolean')) throw new Error('invalid platform coverage row');
    seen.add(platform.platformFamily);
  }
  return coverage;
}

export function validateFreshEvaluationCandidates(pool) {
  if (pool?.schemaVersion !== 'caissa-scanner-fresh-evaluation-candidates/1'
    || !/^[A-F0-9]{64}$/.test(pool.sourceManifestSha256 || '')
    || !Array.isArray(pool.candidates) || pool.candidates.length !== pool.sourceFileCount)
    throw new Error('invalid fresh evaluation candidate pool');
  const ids = new Set();
  for (const candidate of pool.candidates) {
    if (!candidate.candidateId || ids.has(candidate.candidateId)
      || !/^[A-F0-9]{64}$/.test(candidate.originalSha256 || '')
      || !/^[A-F0-9]{64}$/.test(candidate.referenceSha256 || '')
      || !candidate.originalFile || !candidate.referenceScreenshot
      || candidate.role !== 'fresh-evaluation-candidate' || candidate.trainingAllowed !== false
      || candidate.formalBenchmarkEligible !== false
      || !Array.isArray(candidate.remainingCertification) || !candidate.remainingCertification.length)
      throw new Error('invalid or unsafe evaluation candidate');
    ids.add(candidate.candidateId);
    if (candidate.platformId && !candidate.platformIdentityEvidence)
      throw new Error('platform identity has no evidence');
    if (candidate.referenceOutcome !== 'unknown' && candidate.humanVerifiedOutcome === null)
      throw new Error('reference outcome has no human verification');
  }
  if (pool.priorCorpusAliasCount !== pool.candidates.filter((item) => item.priorCorpusSampleId).length)
    throw new Error('prior-corpus alias count mismatch');
  return pool;
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
  const augmentationIds = ['clean', 'low-contrast', 'soft-blur', 'print-fade', 'highlight', 'coordinate',
    'glare', 'screen-moire', 'arrow', 'speckle', 'jpeg-roundtrip', 'webp-roundtrip',
    'brightness-gradient', 'desaturated-print', 'yellowed-paper', 'subpixel-scale', 'perspective-residual'];
  for (const set of catalog.pieceSets.filter((item) => item.trainingRole === 'TRAINING-ELIGIBLE')) {
    for (const [themeIndex, theme] of themes.themes.entries()) for (const squareTone of ['light', 'dark']) {
      // One of each occupied class plus twelve varied empties: 1:1 occupancy and equal per-piece support.
      for (const classLabel of [...CLASSES.slice(1), ...Array(12).fill('empty')]) {
        const variant = samples.filter((item) => item.pieceSetId === set.pieceSetId
          && item.boardThemeId === theme.boardThemeId && item.squareTone === squareTone && item.classLabel === classLabel).length;
        const labelId = classLabel === 'empty' ? 'empty' : `${classLabel === classLabel.toUpperCase() ? 'white' : 'black'}-${classLabel.toUpperCase()}`;
        const id = `syn-${set.pieceSetId}-${theme.boardThemeId}-${squareTone}-${labelId}-${variant}`;
        // Same-type white/black pairs share conditions; the family split, not a tile split, governs holdouts.
        const typeIndex = classLabel === 'empty' ? variant : PIECE_TYPES.indexOf(TYPES[classLabel.toUpperCase()]);
        const augmentationId = augmentationIds[(themeIndex * 2 + (squareTone === 'dark' ? 1 : 0) + typeIndex) % augmentationIds.length];
        const imageFormat = ['jpeg-roundtrip', 'webp-roundtrip'].includes(augmentationId) ? 'png' : 'svg';
        const renderingSeed = Math.floor(random() * 0x100000000);
        const target = labelParts(classLabel);
        const hardCaseTags = [
          ...(target.pieceType && ['bishop', 'knight', 'queen'].includes(target.pieceType) ? ['bishop-knight-queen-type'] : []),
          ...(target.pieceType === 'king' ? ['king-color'] : []),
          ...(target.pieceType ? ['same-type-color-pair'] : []),
          ...(augmentationId === 'low-contrast' ? ['low-contrast-generated'] : []),
          ...(theme.family === 'print' ? ['print-generated'] : [])
        ];
        samples.push({ sampleId: id, classLabel, ...labelParts(classLabel), pieceSetId: set.pieceSetId,
          pieceFamilyGroup: set.pieceFamilyGroup, boardThemeId: theme.boardThemeId, boardThemeFamily: theme.family,
          squareTone, sourceType: set.sourceType, sourceFamilyGroup: set.pieceFamilyGroup,
          sourceImageId: id, squareName: null,
          augmentationId, augmentationFamily: id, renderingSeed, hardCaseTags,
          split: set.datasetSplit, trainingRole: set.trainingRole,
          license: set.license, width: 128, height: 128, imageFormat, imageFile: `tiles/${id}.${imageFormat}` });
      }
    }
  }
  return samples;
}

export function validateSampleManifest(samples) {
  if (!Array.isArray(samples)) throw new Error('samples required');
  const ids = new Set(), hashes = new Map();
  // Board/augmentation types intentionally cross splits so piece-art family remains the isolated variable.
  const exclusiveGroups = ['sourceImageId', 'sourceFamilyGroup', 'pieceFamilyGroup', 'augmentationFamily', 'platformSession'];
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
export function qualityReport(manifest, catalog, themes, coverage = null, assetAudit = null, candidates = null) {
  validateCatalog(catalog); validateThemes(themes);
  validateSampleManifest(manifest.samples);
  if (coverage) validatePlatformCoverage(coverage);
  if (candidates) validateFreshEvaluationCandidates(candidates);
  const train = manifest.samples.filter((sample) => sample.split === 'train');
  const real = manifest.samples.filter((sample) => sample.trainingRole === 'EVALUATION-ONLY');
  const white = train.filter((sample) => sample.color === 'white').length;
  const black = train.filter((sample) => sample.color === 'black').length;
  const occupied = white + black, empty = train.length - occupied;
  const availableFamilies = catalog.pieceSets.filter((set) => set.trainingRole === 'TRAINING-ELIGIBLE');
  const upstreamCounts = counts(availableFamilies, (set) => set.sourceProject);
  const authorCounts = counts(availableFamilies, (set) => set.author);
  const externalProjects = Object.keys(upstreamCounts).filter((project) => project !== 'CAISSA Chess');
  const dominantUpstream = Object.entries(upstreamCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const warnings = [];
  if (availableFamilies.length < 10) warnings.push('fewer-than-10-meaningful-piece-families');
  else if (availableFamilies.length < 15) warnings.push('fewer-than-15-preferred-piece-families');
  if (externalProjects.length < 3) warnings.push('fewer-than-three-independent-external-upstreams');
  if (dominantUpstream && dominantUpstream[1] / availableFamilies.length > 0.5)
    warnings.push('single-upstream-over-half-of-families');
  const validationFamilies = availableFamilies.filter((set) => set.datasetSplit === 'validation');
  const testFamilies = availableFamilies.filter((set) => set.datasetSplit === 'test');
  if (!validationFamilies.length || validationFamilies.length + testFamilies.length < 2)
    warnings.push('fewer-than-two-whole-family-holdouts');
  if (validationFamilies.length < 2 || testFamilies.length < 2)
    warnings.push('fewer-than-two-families-in-each-holdout');
  if (white !== black) warnings.push('white-black-imbalance');
  if (empty !== occupied) warnings.push('empty-occupied-imbalance');
  const occupiedClassCounts = CLASSES.slice(1).map((label) => train.filter((sample) => sample.classLabel === label).length);
  if (Math.max(...occupiedClassCounts) - Math.min(...occupiedClassCounts) > 1) warnings.push('occupied-class-imbalance');
  if (real.length !== 1984) warnings.push('real-evaluation-square-count-not-1984');
  if (real.some((sample) => sample.pieceSetId === 'unknown-real-family')) warnings.push('real-piece-families-not-attributed');
  if (assetAudit?.exactDuplicates.length) warnings.push('cross-family-exact-asset-duplicates');
  if (assetAudit?.nearDuplicates.length) warnings.push('possible-near-duplicate-piece-families');
  if (!assetAudit || assetAudit.acquiredFamilies !== availableFamilies.filter((set) => set.sourceType === 'open-source-asset').length)
    warnings.push('asset-integrity-not-audited');
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
  const generated = manifest.samples.filter((sample) => sample.imageFile);
  const hardGenerated = {
    colorPairs: generated.filter((sample) => sample.hardCaseTags.includes('same-type-color-pair')).length,
    bishopKnightQueen: generated.filter((sample) => sample.hardCaseTags.includes('bishop-knight-queen-type')).length,
    kingColor: generated.filter((sample) => sample.hardCaseTags.includes('king-color')).length,
    lowContrast: generated.filter((sample) => sample.augmentationId === 'low-contrast').length,
    print: generated.filter((sample) => sample.boardThemeFamily === 'print').length
  };
  const splitFamilies = { train: availableFamilies.filter((set) => set.datasetSplit === 'train').map((set) => set.pieceSetId).sort(),
    validation: validationFamilies.map((set) => set.pieceSetId).sort(), test: testFamilies.map((set) => set.pieceSetId).sort() };
  return {
    schemaVersion: 'caissa-scanner-piece-dataset-quality/3', datasetVersion: DATASET_VERSION,
    manifestSha256: hash(stableJson(manifest)), catalogSha256: manifest.catalogSha256,
    boardThemeCatalogSha256: manifest.boardThemeCatalogSha256,
    platformCoverageSha256: manifest.platformCoverageSha256 || null,
    freshEvaluationCandidatesSha256: manifest.freshEvaluationCandidatesSha256 || null,
    realTruthSha256: manifest.truthManifestSha256 || null,
    realEvaluation: manifest.realEvaluation || null,
    totalSamples: manifest.samples.length,
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
    familyCount: catalog.pieceSets.length, trainingEligibleFamilyCount: availableFamilies.length,
    sourceIndependence: { upstreamProjectCount: Object.keys(upstreamCounts).length,
      externalUpstreamProjectCount: externalProjects.length, authorCount: Object.keys(authorCounts).length,
      familiesPerUpstream: upstreamCounts, familiesPerAuthor: authorCounts,
      dominantUpstream: dominantUpstream ? { sourceProject: dominantUpstream[0],
        familyCount: dominantUpstream[1], share: Number((dominantUpstream[1] / availableFamilies.length).toFixed(4)) } : null },
    familyCompleteness: { completeTrainingFamilies: availableFamilies.filter((set) => set.pieceAvailability.length === 6
      && set.colorVariants.length === 2).map((set) => set.pieceSetId).sort(),
    incompleteTrainingFamilies: availableFamilies.filter((set) => set.pieceAvailability.length !== 6
      || set.colorVariants.length !== 2).map((set) => set.pieceSetId).sort() },
    familyCountsBySplit: Object.fromEntries(Object.entries(splitFamilies).map(([key, ids]) => [key, ids.length])),
    familyChecksums: Object.fromEntries(availableFamilies.filter((set) => set.familyChecksum).map((set) => [set.pieceSetId, set.familyChecksum])),
    countsByStyle: counts(availableFamilies, (set) => set.style),
    countsByAugmentation: counts(generated, (sample) => sample.augmentationId),
    generatedCountsByClass: counts(generated, (sample) => sample.classLabel),
    generatedCountsByColor: counts(generated, (sample) => sample.color || 'empty'),
    generatedCountsByPieceType: counts(generated, (sample) => sample.pieceType || 'empty'),
    trainBalance: { occupied, empty, white, black }, hardSubsets, hardGenerated,
    holdoutFamilies: splitFamilies, assetAudit,
    licenseSummary: counts(catalog.pieceSets, (set) => `${set.trainingRole}:${set.license}`),
    assetStatusSummary: counts(catalog.pieceSets, (set) => `${set.trainingRole}:${set.assetStatus}`),
    platformCoverage: coverage?.platforms || null,
    freshEvaluationCandidates: candidates ? { total: candidates.candidates.length,
      priorCorpusAliases: candidates.priorCorpusAliasCount,
      platformIdentified: candidates.candidates.filter((item) => item.platformId).length,
      humanOutcomeVerified: candidates.candidates.filter((item) => item.humanVerifiedOutcome !== null).length,
      benchmarkEligible: candidates.candidates.filter((item) => item.formalBenchmarkEligible).length } : null,
    warnings, trainingReadiness: warnings.includes('asset-integrity-not-audited')
      ? 'NEEDS MORE LICENSING / PROVENANCE WORK'
      : availableFamilies.length < 10 || externalProjects.length < 3
      || validationFamilies.length < 2 || testFamilies.length < 2 || assetAudit?.exactDuplicates.length
      || assetAudit?.nearDuplicates.length
      || white !== black || empty !== occupied || Math.max(...occupiedClassCounts) - Math.min(...occupiedClassCounts) > 1
      ? 'NEEDS MORE PIECE-SET DIVERSITY' : 'READY FOR BASELINE TRAINING'
  };
}
