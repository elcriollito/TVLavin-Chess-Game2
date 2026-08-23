import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MANIFESTS = [
    'api/_private/pgn/players/manifest.json',
    'api/_private/pgn/players/pgnmentor/manifest.json'
];
const RIGHTS_REGISTRY = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pgn/player-commercial-rights.json'), 'utf8'));
const REQUIRED_RIGHTS_SCOPE = new Set(RIGHTS_REGISTRY.activationPolicy?.requiredScope || []);

function sourceRights(sourceKey) {
    const source = RIGHTS_REGISTRY.sources?.[sourceKey];
    if (!source) throw new Error('MISSING_PLAYER_RIGHTS_SOURCE');
    return source;
}

function isSourceCommerciallyCertified(sourceKey) {
    const source = sourceRights(sourceKey);
    const scope = new Set(source.certifiedScope || []);
    return source.commercialRightsStatus === RIGHTS_REGISTRY.activationPolicy?.requiredStatus
        && typeof source.evidenceDocument === 'string'
        && source.evidenceDocument.length > 0
        && [...REQUIRED_RIGHTS_SCOPE].every(item => scope.has(item));
}

function readManifest(relativePath) {
    const parsed = JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
    if (!Array.isArray(parsed.albums)) throw new Error('INVALID_PLAYER_MANIFEST');
    return parsed.albums;
}

function manifestOffer(album) {
    const localPath = String(album.localPath || '');
    if (!/^\/data\/pgn\/players\/(?:pgnmentor\/)?[a-z0-9-]+\.pgn$/.test(localPath)) {
        throw new Error('INVALID_PLAYER_SOURCE_PATH');
    }
    const sourceKey = String(album.id).startsWith('pgnmentor-') ? 'pgnmentor' : 'smallchess';
    return Object.freeze({
        id: String(album.id),
        title: String(album.title),
        credits: 1,
        sourceKey,
        commercialRightsCertified: isSourceCommerciallyCertified(sourceKey),
        legacyPath: localPath.replace('/data/pgn/players/', ''),
        filePath: path.join(ROOT, 'api/_private/pgn/players', localPath.replace('/data/pgn/players/', '')),
        fileName: `${String(album.title).replace(/[^\p{L}\p{N} ._()-]/gu, '').trim() || 'CAISSA Player'}.pgn`
    });
}

const offers = [
    Object.freeze({
        id: 'capablanca-games-1901-1941',
        title: 'José Raúl Capablanca',
        credits: 1,
        sourceKey: 'pgnmentor',
        commercialRightsCertified: isSourceCommerciallyCertified('pgnmentor'),
        legacyPath: 'capablanca-games-1901-1941.pgn',
        filePath: path.join(ROOT, 'api/_private/pgn/capablanca-games-1901-1941.pgn'),
        fileName: 'Jose Raul Capablanca.pgn'
    }),
    ...MANIFESTS.flatMap(readManifest).map(manifestOffer)
];

if (offers.length !== 82 || new Set(offers.map(offer => offer.id)).size !== offers.length) {
    throw new Error('INVALID_PLAYER_OFFER_CATALOG');
}
for (const sourceKey of Object.keys(RIGHTS_REGISTRY.sources || {})) {
    const expected = Number(sourceRights(sourceKey).albumCount);
    const actual = offers.filter(offer => offer.sourceKey === sourceKey).length;
    if (!Number.isInteger(expected) || expected !== actual) throw new Error('INVALID_PLAYER_RIGHTS_SOURCE_COUNT');
}
if (Number(RIGHTS_REGISTRY.catalogAlbumCount) !== offers.length) throw new Error('INVALID_PLAYER_RIGHTS_CATALOG_COUNT');

export const PGN_PLAYER_OFFERS = Object.freeze(Object.fromEntries(offers.map(offer => [offer.id, offer])));

export function getPgnPlayerOffer(albumId) {
    return typeof albumId === 'string' ? PGN_PLAYER_OFFERS[albumId] || null : null;
}

export function isPlayerAlbumCommerceEnabled(env = process.env) {
    return env.CAISSA_PLAYER_ALBUM_COMMERCE_ENABLED === 'true'
        && Object.values(PGN_PLAYER_OFFERS).every(offer => offer.commercialRightsCertified === true);
}
