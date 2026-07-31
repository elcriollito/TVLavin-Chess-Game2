import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { cleanGeneratedOutputs } from './regression-contracts.mjs';

cleanGeneratedOutputs(process.cwd());
const result = spawnSync(process.execPath, ['--test', 'tests/play/regression-static-guards.test.js'], {
  stdio: 'inherit', env: process.env
});
process.exitCode = result.status ?? 1;
