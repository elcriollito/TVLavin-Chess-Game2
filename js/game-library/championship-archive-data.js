import { pgnCollections, validatePgnCollectionRegistry } from './pgn-collection-registry.js';

export { pgnCollections } from './pgn-collection-registry.js';

export const CHAMPIONSHIP_ARCHIVE_VERSION = 'ChampionshipArchive@2.0.0-review';

export const LINEAGES = Object.freeze({
  UNDISPUTED: 'undisputed',
  CLASSICAL: 'classical',
  FIDE: 'fide',
  REUNIFICATION: 'reunification'
});

const officialSource = 'https://museum.fide.com/champions';
const fideHistorySource = 'https://museum.fide.com/fide-history';

export const champions = Object.freeze([
  { id: 'wilhelm-steinitz', order: 1, displayName: 'Wilhelm Steinitz', country: 'Austria / United States', initials: 'WS', summary: 'The first recognized World Champion and a pioneer of positional play.', reignIds: ['steinitz-1886'] },
  { id: 'emanuel-lasker', order: 2, displayName: 'Emanuel Lasker', country: 'Germany', initials: 'EL', summary: 'A twenty-seven-year reign built on resilience and practical depth.', reignIds: ['lasker-1894'] },
  { id: 'jose-raul-capablanca', order: 3, displayName: 'José Raúl Capablanca', country: 'Cuba', initials: 'JC', summary: 'Effortless clarity, endgame precision and an enduring classical ideal.', reignIds: ['capablanca-1921'], collectionIds: ['capablanca-complete'] },
  { id: 'alexander-alekhine', order: 4, displayName: 'Alexander Alekhine', country: 'Russia / France', initials: 'AA', summary: 'A dynamic champion whose two reigns surrounded the Euwe interlude.', reignIds: ['alekhine-1927', 'alekhine-1937'] },
  { id: 'max-euwe', order: 5, displayName: 'Max Euwe', country: 'Netherlands', initials: 'ME', summary: 'The mathematician who interrupted Alekhine’s reign in 1935.', reignIds: ['euwe-1935'] },
  { id: 'mikhail-botvinnik', order: 6, displayName: 'Mikhail Botvinnik', country: 'USSR', initials: 'MB', summary: 'The patriarch of the Soviet school and champion across three reigns.', reignIds: ['botvinnik-1948', 'botvinnik-1958', 'botvinnik-1961'] },
  { id: 'vasily-smyslov', order: 7, displayName: 'Vasily Smyslov', country: 'USSR', initials: 'VS', summary: 'Harmony and technique carried him past Botvinnik in 1957.', reignIds: ['smyslov-1957'] },
  { id: 'mikhail-tal', order: 8, displayName: 'Mikhail Tal', country: 'USSR', initials: 'MT', summary: 'The attacking magician who electrified the championship lineage.', reignIds: ['tal-1960'], collectionIds: ['tal-smyslov-1959'] },
  { id: 'tigran-petrosian', order: 9, displayName: 'Tigran Petrosian', country: 'USSR', initials: 'TP', summary: 'A master of prevention whose defensive vision defined an era.', reignIds: ['petrosian-1963'] },
  { id: 'boris-spassky', order: 10, displayName: 'Boris Spassky', country: 'USSR', initials: 'BS', summary: 'A universal player at the center of the championship’s most famous match.', reignIds: ['spassky-1969'] },
  { id: 'bobby-fischer', order: 11, displayName: 'Bobby Fischer', country: 'United States', initials: 'BF', summary: 'The lone challenger who ended a generation of Soviet title control.', reignIds: ['fischer-1972'], collectionIds: ['fischer-spassky-1972-complete', 'fischer-spassky-game-6', 'fischer-byrne-1963'] },
  { id: 'anatoly-karpov', order: 12, displayName: 'Anatoly Karpov', country: 'USSR / Russia', initials: 'AK', summary: 'Positional control, two Korchnoi defenses and a decade-long first reign.', reignIds: ['karpov-1975', 'karpov-fide-1993'], collectionIds: ['karpov-kasparov-1985'] },
  { id: 'garry-kasparov', order: 13, displayName: 'Garry Kasparov', country: 'USSR / Russia', initials: 'GK', summary: 'A dominant champion who carried the classical lineage through the split era.', reignIds: ['kasparov-1985', 'kasparov-classical-1993'], collectionIds: ['kasparov-topalov-1999'] },
  { id: 'vladimir-kramnik', order: 14, displayName: 'Vladimir Kramnik', country: 'Russia', initials: 'VK', summary: 'He dethroned Kasparov, then reunited the championship in 2006.', reignIds: ['kramnik-classical-2000', 'kramnik-unified-2006'] },
  { id: 'viswanathan-anand', order: 15, displayName: 'Viswanathan Anand', country: 'India', initials: 'VA', summary: 'Speed, versatility and championship success across changing formats.', reignIds: ['anand-fide-2000', 'anand-2007'] },
  { id: 'magnus-carlsen', order: 16, displayName: 'Magnus Carlsen', country: 'Norway', initials: 'MC', summary: 'A long modern reign marked by pressure, precision and four defenses.', reignIds: ['carlsen-2013'], collectionIds: ['carlsen-caruana-2018'] },
  { id: 'ding-liren', order: 17, displayName: 'Ding Liren', country: 'China', initials: 'DL', summary: 'China’s first open World Champion, crowned after a rapid tiebreak.', reignIds: ['ding-2023'] },
  { id: 'gukesh-dommaraju', order: 18, displayName: 'Gukesh Dommaraju', country: 'India', initials: 'GD', summary: 'The youngest undisputed World Champion, crowned in Singapore in 2024.', reignIds: ['gukesh-2024'] },
  { id: 'alexander-khalifman', displayName: 'Alexander Khalifman', country: 'Russia', initials: 'AK', summary: 'Winner of the 1999 FIDE knockout championship.', reignIds: ['khalifman-fide-1999'], parallelOnly: true },
  { id: 'ruslan-ponomariov', displayName: 'Ruslan Ponomariov', country: 'Ukraine', initials: 'RP', summary: 'Winner of the 2002 FIDE knockout championship.', reignIds: ['ponomariov-fide-2002'], parallelOnly: true },
  { id: 'rustam-kasimdzhanov', displayName: 'Rustam Kasimdzhanov', country: 'Uzbekistan', initials: 'RK', summary: 'Winner of the 2004 FIDE knockout championship.', reignIds: ['kasimdzhanov-fide-2004'], parallelOnly: true },
  { id: 'veselin-topalov', displayName: 'Veselin Topalov', country: 'Bulgaria', initials: 'VT', summary: 'Winner of the 2005 FIDE championship tournament.', reignIds: ['topalov-fide-2005'], parallelOnly: true }
].map(champion => Object.freeze({
  portraitAsset: null,
  attribution: null,
  source: null,
  license: null,
  licenseUrl: null,
  nationalIdentityVerified: false,
  ...champion
})));

export const reigns = Object.freeze([
  { id: 'steinitz-1886', championId: 'wilhelm-steinitz', startYear: 1886, endYear: 1894, lineage: 'undisputed', wonEventId: 'wcc-1886', lostEventId: 'wcc-1894', defenseCount: 3, championshipMatchCount: 5 },
  { id: 'lasker-1894', championId: 'emanuel-lasker', startYear: 1894, endYear: 1921, lineage: 'undisputed', wonEventId: 'wcc-1894', lostEventId: 'wcc-1921', defenseCount: 5, championshipMatchCount: 7 },
  { id: 'capablanca-1921', championId: 'jose-raul-capablanca', startYear: 1921, endYear: 1927, lineage: 'undisputed', wonEventId: 'wcc-1921', lostEventId: 'wcc-1927', defenseCount: 0, championshipMatchCount: 2 },
  { id: 'alekhine-1927', championId: 'alexander-alekhine', startYear: 1927, endYear: 1935, lineage: 'undisputed', wonEventId: 'wcc-1927', lostEventId: 'wcc-1935', defenseCount: 2, championshipMatchCount: 4 },
  { id: 'euwe-1935', championId: 'max-euwe', startYear: 1935, endYear: 1937, lineage: 'undisputed', wonEventId: 'wcc-1935', lostEventId: 'wcc-1937', defenseCount: 0, championshipMatchCount: 2 },
  { id: 'alekhine-1937', championId: 'alexander-alekhine', startYear: 1937, endYear: 1946, lineage: 'undisputed', wonEventId: 'wcc-1937', endedBy: 'death-in-office', defenseCount: 0, championshipMatchCount: 1 },
  { id: 'botvinnik-1948', championId: 'mikhail-botvinnik', startYear: 1948, endYear: 1957, lineage: 'undisputed', wonEventId: 'wcc-1948', lostEventId: 'wcc-1957', defenseCount: 2, championshipMatchCount: 3 },
  { id: 'smyslov-1957', championId: 'vasily-smyslov', startYear: 1957, endYear: 1958, lineage: 'undisputed', wonEventId: 'wcc-1957', lostEventId: 'wcc-1958', defenseCount: 0, championshipMatchCount: 2 },
  { id: 'botvinnik-1958', championId: 'mikhail-botvinnik', startYear: 1958, endYear: 1960, lineage: 'undisputed', wonEventId: 'wcc-1958', lostEventId: 'wcc-1960', defenseCount: 0, championshipMatchCount: 2 },
  { id: 'tal-1960', championId: 'mikhail-tal', startYear: 1960, endYear: 1961, lineage: 'undisputed', wonEventId: 'wcc-1960', lostEventId: 'wcc-1961', defenseCount: 0, championshipMatchCount: 2 },
  { id: 'botvinnik-1961', championId: 'mikhail-botvinnik', startYear: 1961, endYear: 1963, lineage: 'undisputed', wonEventId: 'wcc-1961', lostEventId: 'wcc-1963', defenseCount: 0, championshipMatchCount: 2 },
  { id: 'petrosian-1963', championId: 'tigran-petrosian', startYear: 1963, endYear: 1969, lineage: 'undisputed', wonEventId: 'wcc-1963', lostEventId: 'wcc-1969', defenseCount: 1, championshipMatchCount: 3 },
  { id: 'spassky-1969', championId: 'boris-spassky', startYear: 1969, endYear: 1972, lineage: 'undisputed', wonEventId: 'wcc-1969', lostEventId: 'wcc-1972', defenseCount: 0, championshipMatchCount: 2 },
  { id: 'fischer-1972', championId: 'bobby-fischer', startYear: 1972, endYear: 1975, lineage: 'undisputed', wonEventId: 'wcc-1972', lostEventId: 'wcc-1975', defenseCount: 0, championshipMatchCount: 1, eventIds: ['wcc-1972', 'wcc-1975'] },
  { id: 'karpov-1975', championId: 'anatoly-karpov', startYear: 1975, endYear: 1985, lineage: 'undisputed', wonEventId: 'wcc-1975', lostEventId: 'wcc-1985', defenseCount: 2, championshipMatchCount: 4, eventIds: ['wcc-1975', 'wcc-1978', 'wcc-1981', 'wcc-1984', 'wcc-1985'] },
  { id: 'kasparov-1985', championId: 'garry-kasparov', startYear: 1985, endYear: 1993, lineage: 'undisputed', wonEventId: 'wcc-1985', splitEventId: 'wcc-split-1993', defenseCount: 3, championshipMatchCount: 4, eventIds: ['wcc-1985', 'wcc-1986', 'wcc-1987', 'wcc-1990', 'wcc-split-1993'] },
  { id: 'kasparov-classical-1993', championId: 'garry-kasparov', startYear: 1993, endYear: 2000, lineage: 'classical', wonEventId: 'wcc-classical-1993', lostEventId: 'wcc-classical-2000', defenseCount: 2, championshipMatchCount: 3 },
  { id: 'karpov-fide-1993', championId: 'anatoly-karpov', startYear: 1993, endYear: 1999, lineage: 'fide', wonEventId: 'wcc-fide-1993', lostEventId: 'wcc-fide-1999', defenseCount: 2, championshipMatchCount: 3 },
  { id: 'khalifman-fide-1999', championId: 'alexander-khalifman', startYear: 1999, endYear: 2000, lineage: 'fide', wonEventId: 'wcc-fide-1999', lostEventId: 'wcc-fide-2000', defenseCount: 0, championshipMatchCount: 1 },
  { id: 'anand-fide-2000', championId: 'viswanathan-anand', startYear: 2000, endYear: 2002, lineage: 'fide', wonEventId: 'wcc-fide-2000', lostEventId: 'wcc-fide-2002', defenseCount: 0, championshipMatchCount: 1 },
  { id: 'ponomariov-fide-2002', championId: 'ruslan-ponomariov', startYear: 2002, endYear: 2004, lineage: 'fide', wonEventId: 'wcc-fide-2002', lostEventId: 'wcc-fide-2004', defenseCount: 0, championshipMatchCount: 1 },
  { id: 'kasimdzhanov-fide-2004', championId: 'rustam-kasimdzhanov', startYear: 2004, endYear: 2005, lineage: 'fide', wonEventId: 'wcc-fide-2004', lostEventId: 'wcc-fide-2005', defenseCount: 0, championshipMatchCount: 1 },
  { id: 'topalov-fide-2005', championId: 'veselin-topalov', startYear: 2005, endYear: 2006, lineage: 'fide', wonEventId: 'wcc-fide-2005', lostEventId: 'wcc-2006-reunification', defenseCount: 0, championshipMatchCount: 2 },
  { id: 'kramnik-classical-2000', championId: 'vladimir-kramnik', startYear: 2000, endYear: 2006, lineage: 'classical', wonEventId: 'wcc-classical-2000', reunifiedEventId: 'wcc-2006-reunification', defenseCount: 1, championshipMatchCount: 3 },
  { id: 'kramnik-unified-2006', championId: 'vladimir-kramnik', startYear: 2006, endYear: 2007, lineage: 'reunification', wonEventId: 'wcc-2006-reunification', lostEventId: 'wcc-2007', defenseCount: 0, championshipMatchCount: 2 },
  { id: 'anand-2007', championId: 'viswanathan-anand', startYear: 2007, endYear: 2013, lineage: 'undisputed', wonEventId: 'wcc-2007', lostEventId: 'wcc-2013', defenseCount: 3, championshipMatchCount: 5 },
  { id: 'carlsen-2013', championId: 'magnus-carlsen', startYear: 2013, endYear: 2023, lineage: 'undisputed', wonEventId: 'wcc-2013', endedBy: 'declined-defense', defenseCount: 4, championshipMatchCount: 5 },
  { id: 'ding-2023', championId: 'ding-liren', startYear: 2023, endYear: 2024, lineage: 'undisputed', wonEventId: 'wcc-2023', lostEventId: 'wcc-2024', defenseCount: 0, championshipMatchCount: 2 },
  { id: 'gukesh-2024', championId: 'gukesh-dommaraju', startYear: 2024, endYear: null, lineage: 'undisputed', wonEventId: 'wcc-2024', defenseCount: 0, championshipMatchCount: 1, current: true }
]);

const transition = (id, year, title, championId, challengerId, winnerId, lineage = 'undisputed', extra = {}) => ({
  id, year, title, championId, challengerId, winnerId,
  loserId: winnerId === championId ? challengerId : championId,
  format: 'match', lineage, classification: lineage === 'fide' ? 'FIDE' : 'classical',
  status: extra.status || 'completed', verification: 'verified', source: officialSource,
  ...extra,
  historicalNote: extra.historicalNote || extra.note || null
});

export const championshipEvents = Object.freeze([
  transition('wcc-1886', 1886, 'Steinitz–Zukertort', 'wilhelm-steinitz', 'johannes-zukertort', 'wilhelm-steinitz', 'undisputed', { location: 'United States', note: 'First match generally recognized as the official World Championship.' }),
  transition('wcc-1894', 1894, 'Steinitz–Lasker', 'wilhelm-steinitz', 'emanuel-lasker', 'emanuel-lasker'),
  transition('wcc-1921', 1921, 'Lasker–Capablanca', 'emanuel-lasker', 'jose-raul-capablanca', 'jose-raul-capablanca'),
  transition('wcc-1927', 1927, 'Capablanca–Alekhine', 'jose-raul-capablanca', 'alexander-alekhine', 'alexander-alekhine', 'undisputed', { pgnCollectionId: 'capablanca-complete' }),
  transition('wcc-1935', 1935, 'Alekhine–Euwe', 'alexander-alekhine', 'max-euwe', 'max-euwe'),
  transition('wcc-1937', 1937, 'Euwe–Alekhine', 'max-euwe', 'alexander-alekhine', 'alexander-alekhine'),
  { id: 'wcc-1948', year: 1948, title: 'World Championship Tournament', participantIds: ['mikhail-botvinnik', 'vasily-smyslov', 'paul-keres', 'samuel-reshevsky', 'max-euwe'], winnerId: 'mikhail-botvinnik', score: '14/20', location: 'The Hague / Moscow', numberOfGames: 50, format: 'quintuple-round-robin', lineage: 'undisputed', status: 'tournament', classification: 'FIDE', verification: 'verified', source: 'https://museum.fide.com/exhibits/the-final-arbiter-protocol-of-the-1948-world-championship-tournament', historicalNote: 'FIDE filled the vacancy created by Alexander Alekhine’s death in office; each participant played 20 games in the 50-game event.' },
  transition('wcc-1957', 1957, 'Botvinnik–Smyslov', 'mikhail-botvinnik', 'vasily-smyslov', 'vasily-smyslov'),
  transition('wcc-1958', 1958, 'Smyslov–Botvinnik return match', 'vasily-smyslov', 'mikhail-botvinnik', 'mikhail-botvinnik'),
  transition('wcc-1960', 1960, 'Botvinnik–Tal', 'mikhail-botvinnik', 'mikhail-tal', 'mikhail-tal'),
  transition('wcc-1961', 1961, 'Tal–Botvinnik return match', 'mikhail-tal', 'mikhail-botvinnik', 'mikhail-botvinnik'),
  transition('wcc-1963', 1963, 'Botvinnik–Petrosian', 'mikhail-botvinnik', 'tigran-petrosian', 'tigran-petrosian'),
  transition('wcc-1969', 1969, 'Petrosian–Spassky', 'tigran-petrosian', 'boris-spassky', 'boris-spassky'),
  transition('wcc-1972', 1972, 'Spassky–Fischer', 'boris-spassky', 'bobby-fischer', 'bobby-fischer', 'undisputed', { score: '8½–12½', location: 'Reykjavík, Iceland', numberOfGames: 21, pgnCollectionId: 'fischer-spassky-1972-complete', source: 'https://museum.fide.com/exhibits/icelandic-chess-federations-1972-world-championship-match-commemorative-program' }),
  { id: 'wcc-1975', year: 1975, title: 'Fischer–Karpov title succession', championId: 'bobby-fischer', challengerId: 'anatoly-karpov', winnerId: 'anatoly-karpov', loserId: 'bobby-fischer', numberOfGames: 0, format: 'forfeit', lineage: 'undisputed', status: 'forfeited', classification: 'FIDE', verification: 'verified', source: 'https://museum.fide.com/champions/robert-bobby-fischer', historicalNote: 'The match was not played; Fischer refused the approved conditions and lost the title by default.' },
  transition('wcc-1978', 1978, 'Karpov–Korchnoi', 'anatoly-karpov', 'viktor-korchnoi', 'anatoly-karpov', 'undisputed', { score: '6 wins to 5', location: 'Baguio, Philippines', numberOfGames: 32, source: 'https://museum.fide.com/exhibits/medal-of-the-world-chess-championship-match-karpov-vs-korchnoi-in-1978' }),
  transition('wcc-1981', 1981, 'Karpov–Korchnoi', 'anatoly-karpov', 'viktor-korchnoi', 'anatoly-karpov', 'undisputed', { score: '6 wins to 2', location: 'Merano, Italy', numberOfGames: 18, source: 'https://museum.fide.com/exhibits/scoresheet-of-game-4-of-the-1981-world-championship-match-karpov-korchnoi-korchnois-handwriting' }),
  { id: 'wcc-1984', year: 1984, title: 'Karpov–Kasparov', championId: 'anatoly-karpov', challengerId: 'garry-kasparov', winnerId: null, loserId: null, numberOfGames: 48, format: 'match', lineage: 'undisputed', status: 'aborted', classification: 'FIDE', verification: 'verified', source: 'https://museum.fide.com/exhibits/table-used-in-the-1984-world-championship-match-karpov-vs-kasparov', historicalNote: 'Stopped without a result after 48 games; it did not transfer the title.' },
  transition('wcc-1985', 1985, 'Karpov–Kasparov', 'anatoly-karpov', 'garry-kasparov', 'garry-kasparov', 'undisputed', { score: '11–13', location: 'Moscow, USSR', numberOfGames: 24, pgnCollectionId: 'karpov-kasparov-1985', source: 'https://museum.fide.com/champions/garry-kasparov' }),
  transition('wcc-1986', 1986, 'Kasparov–Karpov return match', 'garry-kasparov', 'anatoly-karpov', 'garry-kasparov', 'undisputed', { score: '12½–11½' }),
  transition('wcc-1987', 1987, 'Kasparov–Karpov', 'garry-kasparov', 'anatoly-karpov', 'garry-kasparov', 'undisputed', { score: '12–12', numberOfGames: 24, status: 'drawn', historicalNote: 'Kasparov retained the title after a drawn match.' }),
  transition('wcc-1990', 1990, 'Kasparov–Karpov', 'garry-kasparov', 'anatoly-karpov', 'garry-kasparov', 'undisputed', { score: '12½–11½' }),
  { id: 'wcc-split-1993', year: 1993, title: 'Championship split', format: 'administrative', lineage: 'classical', status: 'completed', classification: 'historical-transition', verification: 'verified', source: fideHistorySource, historicalNote: 'Kasparov and Short played outside FIDE, creating concurrent Classical and FIDE title lines.' },
  transition('wcc-classical-1993', 1993, 'Kasparov–Short', 'garry-kasparov', 'nigel-short', 'garry-kasparov', 'classical', { score: '12½–7½', location: 'London, United Kingdom', source: 'https://museum.fide.com/exhibits/kasparov-short-pca-world-championship-match-caricature' }),
  transition('wcc-fide-1993', 1993, 'Karpov–Timman', 'jan-timman', 'anatoly-karpov', 'anatoly-karpov', 'fide', { note: 'FIDE held a separate title match after stripping Kasparov.' }),
  { id: 'wcc-fide-1999', year: 1999, title: 'FIDE Knockout Championship', winnerId: 'alexander-khalifman', format: 'knockout-tournament', lineage: 'fide', status: 'tournament', classification: 'FIDE', verification: 'verified', source: officialSource },
  { id: 'wcc-fide-2000', year: 2000, title: 'FIDE Knockout Championship', winnerId: 'viswanathan-anand', format: 'knockout-tournament', lineage: 'fide', status: 'tournament', classification: 'FIDE', verification: 'verified', source: officialSource },
  transition('wcc-classical-2000', 2000, 'Kasparov–Kramnik', 'garry-kasparov', 'vladimir-kramnik', 'vladimir-kramnik', 'classical', { score: '6½–8½', location: 'London, United Kingdom', source: 'https://museum.fide.com/champions/vladimir-kramnik' }),
  { id: 'wcc-fide-2002', year: 2002, title: 'FIDE Knockout Championship', winnerId: 'ruslan-ponomariov', format: 'knockout-tournament', lineage: 'fide', status: 'tournament', classification: 'FIDE', verification: 'verified', source: officialSource },
  { id: 'wcc-fide-2004', year: 2004, title: 'FIDE Knockout Championship', winnerId: 'rustam-kasimdzhanov', format: 'knockout-tournament', lineage: 'fide', status: 'tournament', classification: 'FIDE', verification: 'verified', source: officialSource },
  { id: 'wcc-fide-2005', year: 2005, title: 'FIDE World Championship Tournament', winnerId: 'veselin-topalov', format: 'double-round-robin', lineage: 'fide', status: 'tournament', classification: 'FIDE', verification: 'verified', source: officialSource },
  transition('wcc-2006-reunification', 2006, 'Kramnik–Topalov reunification', 'veselin-topalov', 'vladimir-kramnik', 'vladimir-kramnik', 'reunification', { score: '6–6; Kramnik won rapid tiebreak 2½–1½', location: 'Elista, Russia', status: 'reunification', source: 'https://museum.fide.com/exhibits/kramniks-medal-from-the-world-chess-championship-2006' }),
  { id: 'wcc-2007', year: 2007, title: 'World Championship Tournament', participantIds: ['vladimir-kramnik', 'viswanathan-anand'], winnerId: 'viswanathan-anand', format: 'double-round-robin', lineage: 'undisputed', status: 'tournament', classification: 'FIDE/classical', verification: 'verified', source: 'https://museum.fide.com/champions/vladimir-kramnik', historicalNote: 'Anand won the eight-player tournament; Kramnik then exercised his rematch right in 2008.' },
  transition('wcc-2013', 2013, 'Anand–Carlsen', 'viswanathan-anand', 'magnus-carlsen', 'magnus-carlsen'),
  { id: 'wcc-2023', year: 2023, title: 'Nepomniachtchi–Ding', championId: null, challengerId: 'ian-nepomniachtchi', winnerId: 'ding-liren', loserId: 'ian-nepomniachtchi', format: 'match', lineage: 'undisputed', status: 'completed', classification: 'FIDE/classical', verification: 'verified', source: 'https://www.fide.com/fide-world-championship-cycle-2023-2024/', historicalNote: 'Carlsen declined to defend; Ding won the vacant title after rapid tiebreaks.' },
  transition('wcc-2024', 2024, 'Ding–Gukesh', 'ding-liren', 'gukesh-dommaraju', 'gukesh-dommaraju', 'undisputed', { score: '6½–7½', location: 'Singapore', source: 'https://www.fide.com/fide-world-championship-game-14-gukesh-d-claims-title/' })
]);

export const archiveMeta = Object.freeze({
  updated: '2026-10-04',
  currentChampionId: 'gukesh-dommaraju',
  primaryChampionIds: champions.filter(champion => !champion.parallelOnly).map(champion => champion.id),
  splitEra: Object.freeze({ startYear: 1993, endYear: 2006, classicalReignIds: ['kasparov-classical-1993', 'kramnik-classical-2000'], fideReignIds: ['karpov-fide-1993', 'khalifman-fide-1999', 'anand-fide-2000', 'ponomariov-fide-2002', 'kasimdzhanov-fide-2004', 'topalov-fide-2005'], reunificationEventId: 'wcc-2006-reunification' }),
  sources: Object.freeze([
    { label: 'FIDE Open Chess Museum · Champions', url: officialSource },
    { label: 'FIDE history · 1948, 1993 and 2006', url: fideHistorySource },
    { label: 'FIDE · Gukesh wins the 2024 match', url: 'https://www.fide.com/fide-world-championship-game-14-gukesh-d-claims-title/' }
  ]),
  verificationNotes: Object.freeze([
    'National labels remain in source data for research continuity but are not rendered until individually verified.',
    'Unverified defense and match totals are not rendered.',
    'Local one-game PGNs are not presented as complete match collections.'
  ])
});

export function getChampion(id) { return champions.find(champion => champion.id === id) || null; }
export function getReign(id) { return reigns.find(reign => reign.id === id) || null; }
export function getEvent(id) { return championshipEvents.find(event => event.id === id) || null; }
export function getCollection(id) { return pgnCollections.find(collection => collection.id === id) || null; }

export function validateChampionshipArchive() {
  const duplicateIds = values => values.map(value => value.id).filter((id, index, ids) => ids.indexOf(id) !== index);
  const errors = [];
  errors.push(...validatePgnCollectionRegistry().errors);
  for (const [label, values] of [['champion', champions], ['reign', reigns], ['event', championshipEvents], ['collection', pgnCollections]]) {
    for (const id of duplicateIds(values)) errors.push(`Duplicate ${label} id: ${id}`);
  }
  const championIds = new Set(champions.map(champion => champion.id));
  const reignIds = new Set(reigns.map(reign => reign.id));
  const eventIds = new Set(championshipEvents.map(event => event.id));
  const collectionIds = new Set(pgnCollections.map(collection => collection.id));
  const validStatuses = new Set(['completed', 'drawn', 'aborted', 'forfeited', 'tournament', 'reunification']);
  for (const champion of champions) for (const id of champion.reignIds || []) if (!reignIds.has(id)) errors.push(`${champion.id} references missing reign ${id}`);
  for (const reign of reigns) {
    if (!championIds.has(reign.championId)) errors.push(`${reign.id} references missing champion ${reign.championId}`);
    for (const key of ['wonEventId', 'lostEventId', 'splitEventId', 'reunifiedEventId']) if (reign[key] && !eventIds.has(reign[key])) errors.push(`${reign.id} references missing event ${reign[key]}`);
  }
  for (const event of championshipEvents) {
    if (event.pgnCollectionId && !collectionIds.has(event.pgnCollectionId)) errors.push(`${event.id} references missing collection ${event.pgnCollectionId}`);
    if (!validStatuses.has(event.status)) errors.push(`${event.id} has invalid or missing status`);
  }
  for (const collection of pgnCollections) if (collection.championId && !championIds.has(collection.championId)) errors.push(`${collection.id} references missing champion ${collection.championId}`);
  const ordered = archiveMeta.primaryChampionIds.map(id => getChampion(id)?.order);
  if (ordered.some((order, index) => order !== index + 1)) errors.push('Primary champion order is not contiguous');
  if (championshipEvents.some((event, index) => index > 0 && event.year < championshipEvents[index - 1].year)) errors.push('Championship events are not chronological');
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
