import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { exactWebOrigin } from '../src/gateway-utils.js';

const PRODUCTION_ORIGIN = 'https://www.caissa-chess.org';
const FIXED_STAGING_VARS = Object.freeze({
  ENVIRONMENT: 'staging',
  FICS_HOST: 'freechess.org',
  FICS_PORT: '5000',
  MAX_MESSAGES_PER_SECOND: '10',
  MAX_MESSAGE_LENGTH: '4096',
  MAX_SESSION_SECONDS: '7200',
  IDLE_TIMEOUT_SECONDS: '600'
});

function isPrivateIpv4(hostname) {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return false;
  }
  return octets[0] === 10
    || octets[0] === 127
    || (octets[0] === 169 && octets[1] === 254)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168);
}

export function requireStagingOrigin(value) {
  const origin = exactWebOrigin(value);
  if (!origin || !origin.startsWith('https://')) {
    throw new Error('CAISSA_FICS_STAGING_ORIGIN must be one exact HTTPS origin.');
  }
  const hostname = new URL(origin).hostname.toLowerCase();
  if (origin === PRODUCTION_ORIGIN || hostname === 'localhost' || hostname.endsWith('.localhost')
      || hostname.endsWith('.invalid') || isPrivateIpv4(hostname)) {
    throw new Error('CAISSA_FICS_STAGING_ORIGIN must be an isolated public preview origin, not production or local/LAN.');
  }
  return origin;
}

export function stagingDeployArgs(origin, { dryRun = false } = {}) {
  const allowedOrigin = requireStagingOrigin(origin);
  const variables = { ...FIXED_STAGING_VARS, ALLOWED_ORIGINS: allowedOrigin };
  const args = ['wrangler', 'deploy', '--env', 'staging', '--strict'];
  for (const [key, value] of Object.entries(variables)) args.push('--var', `${key}:${value}`);
  if (dryRun) args.push('--dry-run');
  return args;
}

export function runStagingDeploy({ env = process.env, argv = process.argv.slice(2) } = {}) {
  const args = stagingDeployArgs(env.CAISSA_FICS_STAGING_ORIGIN, { dryRun: argv.includes('--dry-run') });
  if (!env.npm_execpath) throw new Error('Run this guard through npm run deploy:staging.');
  const result = spawnSync(process.execPath, [env.npm_execpath, 'exec', '--', ...args], {
    stdio: 'inherit', shell: false, env
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = runStagingDeploy();
  } catch (error) {
    console.error(`[staging deploy blocked] ${error.message}`);
    process.exitCode = 1;
  }
}
