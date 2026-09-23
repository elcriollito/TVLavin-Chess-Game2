import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
await mkdir(dist, { recursive: true });

await Promise.all([
  build({
    entryPoints: [path.join(root, 'src/lab-app.js')],
    outfile: path.join(dist, 'lab-app.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2022'],
    sourcemap: false
  }),
  build({
    entryPoints: [path.join(root, 'src/lc0-worker.js')],
    outfile: path.join(dist, 'lc0-worker.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2022'],
    sourcemap: false
  })
]);

await Promise.all([
  copyFile(path.join(root, 'src/index.html'), path.join(dist, 'index.html')),
  copyFile(path.join(root, 'src/lab.css'), path.join(dist, 'lab.css')),
  copyFile(path.join(root, 'lab-manifest.json'), path.join(dist, 'lab-manifest.json'))
]);
