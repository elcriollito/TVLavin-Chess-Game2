import '../../scanner/recognition/scanner-board-geometry.js';

const geometry = globalThis.CaissaScannerBoardGeometry;
const BOARD_EXTENT = 512;
const BOARD_DESTINATION = [[0, 0], [BOARD_EXTENT, 0], [BOARD_EXTENT, BOARD_EXTENT], [0, BOARD_EXTENT]];

function rgba(color) {
  return [color[0], color[1], color[2], color[3] ?? 255];
}

function putPixel(bytes, width, x, y, color) {
  const offset = ((y * width) + x) * 4;
  bytes[offset] = color[0];
  bytes[offset + 1] = color[1];
  bytes[offset + 2] = color[2];
  bytes[offset + 3] = color[3];
}

export function solidImage(width, height, color = [128, 128, 128, 255]) {
  const bytes = new Uint8ClampedArray(width * height * 4);
  const normalized = rgba(color);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) putPixel(bytes, width, x, y, normalized);
  }
  return bytes.buffer;
}

export function renderBoards({
  width = 256,
  height = 256,
  background = [32, 42, 52, 255],
  page = null,
  boards = []
}) {
  const bytes = new Uint8ClampedArray(solidImage(width, height, background));
  if (page) {
    const pageColor = rgba(page.color || [232, 228, 218, 255]);
    for (let y = Math.max(0, page.y); y < Math.min(height, page.y + page.height); y += 1) {
      for (let x = Math.max(0, page.x); x < Math.min(width, page.x + page.width); x += 1) putPixel(bytes, width, x, y, pageColor);
    }
  }
  const prepared = boards.map((board) => ({
    ...board,
    sourceToBoard: geometry.computeHomography(board.corners, BOARD_DESTINATION),
    light: rgba(board.light || [230, 214, 178, 255]),
    dark: rgba(board.dark || [132, 96, 68, 255]),
    grid: rgba(board.grid || [26, 30, 34, 255])
  }));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      for (const board of prepared) {
        let point;
        try {
          point = geometry.transformPoint(board.sourceToBoard, [x + 0.5, y + 0.5]);
        } catch (_) {
          continue;
        }
        const [u, v] = point;
        if (u < 0 || v < 0 || u >= BOARD_EXTENT || v >= BOARD_EXTENT) continue;
        const distanceToGrid = Math.min(
          u % 64,
          64 - (u % 64),
          v % 64,
          64 - (v % 64),
          u,
          v,
          BOARD_EXTENT - u,
          BOARD_EXTENT - v
        );
        const column = Math.min(7, Math.floor(u / 64));
        const row = Math.min(7, Math.floor(v / 64));
        let color = distanceToGrid < (board.gridWidth ?? 4)
          ? board.grid
          : ((row + column) % 2 ? board.dark : board.light);
        if (board.pieces) {
          const localX = (u % 64) - 32;
          const localY = (v % 64) - 32;
          const pieceKey = `${row}:${column}`;
          if (board.pieces.includes(pieceKey) && (localX * localX) + (localY * localY) < 13 * 13) {
            color = (row + column) % 2 ? board.light : board.dark;
          }
        }
        putPixel(bytes, width, x, y, color);
      }
    }
  }
  return bytes.buffer;
}

export function stripedImage(width = 256, height = 256) {
  const bytes = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = Math.floor(x / 12) % 2 ? 220 : 45;
      putPixel(bytes, width, x, y, [value, value, value, 255]);
    }
  }
  return bytes.buffer;
}

export function singleRectangleImage(width = 256, height = 256) {
  const bytes = new Uint8ClampedArray(solidImage(width, height, [65, 72, 78, 255]));
  for (let y = 45; y < height - 45; y += 1) {
    for (let x = 38; x < width - 38; x += 1) {
      const border = x < 43 || x >= width - 43 || y < 50 || y >= height - 50;
      putPixel(bytes, width, x, y, border ? [245, 245, 245, 255] : [128, 128, 128, 255]);
    }
  }
  return bytes.buffer;
}

export function genericGridImage(width = 256, height = 256) {
  const bytes = new Uint8ClampedArray(solidImage(width, height, [236, 236, 236, 255]));
  for (let y = 20; y < height - 20; y += 1) {
    for (let x = 20; x < width - 20; x += 1) {
      const gridLine = ((x - 20) % 27) < 2 || ((y - 20) % 27) < 2;
      putPixel(bytes, width, x, y, gridLine ? [28, 28, 28, 255] : [220, 220, 220, 255]);
    }
  }
  return bytes.buffer;
}

export function createLocalizationFixtures() {
  const pieces = ['0:0', '1:3', '2:5', '3:2', '4:6', '5:1', '6:4', '7:7'];
  return Object.freeze({
    axisAligned: Object.freeze({
      name: 'perfect-axis-aligned-board',
      width: 256,
      height: 256,
      corners: Object.freeze([[32, 32], [224, 32], [224, 224], [32, 224]]),
      pixels: renderBoards({ boards: [{ corners: [[32, 32], [224, 32], [224, 224], [32, 224]], pieces }] })
    }),
    rotated: Object.freeze({
      name: 'rotated-board',
      width: 280,
      height: 280,
      corners: Object.freeze([[75, 25], [255, 78], [202, 258], [22, 205]]),
      pixels: renderBoards({ width: 280, height: 280, boards: [{ corners: [[75, 25], [255, 78], [202, 258], [22, 205]], light: [238, 238, 238], dark: [58, 58, 58] }] })
    }),
    perspective: Object.freeze({
      name: 'perspective-trapezoid',
      width: 300,
      height: 260,
      corners: Object.freeze([[70, 28], [242, 48], [274, 231], [35, 218]]),
      pixels: renderBoards({ width: 300, height: 260, background: [27, 51, 66], boards: [{ corners: [[70, 28], [242, 48], [274, 231], [35, 218]], light: [213, 224, 184], dark: [62, 113, 91], pieces }] })
    }),
    surroundingPage: Object.freeze({
      name: 'board-with-page-background',
      width: 320,
      height: 280,
      corners: Object.freeze([[74, 48], [246, 48], [246, 220], [74, 220]]),
      pixels: renderBoards({
        width: 320,
        height: 280,
        background: [70, 64, 58],
        page: { x: 28, y: 18, width: 264, height: 244, color: [242, 235, 218] },
        boards: [{ corners: [[74, 48], [246, 48], [246, 220], [74, 220]], light: [238, 226, 197], dark: [124, 107, 90] }]
      })
    }),
    lowContrast: Object.freeze({
      name: 'low-contrast-board',
      width: 256,
      height: 256,
      corners: Object.freeze([[29, 35], [226, 31], [221, 229], [34, 224]]),
      pixels: renderBoards({ background: [104, 104, 104], boards: [{ corners: [[29, 35], [226, 31], [221, 229], [34, 224]], light: [157, 157, 157], dark: [130, 130, 130], grid: [112, 112, 112], gridWidth: 1 }] })
    }),
    nonBoard: Object.freeze({
      name: 'plain-non-board',
      width: 256,
      height: 256,
      corners: null,
      pixels: solidImage(256, 256, [128, 138, 148, 255])
    }),
    multipleBoards: Object.freeze({
      name: 'multiple-board-image',
      width: 360,
      height: 220,
      corners: null,
      pixels: renderBoards({
        width: 360,
        height: 220,
        background: [30, 38, 46],
        boards: [
          { corners: [[20, 35], [170, 35], [170, 185], [20, 185]], light: [232, 216, 181], dark: [128, 91, 62] },
          { corners: [[190, 35], [340, 35], [340, 185], [190, 185]], light: [224, 231, 238], dark: [73, 101, 129] }
        ]
      })
    }),
    partialBoard: Object.freeze({
      name: 'partial-cropped-board',
      width: 256,
      height: 256,
      corners: null,
      pixels: renderBoards({ boards: [{ corners: [[-42, 26], [184, 12], [229, 236], [-30, 248]], light: [235, 220, 187], dark: [120, 85, 62] }] })
    }),
    degenerateCorners: Object.freeze([
      [[10, 10], [10, 10], [90, 90], [10, 90]],
      [[10, 10], [90, 90], [90, 10], [10, 90]],
      [[10, 10], [50, 11], [90, 12], [40, 11.5]],
      [[10, 10], [90, 10], [60, 40], [50, 20]]
    ])
  });
}
