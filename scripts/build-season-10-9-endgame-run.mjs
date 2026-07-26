import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeCompatibilityFingerprint } from '../js/endgame-trainer/v2/curated-pool-validator.js';
import { sha256 } from './endgame-remote-tablebase.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'public/data/endgame-runs/endgame-run-technical-two-item/1.0.0.json');

export function buildRunArtifact() {
  const base = {
    runSchemaVersion: '1.0.0',
    runId: 'endgame-run-technical-two-item',
    runVersion: '1.0.0',
    label: 'Endgame Run',
    trustLabel: 'Local technical session',
    itemCount: 2,
    orderPolicy: 'fixed',
    items: [
      { itemId: 'kp-coordinate-support-promote', itemVersion: '1.0.0', objectiveId: 'promote', objectiveVersion: '1.0.0' },
      { itemId: 'rule-square-a-pawn-catch-stop-promotion', itemVersion: '1.0.0', objectiveId: 'stop-promotion', objectiveVersion: '1.0.0' }
    ],
    localOnly: true,
    persistence: 'none',
    summaryContract: {
      counts: ['independent-success','hint-assisted-success','objective-failure','objective-miss-while-drawing','technical-unavailable'],
      perItemResults: true,
      permanentScore: false
    },
    retryContract: { retryItem: true, retryRun: true, reloadRequired: false },
    technicalUnavailableContract: { retryItem: true, skipTechnicalItem: true, learnerPenalty: false },
    exitContract: { destination: '/endgame-trainer?trainerV2=1', outcome: 'abandoned', clearsSession: true },
    copy: {
      ready: 'Two verified technical objectives in a fixed local session.',
      continue: 'Continue to the next verified objective.',
      complete: 'Run complete',
      unavailable: 'The run could not be verified. This is not learner failure.'
    }
  };
  return {
    ...base,
    contentFingerprint: computeCompatibilityFingerprint(base).replace('epool-', 'erun-'),
    contentDigest: sha256(base)
  };
}

export async function writeRunArtifact() {
  const artifact = buildRunArtifact();
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(artifact)}\n`);
  return artifact;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const artifact = await writeRunArtifact();
  console.log(`${artifact.runId}@${artifact.runVersion} ${artifact.contentFingerprint} ${artifact.contentDigest}`);
}
