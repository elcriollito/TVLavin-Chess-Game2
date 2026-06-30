import WebSocket from 'ws';

const sessionCount = Number.parseInt(process.argv[2] || '5', 10);
const baseUrl = process.env.FICS_GATEWAY_URL || 'http://127.0.0.1:8787';
const origin = process.env.FICS_GATEWAY_ORIGIN || 'http://localhost:8000';
const wsUrl = baseUrl.replace(/^http/, 'ws') + '/ws';

const results = await Promise.all(Array.from({ length: sessionCount }, (_, index) => (
  new Promise((resolve) => {
    const startedAt = Date.now();
    const socket = new WebSocket(wsUrl, { origin });
    let result;
    const timeout = setTimeout(() => {
      socket.terminate();
      resolve({ index, ok: false, error: 'timeout' });
    }, 20000);

    socket.once('message', (data) => {
      clearTimeout(timeout);
      result = {
        index,
        ok: true,
        latencyMs: Date.now() - startedAt,
        bannerBytes: data.length
      };
      socket.close(1000, 'Load test complete');
    });
    socket.once('close', () => {
      if (result) resolve(result);
    });
    socket.once('error', (error) => {
      clearTimeout(timeout);
      resolve({ index, ok: false, error: error.message });
    });
  })
)));

const successful = results.filter((result) => result.ok);
console.log(JSON.stringify({
  requested: sessionCount,
  successful: successful.length,
  failed: sessionCount - successful.length,
  maxLatencyMs: successful.length ? Math.max(...successful.map((result) => result.latencyMs)) : null,
  results
}, null, 2));

if (successful.length !== sessionCount) process.exitCode = 1;
