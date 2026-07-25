export const TABLEBASE_ADAPTER_VERSION = '1.0.0';
export const MAX_SYZYGY_PIECES = 7;

export function createOfflineTablebaseAdapter({ probe, tool = 'syzygy-compatible-offline', version = 'unknown' } = {}) {
    return Object.freeze({
        adapterVersion: TABLEBASE_ADAPTER_VERSION,
        maxPieces: MAX_SYZYGY_PIECES,
        networkDependency: false,
        async verify({ fen, positionFingerprint, pieceCount }) {
            if (pieceCount > MAX_SYZYGY_PIECES)
                throw Object.assign(new Error('unsupported-piece-count'), { code: 'unsupported-piece-count' });
            if (typeof probe !== 'function')
                throw Object.assign(new Error('tablebase-unavailable'), { code: 'tablebase-unavailable' });
            const result = await probe(fen);
            if (!result || !['win', 'draw', 'loss'].includes(result.wdl))
                throw Object.assign(new Error('tablebase-invalid-result'), { code: 'tablebase-invalid-result' });
            return Object.freeze({
                adapterVersion: TABLEBASE_ADAPTER_VERSION,
                providerOrTool: tool,
                version,
                positionFingerprint,
                verificationMethod: 'offline-syzygy-probe',
                wdl: result.wdl,
                ...(Number.isInteger(result.dtz) ? { dtz: result.dtz } : {}),
                ...(Array.isArray(result.bestMoves) ? { bestMoves: result.bestMoves } : {})
            });
        }
    });
}
