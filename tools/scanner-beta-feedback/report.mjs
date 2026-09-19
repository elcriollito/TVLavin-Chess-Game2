import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { aggregateFeedback } from '../../scanner/beta/scanner-beta-contract.js';
import { defaultScannerBetaRoot } from './local-store.mjs';

const argument = (name) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const input = resolve(argument('input') || `${defaultScannerBetaRoot()}/feedback-store.json`);
let state;
try { state = JSON.parse(await readFile(input, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; state = { feedback: [] }; }
const records = [
  ...(state.feedback || []).map((item) => item.feedback),
  ...(state.failures || []).map((item) => item.failure)
];
process.stdout.write(`${JSON.stringify({ generatedAt: new Date().toISOString(), sourceImagesIncluded: false,
  ...aggregateFeedback(records) }, null, 2)}\n`);
