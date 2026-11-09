import { PgnStreamSplitter, PolyglotBookBuilder } from './polyglot-core.js';

const MAX_PGN_BYTES = 25 * 1024 * 1024;

let decoder;
let builder;
let splitter;
let bytesProcessed = 0;

self.addEventListener('message', event => {
    const message = event.data || {};
    try {
        if (message.type === 'start') {
            decoder = new TextDecoder('utf-8', { fatal: false });
            builder = new PolyglotBookBuilder(message.options || {});
            splitter = new PgnStreamSplitter(game => builder.addGame(game));
            bytesProcessed = 0;
            reply(message.requestId, { type: 'started' });
            return;
        }

        ensureStarted();

        if (message.type === 'chunk') {
            const chunk = new Uint8Array(message.buffer);
            bytesProcessed += chunk.byteLength;
            if (bytesProcessed > MAX_PGN_BYTES) {
                const error = new Error('PGN exceeds the tested 25 MiB online limit');
                error.code = 'PGN_TOO_LARGE';
                throw error;
            }
            splitter.push(decoder.decode(chunk, { stream: true }));
            self.postMessage({ type: 'progress', bytesProcessed, ...builder.progress() });
            reply(message.requestId, { type: 'chunk-processed' });
            return;
        }

        if (message.type === 'finish') {
            splitter.push(decoder.decode());
            splitter.finish();
            const { buffer, summary } = builder.finish();
            self.postMessage({ type: 'result', replyTo: message.requestId, buffer, summary }, [buffer]);
            builder = null;
            splitter = null;
            decoder = null;
            return;
        }

        throw new Error(`Unsupported worker message: ${message.type}`);
    } catch (error) {
        self.postMessage({
            type: 'error',
            replyTo: message.requestId,
            code: error?.code || 'POLYGLOT_BUILD_FAILED',
            message: error instanceof Error ? error.message : 'Polyglot build failed',
            summary: builder?.progress?.() || null
        });
    }
});

function ensureStarted() {
    if (!decoder || !builder || !splitter) throw new Error('Polyglot worker was not initialized');
}

function reply(requestId, payload) {
    self.postMessage({ ...payload, replyTo: requestId });
}
