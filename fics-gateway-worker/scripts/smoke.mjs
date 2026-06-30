import WebSocket from 'ws';
import { Resolver } from 'node:dns';

const baseUrl = process.env.FICS_GATEWAY_URL || 'http://127.0.0.1:8787';
const origin = process.env.FICS_GATEWAY_ORIGIN || 'http://localhost:8000';
const wsUrl = baseUrl.replace(/^http/, 'ws') + '/ws';
const resolveIp = process.env.FICS_GATEWAY_RESOLVE_IP;
const dnsServer = process.env.FICS_GATEWAY_DNS_SERVER;
const resolver = dnsServer ? new Resolver() : null;
if (resolver) resolver.setServers([dnsServer]);
const socketOptions = {
  origin,
  ...(resolveIp ? {
    lookup(hostname, options, callback) {
      callback(null, options?.all ? [{ address: resolveIp, family: 4 }] : resolveIp, 4);
    }
  } : dnsServer ? {
    lookup(hostname, options, callback) {
      resolver.resolve4(hostname, (error, addresses) => {
        if (error) return callback(error);
        callback(null, options?.all
          ? addresses.map((address) => ({ address, family: 4 }))
          : addresses[0], 4);
      });
    }
  } : {})
};

if (!process.env.FICS_GATEWAY_SKIP_HEALTH) {
  const health = await fetch(`${baseUrl}/health`).then((response) => response.json());
  console.log('health:', health);
}

await new Promise((resolve, reject) => {
  const socket = new WebSocket(wsUrl, socketOptions);
  const timeout = setTimeout(() => reject(new Error('Timed out waiting for FICS banner')), 15000);
  let receivedBanner = false;

  socket.on('message', (data) => {
    if (receivedBanner) return;
    receivedBanner = true;
    const text = data.toString();
    console.log('banner:', text.slice(0, 300));
    socket.close(1000, 'Smoke complete');
  });
  socket.on('close', () => {
    clearTimeout(timeout);
    receivedBanner ? resolve() : reject(new Error('Socket closed before FICS banner'));
  });
  socket.on('error', reject);
});
