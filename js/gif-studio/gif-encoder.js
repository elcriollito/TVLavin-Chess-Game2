/**
 * CAISSA GIF Studio — small, dependency-free, browser-side GIF89a encoder.
 * Bounded frames, RGB332 quantization and 12-bit GIF LZW compression.
 * Runs entirely in memory and never uploads game data.
 */
export const MAX_GIF_DIMENSION = 576;
export const MAX_GIF_FRAMES = 181;

class ByteSink {
  constructor() {
    this.parts = [];
    this.buffer = new Uint8Array(65536);
    this.offset = 0;
  }
  byte(value) {
    if (this.offset === this.buffer.length) this.flush();
    this.buffer[this.offset++] = value & 255;
  }
  word(value) { this.byte(value); this.byte(value >>> 8); }
  bytes(values) { for (const value of values) this.byte(value); }
  ascii(value) { for (const ch of value) this.byte(ch.charCodeAt(0)); }
  flush() {
    if (!this.offset) return;
    this.parts.push(this.buffer.slice(0, this.offset));
    this.offset = 0;
  }
  blob() { this.flush(); return new Blob(this.parts, { type: 'image/gif' }); }
}

function palette332(sink) {
  for (let r = 0; r < 8; r++) {
    for (let g = 0; g < 8; g++) {
      for (let b = 0; b < 4; b++) {
        sink.byte(Math.round(r * 255 / 7));
        sink.byte(Math.round(g * 255 / 7));
        sink.byte(Math.round(b * 255 / 3));
      }
    }
  }
}

export function rgbaToIndices(rgba, width, height) {
  if (!rgba || rgba.length !== width * height * 4) throw new TypeError('Invalid RGBA frame dimensions.');
  const out = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
    const alpha = rgba[i + 3] / 255;
    const r = Math.round(alpha * rgba[i] + (1 - alpha) * 255);
    const g = Math.round(alpha * rgba[i + 1] + (1 - alpha) * 255);
    const b = Math.round(alpha * rgba[i + 2] + (1 - alpha) * 255);
    out[j] = (r & 0xe0) | ((g & 0xe0) >>> 3) | (b >>> 6);
  }
  return out;
}

/** GIF LZW stream: dictionary keys combine prefix code and 8-bit index. */
export function lzwGif(indices) {
  if (!indices?.length) throw new TypeError('A GIF frame cannot be empty.');
  const clear = 256;
  const end = 257;
  let width = 9;
  let nextCode = 258;
  let bitBuffer = 0;
  let bitCount = 0;
  const output = [];
  const dictionary = new Map();
  const write = code => {
    bitBuffer |= code << bitCount;
    bitCount += width;
    while (bitCount >= 8) {
      output.push(bitBuffer & 255);
      bitBuffer >>>= 8;
      bitCount -= 8;
    }
  };
  write(clear);
  let phrase = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const pixel = indices[i];
    const key = phrase * 256 + pixel;
    const known = dictionary.get(key);
    if (known !== undefined) {
      phrase = known;
      continue;
    }
    write(phrase);
    if (nextCode < 4096) {
      dictionary.set(key, nextCode++);
      // The GIF decoder reconstructs this entry after reading the next
      // code. Account for that one-code difference when growing the width.
      if (nextCode > (1 << width) && width < 12) width++;
    } else {
      write(clear);
      dictionary.clear();
      nextCode = 258;
      width = 9;
    }
    phrase = pixel;
  }
  write(phrase);
  write(end);
  if (bitCount) output.push(bitBuffer & 255);
  return Uint8Array.from(output);
}

function writeFrame(sink, rgba, width, height, durationMs) {
  const delay = Math.max(2, Math.min(65535, Math.round(durationMs / 10)));
  // Graphics Control Extension: 0x04 = do not dispose.
  sink.bytes([0x21, 0xf9, 0x04, 0x04]);
  sink.word(delay);
  sink.bytes([0, 0]);
  // Image descriptor: full board, no per-frame palette.
  sink.byte(0x2c);
  sink.word(0);
  sink.word(0);
  sink.word(width);
  sink.word(height);
  sink.byte(0);
  sink.byte(8);
  const compressed = lzwGif(rgbaToIndices(rgba, width, height));
  for (let i = 0; i < compressed.length; i += 255) {
    const chunk = compressed.subarray(i, i + 255);
    sink.byte(chunk.length);
    sink.bytes(chunk);
  }
  sink.byte(0);
}

/**
 * @param {{width:number,height:number,frameCount:number,frameAt:(index:number)=>Uint8ClampedArray|Uint8Array|Promise<Uint8Array>,durationAt?:(index:number)=>number,onProgress?:(completed:number,total:number)=>void,signal?:AbortSignal}} options
 * @returns {Promise<Blob>}
 */
export async function encodeGif(options) {
  const { width, height, frameCount, frameAt, durationAt = () => 850, onProgress = () => {}, signal } = options;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 64 || height < 64 || width > MAX_GIF_DIMENSION || height > MAX_GIF_DIMENSION) {
    throw new RangeError('GIF dimensions are outside the supported 64–576 pixel range.');
  }
  if (!Number.isInteger(frameCount) || frameCount < 1 || frameCount > MAX_GIF_FRAMES) {
    throw new RangeError(`GIF must contain 1–${MAX_GIF_FRAMES} frames.`);
  }
  if (typeof frameAt !== 'function') throw new TypeError('A frame renderer is required.');
  const sink = new ByteSink();
  sink.ascii('GIF89a');
  sink.word(width);
  sink.word(height);
  sink.bytes([0xf7, 0, 0]);
  palette332(sink);
  // Netscape 2.0 application extension: infinite loop.
  sink.bytes([0x21, 0xff, 0x0b]);
  sink.ascii('NETSCAPE2.0');
  sink.bytes([0x03, 0x01, 0, 0, 0]);
  for (let index = 0; index < frameCount; index++) {
    if (signal?.aborted) throw new DOMException('GIF generation cancelled.', 'AbortError');
    const rgba = await frameAt(index);
    const ms = Number(durationAt(index));
    writeFrame(sink, rgba, width, height, Number.isFinite(ms) ? ms : 850);
    onProgress(index + 1, frameCount);
    // Yield regularly to the browser UI; only one RGBA frame is retained.
    if (index % 2 === 1) await new Promise(resolve => setTimeout(resolve, 0));
  }
  sink.byte(0x3b); // GIF trailer
  return sink.blob();
}
