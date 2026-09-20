import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defaultScannerBetaRoot } from './local-store.mjs';
import { buildStructuralGuardrailReport } from './structural-report.mjs';

const argument = (name) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const input = resolve(argument('input') || `${defaultScannerBetaRoot()}/feedback-store.json`);
let state;
try { state = JSON.parse(await readFile(input, 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  state = { scans: [], feedback: [], failures: [] };
}
process.stdout.write(`${JSON.stringify({
  generatedAt: new Date().toISOString(),
  ...buildStructuralGuardrailReport(state)
}, null, 2)}\n`);
