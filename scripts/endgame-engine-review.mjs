import { spawn } from 'node:child_process';

export const ENGINE_EVIDENCE_VERSION = '1.0.0';

export async function runEngineReview({
    executable, fen, depth = 18, multiPv = 3, timeoutMs = 30_000
}) {
    if (!executable) throw Object.assign(new Error('engine-unavailable'), { code: 'engine-unavailable' });
    return new Promise((resolve, reject) => {
        const engine = spawn(executable, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
        const lines = [];
        const fail = (code) => {
            engine.kill();
            reject(Object.assign(new Error(code), { code }));
        };
        const timer = setTimeout(() => fail('engine-timeout'), timeoutMs);
        engine.on('error', () => fail('engine-unavailable'));
        engine.stdout.setEncoding('utf8');
        engine.stdout.on('data', (chunk) => {
            lines.push(...chunk.split(/\r?\n/).filter(Boolean));
            const best = lines.findLast((line) => line.startsWith('bestmove '));
            if (!best) return;
            clearTimeout(timer);
            engine.kill();
            const id = lines.find((line) => line.startsWith('id name '))?.slice(8) || 'unknown';
            resolve({
                evidenceVersion: ENGINE_EVIDENCE_VERSION,
                engineName: id,
                engineVersion: id,
                analysisLimit: { type: 'depth', value: depth },
                multiPv,
                bestMove: best.split(/\s+/)[1],
                rawUciLines: lines
            });
        });
        engine.stdin.write(`uci\nsetoption name MultiPV value ${multiPv}\nisready\nposition fen ${fen}\ngo depth ${depth}\n`);
    });
}
