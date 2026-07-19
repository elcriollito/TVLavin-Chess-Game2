export const DEFAULT_STOCKFISH_WORKER_PATH = '../../engine/stockfish-working.js';

export class StockfishWorkerFactoryError extends Error {
    constructor(code) {
        super(code);
        this.name = 'StockfishWorkerFactoryError';
        this.code = code;
    }
}

function factoryError(code) {
    return new StockfishWorkerFactoryError(code);
}

function resolveBaseUrl(baseUrl) {
    const candidate = baseUrl ?? globalThis.document?.baseURI ?? import.meta.url;
    try {
        return new URL(candidate);
    } catch {
        throw factoryError('invalid-options');
    }
}

export function resolveStockfishWorkerUrl(options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw factoryError('invalid-options');
    const allowed = new Set(['workerUrl', 'baseUrl', 'name', 'allowCrossOrigin', 'WorkerConstructor']);
    if (Object.keys(options).some((key) => !allowed.has(key))) throw factoryError('invalid-options');
    if (options.name !== undefined && (typeof options.name !== 'string' || !options.name.trim())) throw factoryError('invalid-options');
    if (options.allowCrossOrigin !== undefined && typeof options.allowCrossOrigin !== 'boolean') throw factoryError('invalid-options');
    if (options.WorkerConstructor !== undefined && typeof options.WorkerConstructor !== 'function') throw factoryError('invalid-options');
    if (options.workerUrl !== undefined && (typeof options.workerUrl !== 'string' && !(options.workerUrl instanceof URL))) throw factoryError('invalid-worker-url');
    if (typeof options.workerUrl === 'string' && !options.workerUrl.trim()) throw factoryError('invalid-worker-url');

    const base = resolveBaseUrl(options.baseUrl);
    let resolved;
    try {
        resolved = new URL(options.workerUrl ?? DEFAULT_STOCKFISH_WORKER_PATH, base);
    } catch {
        throw factoryError('invalid-worker-url');
    }
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') throw factoryError('invalid-worker-url');
    if (!options.allowCrossOrigin && base.origin !== resolved.origin) throw factoryError('cross-origin-worker-not-allowed');
    return resolved;
}

export function createStockfishWorker(options = {}) {
    const resolvedUrl = resolveStockfishWorkerUrl(options);
    const WorkerConstructor = options.WorkerConstructor ?? globalThis.Worker;
    if (typeof WorkerConstructor !== 'function') throw factoryError('worker-unsupported');
    try {
        const worker = new WorkerConstructor(resolvedUrl.href, { name: options.name ?? 'caissa-endgame-stockfish' });
        if (!worker || typeof worker.postMessage !== 'function' || typeof worker.addEventListener !== 'function' || typeof worker.removeEventListener !== 'function' || typeof worker.terminate !== 'function') {
            worker?.terminate?.();
            throw factoryError('worker-construction-failed');
        }
        return worker;
    } catch (error) {
        if (error instanceof StockfishWorkerFactoryError) throw error;
        throw factoryError('worker-construction-failed');
    }
}
