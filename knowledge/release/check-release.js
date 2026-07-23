import { checkReleaseArtifacts } from './release-artifacts.js';

const result = await checkReleaseArtifacts();
if (!result.valid) {
    console.error(`Knowledge release artifacts are stale: ${result.stale.join(', ')}`);
    process.exitCode = 1;
} else {
    console.log('Knowledge release artifacts are current.');
}
