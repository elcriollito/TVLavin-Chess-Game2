import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSafeReleaseId } from './snapshot-contract.js';

const here = dirname(fileURLToPath(import.meta.url));
export const LIBRARY_RELEASES_DIRECTORY = resolve(here, '..', 'releases');

const within = (root, target) => target === root || target.startsWith(`${root}${sep}`);

export async function readSnapshotFiles(releasesDirectory, releaseId) {
    assertSafeReleaseId(releaseId);
    const root = resolve(releasesDirectory);
    const directory = resolve(root, releaseId);
    if (!within(root, directory)) throw new Error('release-path-escape');
    const rootStat = await lstat(directory);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('invalid-release-directory');
    const files = {};
    async function walk(current, prefix = '') {
        for (const item of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
            if (item.isSymbolicLink()) throw new Error(`unexpected-symlink: ${prefix}${item.name}`);
            const relative = prefix ? `${prefix}/${item.name}` : item.name;
            const path = join(current, item.name);
            if (item.isDirectory()) await walk(path, relative);
            else if (item.isFile()) files[relative] = await readFile(path, 'utf8');
            else throw new Error(`unexpected-file-type: ${relative}`);
        }
    }
    await walk(directory);
    return files;
}

export async function writeLibrarySnapshot(options = {}) {
    const snapshot = options.snapshot;
    if (!snapshot?.releaseId || !snapshot?.files) throw new Error('snapshot-required');
    const root = resolve(options.releasesDirectory ?? LIBRARY_RELEASES_DIRECTORY);
    const target = resolve(root, assertSafeReleaseId(snapshot.releaseId));
    if (!within(root, target)) throw new Error('release-path-escape');
    await mkdir(root, { recursive: true });
    try {
        const existing = await readSnapshotFiles(root, snapshot.releaseId);
        const names = [...new Set([...Object.keys(existing), ...Object.keys(snapshot.files)])].sort();
        if (names.some(name => existing[name] !== snapshot.files[name])) throw new Error('immutable-release-conflict');
        return Object.freeze({ releaseId: snapshot.releaseId, created: false });
    } catch (error) {
        if (error?.message === 'immutable-release-conflict') throw error;
        if (error?.code !== 'ENOENT') throw error;
    }
    const temporary = await mkdtemp(join(root, '.snapshot-'));
    try {
        for (const [relative, bytes] of Object.entries(snapshot.files).sort(([a], [b]) => a.localeCompare(b))) {
            const path = resolve(temporary, ...relative.split('/'));
            if (!within(temporary, path)) throw new Error('snapshot-file-path-escape');
            await mkdir(dirname(path), { recursive: true });
            await writeFile(path, bytes, { encoding: 'utf8', flag: 'wx' });
        }
        await rename(temporary, target);
    } catch (error) {
        await rm(temporary, { recursive: true, force: true });
        throw error;
    }
    return Object.freeze({ releaseId: snapshot.releaseId, created: true });
}
