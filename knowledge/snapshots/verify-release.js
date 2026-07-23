import { buildLibrarySnapshot } from './build-snapshot.js';
import { LIBRARY_RELEASES_DIRECTORY } from './snapshot-files.js';
import { verifyLibrarySnapshot } from './verify-snapshot.js';

const releaseId = process.argv[2] ?? buildLibrarySnapshot().releaseId;
const result = await verifyLibrarySnapshot({ releasesDirectory: LIBRARY_RELEASES_DIRECTORY, releaseId });
if (!result.valid) {
    for (const item of result.errors) console.error(`${item.code} ${item.path}: ${item.message}`);
    process.exitCode = 1;
} else {
    console.log(`Knowledge snapshot verified: ${releaseId}`);
}
