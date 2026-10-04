import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { getKnownPgnCollection } from '../js/game-library/pgn-collection-registry.js';

const collectionId = process.argv[2] || 'capablanca-complete';
const collection = getKnownPgnCollection(collectionId);
if (!collection) throw new Error(`Collection is not allowlisted: ${collectionId}`);

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reviewAssetPaths = Object.freeze({
  'capablanca-complete': 'public/data/pgn/capablanca-games-1901-1941.pgn'
});
const relativeAsset = reviewAssetPaths[collection.id];
if (!relativeAsset) throw new Error(`No review asset is registered for: ${collection.id}`);
const assetPath = path.resolve(repositoryRoot, relativeAsset);
if (!assetPath.startsWith(`${repositoryRoot}${path.sep}`)) throw new Error('Resolved asset escaped the repository');

const bytes = fs.readFileSync(assetPath);
const text = bytes.toString('utf8');
const games = text.trim().split(/\n\n(?=\[Event )/);
const parsed = games.map((pgn, index) => {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const headers = chess.header();
  return { index: index + 1, headers, plies: chess.history().length };
});
const checksum = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;

if (games.length !== collection.gamesCount) throw new Error(`Expected ${collection.gamesCount} games, found ${games.length}`);
if (collection.checksum && checksum !== collection.checksum) throw new Error(`Checksum mismatch: ${checksum}`);

console.log(JSON.stringify({ collectionId, assetPath, games: parsed.length, checksum, malformedGames: 0 }, null, 2));
