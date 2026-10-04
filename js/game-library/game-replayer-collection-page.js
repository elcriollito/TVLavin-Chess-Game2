import { getPgnCollection } from './pgn-collection-registry.js';
import { normalizeArchiveReturnTo } from './archive-return-state.js';

const params = new URLSearchParams(location.search);
const fallback = getPgnCollection('capablanca-complete');
const requestedId = params.get('collection');
const requested = requestedId ? getPgnCollection(requestedId) : fallback;
const collection = requested?.readerCompatible ? requested : fallback;
const returnTo = normalizeArchiveReturnTo(params.get('returnTo'));
const isChampionship = collection.type === 'championship-match';
const frame = document.querySelector('[data-game-replayer-frame]');

document.querySelector('[data-game-replayer-title]').textContent = isChampionship ? `Replay ${collection.title.replace(' · Complete Match', '')}` : 'Replay and Study Chess Games';
document.querySelector('[data-game-replayer-deck]').textContent = `Explore ${collection.gamesCount} ${collection.gamesCount === 1 ? 'game' : 'games'} from ${collection.title} on an interactive board.`;
document.querySelector('[data-collection-provenance]').textContent = collection.attribution;
document.querySelectorAll('[data-collection-download]').forEach(link => {
  link.href = collection.localAsset;
  link.download = collection.downloadFilename;
  link.textContent = `Download ${collection.title} PGN`;
});
frame.title = collection.id === 'capablanca-complete'
  ? 'Chess game replayer for the Capablanca collection'
  : `Chess game replayer for ${collection.title}`;
frame.src = `/integrations/chessbase-pgn-replayer.html?collection=${encodeURIComponent(collection.id)}`;
frame.dataset.collectionId = collection.id;

const archiveReturn = document.querySelector('[data-archive-return]');
if (archiveReturn) archiveReturn.href = returnTo || '/game-library/champions';

const invalid = document.querySelector('[data-invalid-collection]');
if (requestedId && collection === fallback && requestedId !== fallback.id) {
  invalid.hidden = false;
  invalid.textContent = 'The requested collection is not allowlisted. The Capablanca collection was loaded instead.';
}
if (params.has('returnTo') && !returnTo) {
  invalid.hidden = false;
  invalid.textContent = 'The return destination was not accepted. The archive home link is being used.';
}
