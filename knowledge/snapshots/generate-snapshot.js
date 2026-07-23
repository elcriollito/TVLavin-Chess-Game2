import { checkReleaseArtifacts } from '../release/release-artifacts.js';
import { buildLibrarySnapshot } from './build-snapshot.js';
import { writeLibrarySnapshot } from './snapshot-files.js';

const working = await checkReleaseArtifacts();
if (!working.valid) throw new Error(`working-release-artifacts-stale: ${working.stale.join(', ')}`);
const snapshot = buildLibrarySnapshot();
const result = await writeLibrarySnapshot({ snapshot });
console.log(`Knowledge snapshot ${result.created ? 'created' : 'already current'}: ${result.releaseId}`);
