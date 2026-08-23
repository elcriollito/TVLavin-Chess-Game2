import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { Chess } from '../assets/vendor/chess.js/chess-1.4.0.esm.js';

const root = new URL('../', import.meta.url);
const manifestUrl = new URL('api/_private/pgn/players/manifest.json', root);
const coreUrl = new URL('js/pgn-replayer/pgn-core.js', root);
const parserUrl = new URL('assets/vendor/pgn-parser/pgn-parser-1.4.19.umd.js', root);

function loadRuntime() {
  const context = vm.createContext({ TextEncoder, console });
  vm.runInContext(fs.readFileSync(parserUrl, 'utf8'), context);
  vm.runInContext(fs.readFileSync(coreUrl, 'utf8'), context);
  assert.equal(typeof context.PgnParser?.parse, 'function', 'Vendored PGN parser did not initialize');
  assert.equal(typeof context.CaissaPgnCore?.parseCollection, 'function', 'PGN core did not initialize');
  return { core: context.CaissaPgnCore, parser: context.PgnParser };
}

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function verifyOne(album) {
  const relativePath = album.localPath.replace(/^\/data\/pgn\/players\//, 'api/_private/pgn/players/');
  const fileUrl = new URL(relativePath, root);
  const data = fs.readFileSync(fileUrl);
  assert.equal(data.byteLength, album.bytes, `${album.title}: byte size differs from manifest`);
  assert.equal(sha256(data), album.sha256, `${album.title}: SHA-256 differs from manifest`);

  const { core, parser } = loadRuntime();
  const collection = core.parseCollection(data.toString('utf8'), { parse: parser.parse, Chess });
  assert.ok(collection.games.length > 0, `${album.title}: no playable games`);
  assert.equal(collection.games.length + collection.warnings.length, album.games, `${album.title}: playable and warned games do not account for the manifest`);
  assert.equal(collection.summary.skippedGames, collection.warnings.length, `${album.title}: skipped-game summary mismatch`);
  assert.ok(collection.warnings.length / album.games < 0.1, `${album.title}: ten percent or more of the source archive is not playable`);

  return {
    title: album.title,
    games: collection.games.length,
    warnings: collection.warnings.length,
    nodes: collection.summary.nodes,
    bytes: data.byteLength,
    sha256: album.sha256
  };
}

if (process.argv[2] === '--child') {
  const encoded = process.argv[3];
  assert.ok(encoded, 'Missing encoded album record');
  const album = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  const result = verifyOne(album);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(0);
}

const manifest = JSON.parse(fs.readFileSync(manifestUrl, 'utf8'));
assert.equal(manifest.runtimeDependencyOnSource, false, 'Player archive still declares a runtime source dependency');
assert.equal(manifest.collectionCount, manifest.albums.length, 'Manifest collection count mismatch');

const largeAlbums = manifest.albums.filter(album => Number(album.games) > 2000);
assert.ok(largeAlbums.length > 0, 'Expected at least one album above 2,000 games');

console.log(`Verifying ${largeAlbums.length} archived albums above 2,000 games with the production PGN core...`);

const results = [];
for (const album of largeAlbums) {
  const encoded = Buffer.from(JSON.stringify(album), 'utf8').toString('base64url');
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--child', encoded], {
    cwd: fileURLToPath(root),
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 1024 * 1024
  });

  if (child.error) throw child.error;
  if (child.status !== 0) {
    process.stderr.write(child.stdout || '');
    process.stderr.write(child.stderr || '');
    throw new Error(`${album.title}: verification child exited with status ${child.status}`);
  }

  const line = child.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  const result = JSON.parse(line);
  results.push(result);
  console.log(`PASS ${result.title}: ${result.games.toLocaleString()} playable, ${result.warnings.toLocaleString()} warned, ${result.nodes.toLocaleString()} nodes, ${result.bytes.toLocaleString()} bytes`);
}

const maxGames = Math.max(...results.map(result => result.games));
const maxNodes = Math.max(...results.map(result => result.nodes));
const totalGames = results.reduce((sum, result) => sum + result.games, 0);
const totalWarnings = results.reduce((sum, result) => sum + result.warnings, 0);

console.log(`Verified ${results.length} large albums / ${totalGames.toLocaleString()} playable games / ${totalWarnings.toLocaleString()} source games warned. Largest: ${maxGames.toLocaleString()} playable games; peak normalized nodes: ${maxNodes.toLocaleString()}.`);
