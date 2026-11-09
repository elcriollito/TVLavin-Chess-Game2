import assert from 'node:assert/strict';
import test from 'node:test';
import handler, { readBytes } from '../api/scanner/public/image.js';

function responseRecorder() {
  return {
    statusCode: 200,
    headers: new Map(),
    payload: null,
    setHeader(name, value) { this.headers.set(name, value); },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; }
  };
}

test('disabled public scanner rejects before reading an image body', async () => {
  const previous = process.env.CAISSA_SCANNER_PUBLIC_STAGE;
  delete process.env.CAISSA_SCANNER_PUBLIC_STAGE;
  let bodyRead = false;
  const request = {
    method: 'PUT',
    headers: { 'content-length': '4' },
    async *[Symbol.asyncIterator]() {
      bodyRead = true;
      yield Buffer.from('test');
    }
  };
  try {
    const response = responseRecorder();
    await handler(request, response);
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.payload, { error: 'PUBLIC_BETA_DISABLED' });
    assert.equal(bodyRead, false);
  } finally {
    if (previous === undefined) delete process.env.CAISSA_SCANNER_PUBLIC_STAGE;
    else process.env.CAISSA_SCANNER_PUBLIC_STAGE = previous;
  }
});

test('declared oversized images fail before stream iteration', async () => {
  let bodyRead = false;
  const request = {
    headers: { 'content-length': '12000001' },
    async *[Symbol.asyncIterator]() {
      bodyRead = true;
      yield Buffer.alloc(1);
    }
  };
  await assert.rejects(readBytes(request, 12_000_000), /IMAGE_SIZE_INVALID/);
  assert.equal(bodyRead, false);
});

test('bounded image reader rejects truncated declared bodies', async () => {
  const request = {
    headers: { 'content-length': '5' },
    async *[Symbol.asyncIterator]() { yield Buffer.from('four'); }
  };
  await assert.rejects(readBytes(request, 12_000_000), /IMAGE_SIZE_INVALID/);
});
