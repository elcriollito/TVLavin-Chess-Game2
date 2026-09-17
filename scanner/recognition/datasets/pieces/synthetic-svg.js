import { seededRandom } from './dataset-core.js';

const hexBlend = (a, b, ratio) => {
  const channels = [1, 3, 5].map((offset) => Math.round(parseInt(a.slice(offset, offset + 2), 16) * (1 - ratio)
    + parseInt(b.slice(offset, offset + 2), 16) * ratio));
  return `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
};

const pieceGeometry = {
  P: '<circle cx="64" cy="42" r="14"/><path d="M48 85 Q48 65 55 58 L73 58 Q80 65 80 85 Z"/><path d="M42 87 H86 V98 H42 Z"/>',
  N: '<path d="M39 94 L44 70 L38 61 L49 43 L57 45 L69 25 L75 29 L79 48 L86 58 L76 64 L68 55 L60 61 L78 94 Z"/><circle cx="57" cy="47" r="2.7" fill="__EYE__"/>',
  B: '<path d="M64 22 Q82 42 77 57 L68 72 L60 72 L51 57 Q46 42 64 22 Z"/><path d="M55 63 L73 43" fill="none"/><path d="M47 79 H81 L84 94 H44 Z"/>',
  R: '<path d="M42 31 H50 V39 H57 V31 H71 V39 H78 V31 H86 V51 H42 Z"/><path d="M49 53 H79 L76 85 H52 Z"/><path d="M42 87 H86 V98 H42 Z"/>',
  Q: '<path d="M32 43 L46 58 L52 36 L64 58 L76 36 L82 58 L96 43 L85 86 H43 Z"/><circle cx="32" cy="40" r="4"/><circle cx="52" cy="33" r="4"/><circle cx="76" cy="33" r="4"/><circle cx="96" cy="40" r="4"/><path d="M41 88 H87 V99 H41 Z"/>',
  K: '<path d="M64 22 V53 M52 34 H76" fill="none" stroke-width="6"/><path d="M51 55 Q37 62 46 78 L51 85 H77 L82 78 Q91 62 77 55 Q69 51 64 58 Q59 51 51 55 Z"/><path d="M41 87 H87 V99 H41 Z"/>'
};

export function renderSyntheticSvg(sample, theme, piecePng = null) {
  if (sample.width !== 128 || sample.height !== 128
    || !theme || sample.boardThemeId !== theme.boardThemeId) throw new Error('unavailable or invalid procedural image source');
  if (sample.classLabel !== 'empty' && sample.pieceSetId !== 'caissa-procedural-geometry-v1' && !Buffer.isBuffer(piecePng))
    throw new Error('acquired piece PNG required');
  const random = seededRandom(sample.renderingSeed);
  const base = theme[sample.squareTone];
  if (!/^#[0-9a-f]{6}$/i.test(base)) throw new Error('invalid theme color');
  const faded = sample.augmentationId === 'print-fade';
  const bg = faded ? hexBlend(base, '#eee5cc', 0.35)
    : sample.augmentationId === 'yellowed-paper' ? hexBlend(base, '#e8d9a9', 0.25) : base;
  const isWhite = sample.color === 'white';
  let fill = isWhite ? '#f7f4eb' : '#1a2227';
  let stroke = isWhite ? '#222d31' : '#070b0d';
  if (sample.augmentationId === 'low-contrast') {
    fill = hexBlend(fill, bg, 0.32); stroke = hexBlend(stroke, bg, 0.38);
  }
  const texture = theme.texture === 'hatch'
    ? '<path d="M0 22 L22 0 M0 54 L54 0 M0 86 L86 0 M0 118 L118 0 M22 128 L128 22 M54 128 L128 54 M86 128 L128 86 M118 128 L128 118" stroke="#444" stroke-opacity=".12" stroke-width="1"/>'
    : theme.texture === 'grain' ? Array.from({ length: 5 }, (_, index) => `<path d="M0 ${20 + index * 22} Q64 ${15 + index * 22} 128 ${20 + index * 22}" fill="none" stroke="#4d2819" stroke-opacity=".07"/>`).join('') : '';
  const speckles = Array.from({ length: 12 }, () => `<circle cx="${5 + Math.floor(random() * 118)}" cy="${5 + Math.floor(random() * 118)}" r="${(1.1 + random() * 1.2).toFixed(2)}" fill="#333" fill-opacity=".16"/>`).join('');
  const border = sample.augmentationId === 'highlight' ? '<rect x="2" y="2" width="124" height="124" fill="none" stroke="#e5cb57" stroke-opacity=".55" stroke-width="4"/>' : '';
  const coordinate = sample.augmentationId === 'coordinate' ? '<text x="7" y="119" font-size="13" font-family="sans-serif" fill="#4b4640" fill-opacity=".62">a</text>' : '';
  const arrow = sample.augmentationId === 'arrow' ? '<path d="M-5 116 Q51 90 106 26 M89 27 L107 24 L105 42" fill="none" stroke="#d9a940" stroke-opacity=".38" stroke-width="8"/>' : '';
  const glare = sample.augmentationId === 'glare' ? '<path d="M-20 5 L20 -10 L125 128 L90 145 Z" fill="#fff" fill-opacity=".12"/>' : '';
  const moire = sample.augmentationId === 'screen-moire' ? '<path d="M0 32 H128 M0 64 H128 M0 96 H128" stroke="#fff" stroke-opacity=".08" stroke-width="1"/>' : '';
  const gradient = sample.augmentationId === 'brightness-gradient' ? '<rect width="128" height="128" fill="url(#brightness)"/>' : '';
  const blur = sample.augmentationId === 'soft-blur' ? ' filter="url(#mild-blur)"' : '';
  const rawGlyph = sample.classLabel === 'empty' ? '' : sample.pieceSetId === 'caissa-procedural-geometry-v1'
    ? `<g fill="${fill}" stroke="${stroke}" stroke-width="3" stroke-linejoin="round"${blur}>${pieceGeometry[sample.classLabel.toUpperCase()].replace('__EYE__', isWhite ? '#222d31' : '#f7f4eb')}</g>`
    : `<image x="8" y="8" width="112" height="112" href="data:image/png;base64,${piecePng.toString('base64')}"${blur}${sample.augmentationId === 'low-contrast' ? ' opacity=".75"' : ''}/>`;
  const transform = sample.augmentationId === 'subpixel-scale' ? ' transform="translate(.35 .25) scale(.997)"'
    : sample.augmentationId === 'perspective-residual' ? ' transform="matrix(1 .012 .008 1 -.5 -.5)"' : '';
  const glyph = rawGlyph ? `<g${transform}>${rawGlyph}</g>` : '';
  const content = `<rect width="128" height="128" fill="${bg}"/>${texture}${border}${speckles}${glyph}${coordinate}${arrow}${glare}${moire}${gradient}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><filter id="mild-blur"><feGaussianBlur stdDeviation="0.45"/></filter><filter id="desaturate"><feColorMatrix type="saturate" values="0.15"/></filter><linearGradient id="brightness"><stop stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".08"/></linearGradient></defs>${sample.augmentationId === 'desaturated-print' ? `<g filter="url(#desaturate)">${content}</g>` : content}</svg>\n`;
}

export function validateGeneratedSvg(svg, expectedSha256, sha256) {
  if (typeof svg !== 'string' || !svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"')
    || !svg.includes('<rect width="128" height="128" fill="#')
    || !svg.endsWith('</svg>\n') || /<script|javascript:|href="(?!data:image\/png;base64,)|opacity="0"/.test(svg)
    || sha256(svg) !== expectedSha256) throw new Error('broken, transparent, or changed generated SVG');
}
