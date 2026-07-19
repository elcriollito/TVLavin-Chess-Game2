import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../../endgame-trainer.html', import.meta.url), 'utf8');
const page = await readFile(new URL('../../js/endgame-trainer/endgame-trainer-page.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../../css/endgame-trainer.css', import.meta.url), 'utf8');
const has = (source, pattern) => () => assert.match(source, pattern);
const lacks = (source, pattern) => () => assert.doesNotMatch(source, pattern);

const cases = [
    ['1 runtime factory imported', page, /import \{ createEndgameTrainerRuntime \}/],
    ['2 runtime initialized', page, /runtimeFactory\([\s\S]*?\)\.initialize\(\)/],
    ['3 runtime disposed on unmount', page, /runtime\?\.dispose\(\)/],
    ['4 board element wired', page, /boardElement: board/],
    ['5 promotion resolver wired', page, /promotionResolver: promo\.resolve/],
    ['6 state callback wired', page, /onStateChange:/],
    ['7 announcement callback wired', page, /onAnnouncement:/],
    ['8 public error callback wired', page, /onError:/],
    ['9 real board container', html, /data-board[^>]*aria-label="Endgame training board"/],
    ['10 board announcement live region', html, /data-announcement[^>]*aria-live="polite"/],
    ['11 engine overlay', html, /data-board-overlay/],
    ['12 jQuery dependency precedes module', html, /jquery[\s\S]*chessboard[\s\S]*type="module"/],
    ['13 chessboard stylesheet', html, /chessboard-1\.0\.0\.min\.css/],
    ['14 chess.js import map', html, /"chess\.js"\s*:\s*"https:\/\/cdn\.jsdelivr\.net\/npm\/chess\.js@1\.4\.0\/\+esm"/],
    ['15 prepare action', html, /data-action="prepare"/],
    ['16 start action', html, /data-action="start"/],
    ['17 hint action', html, /data-action="hint"/],
    ['18 undo action', html, /data-action="undo"/],
    ['19 restart action', html, /data-action="restart"/],
    ['20 new-position action', html, /data-action="new"/],
    ['21 resign action', html, /data-action="resign"/],
    ['22 flip action', html, /data-action="flip"/],
    ['23 three-piece setup', html, /option value="3">3<\/option>/],
    ['24 four-piece setup', html, /option value="4">4<\/option>/],
    ['25 unsupported five disabled', html, /<option disabled>5 [^<]*Coming Soon<\/option>/],
    ['26 unsupported six disabled', html, /<option disabled>6 [^<]*Coming Soon<\/option>/],
    ['27 KPK category', html, /option value="KPK"/],
    ['28 KRK category', html, /option value="KRK"/],
    ['29 KQK category', html, /option value="KQK"/],
    ['30 KPKP category', html, /option value="KPKP"/],
    ['31 random color retained for seeded controller', page, /userColor: root\.querySelector\('\[data-setup="color"\]\'\)\?\.value/],
    ['32 strength mapping has four levels', page, /beginner:[\s\S]*intermediate:[\s\S]*advanced:[\s\S]*strong:/],
    ['33 piece count constrains categories', page, /pieces === '3'[\s\S]*pieces === '4'/],
    ['34 random selection is seed-derived', page, /character\.charCodeAt\(0\)/],
    ['35 move history uses textContent', page, /li\.textContent = `\$\{entry\.actor\}/],
    ['36 no innerHTML injection', page, /innerHTML/],
    ['37 dialog listeners abort on unmount', page, /data-promotion-piece[\s\S]*\{ signal \}/],
    ['38 diagnostic mode is explicitly gated', page, /params\.get\('diagnostic'\) === '1'/],
    ['39 no storage coupling', page, /localStorage|sessionStorage/],
    ['40 responsive board sizing', css, /\.endgame-trainer-page \.board-b72b1\{box-sizing:content-box\}/]
];

for (const [name, source, pattern] of cases) {
    test(name, name.startsWith('36 ') || name.startsWith('39 ') ? lacks(source, pattern) : has(source, pattern));
}
