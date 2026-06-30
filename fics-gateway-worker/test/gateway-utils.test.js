import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRateLimiter,
  isAllowedOrigin,
  isExpectedCloseError,
  parseAllowedOrigins,
  positiveInteger
} from '../src/gateway-utils.js';

test('parses and validates exact allowed origins', () => {
  const origins = parseAllowedOrigins('https://www.caissa-chess.org, http://localhost:8000');
  assert.equal(isAllowedOrigin('https://www.caissa-chess.org', origins), true);
  assert.equal(isAllowedOrigin('http://localhost:8000', origins), true);
  assert.equal(isAllowedOrigin('https://evil.example', origins), false);
  assert.equal(isAllowedOrigin(null, origins), false);
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
