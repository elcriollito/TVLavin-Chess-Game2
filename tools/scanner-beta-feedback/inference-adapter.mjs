import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./infer-v05.py', import.meta.url));

function pythonExecutable(env) {
  if (env.CAISSA_SCANNER_BETA_PYTHON) return env.CAISSA_SCANNER_BETA_PYTHON;
  const known = resolve(process.cwd(), '..', 'caissa', '_scanner', '_ml_env_v0_5', 'Scripts', 'python.exe');
  return known;
}

export async function inferFrozenV05(input, { env = process.env, timeoutMs = 30_000 } = {}) {
  const python = pythonExecutable(env);
  await access(python);
  return new Promise((resolveResult, reject) => {
    const child = spawn(python, [script], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const output = [], errors = [];
    let size = 0;
    const timer = setTimeout(() => { child.kill(); reject(new Error('INFERENCE_TIMEOUT')); }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size > 2_000_000) { child.kill(); reject(new Error('INFERENCE_RESPONSE_TOO_LARGE')); }
      else output.push(chunk);
    });
    child.stderr.on('data', (chunk) => { if (errors.reduce((sum, item) => sum + item.length, 0) < 4096) errors.push(chunk); });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => {
      clearTimeout(timer);
      let result;
      try { result = JSON.parse(Buffer.concat(output).toString('utf8')); }
      catch (_) { reject(new Error('INFERENCE_RESPONSE_INVALID')); return; }
      if (code !== 0 || result.error) reject(new Error(result.error || 'INFERENCE_FAILED'));
      else resolveResult(result);
    });
    child.stdin.end(JSON.stringify(input));
  });
}
