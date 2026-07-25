import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

export const ENGINE_EVIDENCE_VERSION = '1.0.0';
const sha256File = async (path) =>
    createHash('sha256').update(await readFile(path)).digest('hex');

function parseInfo(line) {
    const tokens = line.trim().split(/\s+/);
    const value = (name) => {
        const index = tokens.indexOf(name);
        return index < 0 ? null : tokens[index + 1];
    };
    const pvIndex = tokens.indexOf('pv');
    const scoreIndex = tokens.indexOf('score');
    if (pvIndex < 0 || scoreIndex < 0) return null;
    return {
        multiPv: Number(value('multipv') || 1),
        depth: Number(value('depth') || 0),
        selDepth: Number(value('seldepth') || 0),
        nodes: Number(value('nodes') || 0),
        score: { type: tokens[scoreIndex + 1], value: Number(tokens[scoreIndex + 2]) },
        principalVariation: tokens.slice(pvIndex + 1)
    };
}

export async function verifyEngineBinary({ executable, identity }) {
    if (!executable) throw Object.assign(new Error('engine-unavailable'), { code: 'engine-unavailable' });
    if (process.platform !== identity.nodePlatform || process.arch !== identity.nodeArchitecture)
        throw Object.assign(new Error('unsupported-platform'), { code: 'unsupported-platform' });
    if (await sha256File(executable) !== identity.binarySha256)
        throw Object.assign(new Error('engine-checksum-mismatch'), { code: 'engine-checksum-mismatch' });
    return true;
}

export async function runEngineReview({ executable, identity, policy, fen }) {
    await verifyEngineBinary({ executable, identity });
    return new Promise((resolve, reject) => {
        const engine = spawn(executable, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
        const info = new Map();
        let engineName = null;
        let phase = 'uci';
        let buffer = '';
        let settled = false;
        const finishError = (code) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            engine.kill();
            reject(Object.assign(new Error(code), { code }));
        };
        const timer = setTimeout(() => finishError('engine-timeout'), policy.timeoutMs);
        const send = (line) => engine.stdin.write(`${line}\n`);
        engine.on('error', () => finishError('engine-crash'));
        engine.on('exit', (code) => {
            if (!settled && code !== 0) finishError('engine-crash');
        });
        engine.stderr.on('data', () => {});
        engine.stdout.setEncoding('utf8');
        engine.stdout.on('data', (chunk) => {
            buffer += chunk;
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() || '';
            for (const line of lines) {
                if (line.startsWith('id name ')) engineName = line.slice(8).trim();
                if (phase === 'uci' && line === 'uciok') {
                    if (engineName !== identity.engineName) return finishError('unsupported-engine-version');
                    for (const [name, value] of Object.entries(policy.uciOptions)) send(`setoption name ${name} value ${value}`);
                    send('isready');
                    phase = 'ready';
                } else if (phase === 'ready' && line === 'readyok') {
                    send(`position fen ${fen}`);
                    send(`go depth ${policy.depth}`);
                    phase = 'search';
                } else if (phase === 'search' && line.startsWith('info ')) {
                    const parsed = parseInfo(line);
                    if (parsed?.depth === policy.depth) info.set(parsed.multiPv, parsed);
                } else if (phase === 'search' && line.startsWith('bestmove ')) {
                    const bestMove = line.split(/\s+/)[1];
                    const candidates = [...info.values()].sort((a, b) => a.multiPv - b.multiPv);
                    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(bestMove) || candidates.length === 0)
                        return finishError('malformed-engine-output');
                    settled = true;
                    clearTimeout(timer);
                    send('quit');
                    resolve({
                        evidenceVersion: ENGINE_EVIDENCE_VERSION,
                        engineIdentity: identity,
                        analysisPolicy: policy,
                        bestMove,
                        candidates
                    });
                }
            }
        });
        send('uci');
    });
}
