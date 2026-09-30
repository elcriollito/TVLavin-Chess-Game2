import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const gateway = fileURLToPath(new URL('../gateway/fics-local-node/fics-gateway.cjs', import.meta.url));

async function freePort() {
    const server = net.createServer();
    await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve));
    return port;
}

test('local gateway preserves prompt chunks and uses the production raw-text contract', { timeout: 7000 }, async (t) => {
    const tcpPort = await freePort();
    const tcpInputs = [];
    const tcpSockets = new Set();
    let tcpConnections = 0;
    let child;
    let socket;
    const fakeFics = net.createServer((connection) => {
        tcpConnections += 1;
        tcpSockets.add(connection);
        connection.once('close', () => tcpSockets.delete(connection));
        connection.write('FICS banner\r\n');
        connection.write('login: '); // Protocol-significant prompt has no trailing newline.
        connection.on('data', (data) => {
            const text = data.toString('utf8');
            tcpInputs.push(text);
            if (text === 'guest\n') connection.write('Press return to enter the server');
            if (text === '\n') connection.write('Starting FICS session as GuestTEST\r\nfics% ');
        });
    });
    t.after(() => {
        socket?.terminate();
        if (child && !child.killed) child.kill();
        child?.stdout?.destroy();
        child?.stderr?.destroy();
        child?.unref();
        for (const connection of tcpSockets) connection.destroy();
        fakeFics.close();
    });
    await new Promise((resolve, reject) => fakeFics.listen(tcpPort, '127.0.0.1', resolve).once('error', reject));
    const wsPort = await freePort();

    child = spawn(process.execPath, [gateway], {
        env: { ...process.env, FICS_HOST: '127.0.0.1', FICS_PORT: String(tcpPort), FICS_GATEWAY_PORT: String(wsPort) },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let startup = '';
    child.stdout.on('data', data => { startup += data.toString(); });
    child.stderr.on('data', data => { startup += data.toString(); });
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`gateway startup timeout: ${startup}`)), 5000);
        const inspect = () => {
            if (!startup.includes('WebSocket server listening')) return;
            clearTimeout(timeout);
            resolve();
        };
        child.stdout.on('data', inspect);
        child.stderr.on('data', inspect);
        child.once('exit', code => reject(new Error(`gateway exited ${code}: ${startup}`)));
    });

    const received = [];
    socket = new WebSocket(`ws://127.0.0.1:${wsPort}/ws`);
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`handshake timeout: ${JSON.stringify(received)}`)), 5000);
        socket.on('message', data => {
            const text = data.toString();
            received.push(text);
            const aggregate = received.join('');
            if (/login: /.test(aggregate) && !tcpInputs.includes('guest\n')) socket.send('guest');
            if (/Press return to enter the server/.test(aggregate) && !tcpInputs.includes('\n')) socket.send('');
            if (/Starting FICS session as GuestTEST[\s\S]*fics% /.test(aggregate)) {
                clearTimeout(timeout);
                resolve();
            }
        });
        socket.on('error', reject);
    });

    assert.equal(tcpConnections, 1);
    assert.deepEqual(tcpInputs, ['guest\n', '\n']);
    assert.equal(received.some(message => message.startsWith('{"type"')), false);
    assert.match(received.join(''), /FICS banner\r\nlogin: Press return to enter the serverStarting FICS session as GuestTEST\r\nfics% /);
});
