import { MEMORY_POSITIONS } from '../js/mentor/mentor-memory.js';
import { mountMemoryTraining } from '../js/mentor/mentor-memory-view.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { moveRows, createStudyAnalysis, evaluationLabel } from '../js/mentor/mentor-moves.js';
import { Chess } from '../assets/vendor/chess.js/chess-1.4.0.esm.js';
import { prepareLesson } from '../js/mentor/mentor-lessons.js';
import { createMentorInsights } from '../js/mentor/mentor-insights.js';
import { parseEcoCatalog, prepareEcoLesson } from '../js/mentor/mentor-openings.js';
import { parseMentorPgn, moveLabel, gameReviewPrompt, PGN_LIMITS } from '../js/mentor/mentor-pgn.js';

const catalog = parseEcoCatalog(JSON.parse(fs.readFileSync(new URL('../data/eco/eco_codes.json', import.meta.url), 'utf8')));

function harness({ memoryCatalog } = {}) {
    const html = fs.readFileSync(new URL('../mentor.html', import.meta.url), 'utf8');
    const nodes = new Map();
    function element(id = '') {
        const handlers = new Map(), attrs = {};
        return { id, attrs, handlers, children: [], style: { setProperty() {} }, dataset: {}, hidden: false, value: '', disabled: false, textContent: '',
            setAttribute(key, value) { attrs[key] = value; }, getAttribute(key) { return attrs[key]; },
            addEventListener(key, fn) { handlers.set(key, fn); }, fire(key, detail = {}) { return handlers.get(key)?.({ preventDefault() {}, ...detail }); },
            append(...items) { for(const item of items){ if(item && typeof item==='object'){const old=item.parentElement;if(old)old.children=old.children.filter(child=>child!==item);item.parentElement=this;}this.children.push(item); } }, replaceChildren() { this.children.length = 0; }, focus() {}, click() { return this.fire('click'); }, showModal() {}, close() {} };
    }
    for (const match of html.matchAll(/id="([^"]+)"/g)) nodes.set(match[1], element(match[1]));
    const tabs = [...html.matchAll(/<button id="(tab-[^"]+)"[^>]*aria-controls="([^"]+)"/g)].map(match => {
        const node = nodes.get(match[1]); node.attrs['aria-controls'] = match[2]; return node;
    });
    const input = element(), send = element(), authLink = element();
    const windowHandlers = new Map(), messages = [];
    let networkCalls = 0;
    const shell = { setContext() {}, clearContext() {}, open() {}, close() { messages.length = 0; },
        appendStudyMessage(message) { messages.push(message); return true; },
        appendStudyExchange(question, answer) { messages.push(question, answer); return true; }, clearStudyMessages() { messages.length = 0; } };
    const window = { CAISSA_AUTH: { isLoaded: true, isSignedIn: true, userId: 'owner-one' },
        CaissaMentorFloatingShell: shell, addEventListener(key, fn) { windowHandlers.set(key, fn); },
        fetch() { networkCalls++; } };
    const document = { getElementById: id => nodes.get(id), createElement: () => element(),
        querySelectorAll: query => query === '[role=tab][id^="tab-"]' ? tabs : [],
        querySelector: query => query === '.sign-in' ? authLink : query.endsWith('textarea') ? input : send };
    const boardHandlers = new Map();
    let boardFen = null, draw=0;
    const board = { setPosition(fen) { boardFen = fen; }, clearSelection() {}, setInteractive() {}, on(type,fn) { boardHandlers.set(type,fn); }, getMetrics() { return {}; } };
    const source = fs.readFileSync(new URL('../js/mentor/mentor-page.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
    vm.runInNewContext(source, { mountMemoryTraining: opts => mountMemoryTraining({...opts,catalog:memoryCatalog||{next:async()=>({...MEMORY_POSITIONS[(draw++)%6],source:'test-catalog'}),clear(){draw=0;}}}), AbortController, queueMicrotask, moveRows, createStudyAnalysis, evaluationLabel, Chess, prepareLesson, createMentorInsights, prepareEcoLesson, parseMentorPgn, moveLabel, gameReviewPrompt, PGN_LIMITS, loadEcoCatalog: async () => catalog, create: () => board, document, window,
        localStorage: { getItem() { return null; }, setItem() {} } });
    return { nodes, tabs, input, send, messages, window, boardPosition:()=>boardFen, squareTap: square=>boardHandlers.get('squareTap')?.(square), emit: (key, detail) => windowHandlers.get(key)({ detail }), networkCalls: () => networkCalls };
}
const summary = { ownerId: 'owner-one', status: 'completed', verified: true, source: 'chesscom', username: 'Alex', analysisId: 'analysis-10', completedGames: 10, themes: [{ theme: 'tactics', sampleGames: 4 }] };

test('hidden Chat panel wins over its flex layout when another tab is active', () => {
    const css = fs.readFileSync(new URL('../css/mentor-page.css', import.meta.url), 'utf8');
    assert.match(css, /#panel-chat\[hidden\][^{]*\{display:none\}/);
});

test('five tabs preserve chat drafts and show an unread idea once on entering Chat without network', () => {
    const h = harness();
    assert.deepEqual(h.tabs.map(tab => tab.id), ['tab-chat', 'tab-moves', 'tab-learn', 'tab-openings', 'tab-account']);
    h.input.value = 'My draft'; h.nodes.get('tab-learn').fire('click');
    h.emit('caissa:account-analysis-completed', summary);
    assert.equal(h.nodes.get('chat-idea-indicator').hidden, false);
    assert.equal(h.messages.length, 0);
    h.nodes.get('tab-chat').fire('click');
    assert.equal(h.nodes.get('chat-idea-indicator').hidden, true);
    assert.match(h.messages[0], /10 Chess.com games/);
    assert.equal(h.input.value, 'My draft');
    h.nodes.get('tab-account').fire('click'); h.nodes.get('tab-chat').fire('click');
    h.emit('caissa:account-analysis-completed', summary);
    assert.equal(h.messages.length, 1);
    h.nodes.get('idea-plan').fire('click'); assert.equal(h.input.value, 'My draft');
    h.input.value = ''; h.nodes.get('idea-plan').fire('click'); assert.match(h.input.value, /training plan/);
    assert.equal(h.networkCalls(), 0);
});

test('account input creates no idea; completed evidence in active Chat appears and clears on owner change', () => {
    const h = harness(); h.nodes.get('account-username').value = 'Alex'; h.nodes.get('account-form').fire('submit');
    assert.equal(h.messages.length, 0); assert.equal(h.window.CaissaMentorPage.inspect().unreadIdea, false);
    h.emit('caissa:account-analysis-completed', summary); assert.equal(h.messages.length, 1);
    h.emit('caissa-auth-change', { isLoaded: true, isSignedIn: true, userId: 'owner-two' });
    assert.equal(h.messages.length, 0); assert.equal(h.nodes.get('idea-plan').hidden, true);
    h.emit('caissa:account-analysis-completed', summary); assert.equal(h.messages.length, 0);
});


test('starter idea responds locally, loads a legal board example, preserves draft and keeps footer exclusive to Chat', () => {
    const h = harness(); h.input.value = 'My own question';
    const choices = h.nodes.get('suggestion-actions').children;
    assert.equal(choices.length, 3);
    choices[1].fire('click');
    assert.equal(h.window.CaissaMentorPage.inspect().lesson, 'fork');
    assert.equal(h.window.CaissaMentorPage.inspect().fen, prepareLesson('fork').positions[0]);
    assert.match(h.messages[1], /Nc7\+/); assert.equal(h.input.value, 'My own question');
    assert.equal(h.nodes.get('chat-suggestions').hidden, true);
    h.nodes.get('tab-learn').fire('click'); assert.equal(h.nodes.get('chat-footer').hidden, true);
    h.nodes.get('tab-chat').fire('click'); assert.equal(h.nodes.get('chat-footer').hidden, false);
    h.nodes.get('new-session').fire('click'); assert.equal(h.nodes.get('chat-suggestions').hidden, false);
    assert.equal(h.nodes.get('suggestion-actions').children.length, 3); assert.equal(h.networkCalls(), 0);
});

test('real evidence selects related examples, preserves owner isolation and guards board during a reply', () => {
    const h = harness(); h.emit('caissa:account-analysis-completed', summary);
    const choices = h.nodes.get('suggestion-actions').children;
    assert.equal(choices.length, 1); assert.match(choices[0].textContent, /knight fork/);
    h.send.disabled = true; choices[0].fire('click');
    assert.equal(h.window.CaissaMentorPage.inspect().lesson, 'development');
    h.send.disabled = false; choices[0].fire('click'); assert.equal(h.window.CaissaMentorPage.inspect().lesson, 'fork');
    h.emit('caissa-auth-change', { isLoaded: true, isSignedIn: true, userId: 'owner-two' });
    assert.equal(h.nodes.get('suggestion-actions').children.length, 3);
    assert.equal(h.nodes.get('suggestions-title').textContent, 'Where shall we start?');
});


test('My account source selector preserves raw inputs and produces no insight or network request', () => {
    const h = harness(); h.nodes.get('account-username').value = 'Alex';
    h.nodes.get('account-source-pgn').fire('click');
    assert.equal(h.nodes.get('account-online').hidden, true); assert.equal(h.nodes.get('account-local').hidden, false);
    assert.equal(h.nodes.get('account-source-pgn').getAttribute('aria-pressed'), 'true');
    h.nodes.get('account-pgn-text').value = '[Result "1-0"]';
    h.nodes.get('account-source-online').fire('click');
    assert.equal(h.nodes.get('account-username').value, 'Alex');
    assert.equal(h.nodes.get('account-pgn-text').value, '[Result "1-0"]');
    h.nodes.get('account-form').fire('submit');
    assert.equal(h.messages.length, 0); assert.equal(h.networkCalls(), 0);
    assert.match(h.nodes.get('account-status').textContent, /Online import is not connected/);
});

test('ECO selection loads its final legal position and opens Chat with a local exchange and preserved draft', async () => {
    const h = harness(); h.input.value = 'My draft'; h.nodes.get('opening-search').value = 'C60';
    h.nodes.get('tab-openings').fire('click'); await new Promise(resolve => setImmediate(resolve));
    const card = h.nodes.get('opening-list').children.find(node => node.className === 'opening-card');
    assert.ok(card); card.fire('click');
    const state = h.window.CaissaMentorPage.inspect();
    assert.equal(state.tab, 'chat'); assert.equal(state.lesson, 'eco-C60'); assert.equal(state.cursor, 5);
    const game = new Chess(); game.loadPgn('1. e4 e5 2. Nf3 Nc6 3. Bb5'); assert.equal(state.fen, game.fen());
    assert.match(h.messages[1], /Ruy Lopez/); assert.equal(h.input.value, 'My draft');
    assert.equal(h.nodes.get('opening-followups').hidden, false); assert.equal(h.nodes.get('chat-footer').hidden, false);
    h.nodes.get('opening-discuss').fire('click'); assert.equal(h.input.value, 'My draft');
    h.input.value = ''; h.nodes.get('opening-discuss').fire('click'); assert.match(h.input.value, /Ruy Lopez/);
    h.nodes.get('opening-practice').fire('click'); assert.equal(h.window.CaissaMentorPage.inspect().practicing, true);
    assert.equal(h.networkCalls(), 0);
});


test('FEN intake belongs to My account and loads the shared board with inline feedback', () => {
    const html = fs.readFileSync(new URL('../mentor.html', import.meta.url), 'utf8');
    const accountStart = html.indexOf('id="panel-account"');
    const formStart = html.indexOf('id="fen-form"');
    assert.ok(formStart > accountStart && formStart < html.indexOf('id="chat-footer"'));
    assert.equal(html.split('id="fen-form"').length - 1, 1);
    const h = harness(), fen = '8/4k3/8/4K3/4P3/8/8/8 w - - 0 1';
    h.nodes.get('tab-account').fire('click'); h.nodes.get('study-fen').value = fen;
    h.nodes.get('fen-form').fire('submit');
    assert.equal(h.window.CaissaMentorPage.inspect().fen, new Chess(fen).fen());
    assert.equal(h.window.CaissaMentorPage.inspect().tab, 'account');
    assert.match(h.nodes.get('fen-status').textContent, /Position loaded/);
    h.nodes.get('study-fen').value = 'bad fen'; h.nodes.get('fen-form').fire('submit');
    assert.match(h.nodes.get('fen-status').textContent, /Invalid FEN/);
    assert.equal(h.window.CaissaMentorPage.inspect().fen, new Chess(fen).fen());
    assert.equal(h.networkCalls(), 0);
});

const completedPgn = '[Event "My game"]\n[White "Alex"]\n[Black "Opponent"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0';
test('local PGN loads Moves, navigates the shared board and prepares an explicit game review in Chat', async () => {
    const h = harness(); h.nodes.get('account-source-pgn').fire('click');
    assert.equal(h.nodes.get('account-import-submit').disabled, false);
    h.nodes.get('account-pgn-text').value = completedPgn;
    await h.nodes.get('account-form').fire('submit');
    assert.equal(h.window.CaissaMentorPage.inspect().tab, 'moves');
    assert.equal(h.window.CaissaMentorPage.inspect().importedGames, 1);
    assert.equal(h.nodes.get('learn-game-moves').children.length, 2);
    h.nodes.get('game-next').fire('click'); assert.equal(h.window.CaissaMentorPage.inspect().cursor, 1);
    h.nodes.get('game-last').fire('click'); assert.equal(h.window.CaissaMentorPage.inspect().cursor, 4);
    h.nodes.get('game-previous').fire('click'); assert.equal(h.window.CaissaMentorPage.inspect().cursor, 3);
    const fen = h.window.CaissaMentorPage.inspect().fen;
    h.nodes.get('game-review').fire('click');
    assert.equal(h.window.CaissaMentorPage.inspect().tab, 'chat');
    assert.ok(h.input.value.includes(fen)); assert.match(h.input.value, /Alex vs Opponent/);
    assert.equal(h.networkCalls(), 0);
});

test('multiple PGN games can be selected; invalid re-import preserves the current game and draft', async () => {
    const h = harness(); h.nodes.get('account-source-pgn').fire('click');
    h.nodes.get('account-pgn-text').value = completedPgn + '\n\n' + completedPgn.replace('Alex', 'Second');
    await h.nodes.get('account-form').fire('submit');
    h.nodes.get('learn-game-select').value = '1'; h.nodes.get('learn-game-select').fire('change');
    assert.equal(h.window.CaissaMentorPage.inspect().lesson, 'pgn-1');
    h.input.value = 'My draft'; h.nodes.get('game-review').fire('click'); assert.equal(h.input.value, 'My draft');
    h.nodes.get('account-pgn-text').value = 'invalid'; await h.nodes.get('account-form').fire('submit');
    assert.equal(h.window.CaissaMentorPage.inspect().lesson, 'pgn-1');
    assert.equal(h.window.CaissaMentorPage.inspect().importedGames, 2);
});

test('PGN file import rejects ambiguous inputs, oversized files and stale asynchronous board replacements', async () => {
    const h = harness(); h.nodes.get('account-source-pgn').fire('click');
    const fileInput = h.nodes.get('account-pgn-file');
    fileInput.files = [{ size: 1000001, text: async () => completedPgn }];
    await h.nodes.get('account-form').fire('submit'); assert.match(h.nodes.get('account-status').textContent, /too large/);
    fileInput.files = [{ size: 100, text: async () => completedPgn }];
    h.nodes.get('account-pgn-text').value = completedPgn;
    await h.nodes.get('account-form').fire('submit'); assert.match(h.nodes.get('account-status').textContent, /not both/);
    h.nodes.get('account-pgn-text').value = '';
    let finish; fileInput.files = [{ size: 100, text: () => new Promise(resolve => { finish = resolve; }) }];
    const pending = h.nodes.get('account-form').fire('submit');
    h.nodes.get('game-next').fire('click'); finish(completedPgn); await pending;
    assert.equal(h.window.CaissaMentorPage.inspect().lesson, 'development');
    assert.match(h.nodes.get('account-status').textContent, /position changed/);
    fileInput.files = [{ size: 100, text: async () => completedPgn }];
    await h.nodes.get('account-form').fire('submit');
    assert.equal(h.window.CaissaMentorPage.inspect().importedGames, 1);
});

test('Moves, Learn and shared footer navigate one line without losing Chat drafts', () => {
    const h = harness(); h.input.value = 'Keep this draft';
    h.nodes.get('tab-moves').fire('click');
    assert.equal(h.nodes.get('learn-footer').hidden, true);
    const row = h.nodes.get('learn-game-moves').children[0]; row.children[2].fire('click');
    assert.equal(h.window.CaissaMentorPage.inspect().cursor, 2);
    h.nodes.get('tab-learn').fire('click'); h.nodes.get('training-lesson-tab').fire('click'); assert.equal(h.nodes.get('learn-footer').hidden, false);
    h.nodes.get('repeat').fire('click'); assert.equal(h.window.CaissaMentorPage.inspect().cursor, 0);
    h.nodes.get('game-last').fire('click'); assert.equal(h.nodes.get('game-next').disabled, true);
    h.nodes.get('tab-account').fire('click'); assert.equal(h.nodes.get('learn-footer').hidden, true);
    assert.equal(h.input.value, 'Keep this draft'); assert.equal(h.networkCalls(), 0);
});

test('engine is lazy and exposes an honest error when runtime is unavailable', async () => {
    const h = harness(); assert.equal(h.networkCalls(), 0);
    assert.equal(h.nodes.get('evaluation-chart').textContent, 'Evaluation timeline · Not analysed');
    await h.nodes.get('study-engine').fire('click');
    assert.equal(h.window.CaissaMentorPage.inspect().tab, 'moves');
    assert.match(h.nodes.get('engine-status').textContent, /Stockfish 19 is unavailable/);
    assert.equal(h.nodes.get('study-engine').textContent, 'Engine');
});

test('Memory hides and rebuilds on the shared board while study PGN cursor and Mentor draft remain intact', async () => {
    const h=harness();h.nodes.get('account-source-pgn').fire('click');h.nodes.get('account-pgn-text').value=completedPgn;
    await h.nodes.get('account-form').fire('submit');h.nodes.get('game-next').fire('click');
    const before=h.window.CaissaMentorPage.inspect();h.input.value='My preserved Mentor draft';h.nodes.get('tab-learn').fire('click');
    h.nodes.get('memory-exercise').value='beginner';h.nodes.get('memory-mode').value='challenge';await h.nodes.get('memory-start').fire('click');
    assert.equal(h.window.CaissaMentorPage.inspect().memory.phase,'observe');assert.equal(h.nodes.get('study-engine').disabled,true);
    h.nodes.get('memory-hide').fire('click');assert.equal(h.boardPosition(),'8/8/8/8/8/8/8/8');h.squareTap('e5');
    assert.equal(h.window.CaissaMentorPage.inspect().memory.draft.e5,'wK');assert.equal(h.window.CaissaMentorPage.inspect().fen,before.fen);
    h.nodes.get('tab-moves').fire('click');const after=h.window.CaissaMentorPage.inspect();
    assert.equal(h.boardPosition(),before.fen);assert.equal(after.fen,before.fen);assert.equal(after.cursor,before.cursor);
    assert.equal(after.importedGames,1);assert.equal(after.memory.phase,'idle');assert.equal(h.input.value,'My preserved Mentor draft');
    assert.equal(h.nodes.get('game-first').disabled,false);assert.equal(h.networkCalls(),0);
});
test('Memory checks textual errors once and cannot run the study engine or award a stale logout attempt',async()=>{
    const h=harness();h.nodes.get('tab-learn').fire('click');h.nodes.get('memory-exercise').value='beginner';h.nodes.get('memory-mode').value='challenge';
    await h.nodes.get('memory-start').fire('click');h.nodes.get('memory-hide').fire('click');
    await h.nodes.get('study-engine').fire('click');assert.doesNotMatch(h.nodes.get('engine-status').textContent,/unavailable/);
    h.emit('caissa-auth-change',{isLoaded:true,isSignedIn:false});h.nodes.get('memory-check').fire('click');
    assert.equal(h.window.CaissaMentorPage.inspect().memory.scoredAttempts,0);assert.equal(h.window.CaissaMentorPage.inspect().memory.phase,'idle');
    await h.nodes.get('memory-start').fire('click');h.nodes.get('memory-hide').fire('click');h.nodes.get('memory-check').fire('click');
    assert.match(h.nodes.get('memory-feedback').children[0].textContent,/✗.*expected/);
    h.nodes.get('memory-check').fire('click');assert.equal(h.window.CaissaMentorPage.inspect().memory.scoredAttempts,1);
});
test('Memory recommendation lights Mentor, is read once there, and its CTA loads unscored Training',async()=>{
    const h=harness();h.nodes.get('tab-learn').fire('click');h.nodes.get('memory-mode').value='challenge';
    for(const id of ['opposition-a','opposition-b','opposition-c']){
        h.nodes.get('memory-exercise').value='beginner';await h.nodes.get('memory-start').fire('click');h.nodes.get('memory-hide').fire('click');h.nodes.get('memory-check').fire('click');h.nodes.get('practice').fire('click');
    }
    assert.equal(h.nodes.get('chat-idea-indicator').hidden,false);assert.equal(h.nodes.get('chat-idea-indicator').textContent,'❗');
    assert.equal(h.messages.length,0);h.nodes.get('tab-chat').fire('click');assert.equal(h.messages.length,1);assert.match(h.messages[0],/3 comparable scored rounds/);
    assert.equal(h.nodes.get('chat-idea-indicator').hidden,true);h.nodes.get('tab-moves').fire('click');h.nodes.get('tab-chat').fire('click');assert.equal(h.messages.length,1);
    await h.nodes.get('memory-recommendation').fire('click');await new Promise(resolve=>setImmediate(resolve));assert.equal(h.window.CaissaMentorPage.inspect().tab,'learn');assert.equal(h.window.CaissaMentorPage.inspect().memory.mode,'practice');assert.equal(h.networkCalls(),0);
});
test('busy Mentor reply prevents New session from mutating an active Memory attempt',async()=>{
    const h=harness();h.nodes.get('tab-learn').fire('click');h.nodes.get('memory-exercise').value='beginner';h.nodes.get('memory-mode').value='practice';await h.nodes.get('memory-start').fire('click');
    const before=h.window.CaissaMentorPage.inspect().memory.attemptId;h.send.disabled=true;h.nodes.get('new-session').fire('click');
    assert.equal(h.window.CaissaMentorPage.inspect().memory.attemptId,before);
});

test('Training sub-tabs isolate Position, Opening and Choose a lesson; piece palette uses board icons with labels',()=>{
    const h=harness();assert.equal(h.nodes.get('memory-start').hidden,true);h.nodes.get('tab-learn').fire('click');assert.equal(h.nodes.get('memory-start').hidden,false);h.nodes.get('training-lesson-tab').fire('click');
    assert.equal(h.nodes.get('training-position-body').hidden,true);assert.equal(h.nodes.get('training-opening-body').hidden,true);assert.equal(h.nodes.get('training-lesson-body').hidden,false);
    assert.equal(h.nodes.get('memory-panel').hidden,true);assert.equal(h.nodes.get('memory-start').hidden,true);
    h.nodes.get('training-position-tab').fire('click');assert.equal(h.nodes.get('training-lesson-body').hidden,true);
    const icon=h.nodes.get('memory-palette').children[0];assert.equal(icon.attrs['aria-label'],'White King');assert.match(icon.children[0].src,/wK\.png$/);assert.equal(icon.children[0].alt,'White King');
    assert.equal(h.nodes.get('memory-exercise').children[0].textContent,'Beginner · 3–7 pieces');
    assert.ok(h.nodes.get('memory-exercise').children.every(option=>!option.textContent.includes('pawn')&&!option.textContent.includes('opposition')));
});
test('Retry follows failure with same position and no extra score; Next waits for a passed reconstruction',async()=>{
    const h=harness();h.nodes.get('tab-learn').fire('click');h.nodes.get('memory-mode').value='challenge';await h.nodes.get('memory-start').fire('click');h.nodes.get('memory-hide').fire('click');h.nodes.get('memory-check').fire('click');
    const failed=h.window.CaissaMentorPage.inspect().memory;assert.equal(h.nodes.get('memory-next').disabled,true);assert.equal(h.nodes.get('memory-retry').disabled,false);
    h.nodes.get('memory-retry').fire('click');assert.equal(h.window.CaissaMentorPage.inspect().memory.exercise.fen,failed.exercise.fen);assert.equal(h.window.CaissaMentorPage.inspect().memory.mode,'practice');h.nodes.get('memory-hide').fire('click');
    const target=new Chess(failed.exercise.fen);for(const piece of target.board().flat().filter(Boolean)){h.nodes.get('memory-palette').children.find(node=>node.dataset.memoryPiece===piece.color+piece.type.toUpperCase()).fire('click');h.squareTap(piece.square);}
    h.nodes.get('memory-check').fire('click');assert.equal(h.nodes.get('memory-next').disabled,false);assert.equal(h.nodes.get('memory-retry').disabled,true);const score=h.window.CaissaMentorPage.inspect().memory.score;
    await h.nodes.get('memory-next').fire('click');assert.notEqual(h.window.CaissaMentorPage.inspect().memory.exercise.fen,failed.exercise.fen);assert.equal(h.window.CaissaMentorPage.inspect().memory.score,score);
});
test('leaving Training cancels a pending catalog selection and never replaces the restored study board',async()=>{
    let resolve;const waiting=new Promise(r=>resolve=r);const h=harness({memoryCatalog:{next:()=>waiting,clear(){}}});
    h.nodes.get('tab-learn').fire('click');const before=h.window.CaissaMentorPage.inspect().fen;const promise=h.nodes.get('memory-start').fire('click');h.nodes.get('tab-moves').fire('click');resolve({...MEMORY_POSITIONS[0],source:'test-catalog'});await promise;
    assert.equal(h.window.CaissaMentorPage.inspect().memory.phase,'idle');assert.equal(h.window.CaissaMentorPage.inspect().fen,before);assert.equal(h.boardPosition(),before);
});

test('Opening Memory reconstructs the current legal opening snapshot without catalog fetch or changing cursor',async()=>{
    let catalogCalls=0;const h=harness({memoryCatalog:{next:async()=>{catalogCalls++;return null;},clear(){}}});
    h.nodes.get('opening-search').value='C60';h.nodes.get('tab-openings').fire('click');await new Promise(resolve=>setImmediate(resolve));
    h.nodes.get('opening-list').children.find(node=>node.className==='opening-card').fire('click');
    const before=h.window.CaissaMentorPage.inspect();h.nodes.get('tab-learn').fire('click');h.nodes.get('training-opening-tab').fire('click');
    await h.nodes.get('memory-start').fire('click');const state=h.window.CaissaMentorPage.inspect();
    assert.equal(state.memory.exercise.fen,before.fen);assert.equal(state.memory.exercise.source,'opening-study');assert.equal(catalogCalls,0);
    assert.equal(h.nodes.get('memory-exercise').value,'master');assert.equal(h.nodes.get('memory-exercise').disabled,true);
    h.nodes.get('memory-hide').fire('click');h.nodes.get('practice').fire('click');
    assert.equal(h.boardPosition(),before.fen);assert.equal(h.window.CaissaMentorPage.inspect().cursor,before.cursor);
});
