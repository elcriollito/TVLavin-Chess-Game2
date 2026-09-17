import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateManifest as validatePieceTruth } from '../../../../tools/scanner-piece-label-annotator/piece-label-core.js';
import { certifyVerifiedRealEligibility } from '../../benchmark/historical-classifier-eligibility.js';
import { classifyV03Sample, V03_CORPUS_SHA256 } from '../../benchmark/localization-v03-split.js';
import { labelParts, sha256, EXCLUDED_SAMPLE_ID } from './dataset-core.js';

const squareName = (index) => `${String.fromCharCode(97 + index % 8)}${8 - Math.floor(index / 8)}`;

export async function loadVerifiedRealEvaluation({ truthPath, corpusV01, corpusV03, repoRoot }) {
  const truthBytes = await readFile(truthPath);
  const truth = JSON.parse(truthBytes);
  const v01Index = JSON.parse(await readFile(join(repoRoot, 'scanner/recognition/benchmark/manifests/scanner-localization-hard-v0.1.json')));
  const v01Bytes = await readFile(join(corpusV01, v01Index.annotationManifest.file));
  const v01StarterBytes = await readFile(join(corpusV01, v01Index.sourceManifest.file));
  const v03Bytes = await readFile(join(corpusV03, 'localization-hard-v0.3.annotated.json'));
  const v03StarterBytes = await readFile(join(corpusV03, 'manifest-starter-v0.3.json'));
  if (sha256(v01Bytes) !== v01Index.annotationManifest.sha256
    || sha256(v01StarterBytes) !== v01Index.sourceManifest.sha256
    || sha256(v03Bytes) !== V03_CORPUS_SHA256.annotated
    || sha256(v03StarterBytes) !== V03_CORPUS_SHA256.starter) throw new Error('certified corpus manifest changed');
  const v01Sha = sha256(v01Bytes), v03Sha = sha256(v03Bytes);
  if (v01Sha !== truth.corpusIdentity?.v01CornerManifestSha256
    || v03Sha !== truth.corpusIdentity?.v03CornerManifestSha256) throw new Error('truth/corner corpus identity mismatch');
  const v01 = JSON.parse(v01Bytes), v03 = JSON.parse(v03Bytes);
  const aliasCount = v03.samples.filter((sample) => sample.priorCorpusSampleId).length;
  if (aliasCount !== 14) throw new Error('expected 14 exact-byte alias references');
  const entries = [];
  for (const sample of v01.samples) {
    const category = v01Index.samples.find((item) => item.sampleId === sample.sampleId)?.categoryGroup;
    if (category === '3d-board') continue;
    entries.push({ sampleId: sample.sampleId, sourceSha256: sample.originalSha256,
      sourceFilename: sample.originalFile.split('/').at(-1), cornerManifestSha256: v01Sha,
      sourceCategory: category || 'unknown', difficultyTags: sample.difficultyTags || [],
      sourceReference: `v0.1/${sample.originalFile}`, sourcePath: join(corpusV01, ...sample.originalFile.split('/')) });
  }
  for (const sample of v03.samples) {
    if (!sample.boardPresent || sample.priorCorpusSampleId) continue;
    const category = classifyV03Sample(sample.sampleId).category;
    entries.push({ sampleId: sample.sampleId, sourceSha256: sample.originalSha256,
      sourceFilename: sample.originalFile.split('/').at(-1), cornerManifestSha256: v03Sha,
      sourceCategory: category, difficultyTags: sample.difficultyTags || [],
      sourceReference: `v0.3/${sample.originalFile}`, sourcePath: join(corpusV03, ...sample.originalFile.split('/')) });
  }
  validatePieceTruth(truth, { v01CornerManifestSha256: v01Sha, v03CornerManifestSha256: v03Sha, samples: entries });
  const eligibility = certifyVerifiedRealEligibility(entries, truth);
  const byId = new Map(truth.samples.map((record) => [record.sampleId, record]));
  const sourceHashes = new Set();
  for (const entry of entries) {
    if (sourceHashes.has(entry.sourceSha256)) throw new Error('exact-byte alias in real evaluation');
    sourceHashes.add(entry.sourceSha256);
    if (sha256(await readFile(entry.sourcePath)) !== entry.sourceSha256) throw new Error(`${entry.sampleId}: source image changed`);
  }
  const tiles = [];
  for (const entry of entries.filter((item) => item.sampleId !== EXCLUDED_SAMPLE_ID)) {
    const record = byId.get(entry.sampleId);
    if (record.annotation.status !== 'verified' || record.labels.length !== 64) throw new Error('unverified real truth entered evaluation');
    record.labels.forEach((classLabel, index) => {
      const square = squareName(index), target = labelParts(classLabel);
      const hardCaseTags = [
        ...(['bishop', 'knight', 'queen'].includes(target.pieceType) ? ['bishop-knight-queen-type'] : []),
        ...(target.pieceType === 'king' ? ['king-color'] : []),
        ...(classLabel === 'K' && square === 'e1' ? ['white-king-e1-candidate-unconfirmed'] : []),
        ...(entry.difficultyTags.some((tag) => /low-contrast|degraded|fading|old-newspaper/.test(tag)) ? ['low-contrast-source'] : []),
        ...(/print/.test(entry.sourceCategory) ? ['printed-source'] : []),
        ...(entry.sourceCategory === 'livestream' ? ['broadcast-source'] : [])
      ];
      tiles.push({
        sampleId: `real-${entry.sampleId}-${square}`, classLabel, ...target,
        pieceSetId: 'unknown-real-family', pieceFamilyGroup: 'unknown-real-piece-family',
        boardThemeId: 'unknown-real-theme', boardThemeFamily: 'unknown-real-board-theme',
        sourceType: 'user-provided-internal-evaluation', sourceFamilyGroup: 'unattributed-real-source-family',
        sourceImageId: entry.sampleId,
        sourceImageSha256: entry.sourceSha256, sourceReference: entry.sourceReference,
        cornerManifestSha256: entry.cornerManifestSha256, squareName: square,
        orientation: record.boardOrientation, sourceCategory: entry.sourceCategory,
        difficultyTags: entry.difficultyTags, sourcePlatform: record.sourcePlatform || null,
        augmentationId: 'none', augmentationFamily: entry.sampleId, hardCaseTags,
        split: 'test', trainingRole: 'EVALUATION-ONLY',
        license: 'Alexander-provided private internal evaluation; training/redistribution not authorized',
        imageFile: null
      });
    });
  }
  if (tiles.length !== 1984 || eligibility.scoredBoards !== 31) throw new Error('real evaluation count mismatch');
  return { tiles, truthManifestSha256: sha256(truthBytes),
    excludedEdgeCase: eligibility.excluded, aliasCount, sourceBoardCount: 31 };
}
