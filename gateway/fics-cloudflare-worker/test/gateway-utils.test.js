import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRateLimiter,
  exactWebOrigin,
  isAllowedOrigin,
  isExpectedCloseError,
  parseAllowedOrigins,
  positiveInteger
} from '../src/gateway-utils.js';

const production = parseAllowedOrigins('https://www.caissa-chess.org');
const staging = parseAllowedOrigins('https://fics-rc-preview.example.test');

test('production accepts the exact approved CAISSA origin', () => {
  assert.equal(isAllowedOrigin('https://www.caissa-chess.org', production), true);
});

test('production rejects localhost origins', () => {
  for (const origin of ['http://localhost:3000', 'http://localhost:8000', 'https://localhost']) {
    assert.equal(isAllowedOrigin(origin, production), false, origin);
  }
});

test('production rejects loopback origins', () => {
  for (const origin of ['http://127.0.0.1:3000', 'http://127.0.0.1:8000']) {
    assert.equal(isAllowedOrigin(origin, production), false, origin);
  }
});

test('production rejects private LAN origins', () => {
  for (const origin of ['http://192.168.1.20:8000', 'http://10.0.0.5:3000', 'http://172.16.0.2']) {
    assert.equal(isAllowedOrigin(origin, production), false, origin);
  }
});

test('production rejects arbitrary HTTPS origins', () => {
  assert.equal(isAllowedOrigin('https://evil.example', production), false);
});

test('production rejects CAISSA lookalike and apex origins', () => {
  for (const origin of [
    'https://www.caissa-chess.org.evil.example',
    'https://caissa-chess.org',
    'https://api.caissa-chess.org'
  ]) assert.equal(isAllowedOrigin(origin, production), false, origin);
});

test('production rejects arbitrary Vercel preview origins', () => {
  assert.equal(isAllowedOrigin('https://random-preview.vercel.app', production), false);
});

test('origin policy rejects missing origins', () => {
  for (const origin of [null, undefined, '']) assert.equal(isAllowedOrigin(origin, production), false);
});

test('origin policy rejects malformed or non-origin values', () => {
  for (const origin of [
    'not-an-origin',
    'wss://www.caissa-chess.org',
    'https://www.caissa-chess.org/path',
    'https://user@www.caissa-chess.org',
    'https://www.caissa-chess.org/'
  ]) assert.equal(isAllowedOrigin(origin, production), false, origin);
});

test('wildcard and null semantics cannot enter an allowlist', () => {
  assert.deepEqual(parseAllowedOrigins('*,null,not-an-origin,https://*.vercel.app'), []);
  assert.equal(exactWebOrigin('*'), null);
  assert.equal(isAllowedOrigin('*', ['*']), false);
  assert.equal(isAllowedOrigin('null', ['null']), false);
});

test('staging accepts only its configured exact preview origin', () => {
  assert.equal(isAllowedOrigin('https://fics-rc-preview.example.test', staging), true);
  assert.equal(isAllowedOrigin('https://other-preview.example.test', staging), false);
  assert.equal(isAllowedOrigin('https://www.caissa-chess.org', staging), false);
});

test('allowlist parsing trims, validates, and deduplicates exact origins', () => {
  assert.deepEqual(
    parseAllowedOrigins(' https://www.caissa-chess.org,invalid,https://www.caissa-chess.org '),
    ['https://www.caissa-chess.org']
  );
});

test('rate limiter rejects messages over the fixed window limit', () => {
  const limiter = createRateLimiter(2, 1000);
  assert.equal(limiter.allow(0), true);
  assert.equal(limiter.allow(10), true);
  assert.equal(limiter.allow(20), false);
  assert.equal(limiter.allow(1000), true);
});

test('positiveInteger uses safe fallbacks', () => {
  assert.equal(positiveInteger('5000', 80), 5000);
  assert.equal(positiveInteger('-1', 80), 80);
  assert.equal(positiveInteger('invalid', 80), 80);
});

test('recognizes expected transport close errors', () => {
  assert.equal(isExpectedCloseError(new Error('Network connection lost.')), true);
  assert.equal(isExpectedCloseError(new Error('Connection reset by peer')), true);
  assert.equal(isExpectedCloseError(new Error('Permission denied')), false);
});
