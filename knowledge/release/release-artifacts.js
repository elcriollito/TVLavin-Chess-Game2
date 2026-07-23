import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { serializeKnowledgeRelease } from './build-release.js';

const here = dirname(fileURLToPath(import.meta.url));
export const GENERATED_DIRECTORY = resolve(here, '..', 'generated');
export const RELEASE_ARTIFACTS = Object.freeze({
    manifest: resolve(GENERATED_DIRECTORY, 'release-manifest.json'),
    graph: resolve(GENERATED_DIRECTORY, 'graph-indexes.json')
});

export async function writeReleaseArtifacts() {
    const expected = serializeKnowledgeRelease();
    await mkdir(GENERATED_DIRECTORY, { recursive: true });
    await Promise.all(Object.entries(RELEASE_ARTIFACTS).map(([name, path]) => writeFile(path, expected[name], 'utf8')));
    return expected;
}

export function staleReleaseArtifacts(actual, expected = serializeKnowledgeRelease()) {
    return Object.keys(expected).filter(name => actual[name] !== expected[name]).sort();
}

export async function checkReleaseArtifacts() {
    const expected = serializeKnowledgeRelease();
    const actual = {};
    for (const [name, path] of Object.entries(RELEASE_ARTIFACTS)) {
        try { actual[name] = await readFile(path, 'utf8'); } catch { actual[name] = null; }
    }
    const stale = staleReleaseArtifacts(actual, expected);
    return Object.freeze({ valid: stale.length === 0, stale: Object.freeze(stale) });
}
