import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256, stableJson } from '../scanner/recognition/datasets/pieces/dataset-core.js';

// One-time metadata projection from the external, byte-preserved v0.3 corpus.
// It never copies pixels or upgrades an unconfirmed platform/outcome identity.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const corpus = resolve(root, '..', 'caissa_scanner_real_localization_corpus_v0_3');
const source = join(corpus, 'manifest-starter-v0.3.json');
const target = join(root, 'scanner/recognition/datasets/pieces/catalog/fresh-evaluation-candidates-v0.1.json');
const sourceBytes = await readFile(source);
const manifest = JSON.parse(sourceBytes);
const positives = manifest.samples.filter((sample) => sample.boardPresent === true);
if (manifest.corpus !== 'scanner-localization-hard-v0.3' || positives.length !== 33)
  throw new Error('unexpected external candidate source');
const candidates = [];
for (const sample of positives) {
  const image = await readFile(join(corpus, sample.originalFile));
  const reference = await readFile(join(corpus, sample.referenceScreenshot));
  if (sha256(image) !== sample.originalSha256 || sha256(reference) !== sample.referenceSha256)
    throw new Error(`${sample.sampleId}: source/reference hash mismatch`);
  candidates.push({ candidateId: sample.sampleId, sourceCorpus: manifest.corpus,
    originalFile: sample.originalFile, originalSha256: sample.originalSha256,
    referenceScreenshot: sample.referenceScreenshot, referenceSha256: sample.referenceSha256,
    priorCorpusSampleId: sample.priorCorpusSampleId || null,
    boardPresentHumanVerified: sample.humanVerifiedBy === 'Alexander',
    platformId: null, platformIdentityEvidence: null, sourceType: null,
    referenceSystem: sample.referenceSystem, referenceOutcome: 'unknown',
    humanVerifiedOutcome: null, pieceSetStyle: null, boardTheme: null,
    role: 'fresh-evaluation-candidate', trainingAllowed: false,
    formalBenchmarkEligible: false,
    remainingCertification: ['platform/source identity mapping', 'human success/failure outcome', '64-square piece truth'] });
}
const result = { schemaVersion: 'caissa-scanner-fresh-evaluation-candidates/1',
  sourceManifestSha256: sha256(sourceBytes), sourceCorpus: manifest.corpus,
  sourceFileCount: candidates.length, priorCorpusAliasCount: candidates.filter((item) => item.priorCorpusSampleId).length,
  identityPolicy: 'platform and reference outcome stay unresolved until sample-ID-matched Alexander evidence exists; no appearance inference',
  benchmarkPolicy: 'evaluation-only candidates; 31-board certified piece benchmark is untouched',
  candidates };
await writeFile(target, stableJson(result), { flag: 'wx' });
process.stdout.write(`${candidates.length} hash-verified evaluation candidates; ${result.priorCorpusAliasCount} prior-corpus aliases; 0 platform identities asserted.\n`);
