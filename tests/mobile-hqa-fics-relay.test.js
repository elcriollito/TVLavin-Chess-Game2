import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { once } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import {
  attachMobileHqaFicsRelay,
  CANONICAL_FICS_ORIGIN,
  injectMobileHqaFicsRelayMarker,
  MOBILE_HQA_FICS_RELAY_PATH
} from '../scripts/mobile-hqa-fics-relay.mjs';

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}

async function closeServer(server) {
  if (!server.listening) return;
  server.close();
  await once(server, 'close');
}

test('HQA document marker is explicit, scoped, and idempotent', () => {
  const html = '<!doctype html><head><meta charset="utf-8"><title>FICS</title></head>';
  assert.equal(injectMobileHqaFicsRelayMarker(html, false), html);
  const injected = injectMobileHqaFicsRelayMarker(html, true);
  assert.match(injected, new RegExp(`name="caissa-fics-hqa-relay" content="${MOBILE_HQA_FICS_RELAY_PATH}"`));
  assert.equal(injectMobileHqaFicsRelayMarker(injected, true), injected);
});

test('LAN-safe relay preserves the canonical raw-text Guest negotiation', { timeout: 10_000 }, async (t) => {
  const upstreamHttp = http.createServer();
  const upstreamWss = new WebSocketServer({ server: upstreamHttp, path: '/ws' });
  const upstreamPort = await listen(upstreamHttp);
  const observed = { origin: '', frames: [] };

  upstreamWss.on('connection', (socket, request) => {
    observed.origin = request.headers.origin || '';
    socket.send('FICS banner\r\nlogin: ');
    socket.on('message', (data) => {
      const command = data.toString('utf8');
      observed.frames.push(command);
      if (command === 'guest') socket.send('Press return to enter the server');
      if (command === '') socket.send('Starting FICS session as GuestHQA\r\nfics% ');
    });
  });

  const relayHttp = http.createServer((_request, response) => {
    response.writeHead(404);
    response.end();
  });
  const relay = attachMobileHqaFicsRelay(relayHttp, {
    enabled: true,
    upstreamUrl: `ws://127.0.0.1:${upstreamPort}/ws`
  });
  const relayPort = await listen(relayHttp);

  t.after(async () => {
    for (const client of relay.websocketServer.clients) client.terminate();
    for (const client of upstreamWss.clients) client.terminate();
    await closeServer(relayHttp);
    await closeServer(upstreamHttp);
  });

  const transcript = await new Promise((resolve, reject) => {
    const frames = [];
    const socket = new WebSocket(`ws://127.0.0.1:${relayPort}${MOBILE_HQA_FICS_RELAY_PATH}`, {
      origin: `http://127.0.0.1:${relayPort}`
    });
    const timer = setTimeout(() => reject(new Error('Guest negotiation timed out')), 5000);
    socket.on('message', (data) => {
      const frame = data.toString('utf8');
      frames.push(frame);
      if (/login:/i.test(frame)) socket.send('guest');
      if (/Press return/i.test(frame)) socket.send('');
      if (/fics%/i.test(frame)) {
        clearTimeout(timer);
        socket.close(1000, 'Test complete');
        resolve(frames.join(''));
      }
    });
    socket.on('error', reject);
  });

  assert.equal(observed.origin, CANONICAL_FICS_ORIGIN);
  assert.deepEqual(observed.frames, ['guest', '']);
  assert.match(transcript, /Starting FICS session as GuestHQA/);
});

test('HQA relay rejects cross-origin WebSocket upgrades', { timeout: 5000 }, async (t) => {
  const server = http.createServer();
  const relay = attachMobileHqaFicsRelay(server, {
    enabled: true,
    upstreamUrl: 'ws://127.0.0.1:1/ws'
  });
  const port = await listen(server);
  t.after(async () => {
    for (const client of relay.websocketServer.clients) client.terminate();
    await closeServer(server);
  });

  const status = await new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}${MOBILE_HQA_FICS_RELAY_PATH}`, {
      origin: 'https://untrusted.example'
    });
    socket.on('unexpected-response', (_request, response) => resolve(response.statusCode));
    socket.on('open', () => reject(new Error('Cross-origin socket unexpectedly opened')));
    socket.on('error', () => {});
  });
  assert.equal(status, 403);
});

test('HQA relay source does not log or persist FICS payloads', () => {
  const source = fs.readFileSync(new URL('../scripts/mobile-hqa-fics-relay.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /console\.(?:log|info|warn|error)|writeFile|appendFile|Browser command|TRACE_HANDSHAKE/);
});
