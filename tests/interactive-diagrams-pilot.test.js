import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { load } from 'cheerio';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function loadRuntime() {
  const window = {};
  vm.runInNewContext(read('js/interactive-diagrams-manifest.js'), { window });
  vm.runInNewContext(read('js/interactive-diagrams-position-adapter.js'), { window });
  return { manifest: window.CaissaInteractiveDiagramsManifest, adapter: window.CaissaInteractiveDiagramAdapter };
}

test('one deterministic public Knowledge manifest owns four safe button-free diagrams', () => {
  const { manifest, adapter } = loadRuntime();
  const items = adapter.validateManifest(manifest);
  assert.equal(manifest.schema, 'CaissaInteractiveDiagramManifest@1.0.0');
  assert.equal(manifest.releaseId, 'rel-58b238dfdda8f295fdab023cead6bf069aceefbee74a64a5cd71af2202480a84');
  assert.equal(manifest.releaseHash, 'da0b332b45933135eede26894ab8d23ece9f674299071bc8847e2da6a2811f37');
  assert.equal(items.length, 4);
  assert.deepEqual(Array.from(items, item => item.order), [1, 2, 3, 4]);
  assert.ok(items.every(item => item.buttons === false && item.playMode === false && item.provenance.sourceType === 'immutable-public-knowledge-release'));
  assert.ok(items.every(item => !/[<>]/.test(JSON.stringify(item)) && !('hint' in item) && !('solution' in item)));
  assert.doesNotMatch(JSON.stringify(manifest), /private|authoring|https?:|data-play|script/i);
  assert.equal((read('js/interactive-diagrams-manifest.js').match(/CaissaInteractiveDiagramManifest@1\.0\.0/g) || []).length, 1);
});

test('FEN validation and documented data-pos conversion are deterministic and explicit about lossy fields', () => {
  const { adapter } = loadRuntime();
  const fen = '8/8/4k3/8/4K3/8/P7/8 w - - 0 1';
  const parsed = adapter.validateFen(fen);
  assert.equal(parsed.sideToMove, 'white');
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.unsupportedDataPosFields)), { castling: '-', enPassant: '-', halfmove: '0', fullmove: '1' });
  assert.equal(adapter.fenToDataPos(fen), 'wKe4,Pa2/bKe6');
  for (const invalid of ['8/8/8/8/8/8/8/8 w - - 0 1', '8/8/4k3/8/4K3/8/P7/9 w - - 0 1', '8/8/4k3/8/4K3/8/P7/8 x - - 0 1']) assert.throws(() => adapter.validateFen(invalid));
  const { manifest } = loadRuntime();
  const bad = structuredClone(manifest); bad.diagrams[0].arrows = ['z9z8'];
  assert.throws(() => adapter.validateManifest(bad), /ICD_ARROWS_INVALID/);
});

test('wrapper uses the explicit static mode, exact SRI, safe ordering, and no engine lifecycle', () => {
  const html = read('integrations/chessbase-interactive-diagrams.html');
  const page = load(html);
  assert.equal(page('.interactive-diagrams-grid[data-interactive-diagrams-host]').length, 1);
  assert.equal(page('script[src="https://pgn.chessbase.com/jquery-3.0.0.min.js"]').length, 1);
  assert.equal(page('script[src="https://pgn.chessbase.com/cbreplay.js"]').length, 1);
  assert.ok(html.indexOf('interactive-diagrams-bootstrap.js') < html.indexOf('jquery-3.0.0.min.js'));
  assert.ok(html.indexOf('jquery-3.0.0.min.js') < html.indexOf('cbreplay.js'));
  for (const node of [...page('script[src^="https://"]'), ...page('link[href="https://pgn.chessbase.com/CBReplay.css"]')]) assert.match(page(node).attr('integrity') || '', /^sha384-/);
  const runtime = read('js/interactive-diagrams-bootstrap.js') + read('js/interactive-diagrams-wrapper.js');
  assert.match(runtime, /createElement\('div'\)/);
  assert.doesNotMatch(runtime, /innerHTML|document\.write|new Worker|data-play|Stockfish|EngineInstance/);
  assert.match(runtime, /dataset\.buttons = '0'/);
  assert.doesNotMatch(html, /data-play|connect-src/);
  assert.match(html, /worker-src 'none'/);
  assert.doesNotMatch(read('game-replayer.html') + read('js/game-replayer-parent.js'), /interactive-diagrams/i);
});

test('public page owns exact SEO, complete fallback, attribution and retry', () => {
  const page = load(read('interactive-diagrams.html'));
  const title = 'Interactive Chess Diagrams and Positions | CAISSA Chess';
  const description = 'Study instructive chess positions with visual arrows, highlighted squares, and educational explanations powered by ChessBase on CAISSA Chess.';
  assert.equal(page('title').text(), title);
  assert.equal(page('meta[name="description"]').attr('content'), description);
  assert.equal(page('link[rel="canonical"]').attr('href'), 'https://www.caissa-chess.org/learn/interactive-diagrams');
  assert.equal(page('h1').length, 1);
  assert.equal(page('h1').text(), 'Explore Interactive Chess Diagrams');
  assert.equal(page('meta[name="keywords"]').length, 0);
  assert.doesNotMatch(page('meta[name="robots"]').attr('content') || '', /noindex/i);
  assert.equal(page('.interactive-diagram-summary').length, 4);
  assert.equal(page('iframe').attr('title'), 'Four CAISSA educational chess diagrams powered by ChessBase');
  assert.equal(page('iframe').attr('sandbox'), 'allow-scripts allow-same-origin');
  assert.match(page('.interactive-diagrams-disclosure').text(), /does not own or operate ChessBase/);
  assert.match(page('.interactive-diagrams-disclosure').text(), /not affiliated with ChessBase/);
  assert.equal(page('[data-interactive-diagrams-retry]').length, 1);
  assert.doesNotMatch(read('interactive-diagrams.html'), /pgn\.chessbase\.com|cbreplay\.js|data-play/i);
});

test('route, sitemap, navigation and wrapper CSP are coherent without global expansion', () => {
  const vercel = JSON.parse(read('vercel.json'));
  assert.ok(vercel.rewrites.some(rule => rule.source === '/learn/interactive-diagrams' && rule.destination === '/interactive-diagrams.html'));
  const sitemap = read('public/sitemap.xml');
  assert.equal((sitemap.match(/<loc>https:\/\/www\.caissa-chess\.org\/learn\/interactive-diagrams<\/loc>/g) || []).length, 1);
  const window = {}; vm.runInNewContext(read('js/caissa-primary-navigation.js'), { window, document: { querySelectorAll: () => [] } });
  assert.equal(window.CaissaPrimaryNavigation.contractId, 'CaissaGlobalNavigationOrderPolicy@1.10.0');
  assert.deepEqual(Array.from(window.CaissaPrimaryNavigation.inventory.groups[1], item => item.label), ['Tactics', 'Interactive Diagrams', 'Academy', 'Endgame Trainer', 'Endgame Practice', 'Endgame Library']);
  assert.equal(window.CaissaPrimaryNavigation.inventory.primary.length + window.CaissaPrimaryNavigation.inventory.connect.length, 33);
  const headers = vercel.headers.find(item => item.source === '/integrations/chessbase-interactive-diagrams.html').headers;
  const csp = headers.find(item => item.key === 'Content-Security-Policy').value;
  assert.match(csp, /worker-src 'none';/);
  assert.match(csp, /child-src 'none';/);
  assert.doesNotMatch(csp, /worker-src[^;]*(?:self|blob:|data:|pgn\.chessbase\.com)|connect-src|\*\.chessbase\.com/);
  const globalCsp = vercel.headers[0].headers.find(item => item.key === 'Content-Security-Policy').value;
  assert.doesNotMatch(globalCsp, /unsafe-eval/);
});

test('engine path remains absent, unregistered, and outside public route ownership', () => {
  const engine = 'Common/Chess/Engine/Enginemin.js';
  assert.equal(fs.existsSync(new URL(`../${engine}`, import.meta.url)), false);
  assert.doesNotMatch(read('config/caissa-public-route-inventory.json'), /Enginemin\.js/i);
  assert.doesNotMatch(read('scripts/audit-supply-chain.mjs'), /Enginemin\.js/i);
  const vercel = JSON.parse(read('vercel.json'));
  assert.equal(vercel.rewrites.some(rule => /Common\/Chess\/Engine|Enginemin/i.test(rule.source + rule.destination)), false);
  const diagramCsp = vercel.headers.find(rule => rule.source === '/integrations/chessbase-interactive-diagrams.html').headers.find(header => header.key === 'Content-Security-Policy').value;
  assert.doesNotMatch(diagramCsp, /worker-src[^;]*(?:'self'|blob:|data:|pgn\.chessbase\.com)/i);
  for (const candidate of ['service-worker.js', 'sw.js']) if (fs.existsSync(new URL(`../${candidate}`, import.meta.url))) assert.doesNotMatch(read(candidate), /Enginemin\.js/i);
});
