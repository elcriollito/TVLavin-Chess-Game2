import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { sha256, stableJson } from './dataset-core.js';

export const SYMBOLS = Object.freeze(['wP', 'wN', 'wB', 'wR', 'wQ', 'wK', 'bP', 'bN', 'bB', 'bR', 'bQ', 'bK']);
export function familyChecksum(entry) {
  return sha256(stableJson({ pieceSetId: entry.pieceSetId, sourceVersion: entry.sourceVersion,
    license: entry.license, licenseTextSha256: entry.licenseTextSha256,
    assets: Object.entries(entry.assetChecksums).sort(([a], [b]) => a.localeCompare(b)) }));
}
const maskDistance = (a, b) => a.reduce((sum, value, index) => sum + (value !== b[index] ? 1 : 0), 0) / a.length;
const mean = (items) => items.reduce((sum, value) => sum + value, 0) / items.length;
const rounded = (value) => Number(value.toFixed(4));
const edgeMap = (mask, size) => mask.map((value, index) => {
  const x = index % size, y = Math.floor(index / size);
  return Number((x > 0 && value !== mask[index - 1]) || (y > 0 && value !== mask[index - size]));
});
export function familyDistanceAudit(families, occupancyThreshold = 0.08, edgeThreshold = 0.08) {
  const ids = [...families.keys()].sort(), pairs = [], nearDuplicates = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const first = families.get(ids[i]), second = families.get(ids[j]);
    const occupancyDistance = mean(SYMBOLS.map((symbol) => maskDistance(first[symbol].mask, second[symbol].mask)));
    const edgeDistance = mean(SYMBOLS.map((symbol) => maskDistance(first[symbol].edges, second[symbol].edges)));
    const pair = { first: ids[i], second: ids[j], occupancyDistance: rounded(occupancyDistance),
      edgeDistance: rounded(edgeDistance), structuralSimilarity: rounded(1 - (occupancyDistance + edgeDistance) / 2) };
    pairs.push(pair);
    if (occupancyDistance <= occupancyThreshold && edgeDistance <= edgeThreshold) nearDuplicates.push(pair);
  }
  pairs.sort((a, b) => b.structuralSimilarity - a.structuralSimilarity || a.first.localeCompare(b.first) || a.second.localeCompare(b.second));
  return { comparedFamilies: ids.length, pairCount: pairs.length, closestPairs: pairs.slice(0, 10), nearDuplicates };
}
export function silhouetteNearDuplicates(masks, threshold = 0.08) {
  const nearDuplicates = [];
  const ids = [...masks.keys()].sort();
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const distance = maskDistance(masks.get(ids[i]), masks.get(ids[j]));
    if (distance <= threshold) nearDuplicates.push({ first: ids[i], second: ids[j], silhouetteDistance: Number(distance.toFixed(4)) });
  }
  return nearDuplicates;
}
export async function verifyAssetCatalog(catalog, repoRoot) {
  const entries = catalog.pieceSets.filter((entry) => entry.sourceType === 'open-source-asset');
  const originalHashes = new Map(), normalizedHashes = new Map(), structures = new Map();
  const exactDuplicates = [];
  const sameFamilyColorShapePairs = [];
  for (const entry of entries) {
    if (entry.familyChecksum !== familyChecksum(entry)) throw new Error(`${entry.pieceSetId}: family checksum mismatch`);
    const licenseBytes = await readFile(join(repoRoot, entry.licenseTextPath));
    const noticeBytes = await readFile(join(repoRoot, entry.sourceNoticePath));
    if (sha256(licenseBytes) !== entry.licenseTextSha256 || sha256(noticeBytes) !== entry.sourceNoticeSha256)
      throw new Error(`${entry.pieceSetId}: license text/notice mismatch`);
    if (SYMBOLS.some((symbol) => !entry.assetChecksums[symbol]) || Object.keys(entry.assetChecksums).length !== 12)
      throw new Error(`${entry.pieceSetId}: incomplete 12-class assets`);
    const structure = {};
    for (const symbol of SYMBOLS) {
      const meta = entry.assetChecksums[symbol];
      const svg = await readFile(join(repoRoot, entry.assetPath, 'original', `${symbol}.svg`));
      const png = await readFile(join(repoRoot, entry.assetPath, 'normalized', `${symbol}.png`));
      if (sha256(svg) !== meta.sourceSha256 || sha256(png) !== meta.normalizedSha256)
        throw new Error(`${entry.pieceSetId}/${symbol}: asset checksum mismatch`);
      const image = await sharp(png).metadata();
      if (image.width !== 112 || image.height !== 112 || !image.hasAlpha || image.format !== 'png')
        throw new Error(`${entry.pieceSetId}/${symbol}: normalized asset format mismatch`);
      for (const [map, digest, format] of [[originalHashes, meta.sourceSha256, 'svg'], [normalizedHashes, meta.normalizedSha256, 'png']]) {
        const previous = map.get(digest);
        if (previous && previous.split('/')[0] !== entry.pieceSetId) exactDuplicates.push({ format, first: previous, second: `${entry.pieceSetId}/${symbol}` });
        map.set(digest, `${entry.pieceSetId}/${symbol}`);
      }
      const { data } = await sharp(png).resize(32, 32).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const mask = [];
      for (let i = 3; i < data.length; i += 4) mask.push(Number(data[i] > 32));
      structure[symbol] = { mask, edges: edgeMap(mask, 32) };
    }
    structures.set(entry.pieceSetId, structure);
    for (const type of 'PNBRQK') {
      const distance = maskDistance(structure[`w${type}`].mask, structure[`b${type}`].mask);
      if (distance <= 0.02) sameFamilyColorShapePairs.push({ family: entry.pieceSetId, pieceType: type,
        occupancyDistance: rounded(distance) });
    }
  }
  const structural = familyDistanceAudit(structures);
  const nearDuplicates = structural.nearDuplicates;
  return { acquiredFamilies: entries.length, originalAssets: entries.length * 12,
    normalizedAssets: entries.length * 12, uniqueOriginalHashes: originalHashes.size,
    uniqueNormalizedHashes: normalizedHashes.size, exactDuplicates, nearDuplicates,
    sameFamilyColorShapePairs, structural,
    silhouetteAudit: 'twelve 32x32 alpha occupancy and edge masks per acquired family; mean Hamming thresholds <=0.08 for both (screening only); procedural family has no asset mask' };
}
