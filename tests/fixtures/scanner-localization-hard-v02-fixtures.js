import {
  genericGridImage,
  renderBoards,
  singleRectangleImage,
  solidImage,
  stripedImage
} from './scanner-localization-fixtures.js';

function paint(buffer, width, height, predicate, color) {
  const bytes = new Uint8ClampedArray(buffer);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!predicate(x, y)) continue;
      const offset = ((y * width) + x) * 4;
      bytes.set([...color, 255], offset);
    }
  }
  return bytes.buffer;
}

function checker10() {
  return paint(solidImage(256, 256, [232, 228, 220]), 256, 256,
    (x, y) => x >= 28 && y >= 28 && x < 228 && y < 228 && ((Math.floor((x - 28) / 20) + Math.floor((y - 28) / 20)) % 2 === 1),
    [74, 74, 74]);
}

function panelLayout() {
  return paint(solidImage(320, 256, [246, 246, 246]), 320, 256,
    (x, y) => (x > 15 && x < 305 && (y === 35 || y === 80 || y === 150 || y === 220))
      || (y > 35 && y < 220 && (x === 30 || x === 105 || x === 210 || x === 290)), [38, 48, 58]);
}

function hatchedBoard() {
  const width = 256;
  const height = 256;
  const corners = [[40, 40], [216, 40], [216, 216], [40, 216]];
  const buffer = renderBoards({ width, height, background: [230, 227, 217],
    boards: [{ corners, light: [227, 227, 227], dark: [174, 174, 174], grid: [53, 53, 53], gridWidth: 2 }] });
  return { width, height, corners, pixels: paint(buffer, width, height,
    (x, y) => x >= 40 && x < 216 && y >= 40 && y < 216
      && ((Math.floor((x - 40) / 22) + Math.floor((y - 40) / 22)) % 2 === 1)
      && (x + y) % 9 < 2, [104, 104, 104]) };
}

function highlightedBoard() {
  const width = 256;
  const height = 256;
  const corners = [[32, 32], [224, 32], [224, 224], [32, 224]];
  const buffer = renderBoards({ boards: [{ corners }] });
  return { width, height, corners, pixels: paint(buffer, width, height,
    (x, y) => (x >= 80 && x < 104 && y >= 104 && y < 128)
      || (x >= 152 && x < 176 && y >= 152 && y < 176), [232, 202, 52]) };
}

export function createV02DevelopmentFixtures() {
  const strongCorners = [[78, 26], [246, 56], [286, 244], [28, 226]];
  const frameCorners = [[55, 52], [265, 52], [265, 262], [55, 262]];
  const lowCorners = [[34, 34], [222, 34], [222, 222], [34, 222]];
  const smallCorners = [[131, 73], [251, 73], [251, 193], [131, 193]];
  return Object.freeze([
    { id: 'synthetic-strong-perspective-print', category: 'perspective-print', boardPresent: true,
      width: 320, height: 280, corners: strongCorners,
      pixels: renderBoards({ width: 320, height: 280, background: [242, 240, 233],
        boards: [{ corners: strongCorners, light: [227, 227, 222], dark: [133, 133, 129], grid: [48, 48, 48], gridWidth: 2 }] }) },
    { id: 'synthetic-thick-coordinate-frame', category: 'decorative-frame', boardPresent: true,
      width: 320, height: 320, corners: frameCorners,
      pixels: renderBoards({ width: 320, height: 320, background: [231, 227, 213],
        page: { x: 27, y: 24, width: 266, height: 266, color: [50, 49, 45] },
        boards: [{ corners: frameCorners, light: [236, 223, 190], dark: [125, 97, 69] }] }) },
    { id: 'synthetic-low-contrast-print', category: 'degraded-print', boardPresent: true,
      width: 256, height: 256, corners: lowCorners,
      pixels: renderBoards({ background: [205, 205, 205], boards: [{ corners: lowCorners,
        light: [181, 181, 181], dark: [156, 156, 156], grid: [134, 134, 134], gridWidth: 1 }] }) },
    { id: 'synthetic-hatched-print', category: 'hatched-print', boardPresent: true, ...hatchedBoard() },
    { id: 'synthetic-highlighted-digital', category: 'highlight-overlay', boardPresent: true, ...highlightedBoard() },
    { id: 'synthetic-small-board-page', category: 'small-board-print', boardPresent: true,
      width: 384, height: 300, corners: smallCorners,
      pixels: renderBoards({ width: 384, height: 300, background: [219, 216, 206],
        page: { x: 18, y: 15, width: 348, height: 270, color: [245, 241, 230] },
        boards: [{ corners: smallCorners, light: [233, 233, 233], dark: [103, 103, 103], gridWidth: 2 }] }) },
    { id: 'synthetic-plain', category: 'plain', boardPresent: false,
      width: 256, height: 256, pixels: solidImage(256, 256) },
    { id: 'synthetic-stripes', category: 'stripes', boardPresent: false,
      width: 256, height: 256, pixels: stripedImage() },
    { id: 'synthetic-generic-grid', category: 'generic-grid', boardPresent: false,
      width: 256, height: 256, pixels: genericGridImage() },
    { id: 'synthetic-empty-frame', category: 'decorative-frame', boardPresent: false,
      width: 256, height: 256, pixels: singleRectangleImage() },
    { id: 'synthetic-ten-by-ten-checker', category: 'non-chess-checker', boardPresent: false,
      width: 256, height: 256, pixels: checker10() },
    { id: 'synthetic-web-panel-table', category: 'web-layout', boardPresent: false,
      width: 320, height: 256, pixels: panelLayout() }
  ]);
}
