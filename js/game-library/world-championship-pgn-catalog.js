export const WORLD_CHAMPIONSHIP_PGN_CATALOG_VERSION = 'CaissaWorldChampionshipPgnCatalog@1.0.0';

export const WORLD_CHAMPIONSHIP_PGN_SOURCE = Object.freeze({
  name: 'PGN Mentor',
  catalogUrl: 'https://www.pgnmentor.com/files.html',
  assetBaseUrl: 'https://www.pgnmentor.com/events/'
});

// Stable Reader IDs are inherited from the existing Albums > World Championships
// catalog. eventId is an explicit, reviewed archive relationship; it is never
// inferred at runtime from a title or year.
const rows = [
  ['world-championship-worldchamp2024', 2024, 'Gukesh vs Ding Liren', 'Gukesh Dommaraju', 'Ding Liren', 14, 'WorldChamp2024.pgn', 'wcc-2024', 'undisputed'],
  ['world-championship-worldchamp2023', 2023, 'Ding Liren vs Nepomniachtchi', 'Ding Liren', 'Ian Nepomniachtchi', 14, 'WorldChamp2023.pgn', 'wcc-2023', 'undisputed'],
  ['world-championship-worldchamp2021', 2021, 'Carlsen vs Nepomniachtchi', 'Magnus Carlsen', 'Ian Nepomniachtchi', 11, 'WorldChamp2021.pgn', 'wcc-2021', 'undisputed'],
  ['world-championship-worldchamp2018', 2018, 'Carlsen vs Caruana', 'Magnus Carlsen', 'Fabiano Caruana', 15, 'WorldChamp2018.pgn', 'wcc-2018', 'undisputed'],
  ['world-championship-worldchamp2016', 2016, 'Carlsen vs Karjakin', 'Magnus Carlsen', 'Sergey Karjakin', 16, 'WorldChamp2016.pgn', 'wcc-2016', 'undisputed'],
  ['world-championship-worldchamp2014', 2014, 'Carlsen vs Anand', 'Magnus Carlsen', 'Viswanathan Anand', 11, 'WorldChamp2014.pgn', 'wcc-2014', 'undisputed'],
  ['world-championship-worldchamp2013', 2013, 'Carlsen vs Anand', 'Magnus Carlsen', 'Viswanathan Anand', 10, 'WorldChamp2013.pgn', 'wcc-2013', 'undisputed'],
  ['world-championship-worldchamp2012', 2012, 'Anand vs Gelfand', 'Viswanathan Anand', 'Boris Gelfand', 16, 'WorldChamp2012.pgn', 'wcc-2012', 'undisputed'],
  ['world-championship-worldchamp2010', 2010, 'Anand vs Topalov', 'Viswanathan Anand', 'Veselin Topalov', 12, 'WorldChamp2010.pgn', 'wcc-2010', 'undisputed'],
  ['world-championship-worldchamp2008', 2008, 'Anand vs Kramnik', 'Viswanathan Anand', 'Vladimir Kramnik', 11, 'WorldChamp2008.pgn', 'wcc-2008', 'undisputed'],
  ['world-championship-worldchamp2007', 2007, 'World Championship Tournament', null, null, 56, 'WorldChamp2007.pgn', 'wcc-2007', 'undisputed'],
  ['world-championship-worldchamp2006', 2006, 'Kramnik vs Topalov', 'Vladimir Kramnik', 'Veselin Topalov', 16, 'WorldChamp2006.pgn', 'wcc-2006-reunification', 'reunification'],
  ['world-championship-fidechamp2005', 2005, 'FIDE World Championship Tournament', null, null, 56, 'FideChamp2005.pgn', 'wcc-fide-2005', 'fide'],
  ['world-championship-fidechamp2004', 2004, 'FIDE Knockout Championship', null, null, 408, 'FideChamp2004.pgn', 'wcc-fide-2004', 'fide'],
  ['world-championship-worldchamp2004', 2004, 'Kramnik vs Leko', 'Vladimir Kramnik', 'Peter Leko', 14, 'WorldChamp2004.pgn', 'wcc-classical-2004', 'classical'],
  ['world-championship-fidechamp2002', 2002, 'FIDE Knockout Championship', null, null, 418, 'FideChamp2002.pgn', 'wcc-fide-2002', 'fide'],
  ['world-championship-fidechamp2000', 2000, 'FIDE Knockout Championship', null, null, 345, 'FideChamp2000.pgn', 'wcc-fide-2000', 'fide'],
  ['world-championship-worldchamp2000', 2000, 'Kramnik vs Kasparov', 'Vladimir Kramnik', 'Garry Kasparov', 15, 'WorldChamp2000.pgn', 'wcc-classical-2000', 'classical'],
  ['world-championship-fidechamp1999', 1999, 'FIDE Knockout Championship', null, null, 303, 'FideChamp1999.pgn', 'wcc-fide-1999', 'fide'],
  ['world-championship-fidechamp1998', 1998, 'FIDE Knockout Championship', null, null, 331, 'FideChamp1998.pgn', 'wcc-fide-1998', 'fide'],
  ['world-championship-fidechamp1996', 1996, 'Karpov vs Kamsky', 'Anatoly Karpov', 'Gata Kamsky', 18, 'FideChamp1996.pgn', 'wcc-fide-1996', 'fide'],
  ['world-championship-pcachamp1995', 1995, 'Kasparov vs Anand', 'Garry Kasparov', 'Viswanathan Anand', 18, 'PCAChamp1995.pgn', 'wcc-classical-1995', 'classical'],
  ['world-championship-fidechamp1993', 1993, 'Karpov vs Timman', 'Anatoly Karpov', 'Jan Timman', 21, 'FideChamp1993.pgn', 'wcc-fide-1993', 'fide'],
  ['world-championship-pcachamp1993', 1993, 'Kasparov vs Short', 'Garry Kasparov', 'Nigel Short', 20, 'PCAChamp1993.pgn', 'wcc-classical-1993', 'classical'],
  ['world-championship-worldchamp1990', 1990, 'Kasparov vs Karpov', 'Garry Kasparov', 'Anatoly Karpov', 24, 'WorldChamp1990.pgn', 'wcc-1990', 'undisputed'],
  ['world-championship-worldchamp1987', 1987, 'Kasparov vs Karpov', 'Garry Kasparov', 'Anatoly Karpov', 24, 'WorldChamp1987.pgn', 'wcc-1987', 'undisputed'],
  ['world-championship-worldchamp1986', 1986, 'Kasparov vs Karpov', 'Garry Kasparov', 'Anatoly Karpov', 24, 'WorldChamp1986.pgn', 'wcc-1986', 'undisputed'],
  ['world-championship-worldchamp1985', 1985, 'Kasparov vs Karpov', 'Garry Kasparov', 'Anatoly Karpov', 24, 'WorldChamp1985.pgn', 'wcc-1985', 'undisputed'],
  ['world-championship-worldchamp1984', 1984, 'Karpov vs Kasparov', 'Anatoly Karpov', 'Garry Kasparov', 48, 'WorldChamp1984.pgn', 'wcc-1984', 'undisputed'],
  ['world-championship-worldchamp1981', 1981, 'Karpov vs Korchnoi', 'Anatoly Karpov', 'Viktor Korchnoi', 18, 'WorldChamp1981.pgn', 'wcc-1981', 'undisputed'],
  ['world-championship-worldchamp1978', 1978, 'Karpov vs Korchnoi', 'Anatoly Karpov', 'Viktor Korchnoi', 32, 'WorldChamp1978.pgn', 'wcc-1978', 'undisputed'],
  ['world-championship-worldchamp1972', 1972, 'Fischer vs Spassky', 'Bobby Fischer', 'Boris Spassky', 21, 'WorldChamp1972.pgn', 'wcc-1972', 'undisputed'],
  ['world-championship-worldchamp1969', 1969, 'Spassky vs Petrosian', 'Boris Spassky', 'Tigran Petrosian', 23, 'WorldChamp1969.pgn', 'wcc-1969', 'undisputed'],
  ['world-championship-worldchamp1966', 1966, 'Petrosian vs Spassky', 'Tigran Petrosian', 'Boris Spassky', 24, 'WorldChamp1966.pgn', 'wcc-1966', 'undisputed'],
  ['world-championship-worldchamp1963', 1963, 'Petrosian vs Botvinnik', 'Tigran Petrosian', 'Mikhail Botvinnik', 22, 'WorldChamp1963.pgn', 'wcc-1963', 'undisputed'],
  ['world-championship-worldchamp1961', 1961, 'Botvinnik vs Tal', 'Mikhail Botvinnik', 'Mikhail Tal', 21, 'WorldChamp1961.pgn', 'wcc-1961', 'undisputed'],
  ['world-championship-worldchamp1960', 1960, 'Tal vs Botvinnik', 'Mikhail Tal', 'Mikhail Botvinnik', 21, 'WorldChamp1960.pgn', 'wcc-1960', 'undisputed'],
  ['world-championship-worldchamp1958', 1958, 'Botvinnik vs Smyslov', 'Mikhail Botvinnik', 'Vasily Smyslov', 23, 'WorldChamp1958.pgn', 'wcc-1958', 'undisputed'],
  ['world-championship-worldchamp1957', 1957, 'Smyslov vs Botvinnik', 'Vasily Smyslov', 'Mikhail Botvinnik', 22, 'WorldChamp1957.pgn', 'wcc-1957', 'undisputed'],
  ['world-championship-worldchamp1954', 1954, 'Botvinnik vs Smyslov', 'Mikhail Botvinnik', 'Vasily Smyslov', 24, 'WorldChamp1954.pgn', 'wcc-1954', 'undisputed'],
  ['world-championship-worldchamp1951', 1951, 'Botvinnik vs Bronstein', 'Mikhail Botvinnik', 'David Bronstein', 24, 'WorldChamp1951.pgn', 'wcc-1951', 'undisputed'],
  ['world-championship-worldchamp1948', 1948, 'World Championship Tournament', null, null, 50, 'WorldChamp1948.pgn', 'wcc-1948', 'undisputed'],
  ['world-championship-worldchamp1937', 1937, 'Alekhine vs Euwe', 'Alexander Alekhine', 'Max Euwe', 25, 'WorldChamp1937.pgn', 'wcc-1937', 'undisputed'],
  ['world-championship-worldchamp1935', 1935, 'Euwe vs Alekhine', 'Max Euwe', 'Alexander Alekhine', 30, 'WorldChamp1935.pgn', 'wcc-1935', 'undisputed'],
  ['world-championship-worldchamp1934', 1934, 'Alekhine vs Bogoljubow', 'Alexander Alekhine', 'Efim Bogoljubow', 26, 'WorldChamp1934.pgn', 'wcc-1934', 'undisputed'],
  ['world-championship-worldchamp1929', 1929, 'Alekhine vs Bogoljubow', 'Alexander Alekhine', 'Efim Bogoljubow', 25, 'WorldChamp1929.pgn', 'wcc-1929', 'undisputed'],
  ['world-championship-worldchamp1927', 1927, 'Alekhine vs Capablanca', 'Alexander Alekhine', 'José Raúl Capablanca', 34, 'WorldChamp1927.pgn', 'wcc-1927', 'undisputed'],
  ['world-championship-worldchamp1921', 1921, 'Capablanca vs Lasker', 'José Raúl Capablanca', 'Emanuel Lasker', 14, 'WorldChamp1921.pgn', 'wcc-1921', 'undisputed'],
  ['world-championship-worldchamp1910a', 1910, 'Lasker vs Schlechter', 'Emanuel Lasker', 'Carl Schlechter', 10, 'WorldChamp1910a.pgn', 'wcc-1910-schlechter', 'undisputed'],
  ['world-championship-worldchamp1910b', 1910, 'Lasker vs Janowski', 'Emanuel Lasker', 'Dawid Janowski', 11, 'WorldChamp1910b.pgn', 'wcc-1910-janowski', 'undisputed'],
  ['world-championship-worldchamp1909', 1909, 'Lasker vs Janowski', 'Emanuel Lasker', 'Dawid Janowski', 10, 'WorldChamp1909.pgn', 'wcc-1909', 'undisputed'],
  ['world-championship-worldchamp1908', 1908, 'Lasker vs Tarrasch', 'Emanuel Lasker', 'Siegbert Tarrasch', 16, 'WorldChamp1908.pgn', 'wcc-1908', 'undisputed'],
  ['world-championship-worldchamp1907', 1907, 'Lasker vs Marshall', 'Emanuel Lasker', 'Frank Marshall', 15, 'WorldChamp1907.pgn', 'wcc-1907', 'undisputed'],
  ['world-championship-worldchamp1896', 1896, 'Lasker vs Steinitz', 'Emanuel Lasker', 'Wilhelm Steinitz', 17, 'WorldChamp1896.pgn', 'wcc-1896', 'undisputed'],
  ['world-championship-worldchamp1894', 1894, 'Lasker vs Steinitz', 'Emanuel Lasker', 'Wilhelm Steinitz', 19, 'WorldChamp1894.pgn', 'wcc-1894', 'undisputed'],
  ['world-championship-worldchamp1892', 1892, 'Steinitz vs Chigorin', 'Wilhelm Steinitz', 'Mikhail Chigorin', 23, 'WorldChamp1892.pgn', 'wcc-1892', 'undisputed'],
  ['world-championship-worldchamp1890', 1890, 'Steinitz vs Gunsberg', 'Wilhelm Steinitz', 'Isidor Gunsberg', 19, 'WorldChamp1890.pgn', 'wcc-1890', 'undisputed'],
  ['world-championship-worldchamp1889', 1889, 'Steinitz vs Chigorin', 'Wilhelm Steinitz', 'Mikhail Chigorin', 17, 'WorldChamp1889.pgn', 'wcc-1889', 'undisputed'],
  ['world-championship-worldchamp1886', 1886, 'Steinitz vs Zukertort', 'Wilhelm Steinitz', 'Johannes Zukertort', 20, 'WorldChamp1886.pgn', 'wcc-1886', 'undisputed']
];

export const worldChampionshipPgnCatalog = Object.freeze(rows.map(([
  id, year, title, playerA, playerB, gamesCount, file, eventId, lineage
]) => Object.freeze({
  id, year, title, playerA, playerB, gamesCount, file, eventId, lineage,
  pgnType: 'remote-pgn',
  sourceName: WORLD_CHAMPIONSHIP_PGN_SOURCE.name,
  sourceUrl: WORLD_CHAMPIONSHIP_PGN_SOURCE.catalogUrl,
  externalDownloadUrl: `${WORLD_CHAMPIONSHIP_PGN_SOURCE.assetBaseUrl}${file}`,
  readerCompatible: true,
  stableId: true
})));

const byId = new Map(worldChampionshipPgnCatalog.map(entry => [entry.id, entry]));
const byEventId = new Map(worldChampionshipPgnCatalog.map(entry => [entry.eventId, entry]));

export function getWorldChampionshipPgnCollection(collectionId) {
  return typeof collectionId === 'string' ? byId.get(collectionId) || null : null;
}

export function getWorldChampionshipPgnCollectionForEvent(eventId) {
  return typeof eventId === 'string' ? byEventId.get(eventId) || null : null;
}

export function validateWorldChampionshipPgnCatalog(entries = worldChampionshipPgnCatalog) {
  const errors = [];
  const ids = new Set();
  const eventIds = new Set();
  const files = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') { errors.push('Catalog entry must be an object'); continue; }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id || '')) errors.push(`Invalid catalog id: ${entry.id || 'missing'}`);
    if (ids.has(entry.id)) errors.push(`Duplicate catalog id: ${entry.id}`);
    if (eventIds.has(entry.eventId)) errors.push(`Ambiguous archive association: ${entry.eventId}`);
    if (files.has(entry.file)) errors.push(`Duplicate PGN file: ${entry.file}`);
    ids.add(entry.id); eventIds.add(entry.eventId); files.add(entry.file);
    if (!Number.isInteger(entry.year) || entry.year < 1886) errors.push(`${entry.id} has invalid year`);
    if (!Number.isInteger(entry.gamesCount) || entry.gamesCount < 1) errors.push(`${entry.id} has invalid gamesCount`);
    if (!/^(?:WorldChamp|FideChamp|PCAChamp)[A-Za-z0-9]+\.pgn$/.test(entry.file || '')) errors.push(`${entry.id} has invalid file`);
    if (entry.externalDownloadUrl !== `${WORLD_CHAMPIONSHIP_PGN_SOURCE.assetBaseUrl}${entry.file}`) errors.push(`${entry.id} has a non-canonical external URL`);
    if (!entry.readerCompatible) errors.push(`${entry.id} is not reader compatible`);
  }
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export const worldChampionshipPgnCatalogValidation = validateWorldChampionshipPgnCatalog();
