import { buildLibrarySnapshot } from './build-snapshot.js';
import { LIBRARY_RELEASES_DIRECTORY, readSnapshotFiles } from './snapshot-files.js';

const expected = buildLibrarySnapshot();
const actual = await readSnapshotFiles(LIBRARY_RELEASES_DIRECTORY, expected.releaseId);
const names = [...new Set([...Object.keys(expected.files), ...Object.keys(actual)])].sort();
const stale = names.filter(name => expected.files[name] !== actual[name]);
if (stale.length) {
    console.error(`Knowledge snapshot is not reproducible: ${stale.join(', ')}`);
    process.exitCode = 1;
} else {
    console.log(`Knowledge snapshot reproducible: ${expected.releaseId}`);
}
