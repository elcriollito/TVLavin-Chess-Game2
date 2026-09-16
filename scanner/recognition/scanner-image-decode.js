(function (global) {
  'use strict';

  const PREPROCESSING_VERSION = 'caissa-scanner-local-decode/1';
  const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
  const MAX_SOURCE_PIXELS = 100_000_000;
  const MAX_SOURCE_EDGE = 32_768;
  const MAX_DECODE_EDGE = 2_048;
  const MAX_DECODE_PIXELS = 4_000_000;
  const MIN_IMAGE_EDGE = 64;
  const SUPPORTED_MIME_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
  const SUPPORTED_MIME_SET = new Set(SUPPORTED_MIME_TYPES);

  class ScannerRecognitionError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'ScannerRecognitionError';
      this.code = code;
    }
  }

  function fail(code, message) {
    throw new ScannerRecognitionError(code, message);
  }

  function normalizeMimeType(type) {
    return String(type || '').trim().toLowerCase();
  }

  function supportsMimeType(type) {
    return SUPPORTED_MIME_SET.has(normalizeMimeType(type));
  }

  function readUint16BE(bytes, offset) {
    return (bytes[offset] << 8) | bytes[offset + 1];
  }

  function readUint16LE(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8);
  }

  function readUint24LE(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
  }

  function ascii(bytes, offset, length) {
    return String.fromCharCode(...bytes.slice(offset, offset + length));
  }

  function inspectPng(bytes) {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (bytes.length < 24 || signature.some((value, index) => bytes[index] !== value)) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20), signatureValid: true };
  }

  function inspectJpeg(bytes) {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    const frameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    let offset = 2;
    while (offset + 3 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
      const marker = bytes[offset];
      offset += 1;
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (marker === 0xda || offset + 1 >= bytes.length) break;
      const segmentLength = readUint16BE(bytes, offset);
      if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
      if (frameMarkers.has(marker) && segmentLength >= 7) {
        return {
          width: readUint16BE(bytes, offset + 5),
          height: readUint16BE(bytes, offset + 3),
          signatureValid: true
        };
      }
      offset += segmentLength;
    }
    return { width: null, height: null, signatureValid: true };
  }

  function inspectWebp(bytes) {
    if (bytes.length < 20 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return null;
    const chunk = ascii(bytes, 12, 4);
    if (chunk === 'VP8X' && bytes.length >= 30) {
      return {
        width: readUint24LE(bytes, 24) + 1,
        height: readUint24LE(bytes, 27) + 1,
        signatureValid: true
      };
    }
    if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
      return {
        width: 1 + (((bytes[22] & 0x3f) << 8) | bytes[21]),
        height: 1 + (((bytes[24] & 0x0f) << 10) | (bytes[23] << 2) | ((bytes[22] & 0xc0) >> 6)),
        signatureValid: true
      };
    }
    if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return {
        width: readUint16LE(bytes, 26) & 0x3fff,
        height: readUint16LE(bytes, 28) & 0x3fff,
        signatureValid: true
      };
    }
    return { width: null, height: null, signatureValid: true };
  }

  function inspectImageHeaderBytes(bytes, mimeType) {
    if (!(bytes instanceof Uint8Array)) fail('decode-failed', 'Image header bytes are unavailable.');
    if (mimeType === 'image/png') return inspectPng(bytes);
    if (mimeType === 'image/jpeg') return inspectJpeg(bytes);
    if (mimeType === 'image/webp') return inspectWebp(bytes);
    return null;
  }

  function validateDimensions(width, height, { allowTiny = false, source = false } = {}) {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
      fail('image-dimensions-invalid', 'Decoded image dimensions are invalid.');
    }
    if (source && (width > MAX_SOURCE_EDGE || height > MAX_SOURCE_EDGE || width * height > MAX_SOURCE_PIXELS)) {
      fail('image-dimensions-invalid', 'Image dimensions exceed the local safety limit.');
    }
    if (!allowTiny && Math.min(width, height) < MIN_IMAGE_EDGE) {
      fail('image-too-small', `Image dimensions must be at least ${MIN_IMAGE_EDGE} pixels on each edge.`);
    }
  }

  function computeWorkingDimensions(sourceWidth, sourceHeight, limits = {}) {
    validateDimensions(sourceWidth, sourceHeight, { source: true });
    const maxEdge = limits.maxEdge || MAX_DECODE_EDGE;
    const maxPixels = limits.maxPixels || MAX_DECODE_PIXELS;
    if (!Number.isSafeInteger(maxEdge) || maxEdge <= 0 || !Number.isSafeInteger(maxPixels) || maxPixels <= 0) {
      fail('image-dimensions-invalid', 'Decode bounds are invalid.');
    }
    const edgeScale = maxEdge / Math.max(sourceWidth, sourceHeight);
    const pixelScale = Math.sqrt(maxPixels / (sourceWidth * sourceHeight));
    const scale = Math.min(1, edgeScale, pixelScale);
    const workingWidth = Math.max(1, Math.min(maxEdge, Math.round(sourceWidth * scale)));
    const workingHeight = Math.max(1, Math.min(maxEdge, Math.round(sourceHeight * scale)));
    validateDimensions(workingWidth, workingHeight);
    if (workingWidth * workingHeight > maxPixels) {
      fail('image-dimensions-invalid', 'Working image dimensions exceed the pixel limit.');
    }
    return Object.freeze({
      sourceWidth,
      sourceHeight,
      workingWidth,
      workingHeight,
      scale,
      resized: scale < 1
    });
  }

  async function inspectBlobHeader(blob, mimeType) {
    const headerBytes = new Uint8Array(await blob.slice(0, Math.min(blob.size, 65_536)).arrayBuffer());
    const header = inspectImageHeaderBytes(headerBytes, mimeType);
    if (!header?.signatureValid) fail('decode-failed', 'Image bytes do not match the declared type.');
    if (header.width !== null && header.height !== null) {
      validateDimensions(header.width, header.height, { allowTiny: true, source: true });
    }
    return header;
  }

  function loadWithImageElement(blob, { ImageClass, urlApi, isCanceled }) {
    return new Promise((resolve, reject) => {
      let objectUrl;
      try {
        objectUrl = urlApi.createObjectURL(blob);
      } catch (_) {
        reject(new ScannerRecognitionError('decode-failed', 'The browser could not open the selected image locally.'));
        return;
      }
      const image = new ImageClass();
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        image.onload = null;
        image.onerror = null;
        image.removeAttribute?.('src');
        urlApi.revokeObjectURL(objectUrl);
      };
      image.onload = () => {
        if (isCanceled()) {
          release();
          reject(new ScannerRecognitionError('canceled', 'Image decode was canceled.'));
          return;
        }
        resolve({
          drawable: image,
          width: image.naturalWidth,
          height: image.naturalHeight,
          orientationHandling: 'browser-image-element-from-image',
          release
        });
      };
      image.onerror = () => {
        release();
        reject(new ScannerRecognitionError('decode-failed', 'The browser could not decode the selected image.'));
      };
      image.decoding = 'async';
      image.src = objectUrl;
    });
  }

  async function decodeDrawable(blob, options) {
    if (typeof options.bitmapFactory === 'function') {
      try {
        const bitmap = await options.bitmapFactory(blob, {
          imageOrientation: 'from-image',
          premultiplyAlpha: 'default',
          colorSpaceConversion: 'default'
        });
        return {
          drawable: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          orientationHandling: 'browser-create-image-bitmap-from-image',
          release: () => bitmap.close?.()
        };
      } catch (_) {
        // Main-thread Image decoding is the compatibility fallback.
      }
    }
    return loadWithImageElement(blob, options);
  }

  async function decodeImageBlob(blob, providedOptions = {}) {
    const now = providedOptions.now || (() => global.performance.now());
    const isCanceled = providedOptions.isCanceled || (() => false);
    const documentRef = providedOptions.documentRef || global.document;
    const urlApi = providedOptions.urlApi || global.URL;
    const ImageClass = providedOptions.ImageClass || global.Image;
    const bitmapFactory = providedOptions.bitmapFactory === undefined
      ? global.createImageBitmap?.bind(global)
      : providedOptions.bitmapFactory;
    const options = { now, isCanceled, documentRef, urlApi, ImageClass, bitmapFactory };
    const startedAt = now();

    if (!blob || typeof blob.arrayBuffer !== 'function' || typeof blob.slice !== 'function') {
      fail('decode-failed', 'A local File or Blob is required.');
    }
    const mimeType = normalizeMimeType(blob.type);
    if (!supportsMimeType(mimeType)) fail('unsupported-image-type', 'This image type is not supported for local decode.');
    if (!Number.isFinite(blob.size) || blob.size <= 0) fail('decode-failed', 'The selected image is empty.');
    if (blob.size > MAX_SOURCE_BYTES) fail('image-dimensions-invalid', 'The selected image exceeds the local byte limit.');
    if (isCanceled()) fail('canceled', 'Image decode was canceled.');

    const encoded = await inspectBlobHeader(blob, mimeType);
    if (isCanceled()) fail('canceled', 'Image decode was canceled.');

    const decodeStartedAt = now();
    let decoded;
    try {
      decoded = await decodeDrawable(blob, options);
    } catch (error) {
      if (error instanceof ScannerRecognitionError) throw error;
      fail('decode-failed', 'The browser could not decode the selected image.');
    }
    const decodedAt = now();
    let canvas;
    try {
      if (isCanceled()) fail('canceled', 'Image decode was canceled.');
      validateDimensions(decoded.width, decoded.height, { source: true });
      const dimensions = computeWorkingDimensions(decoded.width, decoded.height);
      canvas = documentRef.createElement('canvas');
      canvas.width = dimensions.workingWidth;
      canvas.height = dimensions.workingHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) fail('decode-failed', 'The browser could not create a local image canvas.');
      context.imageSmoothingEnabled = true;
      if ('imageSmoothingQuality' in context) context.imageSmoothingQuality = 'high';
      context.drawImage(decoded.drawable, 0, 0, dimensions.workingWidth, dimensions.workingHeight);
      if (isCanceled()) fail('canceled', 'Image decode was canceled.');
      const imageData = context.getImageData(0, 0, dimensions.workingWidth, dimensions.workingHeight);
      const view = imageData.data;
      const pixels = view.byteOffset === 0 && view.byteLength === view.buffer.byteLength
        ? view.buffer
        : view.slice().buffer;
      const completedAt = now();
      return Object.freeze({
        pixels,
        metadata: Object.freeze({
          sourceWidth: decoded.width,
          sourceHeight: decoded.height,
          encodedWidth: encoded.width,
          encodedHeight: encoded.height,
          workingWidth: dimensions.workingWidth,
          workingHeight: dimensions.workingHeight,
          sourceBytes: blob.size,
          mimeType,
          resized: dimensions.resized,
          orientationHandling: decoded.orientationHandling,
          preprocessingVersion: PREPROCESSING_VERSION,
          backend: 'rgba-arraybuffer-worker'
        }),
        timing: Object.freeze({
          decodeMs: Math.max(0, decodedAt - decodeStartedAt),
          resizeMs: Math.max(0, completedAt - decodedAt),
          totalPreprocessMs: Math.max(0, completedAt - startedAt)
        })
      });
    } catch (error) {
      if (error instanceof ScannerRecognitionError) throw error;
      fail('decode-failed', 'The browser could not prepare the selected image locally.');
    } finally {
      decoded?.release?.();
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    }
  }

  global.CaissaScannerImageDecode = Object.freeze({
    PREPROCESSING_VERSION,
    MAX_SOURCE_BYTES,
    MAX_SOURCE_PIXELS,
    MAX_SOURCE_EDGE,
    MAX_DECODE_EDGE,
    MAX_DECODE_PIXELS,
    MIN_IMAGE_EDGE,
    SUPPORTED_MIME_TYPES,
    ScannerRecognitionError,
    supportsMimeType,
    inspectImageHeaderBytes,
    computeWorkingDimensions,
    decodeImageBlob
  });
})(window);
