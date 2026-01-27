/**
 * CAISSA Chess AI - Favicon Generator
 * Generates all required favicon and app icon sizes
 * Uses sharp for image processing
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

// SVG template for chess knight icon
const createSvgIcon = (size, bgColor = '#0b0f1a', iconColor = '#f0d9b5') => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="${bgColor}"/>
  <g transform="translate(15, 10) scale(0.7)">
    <path d="M25,85 L75,85 L75,75 L70,70 L68,55 L72,45 L78,42 L78,35 L70,35 L65,30 L60,25 L55,18 L58,12 L52,8 L45,15 L40,15 L35,20 L30,30 L25,45 L22,55 L22,70 L25,75 Z"
          fill="${iconColor}"
          stroke="${iconColor}"
          stroke-width="2"
          stroke-linejoin="round"/>
    <!-- Eye -->
    <circle cx="48" cy="28" r="3" fill="${bgColor}"/>
    <!-- Nostril -->
    <ellipse cx="35" cy="38" rx="2" ry="1.5" fill="${bgColor}"/>
    <!-- Mane detail -->
    <path d="M55,18 Q60,25 58,35 Q62,30 65,30"
          fill="none"
          stroke="${bgColor}"
          stroke-width="2"
          stroke-linecap="round"/>
  </g>
</svg>`;

// Generate a simple PNG from SVG using pure Node.js approach
// Since we can't use sharp without installing it, we'll create the SVG files
// and provide instructions for conversion

const sizes = [
  { name: 'favicon-16.png', size: 16 },
  { name: 'favicon-32.png', size: 32 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
];

// Create SVG files for each size
console.log('🎨 CAISSA Chess AI - Favicon Generator\n');

// Ensure public directory exists
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Create master SVG
const masterSvg = createSvgIcon(512, '#0b0f1a', '#f0d9b5');
const svgPath = path.join(publicDir, 'icon-master.svg');
fs.writeFileSync(svgPath, masterSvg);
console.log(`✅ Created: public/icon-master.svg`);

// Create size-specific SVGs
sizes.forEach(({ name, size }) => {
  const svg = createSvgIcon(size, '#0b0f1a', '#f0d9b5');
  const svgName = name.replace('.png', '.svg');
  fs.writeFileSync(path.join(publicDir, svgName), svg);
  console.log(`✅ Created: public/${svgName}`);
});

console.log(`
📋 SVG files created. To convert to PNG:

Option 1: Use online converter
  1. Go to https://svgtopng.com/
  2. Upload each SVG file
  3. Download as PNG
  4. Save to public/ folder

Option 2: Use Inkscape (if installed)
  inkscape public/icon-master.svg --export-type=png --export-filename=public/icon-512.png -w 512 -h 512
  inkscape public/icon-master.svg --export-type=png --export-filename=public/icon-192.png -w 192 -h 192
  inkscape public/icon-master.svg --export-type=png --export-filename=public/apple-touch-icon.png -w 180 -h 180
  inkscape public/icon-master.svg --export-type=png --export-filename=public/favicon-32.png -w 32 -h 32
  inkscape public/icon-master.svg --export-type=png --export-filename=public/favicon-16.png -w 16 -h 16

Option 3: Use ImageMagick (if installed)
  magick convert public/icon-master.svg -resize 512x512 public/icon-512.png
  magick convert public/icon-master.svg -resize 192x192 public/icon-192.png
  magick convert public/icon-master.svg -resize 180x180 public/apple-touch-icon.png
  magick convert public/icon-master.svg -resize 32x32 public/favicon-32.png
  magick convert public/icon-master.svg -resize 16x16 public/favicon-16.png
  magick convert public/favicon-16.png public/favicon-32.png public/favicon.ico

Option 4: Use sharp (install first)
  npm install sharp
  Then run: node tools/generate-favicons-sharp.mjs
`);
