import WebSocket from 'ws';
import { Resolver } from 'node:dns';

const sessionCount = Number.parseInt(process.argv[2] || '1', 10);
const durationSeconds = Number.parseInt(process.argv[3] || '300', 10);
const baseUrl = process.env.FICS_GATEWAY_URL || 'http://127.0.0.1:8787';
const origin = process.env.FICS_GATEWAY_ORIGIN || 'http://localhost:8000';
const wsUrl = baseUrl.replace(/^http/, 'ws') + '/ws';
const resolveIp = process.env.FICS_GATEWAY_RESOLVE_IP;
const dnsServer = process.env.FICS_GATEWAY_DNS_SERVER;
const resolver = dnsServer ? new Resolver() : null;
if (resolver) resolver.setServers([dnsServer]);
const commands = ['who', 'games', 'sought', 'date'];

function runSession(index) {
  return new Promise((resolve) => {
    const socket = new WebSocket(wsUrl, {
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
    });
    const startedAt = Date.now();
    const deadline = startedAt + durationSeconds * 1000;
    const latencies = [];
    const completedCommands = [];
    let authenticatedAt;
    let pendingCommand;
    let pendingSentAt;
    let commandIndex = 0;
    let keepaliveTimer;
    let finishTimer;
    let settled = false;
    let responseBuffer = '';
    let guestSent = false;
    let returnSent = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(keepaliveTimer);
      clearTimeout(finishTimer);
      resolve({
        index,
        durationMs: Date.now() - startedAt,
        authenticated: Boolean(authenticatedAt),
        completedCommands,
        averageLatencyMs: latencies.length
          ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
          : null,
        ...result
      });
    };

    const sendCommand = (command) => {
      if (socket.readyState !== WebSocket.OPEN || pendingCommand) return;
      pendingCommand = command;
      pendingSentAt = Date.now();
      socket.send(command);
    };

    const scheduleKeepalive = () => {
      clearTimeout(keepaliveTimer);
      keepaliveTimer = setTimeout(() => sendCommand('date'), 30000);
    };

    const beginSession = () => {
      if (authenticatedAt) return;
      authenticatedAt = Date.now();
      sendCommand(commands[commandIndex]);
      finishTimer = setTimeout(() => {
        sendCommand('quit');
        setTimeout(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.close(1000, 'Long session complete');
          }
        }, 2000);
      }, Math.max(0, deadline - Date.now()));
    };

    socket.on('message', (data) => {
      const text = data.toString();
      responseBuffer = `${responseBuffer}${text}`.slice(-8192);
      if (!guestSent && /login:/i.test(responseBuffer)) {
        guestSent = true;
        responseBuffer = '';
        socket.send('guest');
      }
      if (!returnSent && /Press return to enter the server/i.test(responseBuffer)) {
        returnSent = true;
        responseBuffer = '';
        socket.send('');
      }
      if (/Starting FICS session/i.test(responseBuffer)) beginSession();

      if (authenticatedAt && /fics%/i.test(responseBuffer) && pendingCommand) {
        latencies.push(Date.now() - pendingSentAt);
        completedCommands.push(pendingCommand);
        pendingCommand = undefined;
        responseBuffer = '';

        if (commandIndex < commands.length - 1) {
          commandIndex += 1;
          setTimeout(() => sendCommand(commands[commandIndex]), 250);
        } else {
          scheduleKeepalive();
        }
      }

      if (text.includes('Gateway error: rate limit exceeded')) {
        finish({ ok: false, error: 'rate limit exceeded during normal command cadence' });
        socket.close(1011, 'Unexpected rate limit');
      }
    });

    socket.on('close', (code, reason) => {
      const stayedOpen = Date.now() >= deadline;
      finish({
        ok: stayedOpen && Boolean(authenticatedAt),
        closeCode: code,
        closeReason: reason.toString(),
        error: stayedOpen ? undefined : 'disconnected before requested duration'
      });
    });

    socket.on('error', (error) => finish({ ok: false, error: error.message }));

    setTimeout(() => {
      if (!authenticatedAt) {
        finish({ ok: false, error: 'guest login timeout' });
        socket.terminate();
      }
    }, 20000);
  });
}

const results = await Promise.all(
  Array.from({ length: sessionCount }, (_, index) => runSession(index))
);
const successful = results.filter((result) => result.ok);
const latencies = successful
  .map((result) => result.averageLatencyMs)
  .filter((value) => value !== null);

console.log(JSON.stringify({
  requested: sessionCount,
  durationSeconds,
  successful: successful.length,
  failed: sessionCount - successful.length,
  averageLatencyMs: latencies.length
    ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
    : null,
  results
}, null, 2));

if (successful.length !== sessionCount) process.exitCode = 1;
