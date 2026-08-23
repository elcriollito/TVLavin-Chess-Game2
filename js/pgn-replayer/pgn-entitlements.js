(function () {
    'use strict';

    const MAX_ALBUM_BYTES = 10 * 1024 * 1024;

    async function fetchAlbum(album) {
        if (!album?.id) return null;
        const response = await fetch(`/api/pgn/player?album=${encodeURIComponent(album.id)}`, {
            headers: { Accept: 'application/x-chess-pgn,text/plain' },
            credentials: 'same-origin',
            cache: 'force-cache'
        });
        if (!response.ok) throw new Error('The free player collection is temporarily unavailable.');
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > MAX_ALBUM_BYTES) throw new Error('This collection exceeds the 10 MiB safety limit.');
        return bytes;
    }

    window.CaissaPgnEntitlements = Object.freeze({
        fetchAlbum,
        refresh: async () => ({ credits: 0, commerceEnabled: false, owned: new Set() }),
        isOwned: () => false,
        getCredits: () => 0,
        isCommerceEnabled: () => false
    });
})();
