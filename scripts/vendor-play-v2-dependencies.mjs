import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const write = process.argv.includes('--write');

const assets = Object.freeze([
  ['assets/vendor/jquery/jquery-3.6.0.min.js', 'https://code.jquery.com/jquery-3.6.0.min.js', 'ff1523fb7389539c84c65aba19260648793bb4f5e29329d2ee8804bc37a3fe6e'],
  ['assets/vendor/chess.js/chess-0.10.3.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js', '7aa430df2b9311849040851adef30c4de49f6c8cefdb80645a4262f1f95c445f'],
  ['assets/vendor/chessboard.js/chessboard-1.0.0.min.js', 'https://cdn.jsdelivr.net/npm/@chrisoakman/chessboardjs@1.0.0/dist/chessboard-1.0.0.min.js', '68d033595ff24f38a50534b0da8fa14a76b8c0f3b3e6b7d2636bfa26c47f6675'],
  ['assets/vendor/font-awesome/css/all-6.4.0.min.css', 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css', '1edb1725a9ea8ca4dcf2f5508cee183218aa1685e47c1b23056717f754f58ebf'],
  ['assets/vendor/font-awesome/webfonts/fa-brands-400.woff2', 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-brands-400.woff2', '748332090c4b8e20f95d0ff59f0be20fa9c889359d3b36d4b886d73376054207'],
  ['assets/vendor/font-awesome/webfonts/fa-brands-400.ttf', 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-brands-400.ttf', '20c4a58bc9d1d69e935d06f1528923646a715be5e218665655cade8f5f1b8c00'],
  ['assets/vendor/font-awesome/webfonts/fa-regular-400.woff2', 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-regular-400.woff2', '8e7e5ea1b15f62ab14dbd41768e8fbcd21cc859a4ea5da812457ee714299fb35'],
  ['assets/vendor/font-awesome/webfonts/fa-regular-400.ttf', 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-regular-400.ttf', '528d022dce6725f8a0811fd91d8e6513445c81ef33353a5c3234eab932551abf'],
  ['assets/vendor/font-awesome/webfonts/fa-solid-900.woff2', 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2', '7152a6933ee3d690ec2af3d09da9d701723d16aa3410a6d80f28ff8866f3b880'],
  ['assets/vendor/font-awesome/webfonts/fa-solid-900.ttf', 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.ttf', '67a65763c7f80903d81603bbeb9049fc2bf28508479b83ed011fe24c71fa950a'],
  ['assets/vendor/font-awesome/webfonts/fa-v4compatibility.woff2', 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-v4compatibility.woff2', '694a17c3d9d6c05f8aac63c544615552a4b220e9a4de863d87341a6bcfc1bc8d'],
  ['assets/vendor/font-awesome/webfonts/fa-v4compatibility.ttf', 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-v4compatibility.ttf', '0515a423f828ce4e6accf92a2ea0b03d19d31cc86d9af0373291e1fd4db5f348'],
  ['assets/vendor/jquery/LICENSE.txt', 'https://raw.githubusercontent.com/jquery/jquery/3.6.0/LICENSE.txt', 'd4db9ebe6f29f5168eac45ad713f055623ac5d0dcd5ba92da23d650ae012020d'],
  ['assets/vendor/chess.js/LICENSE', 'https://raw.githubusercontent.com/jhlywa/chess.js/v0.10.3/LICENSE', 'c09370a8369f5626b396dbb8f77306dd9bbcc48f973977f37067e06de29684ad'],
  ['assets/vendor/chessboard.js/LICENSE.md', 'https://raw.githubusercontent.com/oakmac/chessboardjs/v1.0.0/LICENSE.md', 'd33e835c372360941e425214c06c2063f7058d850b9a0153d5a624c1cab9bf31'],
  ['assets/vendor/font-awesome/LICENSE.txt', 'https://raw.githubusercontent.com/FortAwesome/Font-Awesome/6.4.0/LICENSE.txt', '0aa8f86525273b2efa4f40f4272a188e187704252170e979dc06879adf68d43c'],
]);

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

for (const [path, source, expected] of assets) {
  const target = new URL(path, root);
  if (write) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`VENDOR_FETCH_FAILED: ${response.status} ${source}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (digest(bytes) !== expected) throw new Error(`VENDOR_DIGEST_MISMATCH: ${path}`);
    await mkdir(new URL('./', target), { recursive: true });
    await writeFile(target, bytes);
  }
  const bytes = await readFile(target);
  if (digest(bytes) !== expected) throw new Error(`VENDOR_INTEGRITY_FAILED: ${path}`);
}

console.log(`${write ? 'Vendored and verified' : 'Verified'} ${assets.length} Play v2 dependency assets.`);
