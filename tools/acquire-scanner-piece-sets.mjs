import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { sha256, stableJson } from '../scanner/recognition/datasets/pieces/dataset-core.js';

// Pinned upstream snapshots. Never fetch moving branches for dataset inputs.
const LILA_COMMIT = '60acb9d51787f60fd4504b614d83114857010ed1';
const SPDX_COMMIT = '31ba1a50e5397e00a304dbadc76531740e89ee48';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = join(root, 'scanner/recognition/datasets/piece-sets');
const catalogPath = join(base, 'catalog-v1.json');
const specs = [
  { name: 'chessnut', author: 'Alexis Luengas', license: 'Apache-2.0', style: 'classic', split: 'train' },
  { name: 'rhosgfx', author: 'RhosGFX', license: 'CC0-1.0', style: 'stylized', split: 'test' },
  { name: 'fantasy', author: 'Maurizio Monge', license: 'MIT', style: 'high-detail', split: 'train' },
  { name: 'spatial', author: 'Maurizio Monge', license: 'MIT', style: 'geometric', split: 'train' },
  { name: 'celtic', author: 'Maurizio Monge', license: 'MIT', style: 'ornamental', split: 'validation' },
  { name: 'kiwen-suwi', author: 'neverRare', license: 'CC-BY-4.0', style: 'minimalist', split: 'train' },
  { name: 'firi', author: 'James Faure', license: 'CC-BY-4.0', style: 'blocky', split: 'train' }
];
const symbols = ['wP', 'wN', 'wB', 'wR', 'wQ', 'wK', 'bP', 'bN', 'bB', 'bR', 'bQ', 'bK'];
const rawLila = (path) => `https://raw.githubusercontent.com/lichess-org/lila/${LILA_COMMIT}/${path}`;
const rawSpdx = (id) => `https://raw.githubusercontent.com/spdx/license-list-data/${SPDX_COMMIT}/text/${id}.txt`;
async function download(url) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) { lastError = error; }
  }
  throw lastError;
}
function familyChecksum(entry) {
  return sha256(stableJson({ pieceSetId: entry.pieceSetId, sourceVersion: entry.sourceVersion,
    license: entry.license, licenseTextSha256: entry.licenseTextSha256,
    assets: Object.entries(entry.assetChecksums).sort(([a], [b]) => a.localeCompare(b)) }));
}
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
if (catalog.pieceSets.some((set) => set.pieceSetId === 'lichess-chessnut')) throw new Error('assets already acquired; this tool never overwrites');
const copying = await download(rawLila('COPYING.md'));
const notice = copying.toString('utf8');
for (const spec of specs) {
  const noticeName = spec.name === 'firi' ? 'Firi' : spec.name;
  if (!notice.split('\n').some((line) => line.includes(`public/piece/${noticeName} `)
    && line.includes(spec.author) && line.includes(spec.license.replaceAll('-', ' ')
      .replace('CC BY 4.0', 'CC BY 4.0').replace('CC0 1.0', 'CC0 1.0')))) {
    // Lichess spells Apache/MIT as ordinary words and the license ID differs from display text.
    const display = { 'Apache-2.0': 'Apache 2.0', 'CC0-1.0': 'CC0 1.0', MIT: 'MIT', 'CC-BY-4.0': 'CC BY 4.0' }[spec.license];
    if (!notice.split('\n').some((line) => line.includes(`public/piece/${noticeName} `)
      && line.includes(spec.author) && line.includes(display))) throw new Error(`uncertified notice: ${spec.name}`);
  }
}
const licenses = {};
for (const id of [...new Set(specs.map((spec) => spec.license))]) {
  const bytes = await download(rawSpdx(id));
  if (bytes.length < 100 || !bytes.toString('utf8').includes('Copyright') && id === 'MIT') throw new Error(`invalid license text: ${id}`);
  licenses[id] = { bytes, sha256: sha256(bytes), url: rawSpdx(id) };
}
const acquired = [];
for (const spec of specs) {
  const pieceSetId = `lichess-${spec.name}`;
  const originals = {}, normalized = {}, meta = {};
  for (const symbol of symbols) {
    const bytes = await download(rawLila(`public/piece/${spec.name}/${symbol}.svg`));
    const xml = bytes.toString('utf8');
    if (!/^\s*<svg\b/.test(xml) || /<script\b|javascript:|(?:xlink:)?href=["']https?:/i.test(xml)) throw new Error(`unsafe/non-SVG source: ${pieceSetId}/${symbol}`);
    const info = await sharp(bytes, { density: 144 }).metadata();
    if (info.format !== 'svg' || !info.width || !info.height) throw new Error(`undecodable SVG: ${pieceSetId}/${symbol}`);
    const png = await sharp(bytes, { density: 144 }).resize(112, 112, { fit: 'contain', background: '#00000000' })
      .ensureAlpha().png().toBuffer();
    const normalizedInfo = await sharp(png).metadata();
    if (normalizedInfo.width !== 112 || normalizedInfo.height !== 112 || !normalizedInfo.hasAlpha) throw new Error(`bad normalization: ${pieceSetId}/${symbol}`);
    originals[symbol] = bytes;
    normalized[symbol] = png;
    meta[symbol] = { sourceSha256: sha256(bytes), normalizedSha256: sha256(png), originalFormat: 'svg',
      normalizedFormat: 'png', intrinsicWidth: info.width, intrinsicHeight: info.height,
      viewBox: xml.match(/\bviewBox="([^"]+)"/)?.[1] || null, alpha: normalizedInfo.hasAlpha };
  }
  const entry = { pieceSetId, datasetSplit: spec.split, displayName: `Lichess ${spec.name}`, sourceType: 'open-source-asset',
    sourceProject: 'lichess-org/lila', sourceUrl: `https://github.com/lichess-org/lila/tree/${LILA_COMMIT}/public/piece/${spec.name}`,
    sourceVersion: LILA_COMMIT, sourceReference: `public/piece/${spec.name}`, author: spec.author,
    license: spec.license, licenseUrl: licenses[spec.license].url,
    licenseTextPath: `scanner/recognition/datasets/piece-sets/licenses/${spec.license}.txt`,
    licenseTextSha256: licenses[spec.license].sha256,
    sourceNoticePath: 'scanner/recognition/datasets/piece-sets/licenses/lichess-COPYING.md',
    sourceNoticeSha256: sha256(copying), trainingAllowed: true, redistributionAllowed: true,
    attributionRequired: spec.license !== 'CC0-1.0', evaluationOnly: false,
    trainingRole: 'TRAINING-ELIGIBLE', assetStatus: 'available', platformFamily: 'Lichess',
    pieceFamilyGroup: pieceSetId, style: spec.style,
    assetPath: `scanner/recognition/datasets/piece-sets/assets/${pieceSetId}`,
    assetChecksums: Object.fromEntries(symbols.map((symbol) => [symbol, meta[symbol]])),
    pieceAvailability: ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'],
    colorVariants: ['white', 'black'], colorPolicy: 'separate upstream white/black artwork; never synthesized',
    notes: spec.name === 'firi' ? 'COPYING.md spells Firi with uppercase F; source directory is lowercase firi at pinned commit.'
      : 'Original SVGs retained unchanged; 112x112 transparent PNGs are deterministic Sharp normalizations for 128x128 tile composition.' };
  entry.familyChecksum = familyChecksum(entry);
  acquired.push({ entry, originals, normalized });
}
// Only after every network fetch and decode succeeds do we create files. No existing target is overwritten.
await mkdir(join(base, 'licenses'), { recursive: true });
await writeFile(join(base, 'licenses/lichess-COPYING.md'), copying, { flag: 'wx' });
for (const [id, license] of Object.entries(licenses)) await writeFile(join(base, `licenses/${id}.txt`), license.bytes, { flag: 'wx' });
for (const { entry, originals, normalized } of acquired) {
  for (const directory of ['original', 'normalized']) await mkdir(join(base, 'assets', entry.pieceSetId, directory), { recursive: true });
  for (const symbol of symbols) {
    await writeFile(join(base, 'assets', entry.pieceSetId, 'original', `${symbol}.svg`), originals[symbol], { flag: 'wx' });
    await writeFile(join(base, 'assets', entry.pieceSetId, 'normalized', `${symbol}.png`), normalized[symbol], { flag: 'wx' });
  }
}
catalog.pieceSets = catalog.pieceSets.filter((set) => !['lichess-chessnut-pending', 'lichess-rhosgfx-pending'].includes(set.pieceSetId));
catalog.pieceSets.push(...acquired.map(({ entry }) => entry));
await writeFile(join(base, 'catalog-v0.2-acquired.json'), stableJson(catalog), { flag: 'wx' });
process.stdout.write(`${acquired.length} pinned complete families staged in catalog-v0.2-acquired.json; replace catalog-v1.json after review.\n`);
