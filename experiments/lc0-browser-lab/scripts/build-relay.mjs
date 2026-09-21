import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const lab = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engine = path.resolve(lab, '../lc0-preview-relay/engine');
await Promise.all([
  build({ entryPoints: [path.join(engine, 'client-source.js')],
    outfile: path.join(engine, 'client.js'), bundle: true, format: 'esm',
    platform: 'browser', target: ['es2022'], legalComments: 'none' }),
  build({ entryPoints: [path.join(lab, 'src/lc0-worker.js')],
    outfile: path.join(engine, 'lc0-worker.js'), bundle: true, format: 'esm',
    platform: 'browser', target: ['es2022'], legalComments: 'none' })
]);
