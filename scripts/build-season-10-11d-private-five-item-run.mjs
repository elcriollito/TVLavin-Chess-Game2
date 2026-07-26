import fs from 'node:fs';
import path from 'node:path';
import { PRIVATE_FIVE_ITEM_RUN_BASE } from '../js/endgame-trainer/v2/private-five-item-run-manifest.js';
import { PRIVATE_FIVE_ITEM_RUN_DESCRIPTOR } from '../js/endgame-trainer/v2/private-five-item-run.js';

const outputPath = path.resolve('endgame-pools/private/endgame-runs/five-item-private-endgame-run@1.0.0.json');
const artifact = {
  ...structuredClone(PRIVATE_FIVE_ITEM_RUN_BASE),
  contentFingerprint: PRIVATE_FIVE_ITEM_RUN_DESCRIPTOR.contentFingerprint,
  contentDigest: PRIVATE_FIVE_ITEM_RUN_DESCRIPTOR.contentDigest,
  canonicalByteLength: PRIVATE_FIVE_ITEM_RUN_DESCRIPTOR.canonicalByteLength
};
const output = `${JSON.stringify(artifact, null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== output)
    throw new Error('private-five-item-run-out-of-date');
} else {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output);
}

export function buildPrivateFiveItemRunArtifact() { return structuredClone(artifact); }
