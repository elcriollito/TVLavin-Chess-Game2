import sharp from 'sharp';

function point(corners, u, v) {
  const top = [
    corners[0][0] + ((corners[1][0] - corners[0][0]) * u),
    corners[0][1] + ((corners[1][1] - corners[0][1]) * u)
  ];
  const bottom = [
    corners[3][0] + ((corners[2][0] - corners[3][0]) * u),
    corners[3][1] + ((corners[2][1] - corners[3][1]) * u)
  ];
  return [top[0] + ((bottom[0] - top[0]) * v), top[1] + ((bottom[1] - top[1]) * v)];
}

function polygon(points) {
  return points.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' ');
}

function boardMarkup(corners, light, dark) {
  const squares = [];
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const u0 = col / 8;
      const v0 = row / 8;
      const u1 = (col + 1) / 8;
      const v1 = (row + 1) / 8;
      squares.push(`<polygon points="${polygon([
        point(corners, u0, v0),
        point(corners, u1, v0),
        point(corners, u1, v1),
        point(corners, u0, v1)
      ])}" fill="${(row + col) % 2 ? dark : light}"/>`);
    }
  }
  return `${squares.join('')}<polygon points="${polygon(corners)}" fill="none" stroke="#07131d" stroke-width="4"/>`;
}

export async function createBoardPng({
  width = 256,
  height = 256,
  background = '#102638',
  boards = [{ corners: [[30, 30], [226, 30], [226, 226], [30, 226]], light: '#ead9b7', dark: '#966d4d' }]
} = {}) {
  const markup = boards.map((board) => boardMarkup(board.corners, board.light, board.dark)).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${background}"/>${markup}</svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

export const scannerBoardImage = Object.freeze({
  name: 'scanner-axis-board.png',
  mimeType: 'image/png',
  buffer: await createBoardPng()
});

export const scannerPerspectiveBoardImage = Object.freeze({
  name: 'scanner-perspective-board.png',
  mimeType: 'image/png',
  buffer: await createBoardPng({
    width: 300,
    height: 260,
    boards: [{ corners: [[70, 28], [242, 48], [274, 231], [35, 218]], light: '#d1dfb9', dark: '#3e715b' }]
  })
});

export const scannerMultipleBoardImage = Object.freeze({
  name: 'scanner-multiple-board.png',
  mimeType: 'image/png',
  buffer: await createBoardPng({
    width: 360,
    height: 220,
    boards: [
      { corners: [[20, 35], [170, 35], [170, 185], [20, 185]], light: '#ead8b5', dark: '#805b3e' },
      { corners: [[190, 35], [340, 35], [340, 185], [190, 185]], light: '#e0e7ee', dark: '#496581' }
    ]
  })
});

export const scannerPlainImage = Object.freeze({
  name: 'scanner-no-board.png',
  mimeType: 'image/png',
  buffer: await sharp({
    create: { width: 256, height: 256, channels: 4, background: { r: 123, g: 135, b: 147, alpha: 1 } }
  }).png().toBuffer()
});
