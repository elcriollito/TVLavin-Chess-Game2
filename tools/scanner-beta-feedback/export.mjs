import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { eligibleForTraining } from '../../scanner/beta/scanner-beta-contract.js';
import { defaultScannerBetaRoot } from './local-store.mjs';

const argument = (name) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const input = resolve(argument('input') || `${defaultScannerBetaRoot()}/feedback-store.json`);
const output = argument('write');
let state;
try { state = JSON.parse(await readFile(input, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; state = { scans: [], feedback: [] }; }
const scans = new Map(state.scans.map((item) => [item.scanId, item]));
const candidates = state.feedback.map((item) => item.feedback).filter(eligibleForTraining).map((feedback) => ({
  feedbackId: feedback.feedbackId,
  scanId: feedback.scanId,
  modelVersion: feedback.modelVersion,
  imageHash: scans.get(feedback.scanId)?.snapshot?.imageHash || null,
  imageStorageReference: scans.get(feedback.scanId)?.imageStorageReference || null,
  originalFEN: feedback.originalFEN,
  correctedFEN: feedback.correctedFEN,
  changedSquares: feedback.changedSquares,
  finalPositionConfirmed: true,
  localizationValid: true,
  trainingStatus: feedback.trainingStatus
}));
const artifact = {
  schemaVersion: 'caissa-scanner-beta-feedback-training-candidates/1',
  corpusVersion: 'caissa-scanner-beta-feedback-training-candidates-v0.1',
  sourceCorpusVersion: 'caissa-scanner-beta-feedback-v0.1',
  generatedAt: new Date().toISOString(),
  dryRun: !output,
  candidateCount: candidates.length,
  imagesEmbedded: false,
  candidates
};
if (output) await writeFile(resolve(output), `${JSON.stringify({ ...artifact, dryRun: false }, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
