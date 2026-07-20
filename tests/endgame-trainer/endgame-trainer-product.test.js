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
    ['40 responsive board sizing', css, /\.endgame-trainer-page \.board-b72b1\s*\{\s*box-sizing:\s*content-box/],
    ['41 empty overlay', html, /data-empty-board-overlay[\s\S]*Prepare an endgame position/],
    ['42 empty overlay state contract', css, /not\(\.is-empty\):not\(\.is-preparing\)[\s\S]*empty-overlay/],
    ['43 free during beta', html, />Free during beta</],
    ['44 setup helper', html, />Choose your training settings\.</],
    ['45 disabled start remains present', html, /data-action="start" disabled>Start</],
    ['46 start helper hook', html, /data-start-helper>Prepare a position first\.</],
    ['47 start helper state mapping', page, /The position is ready to start\.[\s\S]*Session in progress\./],
    ['48 session empty guidance', html, /data-session-empty[\s\S]*How it works[\s\S]*Start training against Stockfish/],
    ['49 session details alternate view', html, /data-session-details/],
    ['50 session details hidden while empty', css, /session-details\s*\{\s*display:\s*none/],
    ['51 move history empty copy', html, /No moves yet\.<\/strong><span>Moves will appear here once the session starts\./],
    ['52 no fake numbered empty move', html, /<ol[^>]*data-history><li><strong>No moves yet\./],
    ['53 primary action group', html, /data-action-group="primary"[\s\S]*data-action="hint"[\s\S]*data-action="restart"[\s\S]*data-action="new"/],
    ['54 secondary action group', html, /data-action-group="secondary"[\s\S]*data-action="undo"[\s\S]*data-action="flip"[\s\S]*data-action="resign"/],
    ['55 resign danger only enabled', css, /endgame-trainer-page__resign:not\(:disabled\)/],
    ['56 visual state classes', page, /\['empty', 'preparing', 'ready', 'user-turn', 'engine-thinking', 'completed', 'resigned', 'error', 'disposed'\]/],
    ['57 status copy mapping', page, /Ready to train[\s\S]*Position ready[\s\S]*Your turn[\s\S]*Stockfish is thinking[\s\S]*Endgame completed/],
    ['58 heuristic score label', html, />Heuristic score</],
    ['59 mobile DOM begins with board', html, /endgame-trainer-page__grid">\s*<section class="endgame-trainer-page__board-panel"/],
    ['60 overlay is noninteractive', css, /endgame-trainer-page__empty-overlay[\s\S]*pointer-events:\s*none/]
];

for (const [name, source, pattern] of cases) {
    test(name, name.startsWith('36 ') || name.startsWith('39 ') ? lacks(source, pattern) : has(source, pattern));
}

test('61 no duplicate IDs', () => {
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length);
});
test('62 security and presentation remain dependency free', () => {
    assert.doesNotMatch(page, /innerHTML|\beval\s*\(|new\s+Function|document\.write|localStorage|sessionStorage|\bfetch\s*\(/);
    assert.doesNotMatch(html, /\sonclick\s*=/);
});
test('63 runtime hooks preserved', () => {
    for (const hook of ['data-board', 'data-board-overlay', 'data-promotion', 'data-announcement', 'data-field="status"', 'data-history']) assert.match(html, new RegExp(hook));
});
test('64 terminal results use human-readable presentation labels', () => {
    assert.match(page, /checkmate: 'Checkmate'[\s\S]*resignation: 'Resignation'[\s\S]*stalemate: 'Stalemate'[\s\S]*draw: 'Draw'[\s\S]*abandoned: 'Abandoned'/);
    assert.match(page, /text\(field\('result'\), resultLabel\(state\.result\?\.gameResult\)\)/);
});
test('65 promotion restores focus to the keyboard-accessible board', () => {
    assert.match(html, /data-board tabindex="0" aria-label="Endgame training board"/);
    assert.match(page, /returnFocus = root\.querySelector\('\[data-board\]'\)/);
    assert.match(page, /dialog\.close\(\); returnFocus\?\.focus\?\.\(\)/);
});
const progressCases = [
    ['66 progress store imported', page, /createEndgameProgressStore/],
    ['67 store factory injectable', page, /options\.progressStoreFactory/],
    ['68 authoritative snapshot reconciliation', page, /reconcileProgress\(root, page, state\)/],
    ['69 prepared ownership', page, /recordPreparedPosition/],
    ['70 started ownership', page, /recordSessionStarted/],
    ['71 completed ownership', page, /recordSessionCompleted/],
    ['72 resigned ownership', page, /recordSessionResigned/],
    ['73 abandoned ownership', page, /recordSessionAbandoned/],
    ['74 pagehide abandonment', page, /addEventListener\?\.\('pagehide', abandon/],
    ['75 store disposed', page, /progressStore\.dispose\(\)/],
    ['76 session summary', html, /data-session-summary[\s\S]*Session Summary/],
    ['77 training progress', html, /data-training-progress[\s\S]*Training Progress/],
    ['78 six metrics', html, /data-progress-metrics/],
    ['79 category breakdown', html, /By Endgame[\s\S]*data-category-breakdown/],
    ['80 recent sessions', html, /Recent Sessions[\s\S]*data-recent-sessions/],
    ['81 privacy copy', html, /Progress is stored only in this browser and is not synced to an account\./],
    ['82 reset dialog', html, /data-reset-dialog[\s\S]*Reset local progress/],
    ['83 reset uses dialog not confirm', page, /resetDialog\.showModal\(\)/],
    ['84 reset focus restored', page, /resetReturnFocus\?\.focus/],
    ['85 persistence warning', html, /data-persistence-warning role="status"/],
    ['86 mobile order follows trainer', html, /endgame-trainer-page__grid[\s\S]*data-session-summary[\s\S]*data-training-progress/],
    ['87 progress full width', css, /endgame-trainer-page__summary, \.endgame-trainer-page__progress[\s\S]*max-width: 1140px/],
    ['88 compact mobile categories', css, /max-width: 390px[\s\S]*category-list li[\s\S]*grid-template-columns: 1fr/],
    ['89 no progress polling', page, /setInterval|MutationObserver/],
    ['90 no confirm API', page, /window\.confirm|globalThis\.confirm/]
];
for (const [name, source, pattern] of progressCases) test(name, name.startsWith('89 ') || name.startsWith('90 ') ? lacks(source, pattern) : has(source, pattern));

const syncCases = [
    ['91 scoped storage listener', page, /addEventListener\?\.\('storage'/],
    ['92 exact storage key import', page, /ENDGAME_PROGRESS_STORAGE_KEY/],
    ['93 store refresh on external event', page, /refreshFromStorage\(\)/],
    ['94 update feedback', page, /Training progress updated from another tab\./],
    ['95 reset feedback', page, /Training progress was reset in another tab\./],
    ['96 result filter markup', html, /data-recent-result[\s\S]*Checkmate[\s\S]*Resignation[\s\S]*Abandoned/],
    ['97 category filter markup', html, /data-recent-category[\s\S]*Queen vs King[\s\S]*Pawn vs Pawn/],
    ['98 show more button', html, /data-recent-toggle[\s\S]*aria-expanded="false"[\s\S]*aria-controls="recent-sessions-list"/],
    ['99 no-match copy', page, /No sessions match these filters\./],
    ['100 draw includes stalemate', page, /\['draw', 'stalemate'\]\.includes/],
    ['101 view progress action', html, /data-view-progress>View training progress/],
    ['102 progress heading focus target', html, /id="progress-title" tabindex="-1"/],
    ['103 reduced motion navigation', page, /prefers-reduced-motion: reduce/],
    ['104 scroll without URL mutation', page, /scrollIntoView/],
    ['105 sync polite live region', html, /data-sync-feedback role="status" aria-live="polite"/],
    ['106 filter labels', html, /<label>Result<select[\s\S]*<label>Category<select/],
    ['107 mobile select height', css, /recent-filters select[\s\S]*min-height: 44px/],
    ['108 mobile show more height', css, /recent-toggle[\s\S]*min-height: 44px/],
    ['109 no cross-tab polling', page, /setInterval|MutationObserver|BroadcastChannel/],
    ['110 no remote synchronization', page, /postMessage|sendBeacon|XMLHttpRequest/]
];
for (const [name, source, pattern] of syncCases) test(name, name.startsWith('109 ') || name.startsWith('110 ') ? lacks(source, pattern) : has(source, pattern));
