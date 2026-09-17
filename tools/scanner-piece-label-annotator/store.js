import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { emptyManifest, serializeManifest, validateManifest } from './piece-label-core.js';
import { verifySourceImage } from './catalog.js';

export async function readPieceManifest(outputPath, catalog) {
  let bytes;
  try { bytes = await readFile(outputPath); }
  catch (error) {
    if (error.code === 'ENOENT') return emptyManifest(catalog);
    throw error;
  }
  const manifest = JSON.parse(bytes.toString('utf8'));
  return validateManifest(manifest, catalog);
}

export function createPieceStore({ outputPath, catalog }) {
  const destination = resolve(outputPath);
  if (catalog.samples.some((sample) => resolve(sample.sourcePath) === destination)) {
    throw new Error('output-overlaps-source-image');
  }
  for (const corpusRoot of catalog.protectedCorpusRoots || []) {
    const inside = relative(resolve(corpusRoot), destination);
    if (inside === '' || (inside !== '..' && !inside.startsWith(`..${sep}`) && !isAbsolute(inside))) {
      throw new Error('output-inside-immutable-corpus');
    }
  }
  let queue = Promise.resolve();
  const read = () => readPieceManifest(destination, catalog);
  const save = (record) => {
    const work = queue.then(async () => {
      const sample = catalog.samples.find((item) => item.sampleId === record?.sampleId);
      if (!sample) throw new Error('unknown-piece-sample');
      await verifySourceImage(sample);
      const current = await read();
      const samples = current.samples.filter((item) => item.sampleId !== sample.sampleId);
      const next = { ...current, samples: [...samples, record] };
      const text = serializeManifest(next, catalog);
      const folder = dirname(destination);
      await mkdir(folder, { recursive: true });
      if (current.samples.length) {
        const oldBytes = await readFile(destination);
        const oldHash = createHash('sha256').update(oldBytes).digest('hex').toUpperCase();
        const history = join(folder, 'history');
        await mkdir(history, { recursive: true });
        try { await writeFile(join(history, `${basename(destination)}.${oldHash}.json`), oldBytes, { flag: 'wx' }); }
        catch (error) { if (error.code !== 'EEXIST') throw error; }
      }
      const temporary = join(folder, `.${basename(destination)}.${process.pid}.tmp`);
      await writeFile(temporary, text, { flag: 'w' });
      await rename(temporary, destination);
      return next;
    });
    queue = work.catch(() => {});
    return work;
  };
  return { outputPath: destination, read, save };
}
