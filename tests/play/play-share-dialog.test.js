import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = process.cwd();
const context = vm.createContext({ globalThis: null, URL, encodeURIComponent }); context.globalThis = context;
vm.runInContext(fs.readFileSync(`${root}/js/play/play-share-dialog.js`, 'utf8'), context);
const share = context.CaissaPlayShareDialog;

test('share surface exposes CAISSA-owned PGN, image, GIF and embed tabs', () => {
    assert.equal(share.schemaVersion, '1.0.0');
    assert.deepEqual(Array.from(share.tabs), ['pgn', 'image', 'gif', 'embed']);
    const source = fs.readFileSync(`${root}/js/play/play-share-dialog.js`, 'utf8');
    for (const label of ['PGN', 'Image', 'GIF', 'Embed']) assert.match(source, new RegExp(`'${label}'`));
    assert.match(source, /Download PGN/);
    assert.match(source, /Download image/);
});

test('embed code points to CAISSA Analyze with encoded FEN and embed mode', () => {
    const fen = '8/8/8/8/8/8/8/K6k w - - 0 1';
    const code = share.buildEmbedCode(fen, 'https://www.caissa-chess.org/path');
    assert.match(code, /https:\/\/www\.caissa-chess\.org\/analyze\?fen=/);
    assert.match(code, /embed=1/);
    assert.match(code, /title="CAISSA Chess position"/);
});

test('share PGN adds CAISSA headers and preserves existing headers', () => {
    const pgn = share.buildSharePgn({
        pgn: '1. a3 e5', mode: 'coach', playerColor: 'white', opponent: 'Caissa Coach',
        opening: 'King Pawn Game', date: '2026.09.03'
    });
    assert.match(pgn, /^\[Event "CAISSA Play Coach"\]/);
    assert.match(pgn, /\[White "Player"\]/);
    assert.match(pgn, /\[Black "Caissa Coach"\]/);
    assert.match(pgn, /\[Opening "King Pawn Game"\]/);
    assert.match(pgn, /1\. a3 e5 \*$/);
    assert.equal(share.buildSharePgn({ pgn: '[Event "Imported"]\n\n1. e4 *' }),
        '[Event "Imported"]\n\n1. e4 *');
});

test('FEN image parser preserves and flips piece coordinates', () => {
    const fen = '7k/8/8/8/8/8/8/K7 w - - 0 1';
    const white = share.parseFenPieces(fen, 'white');
    const black = share.parseFenPieces(fen, 'black');
    assert.deepEqual({ ...white.find(item => item.code === 'wK') }, { code: 'wK', column: 0, row: 7 });
    assert.deepEqual({ ...black.find(item => item.code === 'wK') }, { code: 'wK', column: 7, row: 0 });
});

test('Share button opens the internal dialog instead of the operating-system share sheet', () => {
    const shell = fs.readFileSync(`${root}/js/play/simplified-play-shell.js`, 'utf8');
    assert.match(shell, /CaissaPlayShareDialog/);
    assert.match(shell, /this\.#shareDialog\?\.open/);
    assert.doesNotMatch(shell, /navigator\?\.share|navigator\.share/);
    const html = fs.readFileSync(`${root}/play-v2-public-beta.html`, 'utf8');
    assert.match(html, /play-share-dialog\.js\?v=1\.0\.0/);
});

test('share layout has responsive dialog, tab, canvas and accessible touch-target styles', () => {
    const css = fs.readFileSync(`${root}/css/play-simplified-shell.css`, 'utf8');
    assert.match(css, /caissa-play-share::backdrop/);
    assert.match(css, /caissa-play-share__tabs/);
    assert.match(css, /grid-template-columns:\s*repeat\(4/);
    assert.match(css, /caissa-play-share__canvas/);
    assert.match(css, /@media \(max-width: 520px\)/);
});
