import os from 'node:os';

const DEFAULT_PORT = '8001';
const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PLAY_STAGE = 'public-beta';

process.env.PORT ||= DEFAULT_PORT;
process.env.CAISSA_SERVER_HOST ||= DEFAULT_HOST;
process.env.CAISSA_PLAY_V2_BETA_STAGE ||= DEFAULT_PLAY_STAGE;

function privateIpv4Addresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(address => address && address.family === 'IPv4' && !address.internal)
    .map(address => address.address)
    .filter(address => {
      const octets = address.split('.').map(Number);
      return octets[0] === 10
        || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
        || (octets[0] === 192 && octets[1] === 168);
    });
}

const port = Number.parseInt(process.env.PORT, 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`PORT must be an integer from 1 to 65535; received ${process.env.PORT}`);
}

console.log('CAISSA Mobile 2.0 local HQA server');
console.log(`Local: http://127.0.0.1:${port}`);
for (const address of privateIpv4Addresses()) {
  console.log(`LAN:   http://${address}:${port}`);
}
console.log('Private-LAN HQA only. No firewall settings are changed.');

await import('../server.js');
