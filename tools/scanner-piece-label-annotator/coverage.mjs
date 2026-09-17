import { coverageReport } from './piece-label-core.js';
import { DEFAULT_OUTPUT, loadPieceCatalog } from './catalog.js';
import { readPieceManifest } from './store.js';

const argument = (name, fallback) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const catalog = await loadPieceCatalog({ corpusV01: argument('corpus-v01', undefined),
  corpusV03: argument('corpus-v03', undefined) });
const outputPath = argument('output', DEFAULT_OUTPUT);
const manifest = await readPieceManifest(outputPath, catalog);
const report = coverageReport(catalog, manifest);
process.stdout.write(`${JSON.stringify({ ...report, outputManifest: outputPath }, null, 2)}\n`);
