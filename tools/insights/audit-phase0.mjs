import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Read-only diagnostic: preserves defects as observations, never as expected product behavior.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const sourceDigest = createHash('sha256').update(source.trimEnd()).digest('hex');
if (sourceDigest !== '1412b72c0883243d05f36c59ec42399420b1673c24ab18bdd541ad851cb978c2')
  throw new Error('app.js differs from the audited snapshot; update/review the probes before rerunning.');
function between(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  if (a < 0 || b <= a) throw new Error('Audit source marker changed; review this probe.');
  return source.slice(a, b);
}
const storage = new Map();
const errors = [];
const context = vm.createContext({
  console: { log() {}, warn() {}, error() {} },
  document: { getElementById() { return null; } },
  localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key)
  },
  App: { engine: null },
  showNotification() {}, showErrorNotification: error => errors.push(error),
  setTimeout, clearTimeout
});
vm.runInContext(fs.readFileSync(path.join(root, 'assets/vendor/chess.js/chess-0.10.3.min.js'), 'utf8'), context);
vm.runInContext(
  between('function normalizePGN(text) {', '/**\n * Load PGN programmatically') +
  between('function parseMultiGamePGN(pgnText) {', '// Setup Engine vs Engine event listeners') +
  between('// ===== CAISSA INSIGHT MODULE =====', '// Render radar chart on canvas') +
  between('// ===== COACH REPORT MODULE =====', '// ===== CHEATER INSIGHT'),
  context
);
vm.runInContext('this.auditGetReport = () => coachReportData; this.auditSetProfile = value => { insightProfile = value; };', context);
const observations = [];
const record = (id, input, observed, desired, method = 'executed-production-function-in-node-vm') =>
  observations.push({ id, method, input, observed: JSON.parse(JSON.stringify(observed)), desired });

const pgn = (event, white, black, result, moves = '1. e4 e5 2. Nf3 Nc6') =>
  ['[Event "' + event + '"]', '[White "' + white + '"]', '[Black "' + black + '"]',
   '[Result "' + result + '"]', '[ECO "C20"]', '', moves + ' ' + result].join('\n');
const dataset = context.parseMultiGamePGN([
  pgn('Alex wins white', 'Alex', 'Opponent', '1-0'),
  pgn('Alex wins black', 'Opponent', 'Alex', '0-1'),
  pgn('Alex loses white', 'Alex', 'Opponent', '0-1')
].join('\n\n'));
const aggregate = context.aggregateCoachData(dataset.games, []);
record('I0-02-player-outcomes', 'Alex: 2 wins, 1 loss in three imported games',
  { wld: aggregate.wld, userColors: dataset.games.map(g => g.userColor), parserStats: dataset.stats },
  'Resolve target player and each game color: wins=2, losses=1, draws=0.');

const a = context.calculateRadarMetrics(dataset);
const changed = JSON.parse(JSON.stringify(dataset));
changed.games.forEach(g => { g.outcome = g.outcome === 'white-win' ? 'black-win' : 'white-win'; });
record('I0-03-heuristic-radar', 'Reverse every decisive result while retaining game length and ECO',
  { labels: ['Tactics','Strategy','Opening','Endgame','Precision','Aggression','Defense','Consistency'],
    original: a, reversedResults: context.calculateRadarMetrics(changed) },
  'Skill scores require own-player move evaluation and denominators; result/length proxies cannot prove skill.');

context.saveInsightProfile(dataset);
record('I0-01-ownerless-profile', 'Save an imported profile using the live save function',
  { keys: [...storage.keys()], ownerPresent: 'ownerId' in dataset || 'userId' in dataset },
  'Owner-scoped storage plus authenticated durable report history.');

context.clearInsightSession(false);
record('I0-04-keep-history', 'Start Fresh / Keep History immediately after saving a profile',
  { remainingKeys: [...storage.keys()] },
  'Retain an actual historical snapshot; the current implementation deletes its only saved profile.');

const invalid = context.parseMultiGamePGN(pgn('Invalid SAN', 'Alex', 'Opponent', '1-0', '1. e4 impossible'));
record('I0-05-invalid-pgn', 'A valid Event header followed by invalid SAN',
  { countedGames: invalid.stats.total, plies: invalid.games[0]?.plyCount, moves: invalid.games[0]?.moves },
  'Reject or quarantine failed PGN parse; never count a header alone as a valid analyzed game.');

const originalAnalyze = context.analyzeGameForMoments;
context.analyzeGameForMoments = async () => [];
context.displayCoachReport = () => {};
context.auditSetProfile(dataset);
await context.generateCoachReport(3, 'white');
const whiteCount = context.auditGetReport().gamesAnalyzed;
await context.generateCoachReport(3, 'black');
record('I0-06-color-filter-and-save', 'Generate White and Black reports for the same dataset',
  { whiteCount, blackCount: context.auditGetReport().gamesAnalyzed, persistedKeys: [...storage.keys()],
    sourceHasReportWrite: /localStorage\.setItem\(['"]caissa_coach_report/.test(source),
    sourceHasSessionWrite: /localStorage\.setItem\(['"]caissa_insight_sessions/.test(source) },
  'Filter by resolved player color before game limit; completed report is saved and recoverable.');
context.analyzeGameForMoments = originalAnalyze;

let fallback;
try {
  await context.analyzeGameForMoments(dataset.games[0], 0);
  // A no-capture game does not enter the unsupported move.before branch.
  const captures = context.parseMultiGamePGN(pgn('Queen capture', 'Alex', 'Opponent', '*', '1. e4 d5 2. exd5 Qxd5'));
  await context.analyzeGameForMoments(captures.games[0], 0);
  fallback = { status: 'completed' };
} catch (error) {
  fallback = { status: 'threw', error: error.message };
}
const chess = new context.Chess();
chess.load_pgn(pgn('Queen capture', 'Alex', 'Opponent', '*', '1. e4 d5 2. exd5 Qxd5'));
record('I0-07-engine-fallback', 'Engine unavailable; Chess.js 0.10.3; queen captures a pawn',
  { ...fallback, moveBeforePresent: 'before' in chess.history({ verbose: true })[0] },
  'Replay positions explicitly and label heuristic fallback; unavailable engine must not produce certified skill scores.');

const primaryInfo = () => {};
const primaryBest = () => {};
context.App.engine = {
  onInfo: primaryInfo, onBestMove: primaryBest, setPosition() {},
  go() {
    Promise.resolve().then(() => {
      this.onInfo({ depth: 12, multipv: 1, score: 1.2, mate: null, pv: ['e2e4'] });
      this.onInfo({ depth: 12, multipv: 2, score: 0.8, mate: null, pv: ['d2d4'] });
      this.onInfo({ depth: 12, multipv: 3, score: 0.2, mate: null, pv: ['g1f3'] });
      this.onBestMove('e2e4');
    });
  }
};
const ev = await context.getEngineEvaluation(chess.fen(), 12);
record('I0-08-multipv-and-callbacks', 'Simulated adapter emits ordered MultiPV 1,2,3 then bestmove=e2e4',
  { evaluation: ev, infoHandlerRestored: context.App.engine.onInfo === primaryInfo,
    bestMoveHandlerRestored: context.App.engine.onBestMove === primaryBest },
  'Consume MultiPV=1 for headline eval/bestmove and isolate analysis ownership; restore lifecycle safely.',
  'executed-production-consumer-with-synthetic-uci-info');

const originalEvaluation = context.getEngineEvaluation;
context.App.engine = { isReady: () => true, setMultiPV() {} };
let calls = 0;
context.getEngineEvaluation = async () => ({
  score: calls++ % 2 === 0 ? 0 : 2,
  bestMove: 'd2d4', mate: null, pv: ['d2d4'], depth: 12
});
const oneMove = context.parseMultiGamePGN(pgn('Favorable swing', 'Alex', 'Opponent', '*', '1. e4'));
const swingMoments = await context.analyzeGameForMoments(oneMove.games[0], 0);
record('I0-09-positive-swing', 'Synthetic White eval 0 to +2 after e4; suggested move d4',
  swingMoments.map(m => ({ move: m.moveSAN, swing: m.evalSwing, loss: m.moveLoss, tags: m.tags })),
  'A favorable swing is not a 2-pawn loss; measure max(0, ownEvalBefore-ownEvalAfter) with comparable searches.',
  'executed-production-analysis-with-synthetic-evaluations');

const fens = [];
context.getEngineEvaluation = async fen => { fens.push(fen); return { score: 0, bestMove: null, mate: null, pv: [], depth: 12 }; };
const setupPGN = ['[Event "FEN start"]','[White "Alex"]','[Black "Opponent"]','[SetUp "1"]',
  '[FEN "7k/8/8/8/8/8/6K1/8 w - - 0 1"]','[Result "*"]','','1. Kf3 *'].join('\n');
const setupData = context.parseMultiGamePGN(setupPGN);
await context.analyzeGameForMoments(setupData.games[0], 0);
record('I0-10-setup-position', 'PGN starts at a kings-only FEN and plays Kf3',
  { parsedMoves: setupData.games[0].moves, firstAnalyzedFen: fens[0], analyzedPositions: fens.length },
  'Replay from PGN FEN rather than chess.reset() standard position.');
context.getEngineEvaluation = originalEvaluation;

process.stdout.write(JSON.stringify({
  auditedCommit: '45de5ca2e0f4b3e711a6c39209fcd9caed7b6106',
  method: 'Read-only source probes; no browser, network, account, credits or production data writes.',
  observations
}, null, 2) + '\n');
