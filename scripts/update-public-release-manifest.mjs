import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PUBLIC_RELEASE_MANIFEST_PATH,
  createPublicArtifactManifest,
  renderVercelIgnore,
  trackedPublicFiles
} from './build-public-release.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = trackedPublicFiles({ cwd: repositoryRoot });
const manifest = createPublicArtifactManifest(files, { cwd: repositoryRoot });

await writeFile(
  join(repositoryRoot, PUBLIC_RELEASE_MANIFEST_PATH),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8'
);
await writeFile(join(repositoryRoot, '.vercelignore'), renderVercelIgnore(), 'utf8');

console.log(`Updated ${PUBLIC_RELEASE_MANIFEST_PATH} for ${manifest.files.length} public paths and preserved the repository-root deployment block.`);
