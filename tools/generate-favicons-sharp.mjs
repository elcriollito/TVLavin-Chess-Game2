/**
 * CAISSA Chess AI - Favicon Generator (with Sharp)
 * Generates all required favicon and app icon sizes from SVG
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

// SVG template for chess knight icon - improved design
const createSvgIcon = (size, bgColor = '#0b0f1a', iconColor = '#f0d9b5') => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="${bgColor}"/>
  <g transform="translate(15, 8) scale(0.7)">
    <path d="M25,90 L75,90 L75,80 L70,75 L68,58 L72,48 L78,45 L78,38 L70,38 L65,33 L60,28 L55,20 L58,14 L52,10 L45,18 L40,18 L35,23 L30,33 L25,48 L22,58 L22,75 L25,80 Z"
          fill="${iconColor}"
          stroke="${iconColor}"
          stroke-width="1.5"
          stroke-linejoin="round"/>
    <!-- Eye -->
    <circle cx="48" cy="30" r="3.5" fill="${bgColor}"/>
    <!-- Nostril -->
    <ellipse cx="35" cy="42" rx="2.5" ry="2" fill="${bgColor}"/>
    <!-- Mane detail lines -->
    <path d="M55,20 Q62,28 58,40"
          fill="none"
          stroke="${bgColor}"
          stroke-width="2"
          stroke-linecap="round"/>
    <path d="M50,22 Q56,30 52,42"
          fill="none"
          stroke="${bgColor}"
          stroke-width="1.5"
          stroke-linecap="round"/>
  </g>
</svg>`;

const sizes = [
  { name: 'favicon-16.png', size: 16 },
  { name: 'favicon-32.png', size: 32 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
];

async function generateFavicons() {
  console.log('🎨 CAISSA Chess AI - Favicon Generator\n');
  console.log('Theme: Dark background (#0b0f1a) with gold knight (#f0d9b5)\n');

  // Ensure public directory exists
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // Generate PNG icons from SVG
  for (const { name, size } of sizes) {
    const svg = Buffer.from(createSvgIcon(size, '#0b0f1a', '#f0d9b5'));
    const outputPath = path.join(publicDir, name);

    await sharp(svg)
      .resize(size, size)
      .png()
      .toFile(outputPath);

    console.log(`✅ Created: public/${name} (${size}×${size})`);
  }

  // Generate favicon.ico (multi-size ICO file)
  // Sharp doesn't support ICO directly, so we'll create a 32x32 PNG and rename it
  // For proper ICO support, we create the 32x32 version which is most commonly used
  const ico32 = await sharp(Buffer.from(createSvgIcon(32, '#0b0f1a', '#f0d9b5')))
    .resize(32, 32)
    .png()
    .toBuffer();

  // Create a simple ICO file with 32x32 PNG
  // ICO format: header + directory entry + PNG data
  const icoPath = path.join(publicDir, 'favicon.ico');

  // For simplicity, just copy the 32x32 PNG as favicon.ico
  // Modern browsers support PNG favicons, and this will work
  fs.copyFileSync(path.join(publicDir, 'favicon-32.png'), icoPath);
  console.log(`✅ Created: public/favicon.ico (32×32 PNG as ICO)`);

  // Also save the master SVG for reference
  const masterSvg = createSvgIcon(512, '#0b0f1a', '#f0d9b5');
  fs.writeFileSync(path.join(publicDir, 'icon-master.svg'), masterSvg);
  console.log(`✅ Created: public/icon-master.svg (source)`);

  console.log(`
✨ All favicon files generated successfully!

Files created in public/:
  - favicon.ico (32×32)
  - favicon-16.png (16×16)
  - favicon-32.png (32×32)
  - apple-touch-icon.png (180×180)
  - icon-192.png (192×192)
  - icon-512.png (512×512)
  - icon-master.svg (source)

Next steps:
  1. Verify index.html has correct <link> tags
  2. Verify manifest.json has correct icon paths
  3. Commit and push to deploy
  4. Test: open /favicon.ico, /icon-512.png, etc.
`);
}

generateFavicons().catch(console.error);
