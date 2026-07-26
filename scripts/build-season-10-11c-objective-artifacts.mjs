import fs from 'node:fs';
import path from 'node:path';
import { getPrivateObjectiveArtifact, PRIVATE_OBJECTIVE_ARTIFACT_IDS, PRIVATE_OBJECTIVE_CONTENT_INTEGRITY } from '../js/endgame-trainer/v2/private-objective-artifacts.js';

const outputDirectory = path.resolve('endgame-pools/private/objective-runtime-artifacts');
const check = process.argv.includes('--check');

if (!check) fs.mkdirSync(outputDirectory, { recursive: true });
for (const id of PRIVATE_OBJECTIVE_ARTIFACT_IDS) {
  const artifact = getPrivateObjectiveArtifact(id);
  const integrity = PRIVATE_OBJECTIVE_CONTENT_INTEGRITY[id];
  const output = `${JSON.stringify({ ...artifact, contentFingerprint: integrity.fingerprint, contentDigest: integrity.digest }, null, 2)}\n`;
  const file = path.join(outputDirectory, `${id}.json`);
  if (check) {
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== output) throw new Error(`artifact-out-of-date:${id}`);
  } else {
    fs.writeFileSync(file, output);
  }
}
