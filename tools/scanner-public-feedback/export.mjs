import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildPublicFeedbackExport } from '../../api/_lib/scanner-public-export.js';

const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const input = option('--input');
const output = option('--output');
const write = args.includes('--write');

if (!input) {
  console.error('Usage: npm run export:scanner:public-feedback -- --input review-export.json [--write --output governed-export.json]');
  process.exitCode = 2;
} else {
  const source = JSON.parse(await readFile(resolve(input), 'utf8'));
  const result = buildPublicFeedbackExport(Array.isArray(source) ? source : source.records);
  const report = { ...result, dryRun: !write, eligibleCount: result.eligible.length, rejectedCount: result.rejected.length };
  if (write) {
    if (!output) throw new Error('--output is required with --write');
    await writeFile(resolve(output), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  }
  console.log(JSON.stringify(report, null, 2));
}
