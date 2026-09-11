import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { requireStagingOrigin, stagingDeployArgs } from '../scripts/deploy-staging.mjs';

const config = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const [productionConfig, stagingConfig = ''] = config.split('[env.staging]');

function value(source, key) {
  return source.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, 'm'))?.[1];
}

test('top-level deployment remains the existing production Worker and custom domain only', () => {
  assert.equal(value(productionConfig, 'name'), 'caissa-fics-gateway-poc');
  assert.match(productionConfig, /pattern\s*=\s*"fics-gateway\.caissa-chess\.org"/);
  assert.match(productionConfig, /^workers_dev\s*=\s*false$/m);
  assert.match(productionConfig, /^preview_urls\s*=\s*false$/m);
  assert.equal(value(productionConfig, 'ENVIRONMENT'), 'production');
  assert.equal(value(productionConfig, 'ALLOWED_ORIGINS'), 'https://www.caissa-chess.org');
  assert.doesNotMatch(productionConfig, /localhost|127\.0\.0\.1|vercel\.app|\*\.workers\.dev/);
});

test('deployment commands require an explicit production or staging target', () => {
  assert.equal(packageJson.scripts.deploy, undefined);
  assert.equal(packageJson.scripts['deploy:production'], 'wrangler deploy --env="" --strict');
  assert.equal(packageJson.scripts['deploy:staging'], 'node scripts/deploy-staging.mjs');
});

test('staging is a route-less workers.dev environment that denies origins by default', () => {
  assert.match(stagingConfig, /^workers_dev\s*=\s*true$/m);
  assert.match(stagingConfig, /^preview_urls\s*=\s*false$/m);
  assert.match(stagingConfig, /^routes\s*=\s*\[\]$/m);
  assert.equal(value(stagingConfig, 'ENVIRONMENT'), 'staging');
  assert.equal(value(stagingConfig, 'ALLOWED_ORIGINS'), '');
  assert.doesNotMatch(stagingConfig, /fics-gateway\.caissa-chess\.org|localhost|127\.0\.0\.1/);
});

test('staging deploy requires one exact public HTTPS preview origin', () => {
  assert.equal(requireStagingOrigin('https://fics-rc-preview.vercel.app'), 'https://fics-rc-preview.vercel.app');
  for (const origin of [
    '', '*', 'null', 'http://fics-rc-preview.vercel.app', 'https://fics-rc-preview.vercel.app/path',
    'https://*.vercel.app',
    'https://www.caissa-chess.org', 'http://localhost:3000', 'http://127.0.0.1:3000',
    'http://192.168.1.9:8000', 'https://placeholder.invalid'
  ]) assert.throws(() => requireStagingOrigin(origin), undefined, origin);
});

test('staging deploy passes all bindings explicitly and can be rendered as a dry run', () => {
  const args = stagingDeployArgs('https://fics-rc-preview.vercel.app', { dryRun: true });
  assert.deepEqual(args.slice(0, 6), ['wrangler', 'deploy', '--env', 'staging', '--strict', '--var']);
  assert(args.includes('ALLOWED_ORIGINS:https://fics-rc-preview.vercel.app'));
  for (const key of [
    'ENVIRONMENT', 'FICS_HOST', 'FICS_PORT', 'MAX_MESSAGES_PER_SECOND',
    'MAX_MESSAGE_LENGTH', 'MAX_SESSION_SECONDS', 'IDLE_TIMEOUT_SECONDS', 'ALLOWED_ORIGINS'
  ]) assert(args.some((argument) => argument.startsWith(`${key}:`)), key);
  assert.equal(args.at(-1), '--dry-run');
});
