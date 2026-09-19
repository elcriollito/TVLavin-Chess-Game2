import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { analyzeFieldCorpus, createCertificationArtifacts } from './field-certification.mjs';
import { defaultScannerBetaRoot } from './local-store.mjs';

const argument = (name) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const input = resolve(argument('input') || `${defaultScannerBetaRoot()}/feedback-store.json`);
const output = argument('write-dir');
let state;
try { state = JSON.parse(await readFile(input, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; state = { scans: [], feedback: [] }; }

const analysis = analyzeFieldCorpus(state);
if (output) {
  const artifacts = createCertificationArtifacts(state);
  const directory = resolve(output);
  await mkdir(directory, { recursive: false });
  for (const [name, value] of Object.entries(artifacts)) {
    await writeFile(resolve(directory, name), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  }
}
process.stdout.write(`${JSON.stringify({ mode: output ? 'certified-write' : 'exploratory-read-only', input,
  wroteArtifacts: Boolean(output), ...analysis.report }, null, 2)}\n`);
