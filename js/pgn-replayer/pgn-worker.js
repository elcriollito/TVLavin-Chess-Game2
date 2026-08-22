import '/assets/vendor/pgn-parser/pgn-parser-1.4.19.umd.js';
import { Chess } from '/assets/vendor/chess.js/chess-1.4.0.esm.js';
import '/js/pgn-replayer/pgn-core.js';

self.addEventListener('message', event => {
    const request = event.data || {};
    if (request.type !== 'parse' || typeof request.text !== 'string') return;
    try {
        const collection = self.CaissaPgnCore.parseCollection(request.text, {
            parse: self.PgnParser.parse,
            Chess
        });
        self.postMessage({ type: 'parsed', requestId: request.requestId, collection });
    } catch (error) {
        self.postMessage({
            type: 'error',
            requestId: request.requestId,
            error: {
                code: typeof error?.code === 'string' ? error.code : 'INVALID_PGN',
                message: String(error?.message || 'The PGN could not be read.').slice(0, 300)
            }
        });
    }
});
