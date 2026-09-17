import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { sha256, stableJson } from '../scanner/recognition/datasets/pieces/dataset-core.js';
import { familyChecksum, SYMBOLS } from '../scanner/recognition/datasets/pieces/asset-integrity.js';

// Pinned source trees and author-issued rights notices. This acquisition is intentionally one-shot.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = join(root, 'scanner/recognition/datasets/piece-sets');
const catalog = JSON.parse(await readFile(join(base, 'catalog-v1.json')));
const specs = [
  { id: 'livius', name: 'Livius', project: 'kmar/chess_svg_piece_sets',
    commit: 'af40ea51e87eddee1ae7ee35ae312893a1271233', author: 'Martin Sedlák',
    license: 'Public-Domain-Dedication', style: 'monochrome', split: 'validation',
    sourceDir: 'livius', notice: 'README.md', licenseFile: 'livius/LICENSE',
    file: (symbol) => `livius/${symbol[0]}${symbol[1].toLowerCase()}.svg`,
    rightsCheck: (notice, license) => /livius - original design/i.test(notice)
      && /Martin Sedlák/.test(notice) && /commercial ones/.test(notice)
      && /public domain/.test(license) && /any purpose/.test(license),
    notes: 'Original author-designated monochrome print-like set; unlike Meridian, not copied from the 1952 newspaper.' },
  { id: 'p4wn-svg', name: 'P4wn SVG', project: 'douglasbagnall/p4wn',
    commit: 'fcdda9f5d7ae34bbbacc4caacdc78507b6a20394', author: 'Oliver Merkel',
    license: 'CC0-1.0', style: 'mobile', split: 'test', platformFamily: 'mobile/web games',
    sourceDir: 'src/images', notice: 'README.rst', licenseFile: null,
    file: (symbol) => `src/images/${symbol[0] === 'w' ? 'white' : 'black'}_${{
      P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king'
    }[symbol[1]]}.svg`,
    rightsCheck: (notice) => /New SVG.*chess set has been created from scratch under CC0_/s.test(notice)
      && /Oliver Merkel/.test(notice) && /You can copy, modify, distribute and perform the work, even for\s+commercial purposes/.test(notice),
    notes: 'Mobile/offline web chess SVG set. The README names Oliver Merkel among CC0 contributors; upstream SVG addition is attributed to him.' },
  { id: 'kosal', name: 'Kosal', project: 'philatype/kosal',
    commit: 'fea676adb94de83e19834a2160b9f19ab94fd104', author: 'philatype',
    license: 'CC-BY-4.0', style: 'minimalist', split: 'train',
    sourceDir: '.', notice: 'README.md', licenseFile: 'LICENSE.txt',
    file: (symbol) => `${symbol[0] === 'w' ? 'white' : 'black'}_${{
      P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king'
    }[symbol[1]]}.svg`,
    rightsCheck: (notice, license) => /minimalist and contemporary/.test(notice)
      && /Creative Commons Attribution 4.0/.test(notice) && /produce, reproduce, and Share Adapted Material/.test(license),
    notes: 'Contemporary flat web/mobile artwork; CC BY attribution to philatype is required.' }
];
if (specs.some((spec) => catalog.pieceSets.some((set) => set.pieceSetId === spec.id)))
  throw new Error('one or more families already acquired; refusing overwrite');

async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
const acquired = [];
for (const spec of specs) {
  const raw = (path) => `https://raw.githubusercontent.com/${spec.project}/${spec.commit}/${path}`;
  const notice = await download(raw(spec.notice));
  const license = spec.licenseFile ? await download(raw(spec.licenseFile))
    : await readFile(join(base, 'licenses/CC0-1.0.txt'));
  if (!spec.rightsCheck(notice.toString('utf8'), license.toString('utf8')))
    throw new Error(`${spec.id}: upstream rights notice does not match pinned expectation`);
  const originals = {}, normalized = {}, meta = {};
  for (const symbol of SYMBOLS) {
    const svg = await download(raw(spec.file(symbol)));
    const xml = svg.toString('utf8');
    if (!/<svg\b/i.test(xml) || /<script\b|javascript:|(?:xlink:)?href=["']https?:/i.test(xml))
      throw new Error(`${spec.id}/${symbol}: unsafe or missing SVG`);
    const info = await sharp(svg, { density: 144 }).metadata();
    if (info.format !== 'svg' || !info.width || !info.height) throw new Error(`${spec.id}/${symbol}: invalid SVG`);
    const png = await sharp(svg, { density: 144 }).resize(112, 112, { fit: 'contain', background: '#00000000' })
      .ensureAlpha().png().toBuffer();
    const pngInfo = await sharp(png).metadata();
    if (pngInfo.width !== 112 || pngInfo.height !== 112 || !pngInfo.hasAlpha)
      throw new Error(`${spec.id}/${symbol}: invalid normalization`);
    originals[symbol] = svg; normalized[symbol] = png;
    meta[symbol] = { sourceSha256: sha256(svg), normalizedSha256: sha256(png), originalFormat: 'svg',
      normalizedFormat: 'png', intrinsicWidth: info.width, intrinsicHeight: info.height,
      viewBox: xml.match(/\bviewBox="([^"]+)"/)?.[1] || null, alpha: true };
  }
  const ownLicense = spec.licenseFile !== null;
  const licenseTextPath = ownLicense ? `scanner/recognition/datasets/piece-sets/licenses/${spec.id}-LICENSE.txt`
    : 'scanner/recognition/datasets/piece-sets/licenses/CC0-1.0.txt';
  const entry = { pieceSetId: spec.id, datasetSplit: spec.split, displayName: spec.name,
    sourceType: 'open-source-asset', sourceProject: spec.project,
    sourceUrl: `https://github.com/${spec.project}/tree/${spec.commit}/${spec.sourceDir}`,
    sourceVersion: spec.commit, sourceReference: spec.sourceDir, author: spec.author,
    license: spec.license, licenseUrl: spec.licenseFile ? raw(spec.licenseFile)
      : 'https://creativecommons.org/publicdomain/zero/1.0/',
    licenseTextPath, licenseTextSha256: sha256(license),
    sourceNoticePath: `scanner/recognition/datasets/piece-sets/licenses/${spec.id}-NOTICE.${spec.notice.split('.').at(-1)}`,
    sourceNoticeSha256: sha256(notice), trainingAllowed: true, redistributionAllowed: true,
    attributionRequired: spec.license === 'CC-BY-4.0', evaluationOnly: false,
    trainingRole: 'TRAINING-ELIGIBLE', assetStatus: 'available', platformFamily: spec.platformFamily || 'none',
    pieceFamilyGroup: spec.id, style: spec.style,
    assetPath: `scanner/recognition/datasets/piece-sets/assets/${spec.id}`,
    assetChecksums: Object.fromEntries(SYMBOLS.map((symbol) => [symbol, meta[symbol]])),
    pieceAvailability: ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'],
    colorVariants: ['white', 'black'], colorPolicy: 'separate upstream white/black artwork; never synthesized',
    notes: `${spec.notes} Original SVG bytes retained; normalized to 112x112 transparent PNG.` };
  entry.familyChecksum = familyChecksum(entry);
  acquired.push({ spec, entry, notice, license, originals, normalized, ownLicense });
}

// All remote data is staged in memory and checked before any file is created.
for (const item of acquired) {
  const { spec, entry, notice, license, originals, normalized, ownLicense } = item;
  if (ownLicense) await writeFile(join(root, entry.licenseTextPath), license, { flag: 'wx' });
  await writeFile(join(root, entry.sourceNoticePath), notice, { flag: 'wx' });
  for (const directory of ['original', 'normalized']) await mkdir(join(root, entry.assetPath, directory), { recursive: true });
  for (const symbol of SYMBOLS) {
    await writeFile(join(root, entry.assetPath, 'original', `${symbol}.svg`), originals[symbol], { flag: 'wx' });
    await writeFile(join(root, entry.assetPath, 'normalized', `${symbol}.png`), normalized[symbol], { flag: 'wx' });
  }
  process.stdout.write(`${spec.id}: ${entry.familyChecksum}\n`);
}
catalog.pieceSets.push(...acquired.map(({ entry }) => entry));
await writeFile(join(base, 'catalog-v0.3-acquired.json'), stableJson(catalog), { flag: 'wx' });
process.stdout.write('Pinned acquired catalog staged; review before replacing catalog-v1.json.\n');
